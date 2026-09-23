"use client";

import { useEffect } from "react";
import { LANG_COOKIE, LANGS } from "@/lib/i18n";
import { useChat, useChatHydrated } from "@/store/chat";

/**
 * <html lang="…"> ni tanlangan tilga moslaydi (ekran o'quvchilar va brauzer
 * tarjimoni uchun). Layout server komponent — shuning uchun alohida client bo'lak.
 * Store'ni har sahifada localStorage'dan tiklaydi — aks holda tanlangan til
 * faqat Dashboard'da saqlanib, landing/login/huquqiy sahifalarda uz'ga qaytardi.
 */
export function LangSync() {
  const hydrated = useChatHydrated();
  const lang = useChat((s) => s.lang);
  useEffect(() => {
    // Tiklanishdan oldin lang = default; cookie'ni ustidan yozib yubormaslik uchun kutamiz.
    if (!hydrated) return;
    const meta = LANGS.find((l) => l.id === lang);
    if (meta) document.documentElement.lang = meta.htmlLang;
    // Server (actions / API) xabarlari ham shu tilda bo'lishi uchun.
    document.cookie = `${LANG_COOKIE}=${lang}; path=/; max-age=31536000; samesite=lax`;
  }, [hydrated, lang]);
  return null;
}
