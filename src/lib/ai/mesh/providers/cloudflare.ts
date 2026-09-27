import { MODELS } from "@/config/models";
import { CF, CF_NEURONS_PER_M, CF_PREFIX, CF_SAME_MODEL, cfId, cfSameModel, cfStreams } from "../../cloudflare";
import type { ChatBody, ClassifiedError, ModelOffer, OfferClass, PlanTier, ProviderAdapter } from "../types";

/**
 * Cloudflare Workers AI adapteri (Provider Mesh). OpenAI-mos endpoint:
 *   POST https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/ai/v1/chat/completions
 *   Authorization: Bearer {CLOUDFLARE_AI_TOKEN}
 *
 * Model id'lari, neuron narxi, oqim qoidasi — ../../cloudflare.ts (bitta manba; providers.ts,
 * region.ts va CLI route ham shundan foydalanadi). Bu fayl faqat mesh shartnomasiga moslaydi.
 *
 * Limitlar (2026-09-27 tekshirildi):
 *   https://developers.cloudflare.com/workers-ai/platform/pricing/ — kuniga 10 000 neuron tekin
 *     (Free va Paid rejada), "All limits reset daily at 00:00 UTC"; Free rejada oshsa — xato.
 *   https://developers.cloudflare.com/workers-ai/platform/limits/ — Text Generation: 300 so'rov/daqiqa.
 *   https://developers.cloudflare.com/workers-ai/platform/errors/ — xato kodlari (pastdagi jadval).
 */

const CF_API_BASE = "https://api.cloudflare.com/client/v4";

/* ------------------------------------------------------------------ */
/* Env                                                                 */
/* ------------------------------------------------------------------ */

function envAccount(): string {
  return process.env.CLOUDFLARE_ACCOUNT_ID?.trim() ?? "";
}

function envToken(): string {
  return process.env.CLOUDFLARE_AI_TOKEN?.trim() ?? "";
}

/* ------------------------------------------------------------------ */
/* Offers                                                              */
/* ------------------------------------------------------------------ */

/**
 * Har Cloudflare modeli uchun: sinf, o'rinbosar sifatida minimal tarif va tool-calling.
 *  - minTier — neuron narxi bo'yicha (region.ts REGION_EQUIVALENTS va auto-pools.ts bilan bir xil):
 *    Qwen 27B / gpt-oss / Llama — Free; DeepSeek Flash — Starter; DeepSeek Pro, Kimi, GLM — Pro
 *    (10k neuron ≈ 27k chiqish tokeni DeepSeek Pro'da — tekin tarifga berilmaydi).
 *  - tools — CLI route (Cowork agent) shu modellarni tool-calling bilan ishlatadi (Kimi Code,
 *    DeepSeek Pro, GLM 5.3, Qwen 27B sinovdan o'tgan); bir oiladagi Kimi K2.6, DeepSeek Flash,
 *    GLM 5.2 ham. gpt-oss (oqimsiz, Responses formatiga yaqin) va Llama fp8 — ehtiyot uchun false.
 */
const SPEC: Record<string, { class: OfferClass; minTier: PlanTier; tools: boolean }> = {
  [CF.deepseekPro]: { class: "flagship", minTier: "pro", tools: true },
  [CF.kimi]: { class: "flagship", minTier: "pro", tools: true },
  [CF.glm]: { class: "flagship", minTier: "pro", tools: true },
  [CF.glm52]: { class: "flagship", minTier: "pro", tools: true },
  [CF.kimiCode]: { class: "code", minTier: "pro", tools: true },
  [CF.deepseekFlash]: { class: "fast", minTier: "starter", tools: true },
  [CF.qwen]: { class: "fast", minTier: "free", tools: true },
  [CF.gptOss]: { class: "free", minTier: "free", tools: false },
  [CF.llama]: { class: "free", minTier: "free", tools: false },
};

/**
 * Shu Cloudflare modeli bilan AYNAN bir xil og'irlikdagi SOVEREIGN id'lari:
 * CF_SAME_MODEL kalitlari (OpenRouter/katalog providerModel) va ularning host-prefiksli /
 * ":free" ko'rinishlari (cfSameModel aynan shularni tan oladi), katalog `id` lari
 * (config/models.ts — providerModel shu modelga tushsa), "cloudflare/@cf/..." va "@cf/...".
 */
