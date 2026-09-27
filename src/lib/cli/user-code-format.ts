/**
 * CLI / Cowork device-login: foydalanuvchi TERIB kiritadigan kod (RFC 8628 "user_code").
 * Sof funksiyalar, tarmoqsiz va node:crypto'siz — brauzer komponentida ham ishlatiladi
 * (kriptografik qism: ./user-code.ts, faqat serverda).
 *
 * Alifbo — Crockford base32: 0-9 + A-Z, I/L/O/U siz (aniq 32 belgi → 5 bit, bias yo'q).
 * Chalkash belgilar kiritishda kechiriladi: O→0, I/L→1; kichik harf, bo'sh joy, chiziqcha,
 * to'liq kenglikdagi belgilar va kirill klaviaturasidagi o'xshash harflar (А, В, Е, К, М, Н,
 * О, Р, С, Т, Х) ham qabul qilinadi — rus/o'zbek (kirill) klaviaturasida terish xato bo'lmasin.
 */

export const USER_CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
/** Belgilar soni: 8 × 5 bit = 40 bit (tasodifiy taxmin — 1 / 1.1e12; har kodga 5 urinish). */
export const USER_CODE_LENGTH = 8;
/** Eski mijozlar (CLI ≤ 0.12.1, Cowork ≤ 0.7.1) uchun: device kodining boshidagi belgilar soni. */
export const LEGACY_CODE_LENGTH = 8;

/** Kirill (va boshqa) ko'rinishi bir xil harflar → lotin; o'xshash raqam/harflar → Crockford. */
const HOMOGLYPHS: Record<string, string> = {
  А: "A", В: "B", Е: "E", К: "K", М: "M", Н: "H", О: "0", Р: "P", С: "C", Т: "T", Х: "X", У: "Y", З: "3",
  O: "0", I: "1", L: "1",
};

/** Umumiy tozalash: NFKC (to'liq kenglik → oddiy), katta harf, ajratgichlar olib tashlanadi. */
function clean(input: unknown): string {
  if (typeof input !== "string") return "";
  // 64 dan uzun kiritish — noto'g'ri (katta kiritish bilan regex/CPU'ni yuklamaslik).
  if (input.length > 64) return "\u0000";
  return input
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[\s\-_.·•–—]+/g, "");
}

/**
 * Terilgan kodni kanonik ko'rinishga keltiradi ("ABCD1234", chiziqchasiz).
 * Noto'g'ri uzunlik yoki alifbodan tashqari belgi → null.
 */
export function normalizeUserCode(input: unknown): string | null {
  const s = [...clean(input)].map((ch) => HOMOGLYPHS[ch] ?? ch).join("");
  if (s.length !== USER_CODE_LENGTH) return null;
  for (const ch of s) if (!USER_CODE_ALPHABET.includes(ch)) return null;
  return s;
}

/** "ABCD1234" → "ABCD-1234" (ko'rsatish uchun). Noto'g'ri kod → "". */
export function formatUserCode(code: unknown): string {
  const n = normalizeUserCode(code);
  return n ? `${n.slice(0, 4)}-${n.slice(4)}` : "";
}

/**
 * Eski mijoz kodi: device kodining (hex) birinchi 8 belgisi, kichik harfda.
 * O→0, I/L→1 kechiriladi (hex'da faqat 0 va 1 mavjud). Noto'g'ri → null.
 */
export function normalizeLegacyCode(input: unknown): string | null {
  const s = [...clean(input)].map((ch) => HOMOGLYPHS[ch] ?? ch).join("").toLowerCase();
  return new RegExp(`^[0-9a-f]{${LEGACY_CODE_LENGTH}}$`).test(s) ? s : null;
}

/**
 * Kiritish maydoni uchun yumshoq formatlash (terish paytida): faqat ruxsat etilgan belgilar,
 * 4 belgidan keyin chiziqcha. Xato belgi jimgina tashlanmaydi — foydalanuvchi ko'rsin
 * (normalizeUserCode baribir tekshiradi), shuning uchun faqat ajratgichlar qayta qo'yiladi.
 */
export function prettifyTyping(input: string, mode: "code" | "legacy"): string {
  const s = clean(input).slice(0, 16);
  if (mode === "legacy") return s.toLowerCase().slice(0, LEGACY_CODE_LENGTH);
  const core = s.slice(0, USER_CODE_LENGTH);
  return core.length > 4 ? `${core.slice(0, 4)}-${core.slice(4)}` : core;
}
