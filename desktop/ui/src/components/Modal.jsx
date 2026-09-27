import React, { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { useT } from "../lib/i18n.js";

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal qatlamlari steki (modul darajasida). Bir nechta dialog/popover ochiq bo'lsa, Esc va Tab'ni
 * faqat ENG USTIDAGI qatlam boshqaradi: pastdagi dialog Esc'da birga yopilmaydi, fokus tuzog'i
 * ustma-ust kurashmaydi. trap:false — popover (ModelPicker): Esc'ni oladi, Tab'ni tuzoqqa solmaydi.
 */
const layers = [];
let layerSeq = 0;
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn(layers.length));

/** Hozir biror modal/popover ochiqmi (global tezkor tugmalar uchun: Ctrl+K va boshqalar). */
export const hasOpenLayer = () => layers.length > 0;
const isTop = (id) => layers.length > 0 && layers[layers.length - 1].id === id;
const isTopTrap = (id) => {
  for (let i = layers.length - 1; i >= 0; i--) if (layers[i].trap) return layers[i].id === id;
  return false;
};

/**
 * Qatlamni stekka qo'shadi (active bo'lganda). onEscape — faqat shu qatlam eng ustida bo'lganda chaqiriladi;
 * hodisa stopImmediatePropagation bilan to'xtatiladi (pastdagi qatlam va App tugmalari ko'rmaydi).
 * Qaytaradi: { isTop, isTopTrap } tekshiruvchilari.
 */
export function useModalLayer(active, { onEscape, trap = true } = {}) {
  const escRef = useRef(onEscape);
  escRef.current = onEscape;
  const idRef = useRef(0);
  useEffect(() => {
    if (!active) return undefined;
    const id = ++layerSeq;
    idRef.current = id;
    layers.push({ id, trap });
    emit();
    const onKey = (e) => {
      if (e.key !== "Escape" || !isTop(id) || !escRef.current) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      escRef.current();
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      const i = layers.findIndex((l) => l.id === id);
      if (i >= 0) layers.splice(i, 1);
      emit();
    };
  }, [active, trap]);
  return { isTop: () => isTop(idRef.current), isTopTrap: () => isTopTrap(idRef.current) };
}

/**
 * Fokus tuzog'i: Tab/Shift+Tab dialog ichida aylanadi; yopilganda fokus
 * avvalgi elementga qaytadi. initialFocus — birinchi fokus oladigan element ref'i.
 * Modal stekiga qo'shiladi: Esc/Tab faqat eng ustki dialogda ishlaydi.
 */
export function useFocusTrap(ref, { initialFocus, onEscape } = {}) {
  const layer = useModalLayer(true, { onEscape, trap: true });
  useEffect(() => {
    const prev = document.activeElement;
    const root = ref.current;
    const first = initialFocus?.current ?? root?.querySelector("[data-autofocus]") ?? root?.querySelector(FOCUSABLE);
    (first ?? root)?.focus();
    const onKey = (e) => {
      if (e.key !== "Tab" || !root || !layer.isTopTrap()) return;
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
  // Portal: ota element (masalan, suzuvchi .rpanel) transform/stacking konteksti dialogni qirqmasin.
  return createPortal(
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
    </div>,
    document.body,
  );
}
