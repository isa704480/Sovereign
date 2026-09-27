import type { ChatBody, ClassifiedError, ErrorKind, Limits, ModelOffer, ProviderAdapter } from "../types";

/**
 * Cerebras Inference adapteri — OpenAI-mos chat-completions:
 *   POST https://api.cerebras.ai/v1/chat/completions (Bearer CEREBRAS_API_KEY).
 *
 * Model ro'yxati inference-docs.cerebras.ai/models/overview da 2026-09-27 tekshirilgan:
 * Shared Inference'da faqat `gpt-oss-120b` va `qwen-3.8-27b` qolgan. providers.ts DIRECT_ROUTES
 * dagi eski id'lar (llama-3.3-70b, llama3.1-8b, llama3.1-405b, qwen-3-32b) ro'yxatda yo'q —
 * ular offer qilinmaydi (404 → keraksiz urinish bo'lardi).
 *
 * Free Trial krediti tugasa / hisob pullik rejaga o'tmagan bo'lsa 402 PaymentRequired (yoki 403)
 * keladi — eval shuni ko'rsatgan: `no_credit` (butun provayder, +1 soat yopiq).
 *
 * Shu fayldagi `classifyOpenAiStyleError` SambaNova adapteri bilan umumiy (ikkala provayder
 * ham OpenAI uslubidagi xato tanasi va x-ratelimit-* sarlavhalarini qaytaradi).
 */

const CEREBRAS_BASE = "https://api.cerebras.ai/v1";

/* ------------------------------------------------------------------ */
/* Umumiy yordamchilar (cerebras + sambanova)                          */
/* ------------------------------------------------------------------ */

/**
 * Reset/Retry-After qiymati → ms (hozirdan keyingi). Qo'llanadigan shakllar:
 *  - "12.5" — soniya (delta);  "1700000000" — epoch soniya;  "1700000000000" — epoch ms;
 *  - "1m30s", "250ms", "2h", "6m0.5s" — davomiylik satri;
 *  - HTTP sana ("Wed, 21 Oct 2026 07:28:00 GMT").
 * Tushunarsiz — undefined.
 */
export function parseResetMs(raw: string | null | undefined, now: number): number | undefined {
  const v = (raw ?? "").trim();
  if (!v) return undefined;
  if (/^\d+(\.\d+)?$/.test(v)) {
    const n = Number(v);
    if (n >= 1e12) return Math.max(0, n - now); // epoch ms
    if (n >= 1e9) return Math.max(0, n * 1000 - now); // epoch s
    return Math.round(n * 1000); // delta s
  }
  const dur = /^(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m(?!s))?(?:(\d+(?:\.\d+)?)s)?(?:(\d+(?:\.\d+)?)ms)?$/i.exec(v);
  if (dur && (dur[1] || dur[2] || dur[3] || dur[4])) {
    const [h, m, s, ms] = dur.slice(1).map((x) => Number(x ?? 0));
    return Math.round(h * 3_600_000 + m * 60_000 + s * 1000 + ms);
  }
  const at = Date.parse(v);
  if (!Number.isNaN(at)) return Math.max(0, at - now);
  return undefined;
}

/** OpenAI uslubidagi xato tanasidan xabar/kod/tur (Cerebras: yuqori darajada; SambaNova/OpenAI: `error` ichida). */
export function parseErrorBody(body: string): { message: string; code: string; type: string; status?: number } {
  let message = "";
  let code = "";
  let type = "";
  let status: number | undefined;
  try {
    const j = JSON.parse(body) as Record<string, unknown>;
    const e = (j && typeof j.error === "object" && j.error !== null ? j.error : j) as Record<string, unknown>;
    if (typeof j.error === "string") message = j.error;
    if (typeof e.message === "string") message = e.message;
    else if (typeof e.detail === "string") message = e.detail;
    if (e.code != null) code = String(e.code);
    if (typeof e.type === "string") type = e.type;
    const st = e.status_code ?? e.status ?? j.status_code ?? j.status;
    if (typeof st === "number") status = st;
    else if (typeof st === "string" && /^\d{3}$/.test(st)) status = Number(st);
  } catch {
    /* JSON emas — xom matn */
  }
  return { message: message || body, code, type, status };
}

