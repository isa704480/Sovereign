import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Bir bosishda obunani bekor qilish havolasi uchun imzo (HMAC-SHA256).
 * Kalit: EMAIL_TOKEN_SECRET (bo'lmasa CRON_SECRET). Kalit almashtirilsa eski havolalar
 * ishlamay qoladi — foydalanuvchi baribir Sozlamalar'dan o'chira oladi.
 *
 * Toza modul (server-only importi yo'q) — tsx testlarida ham ishlaydi; faqat server
 * route'lari import qiladi.
 */

const PURPOSE = "sov-unsub:v1:";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function emailTokenSecret(): string | null {
  const s = process.env.EMAIL_TOKEN_SECRET?.trim() || process.env.CRON_SECRET?.trim() || "";
  // Juda qisqa kalit bilan imzolamaymiz (taxmin qilinishi mumkin).
  return s.length >= 16 ? s : null;
}

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

export function signUnsubscribe(userId: string, secret: string): string {
  return createHmac("sha256", secret).update(PURPOSE + userId.toLowerCase()).digest("base64url");
}

/** Doimiy vaqtli tekshiruv. Noto'g'ri format / kalit yo'q → false. */
export function verifyUnsubscribe(userId: unknown, token: unknown, secret: string | null): boolean {
  if (!secret || !isUuid(userId) || typeof token !== "string" || token.length > 128) return false;
  const want = Buffer.from(signUnsubscribe(userId, secret));
  const got = Buffer.from(token);
  return got.length === want.length && timingSafeEqual(got, want);
}

/** Bir bosishda bekor qilish havolasi (email tanasi va List-Unsubscribe sarlavhasi uchun). */
export function unsubscribeUrl(siteUrl: string, userId: string, secret: string, lang?: string): string {
  const q = new URLSearchParams({ u: userId, t: signUnsubscribe(userId, secret) });
  // Til imzolanmaydi — faqat havola buzilgan holatdagi sahifa tili uchun.
  if (lang) q.set("l", lang);
  return `${siteUrl}/api/email/unsubscribe?${q.toString()}`;
}

/** Doimiy vaqtli `Authorization: Bearer <secret>` tekshiruvi (cron). */
export function bearerMatches(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header) return false;
  const want = Buffer.from(`Bearer ${secret}`);
  const got = Buffer.from(header);
  return got.length === want.length && timingSafeEqual(got, want);
}
