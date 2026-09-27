import "server-only";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/env";
import { enabledAdapters } from "@/lib/ai/mesh/registry";
import { effectiveState, healthKey, snapshot as meshSnapshot, storeStatus as meshStoreStatus } from "@/lib/ai/mesh/health";
import { isGeneralAdapter } from "@/lib/ai/mesh/request";
import type { HealthState as MeshHealthState, ProviderAdapter } from "@/lib/ai/mesh/types";
import type { ComponentStatus, HealthComponent, HealthSnapshot } from "./types";

/**
 * Ommaviy status sahifasi uchun sog'liq tekshiruvi.
 *
 * Qoidalar:
 *  - har tekshiruv ~5s timeout bilan, parallel, hech qachon throw qilmaydi;
 *  - natija instansiya xotirasida 60s keshlanadi (+ bir vaqtdagi so'rovlar bitta
 *    tekshiruvni kutadi) — sahifa orqali upstream'larni "bombardimon" qilib bo'lmaydi;
 *  - JSON'da hech qanday secret, ichki URL yoki upstream xato matni bo'lmaydi —
 *    faqat umumiy izohlar (note).
 *  - AI shlyuzi upstream'ga so'rov yubormaydi — Provider Mesh sog'liq suratidan o'qiladi
 *    (OmniRoute restart HECH QACHON chaqirilmaydi).
 */
const TIMEOUT_MS = 5_000;
const CACHE_TTL_MS = 60_000;
/** Shundan sekin javob — "degraded". */
const SLOW_MS = 3_000;

type Check = Omit<HealthComponent, "id" | "name">;

const TIMEOUT = Symbol("timeout");

