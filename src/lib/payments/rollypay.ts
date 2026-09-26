import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * RollyPay — СБП / МИР kartalari (rubl) va kripto. Pul kassa balansiga USDT
 * bo'lib tushadi. Docs: https://docs.rollypay.io (payments, callbacks, rate).
 *
 * Env: ROLLYPAY_API_KEY (kassa api_key), ROLLYPAY_SIGNING_SECRET (kassa
 * signing_secret — webhook imzosi), ROLLYPAY_TEST=true — sandbox to'lovlar.
 * Webhook URL kassa sozlamasida: https://soveregn.xyz/api/webhooks/rollypay
 */
const BASE = (process.env.ROLLYPAY_BASE_URL ?? "https://api.rollypay.io/api/v1").replace(/\/$/, "");
/** Webhook vaqt tamg'asi shu oraliqdan eski bo'lsa — replay deb rad etiladi. */
const MAX_SKEW_SEC = 10 * 60;

export function isRollyConfigured(): boolean {
  return Boolean(process.env.ROLLYPAY_API_KEY && process.env.ROLLYPAY_SIGNING_SECRET);
}

export function rollyTestMode(): boolean {
  return process.env.ROLLYPAY_TEST === "true";
}

function headers(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-API-Key": process.env.ROLLYPAY_API_KEY!,
    "X-Nonce": crypto.randomUUID(),
  };
}

/** Joriy USDT/RUB kursi (masalan 93.89). 10 daqiqa keshlanadi; xato bo'lsa null. */
let rateCache: { rate: number; at: number } | null = null;
export async function rollyRate(): Promise<number | null> {
  if (rateCache && Date.now() - rateCache.at < 10 * 60_000) return rateCache.rate;
  try {
    const res = await fetch(`${BASE}/rate`, { headers: headers(), signal: AbortSignal.timeout(8_000) });
    const data = (await res.json().catch(() => ({}))) as { rate?: string };
    const rate = Number(data.rate);
    if (!res.ok || !Number.isFinite(rate) || rate < 10 || rate > 1000) return null;
    rateCache = { rate, at: Date.now() };
    return rate;
  } catch {
    return null;
  }
}

/**
 * sbp — rus foydalanuvchi uchun: usul yuborilmaydi, formada СБП yoki МИР kartasini
 * o'zi tanlaydi. crypto — to'g'ridan-to'g'ri kripto sahifasi.
 */
export type RollyMethod = "sbp" | "crypto";

export async function createRollyPayment(input: {
  method: RollyMethod;
  orderId: string;
  amountRub: number;
  description: string;
  customerId: string;
  successUrl: string;
  failUrl: string;
  metadata: Record<string, string>;
}): Promise<{ paymentId: string; payUrl: string }> {
  const res = await fetch(`${BASE}/payments`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      amount: input.amountRub.toFixed(2),
      payment_currency: "RUB",
      ...(input.method === "crypto" ? { payment_method: "crypto" } : {}),
      order_id: input.orderId,
      description: input.description,
      customer_id: input.customerId,
      success_redirect_url: input.successUrl,
      fail_redirect_url: input.failUrl,
      metadata: input.metadata,
      ...(rollyTestMode() ? { test: true } : {}),
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const data = (await res.json().catch(() => ({}))) as { payment_id?: string; pay_url?: string; error?: string; message?: string };
  if (!res.ok || !data.pay_url || !data.payment_id) {
    throw new Error(data.error ?? data.message ?? `RollyPay ${res.status}`);
  }
  return { paymentId: data.payment_id, payUrl: data.pay_url };
}

export interface RollyEvent {
  event_type?: string;
  payment_id?: string;
  order_id?: string;
  status?: string;
  amount?: string;
  currency?: string;
  test?: boolean;
  metadata?: Record<string, string>;
}

/**
 * X-Signature = hex(HMAC-SHA256(signing_secret, `${X-Timestamp}.${rawBody}`)).
 * Xom (qayta serializatsiya qilinmagan) body bilan tekshiriladi. Xato bo'lsa throw.
 */
export function verifyRollyWebhook(rawBody: string, headers: Headers): RollyEvent {
  const secret = process.env.ROLLYPAY_SIGNING_SECRET;
  const sig = headers.get("x-signature") ?? "";
  const ts = headers.get("x-timestamp") ?? "";
  if (!secret || !sig || !ts) throw new Error("missing signature");
  const age = Math.abs(Date.now() / 1000 - Number(ts));
  if (!Number.isFinite(age) || age > MAX_SKEW_SEC) throw new Error("stale timestamp");
  const expected = createHmac("sha256", secret).update(`${ts}.${rawBody}`).digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(sig.replace(/^sha256=/i, ""), "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("bad signature");
  return JSON.parse(rawBody) as RollyEvent;
}
