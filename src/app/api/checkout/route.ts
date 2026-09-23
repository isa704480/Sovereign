import { z } from "zod";
import { PLAN_BY_ID, isPlanId } from "@/config/plans";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { isZenoConfigured, zeno } from "@/lib/payments/zenobank";
import { getServerT } from "@/lib/i18n-server";

export const runtime = "nodejs";

const schema = z.object({ plan: z.string() });

/** POST /api/checkout — creates a ZenoBank crypto checkout for a plan. */
export async function POST(req: Request) {
  const t = await getServerT();
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
  const amount = String(plan.price);
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;

  const { error: insErr } = await supabase.from("orders").insert({
    id: orderId,
    user_id: user.id,
    plan: planId,
    amount,
    currency: "USD",
    status: "pending",
  });
  if (insErr) return Response.json({ error: insErr.message }, { status: 500 });

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
    return Response.json({ checkoutUrl: checkout.checkoutUrl, orderId });
  } catch (e) {
    await supabase.from("orders").update({ status: "cancelled" }).eq("id", orderId);
    return Response.json({ error: e instanceof Error ? e.message : t("chPaymentNotCreated") }, { status: 502 });
  }
}
