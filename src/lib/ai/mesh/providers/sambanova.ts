import type { ChatBody, ClassifiedError, Limits, ModelOffer, ProviderAdapter } from "../types";
import { classifyOpenAiStyleError, hasEnv } from "./cerebras";

/**
 * SambaNova Cloud (SambaCloud) adapteri — OpenAI-mos chat-completions:
 *   POST https://api.sambanova.ai/v1/chat/completions (Bearer SAMBANOVA_API_KEY).
 *
 * Model ro'yxati docs.sambanova.ai/docs/en/models/sambacloud-models, tool-calling ro'yxati
 * docs.sambanova.ai/docs/en/features/function-calling da 2026-09-27 tekshirilgan.
 * providers.ts DIRECT_ROUTES dagi eski id'lar (Meta-Llama-3.1-405B-Instruct,
 * DeepSeek-R1-Distill-Llama-70B) endi ro'yxatda yo'q — offer qilinmaydi.
 *
 * Eval: kalit bor, lekin hisobda to'lov/kredit yo'q bo'lsa 402 yoki 403 — `no_credit`.
 * Xato tasnifi Cerebras bilan umumiy (`classifyOpenAiStyleError`, ./cerebras.ts).
 */

const SAMBANOVA_BASE = "https://api.sambanova.ai/v1";

/**
 * Takliflar. Bepul rejadagi (rate-limits sahifasida ro'yxatlangan) modellar — `cost: "free"`,
 * `class: "free"` (tekin zanjirda ishtirok etadi), sifati `quality` bilan. MiniMax — bepul
 * limitlar ro'yxatida yo'q, ya'ni pullik (`cheap`, minTier standart: starter).
 */
export const SAMBANOVA_OFFERS: ModelOffer[] = [
  {
    // Production, 128k. Katalog: llama-3.3-free (tier free) va llama-3-3-70b (starter) — ikkalasi shu og'irliklar.
    sovereignIds: [
      "llama-3.3-free",
      "meta-llama/llama-3.3-70b-instruct:free",
      "llama-3-3-70b",
      "meta-llama/llama-3.3-70b-instruct",
    ],
    wire: "Meta-Llama-3.3-70B-Instruct",
    class: "free",
    cost: "free",
    caps: { stream: true, tools: true, vision: false, json: true },
  },
  {
    // Production, 128k.
    sovereignIds: ["openai/gpt-oss-120b", "openai/gpt-oss-120b:free", "groq/openai/gpt-oss-120b", "cloudflare/@cf/openai/gpt-oss-120b"],
    wire: "gpt-oss-120b",
    class: "free",
    cost: "free",
    caps: { stream: true, tools: true, vision: false, json: true },
    quality: 0.8,
  },
  {
    // Production, 128k. Katalogda yo'q (katalogda DeepSeek V4) — OpenRouter id'si bilan so'ralsa sameModel.
    sovereignIds: ["deepseek/deepseek-chat-v3.1"],
    wire: "DeepSeek-V3.1",
    class: "free",
    cost: "free",
    caps: { stream: true, tools: true, vision: false, json: true },
    quality: 0.85,
  },
  {
    // Preview, 32k.
    sovereignIds: ["deepseek/deepseek-v3.2"],
    wire: "DeepSeek-V3.2",
    class: "free",
    cost: "free",
    caps: { stream: true, tools: true, vision: false, json: false },
    quality: 0.82,
  },
  {
    // Preview, 128k, rasm kiritish bor; tool-calling ro'yxatida yo'q.
    sovereignIds: ["google/gemma-4-31b-it", "google/gemma-4-31b-it:free", "openrouter/google/gemma-4-31b-it:free"],
    wire: "gemma-4-31B-it",
    class: "free",
    cost: "free",
    caps: { stream: true, tools: false, vision: true, json: false },
    quality: 0.72,
  },
  {
    // Production, 192k — bepul limitlar ro'yxatida yo'q (pullik).
    sovereignIds: ["minimax/minimax-m2.7"],
    wire: "MiniMax-M2.7",
    class: "fast",
    cost: "cheap",
    caps: { stream: true, tools: true, vision: false, json: false },
  },
];

/** Wire id → kanonik "vendor/model" (region.ts policyOwner va served badge uchun). */
const SAMBANOVA_CANONICAL: Record<string, string> = {
  "Meta-Llama-3.3-70B-Instruct": "meta-llama/llama-3.3-70b-instruct",
  "gpt-oss-120b": "openai/gpt-oss-120b",
  "DeepSeek-V3.1": "deepseek/deepseek-chat-v3.1",
  "DeepSeek-V3.2": "deepseek/deepseek-v3.2",
  "gemma-4-31B-it": "google/gemma-4-31b-it",
  "MiniMax-M2.7": "minimax/minimax-m2.7",
};

/**
 * Bepul reja (har model uchun alohida): 20 RPM, 20 RPD, 200 000 TPD. Cheklovchi — RPD
 * (kuniga 20 so'rov), shuning uchun kunlik birlik — so'rov.
 * Sarlavhalar: x-ratelimit-{limit,remaining,reset}-requests va ...-requests-day.
 */
export const SAMBANOVA_LIMITS: Limits = {
  rpm: 20,
  rpd: 20,
  tpd: 200_000,
  dailyUnits: 20,
  unit: "requests",
  perModel: true,
  source: "https://docs.sambanova.ai/docs/en/models/rate-limits (2026-09-27)",
};

/** SambaNova qo'llamaydigan / xato beradigan maydonlar (docs.sambanova.ai .../openai-compatibility). */
function sambanovaBody(body: ChatBody): ChatBody {
  const out: ChatBody = { ...body };
  // presence/frequency_penalty — e'tiborsiz; logit_bias — ayrim modellarda xato beradi.
  delete out.logit_bias;
  // n > 1 tools bilan 400 beradi.
  if (Array.isArray(out.tools) && out.tools.length > 0 && typeof out.n === "number" && out.n !== 1) delete out.n;
  return out;
}

export function classifySambanovaError(status: number, body: string, headers: Headers, now: number): ClassifiedError {
  return classifyOpenAiStyleError(status, body, headers, now, { perModelLimits: true, forbiddenIsNoCredit: true });
}

export const sambanovaAdapter: ProviderAdapter = {
  id: "sambanova",
  host: "sambanova",
  enabled: () => hasEnv("SAMBANOVA_API_KEY"),
  endpoint: () => ({
    url: `${SAMBANOVA_BASE}/chat/completions`,
    headers: {
      Authorization: `Bearer ${process.env.SAMBANOVA_API_KEY?.trim() ?? ""}`,
      "Content-Type": "application/json",
    },
  }),
  offers: SAMBANOVA_OFFERS,
  limits: SAMBANOVA_LIMITS,
  classifyError: (status, body, headers) => classifySambanovaError(status, body, headers, Date.now()),
  transformBody: (body) => sambanovaBody(body),
  displayId: (wire) => `sambanova/${SAMBANOVA_CANONICAL[wire] ?? wire}`,
};
