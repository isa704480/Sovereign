/**
 * Groq adapteri (api.groq.com/openai/v1, OpenAI chat-completions). Bepul tarif: har model o'z
 * RPM/RPD/TPM/TPD bucket'i (perModel), tool-calling qo'llanadi, 429 da retry-after va
 * x-ratelimit-* sarlavhalari keladi. PURE: import paytida env o'qilmaydi, tarmoq yo'q.
 * Test: npx tsx --conditions=react-server src/lib/ai/mesh/providers/groq.test.ts
 *
 * Halollik (docs/MESH.md §8): Groq'da faqat quyidagi og'irliklar bor. Llama 3.3 / 3.1 so'rovlari
 * (DIRECT_ROUTES dagi eski "groq: openai/gpt-oss-120b") — endi same-model EMAS, sinf bo'yicha
 * o'rinbosar (class "free" — har sinf pog'onasining oxiri, shuning uchun hamma so'rovga zaxira).
 */
import type { ChatBody, ClassifiedError, ModelOffer, ProviderAdapter } from "../types";

export const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

/** Rasmiy jadval: https://console.groq.com/docs/rate-limits (2026-09-27 tekshirildi). */
export const GROQ_LIMITS_SOURCE = "https://console.groq.com/docs/rate-limits (2026-09-27)";

/** Chat modellarining umumiy imkoniyatlari (vision — hujjatda tasdiqlanmagan, shuning uchun false). */
const CHAT_CAPS = { stream: true, tools: true, vision: false, json: true } as const;

export const GROQ_OFFERS: ModelOffer[] = [
  {
    // Qwen 3.8 27B — o'z evalimizda 37/40 (92.5%, src/data/model-compare.json, route via groq).
    // Cloudflare'dagi "@cf/qwen/qwen3.8-27b" — xuddi shu og'irliklar (chain.ts izohi).
    sovereignIds: [
      "groq/qwen/qwen3.8-27b",
      "qwen/qwen3.8-27b",
      "qwen3-8-27b",
      "cloudflare/@cf/qwen/qwen3.8-27b",
      "@cf/qwen/qwen3.8-27b",
    ],
    wire: "qwen/qwen3.8-27b",
    class: "free",
    cost: "free",
    caps: { ...CHAT_CAPS },
    quality: 0.9,
  },
  {
    // GPT-OSS 120B — CLI'da tool-calling uchun asosiy Groq modeli. Baholanmagan → sinf standarti.
    sovereignIds: [
      "groq/openai/gpt-oss-120b",
      "openai/gpt-oss-120b",
      "cloudflare/@cf/openai/gpt-oss-120b",
      "@cf/openai/gpt-oss-120b",
    ],
    wire: "openai/gpt-oss-120b",
    class: "free",
    cost: "free",
    caps: { ...CHAT_CAPS },
  },
  {
    // GPT-OSS 20B — alohida TPM bucket (CLI route: "ikki model = ikki alohida bucket").
    // Baholanmagan; 120B dan kichik — undan keyin tanlansin.
    sovereignIds: ["groq/openai/gpt-oss-20b", "openai/gpt-oss-20b"],
    wire: "openai/gpt-oss-20b",
    class: "free",
    cost: "free",
    caps: { ...CHAT_CAPS },
    quality: 0.55,
  },
];

/* ------------------------------------------------------------------ */
/* Xato tasnifi (PURE, `now` inject qilinadi — testda deterministik)    */
/* ------------------------------------------------------------------ */

/** Groq davomiylik formati: "2m59.56s", "7.66s", "1h2m3s", "120ms" → ms. Tanilmasa null. */
export function parseGroqDuration(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(parseFloat(s) * 1000); // yalang soniya
  const re = /(\d+(?:\.\d+)?)(ms|h|m|s)/g;
  let total = 0;
  let matched = "";
  for (let m = re.exec(s); m; m = re.exec(s)) {
    const n = parseFloat(m[1]);
    total += m[2] === "h" ? n * 3_600_000 : m[2] === "m" ? n * 60_000 : m[2] === "s" ? n * 1000 : n;
    matched += m[0];
  }
  return matched && matched === s ? Math.round(total) : null;
}

/** retry-after: soniya (butun yoki kasr) yoki HTTP-date. */
function retryAfterMs(headers: Headers, now: number): number | null {
  const v = headers.get("retry-after");
  if (!v) return null;
  const secs = Number(v.trim());
  if (Number.isFinite(secs) && secs >= 0) return Math.round(secs * 1000);
  const at = Date.parse(v);
  return Number.isFinite(at) ? Math.max(0, at - now) : null;
}

