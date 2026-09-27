"use client";

import { ArrowRight } from "lucide-react";
import { UPDATES, type ProductUpdate, type UpdateTag } from "@/content/updates";
import { ctaPrimarySm } from "@/components/landing/cta";
import { pick, type Lang, type TKey } from "@/lib/i18n";
import { LocalizedTitle } from "@/components/LocalizedTitle";
import { useLang, useT } from "@/store/chat";

const TAG_KEY: Record<UpdateTag, TKey> = { new: "wnTagNew", improved: "wnTagImproved", fixed: "wnTagFixed" };
const TAG_COLOR: Record<UpdateTag, string> = { new: "var(--accent-text)", improved: "var(--t-success)", fixed: "var(--t-warning)" };

/** ICU'ga bog'lanmagan sana (server va brauzerda bir xil — hydration farqi yo'q). */
const MONTHS: Record<Lang, string[]> = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  ru: ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"],
  uz: ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"],
  "uz-cyrl": ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"],
};

function formatDate(iso: string, lang: Lang): string {
  const [y, m, d] = iso.split("-").map(Number);
  const month = MONTHS[lang][(m || 1) - 1] ?? "";
  if (lang === "en") return `${month} ${d}, ${y}`;
  if (lang === "ru") return `${d} ${month} ${y}`;
  if (lang === "uz-cyrl") return `${y} йил ${d} ${month}`;
  return `${y}-yil ${d}-${month}`;
}

/** Sana bo'yicha guruhlar (UPDATES allaqachon yangi → eski tartibda). */
function groupByDate(items: readonly ProductUpdate[]): [string, ProductUpdate[]][] {
  const out: [string, ProductUpdate[]][] = [];
  for (const u of items) {
    const last = out[out.length - 1];
    if (last && last[0] === u.date) last[1].push(u);
    else out.push([u.date, [u]]);
  }
  return out;
}

export function UpdatesList() {
  const t = useT();
  const lang = useLang();

  return (
    <article className="mx-auto max-w-2xl px-5 pb-24 pt-32 md:px-8">
      <LocalizedTitle title={t("updTitle")} />
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">{t("updEyebrow")}</p>
      <h1 className="font-display mt-3 text-3xl font-extrabold tracking-tight text-text-primary md:text-4xl">{t("updTitle")}</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-text-secondary">{t("updLead")}</p>
      <a href="/app" className={`mt-6 ${ctaPrimarySm}`}>
        {t("updOpenApp")}
        <ArrowRight className="size-4" aria-hidden="true" />
      </a>

      <ol className="mt-12 space-y-10">
        {groupByDate(UPDATES).map(([date, items]) => (
          <li key={date} className="grid gap-4 md:grid-cols-[140px_1fr]">
            <time dateTime={date} className="pt-0.5 font-mono text-xs text-text-muted">
              {formatDate(date, lang)}
            </time>
            <ul className="space-y-6 border-l border-white/10 pl-5">
              {items.map((u) => (
                <li key={u.id} id={u.id} className="scroll-mt-28">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
                      style={{ color: TAG_COLOR[u.tag], background: `color-mix(in srgb, ${TAG_COLOR[u.tag]} 14%, transparent)` }}
                    >
                      {t(TAG_KEY[u.tag])}
                    </span>
                    <h2 className="font-display text-lg font-bold text-text-primary">{pick(lang, u.title)}</h2>
                  </div>
                  <p className="mt-2 text-[15px] leading-relaxed text-text-secondary">{pick(lang, u.body)}</p>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </article>
  );
}
