import type { Capabilities, ClassifiedError, ModelOffer, ProviderAdapter } from "../types";

/**
 * NVIDIA NIM (build.nvidia.com) — OpenAI-mos endpoint:
 *   POST https://integrate.api.nvidia.com/v1/chat/completions  (Bearer NVIDIA_API_KEY, "nvapi-...").
 * Bepul kalit (NVIDIA Developer Program) — kartasiz; limit butun hisob uchun ~40 RPM (barcha modellar
 * bitta bucket), kunlik token limiti e'lon qilinmagan. Eski hisoblarda "credits" (1 so'rov ≈ 1 kredit)
 * tugasa 402 qaytadi. Ba'zi model oilalari alohida ro'yxatdan o'tishni talab qiladi — shunda 403.
 *
 * Model id'lari https://docs.api.nvidia.com/nim/reference/llm-apis dan 2026-09-27 da olingan.
 * sovereignIds'ga faqat AYNAN shu og'irliklardagi id'lar yoziladi (docs/MESH.md §2).
 */

const NVIDIA_BASE = "https://integrate.api.nvidia.com/v1";

/** Hamma NIM chat modellari: SSE stream, OpenAI tool-calling, response_format (json). Vision yo'q. */
const TEXT_TOOLS: Capabilities = { stream: true, tools: true, vision: false, json: true };

/** Auto navbati / region ekvivalentlaridagi OmniRoute id'lari (auto-pools.ts, region.ts REGION_SAFE). */
const OR_NEMOTRON_SUPER = "openrouter/nvidia/nemotron-3-super-120b-a12b:free";
const OR_NEMOTRON_ULTRA = "openrouter/nvidia/nemotron-3-ultra-550b-a55b:free";
const OR_DEEPSEEK_FLASH = "openrouter/deepseek/deepseek-v4-flash";
const OR_GLM_52 = "openrouter/z-ai/glm-5.2";

