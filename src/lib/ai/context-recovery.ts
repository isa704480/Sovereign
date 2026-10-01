/**
 * Kontekst uzunligi xatosi uchun avtomat tiklanish (context_length recovery).
 *
 * Muammo: foydalanuvchi uzoq suhbat davomida kontekst juda uzun bo'lib qoladi va
 * barcha provayderlar 413 yoki "context too large" bilan rad etadi. Hozirda
 * zanjir to'xtaydi va foydalanuvchi xato ko'radi.
 *
 * Yechim (ikki bosqich):
 *  1. Eng keksa xabarlarni olib tashlab, kontekstni qisqartirish (sliding window).
 *  2. Qisqartirilgan kontekst bilan qayta urinish.
 *
 * Qoidalar:
 *  - Oxirgi N ta xabar pair (user+assistant) saqlanadi — CONTEXT_RECOVERY_KEEP_PAIRS (standart 6).
 *  - System xabarlar (server qo'shadigan) har doim saqlanadi.
 *  - Qisqartirish loggga yoziladi (mijozga ko'rinmaydi).
 *  - Faqat bir marta uriniladi — aks holda cheksiz loop bo'lishi mumkin.
 *  - Kontekst allaqachon minimal bo'lsa (≤2 xabar) — qisqartirish imkonsiz, xato qaytariladi.
 *
 * Env:
 *   CONTEXT_RECOVERY_KEEP_PAIRS  — saqlanadigan user+assistant juftlar soni (standart 6)
 *   CONTEXT_RECOVERY_DISABLED    — "1" bo'lsa o'chirilgan
 */

export interface RecoveryMessage {
  role: "user" | "assistant" | "system";
  content: string | unknown[];
}

function keepPairs(): number {
  const v = parseInt(process.env.CONTEXT_RECOVERY_KEEP_PAIRS ?? "", 10);
  return Number.isFinite(v) && v > 0 ? v : 6;
}

function disabled(): boolean {
  return process.env.CONTEXT_RECOVERY_DISABLED === "1";
}

/**
 * Xabarlar ro'yxatini qisqartiradi — eng keksa juftlarni olib tashlaydi.
 * System xabarlar saqlanadi. Minimal bo'lsa (≤2 xabar) — null qaytaradi.
 *
 * @returns qisqartirilgan xabarlar yoki null (qisqartirish imkonsiz)
 */
export function trimForContextRecovery(
  messages: RecoveryMessage[],
): RecoveryMessage[] | null {
  if (disabled()) return null;

  const keep = keepPairs();
  const system = messages.filter((m) => m.role === "system");
  const history = messages.filter((m) => m.role !== "system");

  // Juft ajratish: user + assistant
  const pairs: RecoveryMessage[][] = [];
  let i = 0;
  while (i < history.length) {
    if (
      history[i].role === "user" &&
      i + 1 < history.length &&
      history[i + 1].role === "assistant"
    ) {
      pairs.push([history[i], history[i + 1]]);
      i += 2;
    } else {
      // Juftlanmagan (masalan, oxirgi user xabar)
      pairs.push([history[i]]);
      i++;
    }
  }

  // Allaqachon minimal — qisqartirish imkonsiz
  if (pairs.length <= 1) return null;

  // Oxirgi N juftni saqlaymiz
  const kept = pairs.slice(-keep);

  // Jami saqlanadigan xabarlar soni
  const trimmed = kept.flat();

  // Agar hech narsa olib tashlanmagan bo'lsa — null (retry manfaat bermaydi)
  if (trimmed.length >= history.length) return null;

  const removed = history.length - trimmed.length;
  console.warn(
    `[context-recovery] kontekst qisqartirildi: ${history.length} → ${trimmed.length} xabar` +
    ` (${removed} keksa xabar olib tashlandi, ${kept.length} juft saqlandI)`,
  );

  return [...system, ...trimmed];
}

/**
 * Kontekst xatosidan keyin qayta urinish kerakmi?
 * - Xato context_length bo'lishi kerak
 * - scope "provider" bo'lishi kerak (model-scope — faqat shu nomzod o'tkaziladi, recovery shart emas)
 * - Allaqachon bir marta urinilmagan bo'lishi kerak
 */
export function shouldAttemptRecovery(
  errorKind: string,
  errorScope: string | undefined,
  alreadyAttempted: boolean,
): boolean {
  if (disabled()) return false;
  if (alreadyAttempted) return false;
  if (errorKind !== "context_length") return false;
  // scope "model" — Groq TPM limiti kabi, faqat shu nomzod o'tkaziladi; provider scope yoki yo'q — qisqartirish kerak
  return (errorScope ?? "provider") !== "model";
}
