import { isSafeNextPath } from "@/lib/auth/profile";

const PROBE_ORIGIN = "https://sovereign.invalid";

/**
 * Kirishdan keyingi `next` yo'lini qat'iy tekshiradi (server va client uchun sof funksiya).
 * Faqat shu sayt ichidagi nisbiy yo'l qabul qilinadi: "//" va "/\" rad etiladi,
 * boshqaruv/bo'sh joy belgilari (masalan `/%09/evil.com` → "/\t/evil.com") dekodlashdan
 * oldin ham, keyin ham rad etiladi va URL parser natijasi boshqa originga olib chiqmasligi
 * tekshiriladi. Yaroqsiz bo'lsa null.
 */
export function safeNextPath(next: unknown): string | null {
  if (typeof next !== "string" || next.length > 512) return null;
  if (!isSafeNextPath(next) || /\s/.test(next)) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(next);
  } catch {
    return null;
  }
  if (!isSafeNextPath(decoded) || /\s/.test(decoded)) return null;
  try {
    if (new URL(next, PROBE_ORIGIN).origin !== PROBE_ORIGIN) return null;
  } catch {
    return null;
  }
  return next;
}
