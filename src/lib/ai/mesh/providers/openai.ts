import type { ChatBody, ClassifiedError, Limits, ModelOffer, ProviderAdapter } from "../types";

/**
 * OpenAI direct (api.openai.com) — pullik, tekin kvota yo'q. Hozirgi kodda ishlatiladi:
 * providers.ts DIRECT_ROUTES (gpt-4o, gpt-4o-mini, gpt-4-turbo) va CLI route (gpt-4o /
 * gpt-4o-mini). Katalogdagi GPT-5.6 / GPT-6 modellari ham OpenAI'ning o'z API'sida bor
 * (hozir RSI/OpenRouter orqali ketadi) — shu yerda to'g'ridan-to'g'ri offer sifatida.
 *
 * Model ro'yxati va holati: https://developers.openai.com/api/docs/models,
 * https://developers.openai.com/api/docs/deprecations (2026-09-27 tekshirildi):
 *  - gpt-4-turbo — 2026-10-23 da o'chiriladi (shundan keyin offer avtomatik yo'qoladi);
 *  - o1-mini — 2025-10-27 da o'chirilgan → offer YO'Q (katalogdagi "o1-mini" boshqa yo'ldan);
 *  - gpt-5.6-luna-pro — hujjatda topilmadi → offer YO'Q (taxmin qilinmaydi).
 */

export const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";

const FULL = { stream: true, tools: true, vision: true, json: true } as const;

interface OpenAIOfferSpec extends ModelOffer {
  /** Shu vaqtdan (epoch ms) keyin OpenAI modelni o'chiradi — offer ro'yxatdan chiqadi. */
  retiresAt?: number;
}

/**
 * Sinf — region.ts regionClassOf bilan bir xil: gpt-4o/5.6-sol/terra/6 → flagship,
 * mini/luna → fast. Narx: mini/luna — cheap (starter), qolgani paid (pro); GPT-6 — ultra
 * (katalog tarifi). sovereignIds — faqat AYNAN shu og'irliklar (katalog id + providerModel).
 */
const SPECS: OpenAIOfferSpec[] = [
  {
    sovereignIds: ["gpt-4o", "gpt-4o-full", "openai/gpt-4o"],
    wire: "gpt-4o",
    class: "flagship",
    cost: "paid",
    caps: FULL,
  },
  {
    sovereignIds: ["gpt-4o-mini", "openai/gpt-4o-mini"],
    wire: "gpt-4o-mini",
    class: "fast",
    cost: "cheap",
    caps: FULL,
  },
  {
    // Katalogda yo'q, faqat DIRECT_ROUTES'da. Deprecated: 2026-10-23 (almashtiruvchi: gpt-5.6-sol).
    sovereignIds: ["openai/gpt-4-turbo"],
    wire: "gpt-4-turbo",
    class: "flagship",
    cost: "paid",
    caps: FULL,
    retiresAt: Date.UTC(2026, 9, 23),
  },
  {
    sovereignIds: ["gpt-5-6-sol", "openai/gpt-5.6-sol"],
    wire: "gpt-5.6-sol",
    class: "flagship",
    cost: "paid",
    caps: FULL,
  },
  {
    sovereignIds: ["gpt-5-6-terra", "openai/gpt-5.6-terra"],
    wire: "gpt-5.6-terra",
    class: "flagship",
    cost: "paid",
    caps: FULL,
  },
  {
    sovereignIds: ["gpt-5-6-luna", "openai/gpt-5.6-luna"],
    wire: "gpt-5.6-luna",
    class: "fast",
    cost: "cheap",
    caps: FULL,
  },
  {
    sovereignIds: ["gpt-6-astra", "openai/gpt-6-astra"],
    wire: "gpt-6-astra",
    class: "flagship",
    cost: "paid",
    caps: FULL,
    minTier: "ultra",
  },
];

/** `now` paytida faol offerlar (o'chirilgan modellar chiqarib tashlanadi). PURE — testda sana beriladi. */
export function openaiOffersAt(now: number): ModelOffer[] {
  return SPECS.filter((s) => s.retiresAt === undefined || now < s.retiresAt).map((s) => {
    const offer: OpenAIOfferSpec = { ...s };
    delete offer.retiresAt;
    return offer;
  });
}

