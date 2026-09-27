/**
 * Model javobini XAVFSIZ HTML ga aylantirish — sof (vscode'siz) mantiq, `node --test` bilan sinaladi.
 *
 * Model chiqishi ISHONCHSIZ ma'lumot deb qaraladi:
 *   - hech qanday xom HTML o'tkazilmaydi (hammasi avval ekranlanadi),
 *   - faqat belgilangan teglar chiqadi: p, br, strong, em, code, pre, ul, ol, li, blockquote,
 *     h1–h6, hr, a, div/span (sinf nomlari biz beramiz),
 *   - havolalar faqat `https://` — `javascript:`, `data:`, `vscode:`, `file:` va boshqalar
 *     havola qilinmaydi (oddiy matn bo'lib qoladi),
 *   - `on*` atributlari, `style`, `srcdoc` kabi narsalar hech qachon yozilmaydi,
 *   - kod bloklarining XOM matni HTML ichiga atribut sifatida joylanmaydi: alohida massivda
 *     qaytariladi, webview esa indeks bo'yicha oladi (Copy / Apply tugmalari uchun).
 */

export interface CodeBlock {
  lang: string;
  code: string;
}

export interface RenderedMarkdown {
  html: string;
  codeBlocks: CodeBlock[];
}

export interface MarkdownLabels {
  copy: string;
  apply: string;
  applyHint: string;
}

const PLACEHOLDER = "\u0001";

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Faqat https (va aniq bitta istisno: hech qanday istisno yo'q). */
export function isSafeLink(url: string): boolean {
  return /^https:\/\/[^\s<>"'`]+$/i.test(url) && !/[\u0000-\u001f]/.test(url);
}

/** Satr ichidagi belgilash: `kod`, **qalin**, *kursiv*, [matn](https://…), yalang'och https havola. */
export function renderInline(raw: string): string {
  const codes: string[] = [];
  let text = raw.replace(/[\u0000\u0001]/g, "");

  // 1) Satr ichidagi kodni himoyalaymiz — ichida ** yoki [ ]( ) bo'lsa ham tegmaydi.
  text = text.replace(/`([^`\n]+)`/g, (_m, code: string) => {
    codes.push(code);
    return `${PLACEHOLDER}${codes.length - 1}${PLACEHOLDER}`;
  });

  // 2) Hamma narsani ekranlaymiz — bundan keyin xom HTML mumkin emas.
  text = escapeHtml(text);

  // 3) [matn](https://…)
  text = text.replace(
    /\[([^\]\n]{1,300})\]\(([^\s)]{1,600})\)/g,
    (m, label: string, url: string) => {
      const href = url.replace(/&amp;/g, "&");
      if (!isSafeLink(href)) return m; // xavfsiz emas — oddiy matn bo'lib qoladi
      return `<a href="${escapeHtml(href)}" data-ext="1">${label}</a>`;
    },
  );

  // 4) Yalang'och https havolalar (allaqachon <a> ichiga kirganlaridan tashqari).
  text = text.replace(
    /(^|[\s(])(https:\/\/[^\s<>"'`)\]]{3,600})/g,
    (m, lead: string, url: string) => {
      const href = url.replace(/&amp;/g, "&");
      if (!isSafeLink(href)) return m;
      return `${lead}<a href="${escapeHtml(href)}" data-ext="1">${escapeHtml(href)}</a>`;
    },
  );

  // 5) Qalin / kursiv.
  text = text.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
  text = text.replace(/(^|[^_\w])_([^_\n]+)_(?!_)/g, "$1<em>$2</em>");

  // 6) Kodni qaytaramiz (ekranlangan holda).
  text = text.replace(new RegExp(`${PLACEHOLDER}(\\d+)${PLACEHOLDER}`, "g"), (_m, i: string) => {
    const code = codes[Number(i)] ?? "";
    return `<code>${escapeHtml(code)}</code>`;
  });

  return text;
}

