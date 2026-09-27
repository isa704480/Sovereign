"use client";

import { useT } from "@/store/chat";

/**
 * "Asosiy kontentga o'tish" — har sahifada birinchi Tab to'xtashi (root layout).
 * Nishon: #main-content, bo'lmasa sahifadagi birinchi <main>. Fokus o'sha elementga
 * ko'chadi, shuning uchun keyingi Tab navigatsiyadan emas, kontentdan davom etadi.
 */
export function SkipLink() {
  const t = useT();
  return (
    <a
      href="#main-content"
      onClick={(e) => {
        const el = document.getElementById("main-content") ?? document.querySelector("main");
        if (!el) return;
        e.preventDefault();
        if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
        el.focus({ preventScroll: true });
        el.scrollIntoView({ block: "start" });
      }}
      className="sr-only rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100]"
    >
      {t("p4dSkip")}
    </a>
  );
}
