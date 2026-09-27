/**
 * Cloudflare Workers AI — model id'lari, ekvivalentlar, neuron narxi va javob/xato
 * formatlari. PURE (tarmoq, env, server-only yo'q): providers.ts, region.ts va testlar
 * bir xil jadvaldan foydalanadi. Test: npx tsx src/lib/ai/cloudflare.test.ts
 *
 * Manba (id'lar va neuron narxlari 2026-09-27 da tekshirilgan):
 *   https://developers.cloudflare.com/workers-ai/platform/pricing/
 *   https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/
 * Tekin: kuniga 10 000 neuron (Free va Paid rejada). Bepul rejada oshsa — HTTP 429,
 * xato kodi 4006 ("daily free allocation of 10,000 neurons"); Paid rejada $0.011 / 1k neuron.
 */

export const CF = {
  kimi: "@cf/moonshotai/kimi-k2.6",
  kimiCode: "@cf/moonshotai/kimi-k2.7-code",
  deepseekPro: "@cf/deepseek-ai/deepseek-v4-pro-0813",
  deepseekFlash: "@cf/deepseek-ai/deepseek-v4-flash-0731",
  qwen: "@cf/qwen/qwen3.8-27b",
  glm: "@cf/zai-org/glm-5.3",
  glm52: "@cf/zai-org/glm-5.2",
  gptOss: "@cf/openai/gpt-oss-120b",
  llama: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
} as const;

/** SOVEREIGN ichidagi id prefiksi: "cloudflare/@cf/..." (badge'da ham shu ko'rinadi). */
export const CF_PREFIX = "cloudflare/";

export function cfId(model: string): string {
  return `${CF_PREFIX}${model}`;
}

/**
 * Katalog / OpenRouter / OmniRoute id → Cloudflare'dagi AYNAN shu model (bir xil og'irliklar,
 * shuning uchun "almashtirish" emas). Ro'yxatda yo'q model — sinf bo'yicha zaxira (CF_BY_CLASS).
 */
export const CF_SAME_MODEL: Record<string, string> = {
  "deepseek/deepseek-v4-pro-0813": CF.deepseekPro,
  "deepseek/deepseek-v4-pro": CF.deepseekPro,
  "deepseek/deepseek-v4-flash-0731": CF.deepseekFlash,
  "deepseek/deepseek-v4-flash": CF.deepseekFlash,
  "qwen/qwen3.8-27b": CF.qwen,
  "z-ai/glm-5.3": CF.glm,
  "z-ai/glm-5.2": CF.glm52,
  "moonshotai/kimi-k2.6": CF.kimi,
  "moonshotai/kimi-k2.7-code": CF.kimiCode,
  "openai/gpt-oss-120b": CF.gptOss,
  "meta-llama/llama-3.3-70b-instruct": CF.llama,
};

/**
 * OpenRouter krediti/kvotasi tugaganda sinf bo'yicha Cloudflare zaxirasi (afzallik tartibida).
 * Bu BOSHQA model — served "substituted: true" bilan ochiq ko'rsatiladi.
 */
export const CF_BY_CLASS: Record<"flagship" | "fast" | "code" | "free", string[]> = {
  flagship: [CF.deepseekPro, CF.kimi, CF.glm],
  code: [CF.kimiCode, CF.deepseekPro],
  fast: [CF.deepseekFlash, CF.qwen],
  free: [CF.qwen, CF.gptOss],
};

