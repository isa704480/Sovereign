import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { basename, extname } from "node:path";
import { IS_BINARY } from "./version.mjs";

/**
 * "@yo'l" eslatmalari: matndagi @ bilan boshlangan va haqiqatan mavjud bo'lgan
 * fayllarni qaytaradi. Mavjud bo'lmagani (masalan email) oddiy matn bo'lib qoladi.
 */
export function collectMentions(text) {
  const out = [];
  for (const m of text.matchAll(/(?:^|\s)@([^\s@]{1,200})/g)) {
    const p = m[1].replace(/[.,;:)]+$/, "");
    try {
      if (existsSync(p) && statSync(p).isFile() && !out.includes(p)) out.push(p);
    } catch {
      /* o'qib bo'lmadi — o'tkazib yuboramiz */
    }
  }
  return out.slice(0, 5);
}

/** Tab-to'ldirish uchun: `@` dan keyingi bo'lakka mos fayl va papka yo'llari. */
export function completeMention(token) {
  const q = token.slice(1);
  const slash = Math.max(q.lastIndexOf("/"), q.lastIndexOf("\\"));
  const dir = slash >= 0 ? q.slice(0, slash + 1) : "";
  const prefix = slash >= 0 ? q.slice(slash + 1) : q;
  let entries = [];
  try {
    entries = readdirSync(dir || ".", { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => !e.name.startsWith(".") && e.name !== "node_modules")
    .filter((e) => e.name.toLowerCase().startsWith(prefix.toLowerCase()))
    .slice(0, 40)
    .map((e) => `@${dir}${e.name}${e.isDirectory() ? "/" : " "}`);
}

export const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"]);
// Server (/api/cli/chat) butun so'rovni 1 500 000 belgidan oshsa 413 bilan rad etadi.
// Rasm base64'da ~4/3 baravar kattalashadi va tarixda qolib HAR keyingi so'rovda
// qayta yuboriladi — shuning uchun xom hajm ~900 KB bilan cheklanadi (qolgani matn/tarixga).
const IMAGE_MAX_BYTES = 900 * 1024;

/**
 * pdf-parse'dan matn ajratadi. 2.x — `PDFParse` klassi; 1.x — index.js ESM import'da
 * debug rejimiga o'tib test PDF'ini o'qiydi, shuning uchun lib/pdf-parse.js to'g'ridan-to'g'ri.
 * Qaytaradi: { missing: true } (o'rnatilmagan) yoki { text }.
 */
async function extractPdfText(buf) {
  // Binary (Node SEA) ichida tashqi paketlarni dinamik import qilib bo'lmaydi.
  if (IS_BINARY) return { missing: true };
  let mod;
  try {
    mod = await import("pdf-parse");
  } catch {
    return { missing: true };
  }
  return pdfTextFromModule(mod, buf, () => import("pdf-parse/lib/pdf-parse.js"));
}

/**
 * Yuklangan pdf-parse moduli bilan matn ajratish (2.x yoki 1.x). Boshqa joydan import qilingan
 * modul uchun ham ishlaydi — masalan, Cowork (desktop) pdf-parse'ni o'zining app.asar'idan yuklaydi,
 * chunki resources/cli/src yonida node_modules yo'q. loadLegacy — 1.x lib/pdf-parse.js yuklovchisi.
 * PDF ishonchsiz kirish: pdf.js'da eval o'chiq (isEvalSupported: false), shriftlar yuklanmaydi.
 */
export async function pdfTextFromModule(mod, buf, loadLegacy) {
  const PDFParse = mod?.PDFParse ?? mod?.default?.PDFParse;
  if (typeof PDFParse === "function") {
    const parser = new PDFParse({ data: buf, isEvalSupported: false, disableFontFace: true, useSystemFonts: false });
    try {
      const r = await parser.getText();
      return { text: r?.text ?? "" };
    } finally {
      try {
        await parser.destroy?.();
      } catch {
        /* tozalash xatosi muhim emas */
      }
    }
  }
  let fn = null;
  try {
    const lib = await loadLegacy?.();
    fn = lib?.default ?? lib;
  } catch {
    fn = null;
  }
  if (typeof fn !== "function") throw new Error("pdf-parse API tanilmadi (2.x yoki 1.x kutilgan)");
  const data = await fn(buf);
  return { text: data?.text ?? "" };
}
export const TEXT_EXT = new Set([
  ".txt", ".md", ".markdown", ".json", ".csv", ".tsv", ".xml", ".yml", ".yaml",
  ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".py", ".rb", ".go", ".rs",
  ".c", ".cpp", ".h", ".java", ".cs", ".php", ".sh", ".sql", ".html", ".htm",
  ".css", ".scss", ".vue", ".svelte", ".env",
  ".log", ".ini", ".toml", ".cfg", ".conf", ".kt", ".swift", ".dart", ".lua",
  ".hpp", ".cc", ".scala", ".graphql", ".proto", ".tex", ".rst", ".ps1", ".bat",
]);

/** Matn fayli va PDF hajm chegaralari (readAttachment; Cowork ham shularni ishlatadi). */
export const TEXT_MAX_BYTES = 2 * 1024 * 1024;
export const PDF_MAX_BYTES = 20 * 1024 * 1024;

/**
 * Fayl turi kengaytma bo'yicha: "image" | "text" | "pdf" | null (qo'llab-quvvatlanmaydi).
 * readAttachment() bilan bir xil ro'yxatlar — Cowork (desktop) ham shundan foydalanadi.
 */
export function attachmentKind(path) {
  const ext = extname(String(path ?? "")).toLowerCase();
  if (IMAGE_EXT.has(ext)) return "image";
  if (TEXT_EXT.has(ext)) return "text";
  if (ext === ".pdf") return "pdf";
  return null;
}

export function mimeOf(ext) {
  switch (ext) {
    case ".png": return "image/png";
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    case ".gif": return "image/gif";
    case ".webp": return "image/webp";
    case ".bmp": return "image/bmp";
    case ".pdf": return "application/pdf";
    default: return "application/octet-stream";
  }
}

/**
 * Reads a local file into a multimodal "content part" suitable for OpenAI chat
 * completions. Images become image_url data URLs; text files become inline
 * text blocks. PDFs are read as text via pdf-parse if available; otherwise
 * their bytes are wrapped in a data URL and left for the model to skip.
 * pdfText (ixtiyoriy): (buf) => Promise<{text} | {missing: true}> — tashqaridan berilgan PDF
 * ajratuvchi (Cowork: pdf-parse app.asar'dan). Berilmasa — CLI o'zi pdf-parse'ni import qiladi.
 */
export async function readAttachment(path, { maxChars = 40_000, pdfText } = {}) {
  if (!existsSync(path)) throw new Error(`Fayl topilmadi: ${path}`);
  const st = statSync(path);
  if (!st.isFile()) throw new Error(`Fayl emas: ${path}`);
  const ext = extname(path).toLowerCase();
  const name = basename(path);

  if (IMAGE_EXT.has(ext)) {
    if (st.size > IMAGE_MAX_BYTES) {
      const mb = (st.size / 1024 / 1024).toFixed(1);
      throw new Error(
        `Rasm juda katta (${mb} MB, max 900 KB): ${path} — server 1.5 MB dan katta so'rovni qabul qilmaydi. ` +
          `Rasmni siqing (JPEG/WebP, kichikroq o'lcham yoki skrinshotning kerakli qismi) va qayta biriktiring.`,
      );
    }
    const buf = readFileSync(path);
    const b64 = buf.toString("base64");
    return {
      kind: "image",
      part: { type: "image_url", image_url: { url: `data:${mimeOf(ext)};base64,${b64}` } },
      label: `🖼️  ${name}`,
    };
  }
  if (TEXT_EXT.has(ext)) {
    if (st.size > TEXT_MAX_BYTES) throw new Error(`Matn fayli juda katta (max 2MB): ${path}`);
    const full = readFileSync(path, "utf8");
    const text = full.slice(0, maxChars);
    return {
      kind: "text",
      part: { type: "text", text: `[FAYL: ${name}]\n${text}\n[/FAYL]` },
      label: `📄  ${name}`,
      truncated: full.length > maxChars,
    };
  }
  if (ext === ".pdf") {
    if (st.size > PDF_MAX_BYTES) throw new Error(`PDF juda katta (max 20MB): ${path}`);
    // Ixtiyoriy pdf-parse; o'rnatilmagan yoki xato bo'lsa — modelga va foydalanuvchiga aniq sabab.
    let note;
    try {
      const r = await (typeof pdfText === "function" ? pdfText : extractPdfText)(readFileSync(path));
      if (!r.missing) {
        const text = (r.text || "").slice(0, maxChars);
        return {
          kind: "text",
          part: { type: "text", text: `[PDF: ${name}]\n${text}\n[/PDF]` },
          label: `📕  ${name}`,
          truncated: (r.text || "").length > maxChars,
        };
      }
      note = IS_BINARY
        ? "Matn ajratilmadi — binary versiyada PDF o'qish yo'q; npm versiyasini (Node 20+) va 'npm i -g pdf-parse@2' ishlating"
        : "Matn ajratilmadi — 'npm i -g pdf-parse@2' o'rnating";
    } catch (err) {
      note = `Matn ajratilmadi — pdf-parse xatosi: ${String(err?.message || err).slice(0, 200)}`;
    }
    return {
      kind: "text",
      part: { type: "text", text: `[PDF fayl biriktirildi: ${name}. ${note}.]` },
      label: `📕  ${name} (${note})`,
      // Matn ajratilmadi — Cowork bunday PDF'ni yubormaydi (foydalanuvchiga aniq xabar beriladi).
      unextracted: true,
    };
  }
  throw new Error(`Qo'llab-quvvatlanmaydigan fayl turi: ${ext || "?"} (${path})`);
}