/** Tanadagi "Please try again in 1m26.4s." */
function bodyTryAgainMs(text: string): number | null {
  const m = /try again in\s+([0-9hms.]+)/i.exec(text);
  return m ? parseGroqDuration(m[1].replace(/\.$/, "")) : null;
}

interface GroqErrorBody {
  message: string;
  code: string;
  type: string;
}

/** {"error":{"message","type","code"}} — yoki SSE "data: {...}" qatori. Buzuq bo'lsa xom matn. */
function parseBody(body: string): GroqErrorBody {
  const raw = (body ?? "").trim().replace(/^data:\s*/, "");
  try {
    const j = JSON.parse(raw) as { error?: { message?: unknown; code?: unknown; type?: unknown } | string };
    const e = j?.error;
    if (typeof e === "string") return { message: e, code: "", type: "" };
    if (e && typeof e === "object") {
      return {
        message: typeof e.message === "string" ? e.message : "",
        code: typeof e.code === "string" ? e.code : "",
        type: typeof e.type === "string" ? e.type : "",
      };
    }
  } catch {
    // JSON emas (HTML 403 sahifasi, bo'sh tana) — pastda xom matn bilan.
  }
  return { message: raw, code: "", type: "" };
}

const DAILY_RE = /per day|\(RPD\)|\(TPD\)/i;
const DECOMMISSIONED_RE = /decommissioned|no longer supported|does not exist|model[_ ]not[_ ]found|not have access to (it|the model)/i;
const CONTEXT_RE = /context[_ ]length|maximum context|reduce the length|too many tokens|request too large|request_too_large/i;

/**
 * Groq xatosi → ClassifiedError (docs/MESH.md §2.1). `now` — resetAt hisoblash uchun.
 * Rate/kvota xatolari scope "model": Groq limitlari har model uchun alohida.
 */
export function classifyGroqError(status: number, body: string, headers: Headers, now: number): ClassifiedError {
  const b = parseBody(body);
  const text = `${b.code} ${b.type} ${b.message}`;
  const message = (b.message || body || `HTTP ${status}`).slice(0, 300);
  const code = b.code.toLowerCase();

  // Oqim ichidagi xato (status 200 + error tana) — kod bo'yicha ekvivalent statusga.
  let st = status;
  if (st === 200) {
    st =
      code === "rate_limit_exceeded" ? 429
      : code === "invalid_api_key" ? 401
      : code === "model_not_found" ? 404
      : code === "context_length_exceeded" ? 413
      : code === "tool_use_failed" || code === "json_validate_failed" ? 400
      : 500;
  }

  // 1) Tarmoq / server / Groq maxsus (498 flex sig'imi to'la, 499 bekor qilindi).
  if (st === 0 || st >= 500 || st === 408 || st === 498 || st === 499) {
    const ra = st === 0 ? null : retryAfterMs(headers, now);
    return { kind: "transient", ...(ra != null ? { retryAfterMs: ra } : {}), message };
  }

  // 2) 429 — minutlik (RPM/TPM) yoki kunlik (RPD/TPD).
  if (st === 429) {
    const tryAgain = bodyTryAgainMs(b.message);
    const ra = retryAfterMs(headers, now);
    const remainingReq = headers.get("x-ratelimit-remaining-requests");
    // Tana aniq aytsa — shunga ishonamiz; aks holda remaining-requests (kunlik bucket) = 0.
    const perMinute = /per minute|\(RPM\)|\(TPM\)/i.test(b.message);
    const daily = DAILY_RE.test(b.message) || (!perMinute && remainingReq != null && remainingReq.trim() === "0");
    if (daily) {
      // x-ratelimit-reset-requests — kunlik so'rov bucket'i tiklanishi (hujjat).
      const resetReq = parseGroqDuration(headers.get("x-ratelimit-reset-requests"));
      const wait = tryAgain ?? resetReq ?? ra;
      return { kind: "quota_exhausted", scope: "model", ...(wait != null ? { resetAt: now + wait, retryAfterMs: wait } : {}), message };
    }
    const wait = ra ?? tryAgain ?? parseGroqDuration(headers.get("x-ratelimit-reset-tokens"));
    return { kind: "rate_limited", scope: "model", ...(wait != null ? { retryAfterMs: wait } : {}), message };
  }

  // 3) Kalit / ruxsat.
  if (st === 401) return { kind: "auth", message };
  if (st === 403) {
    // Model darajasidagi taqiq (tashkilotda o'chirilgan model) — faqat shu model.
    if (/model/i.test(text) && /blocked|permission|not have access|not enabled/i.test(text)) {
      return { kind: "unavailable", scope: "model", message };
    }
    return { kind: "auth", message }; // organization_restricted, mintaqa bloki (HTML), kalit
  }
  if (st === 402 || /insufficient|billing|spend limit|credits?/i.test(b.code)) return { kind: "no_credit", message };

  // 4) Model yo'q / o'chirilgan.
  if (st === 404) {
    return { kind: "unavailable", scope: /model/i.test(text) ? "model" : "provider", message };
  }
  if (code === "model_decommissioned" || code === "model_not_found" || DECOMMISSIONED_RE.test(b.message)) {
    return { kind: "unavailable", scope: "model", message };
  }

  // 5) Hajm: 413 (Groq: TPM dan katta so'rov "Request too large ... (TPM)") yoki kontekst.
  //    DIQQAT: bepul TPM 8K — bu Groq'ning o'z chegarasi; kattaroq kontekstli boshqa nomzod
  //    bajara oladi (hisobotdagi contract gap). scope "model" — faqat shu model uchun.
  if (st === 413 || code === "context_length_exceeded" || CONTEXT_RE.test(text)) {
    return { kind: "context_length", scope: "model", message };
  }

  // 6) Generatsiya xatosi (model noto'g'ri tool/JSON chiqardi) — so'rov yaroqli, qayta urinish
  //    yoki boshqa provayder uddalashi mumkin. bad_request zanjirni to'xtatib qo'yardi.
  if (code === "tool_use_failed" || code === "json_validate_failed") {
    return { kind: "transient", scope: "model", message };
  }

  // 7) Qolgan 4xx (400, 422, 424 remote MCP va h.k.) — so'rovning o'zi yaroqsiz.
  return { kind: "bad_request", message };
}

