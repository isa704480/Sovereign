/**
 * Model ro'yxat narxlari ($ / 1M token, kirish va chiqish) — unit economics
 * (admin "Unit economics" kartasi) uchun. PURE: tarmoq, env, server-only yo'q.
 *
 * Qoidalar:
 *  - Narx O'YLAB TOPILMAYDI: har yozuvda manba URL va tekshirilgan sana bor.
 *  - Model narxi "ro'yxat narxi" (list price). Reseller (RSI, OmniRoute) orqali
 *    haqiqiy xarajat pastroq bo'lishi mumkin — biz ataylab yuqoriroq (konservativ) baholaymiz.
 *  - Tekin tarifdagi provayderlar (Groq free plan, Cloudflare kunlik 10k neuron, ...)
 *    ham TO'LIQ pullik ro'yxat narxida hisoblanadi, lekin alohida "free tier" deb
 *    belgilanadi — shunda metrika tekin kvota hisobiga sun'iy yaxshilanmaydi.
 *  - Bu yerda yo'q model "narxsiz" — hisobdan chiqariladi va soni alohida ko'rsatiladi.
 *
 * Asosiy manba: OpenRouter ommaviy model ro'yxati https://openrouter.ai/api/v1/models
 * (pricing.prompt / pricing.completion × 1e6), har model sahifasi https://openrouter.ai/<id>.
 * Provayderga xos narxlar (Groq, Cloudflare, Mistral) — o'sha provayderning rasmiy sahifasidan.
 */
import { CF, CF_NEURONS_PER_M } from "@/lib/ai/cloudflare";

export const PRICES_CHECKED = "2026-09-27";

export interface ModelPrice {
  /** Kanonik id ("vendor/model") yoki provayder id'si ("@cf/...", "codestral-latest"). */
  id: string;
  /** Faqat shu provayder yo'lida qo'llanadigan narx (masalan Cloudflare neuron narxi). */
  provider?: string;
  /** Shu yozuvga tegishli boshqa yozilishlar (masalan "perplexity/fast"). */
  aliases?: string[];
  inPerM: number;
  outPerM: number;
  source: string;
  url: string;
  checked: string;
}

const or = (id: string, inPerM: number, outPerM: number, aliases?: string[]): ModelPrice => ({
  id,
  inPerM,
  outPerM,
  ...(aliases ? { aliases } : {}),
  source: "OpenRouter list price",
  url: `https://openrouter.ai/${id}`,
  checked: PRICES_CHECKED,
});

const official = (
  id: string,
  inPerM: number,
  outPerM: number,
  source: string,
  url: string,
  extra: Partial<ModelPrice> = {},
): ModelPrice => ({ id, inPerM, outPerM, source, url, checked: PRICES_CHECKED, ...extra });

/** Cloudflare Workers AI pullik narxi: $0.011 / 1000 neuron (developers.cloudflare.com/workers-ai/platform/pricing/). */
export const CF_USD_PER_NEURON = 0.011 / 1000;
const CF_PRICING_URL = "https://developers.cloudflare.com/workers-ai/platform/pricing/";

const cloudflare = (model: string): ModelPrice => {
  const n = CF_NEURONS_PER_M[model];
  return {
    id: model,
    provider: "cloudflare",
    inPerM: Math.round(n.in * CF_USD_PER_NEURON * 10_000) / 10_000,
    outPerM: Math.round(n.out * CF_USD_PER_NEURON * 10_000) / 10_000,
    source: "Cloudflare Workers AI paid price (neurons/M × $0.011 per 1k neurons)",
    url: CF_PRICING_URL,
    checked: PRICES_CHECKED,
  };
};

const GROQ_URL = "https://console.groq.com/docs/models";
const MISTRAL_URL = "https://mistral.ai/pricing/api/";

