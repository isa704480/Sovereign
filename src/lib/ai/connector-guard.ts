/**
 * Connector tool bosqichining sof (tarmoqsiz) xavfsizlik yordamchilari — connector-tools.ts ishlatadi,
 * connector-guard.test.ts tekshiradi.
 */
import { splitAttachments } from "@/lib/chat/attachment-markers";

/** Tool bosqichiga fayl mazmuni o'rniga beriladigan belgi (fayl matni — ishonchsiz, injection manbai). */
export const ATTACHMENT_OMITTED =
  "[Foydalanuvchi fayl/transkript biriktirgan — uning mazmuni bu bosqichga berilmaydi (ishonchsiz ma'lumot).]";

/**
 * Tool modeliga beriladigan user matni: faqat foydalanuvchi YOZGAN qism. Biriktirilgan fayl/transkript
 * mazmuni (ichida "SYSTEM: gsheets_append …" kabi yashirin ko'rsatma bo'lishi mumkin) olib tashlanadi.
 */
export function toolUserText(text: string): string {
  const { typed, hasAttachment } = splitAttachments(text);
  if (!hasAttachment) return text;
  return typed ? `${typed}\n\n${ATTACHMENT_OMITTED}` : ATTACHMENT_OMITTED;
}

/** GitHub owner/repo nomi: faqat ruxsat etilgan belgilar, "." / ".." emas (boshqa API yo'liga chiqmasin). */
function githubName(s: string): string | null {
  const v = s.trim();
  if (!/^[A-Za-z0-9_.-]{1,100}$/.test(v) || v === "." || v === "..") return null;
  return encodeURIComponent(v);
}

/**
 * GitHub API yo'li: owner/repo tekshiriladi, fayl yo'li har bo'lagi alohida kodlanadi,
 * "." / ".." / bo'sh bo'laklar rad etiladi. Yaroqsiz bo'lsa null.
 */
export function githubApiPath(owner: string, repo: string, path?: string): string | null {
  const o = githubName(owner);
  const r = githubName(repo);
  if (!o || !r) return null;
  const base = `/repos/${o}/${r}`;
  if (path === undefined) return base;
  const trimmed = path.trim().replace(/^\/+|\/+$/g, "");
  if (!trimmed || trimmed.length > 1000) return null;
  const segs = trimmed.split("/");
  if (segs.some((s) => !s || s === "." || s === ".." || /[\u0000-\u001f\\]/.test(s))) return null;
  return `${base}/contents/${segs.map(encodeURIComponent).join("/")}`;
}

/** Google Sheets ID (URL berilsa — undan ajratiladi). Yaroqsiz bo'lsa null. */
export function sheetIdOf(input: unknown): string | null {
  const raw = String(input ?? "").trim();
  const fromUrl = /\/spreadsheets\/d\/([A-Za-z0-9_-]+)/.exec(raw)?.[1];
  const id = fromUrl ?? raw;
  return /^[A-Za-z0-9_-]{20,100}$/.test(id) ? id : null;
}

/**
 * gsheets_append maqsadi ruxsat etilganmi (ma'lumot sizib chiqishiga qarshi). Tashqi (hujumchi
 * "havola orqali tahrir"ga ochgan) jadvalga yozish — shaxsiy ma'lumotni olib chiqish kanali, shuning
 * uchun jadval ID si:
 *  - shu so'rovda gsheets_create yaratgan jadval bo'lsa, yoki
 *  - foydalanuvchi O'ZI yozgan matnda (fayl mazmunisiz) bo'lsa — ruxsat;
 *  - suhbatdagi AI javobida bo'lsa — faqat shu so'rovda shaxsiy servis ma'lumoti hali
 *    o'qilmagan bo'lsa (oldingi navbatda yaratilgan jadvalga davom ettirish);
 *  - aks holda rad etiladi.
 */
export function appendTargetAllowed(opts: {
  id: string;
  createdIds: ReadonlySet<string>;
  userTyped: string;
  assistantText: string;
  privateDataSeen: boolean;
}): boolean {
  const { id, createdIds, userTyped, assistantText, privateDataSeen } = opts;
  if (createdIds.has(id)) return true;
  if (userTyped.includes(id)) return true;
  return !privateDataSeen && assistantText.includes(id);
}
