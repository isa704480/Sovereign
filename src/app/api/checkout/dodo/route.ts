import { z } from "zod";
import { PLAN_BY_ID, isPlanId } from "@/config/plans";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createDodoCheckout, dodoMode, isDodoConfigured } from "@/lib/payments/dodo";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { getServerT } from "@/lib/i18n-server";

export const runtime = "nodejs";

const schema = z.object({ plan: z.string() });

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

  if (!isSupabaseConfigured()) return Response.json({ error: t("chSupabaseMissing") }, { status: 503 });
  if (!isDodoConfigured()) {
    return Response.json({ error: t("chCardNotConfigured") }, { status: 503 });
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
    amount: String(PLAN_BY_ID[planId].price),
    currency: "USD",
    status: "pending",
    provider: "dodo",
  });
  if (insErr) return Response.json({ error: t("chOrderNotCreated") }, { status: 500 });

  const origin = (process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin).replace(/\/$/, "");
  try {
    const checkout = await createDodoCheckout({
      plan: planId,
      email: user.email,
      name: (user.user_metadata?.full_name as string | undefined) ?? undefined,
      returnUrl: `${origin}/app?paid=1`,
      metadata: { user_id: user.id, plan: planId, order_id: orderId },
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
