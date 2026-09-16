import { zeno, ZENO_WEBHOOK_SECRET } from "@/lib/payments/zenobank";
import { createAnonClient } from "@/lib/supabase/anon";

export const runtime = "nodejs";

interface WebhookEvent {
  type: string;
  data: { orderId?: string; status?: string };
}

/** POST /api/webhooks/zenobank — verifies the Svix signature and applies payment. */
export async function POST(req: Request) {
  const rawBody = await req.text();

  if (ZENO_WEBHOOK_SECRET) {
    try {
      zeno().webhooks.verify({
        secret: ZENO_WEBHOOK_SECRET,
        rawBody,
        headers: Object.fromEntries(req.headers),
      });
    } catch {
      return Response.json({ error: "Invalid signature" }, { status: 401 });
    }
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
    const supabase = createAnonClient();
    if (event.type === "checkout.completed") {
      await supabase.rpc("apply_order_payment", { p_order_id: orderId });
    } else if (event.type === "checkout.expired") {
      await supabase.rpc("expire_order", { p_order_id: orderId });
    }
  } catch {
    // Return 200 anyway so ZenoBank doesn't hammer retries on a transient DB error;
    // reconciliation can be done via checkouts.get() polling.
  }
  return Response.json({ received: true });
}
