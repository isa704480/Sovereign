import type { ChatBody, ClassifiedError, Limits, ModelOffer, ProviderAdapter } from "../types";

/**
 * LLM7 — anonim, kalitsiz tekin shlyuz (OpenAI-mos): POST https://api.llm7.io/v1/chat/completions.
 * Mesh'da faqat OXIRGI CHORA (`rescue: true`): barcha odatdagi nomzodlar tugagach sinaladi,
 * javobi har doim `substituted: true, rescue: true` bilan ko'rsatiladi.
 *
 *  - Kalit ixtiyoriy: LLM7_API_KEY faqat limitni oshiradi. Kalitsiz — Authorization yuborilmaydi
 *    (noto'g'ri kalit ham anonim deb qabul qilinadi — 2026-09-27 sinovda 200).
 *  - Tool-calling YO'Q: docs.llm7.io/guides/function-calling — "API_KEY required for paid features";
 *    CLI (route.ts) ham LLM7'ni faqat vositasiz so'rovda ishlatadi. Shuning uchun caps.tools=false.
 *  - Faqat tekin (usage_based_only=false) chat modellari taklif qilinadi — GET /v1/models, 2026-09-27.
 *    Qolganlari (Claude, GPT, Gemini ...) kalitsiz 401 "missing_api_key" qaytaradi.
 *  - Mintaqa: region.ts HOST_POLICY.llm7 = ALL_RESTRICTED (hujjatsiz anonim shlyuz).
 *  - O'chirish: LLM7_DISABLED=1 (masalan, shlyuz nosoz bo'lsa yoki maxfiylik talabi bilan).
 */

const LLM7_BASE = "https://api.llm7.io/v1";

/** Rescue javobi qisqa: eski streamFreeFallback ham max_tokens ni 2048 bilan cheklagan. */
const RESCUE_MAX_TOKENS = 2048;

const TEXT_ONLY = { tools: false, vision: false } as const;

/** Wire → OmniRoute uslubidagi host-prefiksli id ("llm7/<wire>"), region.ts hostOf() uni "llm7" deb taniydi. */
const hostId = (wire: string) => `llm7/${wire}`;

/**
 * Tekin chat modellari (GET https://api.llm7.io/v1/models, 2026-09-27: usage_based_only=false).
 * sovereignIds — faqat aynan shu model nomlari (katalog / DIRECT_ROUTES / auto-pools id'lari).
 */
const OFFERS: ModelOffer[] = [
  {
    // Eski zanjirdagi LLM7_FREE_MODEL (providers.ts, cli/chat/route.ts). 128k kontekst, json_mode.
    sovereignIds: [hostId("mistral-Nemo-Instruct-2407")],
    wire: "mistral-Nemo-Instruct-2407",
    class: "free",
    cost: "free",
    caps: { stream: true, json: true, ...TEXT_ONLY },
  },
  {
    // Mistral Codestral: DIRECT_ROUTES "mistralai/codestral-latest", auto-pools "mistral/codestral-latest".
    sovereignIds: ["mistralai/codestral-latest", "mistral/codestral-latest", hostId("codestral-latest")],
    wire: "codestral-latest",
    class: "code",
    cost: "free",
    caps: { stream: true, json: true, ...TEXT_ONLY },
  },
  {
    // Katalog: glm-5-3-flash / z-ai/glm-5.3-flash. LLM7'da json_mode yo'q.
    sovereignIds: ["glm-5-3-flash", "z-ai/glm-5.3-flash", hostId("GLM-5.3-Flash")],
    wire: "GLM-5.3-Flash",
    class: "fast",
    cost: "free",
    caps: { stream: true, json: false, ...TEXT_ONLY },
  },
  {
    // LLM7'da stream=false — bitta JSON javob (transformBody stream:false qo'yadi).
    sovereignIds: [hostId("minimax-m2.7")],
    wire: "minimax-m2.7",
    class: "fast",
    cost: "free",
    caps: { stream: false, json: true, ...TEXT_ONLY },
  },
];

const LIMITS_SOURCE = "https://docs.llm7.io/limits.md (2026-09-27)";

/**
 * docs.llm7.io/limits: anonim — 1 req/s, 10 req/min, 60 req/soat, 500 000 token/24 soat;
 * bepul token — 2 req/s, 40 req/min, 100 req/soat, 1 000 000 token/24 soat. Limit IP/kalit
 * bo'yicha (butun hisob) — perModel: false. Soatlik limit uchun Limits'da maydon yo'q.
 */
export function llm7Limits(hasKey: boolean): Limits {
  return hasKey
    ? { rpm: 40, tpd: 1_000_000, dailyUnits: 1_000_000, unit: "tokens", perModel: false, source: LIMITS_SOURCE }
    : { rpm: 10, tpd: 500_000, dailyUnits: 500_000, unit: "tokens", perModel: false, source: LIMITS_SOURCE };
}

