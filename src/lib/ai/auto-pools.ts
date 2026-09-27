import "server-only";
import { MODEL_BY_ID } from "@/config/models";
import { planAllowsTier, type Plan } from "@/config/plans";
import { hasKeyFor, hostIdAvailable } from "@/lib/ai/providers";
import { modelAllowedIn, regionEquivalents, restrictedRegion } from "@/lib/ai/region";
import { CF_IDS, GROQ_OSS, GROQ_QWEN } from "@/lib/ai/chain";

/**
 * SOVEREIGN Auto — tarif × vazifa bo'yicha model navbati.
 *
 * Faqat GPT/Claude emas: umumiy savollarga tez va arzon "oddiy" modellar
 * (Gemini Flash, DeepSeek, Qwen, GLM, Llama, Kimi, Mistral, Grok), kod va
 * murakkab ishga — tarif ruxsat bergan eng kuchlisi. Ro'yxat tartibi =
 * afzallik; birinchisi band bo'lsa keyingisiga o'tiladi (chat route).
 *
 * "provider/model" — OmniRoute katalogi id'lari (1750+ model); oxiridagi
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
const QWEN = GROQ_QWEN;
const CODESTRAL = "mistral/codestral-latest";
const DEEPSEEK = "openrouter/deepseek/deepseek-v4-flash";
const KIMI = "openrouter/moonshotai/kimi-k2.6";
const GLM = "openrouter/z-ai/glm-5.2";
const GEMINI_FLASH = "openrouter/google/gemini-2.5-flash";

// To'g'ridan-to'g'ri kalit bilan (OmniRoute'siz ham) ishlaydigan id'lar — chain.ts.
const CF_QWEN = CF_IDS.qwen;
const CF_DS_PRO = CF_IDS.deepseekPro;
const CF_DS_FLASH = CF_IDS.deepseekFlash;
const CF_KIMI = CF_IDS.kimi;
const CF_KIMI_CODE = CF_IDS.kimiCode;
const CF_GLM = CF_IDS.glm;

/**
 * Tekin tarif: Groq (qwen3.8-27b, gpt-oss-120b) → Cloudflare (Qwen 3.8 27B) → OpenRouter tekin
 * puli (OmniRoute auto/*, Gemma, Nemotron) → mavjud zaxiralar (llama-3.3-free → LLM7).
 */
const FREE: Record<AutoCategory, string[]> = {
  code: [QWEN, GROQ_OSS, CF_QWEN, "auto/coding:free", CODESTRAL, NEMOTRON_SUPER, "llama-3.3-free"],
  creative: [QWEN, GROQ_OSS, CF_QWEN, GEMMA, "auto/minimax", "auto/glm", "auto/best-free", "llama-3.3-free"],
  math: [QWEN, GROQ_OSS, CF_QWEN, NEMOTRON_SUPER, "auto/best-free", "llama-3.3-free"],
  general: [QWEN, GROQ_OSS, CF_QWEN, "auto/best-free", "auto/glm", GEMMA, "llama-3.3-free"],
};

// Pullik tariflar: odatdagi afzallik saqlanadi; Cloudflare ekvivalentlari oxirgi tekin zaxiradan
// oldin (OpenRouter/OmniRoute krediti tugaganda ham kuchli model qolsin).
const STARTER: Record<AutoCategory, string[]> = {
  code: [DEEPSEEK, CODESTRAL, "auto/coding:free", QWEN, CF_DS_FLASH, "llama-3.3-free"],
  creative: [GEMINI_FLASH, "auto/minimax", GEMMA, "auto/glm", CF_DS_FLASH, "llama-3.3-free"],
  math: [DEEPSEEK, NEMOTRON_ULTRA, QWEN, CF_DS_FLASH, "llama-3.3-free"],
  general: [GEMINI_FLASH, GLM, "auto/glm", "auto/best-free", CF_DS_FLASH, "llama-3.3-free"],
};

const PRO: Record<AutoCategory, string[]> = {
  code: [KIMI, DEEPSEEK, CODESTRAL, "auto/coding:free", CF_KIMI_CODE, CF_DS_PRO, "llama-3.3-free"],
  creative: [KIMI, GEMINI_FLASH, "auto/minimax", GEMMA, CF_KIMI, "llama-3.3-free"],
  math: [DEEPSEEK, NEMOTRON_ULTRA, QWEN, CF_DS_PRO, "llama-3.3-free"],
  general: [GEMINI_FLASH, GLM, DEEPSEEK, "auto/glm", "auto/best-free", CF_DS_PRO, CF_GLM, "llama-3.3-free"],
};

const ULTRA: Record<AutoCategory, string[]> = {
  code: [KIMI, DEEPSEEK, CODESTRAL, NEMOTRON_ULTRA, "auto/coding:free", CF_KIMI_CODE, CF_DS_PRO, "llama-3.3-free"],
  creative: [KIMI, GEMINI_FLASH, GLM, "auto/minimax", CF_KIMI, CF_GLM, "llama-3.3-free"],
  math: [NEMOTRON_ULTRA, DEEPSEEK, QWEN, CF_DS_PRO, "llama-3.3-free"],
  general: [KIMI, GEMINI_FLASH, GLM, NEMOTRON_ULTRA, "auto/best-free", CF_KIMI, CF_DS_PRO, "llama-3.3-free"],
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
  [GROQ_OSS]: "GPT-OSS 120B",
  [CF_QWEN]: "Qwen 3.8 27B",
  [CF_DS_PRO]: "DeepSeek V4 Pro",
  [CF_DS_FLASH]: "DeepSeek V4 Flash",
  [CF_KIMI]: "Kimi K2.6",
  [CF_KIMI_CODE]: "Kimi K2.7 Code",
  [CF_GLM]: "GLM 5.3",
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
 * OmniRoute id'lari faqat OmniRoute sozlangan bo'lsa. `country` berilsa —
 * provayderi shu mintaqaga xizmat ko'rsatmaydigan modellar (region.ts) chiqariladi;
 * hech narsa qolmasa mintaqa ekvivalentlari (DeepSeek/Qwen/GLM ...) qo'yiladi.
 */
export function autoCandidates(plan: Plan, category: AutoCategory, country?: string | null): string[] {
  const available = (id: string) => {
    const m = MODEL_BY_ID[id];
    if (m) return planAllowsTier(plan, m.tier) && hasKeyFor(m);
    // "groq/..." / "cloudflare/..." — to'g'ridan-to'g'ri kalit; boshqa "host/..." — OmniRoute.
    return hostIdAvailable(id);
  };
  const list = POOLS[poolTier(plan)][category].filter((id) => available(id) && modelAllowedIn(id, country));
  if (list.length) return list;
  if (restrictedRegion(country)) {
    // Ro'yxat bo'sh bo'lishi mumkin (masalan OFAC embargosi) — chat route rad etadi.
    return regionEquivalents(category === "code" ? "coding" : "auto", country, {
      code: category === "code",
      tierAllowed: (t) => planAllowsTier(plan, t),
      available,
    });
  }
  // Hech narsa qolmasa ham Auto jim qolmasin — eng xavfsiz tekin model.
  return ["llama-3.3-free"];
}
