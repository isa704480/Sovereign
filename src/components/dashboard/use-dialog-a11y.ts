"use client";

import { useEffect, useId, useRef } from "react";

/**
 * Modal panellar uchun umumiy a11y: ochilganda fokus panel ichiga o'tadi,
 * Esc yopadi (preventDefault — Dashboard'ning global Esc'i oqimni to'xtatmasin),
 * yopilganda fokus ochgan tugmaga qaytadi. Sarlavha `titleId` orqali bog'lanadi.
 */
export function useDialogA11y<T extends HTMLElement = HTMLDivElement>(open: boolean, onClose: () => void) {
  const panelRef = useRef<T>(null);
  const titleId = useId();
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // Ichkaridagi autoFocus maydonga tegmaymiz; aks holda panelning o'ziga fokus.
    const raf = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (panel && !panel.contains(document.activeElement)) panel.focus({ preventScroll: true });
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKey);
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [open]);

  return {
    panelRef,
    titleId,
    /** Ichki panelga yoyiladi: role/aria-modal/aria-labelledby va dasturiy fokus. */
    dialogProps: {
      role: "dialog" as const,
      "aria-modal": true as const,
      "aria-labelledby": titleId,
      tabIndex: -1,
    },
  };
}
