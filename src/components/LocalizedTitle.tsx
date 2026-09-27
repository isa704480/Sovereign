"use client";

import { useEffect, useRef } from "react";
import { DEFAULT_LANG } from "@/lib/i18n";
import { useLang } from "@/store/chat";

/**
 * Statik (CDN keshlanadigan) sahifalarda brauzer tab sarlavhasini tanlangan tilga moslaydi.
 * Server metadata ataylab inglizcha (SEO + statik kesh); standart tilda o'sha sarlavha qoladi,
 * boshqa tilda — `${title} · SOVEREIGN AI`. Sahifadan chiqilganda asl sarlavha qaytariladi.
 */
export function LocalizedTitle({ title }: { title: string }) {
  const lang = useLang();
  const original = useRef<string | null>(null);

  useEffect(() => {
    if (original.current === null) original.current = document.title;
    document.title = lang === DEFAULT_LANG ? original.current : `${title} · SOVEREIGN AI`;
  }, [lang, title]);

  useEffect(
    () => () => {
      if (original.current !== null) document.title = original.current;
    },
    [],
  );

  return null;
}
