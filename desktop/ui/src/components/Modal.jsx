import React, { useEffect, useId, useRef } from "react";
import { useT } from "../lib/i18n.js";

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Fokus tuzog'i: Tab/Shift+Tab dialog ichida aylanadi; yopilganda fokus
 * avvalgi elementga qaytadi. initialFocus — birinchi fokus oladigan element ref'i.
 */
export function useFocusTrap(ref, { initialFocus, onEscape } = {}) {
  useEffect(() => {
    const prev = document.activeElement;
    const root = ref.current;
    const first = initialFocus?.current ?? root?.querySelector("[data-autofocus]") ?? root?.querySelector(FOCUSABLE);
    (first ?? root)?.focus();
    const onKey = (e) => {
      if (e.key === "Escape" && onEscape) {
        e.preventDefault();
        e.stopPropagation();
        onEscape();
        return;
      }
      if (e.key !== "Tab" || !root) return;
      const els = [...root.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!els.length) return;
      const a = els[0];
      const z = els[els.length - 1];
      if (e.shiftKey && document.activeElement === a) {
        e.preventDefault();
        z.focus();
      } else if (!e.shiftKey && document.activeElement === z) {
        e.preventDefault();
        a.focus();
      } else if (!root.contains(document.activeElement)) {
        e.preventDefault();
        a.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      if (prev && typeof prev.focus === "function" && document.contains(prev)) prev.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export default function Modal({ title, onClose, children, width = 640, className = "", footer, headerExtra, labelledBy, tone }) {
  const ref = useRef(null);
  const hid = useId();
  const t = useT();
  useFocusTrap(ref, { onEscape: onClose });
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy ?? hid}
        tabIndex={-1}
        className={`modal ${tone ? `modal-${tone}` : ""} ${className}`}
        style={{ maxWidth: width }}
      >
        {title != null && (
          <div className="modal-head">
            <h2 id={hid} className="modal-title">{title}</h2>
            {headerExtra}
            {onClose && (
              <button type="button" className="icon-btn" aria-label={t("common.close")} onClick={onClose}>
                <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            )}
          </div>
        )}
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}
