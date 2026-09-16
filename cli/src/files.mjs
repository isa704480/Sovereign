import { readFileSync, existsSync, statSync } from "node:fs";
import { basename, extname } from "node:path";

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"]);
const TEXT_EXT = new Set([
  ".txt", ".md", ".markdown", ".json", ".csv", ".tsv", ".xml", ".yml", ".yaml",
  ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".py", ".rb", ".go", ".rs",
  ".c", ".cpp", ".h", ".java", ".cs", ".php", ".sh", ".sql", ".html", ".htm",
  ".css", ".scss", ".vue", ".svelte", ".env",
]);

function mimeOf(ext) {
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
 */
export async function readAttachment(path) {
  if (!existsSync(path)) throw new Error(`Fayl topilmadi: ${path}`);
  const st = statSync(path);
  if (!st.isFile()) throw new Error(`Fayl emas: ${path}`);
  const ext = extname(path).toLowerCase();
  const name = basename(path);

  if (IMAGE_EXT.has(ext)) {
    if (st.size > 8 * 1024 * 1024) throw new Error(`Rasm juda katta (max 8MB): ${path}`);
    const buf = readFileSync(path);
    const b64 = buf.toString("base64");
    return {
      kind: "image",
      part: { type: "image_url", image_url: { url: `data:${mimeOf(ext)};base64,${b64}` } },
      label: `🖼️  ${name}`,
    };
  }
  if (TEXT_EXT.has(ext)) {
    if (st.size > 2 * 1024 * 1024) throw new Error(`Matn fayli juda katta (max 2MB): ${path}`);
    const text = readFileSync(path, "utf8").slice(0, 40_000);
    return {
      kind: "text",
      part: { type: "text", text: `[FAYL: ${name}]\n${text}\n[/FAYL]` },
      label: `📄  ${name}`,
    };
  }
  if (ext === ".pdf") {
    if (st.size > 20 * 1024 * 1024) throw new Error(`PDF juda katta (max 20MB): ${path}`);
    // Try optional pdf-parse; if it's not installed, just tell the model.
    try {
      const mod = await import("pdf-parse").catch(() => null);
      if (mod) {
        const buf = readFileSync(path);
        const data = await (mod.default || mod)(buf);
        const text = (data.text || "").slice(0, 40_000);
        return {
          kind: "text",
          part: { type: "text", text: `[PDF: ${name}]\n${text}\n[/PDF]` },
          label: `📕  ${name}`,
        };
      }
    } catch {
      /* fall through */
    }
    return {
      kind: "text",
      part: { type: "text", text: `[PDF fayl biriktirildi: ${name}. Matn ajratilmadi — 'npm i -g pdf-parse' o'rnating.]` },
      label: `📕  ${name}`,
    };
  }
  throw new Error(`Qo'llab-quvvatlanmaydigan fayl turi: ${ext || "?"} (${path})`);
}
