import "server-only";

/**
 * Oddiy in-memory token-bucket rate-limiter. Vercel serverless muhitida
 * har konteyner o'z holatini olib yuradi (idempotency yo'q), lekin bu
 * cost-DoS'ni cheklashga hali ham katta ta'sir qiladi.
 *
 * Production'da Vercel KV / Upstash Redis'ga o'tkazish tavsiya etiladi.
 */
type Bucket = { tokens: number; last: number };
const buckets = new Map<string, Bucket>();

/** Har `windowMs` ichida `limit` ta so'rovga ruxsat beradi. */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { ok: boolean; retryAfterMs: number } {
  const now = Date.now();
  const b = buckets.get(key) ?? { tokens: limit, last: now };
  // Doldirish: o'tgan vaqtga proporsional tokenlar qaytadi.
  const refill = ((now - b.last) / windowMs) * limit;
  b.tokens = Math.min(limit, b.tokens + refill);
  b.last = now;
  if (b.tokens >= 1) {
    b.tokens -= 1;
    buckets.set(key, b);
    return { ok: true, retryAfterMs: 0 };
  }
  buckets.set(key, b);
  const retryAfterMs = Math.max(1, Math.ceil(((1 - b.tokens) / limit) * windowMs));
  return { ok: false, retryAfterMs };
}

/** Client IP ni Vercel / oldingi proxy sarlavhalaridan oladi. */
export function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

/** Periodik tozalash: 10 daqiqadan yosh bo'lgan bucketlarni saqlab, qolganini o'chirish. */
setInterval(() => {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [k, b] of buckets) if (b.last < cutoff) buckets.delete(k);
}, 5 * 60 * 1000).unref?.();
