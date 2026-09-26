"use client";

import { LANGS, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useChat, useT } from "@/store/chat";

/**
 * Ixcham til tanlagich (UZ / ЎЗ / RU / EN). Tanlov store'da saqlanadi, LangSync esa
 * uni cookie'ga yozadi — server xabarlari ham shu tilda keladi.
 */
export function LangSwitcher({ className }: { className?: string }) {
  const t = useT();
  const lang = useChat((s) => s.lang);
  const setLang = useChat((s) => s.setLang);
  return (
    <select
      value={lang}
      onChange={(e) => setLang(e.target.value as Lang)}
      aria-label={t("language")}
      className={cn(
        "h-9 rounded-lg border border-border bg-transparent px-2 text-sm text-text-secondary outline-none focus-visible:outline-2 focus-visible:outline-primary-soft",
        className,
      )}
    >
      {LANGS.map((l) => (
        <option key={l.id} value={l.id} lang={l.htmlLang} className="bg-bg-base">
          {l.short}
        </option>
      ))}
    </select>
  );
}
