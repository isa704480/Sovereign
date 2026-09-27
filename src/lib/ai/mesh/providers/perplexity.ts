import type { ChatBody, ClassifiedError, Limits, ModelOffer, ProviderAdapter } from "../types";

/**
 * Perplexity — faqat research modellari (katalog category "research"). OpenAI chat-completions
 * EMAS: providers.ts streamPerplexity bilan bir xil — Agent API `POST /v1/responses`
 * (OpenAI Responses formati), model o'rniga `preset`. Sonar Chat Completions eskirgan
 * ("supported until September 27, 2026" — docs.perplexity.ai), shuning uchun faqat presetlar.
 *
 * protocol "perplexity-responses": execute `transformBody` natijasini O'ZGARTIRMAY yuboradi
 * (unda `model`/`messages` yo'q — preset + input + instructions) va SSE'ni Responses hodisalari
 * bo'yicha o'qiydi (response.output_text.delta, search_results, response.completed/failed).
 * Research so'rovlari `sameModelOnly: true` bilan keladi (docs/MESH.md §8).
 */

export const PERPLEXITY_RESPONSES_URL = "https://api.perplexity.ai/v1/responses";

/** Katalog providerModel → Agent API preset (providers.ts PERPLEXITY_PRESET bilan bir xil). */
export const PERPLEXITY_PRESET: Record<string, string> = {
  sonar: "fast",
  "sonar-pro": "medium",
};

/** Matnli transformBody: rasm/vosita uzatilmaydi (providers.ts textOf kabi). */
const RESEARCH_CAPS = { stream: true, tools: false, vision: false, json: false } as const;

/**
 * Research presetlari oddiy chat uchun o'rinbosar bo'lmaydi (`substitutable: false`); past `quality`
 * va katalog tarifi `minTier` — qo'shimcha himoya.
 */
const RESEARCH_QUALITY = 0.1;

const OFFERS: ModelOffer[] = [
  {
    sovereignIds: ["sonar-online", "sonar", "perplexity/sonar"],
    wire: PERPLEXITY_PRESET.sonar,
    class: "fast",
    cost: "paid",
    caps: RESEARCH_CAPS,
    minTier: "pro",
    quality: RESEARCH_QUALITY,
    substitutable: false,
  },
  {
    sovereignIds: ["sonar-pro-online", "sonar-pro", "perplexity/sonar-pro"],
    wire: PERPLEXITY_PRESET["sonar-pro"],
    class: "flagship",
    cost: "paid",
    caps: RESEARCH_CAPS,
    minTier: "ultra",
    quality: RESEARCH_QUALITY,
    substitutable: false,
  },
];

/** Xabar mazmuni (string yoki multimodal massiv) → matn. */
function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((p) => (p && typeof p === "object" && "text" in p ? String((p as { text?: unknown }).text ?? "") : ""))
    .join(" ");
}

/**
 * OpenAI chat tanasi → Agent API /v1/responses tanasi. Natija ChatBody tipiga majburan
 * keltiriladi (shartnomada Responses tanasi tipi yo'q) — unda `model`/`messages` YO'Q.
 */
export function perplexityTransformBody(body: ChatBody, offer: ModelOffer): ChatBody {
  const messages = (Array.isArray(body.messages) ? body.messages : []) as { role?: unknown; content?: unknown }[];
  const system = messages
    .filter((m) => m?.role === "system")
    .map((m) => textOf(m.content))
    .filter(Boolean)
    .join("\n\n");
  const input = messages
    .filter((m) => m && m.role !== "system" && (m.role === "user" || m.role === "assistant"))
    .map((m) => ({ role: m.role as string, content: textOf(m.content) }));
  const out: Record<string, unknown> = {
    preset: offer.wire,
    input,
    instructions: system,
    max_output_tokens: typeof body.max_tokens === "number" ? body.max_tokens : 1500,
    stream: body.stream ?? true,
  };
  return out as unknown as ChatBody;
}

/* ------------------------------------------------------------------ */
/* Xatolarni tasniflash                                                */
/* ------------------------------------------------------------------ */

type PplxErrorBody = {
  error?: { message?: unknown; type?: unknown; code?: unknown } | string | null;
  detail?: unknown;
  message?: unknown;
  type?: unknown;
  response?: { error?: { message?: unknown; code?: unknown } | null };
};

function parseError(body: string): { message: string; type: string; code: string } {
  let message = "";
  let type = "";
  let code = "";
  try {
    const j = JSON.parse(body) as PplxErrorBody;
    const e = j?.error ?? j?.response?.error;
    if (typeof e === "string") message = e;
    else if (e && typeof e === "object") {
      const eo = e as { message?: unknown; type?: unknown; code?: unknown };
      message = typeof eo.message === "string" ? eo.message : "";
      type = typeof eo.type === "string" ? eo.type : "";
      code = typeof eo.code === "string" || typeof eo.code === "number" ? String(eo.code) : "";
    }
    if (!message && typeof j?.detail === "string") message = j.detail;
    if (!message && typeof j?.message === "string") message = j.message;
  } catch {
    message = body;
  }
  return { message: message || body, type, code };
}

