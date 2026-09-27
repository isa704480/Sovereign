/**
 * Xotiraga yoziladigan inquiry faktlari uchun PII filtri (docs/INQUIRY.md §A.7, §C T6). Pure.
 *
 * `rememberInquiryFacts` faqat foydalanuvchi roziligi (checkbox) bilan ishlaydi, lekin rozilik bo'lsa ham
 * quyidagilar xotiraga HECH QACHON tushmaydi: email, telefon, bank karta raqami, IBAN, pasport / ID
 * seriya-raqami, JShShIR (PINFL, 14 raqam), API kalit / token / maxfiy kalit, parol va shu kabi sirlar.
 * Fakt qisman tozalanmaydi — PII bo'lsa butun fakt tashlanadi ("Karta: [yashirildi]" xotirada foydasiz).
 *
 * Summalar ("120 000 000 so'm", "$5,000"), sanalar ("2026-09-03", "03.09.2026") va yillar PII emas.
 */
import { isSecretRequest } from "./sanitize";

export type PiiKind = "email" | "phone" | "card" | "iban" | "passport" | "pinfl" | "api_key" | "secret";

const EMAIL_RE = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.\p{L}{2,}/u;

/** Mashhur kalit/token formatlari (OpenAI/Anthropic/OpenRouter, AWS, GitHub, Slack, Google, GitLab, Stripe, JWT, PEM). */
const API_KEY_RES: RegExp[] = [
  /\bsk-(?:ant-|or-|proj-|live_|test_)?[A-Za-z0-9_-]{16,}/,
  /\b(?:rk|pk)_(?:live|test)_[A-Za-z0-9]{16,}/,
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/,
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/,
  /\bglpat-[A-Za-z0-9_-]{16,}/,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/,
  /\bAIza[0-9A-Za-z_-]{30,}/,
  /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bsov_[A-Za-z0-9_-]{16,}/,
];

/** Umumiy yuqori entropiyali token: ≥ 32 belgi, harf VA raqam aralash, bo'shliqsiz. */
const LONG_TOKEN_RE = /(?<![\p{L}\p{N}_-])[A-Za-z0-9_\-+/=]{32,}(?![\p{L}\p{N}_-])/gu;

/** Pasport / ID karta: 1–2 lotin bosh harf + 6–8 raqam (UZ "AA1234567", "AD 1234567", xalqaro). */
const PASSPORT_RE = /(?<![\p{L}\p{N}])[A-Z]{1,2}[ -]?\d{6,8}(?![\p{L}\p{N}])/u;

/** IBAN: 2 harf + 2 raqam + 11–30 harf/raqam (bo'shliqlar bilan ham). */
const IBAN_RE = /(?<![\p{L}\p{N}])[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{2,4}){3,8}(?![\p{L}\p{N}])/u;

/** Raqamlar ketma-ketligi (ajratuvchilar bilan): telefon, karta, JShShIR, summa. */
const DIGIT_RUN_RE = /\+?\(?\d[\d ().\-]{5,}\d/g;

/** Raqamdan keyin kelsa — bu summa/o'lchov, telefon emas. */
const AMOUNT_AFTER_RE =
  /^\s*(?:so'?m|сўм|сум|руб|₽|rub|usd|eur|\$|€|dollar|доллар|mln|million|млн|миллион|mlrd|млрд|ming|минг|тыс|k\b|km|км|kg|кг|m2|м2|kv|кв|%|foiz|фоиз|процент|percent|yil|йил|год|лет|year|oy|ой|месяц|month|kun|кун|день|дн|day)/iu;
/** Raqamdan oldin kelsa — summa. */
const AMOUNT_BEFORE_RE = /(?:\$|€|₽|usd|eur|uzs|rub|сум|so'?m)\s*$/iu;

function luhnOk(digits: string): boolean {
  let sum = 0;
  let dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

/** "120 000 000", "1,250,000", "5.000.000" — uchlik guruhlangan summa. */
function isThousandsGrouped(run: string): boolean {
  return /^\d{1,3}(?:([ ,.])\d{3})(?:\1\d{3})*$/.test(run.trim());
}

/** Sana: 2026-09-03, 03.09.2026 (oraliq bo'laklari alohida tekshiriladi). */
function isDateLike(run: string): boolean {
  return /^\d{4}[./-]\d{1,2}[./-]\d{1,2}$|^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(run.trim());
}

function classifyDigitRun(text: string, run: string, index: number): PiiKind | null {
  const digits = run.replace(/\D/g, "");
  const n = digits.length;
  if (n < 7) return null;
  if (isDateLike(run)) return null;
  // Karta: 13–19 raqam va Luhn to'g'ri; 16 raqam — Luhn'siz ham (xato terilgan karta ham karta).
  if ((n >= 13 && n <= 19 && luhnOk(digits)) || n === 16) return "card";
  // JShShIR / PINFL — 14 raqam.
  if (n === 14) return "pinfl";
  const before = text.slice(Math.max(0, index - 6), index);
  const after = text.slice(index + run.length, index + run.length + 12);
  const amountContext = AMOUNT_AFTER_RE.test(after) || AMOUNT_BEFORE_RE.test(before);
  // "+" bilan boshlangan 9–15 raqam — xalqaro telefon (summa oldidan "+" qo'yilmaydi).
  if (run.startsWith("+") && n >= 9 && n <= 15) return "phone";
  if (amountContext || isThousandsGrouped(run)) return null;
  // 9–12 raqam (998 90 123 45 67, 90 123-45-67, 8 912 345 67 89) — telefon.
  if (n >= 9 && n <= 12) return "phone";
  // 7 raqam, telefon ko'rinishida guruhlangan ("123-45-67") — mahalliy telefon.
  if (n <= 8 && /^\d{3}[ -]\d{2}[ -]\d{2}$/.test(run.trim())) return "phone";
  if (n > 12) return "card"; // 13+ raqamli uzun identifikator (hisob raqami va h.k.)
  return null;
}

function hasLongToken(text: string): boolean {
  for (const m of text.matchAll(LONG_TOKEN_RE)) {
    const t = m[0];
    if (/[A-Za-z]/.test(t) && /\d/.test(t)) return true;
    if (/^[0-9a-f]{32,}$/i.test(t)) return true;
  }
  return false;
}

/**
 * Matndagi birinchi topilgan PII turi (yoki null). Tartib: sirlar → kalitlar → email → IBAN →
 * raqamlar (karta/JShShIR/telefon) → pasport.
 */
export function detectPii(input: string): PiiKind | null {
  if (typeof input !== "string" || !input) return null;
  const text = input.normalize("NFKC");
  if (isSecretRequest(text)) return "secret";
  if (API_KEY_RES.some((re) => re.test(text)) || hasLongToken(text)) return "api_key";
  if (EMAIL_RE.test(text)) return "email";
  if (IBAN_RE.test(text)) return "iban";
  for (const m of text.matchAll(DIGIT_RUN_RE)) {
    // Oraliq ("5 000 000 - 10 000 000 so'm") — har bo'lak alohida baholanadi.
    let offset = m.index ?? 0;
    for (const piece of m[0].split(/(\s+[-–]\s+)/)) {
      if (/\d/.test(piece)) {
        const lead = piece.length - piece.trimStart().length;
        const kind = classifyDigitRun(text, piece.trim(), offset + lead);
        if (kind) return kind;
      }
      offset += piece.length;
    }
  }
  if (PASSPORT_RE.test(text)) return "passport";
  return null;
}

export function containsPii(input: string): boolean {
  return detectPii(input) !== null;
}