export const NVIDIA_OFFERS: ModelOffer[] = [
  /* ---- Tekin sinf (tekin tarifga ham o'rinbosar bo'la oladi) ---- */
  {
    // Katalog: llama-3.3-free (tekin zanjir) va llama-3-3-70b (starter) — ikkalasi bir xil og'irliklar.
    sovereignIds: [
      "llama-3.3-free",
      "meta-llama/llama-3.3-70b-instruct:free",
      "llama-3-3-70b",
      "meta-llama/llama-3.3-70b-instruct",
    ],
    wire: "meta/llama-3.3-70b-instruct",
    class: "free",
    cost: "free",
    caps: TEXT_TOOLS,
  },
  {
    sovereignIds: ["llama-3-1-70b", "meta-llama/llama-3.1-70b-instruct"],
    wire: "meta/llama-3.1-70b-instruct",
    class: "free",
    cost: "free",
    caps: TEXT_TOOLS,
  },
  {
    sovereignIds: ["llama-3.1-8b:free", "meta-llama/llama-3.1-8b-instruct"],
    wire: "meta/llama-3.1-8b-instruct",
    class: "free",
    cost: "free",
    caps: TEXT_TOOLS,
    // Kichik model: o'rinbosar sifatida 70B'lardan keyin tursin (eval natijasi bilan almashtirilsin).
    quality: 0.5,
  },
  {
    sovereignIds: ["nemotron-ultra-free", "nvidia/nemotron-3-ultra-550b-a55b:free", OR_NEMOTRON_ULTRA],
    wire: "nvidia/nemotron-3-ultra-550b-a55b",
    class: "free",
    cost: "free",
    caps: TEXT_TOOLS,
  },
  {
    sovereignIds: [OR_NEMOTRON_SUPER, "nvidia/nemotron-3-super-120b-a12b:free"],
    wire: "nvidia/nemotron-3-super-120b-a12b",
    class: "free",
    cost: "free",
    caps: TEXT_TOOLS,
  },
  {
    // OpenRouter slug'i hajmsiz ("nemotron-3.5-lightning"); NIM'da to'liq nomi — bitta model.
    sovereignIds: ["nemotron-lightning-free", "nvidia/nemotron-3.5-lightning:free"],
    wire: "nvidia/nemotron-3.5-lightning-30b-a3b",
    class: "free",
    cost: "free",
    caps: TEXT_TOOLS,
  },
  {
    // Katalogdagi "nemotron-nano-free" — OMNI (multimodal) varianti, bu esa matnli Nano:
    // boshqa model, shuning uchun faqat sinf bo'yicha o'rinbosar.
    sovereignIds: [],
    wire: "nvidia/nemotron-3-nano-30b-a3b",
    class: "free",
    cost: "free",
    caps: TEXT_TOOLS,
    quality: 0.55,
  },
  {
    sovereignIds: ["groq/openai/gpt-oss-120b", "openai/gpt-oss-120b"],
    wire: "openai/gpt-oss-120b",
    class: "free",
    cost: "free",
    caps: TEXT_TOOLS,
  },
  {
    sovereignIds: ["groq/openai/gpt-oss-20b", "openai/gpt-oss-20b"],
    wire: "openai/gpt-oss-20b",
    class: "free",
    cost: "free",
    caps: TEXT_TOOLS,
    quality: 0.6,
  },

  /* ---- Pullik katalog modellari: NIM'da tekin, lekin o'rinbosar sifatida tarif saqlanadi ---- */
  {
    // Katalog deepseek-v4-flash = "-0731" sanali versiya; NIM'da aynan shu sana bor.
    sovereignIds: ["deepseek-v4-flash", "deepseek/deepseek-v4-flash-0731"],
    wire: "deepseek-ai/deepseek-v4-flash-0731",
    class: "fast",
    cost: "free",
    caps: TEXT_TOOLS,
    minTier: "starter",
  },
  {
    // Sanasiz "latest" — Auto navbatidagi OpenRouter id bilan bir xil (sana ko'rsatilmagan).
    sovereignIds: [OR_DEEPSEEK_FLASH, "deepseek/deepseek-v4-flash"],
    wire: "deepseek-ai/deepseek-v4-flash",
    class: "fast",
    cost: "free",
    caps: TEXT_TOOLS,
    minTier: "starter",
  },
  {
    // Katalog deepseek-v4-pro = "-0813"; NIM sanasiz id qaytaradi — versiya tasdiqlanmagan,
    // shuning uchun katalog id'si bilan "sameModel" deb e'lon qilinmaydi.
    sovereignIds: ["deepseek/deepseek-v4-pro"],
    wire: "deepseek-ai/deepseek-v4-pro",
    class: "flagship",
    cost: "free",
    caps: TEXT_TOOLS,
    minTier: "pro",
  },
  {
    sovereignIds: ["glm-5-3", "z-ai/glm-5.3"],
    wire: "z-ai/glm-5.3",
    class: "flagship",
    cost: "free",
    caps: TEXT_TOOLS,
    minTier: "pro",
  },
  {
    sovereignIds: ["glm-5-3-flash", "z-ai/glm-5.3-flash"],
    wire: "z-ai/glm-5.3-flash",
    class: "fast",
    cost: "free",
    caps: TEXT_TOOLS,
    minTier: "starter",
  },
  {
    // region.ts REGION_EQUIVALENTS: GLM 5.2 flagship o'rinbosari starter tarifdan.
    sovereignIds: ["glm-5-2", "z-ai/glm-5.2", OR_GLM_52],
    wire: "z-ai/glm-5.2",
    class: "flagship",
    cost: "free",
    caps: TEXT_TOOLS,
    minTier: "starter",
  },
];

/* ------------------------------------------------------------------ */
/* Xato tasnifi (docs/MESH.md §2.1)                                    */
/* ------------------------------------------------------------------ */

