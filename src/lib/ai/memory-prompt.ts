/**
 * Uzoq muddatli xotira uchun sof (server-only'siz) yordamchilar — chat route va
 * xotira ajratuvchisi ishlatadi, unit test ham shu faylni to'g'ridan-to'g'ri sinaydi.
 */

export type MemoryKind = "fact" | "preference" | "project" | "person";

export interface MemoryLike {
  content: string;
  kind: MemoryKind | string;
}

/** Promptdagi belgi: model ism va loyiha nomini farqlay olsin. */
const KIND_TAG: Record<string, string> = {
  fact: "fact",
  preference: "preference",
  project: "project",
  person: "person",
};

/** Bitta qatorga keltiradi (xotira matni promptning tuzilishini buzmasin). */
function oneLine(s: string): string {
  return s.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 300);
}

/**
 * System-prompt bloki. Xotira — faqat fon ma'lumoti: joriy xabarga bevosita
 * aloqador bo'lsagina ishlatiladi. Salomlashish yoki yangi mavzuda eski loyihalar
 * tilga olinmaydi; foydalanuvchiga ism bilan faqat xotirada aynan uning o'z ismi
 * yozilgan bo'lsa murojaat qilinadi (loyiha/brend/kompaniya nomi — ism emas).
 * Qoidalar ingliz tilida: javob tili qoidasi alohida beriladi va barcha tillarda ishlaydi.
 */
export function memoryPrompt(memories: MemoryLike[]): string {
  const lines = memories
    .slice(0, 25)
    .map((m) => ({ tag: KIND_TAG[m.kind] ?? "fact", text: oneLine(m.content) }))
    .filter((m) => m.text.length > 0)
    .map((m) => `- [${m.tag}] ${m.text}`);
  if (!lines.length) return "";
  return [
    "LONG-TERM MEMORY ABOUT THE USER (background notes from earlier chats; may be outdated):",
    ...lines,
    "HOW TO USE THIS MEMORY (strict):",
    "1. Use a memory ONLY when it is directly relevant to the user's CURRENT message. Otherwise ignore it completely.",
    "2. For greetings, small talk, or a new unrelated topic, do NOT mention past projects, tasks or memories, and do not assume the user wants to continue an earlier topic. Reply only to what they actually wrote.",
    "3. Address the user by name ONLY if a memory explicitly states that it is the user's own name (e.g. \"User's name: …\"). Project, brand, product, company and other people's names are NEVER the user's name.",
    "4. Do not say that you remember something unless the user asks what you remember.",
  ].join("\n");
}

/** Taqqoslash uchun normallashtirish: kichik harf, tinish belgilarisiz, bitta bo'shliq. */
export function normalizeMemory(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(s: string): Set<string> {
  return new Set(normalizeMemory(s).split(" ").filter((w) => w.length > 1));
}

/** Deyarli bir xil xotira (aynan yoki so'zlarning ≥80% i umumiy). */
export function isNearDuplicate(a: string, b: string): boolean {
  const na = normalizeMemory(a);
  const nb = normalizeMemory(b);
  if (!na || !nb) return false;
  if (na === nb || na.includes(nb) || nb.includes(na)) return true;
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.size || !tb.size) return false;
  let common = 0;
  for (const w of ta) if (tb.has(w)) common++;
  return common / Math.min(ta.size, tb.size) >= 0.8 && common / Math.max(ta.size, tb.size) >= 0.6;
}

/**
 * Faqat salomlashish / qisqa odob so'zi — undan eslab qolinadigan narsa yo'q
 * (ajratuvchi modelni chaqirmaymiz). "Mening ismim ..." kabi gaplar bunga kirmaydi.
 */
export function isSmallTalk(text: string): boolean {
  const s = normalizeMemory(text);
  if (!s) return true;
  if (s.length > 40) return false;
  // O'zini tanishtirish ("salom, ismim Ali", "hi, I'm Ali") — eslab qolishga arziydi.
  if (/(ism|исм|имя|зовут|name)/u.test(s) || /(^| )(i m|i am|men|мен|я)( |$)/u.test(s)) return false;
  return /^(salom|assalomu alaykum|assalom|салом|ассалому алайкум|привет|здравствуйте|здравствуй|добрый (день|вечер)|hi|hello|hey|good (morning|afternoon|evening)|rahmat|раҳмат|рахмат|спасибо|thanks|thank you|ok|okay|ок|хорошо|yaxshi|яхши|qalaysiz|қалайсиз|как дела|how are you)( [\p{L}\p{N}]+){0,2}$/u.test(
    s,
  );
}
