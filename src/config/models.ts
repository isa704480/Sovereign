/**
 * SOVEREIGN model catalog (docs/ARCHITECTURE.md §5.1, §12; docs/DESIGN.md per-model colors).
 * Phase 1 uses this for the landing showcase, hero demo and onboarding recommendation.
 * Phase 2 wires the same ids to OpenRouter / Perplexity.
 */

export type ModelTheme =
  | "sovereign"
  | "claude"
  | "chatgpt"
  | "gemini"
  | "perplexity"
  | "mistral"
  | "llama";

export type ModelCost = "free" | "$" | "$$";

export interface ModelCapability {
  label: string;
  /** 0..5 */
  score: number;
}

export interface SovereignModel {
  id: string;
  name: string;
  shortName: string;
  provider: string;
  theme: ModelTheme;
  cost: ModelCost;
  /** Emoji / glyph used as the model mark. */
  glyph: string;
  tagline: string;
  description: string;
  /** Brand colors. */
  primary: string;
  accent: string;
  bg: string;
  capabilities: ModelCapability[];
  /** Example exchange shown in the hero demo. */
  demo: { user: string; ai: string };
}

export const MODELS: SovereignModel[] = [
  {
    id: "claude-sonnet-4-5",
    name: "Claude Sonnet 4.5",
    shortName: "Claude",
    provider: "Anthropic",
    theme: "claude",
    cost: "$$",
    glyph: "✦",
    tagline: "Yozish va tahlil uchun ideal",
    description: "Chuqur fikrlash, uzun matnlar, nozik tahrir. Yaxshi fikrlar uchun suhbat.",
    primary: "#CC785C",
    accent: "#D4956A",
    bg: "#1A0F0A",
    capabilities: [
      { label: "Aqlli", score: 5 },
      { label: "Ijodiy", score: 4 },
    ],
    demo: {
      user: "Investor uchun 3 gapli pitch yozib ber.",
      ai: "SOVEREIGN — barcha AI'lar bitta joyda, ma'lumotlaringiz esa faqat sizda...",
    },
  },
  {
    id: "gpt-4o",
    name: "GPT-4o",
    shortName: "ChatGPT",
    provider: "OpenAI",
    theme: "chatgpt",
    cost: "$$",
    glyph: "⬡",
    tagline: "Kod va matematik",
    description: "Tez, aniq, ko'p qirrali. Kod yozish va texnik masalalar uchun.",
    primary: "#10A37F",
    accent: "#19C37D",
    bg: "#0D0D0D",
    capabilities: [
      { label: "Tez", score: 5 },
      { label: "Kod", score: 5 },
    ],
    demo: {
      user: "Python'da JWT tekshiradigan funksiya yoz.",
      ai: "def verify(token, key):\n    return jwt.decode(token, key, algorithms=['HS256'])",
    },
  },
  {
    id: "gemini-pro-1.5",
    name: "Gemini Pro 1.5",
    shortName: "Gemini",
    provider: "Google",
    theme: "gemini",
    cost: "$$",
    glyph: "✦",
    tagline: "Ko'p modal, vizual",
    description: "Rasm, video, katta kontekst. Vizual va ko'p formatli ish uchun.",
    primary: "#4285F4",
    accent: "#A855F7",
    bg: "#0C0C1E",
    capabilities: [
      { label: "Multimodal", score: 5 },
      { label: "Kontekst", score: 5 },
    ],
    demo: {
      user: "Bu grafikdagi trendni tushuntir.",
      ai: "Q3 da o'sish 34%, asosiy sabab — mobil foydalanuvchilar oqimi...",
    },
  },
  {
    id: "sonar-online",
    name: "Perplexity Sonar",
    shortName: "Perplexity",
    provider: "Perplexity AI",
    theme: "perplexity",
    cost: "free",
    glyph: "⊕",
    tagline: "Real-vaqt internet tadqiqot",
    description: "Har bir javob manbalar bilan. Yangiliklar, faktlar, ilmiy maqolalar.",
    primary: "#20808D",
    accent: "#29A0AD",
    bg: "#0A0E14",
    capabilities: [
      { label: "Internet", score: 5 },
      { label: "Manbalar", score: 5 },
    ],
    demo: {
      user: "2026 da AI maxfiylik qonunlari qanday o'zgardi?",
      ai: "EU AI Act to'liq kuchga kirdi [1], AQShda 12 shtat yangi qonun qabul qildi [2]...",
    },
  },
  {
    id: "mistral-large",
    name: "Mistral Large",
    shortName: "Mistral",
    provider: "Mistral AI",
    theme: "mistral",
    cost: "$$",
    glyph: "⬌",
    tagline: "Evropa AI'si, ko'p tilli",
    description: "Fransuz, nemis, ispan — Evropa tillari uchun kuchli. Professional ohang.",
    primary: "#FF7000",
    accent: "#FF9500",
    bg: "#0F0A05",
    capabilities: [
      { label: "Tillar", score: 5 },
      { label: "Tez", score: 4 },
    ],
    demo: {
      user: "Bu xatni fransuzchaga tarjima qil.",
      ai: "Bonjour, je vous écris concernant notre partenariat...",
    },
  },
  {
    id: "llama-3.1-8b:free",
    name: "LLaMA 3.1 8B",
    shortName: "LLaMA",
    provider: "Meta AI (Ochiq)",
    theme: "llama",
    cost: "free",
    glyph: "🦙",
    tagline: "Ochiq manba, tekin",
    description: "Ochiq model, hech qanday to'lovsiz. Kundalik savollar uchun yetarli.",
    primary: "#7C3AED",
    accent: "#9F67FF",
    bg: "#080516",
    capabilities: [
      { label: "Tekin", score: 5 },
      { label: "Ochiq", score: 5 },
    ],
    demo: {
      user: "Bugun nima pishirsam bo'ladi?",
      ai: "Tez va oson: sabzavotli osh yoki tovuqli salat. Qaysi masalliqlar bor?",
    },
  },
];

export const MODEL_BY_ID: Record<string, SovereignModel> = Object.fromEntries(
  MODELS.map((m) => [m.id, m]),
);

export const MODEL_BY_THEME: Record<Exclude<ModelTheme, "sovereign">, SovereignModel> =
  Object.fromEntries(MODELS.map((m) => [m.theme, m])) as Record<
    Exclude<ModelTheme, "sovereign">,
    SovereignModel
  >;

/** Models cycled in the landing hero demo. */
export const HERO_DEMO_MODELS = [
  MODEL_BY_THEME.claude,
  MODEL_BY_THEME.chatgpt,
  MODEL_BY_THEME.gemini,
  MODEL_BY_THEME.perplexity,
];

export const SOVEREIGN_BRAND = {
  name: "SOVEREIGN",
  glyph: "⬡",
  primary: "#5B50F0",
  accent: "#7C6FF7",
  bg: "#060812",
  tagline: "Your AI. Your Truth. Your Data. Forever.",
} as const;

/** Universal gradient used for brand accents (ARCHITECTURE.md §13). */
export const BRAND_GRADIENT =
  "linear-gradient(135deg, #00D4FF 0%, #5B50F0 35%, #A855F7 65%, #FF7000 100%)";
