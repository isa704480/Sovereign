/**
 * Byudjet ogohlantirishlari — qaysi alert kerak va kunlik dedupe. PURE (store/sender tashqaridan).
 * Server tomoni (Telegram / Resend / Upstash): budget.server.ts. Test: npx tsx src/lib/econ/budget.test.ts
 *
 * Alertlar:
 *  - openrouter_low — OpenRouter balansi < OPENROUTER_ALERT_USD;
 *  - warn           — sarf ogohlantirish chegarasidan oshdi (ratio ≥ warn);
 *  - cap            — sarf ruxsatga yetdi (ratio ≥ cap) — guard yoqiq;
 *  - guard_on / guard_off — guard holati o'zgardi (oldingi holat store'da).
 * Dedupe: har alert kuniga bir marta (kalit budget:alert:<id>:<YYYY-MM-DD>, NX). Hech bir kanal
 * yubora olmasa — kalit bo'shatiladi (keyingi cron qayta urinadi).
 */
import { fmt, translate, type Lang, type TKey } from "@/lib/i18n";
import type { BudgetState } from "./budget";

export type AlertId = "openrouter_low" | "warn" | "cap" | "guard_on" | "guard_off";

export interface OpenRouterBalance {
  /** Qolgan kredit (USD). null — aniqlab bo'lmadi. */
  balanceUsd: number | null;
  /** Shu oy OpenRouter'dagi haqiqiy sarf (faqat /key javobida bor). */
  usageMonthlyUsd?: number | null;
  source: "credits" | "key" | "none";
  error?: string;
}

export function decideAlerts(input: {
  state: BudgetState | null;
  /** Oldingi cron ko'rgan guard holati (null — noma'lum). */
  prevRestricted: boolean | null;
  openrouter: OpenRouterBalance | null;
  openrouterAlertUsd: number;
}): AlertId[] {
  const out: AlertId[] = [];
  const bal = input.openrouter?.balanceUsd;
  if (typeof bal === "number" && Number.isFinite(bal) && bal < input.openrouterAlertUsd) out.push("openrouter_low");
  const s = input.state;
  if (s) {
    if (s.paidRestricted && input.prevRestricted !== true) out.push("guard_on");
    if (!s.paidRestricted && input.prevRestricted === true) out.push("guard_off");
    if (s.level === "cap") out.push("cap");
    else if (s.level === "warn") out.push("warn");
  }
  return out;
}

export interface DedupeStore {
  /** NX: true — kalit yangi o'rnatildi (yuborish mumkin). */
  claim(key: string, ttlMs: number): Promise<boolean>;
  release(key: string): Promise<void>;
}

export const ALERT_DEDUPE_TTL_MS = 26 * 60 * 60_000;

export function alertKey(id: AlertId, now: Date): string {
  return `budget:alert:${id}:${now.toISOString().slice(0, 10)}`;
}

export interface AlertResult {
  id: AlertId;
  status: "sent" | "deduped" | "failed";
}

/** Har alert: claim → send → (muvaffaqiyatsiz bo'lsa) release. `send` true — kamida bitta kanal yubordi. */
export async function sendDeduped(
  ids: readonly AlertId[],
  deps: { store: DedupeStore; send(id: AlertId): Promise<boolean>; now: Date },
): Promise<AlertResult[]> {
  const out: AlertResult[] = [];
  for (const id of ids) {
    const key = alertKey(id, deps.now);
    let claimed = false;
    try {
      claimed = await deps.store.claim(key, ALERT_DEDUPE_TTL_MS);
    } catch {
      claimed = false;
    }
    if (!claimed) {
      out.push({ id, status: "deduped" });
      continue;
    }
    let ok = false;
    try {
      ok = await deps.send(id);
    } catch {
      ok = false;
    }
    if (!ok) {
      try {
        await deps.store.release(key);
      } catch {
        /* ignore */
      }
    }
    out.push({ id, status: ok ? "sent" : "failed" });
  }
  return out;
}

/** Xotiradagi dedupe (Upstash yo'q bo'lsa / testlar). */
export function memoryDedupeStore(now: () => number = Date.now): DedupeStore {
  const m = new Map<string, number>();
  return {
    async claim(key, ttlMs) {
      const until = m.get(key);
      if (until !== undefined && until > now()) return false;
      m.set(key, now() + ttlMs);
      return true;
    },
    async release(key) {
      m.delete(key);
    },
  };
}