/* ------------------------------------------------------------------ */
/* Tana moslash                                                        */
/* ------------------------------------------------------------------ */

/** Groq qo'llamaydigan OpenAI maydonlari (400 beradi): logprobs, top_logprobs, logit_bias, n>1. */
export function groqTransformBody(body: ChatBody): ChatBody {
  const out: ChatBody = { ...body };
  delete out.logprobs;
  delete out.top_logprobs;
  delete out.logit_bias;
  if (typeof out.n === "number" && out.n !== 1) delete out.n;
  return out;
}

/** SSE bo'lagi yoki JSON javobdagi `model` → "groq/<model>" (displayId bilan bir xil shakl). */
export function groqServedModel(chunkOrJson: unknown): string | null {
  if (!chunkOrJson || typeof chunkOrJson !== "object") return null;
  const m = (chunkOrJson as { model?: unknown }).model;
  if (typeof m !== "string" || !m.trim()) return null;
  const id = m.trim().slice(0, 120);
  return id.startsWith("groq/") ? id : `groq/${id}`;
}

export const groqAdapter: ProviderAdapter = {
  id: "groq",
  host: "groq",
  enabled: () => !!process.env.GROQ_API_KEY?.trim(),
  endpoint: () => ({
    url: `${GROQ_BASE_URL}/chat/completions`,
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY?.trim() ?? ""}`,
      "Content-Type": "application/json",
    },
  }),
  offers: GROQ_OFFERS,
  // Uchala chat modeli uchun bir xil (har model alohida bucket). Kunda odatda TPD birinchi
  // tugaydi (1K so'rov × ~2K token > 200K), shuning uchun dailyUnits — token.
  limits: {
    rpm: 30,
    rpd: 1_000,
    tpm: 8_000,
    tpd: 200_000,
    dailyUnits: 200_000,
    unit: "tokens",
    perModel: true,
    source: GROQ_LIMITS_SOURCE,
  },
  classifyError: (status, body, headers) => classifyGroqError(status, body, headers, Date.now()),
  transformBody: (body) => groqTransformBody(body),
  readServedModel: groqServedModel,
  // Region va badge: chain.ts GROQ_QWEN / GROQ_OSS bilan bir xil "groq/..." shakl
  // (modelAllowedIn ham model egasini, ham groq host siyosatini tekshiradi).
  displayId: (wire) => (wire.startsWith("groq/") ? wire : `groq/${wire}`),
};
