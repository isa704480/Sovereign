import { after } from "next/server";
import { sendPaymentReviewAlert } from "@/lib/econ/budget.server";
import { dodoProductId, retrieveDodoPayment, retrieveDodoSubscription, unwrapDodoWebhook } from "@/lib/payments/dodo";
import { decideDodoActivation, revokeOrderMatches, type DodoOrderRow } from "@/lib/payments/dodo-activation";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

interface DodoEvent {
  type?: string;
  data?: {
    subscription_id?: string;
    /** payment.* / refund.* / dispute.* event'larida. */
    payment_id?: string;
    /** subscription.* event'larida (Dodo obunasining o'zi). */
    product_id?: string;
    next_billing_date?: string;
    metadata?: Record<string, string>;
  };
}

const ACTIVATING = new Set(["subscription.active", "subscription.renewed", "payment.succeeded"]);
/** Pul qaytdi yoki bank bahsida yutqazildi — berilgan muddat qaytarib olinadi (0033). */
const REVOKING = new Set(["refund.succeeded", "dispute.lost", "dispute.accepted"]);

const ORDER_COLS = "id, user_id, plan, billing_period, status, provider, checkout_id";

/**
 * POST /api/webhooks/dodo — verifies the Standard Webhooks signature on the RAW
 * body, dedupes by webhook-id, then activates/extends the plan (tier-aware, 0033).
 * Refund / lost dispute → revoke_order_payment. Cancellation and expiry need no
 * action: the paid period simply runs out at plan_expires_at.
 *
 * Metadata (plan/period/user_id/order_id) xaridor qo'lida (Dodo static link'da
 * `metadata_*` query) — foydalanuvchi, tarif va davr FAQAT server yaratgan
 * buyurtmadan, mahsulot va muddat esa Dodo obunasidan olinadi (dodo-activation.ts).
 * Mos kelmagan hodisa tarif ochmaydi: webhook_events.type = "review:..." bo'lib
 * qoladi (qo'lda ko'rib chiqish uchun).
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

  const webhookId = req.headers.get("webhook-id")!;
  // Replay/duplicate protection: each webhook-id is processed once.
  const { error: dupErr } = await supabase
    .from("webhook_events")
    .insert({ id: webhookId, provider: "dodo", type });
  if (dupErr) {
    if (dupErr.code === "23505") return Response.json({ received: true, duplicate: true });
    console.error("[dodo webhook] dedupe insert:", dupErr);
    // Kalit/ruxsat muammosini ajratib ko'rsatamiz (maxfiy ma'lumotsiz).
    return Response.json({ error: "DB write failed", step: "dedupe", code: dupErr.code ?? null }, { status: 500 });
  }

  const data = event.data ?? {};
  const meta = data.metadata ?? {};
  const releaseDedupe = () => supabase.from("webhook_events").delete().eq("id", webhookId);
  /** Qo'lda ko'rib chiqish belgisi (jadval o'zgarmaydi): select * from webhook_events where type like 'review:%'. */
  const markReview = async (note: string) => {
    const { error } = await supabase
      .from("webhook_events")
      .update({ type: `review:${type}:${note}`.slice(0, 300) })
      .eq("id", webhookId);
    if (error) console.error("[dodo webhook] review mark:", error.message);
    // Founder'ga alert (Telegram/email) — javobdan keyin, webhook'ni kechiktirmaydi.
    const alert = () => sendPaymentReviewAlert(`${type} — ${note}`).then(() => undefined);
    try {
      after(alert);
    } catch {
      void alert();
    }
  };

  if (REVOKING.has(type)) {
    const paymentId = data.payment_id;
    if (!paymentId) {
      console.error("[dodo webhook] refund/dispute payment_id'siz", { type });
      await markReview("no_payment_id");
      return Response.json({ received: true, skipped: "no payment_id" });
    }
    let orderId: string | undefined;
    let subscriptionId: string | undefined;
    const { data: byPayment } = await supabase
      .from("orders")
      .select("id")
      .eq("provider", "dodo")
      .eq("provider_payment_id", paymentId)
      .limit(1)
      .maybeSingle();
    orderId = byPayment?.id as string | undefined;
    if (!orderId) {
      // Eski buyurtmalarda payment_id saqlanmagan — to'lovning o'zidan topamiz.
      try {
        const pay = await retrieveDodoPayment(paymentId);
        subscriptionId = pay.subscriptionId;
        if (subscriptionId) {
          // Birinchi faollashuvda buyurtma shu obunaga bog'langan (checkout_id).
          const { data: bySub } = await supabase
            .from("orders")
            .select("id")
            .eq("provider", "dodo")
            .eq("checkout_id", subscriptionId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          orderId = bySub?.id as string | undefined;
        }
        if (!orderId && pay.orderId) {
          // metadata.order_id xaridor qo'lida — faqat Dodo buyurtmasi va shu obunaga bog'langan bo'lsa.
          const { data: byMeta } = await supabase
            .from("orders")
            .select("id, provider, checkout_id")
            .eq("id", pay.orderId)
            .maybeSingle();
          if (byMeta && revokeOrderMatches(byMeta as Pick<DodoOrderRow, "provider" | "checkout_id">, subscriptionId)) {
            orderId = byMeta.id as string;
          }
        }
      } catch (e) {
        console.error("[dodo webhook] payment lookup:", e);
        await releaseDedupe();
        return Response.json({ error: "Payment lookup failed" }, { status: 500 });
      }
    }
    if (!orderId) {
      // Jim 200 emas: qo'lda qaytarib olish uchun belgi qoldiramiz.
      console.error("[dodo webhook] refund/dispute uchun buyurtma topilmadi — qo'lda ko'rib chiqing", {
        type,
        paymentId,
        subscriptionId: subscriptionId ?? null,
      });
      await markReview(`order_not_found:${paymentId}:${subscriptionId ?? "-"}`);
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

  // ── Faollashtirish ─────────────────────────────────────────────
  const subscriptionId = data.subscription_id;
  let paidProductId: string | undefined;
  let nextBillingDate: string | undefined;
  if (type.startsWith("subscription.")) {
    paidProductId = data.product_id;
    nextBillingDate = data.next_billing_date;
  } else if (subscriptionId) {
    // payment.* da product_id / next_billing_date yo'q — Dodo obunasidan olamiz (metadata'dan emas).
    try {
      const sub = await retrieveDodoSubscription(subscriptionId);
      paidProductId = sub.productId;
      nextBillingDate = sub.nextBillingDate;
    } catch (e) {
      console.error("[dodo webhook] subscription lookup:", e);
      await releaseDedupe();
      return Response.json({ error: "Subscription lookup failed" }, { status: 500 });
    }
  }

  // Buyurtma: metadata.order_id (keyin tekshiriladi) yoki shu obunaga bog'langan buyurtma.
  let order: DodoOrderRow | null = null;
  const metaOrderId = typeof meta.order_id === "string" && meta.order_id ? meta.order_id : undefined;
  if (metaOrderId || subscriptionId) {
    const q = supabase.from("orders").select(ORDER_COLS);
    const { data: row, error: ordErr } = metaOrderId
      ? await q.eq("id", metaOrderId).maybeSingle()
      : await q
          .eq("provider", "dodo")
          .eq("checkout_id", subscriptionId!)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
    if (ordErr) {
      console.error("[dodo webhook] order lookup:", ordErr.message);
      await releaseDedupe();
      return Response.json({ error: "DB read failed", step: "order" }, { status: 500 });
    }
    order = (row as DodoOrderRow | null) ?? null;
  }

  const decision = decideDodoActivation({
    order,
    metaUserId: typeof meta.user_id === "string" ? meta.user_id : null,
    subscriptionId,
    paidProductId,
    nextBillingDate,
    expectedProductId: dodoProductId,
    now: Date.now(),
  });
  if (!decision.ok) {
    console.error("[dodo webhook] faollashtirish rad etildi — qo'lda ko'rib chiqing", {
      type,
      reason: decision.reason,
      orderId: order?.id ?? metaOrderId ?? null,
      subscriptionId: subscriptionId ?? null,
      paymentId: data.payment_id ?? null,
    });
    await markReview(`${decision.reason}:${order?.id ?? metaOrderId ?? "-"}:${subscriptionId ?? "-"}`);
    return Response.json({ received: true, skipped: decision.reason });
  }
  const orderId = order!.id;

  if (decision.bind) {
    // Birinchi faollashuv: buyurtma shu obunaga bog'lanadi (atomik — faqat pending'dan).
    const { data: bound, error: bindErr } = await supabase
      .from("orders")
      .update({ status: "paid", paid_at: new Date().toISOString(), checkout_id: subscriptionId })
      .eq("id", orderId)
      .eq("status", "pending")
      .select("id");
    if (bindErr) {
      console.error("[dodo webhook] order bind:", bindErr.message);
      await releaseDedupe();
      return Response.json({ error: "DB write failed", step: "bind" }, { status: 500 });
    }
    if (!bound?.length) {
      // Parallel event bog'lagan bo'lishi mumkin — faqat aynan shu obunaga bo'lsa davom etamiz.
      const { data: again } = await supabase.from("orders").select("status, checkout_id").eq("id", orderId).maybeSingle();
      if (!again || again.status !== "paid" || again.checkout_id !== subscriptionId) {
        console.error("[dodo webhook] buyurtma boshqa obunaga bog'langan", { type, orderId, subscriptionId });
        await markReview(`bind_conflict:${orderId}:${subscriptionId ?? "-"}`);
        return Response.json({ received: true, skipped: "bind_conflict" });
      }
    }
  }

  const { error } = await supabase.rpc("apply_plan_until", {
    p_user_id: decision.userId,
    p_plan: decision.plan,
    p_until: decision.untilIso,
    // Refund'da oldingi holatni tiklash uchun buyurtmaga yoziladi (0033).
    p_order_id: orderId,
  });
  if (error) {
    console.error("[dodo webhook] apply_plan_until:", error);
    // Let Dodo retry: drop the dedupe row so the retry is not skipped.
    await releaseDedupe();
    return Response.json({ error: "DB write failed", step: "apply_plan", code: error.code ?? null }, { status: 500 });
  }

  // Refund/dispute kelganda buyurtmani topish uchun oxirgi to'lov id'si.
  if (data.payment_id) {
    await supabase.from("orders").update({ provider_payment_id: data.payment_id }).eq("id", orderId);
  }

  return Response.json({ received: true });
}
