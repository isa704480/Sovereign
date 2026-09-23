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

// Har bir id 2026-09-23 da OmniRoute orqali bittalab sinovdan o'tgan.
// cfp/ aug/ cxa/ dva/ provayderlari bu serverda ishlamaydi (Playwright/CLI
// talab qiladi) — ro'yxatga kiritilmagan. Claude/Grok: OpenRouter balansi
// to'ldirilgach qo'shiladi (402 butun OpenRouter ulanishini "tugagan" qiladi).
const NEMOTRON_SUPER = "openrouter/nvidia/nemotron-3-super-120b-a12b:free";
const NEMOTRON_ULTRA = "openrouter/nvidia/nemotron-3-ultra-550b-a55b:free";
const GEMMA = "openrouter/google/gemma-4-31b-it:free";
const QWEN = "groq/qwen/qwen3.8-27b";
const CODESTRAL = "mistral/codestral-latest";
const DEEPSEEK = "openrouter/deepseek/deepseek-v4-flash";
const KIMI = "openrouter/moonshotai/kimi-k2.6";
const GLM = "openrouter/z-ai/glm-5.2";
const GEMINI_FLASH = "openrouter/google/gemini-2.5-flash";

const FREE: Record<AutoCategory, string[]> = {
  code: ["auto/coding:free", CODESTRAL, QWEN, NEMOTRON_SUPER, "llama-3.3-free"],
  creative: [GEMMA, "auto/minimax", "auto/glm", "auto/best-free", "llama-3.3-free"],
  math: [NEMOTRON_SUPER, QWEN, "auto/best-free", "llama-3.3-free"],
  general: ["auto/best-free", "auto/glm", GEMMA, QWEN, "llama-3.3-free"],
};

const STARTER: Record<AutoCategory, string[]> = {
  code: [DEEPSEEK, CODESTRAL, "auto/coding:free", QWEN, "llama-3.3-free"],
  creative: [GEMINI_FLASH, "auto/minimax", GEMMA, "auto/glm", "llama-3.3-free"],
  math: [DEEPSEEK, NEMOTRON_ULTRA, QWEN, "llama-3.3-free"],
  general: [GEMINI_FLASH, GLM, "auto/glm", "auto/best-free", "llama-3.3-free"],
};

const PRO: Record<AutoCategory, string[]> = {
  code: [KIMI, DEEPSEEK, CODESTRAL, "auto/coding:free", "llama-3.3-free"],
  creative: [KIMI, GEMINI_FLASH, "auto/minimax", GEMMA, "llama-3.3-free"],
  math: [DEEPSEEK, NEMOTRON_ULTRA, QWEN, "llama-3.3-free"],
  general: [GEMINI_FLASH, GLM, DEEPSEEK, "auto/glm", "auto/best-free", "llama-3.3-free"],
};

const ULTRA: Record<AutoCategory, string[]> = {
  code: [KIMI, DEEPSEEK, CODESTRAL, NEMOTRON_ULTRA, "auto/coding:free", "llama-3.3-free"],
  creative: [KIMI, GEMINI_FLASH, GLM, "auto/minimax", "llama-3.3-free"],
  math: [NEMOTRON_ULTRA, DEEPSEEK, QWEN, "llama-3.3-free"],
  general: [KIMI, GEMINI_FLASH, GLM, NEMOTRON_ULTRA, "auto/best-free", "llama-3.3-free"],
};

const POOLS: Record<PoolTier, Record<AutoCategory, string[]>> = { free: FREE, starter: STARTER, pro: PRO, ultra: ULTRA };

/** Foydalanuvchiga ko'rinadigan qisqa nomlar (OmniRoute id → nom). */
const LABELS: Record<string, string> = {
  "auto/coding:free": "GPT-OSS 120B",
  "auto/best-free": "Best Free",
  "auto/glm": "GLM 5.1",
  "auto/minimax": "MiniMax M2.5",
  [NEMOTRON_SUPER]: "Nemotron 3 Super",
  [NEMOTRON_ULTRA]: "Nemotron 3 Ultra",
  [GEMMA]: "Gemma 4 31B",
  [QWEN]: "Qwen 3.8 27B",
  [CODESTRAL]: "Codestral",
  [DEEPSEEK]: "DeepSeek V4 Flash",
  [KIMI]: "Kimi K2.6",
  [GLM]: "GLM 5.2",
  [GEMINI_FLASH]: "Gemini 2.5 Flash",
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
