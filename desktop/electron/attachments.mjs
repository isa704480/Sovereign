// Chat biriktirmalari (fayl va rasmlar) — main jarayon.
//
// Xavfsizlik modeli:
//  - Diskdan faqat foydalanuvchi O'ZI tanlagan yo'llar o'qiladi: native dialog natijasi yoki
//    preload'da webUtils.getPathForFile() bilan haqiqiy File obyektidan (drag&drop / Explorer'dan
//    nusxa) olingan yo'l. Renderer yo'l satrini bera olmaydi.
//  - realpath (symlink) bo'yicha himoyalangan joylar (.ssh, .aws, ~/.sovereign, brauzer profillari,
//    .env ...) — cli/src/tools.mjs isProtected() bilan rad etiladi; UNC yo'llar ham rad.
//  - Matn/PDF tarkibi main'da qoladi (renderer'ga faqat nom/hajm), serverga yuborishda id bo'yicha olinadi.
//  - Rasmlar renderer'da kichraytiriladi va data URL bo'lib qaytadi — main MIME va sehrli baytlarni
//    (magic bytes) qayta tekshiradi. Biriktirmalar ish papkasiga YOZILMAYDI; tarkibi log qilinmaydi.
//
// Electron'ga bog'liq emas — scripts/test-attachments.mjs oddiy node'da sinaydi.

import { lstatSync, statSync, realpathSync, openSync, readSync, closeSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import { randomUUID } from "node:crypto";
import { readAttachment, attachmentKind, pdfTextFromModule, IMAGE_EXT, TEXT_EXT, TEXT_MAX_BYTES, PDF_MAX_BYTES } from "../../cli/src/files.mjs";
import { isProtected } from "../../cli/src/tools.mjs";

/**
 * PDF matnini ajratish — pdf-parse Cowork'ning O'Z bog'liqligi (desktop/package.json).
 * O'rnatilgan ilovada cli/src resources/cli/src ichida turadi va uning yonida node_modules yo'q,
 * shuning uchun files.mjs'dagi `import("pdf-parse")` topolmaydi ("pdf-unavailable"). Bu fayl esa
 * app.asar ichida — import app.asar/node_modules'dan hal qilinadi. Modul bir marta yuklanadi.
 */
let pdfModule = null;
export async function desktopPdfText(buf) {
  try {
    pdfModule ??= import("pdf-parse");
    const mod = await pdfModule;
    return await pdfTextFromModule(mod, buf);
  } catch (e) {
    if (e?.code === "ERR_MODULE_NOT_FOUND") {
      pdfModule = null;
      return { missing: true };
    }
    throw e;
  }
}

/**
 * Chegaralar. Server (/api/cli/chat): xabarda ≤12 qism (matn + biriktirmalar), matn qismi ≤40 000
 * belgi, rasm URL ≤12 MB, butun so'rov ≤1 500 000 belgi (aks holda 413).
 * Renderer nusxasi: ui/src/lib/attachments.js (ATTACH_LIMITS) — test ikkalasini solishtiradi.
 */
export const LIMITS = Object.freeze({
  maxAttachments: 10, // + 1 matn qismi = 11 ≤ 12
  maxPathsPerCall: 20,
  imageSourceBytes: 30 * 1024 * 1024, // diskdagi rasm (kichraytirishdan oldin)
  imageDataUrlChars: 800_000, // bitta rasm (kichraytirilgan) data URL
  thumbChars: 48_000, // tarix/pufakcha uchun kichik ko'rinish
  fileTextChars: 30_000, // bitta matn/PDF fayl (server: matn qismi ≤ 40 000)
  totalChars: 1_000_000, // bitta xabar: rasmlar + fayl matnlari
  historyImageChars: 1_000_000, // serverga qayta yuboriladigan rasmlar (eng yangisidan)
  requestChars: 1_450_000, // butun so'rov (server 1 500 000 — zaxira bilan)
  storeMax: 40,
});

const IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/bmp"]);
const THUMB_MIMES = new Set(["image/png", "image/jpeg", "image/webp"]);
// eslint-disable-next-line no-control-regex
const UNSAFE_CHARS = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069\ufeff]/g;

