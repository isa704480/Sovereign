"use client";

import { LANGS, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useChat, useT } from "@/store/chat";

/**
 * Ixcham til tanlagich (UZ / ЎЗ / RU / EN).
 * select o'rniga pill tugmalar — har til kodi qisqa (2-4 harf),
 * siqilib qolmaydi va mobilda ham qulay.
 */
export function LangSwitcher({ className }: { className?: string }) {
  const t = useT();
  const lang = useChat((s) => s.lang);
  const setLang = useChat((s) => s.setLang);
  return (
    <div
      role="group"
      aria-label={t("language")}
      className={cn("flex items-center gap-0.5 rounded-full border border-border p-0.5", className)}
    >
      {LANGS.map((l) => (
        <button
          key={l.id}
          type="button"
          onClick={() => setLang(l.id as Lang)}
          aria-pressed={lang === l.id}
          aria-label={l.label}
          lang={l.htmlLang}
          className={cn(
            "h-7 rounded-full px-2.5 text-xs font-medium transition-colors",
            lang === l.id
              ? "bg-primary text-white"
              : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
          )}
        >
          {l.short}
        </button>
      ))}
    </div>
  );
}
