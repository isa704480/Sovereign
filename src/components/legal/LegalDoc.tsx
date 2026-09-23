"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { LEGAL, LEGAL_LABELS, LEGAL_UPDATED, type LegalDocId } from "@/lib/locales/legal";
import { useLang } from "@/store/chat";

const LINK = "text-primary-soft hover:text-text-primary";

/** **qalin** va [matn](havola) belgilashini React elementlariga aylantiradi. */
function rich(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g).map((part, i) => {
    const bold = /^\*\*([^*]+)\*\*$/.exec(part);
    if (bold) return <strong key={i} className="text-text-primary">{bold[1]}</strong>;
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    if (link) {
      const [, label, href] = link;
      return href.startsWith("/") ? (
        <Link key={i} className={LINK} href={href}>{label}</Link>
      ) : (
        <a key={i} className={LINK} href={href}>{label}</a>
      );
    }
    return part;
  });
}

/** Huquqiy hujjat tanasi — tanlangan interfeys tilida (til almashsa jonli yangilanadi). */
export function LegalDoc({ doc }: { doc: LegalDocId }) {
  const lang = useLang();
  const c = LEGAL[doc][lang] ?? LEGAL[doc].uz;
  const labels = LEGAL_LABELS[lang] ?? LEGAL_LABELS.uz;

  return (
    <article className="mx-auto max-w-2xl px-5 pb-24 pt-32 md:px-8">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">{labels.eyebrow}</p>
      <h1 className="font-display mt-3 text-3xl font-extrabold tracking-tight text-text-primary md:text-4xl">{c.title}</h1>
      <p className="mt-3 text-sm text-text-muted">
        {labels.updated}: {LEGAL_UPDATED}
      </p>

      <div className="mt-10 space-y-8 text-[15px] leading-relaxed text-text-secondary">
        {c.sections.map((s, i) => (
          <section key={i}>
            <h2 className="font-display text-lg font-bold text-text-primary">
              <span className="mr-2 font-mono text-sm text-text-muted">{i + 1}.</span>
              {s.h}
            </h2>
            {s.list ? (
              <div className="mt-2">
                {s.body && rich(s.body)}
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  {s.list.map((item, j) => (
                    <li key={j}>{rich(item)}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mt-2">{s.body && rich(s.body)}</p>
            )}
          </section>
        ))}
        {c.note && <p className="text-sm text-text-muted">{rich(c.note)}</p>}
      </div>
    </article>
  );
}
