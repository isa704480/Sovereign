import "server-only";
import { MODEL_BY_ID } from "@/config/models";
import { planAllowsTier, type Plan } from "@/config/plans";
import { hasKeyFor } from "@/lib/ai/providers";

/**
 * SOVEREIGN Auto — tarif × vazifa bo'yicha model navbati.
 *
 * Faqat GPT/Claude emas: umumiy savollarga tez va arzon "oddiy" modellar
 * (Gemini Flash, DeepSeek, Qwen, GLM, Llama, Kimi, Mistral, Grok), kod va
 * murakkab ishga — tarif ruxsat bergan eng kuchlisi. Ro'yxat tartibi =
 * afzallik; birinchisi band bo'lsa keyingisiga o'tiladi (chat route).
 *
 * "provider/model" — OmniRoute katalogi id'lari (1700+ model); oxiridagi
 * statik id'lar (MODEL_BY_ID) — OmniRoute tushib qolsa ham to'g'ridan-to'g'ri
 * kalit (Groq/Mistral/Gemini) orqali javob beradigan zaxira.
 */
export type AutoCategory = "code" | "creative" | "math" | "general";
type PoolTier = "free" | "starter" | "pro" | "ultra";

const FREE: Record<AutoCategory, string[]> = {
  code: ["auto/coding:free", "groq/qwen/qwen3-32b", "groq/llama-3.3-70b-versatile", "auto/best-free", "llama-3.3-free"],
  creative: ["auto/gemma", "auto/best-free", "groq/llama-3.3-70b-versatile", "auto/llama", "llama-3.3-free"],
  math: ["oc/deepseek-v4-flash-free", "groq/qwen/qwen3-32b", "auto/best-free", "deepseek-r1-free", "llama-3.3-free"],
  general: ["auto/best-free", "auto/llama", "auto/glm", "auto/minimax", "llama-3.3-free"],
};

const STARTER: Record<AutoCategory, string[]> = {
  code: ["cfp/deepseek-ai/deepseek-v4-flash-0731", "openrouter/qwen/qwen-2.5-coder-32b-instruct", "auto/coding:free", "gpt-4o-mini", "llama-3.3-free"],
  creative: ["gemini/gemini-2.5-flash", "auto/gemini", "claude-haiku-4-5", "auto/gemma", "llama-3.3-free"],
  math: ["cfp/deepseek-ai/deepseek-v4-flash-0731", "groq/qwen/qwen3-32b", "gemini/gemini-2.5-flash", "deepseek-r1-free", "llama-3.3-free"],
  general: ["gemini/gemini-2.5-flash", "cfp/zai-org/glm-5.2", "auto/glm", "auto/best-free", "llama-3.3-free"],
};

const PRO: Record<AutoCategory, string[]> = {
  code: ["auto/claude-sonnet", "cfp/moonshotai/kimi-k2.7-code", "cfp/deepseek-ai/deepseek-v4-pro-0813", "claude-sonnet-4-5", "auto/coding:free", "llama-3.3-free"],
  creative: ["auto/claude-sonnet", "gemini/gemini-2.5-pro", "mistral/mistral-large-latest", "mistral-large", "auto/gemini", "llama-3.3-free"],
  math: ["gemini/gemini-2.5-pro", "cfp/deepseek-ai/deepseek-v4-pro-0813", "groq/qwen/qwen3-32b", "gemini-pro-1.5", "llama-3.3-free"],
  general: ["gemini/gemini-2.5-flash", "cfp/deepseek-ai/deepseek-v4-pro-0813", "aug/kimi-k2.7", "auto/gemini", "mistral-large", "llama-3.3-free"],
};

const ULTRA: Record<AutoCategory, string[]> = {
  code: ["auto/claude-opus", "cxa/gpt-5.5", "auto/claude-sonnet", "cfp/moonshotai/kimi-k2.7-code", "claude-sonnet-4-5", "llama-3.3-free"],
  creative: ["auto/claude-opus", "auto/claude-sonnet", "gemini/gemini-2.5-pro", "mistral-large", "llama-3.3-free"],
  math: ["cxa/gpt-5.5", "gemini/gemini-2.5-pro", "cfp/deepseek-ai/deepseek-v4-pro-0813", "gemini-pro-1.5", "llama-3.3-free"],
  general: ["auto/claude-sonnet", "dva/grok-4-5-medium", "gemini/gemini-2.5-pro", "cfp/deepseek-ai/deepseek-v4-pro-0813", "mistral-large", "llama-3.3-free"],
};

const POOLS: Record<PoolTier, Record<AutoCategory, string[]>> = { free: FREE, starter: STARTER, pro: PRO, ultra: ULTRA };

/** Foydalanuvchiga ko'rinadigan qisqa nomlar (OmniRoute id → nom). */
const LABELS: Record<string, string> = {
  "auto/coding:free": "Coding (tekin)",
  "auto/best-free": "Best Free",
  "auto/gemma": "Gemma",
  "auto/llama": "Llama",
  "auto/glm": "GLM",
  "auto/minimax": "MiniMax",
  "auto/gemini": "Gemini",
  "auto/claude-sonnet": "Claude Sonnet",
  "auto/claude-opus": "Claude Opus",
  "groq/qwen/qwen3-32b": "Qwen3 32B",
  "groq/llama-3.3-70b-versatile": "Llama 3.3 70B",
  "oc/deepseek-v4-flash-free": "DeepSeek V4 Flash",
  "cfp/deepseek-ai/deepseek-v4-flash-0731": "DeepSeek V4 Flash",
  "cfp/deepseek-ai/deepseek-v4-pro-0813": "DeepSeek V4 Pro",
  "openrouter/qwen/qwen-2.5-coder-32b-instruct": "Qwen 2.5 Coder",
  "gemini/gemini-2.5-flash": "Gemini 2.5 Flash",
  "gemini/gemini-2.5-pro": "Gemini 2.5 Pro",
  "cfp/zai-org/glm-5.2": "GLM 5.2",
  "cfp/moonshotai/kimi-k2.7-code": "Kimi K2.7 Code",
  "aug/kimi-k2.7": "Kimi K2.7",
  "mistral/mistral-large-latest": "Mistral Large",
  "cxa/gpt-5.5": "GPT-5.5",
  "dva/grok-4-5-medium": "Grok 4.5",
};

export function autoModelLabel(id: string): string {
  return MODEL_BY_ID[id]?.name ?? LABELS[id] ?? id.split("/").pop() ?? id;
}

function poolTier(plan: Plan): PoolTier {
  if (planAllowsTier(plan, "ultra")) return "ultra";
  if (planAllowsTier(plan, "pro")) return "pro";
  if (planAllowsTier(plan, "starter")) return "starter";
  return "free";
}

/**
 * Tarif va vazifaga mos model navbati: [asosiy, ...zaxiralar]. Statik
 * modellar faqat tarif ruxsat bersa va serverda kaliti bo'lsa qoladi;
 * OmniRoute id'lari faqat OmniRoute sozlangan bo'lsa.
 */
export function autoCandidates(plan: Plan, category: AutoCategory): string[] {
  const omni = Boolean(process.env.OMNIROUTE_BASE_URL && process.env.OMNIROUTE_API_KEY);
  const list = POOLS[poolTier(plan)][category].filter((id) => {
    const m = MODEL_BY_ID[id];
    if (m) return planAllowsTier(plan, m.tier) && hasKeyFor(m);
    return omni && id.includes("/");
  });
  // Hech narsa qolmasa ham Auto jim qolmasin — eng xavfsiz tekin model.
  return list.length ? list : ["llama-3.3-free"];
}
