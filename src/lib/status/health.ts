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

async function checkAiGateway(): Promise<Check> {
  if (!process.env.OMNIROUTE_BASE_URL) {
    return { status: "degraded", latencyMs: null, note: "Not configured" };
  }
  const started = Date.now();
  try {
    const result = await withTimeout(probeOmniRoute(), TIMEOUT_MS);
    const latencyMs = Date.now() - started;
    if (result === TIMEOUT) return { status: "degraded", latencyMs: null, note: "Slow responses" };
    if (!result.healthy) return { status: "down", latencyMs, note: "Not responding" };
    // 4xx/429 — gateway tirik, lekin provayderlar cheklangan bo'lishi mumkin.
    if (result.status >= 400) return { status: "degraded", latencyMs, note: "Some models may be unavailable" };
    return { status: "operational", latencyMs };
  } catch {
    return { status: "down", latencyMs: null, note: "Not responding" };
  }
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
