/**
 * Xabar video yaratish so'rovimi? Video pullik va sekin, shuning uchun rasm
 * aniqlashidan qat'iyroq: ob'ekt (video/rolik/klip/animatsiya) fe'l bilan yonma-yon
 * kelishi kerak, "qanday/how/как", "ssenariy/script", "montaj/edit" kabi savol va
 * ish so'rovlari chiqarib tashlanadi. Aniq rejim — "+" → "Video yaratish".
 */
const UZ =
  /(video|videorolik|rolik|klip|animatsiya)\S*\s+(?:\S+\s+){0,2}?(yarat|generat|tayyorla|qilib\s*ber|ishlab\s*ber|chiqarib\s*ber)/i;
const UZ_CYRL =
  /(видео|видеоролик|ролик|клип|анимация)\S*\s+(?:\S+\s+){0,2}?(ярат|генерац|генерат|тайёрла|қилиб\s*бер|ишлаб\s*бер)/i;
const RU_VERB_FIRST =
  /(сгенерируй|сгенерировать|создай|создать|сделай|сделать|сними|снять|генерируй|нарисуй|смонтируй)\s+(?:\S+\s+){0,3}?(видео|ролик|клип|анимаци)/i;
const RU_OBJECT_FIRST = /(видео|ролик|клип)\S*\s+(?:\S+\s+){0,2}?(сгенер|созда|сдела|сними|генерир)/i;
const EN =
  /\b(make|create|generate|render|produce|animate|shoot)\b(?:\s+\S+){0,5}?\s+(video|clip|animation|footage|reel)s?\b|\btext[\s-]to[\s-]video\b|^(?:an?\s+)?(?:short\s+)?(?:video|clip)\s+(?:of|showing)\b/i;

/** Video yaratish emas — video haqida savol, ssenariy, montaj, tahlil, yuklab olish. */
// Kirill harflarida \b ishlamaydi (JS'da faqat ASCII) — o'rniga lookahead.
const NOT_GENERATION =
  /\b(how|what|why|which|tips|ideas?|scripts?|edit|editing|download|youtube\s+channel|summar\w*|transcri\w*|analy[sz]\w*)\b|qanday|qanaqa|\bnega\b|nima\s+uchun|ssenariy|stsenariy|montaj|g['‘’`]oya|tahlil|yuklab|(?:^|[\s,.!?])как(?:ой|ая|ое|ую|ие|им)?(?=[\s,.!?]|$)|почему|зачем|сценари|монтаж|иде[яиюй]|скача|анализ|қандай|(?:^|[\s,.!?])нега(?=[\s,.!?]|$)|ғоя|таҳлил|юклаб/i;

/** "video uchun rasm/muqova yarat" — bu rasm so'rovi (thumbnail), video emas. */
const IMAGE_NOUN =
  /\b(image|picture|photo|thumbnail|poster|logo|banner|cover)s?\b|rasm(?!iy)|surat|muqova|logo|картин|изображени|фото(?!реал)|обложк|превью|постер|логотип|расм(?!ий)|сурат|муқова/i;

export function detectVideoIntent(text: string): boolean {
  const s = text.trim();
  if (!s || s.length > 600) return false;
  if (NOT_GENERATION.test(s) || IMAGE_NOUN.test(s)) return false;
  return UZ.test(s) || UZ_CYRL.test(s) || RU_VERB_FIRST.test(s) || RU_OBJECT_FIRST.test(s) || EN.test(s);
}

let availability: Promise<boolean> | null = null;

/**
 * Server video generatsiyani qo'llaydimi (GET /api/video → {enabled}). Bir marta
 * so'raladi va eslab qolinadi; tarmoq xatosida false va keyingi safar qayta so'raladi.
 */
export function videoAvailable(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (!availability) {
    availability = fetch("/api/video", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        return ((await r.json()) as { enabled?: unknown }).enabled === true;
      })
      .catch(() => {
        availability = null;
        return false;
      });
  }
  return availability;
}
