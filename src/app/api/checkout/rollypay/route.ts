import { z } from "zod";
import { PLAN_BY_ID, isBillingPeriod, isPlanId, planPriceRub } from "@/config/plans";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createRollyPayment, isRollyConfigured } from "@/lib/payments/rollypay";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { getServerT } from "@/lib/i18n-server";

export const runtime = "nodejs";

const schema = z.object({ plan: z.string(), period: z.string().optional() });

/** POST /api/checkout/rollypay — Rossiya uchun СБП (rubl) to'lov sahifasi. */
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
  const amountRub = planPriceRub(plan, period);

  if (!isSupabaseConfigured()) return Response.json({ error: t("chSupabaseMissing") }, { status: 503 });
  if (!isRollyConfigured() || amountRub <= 0) {
    return Response.json({ error: t("chSbpNotConfigured") }, { status: 503 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: t("chLoginFirst") }, { status: 401 });

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
  const { error: insErr } = await service.from("orders").insert({
    id: orderId,
    user_id: user.id,
    plan: planId,
    amount: amountRub.toFixed(2),
    currency: "RUB",
    status: "pending",
    provider: "rollypay",
    ...(period === "year" ? { billing_period: "year" } : {}),
  });
  if (insErr) {
    console.error("[checkout/rollypay] order insert:", insErr.message);
    return Response.json({ error: t("chOrderNotCreated") }, { status: 500 });
  }

  const origin = (process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin).replace(/\/$/, "");
  try {
    const pay = await createRollyPayment({
      orderId,
      amountRub,
      description: `SOVEREIGN ${plan.name} — ${period === "year" ? "12 мес." : "1 мес."}`,
      customerId: user.id,
      successUrl: `${origin}/app?paid=1`,
      failUrl: `${origin}/app?paid=0`,
      metadata: { user_id: user.id, plan: planId, period },
    });
    try {
      await service.from("orders").update({ checkout_id: pay.paymentId }).eq("id", orderId);
    } catch {
      /* faqat solishtirish uchun */
    }
    return Response.json({ checkoutUrl: pay.payUrl, orderId });
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