function sameIdsFor(wire: string): string[] {
  const ids = new Set<string>([cfId(wire), wire]);
  for (const [bare, w] of Object.entries(CF_SAME_MODEL)) {
    if (w !== wire) continue;
    for (const prefix of ["", "openrouter/", "omniroute/", "groq/"]) {
      ids.add(`${prefix}${bare}`);
      ids.add(`${prefix}${bare}:free`);
    }
  }
  for (const m of MODELS) {
    if (cfSameModel(m.providerModel) === wire) {
      ids.add(m.id);
      ids.add(m.providerModel);
    }
  }
  return [...ids];
}

function buildOffers(): ModelOffer[] {
  return Object.entries(SPEC).map(([wire, s]) => ({
    sovereignIds: sameIdsFor(wire),
    wire,
    class: s.class,
    // 10k neuron/kun tekin ulush — scheduler uni boshqa tekin kvotalar bilan birga yoyadi.
    cost: "free",
    caps: { stream: cfStreams(wire), tools: s.tools, vision: false, json: false },
    neuronsPerM: CF_NEURONS_PER_M[wire],
    minTier: s.minTier,
  }));
}

const OFFERS: ModelOffer[] = buildOffers();

/* ------------------------------------------------------------------ */
/* Xatolar                                                             */
/* ------------------------------------------------------------------ */

/** Keyingi 00:00 UTC (epoch ms) — Cloudflare kunlik neuron limiti shu paytda tiklanadi. */
export function nextUtcMidnight(now: number = Date.now()): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
}

/** Retry-After: soniya yoki HTTP-sana. Noto'g'ri/yo'q — undefined. */
export function parseRetryAfter(value: string | null, now: number = Date.now()): number | undefined {
  if (!value) return undefined;
  const v = value.trim();
  if (/^\d+(\.\d+)?$/.test(v)) return Math.round(Number(v) * 1000);
  const at = Date.parse(v);
  if (Number.isFinite(at)) return Math.max(0, at - now);
  return undefined;
}

/**
 * Xato tanasidan kodlar va xabarlar. Cloudflare shakllari:
 *   {"errors":[{"code":4006,"message":"..."}],"success":false}  (v4 API)
 *   {"error":{"message":"...","code":...,"type":"..."}}          (OpenAI-mos)
 *   {"error":"..."} yoki oddiy matn.
 */
function parseBody(body: string): { codes: number[]; text: string } {
  const codes: number[] = [];
  const parts: string[] = [];
  let json: unknown = null;
  try {
    json = JSON.parse(body);
  } catch {
    /* matn */
  }
  const push = (code: unknown, msg: unknown) => {
    const n = typeof code === "number" ? code : typeof code === "string" && /^\d+$/.test(code) ? Number(code) : NaN;
    if (Number.isFinite(n)) codes.push(n);
    if (typeof msg === "string" && msg) parts.push(msg);
  };
  if (json && typeof json === "object") {
    const j = json as { errors?: unknown; error?: unknown; result?: { errors?: unknown } };
    const list = Array.isArray(j.errors) ? j.errors : Array.isArray(j.result?.errors) ? j.result.errors : [];
    for (const e of list as { code?: unknown; message?: unknown }[]) push(e?.code, e?.message);
    if (typeof j.error === "string") parts.push(j.error);
    else if (j.error && typeof j.error === "object") {
      const e = j.error as { code?: unknown; message?: unknown; type?: unknown };
      push(e.code, e.message);
      if (typeof e.type === "string") parts.push(e.type);
    }
  }
  // Kod matn ichida ham bo'lishi mumkin: "AiError: ... (4006)", "4006: ..." (cfErrorMessage), "code 3036".
  // Faqat shu shakllar — "7000 tokens" kabi oddiy sonlar kod deb olinmaydi.
  for (const m of body.matchAll(/\bcode["'\s:=]*(\d{4,5})\b|\((\d{4,5})\)|(?:^|["\s])(\d{4,5}):\s/gim)) {
    codes.push(Number(m[1] ?? m[2] ?? m[3]));
  }
  return { codes, text: parts.length ? parts.join(" | ") : body };
}

