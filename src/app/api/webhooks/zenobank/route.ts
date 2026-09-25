import { zeno, ZENO_WEBHOOK_SECRET } from "@/lib/payments/zenobank";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

interface CheckoutData {
  id?: string;
  orderId?: string;
  status?: string;
  priceAmount?: string;
  priceCurrency?: string;
  paidAmount?: string;
}

interface WebhookEvent {
  type: string;
  data: CheckoutData;
}

function money(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.round(n * 100) : NaN; // sentlarda — float xatosiz solishtirish
}

/**
 * Checkout summasi/valyutasi biz yozgan buyurtmaga mosmi va to'liq to'langanmi.
 * Payload'da summa bo'lmasa, checkout holati ZenoBank API'dan olinadi.
 */
async function paymentMatches(
  order: { amount: string; currency: string; checkout_id: string | null },
  data: CheckoutData,
): Promise<boolean> {
  let c: CheckoutData = data;
  if (!c.priceAmount || !c.priceCurrency) {
    const checkoutId = c.id ?? order.checkout_id;
    if (!checkoutId) return false;
    try {
      c = await zeno().checkouts.get(checkoutId);
    } catch (e) {
      console.error("[zenobank webhook] checkout fetch:", e);
      throw e; // 500 → ZenoBank qayta yuboradi
    }
  }
  if (c.orderId && data.orderId && c.orderId !== data.orderId) return false;
  if (c.status && c.status !== "COMPLETED") return false;
  if ((c.priceCurrency ?? "").toUpperCase() !== order.currency.toUpperCase()) return false;
  const price = money(c.priceAmount);
  if (Number.isNaN(price) || price !== money(order.amount)) return false;
  // paidAmount bo'lsa — to'liq to'lov bo'lishi shart.
  if (c.paidAmount !== undefined && c.paidAmount !== null) {
    const paid = money(c.paidAmount);
    if (Number.isNaN(paid) || paid < price) return false;
  }
  return true;
}

/**
 * POST /api/webhooks/zenobank — Svix imzosini majburiy tekshiradi, svix-id
 * bo'yicha takroriy yetkazishni o'tkazib yuboradi, buyurtma summasi/valyutasini
 * solishtiradi va to'lovni service-role client bilan qo'llaydi. Signature secret
 * unutilgan bo'lsa 500 qaytadi (fail-secure).
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

  let supabase: ReturnType<typeof createServiceClient>;
  try {
    // Payment RPClari faqat service_role uchun ochiq (migration 0010/0028).
    supabase = createServiceClient();
  } catch (e) {
    console.error("[zenobank webhook] service client:", e);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }

  if (event.type === "checkout.completed") {
    // Replay/duplicate himoyasi: har svix-id bir marta qo'llanadi.
    const svixId = req.headers.get("svix-id");
    if (!svixId) return Response.json({ error: "Missing svix-id" }, { status: 400 });
    const dedupeId = `zeno:${svixId}`;
    const { error: dupErr } = await supabase
      .from("webhook_events")
      .insert({ id: dedupeId, provider: "zenobank", type: event.type });
    if (dupErr) {
      if (dupErr.code === "23505") return Response.json({ received: true, duplicate: true });
      console.error("[zenobank webhook] dedupe insert:", dupErr.message);
      return Response.json({ error: "DB write failed" }, { status: 500 });
    }
    const release = async () => {
      // Qayta urinish o'tkazib yuborilmasin.
      await supabase.from("webhook_events").delete().eq("id", dedupeId);
    };

    try {
      const { data: order, error: selErr } = await supabase
        .from("orders")
        .select("id, amount, currency, provider, status, checkout_id")
        .eq("id", orderId)
        .maybeSingle();
      if (selErr) {
        console.error("[zenobank webhook] order select:", selErr.message);
        await release();
        return Response.json({ error: "DB read failed" }, { status: 500 });
      }
      if (!order || (order.provider && order.provider !== "zenobank")) {
        console.warn("[zenobank webhook] noma'lum buyurtma", { orderId });
        return Response.json({ received: true, skipped: "unknown_order" });
      }
      if (order.status === "paid") return Response.json({ received: true, duplicate: true });

      let ok: boolean;
      try {
        ok = await paymentMatches(order, event.data);
      } catch {
        await release();
        return Response.json({ error: "Checkout lookup failed" }, { status: 500 });
      }
      if (!ok) {
        console.warn("[zenobank webhook] mos kelmagan to'lov", {
          orderId,
          priceAmount: event.data.priceAmount,
          priceCurrency: event.data.priceCurrency,
          paidAmount: event.data.paidAmount,
        });
        return Response.json({ received: true, skipped: "mismatch" });
      }

      const { error } = await supabase.rpc("apply_order_payment", { p_order_id: orderId });
      if (error) {
        console.error("[zenobank webhook] apply_order_payment:", error.message);
        await release();
        // ZenoBank qayta urinib ko'rsin — 500 bilan; sabab bizning DB muammo
        return Response.json({ error: "DB write failed" }, { status: 500 });
      }
    } catch (e) {
      console.error("[zenobank webhook]", e);
      await release().catch(() => undefined);
      return Response.json({ error: "Internal error" }, { status: 500 });
    }
  } else if (event.type === "checkout.expired") {
    const { error } = await supabase.rpc("expire_order", { p_order_id: orderId });
    if (error) console.error("[zenobank webhook] expire_order:", error.message);
  }
  return Response.json({ received: true });
}