/**
 * Reasoning oilasi (GPT-5.x, GPT-6, o-seriya): Chat Completions'da `max_tokens` o'rniga
 * `max_completion_tokens`, `temperature` esa faqat standart qiymat — boshqasi 400 beradi.
 */
function isReasoningWire(wire: string): boolean {
  return /^(gpt-[5-9]|o\d)/i.test(wire);
}

export function openaiTransformBody(body: ChatBody, offer: ModelOffer): ChatBody {
  const out: ChatBody = { ...body, model: offer.wire };
  if (out.max_tokens !== undefined) {
    // max_completion_tokens barcha joriy modellarda (gpt-4o ham) qabul qilinadi.
    if (out.max_completion_tokens === undefined) out.max_completion_tokens = out.max_tokens;
    delete out.max_tokens;
  }
  if (isReasoningWire(offer.wire)) delete out.temperature;
  return out;
}

/* ------------------------------------------------------------------ */
/* Xatolarni tasniflash                                                */
/* ------------------------------------------------------------------ */

/** OpenAI davomiylik formati: "1s", "6m0s", "20ms", "1h2m3.5s", "0.5s" → ms. Tanilmasa — undefined. */
export function parseOpenAIDuration(v: string | null | undefined): number | undefined {
  if (!v) return undefined;
  const s = v.trim();
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(Number(s) * 1000); // yalang soniya
  const re = /(\d+(?:\.\d+)?)(ms|h|m|s)/g;
  let total = 0;
  let matched = false;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    matched = true;
    const n = Number(m[1]);
    total += m[2] === "ms" ? n : m[2] === "s" ? n * 1000 : m[2] === "m" ? n * 60_000 : n * 3_600_000;
  }
  return matched ? Math.round(total) : undefined;
}

type OpenAIErrorBody = { error?: { message?: unknown; type?: unknown; code?: unknown } | string | null; message?: unknown };

function parseError(body: string): { message: string; type: string; code: string } {
  let message = "";
  let type = "";
  let code = "";
  try {
    const j = JSON.parse(body) as OpenAIErrorBody;
    const e = j?.error;
    if (typeof e === "string") message = e;
    else if (e && typeof e === "object") {
      message = typeof e.message === "string" ? e.message : "";
      type = typeof e.type === "string" ? e.type : "";
      code = typeof e.code === "string" ? e.code : "";
    }
    if (!message && typeof j?.message === "string") message = j.message;
  } catch {
    message = body;
  }
  return { message: message || body, type, code };
}

/** 429 uchun kutish: Retry-After → x-ratelimit-reset-{requests|tokens} → "try again in Xs". */
function retryAfterOf(headers: Headers, message: string): number | undefined {
  const ra = headers.get("retry-after-ms");
  if (ra && /^\d+(\.\d+)?$/.test(ra.trim())) return Math.round(Number(ra));
  const retryAfter = headers.get("retry-after");
  if (retryAfter) {
    const s = retryAfter.trim();
    if (/^\d+(\.\d+)?$/.test(s)) return Math.round(Number(s) * 1000);
    const at = Date.parse(s);
    if (!Number.isNaN(at)) return Math.max(0, at - Date.now());
  }
  const reqReset = parseOpenAIDuration(headers.get("x-ratelimit-reset-requests"));
  const tokReset = parseOpenAIDuration(headers.get("x-ratelimit-reset-tokens"));
  const reqLeft = headers.get("x-ratelimit-remaining-requests");
  const tokLeft = headers.get("x-ratelimit-remaining-tokens");
  // Qaysi bucket tugagan bo'lsa — o'shaning reset'i; aniq bo'lmasa kattarog'i.
  if (reqLeft?.trim() === "0" && reqReset !== undefined) return reqReset;
  if (tokLeft?.trim() === "0" && tokReset !== undefined) return tokReset;
  const fromHeaders = Math.max(reqReset ?? -1, tokReset ?? -1);
  if (fromHeaders >= 0) return fromHeaders;
  const m = /try again in\s+([\d.hms]+)/i.exec(message);
  return m ? parseOpenAIDuration(m[1]) : undefined;
}