function retryAfterMs(headers: Headers): number | undefined {
  const v = headers.get("retry-after")?.trim();
  if (!v) return undefined;
  if (/^\d+(\.\d+)?$/.test(v)) return Math.round(Number(v) * 1000);
  const at = Date.parse(v);
  return Number.isNaN(at) ? undefined : Math.max(0, at - Date.now());
}

/** Agent API limiti — 1 soniyalik sirg'aluvchi oyna (QPS): Retry-After bo'lmasa qisqa kutish. */
const QPS_RETRY_MS = 2_000;

/**
 * Xato shakli: { error: { message, type?, code? } } (Agent API ErrorInfo); oqim ichida —
 * { type: "response.failed", response: { error: { message } } }.
 *  - 402 / "credit" / "quota" / "balance" / "billing" → no_credit (provider);
 *  - 429 → rate_limited (Retry-After, bo'lmasa 2 s — QPS oynasi);
 *  - 401 / 403 → auth;
 *  - 404, noto'g'ri preset/model → unavailable (model);
 *  - 413 / kontekst juda uzun → context_length; 400/422 boshqa → bad_request;
 *  - 0, 408, 5xx, 200 ichidagi response.failed → transient.
 */
export function classifyPerplexityError(status: number, body: string, headers: Headers): ClassifiedError {
  const { message: raw, type, code } = parseError(body ?? "");
  const message = raw.slice(0, 500);
  const text = `${type} ${code} ${raw}`.toLowerCase();

  if (status === 402 || /insufficient.?(credit|quota|funds|balance)|out of credits|credit balance|no credits|quota exceeded|exceeded your (current )?quota|billing|payment required/.test(text)) {
    return { kind: "no_credit", scope: "provider", message };
  }
  if (status === 413 || /context length|context window|maximum context|too many tokens|prompt is too long|input is too long/.test(text)) {
    return { kind: "context_length", message };
  }
  if (status === 429 || /rate limit|too many requests/.test(text)) {
    return { kind: "rate_limited", scope: "provider", retryAfterMs: retryAfterMs(headers) ?? QPS_RETRY_MS, message };
  }
  if (status === 401 || status === 403 || /invalid api key|unauthorized|authentication/.test(text)) {
    return { kind: "auth", scope: "provider", message };
  }
  if (status === 404 || /(invalid|unknown|unsupported) (preset|model)|(preset|model) not found|does not exist|deprecated|no longer supported/.test(text)) {
    return { kind: "unavailable", scope: "model", message };
  }
  if (status === 0 || status === 408 || status >= 500) return { kind: "transient", message };
  if (status === 400 || status === 422) return { kind: "bad_request", message };
  return { kind: "transient", message };
}

/* ------------------------------------------------------------------ */
/* Adapter                                                             */
/* ------------------------------------------------------------------ */

/**
 * Agent API (Responses) — tier bo'yicha QPS: Tier 0 = 1, Tier 1 = 3, Tier 2 = 8, Tier 3 = 17,
 * Tier 4-5 = 33 (1 s sirg'aluvchi oyna). Eng past (Tier 0) qiymat: 1 QPS ≈ 60 RPM. Pullik
 * (kredit) — tekin kunlik kvota yo'q. 429 rad etilgan so'rovlar hisoblanmaydi.
 */
const LIMITS: Limits = {
  rpm: 60,
  perModel: false,
  unit: "credits",
  source: "https://docs.perplexity.ai/guides/rate-limits-usage-tiers (2026-09-27) — Agent API Tier 0: 1 QPS",
};

export const perplexityAdapter: ProviderAdapter = {
  id: "perplexity",
  host: "perplexity",
  enabled: () => !!process.env.PERPLEXITY_API_KEY?.trim(),
  endpoint: () => ({
    url: PERPLEXITY_RESPONSES_URL,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${(process.env.PERPLEXITY_API_KEY ?? "").trim()}`,
    },
  }),
  offers: OFFERS,
  limits: LIMITS,
  classifyError: classifyPerplexityError,
  transformBody: perplexityTransformBody,
  /**
   * Preset ichidagi model Perplexity mahsuloti — providers.ts kabi served = "perplexity/<preset>"
   * (displayId). Upstream `model` maydoni ishlatilmaydi: u boshqa vendor nomi bo'lib, research
   * javobini noto'g'ri "almashtirish"/mintaqa ogohlantirishiga aylantirishi mumkin.
   */
  readServedModel: () => null,
  displayId: (wire) => `perplexity/${wire}`,
  protocol: "perplexity-responses",
};
