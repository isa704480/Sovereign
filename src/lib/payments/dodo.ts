import "server-only";
import DodoPayments from "dodopayments";
import type { PlanId } from "@/config/plans";

type PaidPlan = Exclude<PlanId, "free">;

const PRODUCTS: Record<PaidPlan, string> = {
  starter: process.env.DODO_PRODUCT_BASIC ?? "pdt_0NnwEVzkwKYQDDfgiuyaF",
  pro: process.env.DODO_PRODUCT_PRO ?? "pdt_0NnwFHEVeh1n1A3JDO6Qw",
  ultra: process.env.DODO_PRODUCT_ULTRA ?? "pdt_0NnwFXmtCtqu32TNGKhU3",
};

export function planForDodoProduct(productId: string | undefined): PaidPlan | null {
  if (!productId) return null;
  const hit = (Object.entries(PRODUCTS) as [PaidPlan, string][]).find(([, id]) => id === productId);
  return hit ? hit[0] : null;
}

export function isDodoConfigured(): boolean {
  return Boolean(process.env.DODO_PAYMENTS_API_KEY);
}

/** "live" | "test" — also handed to the browser overlay so both sides agree. */
export function dodoMode(): "live" | "test" {
  return process.env.DODO_PAYMENTS_ENV === "test" ? "test" : "live";
}

let client: DodoPayments | null = null;
function dodo(): DodoPayments {
  if (!client) {
    client = new DodoPayments({
      bearerToken: process.env.DODO_PAYMENTS_API_KEY,
      environment: dodoMode() === "live" ? "live_mode" : "test_mode",
      webhookKey: process.env.DODO_PAYMENTS_WEBHOOK_SECRET ?? null,
    });
  }
  return client;
}

export async function createDodoCheckout(input: {
  plan: PaidPlan;
  email: string;
  name?: string;
  returnUrl: string;
  metadata: Record<string, string>;
}): Promise<{ sessionId: string; checkoutUrl: string }> {
  const session = await dodo().checkoutSessions.create({
    product_cart: [{ product_id: PRODUCTS[input.plan], quantity: 1 }],
    customer: { email: input.email, name: input.name || input.email.split("@")[0] },
    return_url: input.returnUrl,
    metadata: input.metadata,
  });
  if (!session.checkout_url) throw new Error("Dodo checkout_url qaytmadi");
  return { sessionId: session.session_id, checkoutUrl: session.checkout_url };
}

/**
 * Verifies the Standard Webhooks signature (id.timestamp.body, HMAC-SHA256,
 * 5-minute tolerance) via the official SDK. Throws on any mismatch.
 */
export function unwrapDodoWebhook(rawBody: string, headers: Headers): unknown {
  return dodo().webhooks.unwrap(rawBody, {
    headers: {
      "webhook-id": headers.get("webhook-id") ?? "",
      "webhook-signature": headers.get("webhook-signature") ?? "",
      "webhook-timestamp": headers.get("webhook-timestamp") ?? "",
    },
  });
}
