import { zeno, ZENO_WEBHOOK_SECRET } from "@/lib/payments/zenobank";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

interface WebhookEvent {
  type: string;
  data: { orderId?: string; status?: string };
}

/**
 * POST /api/webhooks/zenobank — Svix imzosini majburiy tekshiradi va
 * to'lovni service-role client bilan qo'llaydi. Signature secret unutilgan
 * bo'lsa 500 qaytadi (fail-secure) — anonim kim bo'lishidan qat'i nazar
 * hech qachon payment RPC chaqirilmaydi.
 */
export async function POST(req: Request) {
  const rawBody = await req.text();

  if (!ZENO_WEBHOOK_SECRET) {
    // Fail-secure: xavfsiz imzosiz webhook qabul qilishga ruxsat berilmaydi.
    return Response.json({ error: "Webhook misconfigured" }, { status: 500 });
  }
  try {
    zeno().webhooks.verify({
      secret: ZENO_WEBHOOK_SECRET,
      rawBody,
      headers: Object.fromEntries(req.headers),
    });
  } catch {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: WebhookEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "Bad payload" }, { status: 400 });
  }

  const orderId = event.data?.orderId;
  if (!orderId) return Response.json({ received: true });

  try {
    // Payment RPClari faqat service_role uchun ochiq (migration 0010).
    const supabase = createServiceClient();
    if (event.type === "checkout.completed") {
      const { error } = await supabase.rpc("apply_order_payment", { p_order_id: orderId });
      if (error) {
        // ZenoBank qayta urinib ko'rsin — 500 bilan; sabab bizning DB muammo
        return Response.json({ error: "DB write failed" }, { status: 500 });
      }
    } else if (event.type === "checkout.expired") {
      await supabase.rpc("expire_order", { p_order_id: orderId });
    }
  } catch {
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
  return Response.json({ received: true });
}
