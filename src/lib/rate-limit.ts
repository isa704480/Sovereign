import "server-only";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * Rate-limiter. Upstash Redis sozlangan bo'lsa (UPSTASH_REDIS_REST_URL +
 * UPSTASH_REDIS_REST_TOKEN) — hisob BARCHA Vercel instansiyalari uchun umumiy
 * (sliding window). Sozlanmagan yoki Redis javob bermasa — har instansiyaning
 * o'z xotirasidagi token-bucket (eski xatti-harakat). Sayt hech qachon Redis
 * tufayli yiqilmaydi.
 */
type Result = { ok: boolean; retryAfterMs: number };

// ---- Umumiy (Upstash) ---------------------------------------------------
const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN })
    : null;

/** Har (limit, oyna) juftligi uchun bitta limiter — qayta yaratmaslik uchun. */
const limiters = new Map<string, Ratelimit>();
function sharedLimiter(limit: number, windowMs: number): Ratelimit | null {
  if (!redis) return null;
  const id = `${limit}:${windowMs}`;
  let rl = limiters.get(id);
  if (!rl) {
    rl = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(limit, `${windowMs} ms`),
      prefix: "sov-rl",
      // Redis sekinlashsa so'rovni ushlab turmaymiz — pastdagi mahalliy limitga o'tamiz.
      timeout: 1000,
      analytics: false,
    });
    limiters.set(id, rl);
  }
  return rl;
}

// ---- Mahalliy (zaxira) --------------------------------------------------
type Bucket = { tokens: number; last: number };
const buckets = new Map<string, Bucket>();

function localLimit(key: string, limit: number, windowMs: number): Result {
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

/** Har `windowMs` ichida `limit` ta so'rovga ruxsat beradi (kalit bo'yicha). */
export async function rateLimit(key: string, limit: number, windowMs: number): Promise<Result> {
  const shared = sharedLimiter(limit, windowMs);
  if (shared) {
    try {
      const r = await shared.limit(key);
      return { ok: r.success, retryAfterMs: r.success ? 0 : Math.max(1, r.reset - Date.now()) };
    } catch (e) {
      console.error("[rate-limit] Upstash xato, mahalliy limitga o'tildi:", e instanceof Error ? e.message : e);
    }
  }
  return localLimit(key, limit, windowMs);
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
