import type { CSSProperties } from "react";
import type { ModelTheme } from "./models";

/**
 * Per-model "atmosphere" (DESIGN.md Ekran 5, ARCHITECTURE.md §12).
 * When the user switches model, the whole dashboard re-skins to mimic that
 * provider's own product: colors, radius, type, bubble style, welcome screen.
 */

export type InputStyle = "box" | "pill" | "search" | "material";
export type AvatarStyle = "glyph" | "dot" | "none";

export interface ModelThemeSpec {
  id: ModelTheme;
  name: string;
  provider: string;
  /** Text shown as the product wordmark in the sidebar header. */
  wordmark: string;
  glyph: string;
  badge?: string;
  greeting: string;
  subGreeting?: string;
  placeholder: string;
  suggestions: string[];
  fontDisplay: string;
  fontBody: string;
  radius: number;
  inputRadius: number;
  colors: {
    primary: string;
    accent: string;
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
    /** Multi-color gradient for the brand (Gemini). */
    gradient?: string;
  };
  layout: {
    /** Assistant text inside a bubble (true) or flat on the page (false). */
    aiBubble: boolean;
    userBubble: boolean;
    avatar: AvatarStyle;
    input: InputStyle;
    /** Empty-state input floats in the middle of the screen (Perplexity). */
    centeredEmptyInput: boolean;
    showCitations: boolean;
  };
}

const SANS = "var(--font-dm-sans), ui-sans-serif, system-ui, sans-serif";
const SYSTEM = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, ui-sans-serif, system-ui, sans-serif";

