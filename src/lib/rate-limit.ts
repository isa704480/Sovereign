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

/**
 * Production'da Upstash sozlanmagan bo'lsa — har Vercel instansiyasi o'z xotira hisobini
 * yuritadi (limitlar instansiyalar soniga ko'payadi). Bir martalik baland ogohlantirish.
 */
let warnedNoRedis = false;
function warnIfNoRedis() {
  if (redis || warnedNoRedis || process.env.VERCEL_ENV !== "production") return;
  warnedNoRedis = true;
  console.error(
    "[rate-limit] DIQQAT: production'da UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN yo'q — " +
      "limitlar faqat har instansiyaning xotirasida (umumiy emas). Upstash'ni sozlang.",
  );
}

/** Kvota/xarajat kalitlari: Redis timeout'ida ham ochiq qolmaydi (qimmat media so'rovlari). */
const FAIL_CLOSED_PREFIXES = ["vid:", "trs:"];

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
// windowMs bucket ichida: tozalash har bucketni O'Z oynasi o'tgandan keyin o'chiradi
// (aks holda 24 soatlik limitlar 10 daqiqada yangilanib qolardi).
type Bucket = { tokens: number; last: number; windowMs: number };
const buckets = new Map<string, Bucket>();

function localLimit(key: string, limit: number, windowMs: number): Result {
  const now = Date.now();
  const b = buckets.get(key) ?? { tokens: limit, last: now, windowMs };
  b.windowMs = windowMs;
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
  warnIfNoRedis();
  const shared = sharedLimiter(limit, windowMs);
  if (shared) {
    try {
      const r = await shared.limit(key);
      // @upstash/ratelimit timeout'da success:true qaytaradi (reason: "timeout") — bu kvotani
      // butunlay chetlab o'tardi. Qimmat kalitlar yopiq, qolganlari mahalliy limitga o'tadi.
      if (r.reason === "timeout") {
        if (FAIL_CLOSED_PREFIXES.some((p) => key.startsWith(p))) return { ok: false, retryAfterMs: 5000 };
        return localLimit(key, limit, windowMs);
      }
      return { ok: r.success, retryAfterMs: r.success ? 0 : Math.max(1, r.reset - Date.now()) };
    } catch (e) {
      console.error("[rate-limit] Upstash xato, mahalliy limitga o'tildi:", e instanceof Error ? e.message : e);
    }
  }
  return localLimit(key, limit, windowMs);
}

// ---- Faqat MUVAFFAQIYATSIZ urinishlar hisoblagichi ------------------------
// rateLimit() har chaqiruvni sanaydi; bu yerda esa faqat xatolar (masalan, noto'g'ri
// terilgan device-login kodi) sanaladi, tekshirish (count) esa hisobni o'zgartirmaydi.
// Oyna — birinchi xatodan boshlab qat'iy (fixed window). Redis bo'lmasa/xato bersa — mahalliy.
type FailBucket = { n: number; resetAt: number };
const failLocal = new Map<string, FailBucket>();
const FAIL_PREFIX = "sov-fail:";

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

function localFailures(key: string): FailBucket | null {
  const b = failLocal.get(key);
  if (!b) return null;
  if (b.resetAt <= Date.now()) {
    failLocal.delete(key);
    return null;
  }
  return b;
}

/** Joriy oynadagi xatolar soni (hisobni o'zgartirmaydi). */
export async function failureCount(key: string): Promise<number> {
  warnIfNoRedis();
  if (redis) {
    try {
      const v = await withTimeout(redis.get<number | string>(`${FAIL_PREFIX}${key}`), 1000);
      return Math.max(Number(v) || 0, localFailures(key)?.n ?? 0);
    } catch (e) {
      console.error("[rate-limit] failureCount:", e instanceof Error ? e.message : e);
    }
  }
  return localFailures(key)?.n ?? 0;
}

/** Bitta xatoni yozadi va oynadagi yangi sonni qaytaradi. */
export async function recordFailure(key: string, windowMs: number): Promise<number> {
  warnIfNoRedis();
  // Mahalliy nusxa har doim yuritiladi — Redis keyin uzilsa ham shu instansiyada qulf saqlanadi.
  const b = localFailures(key) ?? { n: 0, resetAt: Date.now() + windowMs };
  b.n += 1;
  failLocal.set(key, b);
  if (redis) {
    try {
      // SET NX PX avval — kalit HAR DOIM muddatli yaratiladi (INCR muddatsiz kalit qoldirmaydi).
      const p = redis.pipeline();
      p.set(`${FAIL_PREFIX}${key}`, 0, { nx: true, px: windowMs });
      p.incr(`${FAIL_PREFIX}${key}`);
      const res = await withTimeout(p.exec(), 1000);
      return Math.max(Number(res[1]) || 0, b.n);
    } catch (e) {
      console.error("[rate-limit] recordFailure:", e instanceof Error ? e.message : e);
    }
  }
  return b.n;
}

/** Client IP ni Vercel / oldingi proxy sarlavhalaridan oladi. */
export function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * Rate-limit kaliti uchun IP: IPv6 manzil /64 prefiksga keltiriladi — bitta
 * foydalanuvchi o'z /64 tarmog'ida manzil almashtirib cheklovni chetlab o'tmasin.
 */
export function ipKey(ip: string): string {
  if (!ip.includes(":")) return ip;
  const [head] = ip.split("%");
  const parts = head.split("::");
  const left = parts[0] ? parts[0].split(":") : [];
  const right = parts.length > 1 && parts[1] ? parts[1].split(":") : [];
  const groups = parts.length > 1 ? [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right] : left;
  return `${groups.slice(0, 4).map((g) => (g || "0").toLowerCase()).join(":")}::/64`;
}

/**
 * Periodik tozalash: bucket o'z oynasi (windowMs) davomida ishlatilmagan bo'lsa —
 * u baribir to'liq to'lgan, o'chirish xatti-harakatni o'zgartirmaydi.
 */
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (b.last < now - b.windowMs) buckets.delete(k);
  for (const [k, b] of failLocal) if (b.resetAt <= now) failLocal.delete(k);
},5 * 60 * 1000).unref?.();
