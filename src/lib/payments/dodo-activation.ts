/**
 * Dodo webhook'ida tarif ochish qarori — PURE (DB/SDK'siz). Test:
 * npx tsx --conditions=react-server src/lib/payments/dodo-activation.test.ts
 *
 * Xavfsizlik qoidasi: webhook metadata'si (plan / period / user_id / order_id) XARIDOR
 * tomonidan boshqariladi (Dodo static link: `...?metadata_plan=ultra`). Shuning uchun
 * foydalanuvchi, tarif va davr FAQAT server yaratgan buyurtmadan (orders) olinadi;
 * to'langan mahsulot shu buyurtmaning mahsulotiga teng bo'lishi, muddat esa faqat
 * Dodo'ning next_billing_date'idan olinishi shart. Buyurtma birinchi faollashuvda
 * obuna id'siga (orders.checkout_id) bog'lanadi — boshqa obuna uni qayta ishlata olmaydi.
 */

export type DodoPaidPlan = "starter" | "pro" | "ultra";
export type DodoPeriod = "month" | "year";

export interface DodoOrderRow {
  id: string;
  user_id: string;
  plan: string;
  billing_period?: string | null;
  status: string;
  provider: string;
  checkout_id?: string | null;
}

export type DodoActivation =
  | {
      ok: true;
      userId: string;
      plan: DodoPaidPlan;
      period: DodoPeriod;
      untilIso: string;
      /** true — buyurtma hali "pending": obunaga bog'lash (va "paid" qilish) kerak. */
      bind: boolean;
    }
  | { ok: false; reason: string };

const DAY_MS = 24 * 3600 * 1000;
/** next_billing_date ustiga imtiyoz (Dodo kechikib yechsa ham tarif uzilmasin). */
const GRACE_MS = DAY_MS;
/** Himoya chegarasi: bitta hodisa davrdan ko'p muddat bera olmaydi. */
const MAX_DAYS: Record<DodoPeriod, number> = { month: 33, year: 368 };

export function isDodoPaidPlan(v: unknown): v is DodoPaidPlan {
  return v === "starter" || v === "pro" || v === "ultra";
}

export function decideDodoActivation(input: {
  order: DodoOrderRow | null;
  /** Hodisa metadata'sidagi user_id (bo'lsa — buyurtma egasiga teng bo'lishi shart). */
  metaUserId?: string | null;
  /** Dodo obuna id'si (subscription.* — data'dan, payment.* — to'lovdan). */
  subscriptionId?: string | null;
  /** Haqiqatda to'langan mahsulot (Dodo obunasidan). */
  paidProductId?: string | null;
  /** Dodo obunasining keyingi to'lov sanasi. */
  nextBillingDate?: string | null;
  expectedProductId: (plan: DodoPaidPlan, period: DodoPeriod) => string | undefined;
  now: number;
}): DodoActivation {
  const o = input.order;
  if (!o) return { ok: false, reason: "order_not_found" };
  if (o.provider !== "dodo") return { ok: false, reason: "wrong_provider" };
  if (o.status !== "pending" && o.status !== "paid") return { ok: false, reason: `order_${o.status}` };
  if (input.metaUserId && input.metaUserId !== o.user_id) return { ok: false, reason: "user_mismatch" };
  if (!isDodoPaidPlan(o.plan)) return { ok: false, reason: "bad_plan" };
  const sub = input.subscriptionId?.trim();
  if (!sub) return { ok: false, reason: "no_subscription" };

  const period: DodoPeriod = o.billing_period === "year" ? "year" : "month";
  const expected = input.expectedProductId(o.plan, period);
  if (!expected || !input.paidProductId || input.paidProductId !== expected) {
    return { ok: false, reason: "product_mismatch" };
  }
  // To'langan buyurtma faqat o'zi bog'langan obunadan uzaytiriladi.
  if (o.status === "paid" && o.checkout_id !== sub) return { ok: false, reason: "subscription_mismatch" };

  const next = input.nextBillingDate ? new Date(input.nextBillingDate) : null;
  if (!next || Number.isNaN(next.getTime())) return { ok: false, reason: "no_next_billing_date" };
  const until = Math.min(next.getTime() + GRACE_MS, input.now + MAX_DAYS[period] * DAY_MS);
  if (until <= input.now) return { ok: false, reason: "period_over" };

  return {
    ok: true,
    userId: o.user_id,
    plan: o.plan,
    period,
    untilIso: new Date(until).toISOString(),
    bind: o.status === "pending",
  };
}

/**
 * Refund/dispute: to'lov metadata'sidagi order_id ham xaridor qo'lida — buyurtma faqat
 * Dodo'niki bo'lsa va (to'lov obunaga tegishli bo'lsa) aynan shu obunaga bog'langan bo'lsa qabul.
 */
export function revokeOrderMatches(order: Pick<DodoOrderRow, "provider" | "checkout_id"> | null, subscriptionId?: string | null): boolean {
  if (!order || order.provider !== "dodo") return false;
  if (subscriptionId) return order.checkout_id === subscriptionId;
  return true;
}