/* ------------------------------------------------------------------ */
/* Xato tasnifi                                                        */
/* ------------------------------------------------------------------ */

interface Llm7ErrorBody {
  message?: string;
  type?: string;
  code?: string | number;
  retry_after?: number | string;
}

/** LLM7 xato tanasi: {"error":{"message","type","code","retry_after"}} (2026-09-27 sinovda). */
function parseErrorBody(body: string): Llm7ErrorBody {
  try {
    const j = JSON.parse(body) as { error?: unknown; message?: unknown; detail?: unknown };
    const e = j?.error;
    if (e && typeof e === "object") return e as Llm7ErrorBody;
    if (typeof e === "string") return { message: e };
    if (typeof j?.message === "string") return { message: j.message };
    if (typeof j?.detail === "string") return { message: j.detail };
  } catch {
    /* JSON emas (Cloudflare HTML sahifasi va h.k.) */
  }
  return {};
}

/** "1", "1.5", "30s", "1m30s", "2h" → ms. Tushunarsiz — undefined. */
function durationMs(raw: string | number | null | undefined): number | undefined {
  if (raw == null || raw === "") return undefined;
  if (typeof raw === "number") return Number.isFinite(raw) && raw >= 0 ? Math.round(raw * 1000) : undefined;
  const s = raw.trim();
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(parseFloat(s) * 1000);
  const m = /^(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m(?!s))?(?:(\d+(?:\.\d+)?)s)?(?:(\d+(?:\.\d+)?)ms)?$/.exec(s);
  if (!m || !m.slice(1).some(Boolean)) return undefined;
  const [h, min, sec, ms] = m.slice(1).map((x) => (x ? parseFloat(x) : 0));
  return Math.round(h * 3_600_000 + min * 60_000 + sec * 1000 + ms);
}

/**
 * Qayta urinish vaqti (ms): Retry-After (soniya yoki HTTP-sana), tanadagi retry_after,
 * x-ratelimit-reset-requests / x-ratelimit-reset-tokens / x-ratelimit-reset (davomiylik yoki epoch soniya).
 */
function retryAfterFrom(headers: Headers, err: Llm7ErrorBody, now: number): number | undefined {
  const ra = headers.get("retry-after");
  if (ra) {
    const d = durationMs(ra);
    if (d !== undefined) return d;
    const at = Date.parse(ra);
    if (Number.isFinite(at)) return Math.max(0, at - now);
  }
  const fromBody = durationMs(err.retry_after);
  if (fromBody !== undefined) return fromBody;
  let best: number | undefined;
  for (const name of ["x-ratelimit-reset-requests", "x-ratelimit-reset-tokens", "x-ratelimit-reset"]) {
    const v = headers.get(name);
    if (!v) continue;
    let d = durationMs(v);
    // Epoch soniya (masalan 1790500000) — davomiylik emas.
    if (d !== undefined && /^\d{9,}$/.test(v.trim())) d = Math.max(0, parseInt(v, 10) * 1000 - now);
    if (d !== undefined && (best === undefined || d > best)) best = d;
  }
  return best;
}

const DAILY_RE = /daily|per day|24[ -]?h|token (limit|quota|allowance)|allowance|quota/i;
const CREDIT_RE = /insufficient|balance|credits?\b|payment required|billing|top[ -]?up|can only afford/i;
const CONTEXT_RE = /context[ _](length|window)|maximum context|too many tokens|prompt is too long|context_length_exceeded/i;
const MODEL_GONE_RE = /model_unavailable|model_not_found|currently unavailable|model not found|does not exist|decommissioned|unknown model/i;
const AUTH_RE = /invalid[ _]api[ _]key|invalid token|unauthori[sz]ed|authentication/i;
/** Kalitsiz pullik model — kalit xatosi emas, shu model biz uchun mavjud emas. */
const PAID_ONLY_RE = /missing[ _]api[ _]key|requires? (an? )?(api key|token|paid)|pro tier|upgrade/i;

/** Daqiqadan uzoq kutish (masalan 24 soatlik token limiti) — kunlik kvota deb olinadi. */
const QUOTA_RETRY_THRESHOLD_MS = 60 * 60_000;

/**
 * LLM7 xato tasnifi (docs/MESH.md §2.1). `now` — test uchun (deterministik).
 * Haqiqiy shakllar (2026-09-27): 429 {"error":{"code":"rate_limit_exceeded","retry_after":1}} + Retry-After: 1;
 * 400 {"error":{"code":"model_unavailable"}}; 401 {"error":{"code":"missing_api_key"}} (pullik model kalitsiz).
 */
