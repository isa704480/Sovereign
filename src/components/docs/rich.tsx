import type { ReactNode } from "react";

/**
 * Tarjima satrlaridagi yengil belgilashni React tugunlariga aylantiradi:
 *   **qalin**, `kod`, [matn](havola). "#..." — sahifa ichidagi langar.
 * HTML hech qachon talqin qilinmaydi (dangerouslySetInnerHTML yo'q) — faqat matn.
 */
const TOKEN = /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;

const codeClass =
  "rounded-md border border-border bg-bg-elevated px-1.5 py-0.5 font-mono text-[0.85em] text-text-primary [overflow-wrap:anywhere]";
const extLinkClass =
  "font-medium text-primary-soft underline decoration-primary-soft/40 underline-offset-[3px] hover:text-text-primary";
const anchorClass = "text-primary-soft hover:text-text-primary";

export function rich(text: string, keyPrefix = "r"): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(TOKEN)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const key = `${keyPrefix}${i++}`;
    if (m[1] !== undefined) {
      out.push(
        <strong key={key} className="font-semibold text-text-primary">
          {rich(m[1], `${key}-`)}
        </strong>,
      );
    } else if (m[2] !== undefined) {
      out.push(
        <code key={key} className={codeClass}>
          {m[2]}
        </code>,
      );
    } else {
      const href = m[4];
      out.push(
        <a key={key} href={href} className={href.startsWith("#") ? anchorClass : extLinkClass}>
          {m[3]}
        </a>,
      );
    }
    last = at + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