/** Cloudflare xato kodlari (developers.cloudflare.com/workers-ai/platform/errors/, 2026-09-27). */
const CODES = {
  /** Kunlik 10k neuron tugadi. Hujjatda 3036; amalda (va eski javoblarda) 4006. */
  dailyQuota: [3036, 4006],
  /** 3040 — Out of capacity (vaqtincha / rejectIfBusy). */
  capacity: [3040],
  /** Model yo'q / noto'g'ri id: 5007 (400), 3042 (404). */
  noModel: [5007, 3042],
  /** Hisobga shu model ruxsat etilmagan: private (5018, 3041), Llama litsenziyasi (5016), faqat Paid reja (5035). */
  modelForbidden: [5018, 3041, 5016, 5035],
  /** Kalit/hisob: 10000 Authentication error, 9109 invalid token, 3023 account blocked, 7003/7000 noto'g'ri account id/URI. */
  auth: [10000, 9109, 3023, 7003, 7000],
  /** 3006 — Request too large (413). */
  tooLarge: [3006],
  /** 3007 Timeout, 3008 Request aborted (408). */
  timeout: [3007, 3008],
} as const;

const has = (codes: number[], list: readonly number[]) => codes.some((c) => list.includes(c));

/** Rate-limit sarlavhasidan kutish (ms): Retry-After, keyin x-ratelimit-reset* (soniya). */
function retryAfterFrom(headers: Headers): number | undefined {
  const ra = parseRetryAfter(headers.get("retry-after"));
  if (ra !== undefined) return ra;
  for (const h of ["x-ratelimit-reset", "x-ratelimit-reset-requests", "ratelimit-reset"]) {
    const v = parseRetryAfter(headers.get(h));
    if (v !== undefined) return v;
  }
  return undefined;
}

/**
 * HTTP (yoki 200 + oqim ichidagi) xato → tur. docs/MESH.md §2.1 jadvaliga mos:
 * kunlik neuron limiti — quota_exhausted (resetAt = keyingi 00:00 UTC, butun hisob);
 * 3040 capacity — rate_limited (shu model); 404/5007/3042 — unavailable (shu model).
 */
export function classifyCloudflareError(status: number, body: string, headers: Headers, now: number = Date.now()): ClassifiedError {
  const { codes, text } = parseBody(body ?? "");
  const message = `${status} ${text}`.slice(0, 500);

  if (has(codes, CODES.dailyQuota) || /daily free allocation|\bneurons?\b.*(allocation|limit|exceed|used up)|used up your daily/i.test(text)) {
    return { kind: "quota_exhausted", resetAt: nextUtcMidnight(now), scope: "provider", message };
  }
  if (has(codes, CODES.capacity) || /out of capacity|capacity temporarily exceeded/i.test(text)) {
    return { kind: "rate_limited", retryAfterMs: retryAfterFrom(headers) ?? 20_000, scope: "model", message };
  }
  if (status === 429) {
    return { kind: "rate_limited", retryAfterMs: retryAfterFrom(headers), scope: "provider", message };
  }
  if (status === 402 || /insufficient (funds|balance|credit)|billing|payment required|credits? (exhausted|depleted)/i.test(text)) {
    return { kind: "no_credit", scope: "provider", message };
  }
  if (has(codes, CODES.modelForbidden) || /requires? .*(workers )?paid plan|model agreement|not allowed .*private model/i.test(text)) {
    return { kind: "unavailable", scope: "model", message };
  }
  if (status === 401 || has(codes, CODES.auth) || /authentication error|invalid (api )?(token|key)|unauthori[sz]ed|account blocked/i.test(text)) {
    return { kind: "auth", scope: "provider", message };
  }
  // 403 har doim kalit xatosi emas (hisob/model cheklovi, WAF): auth faqat tana shuni aytsa (yuqorida).
  // Aks holda — shu model yopiladi, butun Cloudflare hisobi emas.
  if (status === 403) return { kind: "unavailable", scope: "model", message };
  if (status === 404 || has(codes, CODES.noModel) || /no such model|invalid model|model not found|does not exist|decommissioned|deprecated model/i.test(text)) {
    return { kind: "unavailable", scope: "model", message };
  }
  if (status === 413 || has(codes, CODES.tooLarge) || /context (length|window)|maximum context|too many tokens|too large|exceeds? .*tokens/i.test(text)) {
    return { kind: "context_length", scope: "provider", message };
  }
  if (status === 0 || status === 408 || status >= 500 || has(codes, CODES.timeout)) {
    return { kind: "transient", scope: "provider", message };
  }
  if (status === 400 || status === 405 || status === 422) return { kind: "bad_request", message };
  // 200 + oqim ichidagi noma'lum xato yoki boshqa 4xx (409, 425 ...) — vaqtinchalik deb olamiz.
  return { kind: "transient", scope: "provider", message };
}

