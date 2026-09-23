import { z } from "zod";
import { PLAN_BY_ID, isPlanId } from "@/config/plans";
import { grossPrice } from "@/config/payment-fees";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { isZenoConfigured, zeno } from "@/lib/payments/zenobank";
import { getServerT } from "@/lib/i18n-server";
import { normalizePromo, resolvePromo } from "@/lib/payments/promo";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const schema = z.object({ plan: z.string(), promo: z.string().max(64).optional() });

/** POST /api/checkout — creates a ZenoBank crypto checkout for a plan. */
export async function POST(req: Request) {
  const t = await getServerT();
  // Promokodlarni terib topishga (brute-force) qarshi.
  if (!rateLimit(`zeno-checkout:${clientIp(req)}`, 10, 60_000).ok) {
    return Response.json({ error: t("chTooManyRequests") }, { status: 429 });
  }
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success || !isPlanId(parsed.data.plan) || parsed.data.plan === "free") {
    return Response.json({ error: t("chBadPlan") }, { status: 400 });
  }
  const planId = parsed.data.plan;
  const plan = PLAN_BY_ID[planId];

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
  // ZenoBank 0.1% komissiyasi mijozga qo'shiladi — bizga tarif narxi to'liq tushadi.
  let amount = grossPrice(plan.price, "crypto").toFixed(2);
  let promoCode: string | null = null;
  const promo = normalizePromo(parsed.data.promo);
  if (promo) {
    const r = await resolvePromo(promo, user.id, plan.price);
    if (!r.ok) return Response.json({ error: t(r.error) }, { status: 400 });
    amount = r.amount;
    promoCode = r.code;
  }
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;

  const { error: insErr } = await supabase.from("orders").insert({
    id: orderId,
    user_id: user.id,
    plan: planId,
    amount,
    currency: "USD",
    status: "pending",
    ...(promoCode ? { promo_code: promoCode } : {}),
  });
  if (insErr) {
    // promo_code ustuni yo'q bo'lsa (0024 migratsiya ishga tushirilmagan)
    return Response.json({ error: promoCode ? t("chPromoUnavailable") : insErr.message }, { status: 500 });
  }

  try {
    const checkout = await zeno().checkouts.create({
      orderId,
      priceAmount: amount,
      priceCurrency: "USD",
      successRedirectUrl: `${origin.replace(/\/$/, "")}/app?paid=1`,
    });
    // orders UPDATE policy yo'q — service-role bilan yozamiz
    try {
      const service = createServiceClient();
      await service.from("orders").update({ checkout_id: checkout.id }).eq("id", orderId);
    } catch {
      /* fallback — checkout ishlayveradi, faqat webhook reconciliation susayadi */
    }
    return Response.json({ checkoutUrl: checkout.checkoutUrl, orderId, amount });
  } catch (e) {
    await supabase.from("orders").update({ status: "cancelled" }).eq("id", orderId);
    return Response.json({ error: e instanceof Error ? e.message : t("chPaymentNotCreated") }, { status: 502 });
  }
}