/** Tarixda / eski xabarlarda rasm o'rniga modelga ketadigan matn (model uchun — o'zbekcha). */
export const IMAGE_PLACEHOLDER = "[Rasm oldin biriktirilgan edi — hajm chegarasi tufayli bu so'rovga qayta qo'shilmadi]";
export const IMAGE_HISTORY_PLACEHOLDER = "[Rasm biriktirilgan edi — tarixda saqlanmaydi; kerak bo'lsa qayta biriktiring]";
export const IMAGE_NO_VISION = "[Rasm biriktirilgan — joriy mahalliy model rasmlarni ko'rmaydi, u yuborilmadi]";

/** Ko'rsatiladigan fayl nomi: boshqaruv / bidi belgilarisiz, ≤120. */
export function safeName(v) {
  if (typeof v !== "string") return "";
  return v.replace(UNSAFE_CHARS, " ").replace(/\s+/g, " ").trim().slice(0, 120);
}

/** Baytlardan rasm turi (magic bytes): image/png | image/jpeg | image/gif | image/webp | image/bmp | null. */
export function sniffImage(buf) {
  if (!buf || buf.length < 4) return null;
  const b = (i) => buf[i];
  if (buf.length >= 8 && b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47 && b(4) === 0x0d && b(5) === 0x0a && b(6) === 0x1a && b(7) === 0x0a) return "image/png";
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return "image/jpeg";
  if (buf.length >= 6) {
    const head = String.fromCharCode(b(0), b(1), b(2), b(3), b(4), b(5));
    if (head === "GIF87a" || head === "GIF89a") return "image/gif";
  }
  if (buf.length >= 12 && String.fromCharCode(b(0), b(1), b(2), b(3)) === "RIFF" && String.fromCharCode(b(8), b(9), b(10), b(11)) === "WEBP") return "image/webp";
  if (buf.length >= 14 && b(0) === 0x42 && b(1) === 0x4d) return "image/bmp";
  return null;
}

/** Ikkilik (matn emas) ma'lumotmi: NUL bayt yoki boshqaruv belgilari ko'p. */
export function looksBinary(buf) {
  if (!buf?.length) return false;
  const n = Math.min(buf.length, 8192);
  let ctrl = 0;
  for (let i = 0; i < n; i++) {
    const c = buf[i];
    if (c === 0) return true;
    if (c < 7 || (c > 13 && c < 32 && c !== 27)) ctrl++;
  }
  return ctrl / n > 0.1;
}

const DATA_URL_RE = /^data:(image\/(?:png|jpe?g|gif|webp|bmp));base64,([A-Za-z0-9+/]+={0,2})$/i;

/**
 * Renderer bergan rasm data URL'ini tekshiradi: ruxsat etilgan MIME, toza base64, hajm,
 * va e'lon qilingan MIME bilan haqiqiy baytlar (magic) mosligi.
 * @returns {{ok: true, mime: string, bytes: number} | {error: string}}
 */
export function parseImageDataUrl(url, { maxChars = LIMITS.imageDataUrlChars, mimes = IMAGE_MIMES } = {}) {
  if (typeof url !== "string" || !url) return { error: "bad-image" };
  if (url.length > maxChars) return { error: "too-large" };
  const m = DATA_URL_RE.exec(url);
  if (!m) return { error: "bad-image" };
  const mime = m[1].toLowerCase().replace("image/jpg", "image/jpeg");
  if (!mimes.has(mime)) return { error: "bad-image" };
  const b64 = m[2];
  if (b64.length % 4 !== 0) return { error: "bad-image" };
  const head = Buffer.from(b64.slice(0, 64), "base64");
  if (sniffImage(head) !== mime) return { error: "bad-image" };
  const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return { ok: true, mime, bytes: (b64.length / 4) * 3 - pad };
}

/** Tarix/pufakcha uchun kichik ko'rinish: faqat png/jpeg/webp va ≤ thumbChars; aks holda null. */
export function validThumb(thumb) {
  const r = parseImageDataUrl(thumb, { maxChars: LIMITS.thumbChars, mimes: THUMB_MIMES });
  return r.ok ? thumb : null;
}

/**
 * Native dialog filtrlari uchun kengaytmalar (nuqtasiz) — CLI readAttachment ro'yxatlaridan.
 * .env ro'yxatda yo'q: u himoyalangan (sirlar) va baribir rad etiladi.
 */
export function dialogExtensions() {
  const strip = (set) => [...set].map((e) => e.slice(1)).filter((e) => e && e !== "env");
  return { image: strip(IMAGE_EXT), text: strip(TEXT_EXT), pdf: ["pdf"] };
}

