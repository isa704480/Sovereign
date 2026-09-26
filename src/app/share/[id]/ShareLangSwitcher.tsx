"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { LangSwitcher } from "@/components/LangSwitcher";
import type { Lang } from "@/lib/i18n";
import { useChat, useChatHydrated } from "@/store/chat";

/**
 * Ulashilgan suhbat sahifasi serverda (sov-lang cookie tilida) chiziladi. Til almashtirilganda
 * LangSync cookie'ni yozadi, so'ng sahifa serverdan shu tilda qayta olinadi (router.refresh).
 */
export function ShareLangSwitcher({ serverLang }: { serverLang: Lang }) {
  const router = useRouter();
  const hydrated = useChatHydrated();
  const lang = useChat((s) => s.lang);
  // Har til uchun bir marta — cookie yozilmasa ham cheksiz refresh bo'lmaydi.
  const refreshedFor = useRef<Lang | null>(null);

  useEffect(() => {
    if (!hydrated || lang === serverLang || refreshedFor.current === lang) return;
    // Ota LangSync effekti (cookie yozish) shu effektdan KEYIN ishlaydi — navbatga qo'yamiz.
    const id = window.setTimeout(() => {
      refreshedFor.current = lang;
      router.refresh();
    }, 0);
    return () => window.clearTimeout(id);
  }, [hydrated, lang, serverLang, router]);

  return (
    <LangSwitcher className="h-8 border-white/10 px-1.5 text-xs text-[#9BA3CC] focus-visible:outline-[#5B50F0]" />
  );
}