/* ------------------------------------------------------------------ */
/* Tana / served                                                       */
/* ------------------------------------------------------------------ */

/** Multimodal qismlardan faqat matn (providers.ts textOf bilan bir xil; cache_control tashlanadi). */
function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((p) => (p && typeof p === "object" && "text" in p ? String((p as { text?: unknown }).text ?? "") : ""))
    .join(" ");
}

/** OpenRouter/OmniRoute'ga xos maydonlar — Cloudflare ularni bilmaydi. */
const FOREIGN_KEYS = ["transforms", "route", "models", "provider", "plugins", "reasoning", "usage", "stream_options"];

export function transformCloudflareBody(body: ChatBody, offer: ModelOffer): ChatBody {
  const out: ChatBody = { ...body, model: offer.wire };
  for (const k of FOREIGN_KEYS) delete out[k];
  out.messages = (body.messages ?? []).map((raw) => {
    const m = (raw ?? {}) as { role?: unknown; content?: unknown; tool_calls?: unknown; tool_call_id?: unknown; name?: unknown };
    const msg: Record<string, unknown> = { role: m.role, content: textOf(m.content) };
    if (offer.caps.tools) {
      if (m.tool_calls !== undefined) msg.tool_calls = m.tool_calls;
      if (m.tool_call_id !== undefined) msg.tool_call_id = m.tool_call_id;
      if (typeof m.name === "string") msg.name = m.name;
    }
    return msg;
  });
  if (!offer.caps.tools) {
    delete out.tools;
    delete out.tool_choice;
  }
  if (!offer.caps.json) delete out.response_format;
  // gpt-oss — faqat oqimsiz (execute bitta JSON'ni bitta bo'lakka aylantiradi: jsonCompletionToChunk).
  if (!offer.caps.stream) out.stream = false;
  return out;
}

/** SSE bo'lagi yoki JSON (OpenAI yoki eski {result:{...}}) dagi model — faqat "@cf/"/"@hf/" id'lari ishonchli. */
export function readCloudflareServedModel(chunkOrJson: unknown): string | null {
  if (!chunkOrJson || typeof chunkOrJson !== "object") return null;
  const root = chunkOrJson as { model?: unknown; result?: { model?: unknown } };
  const model = typeof root.model === "string" ? root.model : typeof root.result?.model === "string" ? root.result.model : null;
  if (!model) return null;
  const bare = model.startsWith(CF_PREFIX) ? model.slice(CF_PREFIX.length) : model;
  return /^@(cf|hf)\//.test(bare) ? bare : null;
}

/* ------------------------------------------------------------------ */
/* Adapter                                                             */
/* ------------------------------------------------------------------ */

export const cloudflareAdapter: ProviderAdapter = {
  id: "cloudflare",
  host: "cloudflare",
  enabled: () => !!(envAccount() && envToken()),
  endpoint: () => ({
    url: `${CF_API_BASE}/accounts/${encodeURIComponent(envAccount())}/ai/v1/chat/completions`,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${envToken()}` },
  }),
  offers: OFFERS,
  limits: {
    rpm: 300,
    dailyUnits: 10_000,
    unit: "neurons",
    perModel: false,
    source:
      "https://developers.cloudflare.com/workers-ai/platform/pricing/ + https://developers.cloudflare.com/workers-ai/platform/limits/ (2026-09-27)",
  },
  classifyError: (status, body, headers) => classifyCloudflareError(status, body, headers),
  resolve: (sovereignId) => {
    const wire = cfSameModel(sovereignId);
    return wire ? (OFFERS.find((o) => o.wire === wire) ?? null) : null;
  },
  transformBody: transformCloudflareBody,
  readServedModel: readCloudflareServedModel,
  displayId: (wire) => cfId(wire.startsWith(CF_PREFIX) ? wire.slice(CF_PREFIX.length) : wire),
};
