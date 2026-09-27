/**
 * API byudjeti — "tushgan pulning ko'pi bilan 50% i API'ga" qoidasi. PURE (tarmoq/DB yo'q):
 * server qismi (budget.server.ts), mesh guard (guard.ts), cron (budget-watch.ts) va testlar
 * shu mantiqdan foydalanadi. Test: npx tsx src/lib/econ/budget.test.ts
 *
 * Pulni Dodo/RollyPay'dan provayderlarga avtomatik o'tkazib bo'lmaydi (ular bankka to'laydi,
 * provayderlar kartadan yechadi) — shuning uchun qoida SARF CHEKLOVI + OGOHLANTIRISH bilan
 * bajariladi:
 *
 *  Daromad (joriy kalendar oy, UTC) = Σ orders (status = 'paid'), USD'da:
 *    - oylik buyurtma: paid_at shu oyda bo'lsa — to'liq summa;
 *    - yillik (billing_period = 'year'): summa / 12, to'langan oydan boshlab 12 oy davomida
 *      har oyga (bir oyda katta "limit" paydo bo'lib, keyingi 11 oy bo'sh qolmasin);
 *    - 'refunded' / 'pending' / 'expired' hisoblanmaydi;
 *    - USD / USDT / USDC → 1:1; RUB → summa / rubPerUsd. rubPerUsd — RollyPay'ning joriy
 *      USDT/RUB kursi (rollypay.ts rollyRate, GET /rate — kassaga USDT tushadi), bo'lmasa
 *      BUDGET_RUB_PER_USD env; ikkalasi ham yo'q bo'lsa RUB buyurtmalar HISOBLANMAYDI
 *      (ehtiyotkor: daromad kamroq → cheklov qattiqroq) va `unconverted` da aytiladi.
 *  Sarf (joriy oy) = unit-economics taxmini: tokenlar × haqiqatda javob bergan modelning
 *    ro'yxat narxi (model-prices.ts) MINUS tekin tarifdagi (Groq/Cloudflare/":free"...) qism.
 *    Tekin qism alohida ko'rsatiladi, lekin real sarfga kirmaydi.
 *  Ruxsat (allowance) = max(BUDGET_MIN_MONTHLY_USD, daromad × BUDGET_CAP_RATIO).
 *    Floor 1-oyda (daromad hali yo'q) mahsulot ishlashi uchun.
 *  Cheklov (paidRestricted) = sarf > floor VA sarf ≥ daromad × cap  ⇔  sarf ≥ ruxsat (> floor).
 *  Ogohlantirish (warn) = sarf ≥ ruxsat × (warn / cap)  (standart 0.4/0.5 → ruxsatning 80%).
 *  ratio = sarf / daromad (daromad 0 bo'lsa — null).
 */
import type { OpenRouterBalance } from "./alerts";
import type { UnitEconomics } from "./unit-economics";

export interface BudgetConfig {
  /** BUDGET_WARN_RATIO (standart 0.4). */
  warnRatio: number;
  /** BUDGET_CAP_RATIO (standart 0.5). */
  capRatio: number;
  /** BUDGET_MIN_MONTHLY_USD (standart 5). */
  minMonthlyUsd: number;
  /** OPENROUTER_ALERT_USD (standart 3). */
  openrouterAlertUsd: number;
}

export const BUDGET_DEFAULTS: BudgetConfig = { warnRatio: 0.4, capRatio: 0.5, minMonthlyUsd: 5, openrouterAlertUsd: 3 };

function envNum(v: string | undefined, def: number, min: number, max: number): number {
  const n = Number((v ?? "").trim());
  return (v ?? "").trim() !== "" && Number.isFinite(n) && n >= min && n <= max ? n : def;
}

export function budgetConfig(env: Record<string, string | undefined> = process.env): BudgetConfig {
  const capRatio = envNum(env.BUDGET_CAP_RATIO, BUDGET_DEFAULTS.capRatio, 0.01, 1);
  let warnRatio = envNum(env.BUDGET_WARN_RATIO, BUDGET_DEFAULTS.warnRatio, 0.01, 1);
  if (warnRatio > capRatio) warnRatio = capRatio;
  return {
    warnRatio,
    capRatio,
    minMonthlyUsd: envNum(env.BUDGET_MIN_MONTHLY_USD, BUDGET_DEFAULTS.minMonthlyUsd, 0, 1_000_000),
    openrouterAlertUsd: envNum(env.OPENROUTER_ALERT_USD, BUDGET_DEFAULTS.openrouterAlertUsd, 0, 1_000_000),
  };
}

/** Joriy kalendar oy (UTC): boshlanishi, "YYYY-MM-DD" chegaralari, yillik buyurtmalar qidiruvi boshi. */
export function monthWindow(now: Date): { monthStart: Date; from: string; to: string; lookbackStart: Date } {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const lookbackStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
  return { monthStart, from: monthStart.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10), lookbackStart };
}

export interface OrderRow {
  amount: string | number | null;
  currency: string | null;
  paid_at: string | null;
  billing_period?: string | null;
}

export type RubRateSource = "rollypay" | "env" | "none";

