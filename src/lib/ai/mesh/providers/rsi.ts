import type { ModelOffer, PlanTier, ProviderAdapter } from "../types";
import { chatCompletionsUrl, classifyOpenAiCompat, reportedModel } from "./gateway";

/**
 * RSI AI (rsiai.net) adapteri — arzon Claude/GPT reselleri, OpenAI-mos
 * (RSI_BASE_URL + RSI_API_KEY). providers.ts `rsiRoute()` / `RSI_MODELS` ning aynan nusxasi:
 * faqat quyidagi qimmat katalog modellari shu orqali boradi. Oqim (stream) — ha.
 *
 * Tool-calling va rasm (vision) RSI orqali tasdiqlanmagan (CLI route RSI'ni ishlatmaydi, eval
 * faqat matnli oqimni o'lchagan) — shuning uchun caps false: vositali/rasmli so'rov RSI'ga
 * tushmaydi (hozirgi xatti-harakat bilan bir xil).
 */

/** [katalog id, providerModel, RSI wire id, katalog tarifi]. */
const RSI_TABLE: [catalogId: string, providerModel: string, wire: string, tier: PlanTier][] = [
  ["claude-opus-5", "anthropic/claude-opus-5", "claude-opus-5", "ultra"],
  ["claude-opus-4-8", "anthropic/claude-opus-4.8", "claude-opus-4-8", "ultra"],
  // Eslatma: providers.ts RSI_MODELS Fable 5.1 ni "claude-fable-5" ga yo'naltiradi — shu saqlandi.
  ["claude-fable-5-1", "anthropic/claude-fable-5.1", "claude-fable-5", "ultra"],
  ["gpt-6-astra", "openai/gpt-6-astra", "gpt-6-astra", "ultra"],
  ["gpt-5-6-sol", "openai/gpt-5.6-sol", "gpt-5.6-sol", "pro"],
  ["gpt-5-6-terra", "openai/gpt-5.6-terra", "gpt-5.6-terra", "pro"],
];

/** wire → katalog providerModel (badge, served va modelAllowedIn shu id bilan). */
const DISPLAY_BY_WIRE: Record<string, string> = Object.fromEntries(RSI_TABLE.map(([, pm, wire]) => [wire, pm]));

const RSI_OFFERS: ModelOffer[] = RSI_TABLE.map(([catalogId, providerModel, wire, tier]) => ({
  sovereignIds: [catalogId, providerModel],
  wire,
  class: "flagship",
  cost: "paid",
  // O'rinbosar sifatida ham katalog tarifidan past rejaga berilmaydi (Opus — faqat ultra).
  minTier: tier,
  caps: { stream: true, tools: false, vision: false, json: false },
}));

export const rsiAdapter: ProviderAdapter = {
  id: "rsi",
  host: "rsi",
  enabled: () => !!(process.env.RSI_BASE_URL && process.env.RSI_API_KEY),
  endpoint: () => ({
    url: chatCompletionsUrl(process.env.RSI_BASE_URL ?? ""),
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.RSI_API_KEY ?? ""}` },
  }),
  offers: RSI_OFFERS,
  limits: {
    // rsiai.net ochiq hujjatida limit yo'q (sahifa faqat sarlavha, 2026-09-27). Eval skripti RSI'ga
    // bir vaqtda 3 ta so'rov yuboradi (scripts/eval/run.mjs CONCURRENCY.rsi) — rasmiy limit emas.
    source: "codebase: providers.ts RSI_MODELS + scripts/eval/run.mjs (rsiai.net limit hujjatlamagan, 2026-09-27)",
  },
  classifyError: (status, body, headers) => classifyOpenAiCompat(status, body, headers),
  readServedModel: reportedModel,
  displayId: (wire) => DISPLAY_BY_WIRE[wire] ?? wire,
  aggregator: true,
};
