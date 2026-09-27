/**
 * Biriktirma belgilari (attachments.ts → buildUserContent) — server va mijoz uchun umumiy, sof modul.
 *
 * Mijoz fayl/transkript matnini user xabari MATNI ichiga shu belgilar bilan qo'shadi:
 *   [Fayl: nom] … [/Fayl], [TRANSKRIPT: nom] … [/TRANSKRIPT],
 *   [Fayl endi mavjud emas: …], [Media fayl biriktirildi: …]
 * Biriktirmalar DOIM foydalanuvchi yozgan matndan KEYIN keladi, shuning uchun birinchi belgidan
 * boshlab qolgan hamma narsa — fayl mazmuni (ishonchsiz: fayl ichida soxta "[/Fayl]" bo'lishi mumkin,
 * shuning uchun yopuvchi teg qidirilmaydi). attachments.ts formatini o'zgartirsangiz — bu yerni ham.
 */
const ATTACH_START = /(?:^|\n\n)\[(?:Fayl|TRANSKRIPT|Fayl endi mavjud emas|Media fayl biriktirildi)[: ]/;

/** Matnni foydalanuvchi YOZGAN qism va biriktirma bor-yo'qligiga ajratadi. */
export function splitAttachments(text: string): { typed: string; hasAttachment: boolean } {
  const m = ATTACH_START.exec(text);
  if (!m) return { typed: text, hasAttachment: false };
  return { typed: text.slice(0, m.index).trim(), hasAttachment: true };
}

/** Matnda biriktirilgan fayl/transkript belgisi bormi. */
export function hasAttachmentMarker(text: string): boolean {
  return ATTACH_START.test(text);
}

/**
 * Xabar mazmunida (satr yoki multimodal massiv) biriktirma bormi: rasm qismi yoki
 * fayl/transkript belgisi.
 */
export function contentHasAttachment(content: unknown): boolean {
  if (typeof content === "string") return hasAttachmentMarker(content);
  if (!Array.isArray(content)) return false;
  return content.some((p) => {
    if (!p || typeof p !== "object") return false;
    const part = p as { type?: unknown; text?: unknown };
    if (part.type === "image_url") return true;
    return typeof part.text === "string" && hasAttachmentMarker(part.text);
  });
}
