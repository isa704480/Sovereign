/**
 * Modelga yuboriladigan KONTEKSTni yig'ish — sof (vscode'siz) mantiq, `node --test` bilan sinaladi.
 *
 * Qoida: butun ish papkasi HECH QACHON yuborilmaydi. Faqat
 *   - fayl yo'li (ish papkasiga nisbatan),
 *   - til identifikatori,
 *   - belgilangan joy va uning atrofidagi eng ko'pi bilan `maxLines` qator,
 *   - kerak bo'lsa — muharrir ko'rsatgan diagnostika matni.
 * Ustiga belgilar bo'yicha qattiq chegara (serverda bitta xabar 40 000 belgidan oshmasligi kerak).
 */

/** Bitta xabar uchun qattiq chegara — server 40 000 belgida rad etadi, zaxira bilan olamiz. */
export const MAX_SNIPPET_CHARS = 24_000;

/** `maxLines` sozlamasi uchun ruxsat etilgan oraliq. */
export const MIN_CONTEXT_LINES = 0;
export const MAX_CONTEXT_LINES = 600;
export const DEFAULT_CONTEXT_LINES = 120;

export interface EditorSnapshot {
  /** Ish papkasiga nisbatan yo'l (yoki fayl nomi). Absolyut yo'l yuborilmaydi. */
  filePath: string;
  languageId: string;
  /** Hujjatning barcha qatorlari. */
  lines: readonly string[];
  /** 0-dan boshlanadigan, ikki tomoni ham kiruvchi oraliq. Belgilanmagan bo'lsa — kursor qatori. */
  selectionStartLine: number;
  selectionEndLine: number;
  hasSelection: boolean;
}

export interface BuiltContext {
  filePath: string;
  languageId: string;
  /** Yuboriladigan kod parchasi. */
  snippet: string;
  /** Parchaning 1-dan boshlanadigan qator oralig'i (foydalanuvchiga ko'rsatiladi). */
  startLine: number;
  endLine: number;
  /** Belgilangan matn (bo'lsa) — parchadan alohida, kesilgan bo'lishi mumkin. */
  selectionText: string;
  hasSelection: boolean;
  /** Qator yoki belgi chegarasi tufayli matn kesildimi. */
  truncated: boolean;
  totalLines: number;
}

export interface DiagnosticContext {
  message: string;
  severity: string;
  source?: string;
  code?: string;
  line: number;
}

export function clampContextLines(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return DEFAULT_CONTEXT_LINES;
  return Math.min(MAX_CONTEXT_LINES, Math.max(MIN_CONTEXT_LINES, n));
}

/**
 * Absolyut yo'lni ish papkasiga nisbatan qisqartiradi. Papkadan tashqarida bo'lsa —
 * faqat fayl nomi (uy katalogi nomi, foydalanuvchi ismi va h.k. oshkor bo'lmasin).
 */
export function relativeFilePath(fsPath: string, workspaceRoot?: string): string {
  const norm = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "");
  const file = norm(fsPath);
  const root = workspaceRoot ? norm(workspaceRoot) : "";
  if (root && (file === root || file.toLowerCase().startsWith(root.toLowerCase() + "/"))) {
    return file.slice(root.length + 1) || file.split("/").pop() || file;
  }
  return file.split("/").pop() || file;
}

function clipChars(text: string, limit: number): { text: string; truncated: boolean } {
  if (text.length <= limit) return { text, truncated: false };
  const head = Math.floor(limit * 0.6);
  const tail = limit - head;
  return {
    text: `${text.slice(0, head)}\n… (${text.length - limit} belgi tashlab ketildi / characters omitted) …\n${text.slice(text.length - tail)}`,
    truncated: true,
  };
}

/**
 * Belgilangan joy (yoki kursor qatori) atrofidan chegaralangan parcha.
 * Belgilangan joyning o'zi `maxLines` dan uzun bo'lsa — boshi va oxiri saqlanadi.
 */
