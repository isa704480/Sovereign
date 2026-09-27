import type { ChatBody, ClassifiedError, ModelOffer, ProviderAdapter } from "../types";

/**
 * Mistral La Plateforme adapteri (api.mistral.ai/v1, OpenAI-mos chat-completions).
 *
 * Modellar (https://docs.mistral.ai/getting-started/models/models_overview/, 2026-09-27):
 *   codestral-latest      → Codestral v25.08      (kod, tools, vision yo'q)
 *   mistral-small-latest  → Mistral Small 4 v26.03 (tools, vision)
 *   mistral-medium-latest → Mistral Medium 3.5 v26.04 (tools, vision)
 *   mistral-large-latest  → Mistral Large 3 v25.12 (tools, vision)
 * pixtral-large-latest (eski DIRECT_ROUTES) — 2026-05-31 da retired (Medium 3.5 bilan
 * almashtirilgan), shuning uchun taklif qilinmaydi.
 *
 * Mintaqa: host "mistral" (region.ts HOST_POLICY — RU/BY va sanksiyadagi mamlakatlar yopiq);
 * displayId "mistral..." bo'lgani uchun modelAllowedIn ham Mistral egasi qoidasini qo'llaydi.
 * Kalit faqat process.env.MISTRAL_API_KEY dan; hech qachon logga/xatoga yozilmaydi.
 */

const BASE = "https://api.mistral.ai/v1";

const CAPS_TEXT_TOOLS = { stream: true, tools: true, vision: false, json: true };
const CAPS_MULTIMODAL = { stream: true, tools: true, vision: true, json: true };

/**
 * Upstream model id → SOVEREIGN ko'rsatish id'si (region tekshiruvi va served hisoboti).
 * "-latest" taxalluslari va hujjatdagi aniq versiya id'lari (vYY.MM → -YYMM) bir xil
 * og'irliklar; noma'lum id o'zgarmasdan "mistral/<id>" bo'ladi (halol — begona nom yozilmaydi).
 */
const DISPLAY_BY_WIRE: Record<string, string> = {
  "codestral-latest": "mistral/codestral-latest",
  "codestral-2508": "mistral/codestral-latest",
  "mistral-small-latest": "mistralai/mistral-small-latest",
  "mistral-small-2603": "mistralai/mistral-small-latest",
  "mistral-medium-latest": "mistralai/mistral-medium-3-5",
  "mistral-medium-2604": "mistralai/mistral-medium-3-5",
  "mistral-large-latest": "mistralai/mistral-large",
  "mistral-large-2512": "mistralai/mistral-large",
};

function mistralDisplayId(wire: string): string {
  const w = wire.trim();
  const known = DISPLAY_BY_WIRE[w.toLowerCase()];
  if (known) return known;
  return /^(mistral|mistralai)\//i.test(w) ? w : `mistral/${w}`;
}

/**
 * Takliflar. sovereignIds — katalog id (config/models.ts), uning providerModel, eski
 * DIRECT_ROUTES kaliti, OmniRoute/auto-pools "mistral/<wire>" id'i va xom wire.
 *
 * minTier: Codestral va Small — "free" (hozirgi CLI zanjiri va Auto FREE.code navbati ularni
 * har tarifga beradi; shu xatti-harakat saqlanadi). Large/Medium — cost "paid" → standart "pro".
 */
const OFFERS: ModelOffer[] = [
  {
    sovereignIds: ["mistralai/codestral-latest", "mistral/codestral-latest", "codestral-latest"],
    wire: "codestral-latest",
    class: "code",
    cost: "cheap",
    caps: CAPS_TEXT_TOOLS,
    minTier: "free",
  },
  {
    sovereignIds: [
      "mistral-small",
      "mistralai/mistral-small-latest",
      "mistralai/mistral-small",
      "mistral/mistral-small-latest",
      "mistral-small-latest",
    ],
    wire: "mistral-small-latest",
    class: "fast",
    cost: "cheap",
    caps: CAPS_MULTIMODAL,
    minTier: "free",
  },
  {
    sovereignIds: [
      "mistral-medium-3-5",
      "mistralai/mistral-medium-3-5",
      "mistralai/mistral-medium-latest",
      "mistral/mistral-medium-latest",
      "mistral-medium-latest",
    ],
    wire: "mistral-medium-latest",
    class: "flagship",
    cost: "paid",
    caps: CAPS_MULTIMODAL,
  },
  {
    sovereignIds: [
      "mistral-large",
      "mistral-large-2",
      "mistralai/mistral-large",
      "mistralai/mistral-large-latest",
      "mistral/mistral-large-latest",
      "mistral-large-latest",
    ],
    wire: "mistral-large-latest",
    class: "flagship",
    cost: "paid",
    caps: CAPS_MULTIMODAL,
  },
];