/** Xom xabar faqat server logi uchun — baribir kalitga o'xshash satrlarni yashiramiz. */
function scrub(body: string): string {
  return body.replace(/nvapi-[A-Za-z0-9_-]+/g, "nvapi-***").replace(/Bearer\s+\S+/gi, "Bearer ***").slice(0, 300);
}

/** "30", "1.5", "2m30s", "750ms", "12.5s" → ms. Tushunarsiz — undefined. */
export function parseDurationMs(raw: string | null | undefined, now = Date.now()): number | undefined {
  if (!raw) return undefined;
  const s = raw.trim();
  if (!s) return undefined;
  if (/^\d+(\.\d+)?$/.test(s)) return Math.max(0, Math.round(Number(s) * 1000));
  const re = /(\d+(?:\.\d+)?)(ms|h|m|s)/g;
  let total = 0;
  let matched = "";
  for (let m = re.exec(s); m; m = re.exec(s)) {
    const n = Number(m[1]);
    total += m[2] === "ms" ? n : m[2] === "s" ? n * 1000 : m[2] === "m" ? n * 60_000 : n * 3_600_000;
    matched += m[0];
  }
  if (matched && matched === s) return Math.round(total);
  // Retry-After HTTP-date shakli.
  const at = Date.parse(s);
  return Number.isFinite(at) ? Math.max(0, at - now) : undefined;
}

/** Retry-After / x-ratelimit-reset-* sarlavhasi yoki tanadagi "retry after N seconds". */
function retryAfterFrom(headers: Headers, body: string, now: number): number | undefined {
  const fromHeader =
    parseDurationMs(headers.get("retry-after"), now) ??
    parseDurationMs(headers.get("x-ratelimit-reset-requests"), now) ??
    parseDurationMs(headers.get("x-ratelimit-reset-tokens"), now) ??
    parseDurationMs(headers.get("x-ratelimit-reset"), now);
  if (fromHeader !== undefined) return fromHeader;
  const m = /retry (?:after|in) (\d+(?:\.\d+)?)\s*(ms|s|sec|seconds?)?/i.exec(body);
  if (!m) return undefined;
  return m[2] === "ms" ? Math.round(Number(m[1])) : Math.round(Number(m[1]) * 1000);
}

/** Keyingi 00:00 UTC (epoch ms) — kunlik kvota tiklanishi. */
export function nextUtcMidnight(now = Date.now()): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
}

/** Tanadan inson o'qiydigan xabar: NIM problem+json {title, detail}, vLLM {message} yoki {error:{message}}. */
function bodyText(body: string): string {
  try {
    const j = JSON.parse(body) as Record<string, unknown>;
    const err = (j.error && typeof j.error === "object" ? j.error : j) as Record<string, unknown>;
    const parts = [err.title, err.detail, err.message, typeof j.error === "string" ? j.error : undefined, err.type, err.code];
    const text = parts.filter((p) => typeof p === "string" || typeof p === "number").join(" ");
    return text || body;
  } catch {
    return body;
  }
}

const RE_CONTEXT = /context length|context window|maximum context|max(imum)?[_ ]?(model[_ ]?)?len|too many tokens|prompt is too long|exceeds? the (model|maximum)|input.*too long/i;
const RE_CREDIT = /credits?|can only afford|insufficient|billing|balance|payment required/i;
const RE_DAILY = /per[ -]day|daily|\bRPD\b|\bTPD\b/i;
const RE_MODEL_GONE = /model.*(not found|does not exist|not supported|unknown)|(not found|unknown|invalid) model|decommissioned|deprecated|end[- ]of[- ]life|no longer (available|supported)|function.*not found/i;
const RE_KEY = /api[ _-]?key|authenticat|unauthori[sz]ed|token (is )?(invalid|expired)|expired (key|token)/i;

