import { z } from "zod";
import { PLAN_BY_ID, isPlanId } from "@/config/plans";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { isZenoConfigured, zeno } from "@/lib/payments/zenobank";

export const runtime = "nodejs";

const schema = z.object({ plan: z.string() });

/** POST /api/checkout — creates a ZenoBank crypto checkout for a plan. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success || !isPlanId(parsed.data.plan) || parsed.data.plan === "free") {
    return Response.json({ error: "Noto'g'ri tarif" }, { status: 400 });
  }
  const planId = parsed.data.plan;
  const plan = PLAN_BY_ID[planId];

  if (!isSupabaseConfigured()) return Response.json({ error: "Supabase sozlanmagan" }, { status: 503 });
  if (!isZenoConfigured()) {
    return Response.json({ error: "To'lov hali sozlanmagan (ZENOBANK_API_KEY). Admin bilan bog'laning." }, { status: 503 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Avval tizimga kiring" }, { status: 401 });

  const orderId = `sov_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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
    await supabase.from("orders").update({ checkout_id: checkout.id }).eq("id", orderId);
    return Response.json({ checkoutUrl: checkout.checkoutUrl, orderId });
  } catch (e) {
    await supabase.from("orders").update({ status: "cancelled" }).eq("id", orderId);
    return Response.json({ error: e instanceof Error ? e.message : "To'lov yaratilmadi" }, { status: 502 });
  }
}
