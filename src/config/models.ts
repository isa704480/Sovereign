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

import type { ModelTier } from "./plans";

export type ModelCategory = "premium" | "free" | "research";

export interface SovereignModel {
  id: string;
  name: string;
  shortName: string;
  provider: string;
  theme: ModelTheme;
  cost: ModelCost;
  /** Dropdown grouping. */
  category: ModelCategory;
  /** Minimum subscription tier that unlocks the model. */
  tier: ModelTier;
  /** Upstream id sent to OpenRouter (or Perplexity for research models). */
  providerModel: string;
  /** Short price hint shown in the switcher. */
  price: string;
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

const FLAGSHIP: SovereignModel[] = [
  {
    id: "claude-sonnet-4-5",
    name: "Claude Sonnet 4.5",
    shortName: "Claude",
    provider: "Anthropic",
    theme: "claude",
    cost: "$$",
    category: "premium",
    tier: "pro",
    providerModel: "anthropic/claude-sonnet-4.5",
    price: "$0.003/1K",
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
    category: "premium",
    tier: "pro",
    providerModel: "openai/gpt-4o",
    price: "$0.0025/1K",
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
    category: "premium",
    tier: "pro",
    providerModel: "google/gemini-2.5-pro",
    price: "$0.00125/1K",
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
    cost: "$$",
    category: "research",
    tier: "pro",
    providerModel: "sonar",
    price: "Pro",
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
    category: "premium",
    tier: "pro",
    providerModel: "mistralai/mistral-large",
    price: "$0.002/1K",
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
    cost: "$",
    category: "premium",
    tier: "starter",
    providerModel: "meta-llama/llama-3.1-8b-instruct",
    price: "$0.00002/1K",
    glyph: "🦙",
    tagline: "Ochiq manba, deyarli tekin",
    description: "Meta'ning ochiq modeli. Eng arzon variant — kundalik savollar uchun yetarli.",
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
  {
    id: "claude-haiku-4-5",
    name: "Claude Haiku 4.5",
    shortName: "Haiku",
    provider: "Anthropic",
    theme: "claude",
    cost: "$",
    category: "premium",
    tier: "starter",
    providerModel: "anthropic/claude-haiku-4.5",
    price: "$0.001/1K",
    glyph: "✦",
    tagline: "Tez va arzon Claude",
    description: "Kundalik savollar, qisqa matnlar va tahrir uchun yengil Claude.",
    primary: "#CC785C",
    accent: "#D4956A",
    bg: "#1A0F0A",
    capabilities: [
      { label: "Tez", score: 5 },
      { label: "Aqlli", score: 3 },
    ],
    demo: { user: "", ai: "" },
  },
  {
    id: "gpt-4o-mini",
    name: "GPT-4o mini",
    shortName: "GPT mini",
    provider: "OpenAI",
    theme: "chatgpt",
    cost: "$",
    category: "premium",
    tier: "starter",
    providerModel: "openai/gpt-4o-mini",
    price: "$0.00015/1K",
    glyph: "⬡",
    tagline: "Yengil, tez GPT",
    description: "Oddiy suhbat va qisqa vazifalar uchun arzon GPT.",
    primary: "#10A37F",
    accent: "#19C37D",
    bg: "#212121",
    capabilities: [
      { label: "Tez", score: 5 },
      { label: "Kod", score: 3 },
    ],
    demo: { user: "", ai: "" },
  },
  {
    id: "sonar-pro-online",
    name: "Perplexity Sonar Pro",
    shortName: "Sonar Pro",
    provider: "Perplexity AI",
    theme: "perplexity",
    cost: "$",
    category: "research",
    tier: "ultra",
    providerModel: "sonar-pro",
    price: "$0.001/qidiruv",
    glyph: "⊕",
    tagline: "Chuqur tadqiqot, ko'proq manba",
    description: "Ko'p bosqichli qidiruv, uzunroq javob va batafsil manbalar.",
    primary: "#20808D",
    accent: "#29A0AD",
    bg: "#0A0E14",
    capabilities: [
      { label: "Internet", score: 5 },
      { label: "Chuqurlik", score: 5 },
    ],
    demo: { user: "", ai: "" },
  },
  {
    id: "gemini-flash-free",
    name: "Gemini 2.0 Flash",
    shortName: "Gemini",
    provider: "Google",
    theme: "gemini",
    cost: "free",
    category: "free",
    tier: "free",
    providerModel: "google/gemini-2.0-flash-exp:free",
    price: "Tekin",
    glyph: "✦",
    tagline: "Google'ning ko'p modal tekin modeli",
    description: "Rasm, video, matnni ko'radi. Tez javob. Kundalik savol-javob uchun ideal.",
    primary: "#4285F4",
    accent: "#A855F7",
    bg: "#0C0C1E",
    capabilities: [
      { label: "Tekin", score: 5 },
      { label: "Ko'p modal", score: 5 },
    ],
    demo: { user: "", ai: "" },
  },
  {
    id: "llama-3.3-free",
    name: "Llama 3.3 70B",
    shortName: "Llama",
    provider: "Meta (Groq)",
    theme: "sovereign",
    cost: "free",
    category: "free",
    tier: "free",
    providerModel: "meta-llama/llama-3.3-70b-instruct:free",
    price: "Tekin",
    glyph: "◎",
    tagline: "Dunyodagi eng tez inference",
    description: "Groq direct — 500 tok/s. Tool-calling ideal ishlaydi. Kod agent uchun asosiy tanlov.",
    primary: "#5B50F0",
    accent: "#7C6FF7",
    bg: "#060812",
    capabilities: [
      { label: "Tekin", score: 5 },
      { label: "Kod", score: 5 },
      { label: "Tez", score: 5 },
    ],
    demo: { user: "", ai: "" },
  },
  {
    id: "deepseek-r1-free",
    name: "DeepSeek R1 70B",
    shortName: "DeepSeek",
    provider: "DeepSeek",
    theme: "sovereign",
    cost: "free",
    category: "free",
    tier: "free",
    providerModel: "deepseek/deepseek-r1-distill-llama-70b:free",
    price: "Tekin",
    glyph: "◈",
    tagline: "O'ylaydigan tekin model",
    description: "Reasoning modeli. Matematika, mantiq, kod uchun. Javob berishdan oldin o'ylab chiqadi.",
    primary: "#5B50F0",
    accent: "#7C6FF7",
    bg: "#060812",
    capabilities: [
      { label: "Tekin", score: 5 },
      { label: "Reasoning", score: 5 },
    ],
    demo: { user: "", ai: "" },
  },
];

/* ------------------------------------------------------------------ */
/* Extended catalog (50+). Generated compactly from provider metadata.  */
/* ------------------------------------------------------------------ */

interface ProviderMeta {
  theme: ModelTheme;
  provider: string;
  glyph: string;
  primary: string;
  accent: string;
  bg: string;
}
const PROV: Record<string, ProviderMeta> = {
  anthropic: { theme: "claude", provider: "Anthropic", glyph: "✦", primary: "#D97757", accent: "#E0A08A", bg: "#262624" },
  openai: { theme: "chatgpt", provider: "OpenAI", glyph: "⬡", primary: "#10A37F", accent: "#19C37D", bg: "#212121" },
  google: { theme: "gemini", provider: "Google", glyph: "✦", primary: "#4285F4", accent: "#A855F7", bg: "#0C0C1E" },
  mistralai: { theme: "mistral", provider: "Mistral AI", glyph: "⬌", primary: "#FF7000", accent: "#FF9500", bg: "#0F0A05" },
  meta: { theme: "llama", provider: "Meta AI", glyph: "🦙", primary: "#7C3AED", accent: "#9F67FF", bg: "#080516" },
  deepseek: { theme: "sovereign", provider: "DeepSeek", glyph: "◇", primary: "#4D6BFE", accent: "#7C8FFF", bg: "#060812" },
  qwen: { theme: "sovereign", provider: "Alibaba Qwen", glyph: "◈", primary: "#615CED", accent: "#8B87F5", bg: "#060812" },
  xai: { theme: "sovereign", provider: "xAI", glyph: "✕", primary: "#8E8E93", accent: "#C7C7CC", bg: "#060812" },
  zai: { theme: "sovereign", provider: "Z.ai", glyph: "◎", primary: "#5B50F0", accent: "#7C6FF7", bg: "#060812" },
  nvidia: { theme: "sovereign", provider: "NVIDIA", glyph: "▹", primary: "#76B900", accent: "#9BE000", bg: "#060812" },
};

type Spec = [
  prov: keyof typeof PROV,
  id: string,
  providerModel: string,
  name: string,
  shortName: string,
  tier: ModelTier,
  price: string,
  tagline: string,
];

// prov, id, providerModel, name, shortName, tier, price, tagline
const EXTRA_SPECS: Spec[] = [
  // Anthropic
  ["anthropic", "claude-opus-5", "anthropic/claude-opus-5", "Claude Opus 5", "Opus 5", "ultra", "$5/M", "Eng kuchli Claude — murakkab vazifalar"],
  ["anthropic", "claude-sonnet-5", "anthropic/claude-sonnet-5", "Claude Sonnet 5", "Sonnet 5", "pro", "$2/M", "Muvozanatli, tez va aqlli Claude"],
  ["anthropic", "claude-opus-4-8", "anthropic/claude-opus-4.8", "Claude Opus 4.8", "Opus 4.8", "ultra", "$5/M", "Chuqur fikrlash va tahlil"],
  // OpenAI
  ["openai", "gpt-6-astra", "openai/gpt-6-astra", "GPT-6 Astra", "GPT-6", "ultra", "$10/M", "OpenAI'ning eng ilg'or modeli"],
  ["openai", "gpt-5-6-sol", "openai/gpt-5.6-sol", "GPT-5.6 Sol", "GPT-5.6", "pro", "$2/M", "Kuchli umumiy va kod modeli"],
  ["openai", "gpt-5-6-luna", "openai/gpt-5.6-luna", "GPT-5.6 Luna", "Luna", "starter", "$0.20/M", "Tez va arzon GPT"],
  ["openai", "o1-mini", "openai/o1-mini", "o1-mini", "o1-mini", "pro", "$1.1/M", "Fikrlash (reasoning) modeli"],
  // Google
  ["google", "gemini-3-5-flash", "google/gemini-3.5-flash", "Gemini 3.5 Flash", "Gemini 3.5", "pro", "$1.5/M", "Tez, ko'p modal Gemini"],
  ["google", "gemini-3-1-flash-lite", "google/gemini-3.1-flash-lite", "Gemini 3.1 Flash Lite", "Flash Lite", "starter", "$0.25/M", "Yengil va arzon Gemini"],
  ["google", "gemini-3-pro-image", "google/gemini-3-pro-image", "Gemini 3 Pro (Nano Banana)", "Nano Banana", "pro", "$2/M", "Rasm yaratish va tahrir"],
  // Mistral
  ["mistralai", "mistral-medium-3-5", "mistralai/mistral-medium-3-5", "Mistral Medium 3.5", "Medium 3.5", "pro", "$1.5/M", "Evropa AI'si, ko'p tilli"],
  ["mistralai", "mistral-small", "mistralai/mistral-small-latest", "Mistral Small", "Small", "starter", "$0.20/M", "Yengil Mistral"],
  // Meta
  ["meta", "llama-3-3-70b", "meta-llama/llama-3.3-70b-instruct", "LLaMA 3.3 70B", "LLaMA 70B", "starter", "$0.13/M", "Kuchli ochiq Meta modeli"],
  ["meta", "llama-4-scout", "meta-llama/llama-4-scout", "LLaMA 4 Scout", "LLaMA 4", "pro", "$0.6/M", "Meta'ning yangi avlodi"],
  // DeepSeek
  ["deepseek", "deepseek-v4-pro", "deepseek/deepseek-v4-pro-0813", "DeepSeek V4 Pro", "DeepSeek Pro", "pro", "$0.58/M", "Kod va fikrlashda kuchli"],
  ["deepseek", "deepseek-v4-flash", "deepseek/deepseek-v4-flash-0731", "DeepSeek V4 Flash", "DeepSeek Flash", "starter", "$0.06/M", "Juda arzon va tez"],
  // Qwen
  ["qwen", "qwen3-7-max", "qwen/qwen3.7-max", "Qwen 3.7 Max", "Qwen Max", "pro", "$1.48/M", "Alibaba'ning kuchli modeli"],
  ["qwen", "qwen3-7-flash", "qwen/qwen3.7-flash", "Qwen 3.7 Flash", "Qwen Flash", "starter", "$0.03/M", "Eng arzon variantlardan"],
  // xAI
  ["xai", "grok-4-6", "x-ai/grok-4.6", "Grok 4.6", "Grok 4.6", "pro", "$2/M", "xAI'ning suhbatga kuchli modeli"],
  ["xai", "grok-4-3", "x-ai/grok-4.3", "Grok 4.3", "Grok 4.3", "pro", "$1.25/M", "Tez va hazil-mutoyibali Grok"],
  // Z.ai
  ["zai", "glm-5-3", "z-ai/glm-5.3", "GLM 5.3", "GLM 5.3", "pro", "$1.4/M", "Kuchli ko'p tilli model"],
  ["zai", "glm-5-3-flash", "z-ai/glm-5.3-flash", "GLM 5.3 Flash", "GLM Flash", "starter", "$0.09/M", "Yengil GLM"],
  // NVIDIA free
  ["nvidia", "nemotron-lightning-free", "nvidia/nemotron-3.5-lightning:free", "Nemotron 3.5 Lightning", "Nemotron Lite", "free", "Tekin", "Tez, tekin NVIDIA modeli"],
  ["nvidia", "nemotron-nano-free", "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free", "Nemotron 3 Nano", "Nemotron Nano", "free", "Tekin", "Fikrlaydigan tekin model"],
  // More — to broaden choice (50+ total)
  ["anthropic", "claude-fable-5-1", "anthropic/claude-fable-5.1", "Claude Fable 5.1", "Fable 5.1", "ultra", "$10/M", "Anthropic'ning eng ijodiy modeli"],
  ["openai", "gpt-5-6-terra", "openai/gpt-5.6-terra", "GPT-5.6 Terra", "Terra", "pro", "$2/M", "Kuchli kod va tahlil"],
  ["openai", "gpt-5-6-luna-pro", "openai/gpt-5.6-luna-pro", "GPT-5.6 Luna Pro", "Luna Pro", "starter", "$0.20/M", "Arzon, kengaytirilgan Luna"],
  ["google", "gemini-3-8-flash", "google/gemini-3.8-flash", "Gemini 3.8 Flash", "Gemini 3.8", "pro", "$0.75/M", "Google'ning eng yangi Flash'i"],
  ["google", "gemini-3-1-flash-image", "google/gemini-3.1-flash-image", "Gemini 3.1 (Nano Banana 2)", "Nano Banana 2", "pro", "$0.5/M", "Rasm yaratish"],
  ["xai", "grok-4-5", "x-ai/grok-4.5", "Grok 4.5", "Grok 4.5", "pro", "$2/M", "xAI'ning kuchli modeli"],
  ["qwen", "qwen3-8-max", "qwen/qwen3.8-max-0902", "Qwen 3.8 Max", "Qwen 3.8", "pro", "$2/M", "Alibaba'ning yangi flagmani"],
  ["qwen", "qwen3-8-27b", "qwen/qwen3.8-27b", "Qwen 3.8 27B", "Qwen 27B", "starter", "$0.21/M", "Arzon, kuchli ochiq model"],
  ["deepseek", "deepseek-v4-1-flash", "deepseek/deepseek-v4.1-flash", "DeepSeek V4.1 Flash", "DeepSeek 4.1", "starter", "$0.15/M", "Yangi, tez DeepSeek"],
  ["zai", "glm-5-2", "z-ai/glm-5.2", "GLM 5.2", "GLM 5.2 Pro", "pro", "$1.4/M", "Kuchli ko'p tilli GLM"],
  ["mistralai", "mistral-large-2", "mistralai/mistral-large", "Mistral Large", "Large", "pro", "$2/M", "Mistral'ning flagmani"],
  ["nvidia", "nemotron-ultra-free", "nvidia/nemotron-3-ultra-550b-a55b:free", "Nemotron 3 Ultra", "Nemotron Ultra", "free", "Tekin", "550B tekin ochiq model"],
  ["openai", "gpt-4o-full", "openai/gpt-4o", "GPT-4o", "GPT-4o", "pro", "$2.5/M", "Ishonchli ko'p modal GPT"],
  ["google", "gemini-3-5-flash-lite", "google/gemini-3.5-flash-lite", "Gemini 3.5 Flash Lite", "3.5 Lite", "starter", "$0.30/M", "Yengil 3.5"],
  ["meta", "llama-3-1-70b", "meta-llama/llama-3.1-70b-instruct", "LLaMA 3.1 70B", "LLaMA 3.1", "starter", "$0.13/M", "Barqaror ochiq model"],
  ["xai", "grok-build", "x-ai/grok-build-0.1", "Grok Build", "Grok Build", "pro", "$1/M", "Kod va qurishga yo'naltirilgan"],
];

function specToModel([prov, id, providerModel, name, shortName, tier, price, tagline]: Spec): SovereignModel {
  const p = PROV[prov];
  const category: ModelCategory = tier === "free" ? "free" : "premium";
  return {
    id,
    name,
    shortName,
    provider: p.provider,
    theme: p.theme,
    cost: tier === "free" ? "free" : tier === "starter" ? "$" : "$$",
    category,
    tier,
    providerModel,
    price,
    glyph: p.glyph,
    tagline,
    description: tagline,
    primary: p.primary,
    accent: p.accent,
    bg: p.bg,
    capabilities: [
      { label: tier === "free" ? "Tekin" : "Aqlli", score: tier === "ultra" ? 5 : tier === "pro" ? 4 : 3 },
      { label: "Tez", score: tier === "starter" || tier === "free" ? 5 : 4 },
    ],
    demo: { user: "", ai: "" },
  };
}

const EXTRA_MODELS: SovereignModel[] = EXTRA_SPECS.map(specToModel);

export const MODELS: SovereignModel[] = [...FLAGSHIP, ...EXTRA_MODELS];

export const MODEL_BY_ID: Record<string, SovereignModel> = Object.fromEntries(
  MODELS.map((m) => [m.id, m]),
);

/** Models shown on the landing showcase (the six flagship ones). */
export const SHOWCASE_MODELS = MODELS.filter((m) => m.demo.user.length > 0);

/** Switcher groups, ordered by subscription tier. */
export const MODEL_GROUPS: { tier: ModelTier; label: string; badge?: string }[] = [
  { tier: "free", label: "Tekin modellar", badge: "🆓" },
  { tier: "starter", label: "Starter · $5", badge: "⚡" },
  { tier: "pro", label: "Pro · $15", badge: "✦" },
  { tier: "ultra", label: "Ultra · $29", badge: "🚀" },
];

// Default: Auto rejim — Dashboard SOVEREIGN temasi ko'rsatadi (model temasi emas).
// Foydalanuvchi Claude/Gemini/ChatGPT chip'ini bosgach o'sha model temasi keladi.
export const DEFAULT_MODEL_ID = "auto";
export const RESEARCH_MODEL_ID = "sonar-online";
export const AUTO_MODEL_ID = "auto";

/** Virtual "Auto" model — the server picks the real model(s) per request. */
export const AUTO_MODEL: SovereignModel = {
  id: AUTO_MODEL_ID,
  name: "SOVEREIGN Auto",
  shortName: "Auto",
  provider: "Aqlli yo'naltirish",
  theme: "sovereign",
  cost: "free",
  category: "premium",
  tier: "free",
  providerModel: "",
  price: "Aqlli",
  glyph: "✦",
  tagline: "Savolga mos modelni o'zi tanlaydi",
  description: "Avval o'ylab, vazifaga qarab eng mos modelni (yoki research→kod zanjirini) tanlaydi.",
  primary: "#5B50F0",
  accent: "#7C6FF7",
  bg: "#060812",
  capabilities: [
    { label: "Aqlli", score: 5 },
    { label: "Avto", score: 5 },
  ],
  demo: { user: "", ai: "" },
};

export function resolveModel(id: string): SovereignModel {
  return id === AUTO_MODEL_ID ? AUTO_MODEL : (MODEL_BY_ID[id] ?? MODEL_BY_ID[DEFAULT_MODEL_ID]);
}

export const MODEL_BY_THEME: Record<Exclude<ModelTheme, "sovereign">, SovereignModel> =
  Object.fromEntries(SHOWCASE_MODELS.map((m) => [m.theme, m])) as Record<
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