const RE_CONTEXT = /context[ _-]?length|context[ _-]?window|maximum context|too many tokens|prompt is too long|reduce the length|exceeds? (the )?(model'?s? )?(max(imum)?|context)|input (is )?too (long|large)|content[ _]too[ _]large/i;
const RE_UNAVAILABLE = /model[_ ]not[_ ]found|model .{0,80}(not found|does not exist|not available|not supported|is not served|decommissioned|deprecated|retired)|no such model|unknown model|invalid model/i;
const RE_NO_CREDIT = /payment[ _]required|insufficient|credits?\b|billing|balance|upgrade (your )?(plan|account)|free trial (has )?(ended|expired)|trial.{0,20}expired|out of (credit|funds)|spend(ing)? limit/i;
const RE_AUTH = /invalid.{0,20}(api[ _-]?key|token|credential)|incorrect api key|wrong api key|api[ _-]?key.{0,30}(invalid|missing|revoked|not valid)|unauthori[sz]ed|authentication|not authenticated/i;
const RE_DAILY = /per[ _-]?day|daily|_day\b|requests[ _-]per[ _-]day|tokens[ _-]per[ _-]day|\bRPD\b|\bTPD\b|day limit/i;
const RE_RATE = /rate[ _-]?limit|too[ _-]?many[ _-]?requests|quota[ _-]?exceeded|limit exceeded|throttl/i;
const RE_TRANSIENT = /overloaded|over capacity|temporarily unavailable|try again|timeout|timed out|internal (server )?error|service unavailable|bad gateway|upstream|queue (is )?full|high demand/i;

const TRANSIENT_STATUS = new Set([0, 408, 425, 500, 502, 503, 504, 520, 521, 522, 523, 524, 529]);

/** Sarlavhalar: minut darajasidagi reset (retry-after bo'lmasa). */
const MINUTE_RESET_HEADERS = [
  "x-ratelimit-reset-requests-minute",
  "x-ratelimit-reset-tokens-minute",
  "x-ratelimit-reset-requests",
  "x-ratelimit-reset-tokens",
];
const HOUR_RESET_HEADERS = ["x-ratelimit-reset-tokens-hour", "x-ratelimit-reset-requests-hour"];
/** Kunlik bucket: [remaining, reset] juftliklari. */
const DAY_BUCKETS: [string, string][] = [
  ["x-ratelimit-remaining-requests-day", "x-ratelimit-reset-requests-day"],
  ["x-ratelimit-remaining-tokens-day", "x-ratelimit-reset-tokens-day"],
];

function maxReset(headers: Headers, names: string[], now: number): number | undefined {
  let best: number | undefined;
  for (const n of names) {
    const ms = parseResetMs(headers.get(n), now);
    if (ms !== undefined && (best === undefined || ms > best)) best = ms;
  }
  return best;
}

function retryAfterMs(headers: Headers, now: number): number | undefined {
  const rawMs = (headers.get("retry-after-ms") ?? "").trim();
  if (/^\d+(\.\d+)?$/.test(rawMs)) return Math.round(Number(rawMs));
  return parseResetMs(headers.get("retry-after"), now);
}

export interface OpenAiStyleOptions {
  /** Limitlar har model uchun alohida (Cerebras/SambaNova) — rate/quota xatolari `scope: "model"`. */
  perModelLimits: boolean;
  /**
   * 403 ni kalit xatosi (auth) emas, balki "pullik reja kerak" (no_credit) deb ko'rish — agar
   * tanada aniq kalit xatosi yo'q bo'lsa. Cerebras/SambaNova: hisob faollashtirilmagan / trial tugagan.
   */
  forbiddenIsNoCredit: boolean;
}

/**
 * OpenAI-mos provayder xatosi → ClassifiedError (docs/MESH.md §2.1). PURE: `now` tashqaridan.
 * Status 200 (oqim ichidagi xato) bo'lsa — tanadagi status_code/kod/matn bo'yicha.
 */
export function classifyOpenAiStyleError(
  status: number,
  body: string,
  headers: Headers,
  now: number,
  opts: OpenAiStyleOptions,
): ClassifiedError {
  const parsed = parseErrorBody(body ?? "");
  const text = `${parsed.code} ${parsed.type} ${parsed.message}`;
  const message = `${status}${parsed.code ? ` ${parsed.code}` : ""}: ${parsed.message}`.slice(0, 300);
  // Oqim ichidagi xato: tanadagi status_code ishonchliroq.
  let st = status;
  if ((st === 200 || st === 0) && parsed.status && parsed.status >= 400) st = parsed.status;
  if (st > 0 && st < 400) {
    if (/rate[_ ]?limit|too[_ ]?many[_ ]?requests|quota/i.test(`${parsed.code} ${parsed.type}`)) st = 429;
    else if (RE_CONTEXT.test(text)) st = 413;
    else if (RE_UNAVAILABLE.test(text)) st = 404;
    else if (RE_AUTH.test(text)) st = 401;
    else if (RE_NO_CREDIT.test(text)) st = 402;
    else st = 500; // noma'lum oqim xatosi — vaqtinchalik deb olamiz
  }
  const scopeLimits: ClassifiedError["scope"] = opts.perModelLimits ? "model" : "provider";
  const out = (kind: ErrorKind, extra: Partial<ClassifiedError> = {}): ClassifiedError => ({ kind, message, ...extra });

  if (st === 402) return out("no_credit", { scope: "provider" });
  if (st === 401) return out("auth", { scope: "provider" });
  if (st === 403) {
    if (opts.forbiddenIsNoCredit && !RE_AUTH.test(text)) return out("no_credit", { scope: "provider" });
    return out("auth", { scope: "provider" });
  }
  if (st === 429) {
    // Pul/kredit tugagani 429 bilan ham kelishi mumkin.
    if (/insufficient|credits?\b|billing|balance|payment/i.test(text)) return out("no_credit", { scope: "provider" });
    // Kunlik kvota: sarlavhada remaining=0 yoki tanada "per day".
    for (const [rem, reset] of DAY_BUCKETS) {
      if ((headers.get(rem) ?? "").trim() === "0") {
        const ms = parseResetMs(headers.get(reset), now);
        return out("quota_exhausted", { scope: scopeLimits, ...(ms !== undefined ? { resetAt: now + ms } : {}) });
      }
    }
    if (RE_DAILY.test(text)) {
      const ms = maxReset(headers, DAY_BUCKETS.map(([, r]) => r), now) ?? retryAfterMs(headers, now);
      return out("quota_exhausted", { scope: scopeLimits, ...(ms !== undefined ? { resetAt: now + ms } : {}) });
    }
    // Soatlik token bucket (Cerebras TPH) — kunlik emas, lekin minutdan uzoq.
    const hourly = /per[ _-]?hour|_hour\b|hourly/i.test(text);
    const ms = retryAfterMs(headers, now) ?? maxReset(headers, hourly ? HOUR_RESET_HEADERS : MINUTE_RESET_HEADERS, now);
    return out("rate_limited", { scope: scopeLimits, ...(ms !== undefined ? { retryAfterMs: ms } : {}) });
  }
  if (st === 413 || RE_CONTEXT.test(text)) return out("context_length");
  if (st === 404 || RE_UNAVAILABLE.test(text)) return out("unavailable", { scope: "model" });
  if (TRANSIENT_STATUS.has(st) || st >= 500) {
    const ms = retryAfterMs(headers, now);
    return out("transient", ms !== undefined ? { retryAfterMs: ms } : {});
  }
  // 400/422 va boshqa 4xx — tanaga qarab.
  if (RE_NO_CREDIT.test(text) && !/max_tokens|max_completion_tokens/i.test(text)) return out("no_credit", { scope: "provider" });
  if (RE_AUTH.test(text)) return out("auth", { scope: "provider" });
  if (RE_RATE.test(text)) {
    const ms = retryAfterMs(headers, now) ?? maxReset(headers, MINUTE_RESET_HEADERS, now);
    return out("rate_limited", { scope: scopeLimits, ...(ms !== undefined ? { retryAfterMs: ms } : {}) });
  }
  if (st === 409 && RE_TRANSIENT.test(text)) return out("transient");
  return out("bad_request");
}

/** Env qiymati bo'sh emasmi (bo'sh joy — yo'q deb olinadi). */
export function hasEnv(name: string): boolean {
  return !!process.env[name]?.trim();
}

/* ------------------------------------------------------------------ */
/* Cerebras                                                            */
/* ------------------------------------------------------------------ */

/**
 * Takliflar. Ikkalasi Free Trial'da tekin (kredit tugaguncha) — `class: "free"` (tekin tarif
 * zanjirida ishtirok etsin: Groq + Cloudflare + Cerebras + SambaNova kvotalari birga sarflanadi),
 * sifati `quality` bilan (sinf standarti 0.7 dan yuqori).
 *
 * sovereignIds — faqat AYNAN shu og'irliklar: katalog id, OpenRouter id va boshqa hostlardagi
 * (Groq / Cloudflare) xuddi shu model id'lari (auto-pools.ts GROQ_QWEN / CF_IDS.qwen va h.k.).
 */
export const CEREBRAS_OFFERS: ModelOffer[] = [
  {
    // inference-docs.cerebras.ai/models/qwen-3.8-27b: tools (parallel), structured outputs, stream.
    // Rasm — faqat base64 data URI (tashqi HTTPS URL 400 beradi) — shuning uchun vision: false,
    // aks holda URL'li rasm bad_request bo'lib butun zanjirni to'xtatadi.
    sovereignIds: ["qwen3-8-27b", "qwen/qwen3.8-27b", "groq/qwen/qwen3.8-27b", "cloudflare/@cf/qwen/qwen3.8-27b"],
    wire: "qwen-3.8-27b",
    class: "free",
    cost: "free",
    caps: { stream: true, tools: true, vision: false, json: true },
    quality: 0.8,
  },
  {
    // gpt-oss-120b (Apache-2.0): tools, structured outputs, stream, reasoning_effort.
    sovereignIds: ["openai/gpt-oss-120b", "openai/gpt-oss-120b:free", "groq/openai/gpt-oss-120b", "cloudflare/@cf/openai/gpt-oss-120b"],
    wire: "gpt-oss-120b",
    class: "free",
    cost: "free",
    caps: { stream: true, tools: true, vision: false, json: true },
    quality: 0.8,
  },
];

/** Wire id → kanonik "vendor/model" (region.ts policyOwner va served badge uchun). */
const CEREBRAS_CANONICAL: Record<string, string> = {
  "qwen-3.8-27b": "qwen/qwen3.8-27b",
  "gpt-oss-120b": "openai/gpt-oss-120b",
};

/**
 * Free Trial limitlari (har model uchun alohida): 5 RPM, 30K uncached / 90K total TPM, 1M TPH, 1M TPD.
 * Kunlik birlik — token (TPD 1M). RPD hujjatda berilmagan.
 */
export const CEREBRAS_LIMITS: Limits = {
  rpm: 5,
  tpm: 30_000,
  tpd: 1_000_000,
  dailyUnits: 1_000_000,
  unit: "tokens",
  perModel: true,
  source: "https://inference-docs.cerebras.ai/support/rate-limits (2026-09-27)",
};

/** Cerebras Shared Inference qo'llamaydigan maydonlar (inference-docs.cerebras.ai/resources/openai). */
function cerebrasBody(body: ChatBody): ChatBody {
  const out: ChatBody = { ...body };
  delete out.tool_stream; // "Do not send tool_stream"
  delete out.service_tier; // Shared Inference'da yo'q
  if (typeof out.n === "number" && out.n !== 1) delete out.n; // faqat n: 1
  // tools + response_format birga — model hujjati ruxsat bermasa 400; tools ustun.
  if (Array.isArray(out.tools) && out.tools.length > 0 && out.response_format !== undefined) delete out.response_format;
  return out;
}

export function classifyCerebrasError(status: number, body: string, headers: Headers, now: number): ClassifiedError {
  return classifyOpenAiStyleError(status, body, headers, now, { perModelLimits: true, forbiddenIsNoCredit: true });
}

export const cerebrasAdapter: ProviderAdapter = {
  id: "cerebras",
  host: "cerebras",
  enabled: () => hasEnv("CEREBRAS_API_KEY"),
  endpoint: () => ({
    url: `${CEREBRAS_BASE}/chat/completions`,
    headers: {
      Authorization: `Bearer ${process.env.CEREBRAS_API_KEY?.trim() ?? ""}`,
      "Content-Type": "application/json",
    },
  }),
  offers: CEREBRAS_OFFERS,
  limits: CEREBRAS_LIMITS,
  classifyError: (status, body, headers) => classifyCerebrasError(status, body, headers, Date.now()),
  transformBody: (body) => cerebrasBody(body),
  displayId: (wire) => `cerebras/${CEREBRAS_CANONICAL[wire] ?? wire}`,
};
