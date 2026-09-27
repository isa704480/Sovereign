import "server-only";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/env";
import { probeOmniRoute } from "@/lib/omniroute-watchdog";
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
 *  - OmniRoute faqat probe qilinadi: restart HECH QACHON chaqirilmaydi.
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

/** Bitta chat provayderining holati: null — sozlanmagan (hisobga olinmaydi). */
type ProviderProbe = { ok: boolean; latencyMs: number | null } | null;

/** TIMEOUT_MS bilan so'rov; tarmoq xatosi/taymautda res = null (hech qachon throw qilmaydi). */
async function timedFetch(url: string, init: RequestInit): Promise<{ res: Response | null; latencyMs: number }> {
  const started = Date.now();
  try {
    const res = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
    return { res, latencyMs: Date.now() - started };
  } catch {
    return { res: null, latencyMs: Date.now() - started };
  }
}

/** OmniRoute: kichik haqiqiy so'rov (probeOmniRoute). 4xx — provayderlar cheklangan. */
async function probeOmni(): Promise<ProviderProbe> {
  if (!process.env.OMNIROUTE_BASE_URL) return null;
  const started = Date.now();
  const result = await withTimeout(probeOmniRoute(), TIMEOUT_MS).catch((): typeof TIMEOUT => TIMEOUT);
  if (result === TIMEOUT) return { ok: false, latencyMs: null };
  return { ok: result.healthy && result.status < 400, latencyMs: Date.now() - started };
}

/**
 * OpenRouter: balans (GET /credits — token sarflanmaydi). Kredit tugagan bo'lsa (402 holati)
 * provayder ishlamaydi deb hisoblanadi.
 */
async function probeOpenRouter(): Promise<ProviderProbe> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return null;
  const { res, latencyMs } = await timedFetch("https://openrouter.ai/api/v1/credits", {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res?.ok) {
    await res?.body?.cancel().catch(() => {});
    return { ok: false, latencyMs: res ? latencyMs : null };
  }
  const j = (await res.json().catch(() => null)) as { data?: { total_credits?: number; total_usage?: number } } | null;
  const total = Number(j?.data?.total_credits);
  const used = Number(j?.data?.total_usage);
  const hasCredit = Number.isFinite(total) && Number.isFinite(used) ? total - used > 0 : false;
  return { ok: hasCredit, latencyMs };
}

/** Groq: GET /models — kalit va xizmat tirikligi (bepul kunlik so'rov kvotasi sarflanmaydi). */
async function probeGroq(): Promise<ProviderProbe> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;
  const { res, latencyMs } = await timedFetch("https://api.groq.com/openai/v1/models", {
    headers: { Authorization: `Bearer ${key}` },
  });
  await res?.body?.cancel().catch(() => {});
  return { ok: !!res?.ok, latencyMs: res ? latencyMs : null };
}

/**
 * Cloudflare Workers AI: eng kichik model bilan 1 tokenli so'rov (~0.05 neuron) — kunlik 10k
 * neuron limiti tugagan bo'lsa (429 / 4006) shu yerda ko'rinadi; /models buni ko'rsatmaydi.
 */
async function probeCloudflare(): Promise<ProviderProbe> {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const token = process.env.CLOUDFLARE_AI_TOKEN?.trim();
  if (!account || !token) return null;
  const { res, latencyMs } = await timedFetch(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/ai/v1/chat/completions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ model: "@cf/meta/llama-3.2-1b-instruct", messages: [{ role: "user", content: "ping" }], max_tokens: 1 }),
    },
  );
  await res?.body?.cancel().catch(() => {});
  return { ok: !!res?.ok, latencyMs: res ? latencyMs : null };
}

/**
 * AI shlyuzi — chat provayderlari (OmniRoute, OpenRouter, Groq, Cloudflare) birgalikda:
 *  - hammasi ishlaydi → operational;
 *  - kamida bittasi ishlaydi (masalan OpenRouter krediti tugagan, Groq/Cloudflare ishlayapti) →
 *    operational + "Some models may be unavailable" (pullik modellar ekvivalentga almashishi mumkin);
 *  - hech biri ishlamaydi → degraded "Using fallback provider" (faqat anonim LLM7 zaxirasi qoladi);
 *  - hech biri sozlanmagan → degraded "Not configured".
 * Qaysi provayder ekani JSON'ga chiqmaydi — faqat umumiy izoh.
 */
async function checkAiGateway(): Promise<Check> {
  const probes = (await Promise.all([probeOmni(), probeOpenRouter(), probeGroq(), probeCloudflare()])).filter(
    (p): p is NonNullable<ProviderProbe> => p !== null,
  );
  if (!probes.length) return { status: "degraded", latencyMs: null, note: "Not configured" };
  const healthy = probes.filter((p) => p.ok);
  if (!healthy.length) return { status: "degraded", latencyMs: null, note: "Using fallback provider" };
  const latencyMs = Math.min(...healthy.map((p) => p.latencyMs ?? Number.POSITIVE_INFINITY));
  const latency = Number.isFinite(latencyMs) ? latencyMs : null;
  if (latency !== null && bySpeed(latency) === "degraded") return { status: "degraded", latencyMs: latency, note: "Slow responses" };
  if (healthy.length < probes.length) return { status: "operational", latencyMs: latency, note: "Some models may be unavailable" };
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