const isUnc = (p) => /^[\\/]{2}/.test(p);

/**
 * Foydalanuvchi tanlagan yo'lni tekshiradi (symlink realpath bilan).
 * @returns {{real: string, size: number} | {error: string}}
 */
export function checkPickedPath(p) {
  if (typeof p !== "string" || !p || p.length > 4096 || p.includes("\0")) return { error: "bad-path" };
  if (isUnc(p)) return { error: "unc" };
  let real;
  try {
    lstatSync(p);
    real = realpathSync.native(p);
  } catch (e) {
    return { error: e?.code === "ENOENT" ? "not-found" : "io" };
  }
  if (isUnc(real)) return { error: "unc" };
  // Asl yo'l ham, symlink ko'rsatgan haqiqiy yo'l ham: .ssh, .aws, ~/.sovereign, brauzer, .env ...
  if (isProtected(p, { outside: true }) || isProtected(real, { outside: true })) return { error: "protected" };
  let st;
  try {
    st = statSync(real);
  } catch {
    return { error: "io" };
  }
  if (!st.isFile()) return { error: "not-file" };
  return { real, size: st.size };
}

function readHead(path, n) {
  const fd = openSync(path, "r");
  try {
    const buf = Buffer.alloc(n);
    const got = readSync(fd, buf, 0, n, 0);
    return buf.subarray(0, got);
  } finally {
    closeSync(fd);
  }
}

/**
 * Bitta tanlangan fayl → biriktirma.
 *  - rasm: {kind: "image", name, size, mime, dataUrl} — renderer kichraytiradi va yuborishda qaytaradi;
 *  - matn/PDF: {kind: "file", sub: "text"|"pdf", name, size, chars, truncated, part} — `part` main'da qoladi.
 * opts.pdfText — PDF ajratuvchisini almashtirish (testlar uchun); standart: desktopPdfText.
 * @returns {Promise<{item: object} | {error: string, name: string}>}
 */
export async function readPicked(p, opts = {}) {
  const name = safeName(basename(String(p ?? ""))) || "?";
  const chk = checkPickedPath(p);
  if (chk.error) return { error: chk.error, name };
  const kind = attachmentKind(chk.real) ?? attachmentKind(p);
  if (!kind) return { error: "unsupported", name };
  if (chk.size === 0) return { error: "empty", name };
  try {
    if (kind === "image") {
      if (chk.size > LIMITS.imageSourceBytes) return { error: "too-large", name };
      const buf = readFileSync(chk.real);
      const mime = sniffImage(buf);
      if (!mime) return { error: "bad-image", name };
      return { item: { kind: "image", name, size: buf.length, mime, dataUrl: `data:${mime};base64,${buf.toString("base64")}` } };
    }
    if (kind === "text") {
      if (chk.size > TEXT_MAX_BYTES) return { error: "too-large", name };
      if (looksBinary(readHead(chk.real, 8192))) return { error: "binary", name };
      const r = await readAttachment(chk.real, { maxChars: LIMITS.fileTextChars });
      return { item: fileItem("text", name, chk.size, r) };
    }
    // PDF
    if (chk.size > PDF_MAX_BYTES) return { error: "too-large", name };
    if (readHead(chk.real, 5).toString("latin1") !== "%PDF-") return { error: "bad-pdf", name };
    // Ajratuvchi xato bersa — fayl buzilgan yoki parolli ("pdf-unreadable"); modul umuman yo'q bo'lsa — "pdf-unavailable".
    let parseFailed = false;
    const extract = opts.pdfText ?? desktopPdfText;
    const pdfText = async (buf) => {
      try {
        return await extract(buf);
      } catch (e) {
        parseFailed = true;
        throw e;
      }
    };
    const r = await readAttachment(chk.real, { maxChars: LIMITS.fileTextChars, pdfText });
    if (r.unextracted) return { error: parseFailed ? "pdf-unreadable" : "pdf-unavailable", name };
    if (!/\S/.test(String(r.part?.text ?? "").replace(/^\[PDF: [^\]]*\]|\[\/PDF\]$/g, ""))) return { error: "pdf-empty", name };
    return { item: fileItem("pdf", name, chk.size, r) };
  } catch {
    return { error: "io", name };
  }
}

function fileItem(sub, name, size, r) {
  const text = String(r.part?.text ?? "");
  return { kind: "file", sub, name, size, chars: text.length, truncated: r.truncated === true, part: { type: "text", text } };
}