const FENCE = /^(\s{0,3})(`{3,}|~{3,})\s*([A-Za-z0-9_+#.-]{0,30})\s*$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const HR = /^\s{0,3}(?:(?:-\s*){3,}|(?:\*\s*){3,}|(?:_\s*){3,})$/;
const UL = /^(\s*)[-*+]\s+(.*)$/;
const OL = /^(\s*)\d{1,9}[.)]\s+(.*)$/;
const QUOTE = /^\s{0,3}>\s?(.*)$/;

/**
 * Markdown → xavfsiz HTML. `labels` berilmasa kod bloklari tugmasiz chiqadi
 * (mas. testda yoki matn ko'rinishida). `startIndex` — kod bloklari raqamlanishi
 * suhbat bo'yicha yagona bo'lishi uchun (Copy / Apply indeks bo'yicha ishlaydi).
 */
export function renderMarkdown(source: string, labels?: MarkdownLabels, startIndex = 0): RenderedMarkdown {
  const lines = String(source ?? "").replace(/\r\n?/g, "\n").split("\n");
  const codeBlocks: CodeBlock[] = [];
  const out: string[] = [];
  let i = 0;

  const flushParagraph = (buf: string[]) => {
    if (!buf.length) return;
    out.push(`<p>${buf.map(renderInline).join("<br>")}</p>`);
    buf.length = 0;
  };

  const paragraph: string[] = [];

  while (i < lines.length) {
    const line = lines[i];
    const fence = FENCE.exec(line);

    if (fence) {
      flushParagraph(paragraph);
      const marker = fence[2][0];
      const minLen = fence[2].length;
      const lang = fence[3] ?? "";
      const body: string[] = [];
      i++;
      while (i < lines.length) {
        const close = new RegExp(`^\\s{0,3}${marker === "`" ? "`" : "~"}{${minLen},}\\s*$`);
        if (close.test(lines[i])) {
          i++;
          break;
        }
        body.push(lines[i]);
        i++;
      }
      const code = body.join("\n");
      const index = startIndex + codeBlocks.length;
      codeBlocks.push({ lang, code });
      out.push(renderCodeBlock(index, lang, code, labels));
      continue;
    }

    if (!line.trim()) {
      flushParagraph(paragraph);
      i++;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      flushParagraph(paragraph);
      const level = heading[1].length;
      out.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      i++;
      continue;
    }

    if (HR.test(line)) {
      flushParagraph(paragraph);
      out.push("<hr>");
      i++;
      continue;
    }

    if (QUOTE.test(line)) {
      flushParagraph(paragraph);
      const items: string[] = [];
      while (i < lines.length) {
        const q = QUOTE.exec(lines[i]);
        if (!q) break;
        items.push(q[1]);
        i++;
      }
      out.push(`<blockquote>${items.map(renderInline).join("<br>")}</blockquote>`);
      continue;
    }

    if (UL.test(line) || OL.test(line)) {
      flushParagraph(paragraph);
      const ordered = OL.test(line) && !UL.test(line);
      const items: string[] = [];
      while (i < lines.length) {
        const m = ordered ? OL.exec(lines[i]) : UL.exec(lines[i]);
        if (!m) break;
        items.push(`<li>${renderInline(m[2])}</li>`);
        i++;
      }
      out.push(ordered ? `<ol>${items.join("")}</ol>` : `<ul>${items.join("")}</ul>`);
      continue;
    }

    paragraph.push(line);
    i++;
  }
  flushParagraph(paragraph);

  return { html: out.join("\n"), codeBlocks };
}

function renderCodeBlock(index: number, lang: string, code: string, labels?: MarkdownLabels): string {
  const safeLang = /^[A-Za-z0-9_+#.-]{0,30}$/.test(lang) ? lang : "";
  const head = labels
    ? `<div class="code-head">` +
      `<span class="code-lang">${escapeHtml(safeLang)}</span>` +
      `<span class="code-actions">` +
      `<button type="button" class="code-btn" data-act="copy" data-index="${index}">${escapeHtml(labels.copy)}</button>` +
      `<button type="button" class="code-btn" data-act="apply" data-index="${index}" title="${escapeHtml(labels.applyHint)}">${escapeHtml(labels.apply)}</button>` +
      `</span></div>`
    : "";
  return `<div class="code-block" data-index="${index}">${head}<pre><code>${escapeHtml(code)}</code></pre></div>`;
}

/** Faqat matn kerak bo'lganda (mas. bildirishnomada). */
export function stripMarkdown(source: string): string {
  return String(source ?? "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/[*_#>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
