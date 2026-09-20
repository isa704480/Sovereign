"use client";

import { useEffect } from "react";
import { LANGS } from "@/lib/i18n";
import { useChat } from "@/store/chat";

/**
 * <html lang="…"> ni tanlangan tilga moslaydi (ekran o'quvchilar va brauzer
 * tarjimoni uchun). Layout server komponent — shuning uchun alohida client bo'lak.
 */
export function LangSync() {
  const lang = useChat((s) => s.lang);
  useEffect(() => {
    const meta = LANGS.find((l) => l.id === lang);
    if (meta) document.documentElement.lang = meta.htmlLang;
  }, [lang]);
  return null;
}
