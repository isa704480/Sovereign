/**
 * Marketing sahifalaridagi YAGONA tugma shakli (landing, /compare, /updates, 404).
 * Asosiy: to'liq indigo pill. Ikkilamchi: xuddi shu shakl, hoshiyali.
 * Nur (shadow-glow) faqat hero'dagi asosiy tugmada — `ctaGlow` bilan qo'shiladi.
 * Ilova ichidagi tugmalar (dashboard) rounded-md — bu fayl ularga emas.
 */
const base =
  "inline-flex h-11 max-w-full items-center justify-center gap-2 rounded-full px-6 text-[15px] font-semibold transition-colors duration-150 md:h-12";

export const ctaPrimary = `${base} bg-primary text-white hover:bg-primary-dark`;

export const ctaSecondary = `${base} border border-[var(--border-strong)] text-text-primary hover:bg-surface-hover`;

/** Kichik variant (navbar, karta ichidagi tugmalar): 40px, mobil'da 44px. */
const small =
  "inline-flex h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition-colors duration-150 lg:h-10";

export const ctaPrimarySm = `${small} bg-primary text-white hover:bg-primary-dark`;

export const ctaSecondarySm = `${small} border border-[var(--border-strong)] text-text-primary hover:bg-surface-hover`;

export const ctaGlow = "shadow-glow";