/**
 * Promise'ni ms ichida tugamasa TIMEOUT qaytaradi. Asl promise fonda tugaydi;
 * race unga handler ulagani uchun keyingi rad etilishi "unhandled" bo'lmaydi.
 */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | typeof TIMEOUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    p,
    new Promise<typeof TIMEOUT>((resolve) => {
      timer = setTimeout(() => resolve(TIMEOUT), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

function bySpeed(latencyMs: number): ComponentStatus {
  return latencyMs > SLOW_MS ? "degraded" : "operational";
}

async function checkDatabase(): Promise<Check> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return { status: "degraded", latencyMs: null, note: "Not configured" };
  }
  const started = Date.now();
  try {
    const res = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/auth/v1/health`, {
      headers: { apikey: SUPABASE_ANON_KEY },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const latencyMs = Date.now() - started;
    await res.body?.cancel().catch(() => {});
    if (res.ok) {
      const status = bySpeed(latencyMs);
      return { status, latencyMs, note: status === "degraded" ? "Slow responses" : undefined };
    }
    if (res.status >= 500) return { status: "down", latencyMs, note: "Service unavailable" };
    return { status: "degraded", latencyMs, note: "Unexpected response" };
  } catch {
    return { status: "down", latencyMs: null, note: "Not responding" };
  }
}

/**
 * AI shlyuzi — Provider Mesh sog'liq surati (mesh/health.ts: Upstash'dagi umumiy circuit breaker,
 * barcha instansiyalarning haqiqiy trafigi). Upstream'ga so'rov YUBORILMAYDI (kvota/neuron sarflanmaydi):
 *  - umumiy chatga yaraydigan (rescue bo'lmagan) kamida bitta provayder ochiq → operational
 *    (bir qismi yopiq bo'lsa + "Some models may be unavailable");
 *  - faqat oxirgi chora (LLM7 va h.k.) qolgan → degraded "Using fallback provider";
 *  - hech biri ishlamaydi → down "Not responding"; hech biri sozlanmagan → down "Not configured";
 *  - sog'liq NOMA'LUM (Upstash sozlangan, lekin javob bermadi / surat taymauti; yoki Upstash yo'q va
 *    bu instansiyada hali trafik yo'q) → degraded "Check failed" — bo'sh xotira "ishlayapti" emas.
 * Latency — ochiq provayderlarning birinchi baytgacha EWMA'si (eng tezi). Provayder nomi JSON'ga chiqmaydi.
 */
async function checkAiGateway(): Promise<Check> {
  const adapters = enabledAdapters();
  const general = adapters.filter(isGeneralAdapter);
  const rescue = adapters.filter((a) => a.rescue);
  if (!general.length && !rescue.length) return { status: "down", latencyMs: null, note: "Not configured" };

  const snap = await withTimeout(meshSnapshot(adapters), TIMEOUT_MS).catch((): typeof TIMEOUT => TIMEOUT);
  if (snap === TIMEOUT) return { status: "degraded", latencyMs: null, note: "Check failed" };
  const health: ReadonlyMap<string, MeshHealthState> = snap;
  // Umumiy ombor holati: Upstash javob bermagan bo'lsa — surat faqat shu instansiya xotirasi (eskirgan/bo'sh).
  const store = meshStoreStatus();
  const hasData = [...health.values()].some((h) => !!h.updatedAt);
  if ((store.persistent && store.reachable === false) || (!store.persistent && !hasData)) {
    return { status: "degraded", latencyMs: null, note: "Check failed" };
  }
  const now = Date.now();
  const open = (key: string) => {
    const h = health.get(key);
    return !!h && effectiveState(h, now) === "open";
  };
  // Provayder ochiq: butun provayder kaliti yopiq emas VA kamida bitta modeli yopiq emas.
  const up = (a: ProviderAdapter) => {
    if (open(healthKey(a.id))) return false;
    try {
      return a.offers.length === 0 || a.offers.some((o) => !open(healthKey(a.id, o.wire)));
    } catch {
      return true;
    }
  };

  const healthy = general.filter(up);
  if (!healthy.length) {
    return rescue.some(up)
      ? { status: "degraded", latencyMs: null, note: "Using fallback provider" }
      : { status: "down", latencyMs: null, note: "Not responding" };
  }
  // Faqat haqiqiy trafik bo'lgan (updatedAt) provayderlarning latency'si — standart 2000 ms emas.
  const measured = healthy
    .map((a) => health.get(healthKey(a.id)))
    .filter((h): h is MeshHealthState => !!h?.updatedAt && Number.isFinite(h.latencyEwmaMs))
    .map((h) => Math.round(h.latencyEwmaMs));
  const latency = measured.length ? Math.min(...measured) : null;
  if (latency !== null && bySpeed(latency) === "degraded") return { status: "degraded", latencyMs: latency, note: "Slow responses" };
  if (healthy.length < general.length) return { status: "operational", latencyMs: latency, note: "Some models may be unavailable" };
  return { status: "operational", latencyMs: latency };
}

async function checkImages(): Promise<Check> {
  // Faqat HEAD — rasm YARATILMAYDI. Pollinations ishlamasa ham zaxira provayderlar bor.
  const started = Date.now();
  try {
    const res = await fetch("https://image.pollinations.ai/", {
      method: "HEAD",
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const latencyMs = Date.now() - started;
    if (res.status >= 500) return { status: "degraded", latencyMs, note: "Using fallback provider" };
    const status = bySpeed(latencyMs);
    return { status, latencyMs, note: status === "degraded" ? "Slow responses" : undefined };
  } catch {
    return { status: "degraded", latencyMs: null, note: "Using fallback provider" };
  }
}

function checkPayments(): Check {
  // Faqat konfiguratsiya mavjudligi — to'lov API'lari chaqirilmaydi.
  const dodo = Boolean(process.env.DODO_PAYMENTS_API_KEY);
  const rolly = Boolean(process.env.ROLLYPAY_API_KEY && process.env.ROLLYPAY_SIGNING_SECRET);
  if (dodo && rolly) return { status: "operational", latencyMs: null };
  if (dodo || rolly) return { status: "operational", latencyMs: null, note: "Some payment methods not configured" };
  return { status: "degraded", latencyMs: null, note: "Not configured" };
}

/** Kutilmagan xato bo'lsa ham komponent "down" bo'lib qaytadi — hech qachon throw qilmaydi. */
async function safe(id: string, name: string, run: () => Promise<Check> | Check): Promise<HealthComponent> {
  try {
    const r = await run();
    const c: HealthComponent = { id, name, status: r.status, latencyMs: r.latencyMs };
    if (r.note) c.note = r.note;
    return c;
  } catch {
    return { id, name, status: "down", latencyMs: null, note: "Check failed" };
  }
}

async function runChecks(): Promise<HealthSnapshot> {
  const components = await Promise.all([
    safe("web", "Web app", () => ({ status: "operational", latencyMs: null })),
    safe("database", "Database & auth", checkDatabase),
    safe("ai", "AI gateway", checkAiGateway),
    safe("images", "Image generation", checkImages),
    safe("payments", "Payments", checkPayments),
  ]);
  return {
    ok: components.every((c) => c.status !== "down"),
    checkedAt: new Date().toISOString(),
    components,
  };
}

let cached: { at: number; data: HealthSnapshot } | null = null;
let inflight: Promise<HealthSnapshot> | null = null;

/** 60s keshlangan snapshot. Parallel chaqiruvlar bitta tekshiruvni bo'lishadi. */
export async function getHealthSnapshot(): Promise<HealthSnapshot> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.data;
  if (!inflight) {
    inflight = runChecks()
      .then((data) => {
        cached = { at: Date.now(), data };
        return data;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export const HEALTH_CACHE_SECONDS = CACHE_TTL_MS / 1000;
