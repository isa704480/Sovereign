import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Bir bosishda obunani bekor qilish havolasi uchun imzo (HMAC-SHA256).
 * Kalit: EMAIL_TOKEN_SECRET (alohida, 32+ tasodifiy bayt tavsiya etiladi). U bo'lmasa —
 * eski o'rnatmalar buzilmasin deb CRON_SECRET (ogohlantirish bilan; cron kaliti bilan
 * bog'lanib qolmasligi uchun EMAIL_TOKEN_SECRET'ni o'rnating).
 * Almashtirish (rotatsiya): yangi kalit → EMAIL_TOKEN_SECRET, eskisi → EMAIL_TOKEN_SECRET_PREV.
 * Tekshiruv ikkalasini ham qabul qiladi — yuborilgan havolalar ishlashda davom etadi.
 * (CRON_SECRET'dan ko'chishda: EMAIL_TOKEN_SECRET_PREV = hozirgi CRON_SECRET qiymati.)
 *
 * Toza modul (server-only importi yo'q) — tsx testlarida ham ishlaydi; faqat server
 * route'lari import qiladi.
 */

const PURPOSE = "sov-unsub:v1:";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Juda qisqa kalit bilan imzolamaymiz (taxmin qilinishi mumkin).
const MIN_SECRET_LEN = 16;
let warnedCronFallback = false;

function usable(v: string | undefined): string | null {
  const s = v?.trim() || "";
  return s.length >= MIN_SECRET_LEN ? s : null;
}

/** Imzolash kaliti (yangi havolalar uchun). */
export function emailTokenSecret(): string | null {
  const own = process.env.EMAIL_TOKEN_SECRET?.trim();
  if (own) return usable(own);
  const cron = usable(process.env.CRON_SECRET);
  if (cron && !warnedCronFallback) {
    warnedCronFallback = true;
    console.warn("[email-token] EMAIL_TOKEN_SECRET not set — falling back to CRON_SECRET; set a dedicated EMAIL_TOKEN_SECRET");
  }
  return cron;
}

/** Tekshiruv kalitlari: joriy + (bo'lsa) EMAIL_TOKEN_SECRET_PREV — rotatsiyada eski havolalar uchun. */
export function emailTokenVerifySecrets(): string[] {
  const out: string[] = [];
  for (const s of [emailTokenSecret(), usable(process.env.EMAIL_TOKEN_SECRET_PREV)]) {
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

export function signUnsubscribe(userId: string, secret: string): string {
  return createHmac("sha256", secret).update(PURPOSE + userId.toLowerCase()).digest("base64url");
}

/**
 * Doimiy vaqtli tekshiruv. Noto'g'ri format / kalit yo'q → false.
 * `secret` — bitta kalit yoki ro'yxat (emailTokenVerifySecrets(): joriy + oldingi).
 */
export function verifyUnsubscribe(
  userId: unknown,
  token: unknown,
  secret: string | readonly string[] | null,
): boolean {
  const secrets = (typeof secret === "string" ? [secret] : (secret ?? [])).filter(Boolean);
  if (secrets.length === 0 || !isUuid(userId) || typeof token !== "string" || token.length > 128) return false;
  const got = Buffer.from(token);
  let ok = false;
  // Hamma kalitlar tekshiriladi (qaysi biri mos kelgani vaqtdan bilinmasin).
  for (const s of secrets) {
    const want = Buffer.from(signUnsubscribe(userId, s));
    if (got.length === want.length && timingSafeEqual(got, want)) ok = true;
  }
  return ok;
}

/** Bir bosishda bekor qilish havolasi (email tanasi va List-Unsubscribe sarlavhasi uchun). */
export function unsubscribeUrl(siteUrl: string, userId: string, secret: string, lang?: string): string {
  const q = new URLSearchParams({ u: userId, t: signUnsubscribe(userId, secret) });
  // Til imzolanmaydi — faqat havola buzilgan holatdagi sahifa tili uchun.
  if (lang) q.set("l", lang);
  return `${siteUrl}/api/email/unsubscribe?${q.toString()}`;
}

/**
 * Doimiy vaqtli `Authorization: Bearer <secret>` tekshiruvi (cron). Ikkala tomonning
 * SHA-256 hash'i solishtiriladi — uzunlik farqi ham vaqtdan bilinmaydi.
 */
export function bearerMatches(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header) return false;
  const want = createHash("sha256").update(`Bearer ${secret}`).digest();
  const got = createHash("sha256").update(header).digest();
  return timingSafeEqual(got, want);
}