export const MODEL_PRICES: ModelPrice[] = [
  // ── Anthropic (claude.com/pricing bilan mos) ──
  official("anthropic/claude-sonnet-5", 2, 10, "Anthropic API pricing", "https://claude.com/pricing"),
  official("anthropic/claude-sonnet-4.5", 3, 15, "Anthropic API pricing", "https://claude.com/pricing"),
  or("anthropic/claude-haiku-4.5", 1, 5),
  or("anthropic/claude-opus-5", 5, 25),
  or("anthropic/claude-opus-4.8", 5, 25),
  or("anthropic/claude-fable-5.1", 10, 50, ["claude-fable-5"]),
  // ── OpenAI ──
  official("openai/gpt-4o", 2.5, 10, "OpenAI API pricing", "https://developers.openai.com/api/docs/models/gpt-4o"),
  or("openai/gpt-4o-mini", 0.15, 0.6),
  or("openai/gpt-6-astra", 10, 50),
  or("openai/gpt-5.6-sol", 2, 10),
  or("openai/gpt-5.6-terra", 2, 12),
  or("openai/gpt-5.6-luna", 0.2, 1.2),
  or("openai/gpt-5.6-luna-pro", 0.2, 1.2),
  or("openai/gpt-oss-120b", 0.15, 0.6),
  or("openai/gpt-oss-20b", 0.018, 0.09),
  // ── Google ──
  or("google/gemini-2.5-pro", 1.25, 10),
  or("google/gemini-3.5-flash", 1.5, 9),
  or("google/gemini-3.5-flash-lite", 0.3, 2.5),
  or("google/gemini-3.8-flash", 0.75, 3.75),
  or("google/gemini-3.1-flash-lite", 0.25, 1.5),
  or("google/gemini-3-pro-image", 2, 12),
  or("google/gemini-3.1-flash-image", 0.5, 3),
  // ── Perplexity (faqat token narxi; so'rov/qidiruv to'lovi kiritilmagan) ──
  or("perplexity/sonar", 1, 1, ["perplexity/fast"]),
  or("perplexity/sonar-pro", 3, 15, ["perplexity/medium"]),
  // ── Mistral ──
  or("mistralai/mistral-large", 2, 6),
  or("mistralai/mistral-medium-3-5", 1.5, 7.5),
  or("mistralai/mistral-nemo", 0.019, 0.03, ["mistral-Nemo-Instruct-2407"]),
  official("mistral-large-latest", 0.5, 1.5, "Mistral API pricing (Mistral Large 3)", MISTRAL_URL, { provider: "mistral" }),
  official("mistral-small-latest", 0.15, 0.6, "Mistral API pricing (Mistral Small 4)", MISTRAL_URL, {
    provider: "mistral",
    aliases: ["mistralai/mistral-small", "mistralai/mistral-small-latest"],
  }),
  official("codestral-latest", 0.3, 0.9, "Mistral API pricing (Codestral)", MISTRAL_URL, {
    provider: "mistral",
    aliases: ["mistralai/codestral-latest"],
  }),
  // ── Meta ──
  or("meta-llama/llama-3.3-70b-instruct", 0.1, 0.32),
  or("meta-llama/llama-3.1-8b-instruct", 0.05, 0.08),
  or("meta-llama/llama-3.1-70b-instruct", 0.4, 0.4),
  or("meta-llama/llama-4-scout", 0.1, 0.3),
  // ── DeepSeek ──
  or("deepseek/deepseek-v4-pro-0813", 0.24502, 3.5),
  or("deepseek/deepseek-v4-pro", 0.348, 0.696),
  or("deepseek/deepseek-v4-flash-0731", 0.021, 0.32),
  or("deepseek/deepseek-v4-flash", 0.0469, 0.0938),
  or("deepseek/deepseek-v4.1-flash", 0.035, 0.29),
  or("deepseek/deepseek-r1-distill-llama-70b", 0.8, 0.8),
  // ── Qwen ──
  or("qwen/qwen3.7-max", 1.475, 4.425),
  or("qwen/qwen3.7-flash", 0.03, 0.13),
  or("qwen/qwen3.8-max-0902", 2, 6),
  or("qwen/qwen3.8-27b", 0.42, 3),
  or("qwen/qwen3-32b", 0.08, 0.28),
  // ── xAI ──
  or("x-ai/grok-4.6", 2, 6),
  or("x-ai/grok-4.5", 2, 6),
  or("x-ai/grok-4.3", 1.25, 2.5),
  or("x-ai/grok-build-0.1", 1, 2),
  // ── Z.ai ──
  or("z-ai/glm-5.3", 0.1785, 0.561),
  or("z-ai/glm-5.3-flash", 0.045, 0.14),
  or("z-ai/glm-5.2", 0.6496, 2.0416),
  // ── Moonshot ──
  or("moonshotai/kimi-k2.6", 0.95, 4),
  or("moonshotai/kimi-k2.7-code", 0.6562, 3.3),
  // ── NVIDIA (":free" variantlari shu pullik narxda + free tier belgisi) ──
  or("nvidia/nemotron-3.5-lightning", 0.08, 0.2),
  or("nvidia/nemotron-3-ultra-550b-a55b", 0.6, 2.4),
  // ── Groq (provayderga xos ro'yxat narxi) ──
  official("openai/gpt-oss-120b", 0.15, 0.6, "Groq on-demand pricing", GROQ_URL, { provider: "groq" }),
  official("openai/gpt-oss-20b", 0.075, 0.3, "Groq on-demand pricing", GROQ_URL, { provider: "groq" }),
  official("qwen/qwen3.8-27b", 0.8, 4, "Groq on-demand pricing", GROQ_URL, { provider: "groq" }),
  // ── Cloudflare Workers AI (neuron narxidan) ──
  ...Object.values(CF).map(cloudflare),
];

/**
 * Tekin tarifda ishlatiladigan provayderlar. Ularning javoblari ro'yxat narxida
 * hisoblanadi, lekin "free tier" ulushi alohida ko'rsatiladi.
 */
export const FREE_TIER_PROVIDERS: Record<string, string> = {
  groq: "GroqCloud Free plan (rate-limited) — https://console.groq.com/docs/rate-limits",
  cloudflare: "Workers AI: 10,000 neurons/day free — " + CF_PRICING_URL,
  cerebras: "Cerebras free tier",
  sambanova: "SambaNova free tier",
  nvidia: "NVIDIA NIM free credits",
  llm7: "LLM7 free gateway",
};

/** Solishtirish uchun bitta-vendor flagman bazalari (konfiguratsiya qilinadi). */
export interface Baseline {
  key: string;
  label: string;
  model: string;
}

export const DEFAULT_BASELINES: Baseline[] = [
  { key: "gpt-4o", label: "GPT-4o", model: "openai/gpt-4o" },
  { key: "claude-sonnet", label: "Claude Sonnet 5", model: "anthropic/claude-sonnet-5" },
];
