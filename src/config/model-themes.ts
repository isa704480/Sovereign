import type { CSSProperties } from "react";
import type { ModelTheme } from "./models";

/**
 * Dashboard ko'rinishi (ARCHITECTURE.md §12).
 *
 * Ilova doim SOVEREIGN ko'rinishida: logo, shriftlar, fon va yuzalar bitta. Tanlangan
 * model faqat yorliq ("Claude Sonnet 4.5 · Anthropic") va kichik urg'u rangi (avatar
 * halqasi, nuqta) sifatida ko'rinadi. Boshqa kompaniyalarning logotipi, nomi-logotip
 * sifatida, shrifti yoki mahsulot ko'rinishi takrorlanmaydi.
 */

export type InputStyle = "box";
export type AvatarStyle = "glyph";

export interface ModelThemeSpec {
  id: Extract<ModelTheme, "sovereign">;
  radius: number;
  inputRadius: number;
  colors: {
    /** Urg'u rangi: halqa, fokus, faol holat. Matn uchun emas (--t-accent-text). */
    primary: string;
    accent: string;
    /** Oq matn bilan to'ldirilgan tugmalar foni (kontrast ≥ 4.5:1). */
    primaryFill: string;
    /** primaryFill ustidagi matn rangi. */
    onPrimary: string;
    /** Qorong'i fonda matn sifatida o'qiladigan urg'u (havola, faol yorliq). */
    accentText: string;
    bg: string;
    sidebar: string;
    surface: string;
    surfaceHover: string;
    input: string;
    border: string;
    text: string;
    textMuted: string;
    userBubble: string;
    aiBubble: string;
  };
  layout: {
    aiBubble: boolean;
    userBubble: boolean;
    avatar: AvatarStyle;
    input: InputStyle;
    centeredEmptyInput: boolean;
    showCitations: boolean;
  };
}

const SANS = "var(--font-dm-sans), ui-sans-serif, system-ui, sans-serif";
const DISPLAY = "var(--font-syne), " + SANS;

export const SOVEREIGN_THEME: ModelThemeSpec = {
  id: "sovereign",
  radius: 12,
  inputRadius: 16,
  colors: {
    primary: "#5B50F0",
    accent: "#7C6FF7",
    primaryFill: "#5B50F0",
    onPrimary: "#FFFFFF",
    accentText: "#978FFB",
    bg: "#060812",
    sidebar: "#0A0D26",
    surface: "#0D1033",
    surfaceHover: "#1C2150",
    input: "#0D1033",
    border: "rgba(255,255,255,0.10)",
    text: "#F0F2FF",
    textMuted: "#9BA3CC",
    userBubble: "#1C1F42",
    aiBubble: "transparent",
  },
  layout: { aiBubble: false, userBubble: true, avatar: "glyph", input: "box", centeredEmptyInput: false, showCitations: false },
};

/** Faqat bitta ko'rinish bor; eski importlar uchun kalit saqlanadi. */
export const MODEL_THEMES = { sovereign: SOVEREIGN_THEME } as const;

/** Holat ranglari (qorong'i fon uchun). globals.css'dagi --t-* bilan bir xil qiymatlar. */
const STATUS = {
  success: "#10D4A0",
  warning: "#F59E0B",
  danger: "#EF4444",
  dangerFill: "#C62F2F",
  info: "#20D4E8",
} as const;

/** CSS custom properties consumed by the dashboard (`--t-*`). */
export function themeVars(t: ModelThemeSpec): CSSProperties {
  const c = t.colors;
  return {
    "--t-primary": c.primary,
    "--t-accent": c.accent,
    "--t-primary-fill": c.primaryFill,
    "--t-on-primary": c.onPrimary,
    "--t-accent-text": c.accentText,
    "--t-bg": c.bg,
    "--t-sidebar": c.sidebar,
    "--t-surface": c.surface,
    "--t-surface-hover": c.surfaceHover,
    "--t-input": c.input,
    "--t-border": c.border,
    "--t-text": c.text,
    "--t-text-muted": c.textMuted,
    "--t-user-bubble": c.userBubble,
    "--t-ai-bubble": c.aiBubble,
    "--t-radius": `${t.radius}px`,
    "--t-input-radius": `${t.inputRadius}px`,
    "--t-font-display": DISPLAY,
    "--t-font-body": SANS,
    "--t-gradient": `linear-gradient(90deg, ${c.primary}, ${c.accent})`,
    "--t-success": STATUS.success,
    "--t-warning": STATUS.warning,
    "--t-danger": STATUS.danger,
    "--t-danger-fill": STATUS.dangerFill,
    "--t-info": STATUS.info,
  } as CSSProperties;
}

/* ------------------------------------------------------------------ */
/* Kontrast yordamchilari (WCAG 2.x nisbiy yorug'lik).                  */
/* ------------------------------------------------------------------ */

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function channel(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance([r, g, b]: [number, number, number]): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Ikki #rrggbb rang orasidagi kontrast nisbati (1..21). Noto'g'ri qiymatda 1. */
export function contrastRatio(a: string, b: string): number {
  const pa = parseHex(a);
  const pb = parseHex(b);
  if (!pa || !pb) return 1;
  const la = luminance(pa);
  const lb = luminance(pb);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function toHex([r, g, b]: [number, number, number]): string {
  return "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase();
}

/**
 * Brend/reja rangini oq matnli to'ldirish uchun moslaydi: kontrast 4.5:1 ga yetguncha
 * qoraga aralashtiradi (#10A37F → ~#0D8668, #FF7000 → ~#C25500). Rang oilasi saqlanadi.
 */
export function accessibleFill(hex: string, on = "#FFFFFF"): { fill: string; on: string } {
  const rgb = parseHex(hex);
  if (!rgb) return { fill: SOVEREIGN_THEME.colors.primaryFill, on: SOVEREIGN_THEME.colors.onPrimary };
  if (contrastRatio(hex, on) >= 4.5) return { fill: toHex(rgb), on };
  for (let k = 0.95; k > 0.2; k -= 0.03) {
    const c = toHex([rgb[0] * k, rgb[1] * k, rgb[2] * k]);
    if (contrastRatio(c, on) >= 4.5) return { fill: c, on };
  }
  return { fill: "#0B0B0F", on };
}

/**
 * Model urg'usi — faqat avatar halqasi / nuqta uchun (fon va yuzalar SOVEREIGN'niki).
 * `--t-model` va `--t-model-fill` beradi.
 */
export function modelAccentVars(primary: string): CSSProperties {
  const { fill, on } = accessibleFill(primary);
  return { "--t-model": primary, "--t-model-fill": fill, "--t-model-on": on } as CSSProperties;
}
