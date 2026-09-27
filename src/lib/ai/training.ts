import "server-only";
import { createHash } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Tella 2 uchun distillation: kuchli modellarning javoblari saqlanadi va keyin
 * QLoRA fine-tune uchun JSONL sifatida eksport qilinadi.
 *
 * Maxfiylik chegaralari (shu yerda majburlanadi — chaqiruvchiga ishonmaymiz):
 *   • Maxfiy rejim (Blind Prompting), biriktirilgan fayl, bilim bazasi hujjati,
 *     Cowork papkasi, shaxsiy xotira, ulangan servis (connector), o'qilgan veb
 *     sahifa yoki foydalanuvchi skili ishlatilgan suhbat YOZILMAYDI.
 *   • user_id saqlanmaydi.
 *   • Foydalanuvchi sozlamalarda o'chirib qo'ysa — yozilmaydi.
 */

const MIN_Q = 12;
const MIN_A = 120;
const MAX_Q = 4_000;
const MAX_A = 20_000;

/** Aniq shaxsiy ma'lumot ko'ringan matn saqlanmaydi. */
const PII = [
  /\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b/i, // email
  /\+?998\s?\d{2}\s?\d{3}\s?\d{2}\s?\d{2}/, // uz telefon
  /\b\d{16}\b/, // karta raqami
  /\b(?:sk|pk|xpl|ci_live|whsec|gsk|nvapi)[-_][A-Za-z0-9_-]{12,}/, // API kalitlar
];

/**
 * Sirlar (fayl biriktirilmasa ham savolga yopishtirilishi mumkin): JWT (Supabase servis kaliti),
 * AWS kaliti, parolli ulanish satri, PEM blok, .env qatori (KALIT=uzun_qiymat), GitHub/Google kalitlari.
 */
const SECRETS = [
  /eyJ[\w-]{8,}\.[\w-]{8,}\./, // JWT
  /\bA(?:KIA|SIA)[0-9A-Z]{16}\b/, // AWS access key
  /\b[a-z][a-z0-9+.-]{1,20}:\/\/[^\s:/@]+:[^\s@/]+@/i, // postgres://user:parol@… (har qanday sxema)
  /-----BEGIN [A-Z ]+-----/, // PEM (private key, sertifikat)
  /\b[A-Z][A-Z0-9_]{2,}=\S{16,}/, // .env qatori
  /\bgh[pousr]_[A-Za-z0-9]{20,}/, // GitHub token
  /\bAIza[0-9A-Za-z_-]{30,}/, // Google API kaliti
];

/**
 * Biriktirilgan fayl/transkript belgisi (attachments.ts → "[Fayl: …]", "[TRANSKRIPT: …]") — chaqiruvchi
 * hasPrivateContext'ni belgilamasa ham shu yerda rad etiladi.
 */
const ATTACHMENT_MARK = /\[(?:Fayl|TRANSKRIPT|Fayl endi mavjud emas|Media fayl biriktirildi)[: ]/;

export interface CaptureInput {
  question: string;
  answer: string;
  model: string;
  /**
   * Suhbatda maxfiy manba ishlatilganmi (fayl / KB / Cowork / xotira /
   * connector / veb sahifa / custom skill / Blind Prompting).
   */
  hasPrivateContext: boolean;
  optedIn: boolean;
}

export function trainingEnabled(): boolean {
  return process.env.TRAINING_CAPTURE === "on";
}

/** Yozishga yaroqlimi — sababini ham qaytaradi (log/test uchun). */
export function captureVerdict(input: CaptureInput): { ok: boolean; reason: string } {
  if (!trainingEnabled()) return { ok: false, reason: "disabled" };
  if (!input.optedIn) return { ok: false, reason: "opt-out" };
  if (input.hasPrivateContext) return { ok: false, reason: "private-context" };

  const q = input.question.trim();
  const a = input.answer.trim();
  if (q.length < MIN_Q || q.length > MAX_Q) return { ok: false, reason: "question-length" };
  if (a.length < MIN_A || a.length > MAX_A) return { ok: false, reason: "answer-length" };
  if (ATTACHMENT_MARK.test(q)) return { ok: false, reason: "attachment" };
  if (PII.some((re) => re.test(q) || re.test(a))) return { ok: false, reason: "pii" };
  if (SECRETS.some((re) => re.test(q) || re.test(a))) return { ok: false, reason: "secret" };
  // Maxfiy rejim maskalagan matn ([person_A], [email_B]) trening uchun yaroqsiz —
  // model bunday tokenlarni o'rganib qolmasligi kerak.
  if (/\[(person|email|phone|card|org|money|url|iban|crypto)_[A-Z]\]/i.test(q + a)) {
    return { ok: false, reason: "masked" };
  }
  return { ok: true, reason: "ok" };
}

export function questionHash(question: string): string {
  return createHash("sha256").update(question.trim().toLowerCase()).digest("hex").slice(0, 32);
}

/**
 * Javobni trening bazasiga yozadi. Xato bo'lsa jim o'tadi — chat oqimi
 * hech qachon buning ustidan yiqilmasligi kerak.
 */
export async function captureSample(input: CaptureInput): Promise<boolean> {
  const verdict = captureVerdict(input);
  if (!verdict.ok) return false;
  try {
    const supabase = createServiceClient();
    const { error } = await supabase.from("training_samples").insert({
      model: input.model,
      question: input.question.trim(),
      answer: input.answer.trim(),
      question_hash: questionHash(input.question),
    });
    // 23505 = bu savol allaqachon bor (takror yozmaymiz).
    return !error || error.code === "23505";
  } catch {
    return false;
  }
}
