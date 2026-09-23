import { planForDodoProduct, unwrapDodoWebhook } from "@/lib/payments/dodo";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

interface DodoEvent {
  type?: string;
  data?: {
    subscription_id?: string;
    product_id?: string;
    next_billing_date?: string;
    metadata?: Record<string, string>;
    customer?: { email?: string };
  };
}

const ACTIVATING = new Set(["subscription.active", "subscription.renewed", "payment.succeeded"]);

/**
 * POST /api/webhooks/dodo — verifies the Standard Webhooks signature on the RAW
 * body, dedupes by webhook-id, then activates/extends the plan. Cancellation and
 * expiry need no action: the paid period simply runs out at plan_expires_at.
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
  if (!ACTIVATING.has(type)) return Response.json({ received: true });

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
  const plan = meta.plan ?? planForDodoProduct(data.product_id);

  let userId = meta.user_id;
  if (!userId && data.customer?.email) {
    const { data: prof } = await supabase.from("profiles").select("id").eq("email", data.customer.email).maybeSingle();
    userId = prof?.id;
  }
  if (!userId || !plan) return Response.json({ received: true, skipped: "unmatched" });

  // Paid through the next billing date (+1 day grace); fall back to 30 days.
  const next = data.next_billing_date ? new Date(data.next_billing_date) : null;
  const until =
    next && !Number.isNaN(next.getTime())
      ? new Date(next.getTime() + 24 * 3600 * 1000)
      : new Date(Date.now() + 30 * 24 * 3600 * 1000);

  const { error } = await supabase.rpc("apply_plan_until", {
    p_user_id: userId,
    p_plan: plan,
    p_until: until.toISOString(),
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
  }

  return Response.json({ received: true });
}
