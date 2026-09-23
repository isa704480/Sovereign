import { rollyTestMode, verifyRollyWebhook, type RollyEvent } from "@/lib/payments/rollypay";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

/**
 * POST /api/webhooks/rollypay — imzoni xom body bilan tekshiradi, takroriy
 * yetkazishni o'tkazib yuboradi, so'ng buyurtma summasi/valyutasini solishtirib
 * tarifni ochadi (apply_order_payment: oylik 30 kun, yillik 365 kun).
 * RollyPay 2xx kutadi (10 soniya), aks holda 8 martagacha qayta yuboradi.
 */
export async function POST(req: Request) {
  const rawBody = await req.text();
  let event: RollyEvent;
  try {
    event = verifyRollyWebhook(rawBody, req.headers);
  } catch {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  // Sandbox to'lovi production'da tarif ochmasin.
  if (event.test && !rollyTestMode()) return Response.json({ received: true, skipped: "test" });

  const orderId = event.order_id;
  const type = event.event_type ?? "";
  if (!orderId) return Response.json({ received: true });

  const supabase = createServiceClient();

  if (type === "payment.paid") {
    // Takroriy yetkazish: bir to'lov bir marta qo'llanadi.
    const dedupeId = `rolly:${event.payment_id ?? orderId}:${type}`;
    const { error: dupErr } = await supabase.from("webhook_events").insert({ id: dedupeId, provider: "rollypay", type });
    if (dupErr) {
      if (dupErr.code === "23505") return Response.json({ received: true, duplicate: true });
      return Response.json({ error: "DB write failed" }, { status: 500 });
    }

    const { data: order } = await supabase
      .from("orders")
      .select("id, amount, currency, provider, status")
      .eq("id", orderId)
      .maybeSingle();
    // Faqat o'zimiz yaratgan, summasi va valyutasi mos buyurtma.
    const amountOk = order && Number(order.amount).toFixed(2) === Number(event.amount ?? NaN).toFixed(2);
    if (!order || order.provider !== "rollypay" || order.currency !== (event.currency ?? "RUB") || !amountOk) {
      console.warn("[rollypay] mos kelmagan to'lov", { orderId, amount: event.amount, currency: event.currency });
      return Response.json({ received: true, skipped: "mismatch" });
    }

    const { error } = await supabase.rpc("apply_order_payment", { p_order_id: orderId });
    if (error) {
      await supabase.from("webhook_events").delete().eq("id", dedupeId); // qayta urinish o'tkazib yuborilmasin
      return Response.json({ error: "DB write failed" }, { status: 500 });
    }
    return Response.json({ received: true });
  }

  if (type === "payment.canceled" || type === "payment.expired") {
    await supabase.rpc("expire_order", { p_order_id: orderId });
  }
  return Response.json({ received: true });
}