export function classifyNvidiaError(status: number, body: string, headers: Headers, now = Date.now()): ClassifiedError {
  const text = bodyText(body ?? "");
  const message = scrub(text || `HTTP ${status}`);

  // Tarmoq/taymaut va server tomoni (NVCF navbati to'lganda 503/504 ham shu yerda).
  if (status === 0 || status === 408 || status >= 500) return { kind: "transient", message };

  if (status === 402 || (status !== 429 && RE_CREDIT.test(text) && !RE_CONTEXT.test(text))) {
    const afford = /can only afford (\d+)/i.exec(text);
    return { kind: "no_credit", message, ...(afford ? { affordTokens: Number(afford[1]) } : {}) };
  }

  if (status === 429) {
    if (RE_CREDIT.test(text) && !/rate/i.test(text)) return { kind: "no_credit", message };
    if (RE_DAILY.test(text)) {
      // NIM kunlik kvotani e'lon qilmaydi; bo'lsa — keyingi 00:00 UTC (yoki sarlavhadagi vaqt).
      const after = retryAfterFrom(headers, text, now);
      return { kind: "quota_exhausted", resetAt: after !== undefined ? now + after : nextUtcMidnight(now), message };
    }
    // ~40 RPM butun hisob uchun (barcha modellar bitta bucket) → scope "provider".
    const retryAfterMs = retryAfterFrom(headers, text, now);
    return { kind: "rate_limited", scope: "provider", message, ...(retryAfterMs !== undefined ? { retryAfterMs } : {}) };
  }

  if (status === 413 || RE_CONTEXT.test(text)) return { kind: "context_length", message };

  if (status === 401) return { kind: "auth", message };
  if (status === 403) {
    // 403 kalit xatosi bo'lishi ham, model oilasi uchun alohida ro'yxatdan o'tish talab qilinishi ham
    // mumkin (build.nvidia.com). Kalitga oid so'z bo'lmasa — faqat shu model yopiladi.
    return RE_KEY.test(text) ? { kind: "auth", message } : { kind: "unavailable", scope: "model", message };
  }

  if (status === 404 || status === 410 || RE_MODEL_GONE.test(text)) return { kind: "unavailable", scope: "model", message };

  if (status >= 400 && status < 500) return { kind: "bad_request", message };

  // status 200 + oqim ichidagi xato, tanib bo'lmadi — qisqa qayta urinish/keyingi nomzod.
  return { kind: "transient", message };
}

/** SSE bo'lagi yoki to'liq JSON javobidagi `model` maydoni (NIM wire id'ni qaytaradi). */
export function readNvidiaServedModel(chunkOrJson: unknown): string | null {
  let v: unknown = chunkOrJson;
  if (typeof v === "string") {
    const s = v.trim().replace(/^data:\s*/, "");
    if (!s.startsWith("{")) return null;
    try {
      v = JSON.parse(s);
    } catch {
      return null;
    }
  }
  if (!v || typeof v !== "object") return null;
  const model = (v as { model?: unknown }).model;
  return typeof model === "string" && model.trim() ? model.trim() : null;
}

export const nvidiaAdapter: ProviderAdapter = {
  id: "nvidia",
  host: "nvidia",
  enabled: () => !!process.env.NVIDIA_API_KEY?.trim(),
  endpoint: () => ({
    url: `${NVIDIA_BASE}/chat/completions`,
    headers: {
      Authorization: `Bearer ${(process.env.NVIDIA_API_KEY ?? "").trim()}`,
      "Content-Type": "application/json",
    },
  }),
  offers: NVIDIA_OFFERS,
  limits: {
    rpm: 40,
    unit: "requests",
    // Limit butun hisob uchun (barcha modellar bitta bucket), kunlik limit e'lon qilinmagan (R = 1).
    perModel: false,
    source:
      "https://forums.developer.nvidia.com/t/request-for-nvidia-build-api-rate-limit-increase-40-rpm-to-200-rpm/376729 ; " +
      "https://freellm.net/providers/nvidia-nim (2026-09-27) — rasmiy docs.api.nvidia.com yagona kvota e'lon qilmaydi",
  },
  classifyError: (status, body, headers) => classifyNvidiaError(status, body, headers),
  readServedModel: readNvidiaServedModel,
};
