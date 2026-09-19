import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { PlanId } from "@/config/plans";

type PaidPlan = Exclude<PlanId, "free">;

const PRODUCTS: Record<PaidPlan, string> = {
  starter: process.env.DODO_PRODUCT_BASIC ?? "pdt_0NnwEVzkwKYQDDfgiuyaF",
  pro: process.env.DODO_PRODUCT_PRO ?? "pdt_0NnwFHEVeh1n1A3JDO6Qw",
  ultra: process.env.DODO_PRODUCT_ULTRA ?? "pdt_0NnwFXmtCtqu32TNGKhU3",
};

export function dodoProductFor(plan: PaidPlan): string {
  return PRODUCTS[plan];
}

export function planForDodoProduct(productId: string | undefined): PaidPlan | null {
  if (!productId) return null;
  const hit = (Object.entries(PRODUCTS) as [PaidPlan, string][]).find(([, id]) => id === productId);
  return hit ? hit[0] : null;
}

export function isDodoConfigured(): boolean {
  return Boolean(process.env.DODO_PAYMENTS_API_KEY);
}

function baseUrl(): string {
  return process.env.DODO_PAYMENTS_ENV === "live" ? "https://live.dodopayments.com" : "https://test.dodopayments.com";
}

export async function createDodoCheckout(input: {
  plan: PaidPlan;
  email: string;
  name?: string;
  returnUrl: string;
  metadata: Record<string, string>;
}): Promise<{ sessionId: string; checkoutUrl: string }> {
  const res = await fetch(`${baseUrl()}/checkouts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.DODO_PAYMENTS_API_KEY}`,
    },
    body: JSON.stringify({
      product_cart: [{ product_id: dodoProductFor(input.plan), quantity: 1 }],
      customer: { email: input.email, name: input.name || input.email.split("@")[0] },
      return_url: input.returnUrl,
      metadata: input.metadata,
    }),
  });
  if (!res.ok) {
    throw new Error(`Dodo checkout ${res.status}`);
  }
  const data = (await res.json()) as { session_id?: string; checkout_url?: string };
  if (!data.checkout_url || !data.session_id) throw new Error("Dodo checkout_url qaytmadi");
  return { sessionId: data.session_id, checkoutUrl: data.checkout_url };
}

/**
 * Standard Webhooks signature check: HMAC-SHA256 over "id.timestamp.rawBody"
 * with the base64 secret (optional "whsec_" prefix). Header carries one or more
 * space-separated "v1,<base64>" signatures. Rejects timestamps older than 5 min.
 */
export function verifyDodoWebhook(rawBody: string, headers: Headers, secret: string): boolean {
  const id = headers.get("webhook-id");
  const ts = headers.get("webhook-timestamp");
  const sigHeader = headers.get("webhook-signature");
  if (!id || !ts || !sigHeader) return false;

  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum) || Math.abs(Date.now() / 1000 - tsNum) > 300) return false;

  const key = Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64");
  const expected = createHmac("sha256", key).update(`${id}.${ts}.${rawBody}`).digest();

  return sigHeader.split(" ").some((part) => {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) return false;
    const given = Buffer.from(sig, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}
