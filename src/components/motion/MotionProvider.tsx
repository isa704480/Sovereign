"use client";

import { MotionConfig } from "motion/react";
import { useEffect, type ReactNode } from "react";
import { useChat } from "@/store/chat";

/**
 * Butun ilova uchun animatsiya siyosati:
 * - default "user" — OS'dagi prefers-reduced-motion hurmat qilinadi;
 * - Sozlamalar → "Animatsiyani kamaytirish" yoqilsa — "always" (transform/layout animatsiyalar o'chadi).
 * CSS animatsiyalar uchun <html data-reduced-motion="true"> ham qo'yiladi (globals.css).
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  const reduced = useChat((s) => s.reducedMotion);

  useEffect(() => {
    const root = document.documentElement;
    if (reduced) root.dataset.reducedMotion = "true";
    else delete root.dataset.reducedMotion;
  }, [reduced]);

  return <MotionConfig reducedMotion={reduced ? "always" : "user"}>{children}</MotionConfig>;
}
