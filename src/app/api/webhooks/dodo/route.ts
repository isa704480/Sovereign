import { planForDodoProduct, retrieveDodoPayment, unwrapDodoWebhook } from "@/lib/payments/dodo";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

interface DodoEvent {
  type?: string;
  data?: {
    subscription_id?: string;
    /** payment.* / refund.* / dispute.* event'larida. */
    payment_id?: string;
    product_id?: string;
    /** payment.* event'larida mahsulot shu yerda keladi (product_id emas). */
    product_cart?: { product_id?: string }[];
    next_billing_date?: string;
    metadata?: Record<string, string>;
    customer?: { email?: string };
  };
}

function isPaidPlan(v: unknown): v is "starter" | "pro" | "ultra" {
  return v === "starter" || v === "pro" || v === "ultra";
}

const ACTIVATING = new Set(["subscription.active", "subscription.renewed", "payment.succeeded"]);
/** Pul qaytdi yoki bank bahsida yutqazildi — berilgan muddat qaytarib olinadi (0033). */
const REVOKING = new Set(["refund.succeeded", "dispute.lost", "dispute.accepted"]);

/**
 * POST /api/webhooks/dodo — verifies the Standard Webhooks signature on the RAW
 * body, dedupes by webhook-id, then activates/extends the plan (tier-aware, 0033).
 * Refund / lost dispute → revoke_order_payment. Cancellation and expiry need no
 * action: the paid period simply runs out at plan_expires_at.
 */
export async function POST(req: Request) {
  const secret = process.env.DODO_PAYMENTS_WEBHOOK_SECRET;
  if (!secret) return Response.json({ error: "Webhook misconfigured" }, { status: 500 });

  const rawBody = await req.text();
  let event: DodoEvent;
  try {
    event = unwrapDodoWebhook(rawBody, req.headers) as DodoEvent;
  } catch {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  const type = event.type ?? "";
  if (!ACTIVATING.has(type) && !REVOKING.has(type)) return Response.json({ received: true });

  let supabase: ReturnType<typeof createServiceClient>;
  try {
    supabase = createServiceClient();
  } catch (e) {
    console.error("[dodo webhook] service client:", e);
    return Response.json({ error: "Service role key missing" }, { status: 500 });
  }

  // Replay/duplicate protection: each webhook-id is processed once.
  const { error: dupErr } = await supabase
    .from("webhook_events")
    .insert({ id: req.headers.get("webhook-id")!, provider: "dodo", type });
  if (dupErr) {
    if (dupErr.code === "23505") return Response.json({ received: true, duplicate: true });
    console.error("[dodo webhook] dedupe insert:", dupErr);
    // Kalit/ruxsat muammosini ajratib ko'rsatamiz (maxfiy ma'lumotsiz).
    return Response.json({ error: "DB write failed", step: "dedupe", code: dupErr.code ?? null }, { status: 500 });
  }

  const data = event.data ?? {};
  const meta = data.metadata ?? {};
  const releaseDedupe = () => supabase.from("webhook_events").delete().eq("id", req.headers.get("webhook-id")!);

  if (REVOKING.has(type)) {
    const paymentId = data.payment_id;
    if (!paymentId) return Response.json({ received: true, skipped: "no payment_id" });
    let orderId: string | undefined;
    const { data: byPayment } = await supabase.from("orders").select("id").eq("provider_payment_id", paymentId).maybeSingle();
    orderId = byPayment?.id as string | undefined;
    if (!orderId) {
      // Eski buyurtmalarda payment_id saqlanmagan — to'lovning o'zidan topamiz.
      try {
        const pay = await retrieveDodoPayment(paymentId);
        orderId = pay.orderId;
        if (!orderId && pay.subscriptionId) {
          const { data: bySub } = await supabase
            .from("orders")
            .select("id")
            .eq("provider", "dodo")
            .eq("checkout_id", pay.subscriptionId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          orderId = bySub?.id as string | undefined;
        }
      } catch (e) {
        console.error("[dodo webhook] payment lookup:", e);
        await releaseDedupe();
        return Response.json({ error: "Payment lookup failed" }, { status: 500 });
      }
    }
    if (!orderId) {
      console.warn("[dodo webhook] refund/dispute uchun buyurtma topilmadi", { type, paymentId });
      return Response.json({ received: true, skipped: "order not found" });
    }
    const { error: revErr } = await supabase.rpc("revoke_order_payment", { p_order_id: orderId });
    if (revErr) {
      console.error("[dodo webhook] revoke_order_payment:", revErr);
      await releaseDedupe();
      return Response.json({ error: "DB write failed", step: "revoke" }, { status: 500 });
    }
    return Response.json({ received: true, revoked: orderId });
  }
  // Haqiqatda to'langan mahsulot ustun: metadata.plan faqat mahsulot noma'lum bo'lsa.
  const productPlan = planForDodoProduct(data.product_id ?? data.product_cart?.[0]?.product_id);
  const plan = productPlan ?? (isPaidPlan(meta.plan) ? meta.plan : null);

  let userId = meta.user_id;
  if (!userId && data.customer?.email) {
    // profiles.email'ni foydalanuvchi o'zi o'zgartira olmaydi (0028 trigger) —
    // shu bois bu qidiruvni birovning emailiga "ulanib" o'g'irlab bo'lmaydi.
    const { data: prof } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", data.customer.email.trim().toLowerCase())
      .maybeSingle();
    userId = prof?.id;
  }
  if (!userId || !plan) return Response.json({ received: true, skipped: "unmatched" });

  // Paid through the next billing date (+1 day grace); fall back to 30 days (yearly: 366).
  const next = data.next_billing_date ? new Date(data.next_billing_date) : null;
  const until =
    next && !Number.isNaN(next.getTime())
      ? new Date(next.getTime() + 24 * 3600 * 1000)
      : new Date(Date.now() + (meta.period === "year" ? 366 : 30) * 24 * 3600 * 1000);

  const { error } = await supabase.rpc("apply_plan_until", {
    p_user_id: userId,
    p_plan: plan,
    p_until: until.toISOString(),
    // Refund'da oldingi holatni tiklash uchun buyurtmaga yoziladi (0033).
    p_order_id: meta.order_id ?? null,
  });
  if (error) {
    console.error("[dodo webhook] apply_plan_until:", error);
    // Let Dodo retry: drop the dedupe row so the retry is not skipped.
    await supabase.from("webhook_events").delete().eq("id", req.headers.get("webhook-id")!);
    return Response.json({ error: "DB write failed", step: "apply_plan", code: error.code ?? null }, { status: 500 });
  }

  if (meta.order_id) {
    await supabase
      .from("orders")
      .update({ status: "paid", paid_at: new Date().toISOString(), checkout_id: data.subscription_id ?? null })
      .eq("id", meta.order_id)
      .neq("status", "paid");
    // Refund/dispute kelganda buyurtmani topish uchun oxirgi to'lov id'si.
    if (data.payment_id) {
      await supabase.from("orders").update({ provider_payment_id: data.payment_id }).eq("id", meta.order_id);
    }
  }

  return Response.json({ received: true });
}