/** Host prefiksi va ":free" qo'shimchasiz kalit ("openrouter/deepseek/x:free" → "deepseek/x"). */
function bareId(id: string): string {
  return id
    .trim()
    .toLowerCase()
    .replace(/^(openrouter|omniroute|groq)\//, "")
    .replace(/:free$/, "");
}

/** Cloudflare'dagi aynan shu model (bo'lsa). "cloudflare/@cf/..." id'ning o'zi ham qaytadi. */
export function cfSameModel(id: string): string | null {
  if (!id) return null;
  if (id.startsWith(CF_PREFIX)) return id.slice(CF_PREFIX.length);
  if (id.startsWith("@cf/")) return id;
  return CF_SAME_MODEL[bareId(id)] ?? null;
}

/**
 * Neuron narxi (1M token uchun), pricing sahifasidan. Eval harness (scripts/eval/run.mjs)
 * da nusxasi bor — o'zgarsa ikkalasini yangilang.
 */
export const CF_NEURONS_PER_M: Record<string, { in: number; out: number }> = {
  [CF.deepseekFlash]: { in: 40_000, out: 120_000 },
  [CF.deepseekPro]: { in: 120_000, out: 360_000 },
  [CF.kimi]: { in: 86_364, out: 363_636 },
  [CF.kimiCode]: { in: 86_364, out: 363_636 },
  [CF.qwen]: { in: 40_909, out: 290_909 },
  [CF.glm]: { in: 127_273, out: 400_000 },
  [CF.glm52]: { in: 127_273, out: 400_000 },
  [CF.gptOss]: { in: 31_818, out: 68_182 },
  [CF.llama]: { in: 26_668, out: 204_805 },
};

/** Taxminiy neuron sarfi (usage bo'yicha). Noma'lum model — null. */
export function cfNeurons(model: string, promptTokens: number, completionTokens: number): number | null {
  const rate = CF_NEURONS_PER_M[model.startsWith(CF_PREFIX) ? model.slice(CF_PREFIX.length) : model];
  if (!rate) return null;
  return (promptTokens * rate.in + completionTokens * rate.out) / 1_000_000;
}

/**
 * Oqim (stream) yuborish mumkinmi. gpt-oss Cloudflare'da Responses formatida faqat
 * `stream: false` — chat-completions'da ham ehtiyot uchun oqimsiz so'raymiz va butun
 * matnni bitta bo'lak qilib chiqaramiz.
 */
export function cfStreams(model: string): boolean {
  return !/gpt-oss/i.test(model);
}

/** Kunlik neuron limiti / kvota / tezlik cheklovi — "yumshoq" xato (keyingi provayderga o'tiladi). */
export function cfQuotaExceeded(status: number, message: string): boolean {
  return status === 429 || /\b4006\b|neurons?|daily free allocation|quota/i.test(message);
}

/** Cloudflare xato tanasi: {"errors":[{"code":4006,"message":"..."}],"success":false}. */
export function cfErrorMessage(body: unknown): string | null {
  const errors = (body as { errors?: { message?: unknown; code?: unknown }[] } | null)?.errors;
  if (!Array.isArray(errors) || !errors.length) return null;
  const e = errors[0];
  const msg = typeof e?.message === "string" ? e.message : "";
  const code = typeof e?.code === "number" || typeof e?.code === "string" ? String(e.code) : "";
  return [code, msg].filter(Boolean).join(": ") || null;
}

type Delta = { content?: string; reasoning_content?: string };
export type CompletionChunk = {
  model?: string;
  choices: { delta: Delta; finish_reason: string | null }[];
  usage?: unknown;
};

/**
 * Oqimsiz (JSON) chat-completion javobini SSE bo'lagi shakliga keltiradi — shunda
 * oqim o'qiydigan kod o'zgarmaydi. Cloudflare'ning ikkala formati: OpenAI
 * ({choices:[{message}]}) va eski Workers AI ({result:{response}}).
 */
export function jsonCompletionToChunk(body: unknown): CompletionChunk | null {
  if (!body || typeof body !== "object") return null;
  const root = body as { result?: unknown };
  const j = (root.result && typeof root.result === "object" ? root.result : body) as {
    model?: unknown;
    response?: unknown;
    usage?: unknown;
    choices?: { message?: { content?: unknown; reasoning_content?: unknown; reasoning?: unknown }; finish_reason?: unknown }[];
  };
  const model = typeof j.model === "string" ? j.model : undefined;
  const c = j.choices?.[0];
  if (c?.message) {
    const delta: Delta = {};
    if (typeof c.message.content === "string" && c.message.content) delta.content = c.message.content;
    const reasoning = c.message.reasoning_content ?? c.message.reasoning;
    if (typeof reasoning === "string" && reasoning) delta.reasoning_content = reasoning;
    return { model, choices: [{ delta, finish_reason: typeof c.finish_reason === "string" ? c.finish_reason : "stop" }], usage: j.usage };
  }
  if (typeof j.response === "string") {
    return { model, choices: [{ delta: { content: j.response }, finish_reason: "stop" }], usage: j.usage };
  }
  return null;
}
