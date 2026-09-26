"use client";

/**
 * Xabar rasm yaratish so'rovimi? Ob'ekt so'zi (rasm/logo/...) + fe'l (chiz/yarat/
 * generatsiya...) birga kelsa, yoki aniq ingliz/rus iboralar. "yaratib ber"
 * kabi qo'shimchali shakllar ham tushadi (so'z oxiri talab qilinmaydi).
 * Aniq rejim kerak bo'lsa — "+" → "Rasm yaratish" (bu funksiyaga bog'liq emas).
 */
const OBJECT = /(rasm|surat|logo|logotip|poster|banner|afisha|illyustratsiya|ikonka|avatar|расм|сурат|логотип|картин|изображени|рисун|иллюстрац|аватар|постер|баннер)/i;
const VERB = /(chiz|yarat|generat|tayyorla|чиз|ярат|нарису|сгенер|созда|сдела|генерир)/i;
const EN =
  /\b(draw|paint|sketch|illustrate)\b|\b(generate|create|make|design|render)\b.{0,40}\b(image|picture|photo|logo|poster|illustration|drawing|art(work)?|icon|avatar|wallpaper)s?\b/i;
const RU = /(нарисуй|сгенерируй|сгенерировать)/i;

/**
 * Savol ("Bu logotipni kim yaratgan?", "Как сделать аватар в Telegram?", "How do I create
 * a Docker image?") — rasm so'rovi emas, matnli javob kerak. Kirill harflari uchun `\b`
 * ishlamaydi, shuning uchun so'z chegarasi bo'shliq/tinish belgisi bilan beriladi.
 */
const QUESTION =
  /\?\s*$|\b(qanday|qanaqa|nega|nima uchun|kim|qayerda|qachon|how|why|what|who|which|where|when|is it|can i|do i|does)\b|(^|[\s,.;:!«"(])(как|почему|зачем|кто|где|когда|какой|какая|какие|что такое|можно ли|қандай|нега|ким|қаерда)(?=$|[\s,.;:!?»")])/i;
/** Savol shaklida bo'lsa ham aniq buyruq ("chizib ber", "нарисуй", "can you draw …"). */
const EXPLICIT =
  /(chizib ber|chizing|чизиб бер|yaratib ber|яратиб бер|нарисуй|сгенерируй|\b(can|could|would|will) you (please )?(draw|paint|sketch|generate|create|make)\b|\bplease (draw|paint|sketch)\b)/i;

export function detectImageIntent(text: string): boolean {
  const s = text.trim();
  if (!s || s.length > 600) return false;
  if (QUESTION.test(s) && !EXPLICIT.test(s)) return false;
  if (EN.test(s) || RU.test(s)) return true;
  return OBJECT.test(s) && VERB.test(s);
}
