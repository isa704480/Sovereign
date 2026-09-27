import "server-only";
import { Redis } from "@upstash/redis";
import { isLang, type Lang } from "@/lib/i18n";
import { isResendConfigured, sendEmail } from "@/lib/email/resend";
import { isRollyConfigured, rollyRate } from "@/lib/payments/rollypay";
import { createServiceClient } from "@/lib/supabase/service";
import {
  fetchOpenRouterBalance,
  formatAlert,
  memoryDedupeStore,
  type AlertId,
  type DedupeStore,
} from "./alerts";
import {
  budgetConfig,
  computeRevenue,
  evaluateBudget,
  monthWindow,
  spendFromEconomics,
  type BudgetSnapshot,
  type BudgetState,
  type OrderRow,
  type RubRateSource,
} from "./budget";
import type { BudgetWatchDeps } from "./budget-watch";
import { createBudgetGuard, type BudgetGuard, type GuardStore } from "./guard";
import { getUnitEconomicsBetween } from "./unit-economics.server";

/**
 * Byudjet guard'i va budget-watch cron'ining server tomoni: Supabase (service role, faqat
 * O'QISH), Upstash (kesh/dedupe; bo'lmasa xotira), RollyPay kursi, OpenRouter balansi,
 * Telegram / Resend alertlari. Formulalar: budget.ts. Pul hech qayerga o'tkazilmaydi.
 */

const REDIS_TIMEOUT_MS = 1_000;
const PREV_KEY = "budget:guard:last";

let redisClient: Redis | null | undefined;
function redis(): Redis | null {
  if (redisClient !== undefined) return redisClient;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  try {
    redisClient = url && token ? new Redis({ url, token, automaticDeserialization: false, retry: false }) : null;
  } catch {
    redisClient = null;
  }
  return redisClient;
}