export const MODEL_THEMES: Record<ModelTheme, ModelThemeSpec> = {
  sovereign: {
    id: "sovereign",
    name: "SOVEREIGN",
    provider: "Universal",
    wordmark: "SOVEREIGN",
    glyph: "⬡",
    greeting: "SOVEREIGN'ga xush kelibsiz.",
    subGreeting: "Barcha modellar. Bitta interfeys. Ma'lumotlar sizda.",
    placeholder: "Xabar yozing...",
    suggestions: [
      "Bugungi vazifalarimni rejalashtir",
      "Bu matnni professional ohangda qayta yoz",
      "Python'da fayl o'qish misolini ko'rsat",
      "Startap uchun pitch tuzish yordam ber",
    ],
    fontDisplay: "var(--font-syne), " + SANS,
    fontBody: SANS,
    radius: 14,
    inputRadius: 20,
    colors: {
      primary: "#5B50F0",
      accent: "#7C6FF7",
      bg: "#060812",
      sidebar: "#0A0D26",
      surface: "#0D1033",
      surfaceHover: "#1C2150",
      input: "#0D1033",
      border: "rgba(255,255,255,0.10)",
      text: "#F0F2FF",
      textMuted: "#9BA3CC",
      userBubble: "#1C1F42",
      aiBubble: "#0D1033",
    },
    layout: { aiBubble: true, userBubble: true, avatar: "glyph", input: "box", centeredEmptyInput: false, showCitations: false },
  },

  claude: {
    id: "claude",
    name: "Claude",
    provider: "Anthropic",
    wordmark: "Claude",
    glyph: "✦",
    greeting: "Yaxshi fikrlar uchun suhbat",
    subGreeting: "Bugun nimani birga o'ylab ko'ramiz?",
    placeholder: "Claude'ga yozing...",
    suggestions: [
      "Ushbu matnni qisqacha xulosa qil",
      "Maqola uchun reja tuzib ber",
      "Kodimni ko'rib chiqib, xatolarni top",
      "Ikki g'oyani solishtirib tahlil qil",
    ],
    fontDisplay: "'Tiempos Headline', Georgia, 'Times New Roman', serif",
    fontBody: SANS,
    radius: 12,
    inputRadius: 16,
    colors: {
      primary: "#CC785C",
      accent: "#D4956A",
      bg: "#1A0F0A",
      sidebar: "#120A07",
      surface: "#221409",
      surfaceHover: "#2D1A12",
      input: "#221409",
      border: "rgba(255,230,210,0.10)",
      text: "#F5EDE6",
      textMuted: "#B8A79A",
      userBubble: "#2D1A12",
      aiBubble: "transparent",
    },
    layout: { aiBubble: false, userBubble: true, avatar: "glyph", input: "box", centeredEmptyInput: false, showCitations: false },
  },

  chatgpt: {
    id: "chatgpt",
    name: "ChatGPT",
    provider: "OpenAI",
    wordmark: "ChatGPT",
    glyph: "⬡",
    greeting: "Men sizga qanday yordam bera olaman?",
    placeholder: "Xabar yozing",
    suggestions: [
      "Menga JavaScript'da promise'larni tushuntir",
      "Sayohat uchun ro'yxat tuz",
      "Email'ga rasmiy javob yoz",
      "SQL so'rovimni optimallashtir",
    ],
    fontDisplay: SYSTEM,
    fontBody: SYSTEM,
    radius: 8,
    inputRadius: 26,
    colors: {
      primary: "#10A37F",
      accent: "#19C37D",
      bg: "#212121",
      sidebar: "#171717",
      surface: "#2F2F2F",
      surfaceHover: "#2A2A2A",
      input: "#2F2F2F",
      border: "rgba(255,255,255,0.08)",
      text: "#ECECEC",
      textMuted: "#9B9B9B",
      userBubble: "#2F2F2F",
      aiBubble: "transparent",
    },
    layout: { aiBubble: false, userBubble: true, avatar: "glyph", input: "pill", centeredEmptyInput: true, showCitations: false },
  },

  gemini: {
    id: "gemini",
    name: "Gemini",
    provider: "Google",
    wordmark: "Gemini",
    glyph: "✦",
    greeting: "Salom!",
    subGreeting: "Bugun nima qilamiz?",
    placeholder: "Gemini'dan so'rang",
    suggestions: [
      "Rasmdagi grafikni tushuntir",
      "Taqdimot uchun 5 ta slayd g'oyasi",
      "Bu maqolaning asosiy fikrlarini ajrat",
      "Menga o'rganish rejasini tuz",
    ],
    fontDisplay: "'Google Sans', 'Product Sans', Roboto, " + SYSTEM,
    fontBody: "Roboto, " + SYSTEM,
    radius: 24,
    inputRadius: 28,
    colors: {
      primary: "#4285F4",
      accent: "#A855F7",
      bg: "#0C0C1E",
      sidebar: "#12122A",
      surface: "#161630",
      surfaceHover: "#1E1E3A",
      input: "#1E1E3A",
      border: "rgba(255,255,255,0.08)",
      text: "#E3E3E3",
      textMuted: "#A8ABC4",
      userBubble: "#1E1E3A",
      aiBubble: "transparent",
      gradient: "linear-gradient(90deg, #4285F4 0%, #9B72CB 35%, #D96570 65%, #FBBC05 100%)",
    },
    layout: { aiBubble: false, userBubble: true, avatar: "glyph", input: "pill", centeredEmptyInput: false, showCitations: false },
  },

  perplexity: {
    id: "perplexity",
    name: "Perplexity",
    provider: "Perplexity AI",
    wordmark: "perplexity",
    glyph: "⊕",
    greeting: "Bilim shu yerdan boshlanadi",
    placeholder: "Istalgan narsani so'rang...",
    suggestions: [
      "2026 da AI maxfiylik qonunlari",
      "Toshkentda bugungi ob-havo",
      "So'nggi Next.js relizida nima yangi",
      "Kvant kompyuterlar qanday ishlaydi",
    ],
    fontDisplay: "'Helvetica Neue', Helvetica, " + SYSTEM,
    fontBody: SYSTEM,
    radius: 6,
    inputRadius: 12,
    colors: {
      primary: "#20808D",
      accent: "#29A0AD",
      bg: "#0A0E14",
      sidebar: "#0D1218",
      surface: "#10161E",
      surfaceHover: "#16202A",
      input: "#10161E",
      border: "rgba(255,255,255,0.08)",
      text: "#E8EDF0",
      textMuted: "#8A98A6",
      userBubble: "transparent",
      aiBubble: "transparent",
    },
    layout: { aiBubble: false, userBubble: false, avatar: "none", input: "search", centeredEmptyInput: true, showCitations: true },
  },

  mistral: {
    id: "mistral",
    name: "Mistral",
    provider: "Mistral AI",
    wordmark: "Mistral",
    glyph: "⬌",
    greeting: "Bonjour.",
    subGreeting: "Evropa AI'si xizmatingizda.",
    placeholder: "Message Mistral...",
    suggestions: [
      "Bu xatni fransuzchaga tarjima qil",
      "Shartnoma bandini soddalashtir",
      "Nemis tilida qisqa tanishuv yoz",
      "Hisobotni 3 gapda xulosala",
    ],
    fontDisplay: SYSTEM,
    fontBody: SYSTEM,
    radius: 10,
    inputRadius: 12,
    colors: {
      primary: "#FF7000",
      accent: "#FF9500",
      bg: "#0F0A05",
      sidebar: "#0A0703",
      surface: "#1A1008",
      surfaceHover: "#241609",
      input: "#1A1008",
      border: "rgba(255,200,150,0.10)",
      text: "#F4EEE6",
      textMuted: "#B5A491",
      userBubble: "#241609",
      aiBubble: "#1A1008",
    },
    layout: { aiBubble: true, userBubble: true, avatar: "glyph", input: "box", centeredEmptyInput: false, showCitations: false },
  },

  llama: {
    id: "llama",
    name: "LLaMA",
    provider: "Meta AI",
    wordmark: "LLaMA",
    glyph: "🦙",
    badge: "OCHIQ MANBA",
    greeting: "Salom! Men LLaMA.",
    subGreeting: "Meta'ning ochiq manbali, eng arzon modeli.",
    placeholder: "LLaMA'ga yozing...",
    suggestions: [
      "Bugun nima pishirsam bo'ladi?",
      "Menga qiziqarli fakt ayt",
      "Ushbu so'zning sinonimlarini top",
      "Qisqa she'r yoz",
    ],
    fontDisplay: SYSTEM,
    fontBody: SYSTEM,
    radius: 8,
    inputRadius: 14,
    colors: {
      primary: "#7C3AED",
      accent: "#9F67FF",
      bg: "#080516",
      sidebar: "#0B0720",
      surface: "#120A2A",
      surfaceHover: "#1A1038",
      input: "#120A2A",
      border: "rgba(200,180,255,0.10)",
      text: "#F1ECFF",
      textMuted: "#A99CCF",
      userBubble: "#1A1038",
      aiBubble: "#120A2A",
    },
    layout: { aiBubble: true, userBubble: true, avatar: "glyph", input: "box", centeredEmptyInput: false, showCitations: false },
  },
};

/** CSS custom properties consumed by the dashboard (`--t-*`). */
export function themeVars(t: ModelThemeSpec): CSSProperties {
  const c = t.colors;
  return {
    "--t-primary": c.primary,
    "--t-accent": c.accent,
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
    "--t-font-display": t.fontDisplay,
    "--t-font-body": t.fontBody,
    "--t-gradient": c.gradient ?? `linear-gradient(90deg, ${c.primary}, ${c.accent})`,
  } as CSSProperties;
}
