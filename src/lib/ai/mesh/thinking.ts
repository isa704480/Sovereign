/**
 * Provider Mesh — "o'ylab javob" (thinking / reasoning) yo'li.
 *
 * Ikki vazifa:
 *   1. `offerThinks(offer)` — taklif fikrlaydigan modelmi (scheduler shunga ustunlik beradi;
 *      QAT'IY filtr emas — mos model bo'lmasa oddiy model javob beradi);
 *   2. `thinkingFields(provider, wire)` — provayder qo'llasa, so'rov tanasiga qo'shiladigan
 *      aniq maydon (`reasoning_effort`, OpenRouter uchun `reasoning: { effort }`), ya'ni
 *      faqat `<think>…</think>` ajratishga tayanib qolmaymiz.
 *
 * PURE: tarmoq, env, Redis yo'q.
 *
 * Test: npx tsx --conditions=react-server src/lib/ai/mesh/thinking.test.ts
 */
import type { ModelOffer, ProviderId } from "./types";

/**
 * Fikrlaydigan model oilalari (upstream `wire` nomi bo'yicha). Ro'yxat ataylab tor:
 * noto'g'ri "ha" — oddiy model fikrlaydigan deb tanlanadi va foydalanuvchi panelni
 * ko'rmaydi; noto'g'ri "yo'q" — faqat ustunlik yo'qoladi (javob baribir keladi).
 *
 * Manbalar (2026-09-27): DeepSeek R1 / deepseek-reasoner, OpenAI o-seriya va gpt-oss
 * (reasoning_effort), Qwen3 / QwQ, Magistral (Mistral), Nemotron *-reasoning,
 * "…-thinking" qo'shimchali modellar (Gemini/GLM/Kimi variantlari).
 */
const REASONING_WIRE = [
  /(^|[/:._-])r1($|[:._-])/i,
  /deepseek[-_]?r1/i,
  /deepseek[-_]?reasoner/i,
  /gpt-oss/i,
  /(^|\/)o[1-9](-|$)/i,
  /qwq/i,
  /qwen3/i,
  /magistral/i,
  /reasoner/i,
  /reasoning/i,
  /thinking/i,
];

/** Shu upstream model nomi fikrlaydigan oilaga tegishlimi. */
export function thinkingWire(wire: string): boolean {
  if (typeof wire !== "string" || !wire) return false;
  return REASONING_WIRE.some((re) => re.test(wire));
}

/**
 * Taklif fikrlaydimi. Adapter aniq aytgan bo'lsa (`offer.reasoning`) — o'sha; aks holda
 * upstream nomidan taxmin qilinadi.
 */
export function offerThinks(offer: Pick<ModelOffer, "wire" | "reasoning">): boolean {
  if (typeof offer.reasoning === "boolean") return offer.reasoning;
  return thinkingWire(offer.wire);
}

/** Standart fikrlash kuchi — javob juda sekinlashmasin (judge.ts bilan bir xil tartib). */
export const THINKING_EFFORT = "medium";

/**
 * So'rov tanasiga qo'shiladigan maydonlar. Faqat hujjatlashtirilgan holatlar — noma'lum
 * provayderga notanish maydon yuborilsa 400 (`bad_request`) butun zanjirni to'xtatardi.
 *
 *   openai      — o-seriya / GPT-5+ / gpt-oss: `reasoning_effort`
 *                 (platform.openai.com/docs/api-reference/chat, 2026-09-27)
 *   openrouter  — barcha fikrlaydigan modellar: `reasoning: { effort }`
 *                 (openrouter.ai/docs/use-cases/reasoning-tokens, 2026-09-27)
 *   groq        — gpt-oss: `reasoning_effort` (console.groq.com/docs/reasoning, 2026-09-27)
 *   cerebras    — gpt-oss-120b: `reasoning_effort` (inference-docs.cerebras.ai, 2026-09-27)
 *
 * Qolgan provayderlar uchun bo'sh obyekt: model o'zi `reasoning_content` yoki
 * `<think>…</think>` yuboradi (execute.ts ikkalasini ham tushunadi).
 */
export function thinkingFields(provider: ProviderId, wire: string): Record<string, unknown> {
  if (!thinkingWire(wire)) return {};
  switch (provider) {
    case "openrouter":
      return { reasoning: { effort: THINKING_EFFORT } };
    case "openai":
      return { reasoning_effort: THINKING_EFFORT };
    case "groq":
    case "cerebras":
      return /gpt-oss/i.test(wire) ? { reasoning_effort: THINKING_EFFORT } : {};
    default:
      return {};
  }
}
