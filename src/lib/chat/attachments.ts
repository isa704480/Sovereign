"use client";

import { DEFAULT_LANG, fmt, translate, type Lang } from "@/lib/i18n";

export type AttachmentKind = "image" | "pdf" | "text" | "audio" | "video" | "other";

export interface Attachment {
  id: string;
  name: string;
  mime: string;
  size: number;
  kind: AttachmentKind;
  /** For images: base64 data URL sent to the vision model. */
  dataUrl?: string;
  /** For pdf/text: extracted text content fed to the model. */
  text?: string;
  /** For audio/video: object URL for local preview only. */
  previewUrl?: string;
}

const MAX_IMAGE = 8 * 1024 * 1024; // 8MB
const MAX_TEXT = 2 * 1024 * 1024;
const MAX_PDF = 20 * 1024 * 1024;

function kindOf(mime: string, name: string): AttachmentKind {
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf" || name.toLowerCase().endsWith(".pdf")) return "pdf";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  if (
    mime.startsWith("text/") ||
    /\.(txt|md|markdown|json|csv|tsv|js|ts|tsx|jsx|py|java|c|cpp|cs|go|rs|rb|php|html|css|scss|sql|yml|yaml|xml|sh|env)$/i.test(name)
  )
    return "text";
  return "other";
}

const readAsDataURL = (file: File, lang: Lang) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error(translate(lang, "chFileReadFailed")));
    r.readAsDataURL(file);
  });

const readAsText = (file: File, lang: Lang) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error(translate(lang, "chFileReadFailed")));
    r.readAsText(file);
  });

async function extractPdf(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  // Bundle the worker as an asset (Next/Turbopack resolves new URL(..., import.meta.url)).
  try {
    (pdfjs as unknown as { GlobalWorkerOptions: { workerSrc: string } }).GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).href;
  } catch {
    /* fall back to default worker resolution */
  }
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const pages: string[] = [];
  const max = Math.min(doc.numPages, 30);
  for (let i = 1; i <= max; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((it) => ("str" in it ? it.str : "")).join(" ");
    pages.push(text);
  }
  return pages.join("\n\n").slice(0, 40_000);
}

export const uuid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);

/** Reads a File into an Attachment, extracting text/images as needed. `lang` — xato matnlari tili. */
export async function processFile(file: File, lang: Lang = DEFAULT_LANG): Promise<Attachment> {
  const kind = kindOf(file.type, file.name);
  const base: Attachment = { id: uuid(), name: file.name, mime: file.type, size: file.size, kind };

  if (kind === "image") {
    if (file.size > MAX_IMAGE) throw new Error(fmt(translate(lang, "chImageTooBig"), { name: file.name }));
    base.dataUrl = await readAsDataURL(file, lang);
    return base;
  }
  if (kind === "text") {
    if (file.size > MAX_TEXT) throw new Error(fmt(translate(lang, "chTextTooBig"), { name: file.name }));
    base.text = (await readAsText(file, lang)).slice(0, 40_000);
    return base;
  }
  if (kind === "pdf") {
    if (file.size > MAX_PDF) throw new Error(fmt(translate(lang, "chPdfTooBig"), { name: file.name }));
    try {
      base.text = await extractPdf(file);
    } catch {
      base.text = "";
    }
    // Skaner yoki parolli PDF: matn yo'q — jimgina tashlab yubormasdan foydalanuvchiga aytamiz.
    if (!base.text?.trim()) throw new Error(fmt(translate(lang, "pnKbNoText"), { name: file.name }));
    return base;
  }
  if (kind === "audio" || kind === "video") {
    // Transcribe via /api/transcribe. Tarmoq uzilsa — faqat preview qoladi;
    // server rad etsa (Pro tarif, limit, hajm) — sababini foydalanuvchiga ko'rsatamiz.
    if (file.size > 0 && file.size <= 25 * 1024 * 1024) {
      const form = new FormData();
      form.append("file", file, file.name);
      // Whisper til ishorasi — interfeys tili (uz-cyrl ham "uz").
      form.append("language", lang.slice(0, 2));
      let res: Response | null = null;
      try {
        res = await fetch("/api/transcribe", { method: "POST", body: form });
      } catch {
        /* keep preview-only */
      }
      if (res && res.ok) {
        const data = (await res.json().catch(() => ({}))) as { text?: string };
        if (data.text) base.text = data.text.slice(0, 40_000);
      } else if (res) {
        // 5xx matni ichki tafsilot bo'lishi mumkin — faqat 4xx xabari (server tarjima qilgan) ko'rsatiladi.
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        const reason = res.status < 500 && data.error ? data.error : translate(lang, "chTranscribeFailed");
        throw new Error(`${file.name}: ${reason}`);
      }
    }
    base.previewUrl = URL.createObjectURL(file);
    return base;
  }
  return base;
}

/** Builds the OpenAI-style message content (string or multimodal array). */
export function buildUserContent(text: string, attachments: Attachment[], lang: Lang = DEFAULT_LANG): string | unknown[] {
  const images = attachments.filter((a) => a.kind === "image" && a.dataUrl);
  const docs = attachments.filter((a) => (a.kind === "pdf" || a.kind === "text") && a.text);
  const media = attachments.filter((a) => a.kind === "audio" || a.kind === "video");
  // Sahifa yangilangach localStorage'dan tiklangan xabarlarda fayl mazmuni yo'q (faqat nomi):
  // model faylni "ko'rgandek" to'qib javob bermasin — yo'qligini aytamiz.
  const missing = attachments.filter(
    (a) => (a.kind === "image" && !a.dataUrl) || ((a.kind === "pdf" || a.kind === "text") && !a.text),
  );

  let prefix = "";
  for (const m of missing) {
    prefix += `\n\n[Fayl endi mavjud emas: ${m.name} — mazmuni yuborilmadi. Kerak bo'lsa foydalanuvchidan faylni qayta biriktirishni so'ra.]`;
  }
  for (const d of docs) {
    prefix += `\n\n[Fayl: ${d.name}]\n${d.text}\n[/Fayl]`;
  }
  for (const m of media) {
    if (m.text) {
      prefix += `\n\n[TRANSKRIPT: ${m.name}]\n${m.text}\n[/TRANSKRIPT]`;
    } else {
      prefix += `\n\n[Media fayl biriktirildi: ${m.name} (${m.mime}). Transkripsiya olinmadi.]`;
    }
  }
  const full = (text + prefix).trim();

  if (!images.length) return full;

  return [
    { type: "text", text: full || translate(lang, "chImageOnlyPrompt") },
    ...images.map((img) => ({ type: "image_url", image_url: { url: img.dataUrl } })),
  ];
}

export function attachmentGlyph(kind: AttachmentKind): string {
  return kind === "image" ? "🖼️" : kind === "pdf" ? "📄" : kind === "audio" ? "🎵" : kind === "video" ? "🎬" : "📎";
}