export interface Revenue {
  usd: number;
  /** Hisobga kirgan buyurtmalar (yillik — ulushi bilan). */
  orders: number;
  yearlyAmortized: number;
  rubOrders: number;
  /** RUB kursi bo'lmagani uchun hisoblanmagan RUB buyurtmalar. */
  unconverted: number;
  /** Noma'lum valyuta yoki yaroqsiz summa. */
  skipped: number;
  rubPerUsd: number | null;
  rubRateSource: RubRateSource;
}

const USD_LIKE = new Set(["USD", "USDT", "USDC"]);

function monthIndex(d: Date): number {
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}

export function computeRevenue(
  orders: readonly OrderRow[],
  opts: { now: Date; rubPerUsd: number | null; rubRateSource?: RubRateSource },
): Revenue {
  const rate = opts.rubPerUsd && Number.isFinite(opts.rubPerUsd) && opts.rubPerUsd > 0 ? opts.rubPerUsd : null;
  const out: Revenue = {
    usd: 0,
    orders: 0,
    yearlyAmortized: 0,
    rubOrders: 0,
    unconverted: 0,
    skipped: 0,
    rubPerUsd: rate,
    rubRateSource: rate ? (opts.rubRateSource ?? "env") : "none",
  };
  const nowIdx = monthIndex(opts.now);
  for (const o of orders) {
    if (!o.paid_at) continue;
    const paid = new Date(o.paid_at);
    if (Number.isNaN(paid.getTime()) || paid.getTime() > opts.now.getTime()) continue;
    const diff = nowIdx - monthIndex(paid);
    const yearly = o.billing_period === "year";
    if (diff < 0 || diff > (yearly ? 11 : 0)) continue;

    const amount = Number(o.amount);
    const cur = (o.currency ?? "USD").trim().toUpperCase();
    if (!Number.isFinite(amount) || amount < 0) {
      out.skipped++;
      continue;
    }
    let usd: number;
    if (USD_LIKE.has(cur)) usd = amount;
    else if (cur === "RUB") {
      out.rubOrders++;
      if (!rate) {
        out.unconverted++;
        continue;
      }
      usd = amount / rate;
    } else {
      out.skipped++;
      continue;
    }
    if (yearly) {
      usd /= 12;
      out.yearlyAmortized++;
    }
    out.usd += usd;
    out.orders++;
  }
  return out;
}

export interface Spend {
  /** Real sarf taxmini: ro'yxat narxidagi sarf − tekin tarif qismi. */
  usd: number;
  /** Tekin tarifdagi foydalanish ro'yxat narxida (real sarfga kirmaydi). */
  freeTierAtListUsd: number;
  pricedAnswers: number;
  /** Narxi topilmagan / modelsiz javoblar (sarfga kirmagan). */
  excludedAnswers: number;
}

export function spendFromEconomics(e: UnitEconomics | null): Spend | null {
  if (!e) return null;
  return {
    usd: Math.max(0, e.priced.costUsd - e.freeTier.costAtListUsd),
    freeTierAtListUsd: e.freeTier.costAtListUsd,
    pricedAnswers: e.priced.answers,
    excludedAnswers: e.excluded.answers,
  };
}

export type BudgetLevel = "ok" | "warn" | "cap";

export interface BudgetEvaluation {
  revenueUsd: number;
  spendUsd: number;
  /** spend / revenue; daromad 0 — null. */
  ratio: number | null;
  /** max(floor, revenue × cap). */
  allowanceUsd: number;
  /** allowance × warn / cap. */
  warnAtUsd: number;
  level: BudgetLevel;
  paidRestricted: boolean;
}

export function evaluateBudget(revenueUsd: number, spendUsd: number, cfg: BudgetConfig): BudgetEvaluation {
  const revenue = Math.max(0, revenueUsd || 0);
  const spend = Math.max(0, spendUsd || 0);
  const allowance = Math.max(cfg.minMonthlyUsd, revenue * cfg.capRatio);
  const warnAt = allowance * (cfg.warnRatio / cfg.capRatio);
  const paidRestricted = spend > cfg.minMonthlyUsd && spend >= revenue * cfg.capRatio;
  const level: BudgetLevel = paidRestricted ? "cap" : spend >= warnAt && spend > 0 ? "warn" : "ok";
  return {
    revenueUsd: revenue,
    spendUsd: spend,
    ratio: revenue > 0 ? spend / revenue : null,
    allowanceUsd: allowance,
    warnAtUsd: warnAt,
    level,
    paidRestricted,
  };
}

/** Guard holati — Upstash'da (JSON) va admin kartasida. */
export interface BudgetState extends BudgetEvaluation {
  /** Hisoblangan vaqt (epoch ms). */
  at: number;
  month: string;
  revenue: Revenue;
  spend: Spend;
  cfg: BudgetConfig;
}

/** Admin kartasi uchun (budget.server.ts getBudgetSnapshot). */
export interface BudgetSnapshot {
  state: BudgetState | null;
  openrouter: OpenRouterBalance | null;
}

export function parseBudgetState(raw: unknown): BudgetState | null {
  try {
    const v = (typeof raw === "string" ? JSON.parse(raw) : raw) as Partial<BudgetState> | null;
    if (!v || typeof v !== "object" || typeof v.at !== "number" || typeof v.paidRestricted !== "boolean") return null;
    return v as BudgetState;
  } catch {
    return null;
  }
}
