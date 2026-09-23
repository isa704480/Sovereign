import { z } from "zod";
import { PLAN_BY_ID, isBillingPeriod, isPlanId, planPrice } from "@/config/plans";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createDodoCheckout, dodoMode, dodoProductId, isDodoConfigured } from "@/lib/payments/dodo";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { normalizePromo } from "@/lib/payments/promo";
import { getServerT } from "@/lib/i18n-server";

export const runtime = "nodejs";

const schema = z.object({ plan: z.string(), period: z.string().optional(), promo: z.string().max(64).optional() });

/** POST /api/checkout/dodo — card subscription checkout via Dodo Payments. */
export async function POST(req: Request) {
  const t = await getServerT();
  const rl = rateLimit(`dodo-checkout:${clientIp(req)}`, 10, 60_000);
  if (!rl.ok) return Response.json({ error: t("chTooManyAttempts") }, { status: 429 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !isPlanId(parsed.data.plan) || parsed.data.plan === "free") {
    return Response.json({ error: t("chBadPlan") }, { status: 400 });
  }
  const planId = parsed.data.plan;
  const period = isBillingPeriod(parsed.data.period) ? parsed.data.period : "month";
  const promo = normalizePromo(parsed.data.promo);

  if (!isSupabaseConfigured()) return Response.json({ error: t("chSupabaseMissing") }, { status: 503 });
  if (!isDodoConfigured()) {
    return Response.json({ error: t("chCardNotConfigured") }, { status: 503 });
  }
  if (!dodoProductId(planId, period)) {
    return Response.json({ error: t("chYearlyUnavailable") }, { status: 503 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return Response.json({ error: t("chLoginFirst") }, { status: 401 });

  const orderId = `sov_${crypto.randomUUID()}`;
  const { error: insErr } = await supabase.from("orders").insert({
    id: orderId,
    user_id: user.id,
    plan: planId,
    amount: planPrice(PLAN_BY_ID[planId], period).toFixed(2),
    currency: "USD",
    status: "pending",
    provider: "dodo",
    // Oylik buyurtma ustunsiz ham yoziladi (0025 migratsiyasidan oldin ham ishlaydi).
    ...(period === "year" ? { billing_period: "year" } : {}),
  });
  if (insErr) return Response.json({ error: t("chOrderNotCreated") }, { status: 500 });

  const origin = (process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin).replace(/\/$/, "");
  try {
    const checkout = await createDodoCheckout({
      plan: planId,
      period,
      email: user.email,
      name: (user.user_metadata?.full_name as string | undefined) ?? undefined,
      returnUrl: `${origin}/app?paid=1`,
      metadata: { user_id: user.id, plan: planId, order_id: orderId, period, ...(promo ? { promo } : {}) },
      ...(promo ? { discountCode: promo } : {}),
    });
    try {
      await createServiceClient().from("orders").update({ checkout_id: checkout.sessionId }).eq("id", orderId);
    } catch {
      /* reconciliation-only field */
    }
    return Response.json({ checkoutUrl: checkout.checkoutUrl, orderId, mode: dodoMode() });
  } catch (e) {
    try {
      await createServiceClient().from("orders").update({ status: "cancelled" }).eq("id", orderId);
    } catch {
      /* ignore */
    }
    // Promokod Dodo'da yo'q / muddati o'tgan / limiti tugagan → Dodo 4xx qaytaradi.
    const status = (e as { status?: number }).status;
    if (promo && status && status >= 400 && status < 500 && status !== 403) {
      return Response.json({ error: t("chPromoInvalid") }, { status: 400 });
    }
    // 403 = Dodo hasn't enabled live payments for the merchant yet (verification pending).
    if ((e as { status?: number }).status === 403) {
      return Response.json(
        { error: t("chCardSoon") },
        { status: 503 },
      );
    }
    return Response.json({ error: t("chCheckoutPageFailed") }, { status: 502 });
  }
}