/* ------------------------------------------------------------------ */
/* OpenRouter balansi                                                  */
/* ------------------------------------------------------------------ */

const OPENROUTER_API = "https://openrouter.ai/api/v1";

/**
 * OpenRouter qolgan krediti. Rasmiy: GET /api/v1/credits → { data: { total_credits, total_usage } }
 * (hujjat bo'yicha "management key" kerak — OPENROUTER_MANAGEMENT_KEY, bo'lmasa OPENROUTER_API_KEY
 * sinaladi). Rad etilsa — GET /api/v1/key (oddiy kalit): data.limit_remaining (kalit limiti bo'lsa)
 * va data.usage_monthly (shu oy haqiqiy sarf). Hech qachon otmaydi; kalit logga chiqmaydi.
 */
export async function fetchOpenRouterBalance(
  fetchImpl: typeof fetch,
  env: Record<string, string | undefined> = process.env,
): Promise<OpenRouterBalance> {
  const apiKey = env.OPENROUTER_API_KEY?.trim();
  const mgmtKey = env.OPENROUTER_MANAGEMENT_KEY?.trim() || apiKey;
  if (!mgmtKey) return { balanceUsd: null, source: "none", error: "OPENROUTER_API_KEY not set" };
  const get = async (path: string, key: string) => {
    const res = await fetchImpl(`${OPENROUTER_API}${path}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(8_000),
    });
    const body = (await res.json().catch(() => null)) as { data?: Record<string, unknown> } | null;
    return { ok: res.ok, status: res.status, data: body?.data ?? null };
  };
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  let err = "";
  try {
    const r = await get("/credits", mgmtKey);
    const total = num(r.data?.total_credits);
    const used = num(r.data?.total_usage);
    if (r.ok && total !== null && used !== null) return { balanceUsd: total - used, source: "credits" };
    err = `credits HTTP ${r.status}`;
  } catch (e) {
    err = `credits: ${e instanceof Error ? e.message : "network error"}`;
  }
  if (!apiKey) return { balanceUsd: null, source: "none", error: err };
  try {
    const r = await get("/key", apiKey);
    if (r.ok && r.data) {
      return {
        balanceUsd: num(r.data.limit_remaining),
        usageMonthlyUsd: num(r.data.usage_monthly),
        source: "key",
        ...(num(r.data.limit_remaining) === null ? { error: `${err}; key has no limit` } : {}),
      };
    }
    err += `; key HTTP ${r.status}`;
  } catch (e) {
    err += `; key: ${e instanceof Error ? e.message : "network error"}`;
  }
  return { balanceUsd: null, source: "none", error: err };
}

/* ------------------------------------------------------------------ */
/* Matn                                                                */
/* ------------------------------------------------------------------ */

const ALERT_KEY: Record<AlertId, TKey> = {
  openrouter_low: "p13eAlertOpenrouterLow",
  warn: "p13eAlertWarn",
  cap: "p13eAlertCap",
  guard_on: "p13eAlertGuardOn",
  guard_off: "p13eAlertGuardOff",
};

const money = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? "—" : `$${n.toFixed(2)}`);
const percent = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? "—" : `${(n * 100).toFixed(1)}%`);

/** Alert matni (founder tilida — ALERT_LANG). */
export function formatAlert(
  id: AlertId,
  ctx: { state: BudgetState | null; openrouter: OpenRouterBalance | null; openrouterAlertUsd: number },
  lang: Lang,
): string {
  const s = ctx.state;
  const body = fmt(translate(lang, ALERT_KEY[id]), {
    balance: money(ctx.openrouter?.balanceUsd),
    min: money(ctx.openrouterAlertUsd),
    spend: money(s?.spendUsd),
    revenue: money(s?.revenueUsd),
    ratio: percent(s?.ratio),
    warn: percent(s?.cfg.warnRatio),
    cap: percent(s?.cfg.capRatio),
    allowance: money(s?.allowanceUsd),
    month: s?.month ?? "—",
  });
  return `${translate(lang, "p13eAlertTitle")}\n${body}`;
}
