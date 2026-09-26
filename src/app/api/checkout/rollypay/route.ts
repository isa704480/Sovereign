import { z } from "zod";
import { PLAN_BY_ID, isBillingPeriod, isPlanId, planPrice, planPriceRub } from "@/config/plans";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createRollyPayment, isRollyConfigured, rollyRate } from "@/lib/payments/rollypay";
import { normalizePromo, reservePromoOrder, resolvePromo } from "@/lib/payments/promo";
import { purchaseBlocker } from "@/lib/payments/entitlement";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { getServerT } from "@/lib/i18n-server";

export const runtime = "nodejs";

const schema = z.object({
  plan: z.string(),
  period: z.string().optional(),
  method: z.enum(["sbp", "crypto"]).optional(),
  promo: z.string().max(64).optional(),
});

/** RollyPay komissiyasi kripto uchun 3% — foydalanuvchi USD narxni to'la to'laydi, biz ham. */
const CRYPTO_FEE = 0.03;
/** Rubl to'lovining eng kichik summasi (promokod bilan ham shundan tushmaydi). */
const MIN_RUB = Number(process.env.ROLLYPAY_MIN_RUB ?? "100") || 100;

/**
 * Kripto summasi rublda (RollyPay faqat RUB qabul qiladi): USD narx × joriy
 * USDT/RUB kursi, 3% komissiya ustiga qo'shiladi — kassaga aynan USD narx tushadi.
 * Kurs olinmasa — СБП rubl narxi (unda komissiya zaxirasi bor).
 */
async function cryptoAmountRub(usd: number, fallbackRub: number): Promise<number> {
  const rate = await rollyRate();
  if (!rate) return fallbackRub;
  return Math.ceil((usd * rate) / (1 - CRYPTO_FEE));
}

/** POST /api/checkout/rollypay — СБП / МИР (Rossiya) yoki kripto to'lov sahifasi. */
export async function POST(req: Request) {
  const t = await getServerT();
  if (!(await rateLimit(`rolly-checkout:${clientIp(req)}`, 10, 60_000)).ok) {
    return Response.json({ error: t("chTooManyRequests") }, { status: 429 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !isPlanId(parsed.data.plan) || parsed.data.plan === "free") {
    return Response.json({ error: t("chBadPlan") }, { status: 400 });
  }
  const planId = parsed.data.plan;
  const plan = PLAN_BY_ID[planId];
  const period = isBillingPeriod(parsed.data.period) ? parsed.data.period : "month";
  const method = parsed.data.method ?? "sbp";
  const sbpRub = planPriceRub(plan, period);

  if (!isSupabaseConfigured()) return Response.json({ error: t("chSupabaseMissing") }, { status: 503 });
  if (!isRollyConfigured() || sbpRub <= 0) {
    return Response.json({ error: t("chSbpNotConfigured") }, { status: 503 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: t("chLoginFirst") }, { status: 401 });

  const price = method === "crypto" ? await cryptoAmountRub(planPrice(plan, period), sbpRub) : sbpRub;
  let amount = price.toFixed(2);
  const promo = normalizePromo(parsed.data.promo);
  const orderId = `sov_${crypto.randomUUID()}`;

  // Buyurtmani faqat server (service role) yozadi — foydalanuvchi summa/valyuta/
  // provider'ni o'zi belgilay olmaydi (0028: "orders: own insert" olib tashlandi).
  let service: ReturnType<typeof createServiceClient>;
  try {
    service = createServiceClient();
  } catch (e) {
    console.error("[checkout/rollypay] service client:", e);
    return Response.json({ error: t("chOrderNotCreated") }, { status: 500 });
  }
  // Pastroq tarif (yuqorisi faol) yoki ikkinchi parallel karta obunasi — rad (0033).
  const blocked = await purchaseBlocker(service, user.id, planId, "rollypay");
  if (blocked) return Response.json({ error: t(blocked) }, { status: 409 });

  if (promo) {
    const r = await resolvePromo(promo, user.id, price, Math.min(price, MIN_RUB));
    if (!r.ok) return Response.json({ error: t(r.error) }, { status: 400 });
    amount = Math.ceil(Number(r.amount)).toFixed(2);
    // Tekshiruv + INSERT bitta tranzaksiyada (parallel so'rovlar limitni buzmaydi).
    const reserved = await reservePromoOrder({
      orderId,
      userId: user.id,
      plan: planId,
      amount,
      currency: "RUB",
      provider: "rollypay",
      billingPeriod: period,
      code: r.code,
      maxUses: r.maxUses,
    });
    if (!reserved.ok) return Response.json({ error: t(reserved.error) }, { status: 400 });
  } else {
    const { error: insErr } = await service.from("orders").insert({
      id: orderId,
      user_id: user.id,
      plan: planId,
      amount,
      currency: "RUB",
      status: "pending",
      provider: "rollypay",
      ...(period === "year" ? { billing_period: "year" } : {}),
    });
    if (insErr) {
      console.error("[checkout/rollypay] order insert:", insErr.message);
      return Response.json({ error: t("chOrderNotCreated") }, { status: 500 });
    }
  }

  const origin = (process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin).replace(/\/$/, "");
  try {
    const pay = await createRollyPayment({
      method,
      orderId,
      amountRub: Number(amount),
      description: `SOVEREIGN ${plan.name} — ${t(period === "year" ? "p7cPayPeriodYear" : "p7cPayPeriodMonth")}`,
      customerId: user.id,
      successUrl: `${origin}/app?paid=1`,
      failUrl: `${origin}/app?paid=0`,
      metadata: { user_id: user.id, plan: planId, period, method, ...(promo ? { promo } : {}) },
    });
    try {
      await service.from("orders").update({ checkout_id: pay.paymentId }).eq("id", orderId);
    } catch {
      /* faqat solishtirish uchun */
    }
    return Response.json({ checkoutUrl: pay.payUrl, orderId, amount });
  } catch (e) {
    console.error("[checkout/rollypay] create payment:", e);
    try {
      await service.from("orders").update({ status: "cancelled" }).eq("id", orderId);
    } catch {
      /* ignore */
    }
    return Response.json({ error: t("chCheckoutPageFailed") }, { status: 502 });
  }
}
