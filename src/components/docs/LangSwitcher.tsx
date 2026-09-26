"use client";

import { LANGS, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useChat, useT } from "@/store/chat";

/**
 * Ixcham til tanlagich (docs / status sarlavhasi uchun) — landing Navbar'dagi
 * <select> bilan bir xil mantiq: store.setLang → LangSync cookie'ni (sov-lang) yozadi,
 * shuning uchun tanlov barcha subdomainlarda saqlanadi.
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
        "h-8 shrink-0 cursor-pointer rounded-lg border border-border bg-transparent px-1.5 text-sm text-text-secondary outline-none focus-visible:outline-2 focus-visible:outline-primary-soft",
        className,
      )}
    >
      {LANGS.map((l) => (
        <option key={l.id} value={l.id} className="bg-bg-base">
          {l.short}
        </option>
      ))}
    </select>
  );
}