function withTimeout<T>(p: Promise<T>, ms = REDIS_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    p,
    new Promise<T>((_, rej) => {
      timer = setTimeout(() => rej(new Error(`redis timeout ${ms}ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/** Upstash (bo'lmasa/yiqilsa — xotira) kalit-qiymat. */
const memKv = new Map<string, { v: string; until: number }>();
const kv: GuardStore & { del(key: string): Promise<void>; setNx(key: string, value: string, ttlMs: number): Promise<boolean> } = {
  async get(key) {
    const r = redis();
    if (r) {
      try {
        const v = await withTimeout(r.get<string>(key));
        return v == null ? null : String(v);
      } catch (e) {
        console.warn("[budget] redis get:", e instanceof Error ? e.message : e);
      }
    }
    const m = memKv.get(key);
    return m && m.until > Date.now() ? m.v : null;
  },
  async set(key, value, ttlMs) {
    memKv.set(key, { v: value, until: Date.now() + ttlMs });
    const r = redis();
    if (r) await withTimeout(r.set(key, value, { px: Math.max(1, Math.round(ttlMs)) }));
  },
  async setNx(key, value, ttlMs) {
    const r = redis();
    if (r) {
      try {
        return (await withTimeout(r.set(key, value, { px: Math.max(1, Math.round(ttlMs)), nx: true }))) === "OK";
      } catch (e) {
        console.warn("[budget] redis setnx:", e instanceof Error ? e.message : e);
      }
    }
    const m = memKv.get(key);
    if (m && m.until > Date.now()) return false;
    memKv.set(key, { v: value, until: Date.now() + ttlMs });
    return true;
  },
  async del(key) {
    memKv.delete(key);
    const r = redis();
    if (r) await withTimeout(r.del(key)).catch(() => undefined);
  },
};

/* ------------------------------------------------------------------ */
/* Hisoblash                                                           */
/* ------------------------------------------------------------------ */

async function rubPerUsd(): Promise<{ rate: number | null; source: RubRateSource }> {
  if (isRollyConfigured()) {
    const r = await rollyRate(); // USDT/RUB — RollyPay kassaga USDT tushadi
    if (r) return { rate: r, source: "rollypay" };
  }
  const env = Number(process.env.BUDGET_RUB_PER_USD);
  if (Number.isFinite(env) && env > 0) return { rate: env, source: "env" };
  return { rate: null, source: "none" };
}

async function fetchPaidOrders(sb: ReturnType<typeof createServiceClient>, since: Date): Promise<OrderRow[]> {
  const rows: OrderRow[] = [];
  let cols = "amount,currency,paid_at,billing_period";
  for (let off = 0; off < 50_000; off += 1000) {
    const { data, error } = await sb
      .from("orders")
      .select(cols)
      .eq("status", "paid")
      .gte("paid_at", since.toISOString())
      .order("paid_at", { ascending: true })
      .range(off, off + 999);
    if (error) {
      // 0025 migratsiyasisiz (billing_period yo'q) — hammasi oylik.
      if (cols.includes("billing_period") && /billing_period|column/i.test(error.message)) {
        cols = "amount,currency,paid_at";
        off -= 1000;
        continue;
      }
      throw new Error(`orders: ${error.message}`);
    }
    rows.push(...((data ?? []) as unknown as OrderRow[]));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

/** Joriy oy holatini hisoblaydi (Supabase yo'q bo'lsa — otadi; guard fail-open qoladi). */
export async function computeBudgetState(now = new Date()): Promise<BudgetState> {
  const cfg = budgetConfig();
  const w = monthWindow(now);
  const sb = createServiceClient();
  const [orders, econ, rub] = await Promise.all([
    fetchPaidOrders(sb, w.lookbackStart),
    getUnitEconomicsBetween(w.from, w.to, { plans: false }),
    rubPerUsd(),
  ]);
  const spend = spendFromEconomics(econ);
  if (!spend) throw new Error("token_usage_daily unavailable");
  const revenue = computeRevenue(orders, { now, rubPerUsd: rub.rate, rubRateSource: rub.source });
  return {
    ...evaluateBudget(revenue.usd, spend.usd, cfg),
    at: now.getTime(),
    month: w.from.slice(0, 7),
    revenue,
    spend,
    cfg,
  };
}

let guard: BudgetGuard | null = null;
export function budgetGuard(): BudgetGuard {
  guard ??= createBudgetGuard({ store: kv, compute: () => computeBudgetState() });
  return guard;
}

/** Mesh uchun: sarf chegarasiga yetildimi (faqat tekin takliflar). Hech qachon kutmaydi/otmaydi. */
export function isPaidRestricted(): Promise<boolean> {
  return budgetGuard().paidRestricted();
}

/* ------------------------------------------------------------------ */
/* Alertlar                                                            */
/* ------------------------------------------------------------------ */

function alertLang(): Lang {
  const v = (process.env.ALERT_LANG ?? "").trim();
  return isLang(v) ? v : "uz";
}

function telegramConfigured(): boolean {
  return !!(process.env.TELEGRAM_ALERT_BOT_TOKEN?.trim() && process.env.TELEGRAM_ALERT_CHAT_ID?.trim());
}

function emailConfigured(): boolean {
  return isResendConfigured() && !!process.env.ALERT_EMAIL?.trim();
}

async function sendTelegram(text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_ALERT_BOT_TOKEN?.trim();
  const chat = process.env.TELEGRAM_ALERT_CHAT_ID?.trim();
  if (!token || !chat) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.error(`[budget-watch] telegram HTTP ${res.status}`); // tana/token logga chiqmaydi
    return res.ok;
  } catch (e) {
    console.error("[budget-watch] telegram:", e instanceof Error ? e.name : "error");
    return false;
  }
}

async function sendAlertEmail(id: AlertId, text: string): Promise<boolean> {
  const to = process.env.ALERT_EMAIL?.trim();
  if (!to) return false;
  const [subject, ...rest] = text.split("\n");
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const res = await sendEmail({
    to,
    from: "SOVEREIGN AI <alerts@soveregn.xyz>",
    subject: `${subject} — ${id}`,
    text,
    html: `<p><b>${esc(subject)}</b></p><p>${esc(rest.join("\n")).replace(/\n/g, "<br>")}</p>`,
  });
  if (!res.ok) console.error(`[budget-watch] email failed (status ${res.status})`);
  return res.ok;
}

const dedupe: DedupeStore = {
  claim: (key, ttlMs) => kv.setNx(key, "1", ttlMs),
  release: (key) => kv.del(key),
};
const fallbackDedupe = memoryDedupeStore();

export function budgetWatchDeps(): BudgetWatchDeps {
  const cfg = budgetConfig();
  return {
    cronSecret: process.env.CRON_SECRET,
    cfg,
    now: () => new Date(),
    refresh: () => budgetGuard().refresh(),
    openrouter: () => fetchOpenRouterBalance(fetch),
    async prevRestricted() {
      const v = await kv.get(PREV_KEY);
      return v === "1" ? true : v === "0" ? false : null;
    },
    savePrevRestricted: (v) => kv.set(PREV_KEY, v ? "1" : "0", 40 * 86_400_000),
    dedupe: redis() ? dedupe : fallbackDedupe,
    channels: () => ({ telegram: telegramConfigured(), email: emailConfigured() }),
    async send(id, ctx) {
      const text = formatAlert(id, { ...ctx, openrouterAlertUsd: cfg.openrouterAlertUsd }, alertLang());
      const results = await Promise.all([
        telegramConfigured() ? sendTelegram(text) : Promise.resolve(false),
        emailConfigured() ? sendAlertEmail(id, text) : Promise.resolve(false),
      ]);
      return results.some(Boolean);
    },
  };
}

/* ------------------------------------------------------------------ */
/* Admin kartasi                                                       */
/* ------------------------------------------------------------------ */

/** Admin paneli uchun (CHAQIRUVCHI admin ekanini tekshiradi). Hech qachon otmaydi. */
export async function getBudgetSnapshot(): Promise<BudgetSnapshot> {
  const [state, openrouter] = await Promise.all([
    budgetGuard()
      .state({ wait: true })
      .catch(() => null),
    fetchOpenRouterBalance(fetch).catch(() => null),
  ]);
  // Xato matni (ichki) client'ga uzatilmaydi.
  return { state, openrouter: openrouter ? { ...openrouter, error: undefined } : null };
}