export function buildContext(snap: EditorSnapshot, maxLinesRaw: number): BuiltContext {
  const maxLines = clampContextLines(maxLinesRaw);
  const total = snap.lines.length;
  const lastIndex = Math.max(0, total - 1);
  const selStart = Math.min(Math.max(0, snap.selectionStartLine | 0), lastIndex);
  const selEnd = Math.min(Math.max(selStart, snap.selectionEndLine | 0), lastIndex);
  const selectionRaw = total ? snap.lines.slice(selStart, selEnd + 1).join("\n") : "";

  if (maxLines === 0 || total === 0) {
    return {
      filePath: snap.filePath,
      languageId: snap.languageId,
      snippet: "",
      startLine: selStart + 1,
      endLine: selEnd + 1,
      selectionText: snap.hasSelection ? clipChars(selectionRaw, MAX_SNIPPET_CHARS).text : "",
      hasSelection: snap.hasSelection,
      truncated: total > 0,
      totalLines: total,
    };
  }

  const selLines = selEnd - selStart + 1;
  let truncated = false;
  let startLine: number;
  let endLine: number;
  let body: string;

  if (selLines > maxLines) {
    // Belgilangan joy o'zi juda uzun — boshi va oxiri.
    const head = Math.max(1, Math.floor(maxLines / 2));
    const tail = Math.max(1, maxLines - head);
    const headText = snap.lines.slice(selStart, selStart + head).join("\n");
    const tailText = snap.lines.slice(selEnd - tail + 1, selEnd + 1).join("\n");
    const skipped = selLines - head - tail;
    body = `${headText}\n… (${skipped} qator tashlab ketildi / lines omitted) …\n${tailText}`;
    startLine = selStart + 1;
    endLine = selEnd + 1;
    truncated = true;
  } else {
    // Belgilangan joy + atrofidagi qatorlar, `maxLines` ichida.
    const pad = maxLines - selLines;
    const before = Math.floor(pad / 2);
    const after = pad - before;
    let from = Math.max(0, selStart - before);
    let to = Math.min(lastIndex, selEnd + after);
    // Bir tomonda joy qolmasa — ikkinchi tomondan to'ldiramiz.
    if (to - from + 1 < maxLines) {
      from = Math.max(0, to - maxLines + 1);
      to = Math.min(lastIndex, from + maxLines - 1);
    }
    body = snap.lines.slice(from, to + 1).join("\n");
    startLine = from + 1;
    endLine = to + 1;
    truncated = from > 0 || to < lastIndex;
  }

  const clipped = clipChars(body, MAX_SNIPPET_CHARS);
  const selClipped = clipChars(selectionRaw, Math.min(MAX_SNIPPET_CHARS, 12_000));

  return {
    filePath: snap.filePath,
    languageId: snap.languageId,
    snippet: clipped.text,
    startLine,
    endLine,
    selectionText: snap.hasSelection ? selClipped.text : "",
    hasSelection: snap.hasSelection,
    truncated: truncated || clipped.truncated,
    totalLines: total,
  };
}

/** Model tushunadigan, ortiqcha ma'lumotsiz kontekst bloki. */
export function renderContextBlock(ctx: BuiltContext, diagnostic?: DiagnosticContext): string {
  const parts: string[] = [];
  parts.push(`File: ${ctx.filePath}`);
  parts.push(`Language: ${ctx.languageId}`);
  parts.push(`Lines ${ctx.startLine}-${ctx.endLine} of ${ctx.totalLines}${ctx.truncated ? " (truncated)" : ""}`);
  if (diagnostic) {
    const bits = [diagnostic.severity, diagnostic.source, diagnostic.code].filter(Boolean).join(" ");
    parts.push(`Problem at line ${diagnostic.line}: [${bits}] ${diagnostic.message}`);
  }
  const fence = pickFence(ctx.snippet);
  const header = parts.join("\n");
  if (!ctx.snippet) return header;
  return `${header}\n\n${fence}${ctx.languageId}\n${ctx.snippet}\n${fence}`;
}

/** Parcha ichida ``` bo'lsa, tashqi to'siq uzunroq bo'ladi. */
export function pickFence(text: string): string {
  let longest = 0;
  for (const m of text.matchAll(/`{3,}/g)) longest = Math.max(longest, m[0].length);
  return "`".repeat(Math.max(3, longest + 1));
}

/** Chat panelida ko'rsatiladigan qisqa yorliq. */
export function contextLabel(ctx: BuiltContext): string {
  return `${ctx.filePath}:${ctx.startLine}-${ctx.endLine}`;
}