/** Matn/PDF tarkibi — main'da, id bo'yicha (renderer faqat id va meta'ni biladi). */
export class AttachmentStore {
  constructor(max = LIMITS.storeMax) {
    this.max = max;
    this.map = new Map();
  }
  add(item) {
    const id = randomUUID();
    this.map.set(id, item);
    while (this.map.size > this.max) this.map.delete(this.map.keys().next().value);
    return id;
  }
  get(id) {
    return typeof id === "string" ? this.map.get(id) ?? null : null;
  }
  discard(id) {
    return typeof id === "string" && this.map.delete(id);
  }
  clear() {
    this.map.clear();
  }
}

/** Renderer'ga qaytadigan ko'rinish: matn tarkibisiz. */
export function publicItem(id, item) {
  if (item.kind === "image") return { id, kind: "image", name: item.name, size: item.size, mime: item.mime, dataUrl: item.dataUrl };
  return { id, kind: "file", sub: item.sub, name: item.name, size: item.size, chars: item.chars, truncated: item.truncated };
}

/**
 * Yuboriladigan user xabari. `list` — renderer'dan: {kind: "file", id} yoki {kind: "image", name, dataUrl, thumb}.
 * Qaytaradi: {content, meta, chars} yoki {error}. Biriktirma yo'q bo'lsa content — oddiy satr (eski yo'l).
 * content massivi: [matn (bo'sh bo'lmasa), ...qismlar] — ro'yxat tartibida.
 */
export function buildUserContent(body, list, store) {
  const text = typeof body === "string" ? body : "";
  if (list == null || (Array.isArray(list) && list.length === 0)) return { content: text, meta: [], chars: 0 };
  if (!Array.isArray(list)) return { error: "bad-request" };
  if (list.length > LIMITS.maxAttachments) return { error: "too-many" };
  const parts = [];
  const meta = [];
  let chars = 0;
  for (const a of list) {
    if (!a || typeof a !== "object") return { error: "bad-request" };
    if (a.kind === "image") {
      const r = parseImageDataUrl(a.dataUrl);
      if (!r.ok) return { error: r.error };
      chars += a.dataUrl.length;
      parts.push({ type: "image_url", image_url: { url: a.dataUrl } });
      const thumb = validThumb(a.thumb);
      meta.push({ kind: "image", name: safeName(a.name) || "image", size: r.bytes, ...(thumb ? { thumb } : {}) });
    } else if (a.kind === "file") {
      const it = store?.get(a.id);
      if (!it || it.kind !== "file") return { error: "expired" };
      chars += it.part.text.length;
      parts.push(it.part);
      meta.push({ kind: "file", sub: it.sub, name: it.name, size: it.size, ...(it.truncated ? { truncated: true } : {}) });
    } else return { error: "bad-request" };
    if (chars > LIMITS.totalChars) return { error: "too-large-total" };
  }
  const content = text.trim() ? [{ type: "text", text }, ...parts] : parts;
  return { content, meta, chars };
}

/** Xabar tarkibidan faqat matn (satr yoki massivdagi text qismlari). */
export function textOf(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.filter((p) => p?.type === "text" && typeof p.text === "string").map((p) => p.text).join("\n\n");
}

/** Foydalanuvchi matni (birinchi text qismi) oxiriga blok qo'shadi — satr ham, massiv ham. */
export function appendText(content, extra) {
  if (typeof content === "string" || content == null) return `${content ?? ""}\n\n${extra}`;
  if (!Array.isArray(content)) return content;
  const i = content.findIndex((p) => p?.type === "text");
  // Faqat rasm/fayl (matnsiz) xabar — foydalanuvchi matni qismi boshiga qo'yiladi.
  if (i !== 0) return [{ type: "text", text: extra }, ...content];
  return content.map((p, n) => (n === 0 ? { ...p, text: `${p.text}\n\n${extra}` } : p));
}

const isImagePart = (p) => p?.type === "image_url";

/**
 * Serverga qayta yuboriladigan rasmlar byudjeti: eng yangi xabardan boshlab rasmlar `maxChars`
 * gacha saqlanadi, eskilari matnli belgi bilan almashtiriladi (butun so'rov 1.5 MB dan oshmasin).
 * Asl massiv o'zgartirilmaydi.
 */