/**
 * OpenAI xato shakli: { error: { message, type, code, param } }.
 *  - 429 insufficient_quota ("exceeded your current quota ... billing") → no_credit (provider);
 *  - 429 rate_limit_exceeded / slow_down (RPM/TPM) → rate_limited (scope model — limitlar har model uchun);
 *  - 429 "... per day (RPD/TPD)" → quota_exhausted, resetAt = now + reset;
 *  - 401 invalid_api_key, 403 unsupported_country_region_territory → auth;
 *  - 404 model_not_found / 403 "does not have access to model" → unavailable (model);
 *  - 400 context_length_exceeded / 413 → context_length; 400/422 boshqa → bad_request;
 *  - 0, 408, 409, 5xx (503 server_is_overloaded) → transient.
 * `now` — test uchun inject qilinadi.
 */
export function classifyOpenAIError(status: number, body: string, headers: Headers, now: number): ClassifiedError {
  const { message: raw, type, code } = parseError(body ?? "");
  const message = raw.slice(0, 500);
  const text = `${type} ${code} ${raw}`.toLowerCase();

  if (code === "insufficient_quota" || type === "insufficient_quota" || /exceeded your current quota|billing|insufficient.?(funds|balance|credit)/.test(text) || status === 402) {
    return { kind: "no_credit", scope: "provider", message };
  }
  if (code === "context_length_exceeded" || status === 413 || /maximum context length|context length|context_length|too many tokens|string_above_max_length/.test(text)) {
    return { kind: "context_length", message };
  }
  if (status === 429 || code === "rate_limit_exceeded" || code === "slow_down" || type === "rate_limit_error") {
    const wait = retryAfterOf(headers, raw);
    if (/per day|\(rpd\)|\(tpd\)|requests per day|tokens per day/.test(text)) {
      return { kind: "quota_exhausted", scope: "model", resetAt: wait !== undefined ? now + wait : undefined, retryAfterMs: wait, message };
    }
    return { kind: "rate_limited", scope: "model", retryAfterMs: wait, message };
  }
  if (status === 401 || code === "invalid_api_key" || /incorrect api key|invalid api key|invalid_api_key/.test(text)) {
    return { kind: "auth", scope: "provider", message };
  }
  if (status === 404 || code === "model_not_found" || /does not exist|model not found|do(es)? not have access to (the )?model|deprecated|decommissioned/.test(text)) {
    return { kind: "unavailable", scope: "model", message };
  }
  if (status === 403) return { kind: "auth", scope: "provider", message };
  if (status === 0 || status === 408 || status === 409 || status >= 500) return { kind: "transient", message };
  if (status === 400 || status === 422 || type === "invalid_request_error") return { kind: "bad_request", message };
  // 200 ichidagi oqim xatosi (server_error va h.k.) yoki noma'lum holat — vaqtinchalik deb olinadi.
  return { kind: "transient", message };
}

/* ------------------------------------------------------------------ */
/* Adapter                                                             */
/* ------------------------------------------------------------------ */

/**
 * Limitlar hisob "usage tier"iga bog'liq (Free/Tier 1..5 — RPM/TPM har model uchun, faqat
 * platform.openai.com/settings/organization/limits'da ko'rinadi) — shuning uchun rpm/tpm
 * taxmin qilinmaydi; har javobdagi x-ratelimit-* sarlavhalari 429 tasnifida ishlatiladi.
 * Tekin kunlik kvota yo'q — unit "credits" (usedToday hisoblanmaydi).
 */
const LIMITS: Limits = {
  perModel: true,
  unit: "credits",
  source: "https://developers.openai.com/api/docs/guides/rate-limits (2026-09-27) — tier-dependent, per-model RPM/TPM",
};

export const openaiAdapter: ProviderAdapter = {
  id: "openai",
  host: "openai",
  enabled: () => !!process.env.OPENAI_API_KEY?.trim(),
  endpoint: () => ({
    url: OPENAI_CHAT_URL,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${(process.env.OPENAI_API_KEY ?? "").trim()}`,
    },
  }),
  get offers() {
    return openaiOffersAt(Date.now());
  },
  limits: LIMITS,
  classifyError: (status, body, headers) => classifyOpenAIError(status, body, headers, Date.now()),
  transformBody: openaiTransformBody,
  /** OpenAI `model` maydoni sanali bo'ladi ("gpt-4o-2024-08-06") — served.ts sameModel sanani e'tiborsiz qoldiradi. */
  readServedModel(chunkOrJson) {
    const m = (chunkOrJson as { model?: unknown } | null)?.model;
    if (typeof m !== "string" || !m.trim()) return null;
    return m.includes("/") ? m : `openai/${m}`;
  },
  displayId: (wire) => `openai/${wire}`,
};
