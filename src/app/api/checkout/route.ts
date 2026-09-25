import { z } from "zod";
import { PLAN_BY_ID, isBillingPeriod, isPlanId, planPrice } from "@/config/plans";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { isZenoConfigured, zeno } from "@/lib/payments/zenobank";
import { getServerT } from "@/lib/i18n-server";
import { normalizePromo, reservePromoOrder, resolvePromo } from "@/lib/payments/promo";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const schema = z.object({ plan: z.string(), promo: z.string().max(64).optional(), period: z.string().optional() });

/** POST /api/checkout — creates a ZenoBank crypto checkout for a plan. */
export async function POST(req: Request) {
  const t = await getServerT();
  // Promokodlarni terib topishga (brute-force) qarshi.
  if (!(await rateLimit(`zeno-checkout:${clientIp(req)}`, 10, 60_000)).ok) {
    return Response.json({ error: t("chTooManyRequests") }, { status: 429 });
  }
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success || !isPlanId(parsed.data.plan) || parsed.data.plan === "free") {
    return Response.json({ error: t("chBadPlan") }, { status: 400 });
  }
  const planId = parsed.data.plan;
  const plan = PLAN_BY_ID[planId];
  const period = isBillingPeriod(parsed.data.period) ? parsed.data.period : "month";
  const price = planPrice(plan, period);

  if (!isSupabaseConfigured()) return Response.json({ error: t("chSupabaseMissing") }, { status: 503 });
  if (!isZenoConfigured()) {
    return Response.json({ error: t("chZenoNotConfigured") }, { status: 503 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: t("chLoginFirst") }, { status: 401 });

  // CSPRNG bilan bashoratlab bo'lmaydigan order ID. UUIDv4 (~122 bit entropy).
  const orderId = `sov_${crypto.randomUUID()}`;
  let amount = price.toFixed(2);
  const promo = normalizePromo(parsed.data.promo);
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;

  // Buyurtmani faqat server (service role) yozadi — foydalanuvchi summa/valyuta/
  // promokodni o'zi belgilay olmaydi (0028: "orders: own insert" olib tashlandi).
  let service: ReturnType<typeof createServiceClient>;
  try {
    service = createServiceClient();
  } catch (e) {
    console.error("[checkout/zeno] service client:", e);
    return Response.json({ error: t("chOrderNotCreated") }, { status: 500 });
  }

  if (promo) {
    const r = await resolvePromo(promo, user.id, price);
    if (!r.ok) return Response.json({ error: t(r.error) }, { status: 400 });
    amount = r.amount;
    // Tekshiruv + INSERT bitta tranzaksiyada (parallel so'rovlar limitni buzmaydi).
    const reserved = await reservePromoOrder({
      orderId,
      userId: user.id,
      plan: planId,
      amount,
      currency: "USD",
      provider: "zenobank",
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
      currency: "USD",
      status: "pending",
      provider: "zenobank",
      // Yillik: to'lov 365 kunga yoziladi (0025 migratsiyasi). Oylik ustunsiz ham ishlaydi.
      ...(period === "year" ? { billing_period: "year" } : {}),
    });
    if (insErr) {
      console.error("[checkout/zeno] order insert:", insErr.message);
      return Response.json(
        { error: period === "year" ? t("chYearlyUnavailable") : t("chOrderNotCreated") },
        { status: 500 },
      );
    }
  }

  try {
    const checkout = await zeno().checkouts.create({
      orderId,
      priceAmount: amount,
      priceCurrency: "USD",
      successRedirectUrl: `${origin.replace(/\/$/, "")}/app?paid=1`,
    });
    const { error: updErr } = await service.from("orders").update({ checkout_id: checkout.id }).eq("id", orderId);
    // Faqat solishtirish uchun — checkout baribir ishlayveradi.
    if (updErr) console.error("[checkout/zeno] checkout_id update:", updErr.message);
    return Response.json({ checkoutUrl: checkout.checkoutUrl, orderId, amount });
  } catch (e) {
    console.error("[checkout/zeno] create checkout:", e);
    await service.from("orders").update({ status: "cancelled" }).eq("id", orderId);
    return Response.json({ error: t("chPaymentNotCreated") }, { status: 502 });
  }
}