export function classifyLlm7Error(status: number, body: string, headers: Headers, now = Date.now()): ClassifiedError {
  const err = parseErrorBody(body);
  const code = String(err.code ?? "");
  const text = `${code} ${err.type ?? ""} ${err.message ?? ""} ${err.message ? "" : body.slice(0, 500)}`;
  const message = (err.message ?? body).slice(0, 300) || `HTTP ${status}`;

  // Tarmoq / taymaut / server xatosi.
  if (status === 0 || status === 500 || status === 502 || status === 503 || status === 504 || status === 529 || status >= 520) {
    return { kind: "transient", message };
  }

  if (status === 402 || CREDIT_RE.test(text)) {
    return { kind: "no_credit", message };
  }

  if (status === 429 || /rate_limit/i.test(code)) {
    const retryAfterMs = retryAfterFrom(headers, err, now);
    const daily = DAILY_RE.test(`${code} ${err.message ?? ""}`) || (retryAfterMs ?? 0) >= QUOTA_RETRY_THRESHOLD_MS;
    if (daily) {
      // Upstream reset vaqtini aytgan bo'lsa — aniq; aytmasa resetAt yo'q (health 1 soatdan keyin probe).
      // LLM7 tokenlari 24 soatlik "rolling" oynada — yarim tungacha qulflash noto'g'ri bo'lardi.
      return { kind: "quota_exhausted", ...(retryAfterMs !== undefined ? { retryAfterMs, resetAt: now + retryAfterMs } : {}), message };
    }
    return { kind: "rate_limited", ...(retryAfterMs !== undefined ? { retryAfterMs } : {}), message };
  }

  if (status === 413 || CONTEXT_RE.test(text)) {
    return { kind: "context_length", message };
  }

  if (status === 404 || MODEL_GONE_RE.test(text)) {
    return { kind: "unavailable", scope: "model", message };
  }

  if (status === 401 || status === 403) {
    // Anonim foydalanishda pullik model → faqat shu model yopiladi (tekin modellar ishlayveradi).
    if (PAID_ONLY_RE.test(text)) return { kind: "unavailable", scope: "model", message };
    return { kind: "auth", message };
  }
  if (AUTH_RE.test(code)) return { kind: "auth", message };

  if (status === 400 || status === 422) {
    return { kind: "bad_request", message };
  }

  // Oqim ichidagi xato (status 200 + {"error":...}) yoki kutilmagan 4xx — boshqa nomzod sinalsin.
  if (status >= 400 && status < 500) return { kind: "bad_request", message };
  return { kind: "transient", message };
}

/* ------------------------------------------------------------------ */
/* Tana                                                                */
/* ------------------------------------------------------------------ */

/** Multimodal content → faqat matn (LLM7 tekin modellari vision'ni qo'llamaydi). */
function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return content == null ? "" : String(content);
  return content
    .map((p) => (p && typeof p === "object" && "text" in p ? String((p as { text?: unknown }).text ?? "") : ""))
    .filter(Boolean)
    .join(" ");
}

export function llm7TransformBody(body: ChatBody, offer: ModelOffer): ChatBody {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { tools, tool_choice, parallel_tool_calls, ...rest } = body;
  const messages = body.messages.map((m) => {
    if (!m || typeof m !== "object") return m;
    const msg = m as { role?: unknown; content?: unknown };
    return { role: msg.role, content: textOf(msg.content) };
  });
  return {
    ...rest,
    model: offer.wire,
    messages,
    max_tokens: Math.min(body.max_tokens ?? RESCUE_MAX_TOKENS, RESCUE_MAX_TOKENS),
    ...(offer.caps.stream ? {} : { stream: false }),
  };
}

function hasKey(): boolean {
  return !!process.env.LLM7_API_KEY?.trim();
}

export const llm7Adapter: ProviderAdapter = {
  id: "llm7",
  host: "llm7",
  rescue: true,
  /** Anonim — har doim yoqiq; faqat LLM7_DISABLED=1|true bilan o'chiriladi. */
  enabled: () => !/^(1|true|yes|on)$/i.test(process.env.LLM7_DISABLED?.trim() ?? ""),
  endpoint: () => {
    const key = process.env.LLM7_API_KEY?.trim();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (key) headers.Authorization = `Bearer ${key}`;
    return { url: `${LLM7_BASE}/chat/completions`, headers };
  },
  offers: OFFERS,
  get limits(): Limits {
    return llm7Limits(hasKey());
  },
  classifyError: (status, body, headers) => classifyLlm7Error(status, body, headers),
  transformBody: llm7TransformBody,
  /** LLM7 javobidagi `model` (SSE bo'lagi yoki JSON) — masalan "mistral-Nemo-Instruct-2407". */
  readServedModel: (chunkOrJson) => {
    const m = (chunkOrJson as { model?: unknown } | null)?.model;
    return typeof m === "string" && m.trim() ? m.trim().slice(0, 120) : null;
  },
};