/* ------------------------------------------------------------------ */
/* Tana moslash                                                        */
/* ------------------------------------------------------------------ */

/** Mistral chat-completions qabul qiladigan maydonlar — boshqasi 422 "Extra inputs are not permitted". */
const ALLOWED_KEYS = new Set([
  "model",
  "messages",
  "stream",
  "temperature",
  "top_p",
  "max_tokens",
  "stop",
  "random_seed",
  "response_format",
  "tools",
  "tool_choice",
  "presence_penalty",
  "frequency_penalty",
  "n",
  "prediction",
  "parallel_tool_calls",
  "safe_prompt",
  "prompt_mode",
]);

const TOOL_ID_RE = /^[A-Za-z0-9]{9}$/;
const ALNUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/**
 * Mistral tool_call id'lari aynan 9 ta [A-Za-z0-9] bo'lishi shart. Boshqa provayder bergan
 * ("call_abc…") id'li tarix bilan kelsa — 400/422. Deterministik (FNV-1a) 9 belgili id'ga
 * aylantiriladi; assistant.tool_calls[].id va tool.tool_call_id bir xil xaritalanadi.
 */
export function mistralToolCallId(id: string): string {
  if (TOOL_ID_RE.test(id)) return id;
  let h = 0x811c9dc5;
  let out = "";
  for (let round = 0; out.length < 9; round++) {
    for (let i = 0; i < id.length; i++) {
      h ^= id.charCodeAt(i) + round;
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    let x = h;
    for (let k = 0; k < 3 && out.length < 9; k++) {
      out += ALNUM[x % ALNUM.length];
      x = Math.floor(x / ALNUM.length);
    }
  }
  return out;
}

function rewriteToolIds(messages: unknown[]): unknown[] {
  return messages.map((m) => {
    if (!m || typeof m !== "object") return m;
    const msg = m as Record<string, unknown>;
    let next: Record<string, unknown> | null = null;
    if (typeof msg.tool_call_id === "string" && !TOOL_ID_RE.test(msg.tool_call_id)) {
      next = { ...msg, tool_call_id: mistralToolCallId(msg.tool_call_id) };
    }
    if (Array.isArray(msg.tool_calls)) {
      const calls = msg.tool_calls.map((c) => {
        if (!c || typeof c !== "object") return c;
        const call = c as Record<string, unknown>;
        return typeof call.id === "string" && !TOOL_ID_RE.test(call.id)
          ? { ...call, id: mistralToolCallId(call.id) }
          : call;
      });
      next = { ...(next ?? msg), tool_calls: calls };
    }
    return next ?? msg;
  });
}

function mistralTransformBody(body: ChatBody, offer: ModelOffer): ChatBody {
  const out: ChatBody = { model: offer.wire, messages: rewriteToolIds(body.messages ?? []) };
  for (const [k, v] of Object.entries(body)) {
    if (k === "model" || k === "messages" || v === undefined) continue;
    if (ALLOWED_KEYS.has(k)) out[k] = v;
  }
  // OpenAI nomlari → Mistral nomlari.
  if (out.max_tokens === undefined && typeof body.max_completion_tokens === "number") {
    out.max_tokens = body.max_completion_tokens;
  }
  if (out.random_seed === undefined && typeof body.seed === "number") out.random_seed = body.seed;
  // Vositasiz so'rovda tool_choice yuborilsa Mistral 400 qaytaradi.
  if (!Array.isArray(out.tools) || out.tools.length === 0) {
    delete out.tools;
    delete out.tool_choice;
    delete out.parallel_tool_calls;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Xato tasnifi                                                        */
/* ------------------------------------------------------------------ */

/**
 * Mistral xato tanalari (kuzatilgan shakllar):
 *   {"object":"error","message":"Requests rate limit exceeded","type":"rate_limited","param":null,"code":"1300"}
 *   {"object":"error","message":"Service tier capacity exceeded for this model.","type":"service_tier_capacity_exceeded","code":"3505"}
 *   {"object":"error","message":"Invalid model: foo","type":"invalid_model","code":"1500"}
 *   {"object":"error","message":{"detail":[{"type":"extra_forbidden","msg":"Extra inputs are not permitted", ...}]},"type":"invalid_request_error"}
 *   {"message":"Unauthorized","request_id":"..."}   (401)
 *   {"detail":"Unauthorized"}                       (401, eski)
 * → xabar + type + code bitta matnga yig'iladi va naqshlar bilan tekshiriladi.
 */
function errorText(body: string): { text: string; type: string; code: string } {
  let type = "";
  let code = "";
  let text = body;
  try {
    const j = JSON.parse(body) as Record<string, unknown>;
    const err = (j && typeof j.error === "object" && j.error ? j.error : j) as Record<string, unknown>;
    const msg = err.message ?? err.detail ?? j.detail ?? "";
    type = typeof err.type === "string" ? err.type : "";
    code = err.code === null || err.code === undefined ? "" : String(err.code);
    text = `${typeof msg === "string" ? msg : JSON.stringify(msg)} ${type} ${code}`;
  } catch {
    // JSON emas (HTML proksi sahifasi va h.k.) — xom matn.
  }
  return { text, type, code };
}

/** "30", "1.5", "250ms", "1m30s", "2s" → ms; HTTP-date → ms (now dan). */
export function parseDurationMs(raw: string | null, now = Date.now()): number | undefined {
  if (!raw) return undefined;
  const v = raw.trim();
  if (!v) return undefined;
  if (/^\d+(\.\d+)?$/.test(v)) return Math.round(parseFloat(v) * 1000);
  const parts = [...v.matchAll(/(\d+(?:\.\d+)?)(ms|h|m|s)/g)];
  if (parts.length && parts.map((p) => p[0]).join("") === v) {
    const mult: Record<string, number> = { ms: 1, s: 1000, m: 60_000, h: 3_600_000 };
    return Math.round(parts.reduce((sum, p) => sum + parseFloat(p[1]) * mult[p[2]], 0));
  }
  const at = Date.parse(v);
  if (!Number.isNaN(at)) return Math.max(0, at - now);
  return undefined;
}

function retryAfterFrom(headers: Headers, now: number): number | undefined {
  const candidates = [
    "retry-after-ms",
    "retry-after",
    "ratelimitbysize-reset",
    "x-ratelimit-reset-requests",
    "x-ratelimit-reset-tokens",
    "x-ratelimit-reset",
  ];
  for (const h of candidates) {
    const raw = headers.get(h);
    if (raw == null) continue;
    const ms = h === "retry-after-ms" ? Math.round(Number(raw)) : parseDurationMs(raw, now);
    if (ms !== undefined && Number.isFinite(ms) && ms >= 0) return ms;
  }
  return undefined;
}

/** Keyingi 00:00 UTC (kunlik limit tiklanishi). */
export function nextUtcMidnight(now = Date.now()): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
}

/** Oylik token kvotasi keyingi oyning 1-kuni 00:00 UTC da tiklanadi. */
export function nextMonthUtc(now = Date.now()): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
}

const CONTEXT_RE = /context length|maximum context|context window|too large for model|too many tokens|prompt is too long|exceeds? the model'?s? (?:maximum|context)/i;
const CREDIT_RE = /insufficient|credit|billing|balance|payment required|budget|can only afford|subscription (?:has )?expired/i;
const UNAVAILABLE_RE = /invalid[_ ]model|model[^.]{0,40}(?:not found|does not exist|not available|unavailable)|no such model|decommissioned|has been retired|unknown model/i;
const MONTHLY_RE = /month|monthly/i;
/** Kunlik limit ("requests per day", RPD/TPD, 4006 uslubi) — 60 s rate limit EMAS: keyingi 00:00 UTC gacha. */
const DAILY_RE = /per[ -]?day|daily|\brpd\b|\btpd\b|\b4006\b/i;
const AUTH_RE = /unauthori[sz]ed|invalid api key|api key (?:is )?(?:invalid|missing|revoked)|no api key/i;

export function classifyMistralError(status: number, body: string, headers: Headers, now = Date.now()): ClassifiedError {
  const { text, type, code } = errorText(body ?? "");
  const message = `mistral ${status}: ${text}`.slice(0, 500);

  if (status === 0) return { kind: "transient", message };

  if (status === 401 || (status !== 429 && AUTH_RE.test(text) && status < 500)) {
    return { kind: "auth", message };
  }
  if (status === 403) {
    // Kalit ishlaydi, lekin shu modelga ruxsat yo'q (masalan tarif) — faqat shu model yopiladi.
    if (/model/i.test(text) && /access|allowed|permission|not available|not enabled/i.test(text)) {
      return { kind: "unavailable", scope: "model", message };
    }
    return { kind: "auth", message };
  }
  if (status === 402 || (status !== 429 && CREDIT_RE.test(text))) {
    return { kind: "no_credit", message };
  }
  if (status === 413 || CONTEXT_RE.test(text)) return { kind: "context_length", message };
  if (status === 404 || type === "invalid_model" || code === "1500" || UNAVAILABLE_RE.test(text)) {
    return { kind: "unavailable", scope: "model", message };
  }

  if (status === 429) {
    const retryAfterMs = retryAfterFrom(headers, now);
    const monthLeft = headers.get("x-ratelimit-remaining-tokens-month");
    if ((monthLeft !== null && Number(monthLeft) <= 0) || MONTHLY_RE.test(text)) {
      // Oylik token limiti (butun workspace) — keyingi oy boshigacha.
      return { kind: "quota_exhausted", resetAt: nextMonthUtc(now), scope: "provider", message };
    }
    if (CREDIT_RE.test(text)) return { kind: "no_credit", message };
    if (DAILY_RE.test(text)) return { kind: "quota_exhausted", resetAt: nextUtcMidnight(now), scope: "model", message };
    // Daqiqalik so'rov/token limiti (La Plateforme limitlar sahifasida har model uchun alohida)
    // yoki "service_tier_capacity_exceeded" (code 3505, shu model sig'imi) — ikkalasi ham faqat
    // shu modelni yopadi, Mistral'ning boshqa modellari tanlanaveradi.
    return { kind: "rate_limited", retryAfterMs, scope: "model", message };
  }

  if (status === 408 || status === 425 || status >= 500) return { kind: "transient", message };
  if (status >= 200 && status < 300) {
    // Oqim ichidagi xato (200 + error tana) — yuqoridagi naqshlarga tushmasa, vaqtinchalik.
    return { kind: "transient", message };
  }
  return { kind: "bad_request", message };
}

/* ------------------------------------------------------------------ */
/* Adapter                                                             */
/* ------------------------------------------------------------------ */

export const mistralAdapter: ProviderAdapter = {
  id: "mistral",
  host: "mistral",
  enabled: () => !!process.env.MISTRAL_API_KEY?.trim(),
  endpoint: () => ({
    url: `${BASE}/chat/completions`,
    headers: {
      Authorization: `Bearer ${process.env.MISTRAL_API_KEY?.trim() ?? ""}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
  }),
  offers: OFFERS,
  limits: {
    // Mistral bepul (Experiment) va pullik tarif raqamlarini ochiq e'lon qilmaydi — faqat
    // admin.mistral.ai/plateforme/limits da (workspace'ga bog'liq). Codebase'da ham raqam yo'q.
    // Raqam taxmin qilinmaydi: dailyUnits yo'q → scheduler R=1 (noma'lum kvota), 429 sarlavhalari
    // (retry-after, x-ratelimit-*-tokens-month) health orqali boshqaradi.
    unit: "tokens",
    perModel: true,
    source:
      "https://docs.mistral.ai/admin/user-management-finops/tier (2026-09-27): limitlar faqat https://admin.mistral.ai/plateforme/limits da; raqamlar codebase'da ham yo'q",
  },
  classifyError: (status, body, headers) => classifyMistralError(status, body, headers),
  transformBody: mistralTransformBody,
  readServedModel(chunkOrJson) {
    if (!chunkOrJson || typeof chunkOrJson !== "object") return null;
    const m = (chunkOrJson as { model?: unknown }).model;
    return typeof m === "string" && m.trim() ? mistralDisplayId(m) : null;
  },
  displayId: mistralDisplayId,
};