export function budgetImages(messages, maxChars = LIMITS.historyImageChars) {
  let used = 0;
  let changed = false;
  const out = messages.slice();
  for (let i = out.length - 1; i >= 0; i--) {
    const m = out[i];
    if (!Array.isArray(m?.content) || !m.content.some(isImagePart)) continue;
    let dropped = false;
    const content = m.content.map((p) => {
      if (!isImagePart(p)) return p;
      const len = String(p.image_url?.url ?? "").length;
      if (used + len <= maxChars) {
        used += len;
        return p;
      }
      dropped = true;
      return { type: "text", text: IMAGE_PLACEHOLDER };
    });
    if (dropped) {
      out[i] = { ...m, content };
      changed = true;
    }
  }
  return changed ? out : messages;
}

/**
 * Rasmni ko'rmaydigan (vision'siz) mahalliy model uchun: rasm qismlari belgi bilan almashtiriladi
 * va massivlar oddiy satrga aylantiriladi. Qaytaradi: {messages, dropped}.
 */
export function stripImages(messages) {
  let dropped = 0;
  const out = messages.map((m) => {
    if (!Array.isArray(m?.content)) return m;
    const texts = m.content.map((p) => {
      if (isImagePart(p)) {
        dropped++;
        return IMAGE_NO_VISION;
      }
      return typeof p?.text === "string" ? p.text : "";
    });
    return { ...m, content: texts.filter(Boolean).join("\n\n") };
  });
  return { messages: out, dropped };
}

/** Oxirgi user xabaridagi rasmlar soni (mahalliy model ogohlantirishi uchun). */
export function imagesInLastUser(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role !== "user") continue;
    return Array.isArray(m.content) ? m.content.filter(isImagePart).length : 0;
  }
  return 0;
}

// ---- Tarix (history.mjs) --------------------------------------------------------

/**
 * Diskka yoziladigan xabar tarkibi: rasmlar (katta base64) → belgi; matn qismlari `maxText` bilan
 * kesiladi; butun xabar matni `maxTotal` dan oshmaydi.
 */
export function persistableContent(content, cut, maxTotal = 60_000) {
  if (!Array.isArray(content)) return typeof content === "string" ? cut(content) : content;
  let total = 0;
  const out = [];
  for (const p of content) {
    if (isImagePart(p)) {
      out.push({ type: "text", text: IMAGE_HISTORY_PLACEHOLDER });
      continue;
    }
    if (p?.type !== "text" || typeof p.text !== "string") continue;
    if (total >= maxTotal) continue;
    const text = cut(p.text).slice(0, maxTotal - total);
    total += text.length;
    out.push({ type: "text", text });
  }
  return out;
}

/** "user" hodisasidagi biriktirmalar meta'si — xavfsiz shakl (tarixdan o'qilganda ham). */
export function sanitizeMeta(list, { keepThumbs = true } = {}) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const a of list.slice(0, LIMITS.maxAttachments)) {
    if (!a || typeof a !== "object") continue;
    const kind = a.kind === "image" ? "image" : "file";
    const size = Number.isFinite(a.size) && a.size >= 0 ? Math.round(a.size) : 0;
    const item = { kind, name: safeName(a.name) || (kind === "image" ? "image" : "file"), size };
    if (kind === "file") {
      item.sub = a.sub === "pdf" ? "pdf" : "text";
      if (a.truncated === true) item.truncated = true;
    } else if (keepThumbs) {
      const thumb = validThumb(a.thumb);
      if (thumb) item.thumb = thumb;
    }
    out.push(item);
  }
  return out;
}

/**
 * Tarix hodisalari: rasm ko'rinishlari soni cheklanadi (eng yangilari saqlanadi) — fayl hajmi
 * chegaralangan qoladi (≈ maxThumbs × 48 KB).
 */
export function boundThumbs(events, maxThumbs = 24) {
  let left = maxThumbs;
  const out = events.slice();
  for (let i = out.length - 1; i >= 0; i--) {
    const ev = out[i];
    if (ev?.type !== "user" || !Array.isArray(ev.attachments) || !ev.attachments.length) continue;
    const attachments = ev.attachments.map((a) => {
      if (!a?.thumb) return a;
      if (left > 0) {
        left--;
        return a;
      }
      const { thumb: _t, ...rest } = a;
      return rest;
    });
    out[i] = { ...ev, attachments: sanitizeMeta(attachments) };
  }
  return out;
}
