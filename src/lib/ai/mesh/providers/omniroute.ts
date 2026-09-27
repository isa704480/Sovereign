import { regionClassOf } from "../../region";
import type { ClassifiedError, Limits, ModelOffer, OfferClass, OfferCost, PlanTier, ProviderAdapter } from "../types";

/**
 * OmniRoute adapteri — o'z serverimizdagi (Railway) OpenAI-mos shlyuz
 * (github.com/diegosouzapw/OmniRoute). Ichida o'zi 1750+ katalog modelini turli upstream
 * provayderlarga (Groq, OpenRouter, Mistral, NVIDIA ...) yo'naltiradi va "auto/*" kombolarini
 * beradi — shuning uchun `aggregator: true` va served model `readServedModel` bilan tekshiriladi.
 *
 * Env: OMNIROUTE_BASE_URL (".../v1") + OMNIROUTE_API_KEY (ikkalasi ham — providers.ts
 * providerAvailable("omniroute") / omniRouteConfigured() bilan bir xil). OMNIROUTE_MODEL —
 * ixtiyoriy standart kombo (web: "auto/gemini", CLI: "auto/coding:free"); ro'yxatda bo'lmasa
 * dinamik offer sifatida qo'shiladi.
 *
 * Xato doirasi (scope): OmniRoute orqasida ko'p upstream bor. Kredit (402), 429/kvota, 404 va
 * upstream kalit xatosi faqat SHU modelning upstream'iga tegishli ("model") — "groq/..." ishlashda
 * davom etadi, "openrouter/..." krediti tugagan bo'lsa ham. Butun OmniRoute ("provider") faqat:
 * tarmoq/5xx, "resource pressure" 503 (restart kerak), va OmniRoute'ning o'z API kaliti xatosi.
 *
 * Watchdog: `onFailure` → healOmniRouteIfStuck (faqat 503 "resource pressure"). classifyError PURE.
 */

/* ------------------------------------------------------------------ */
/* Offers                                                              */
/* ------------------------------------------------------------------ */

const TEXT = { stream: true, tools: false, vision: false, json: true } as const;
const TOOLS = { stream: true, tools: true, vision: false, json: true } as const;
const TOOLS_VISION = { stream: true, tools: true, vision: true, json: true } as const;

/**
 * Statik takliflar — codebase'da OmniRoute orqali ishlatiladigan va 2026-09-23 da bittalab
 * sinalgan id'lar (auto-pools.ts, region.ts REGION_SAFE, CLI route, providers.ts omnirouteFirst).
 * `sovereignIds` ga faqat AYNAN shu og'irliklar kiradi (katalog id + providerModel + OmniRoute id).
 * "auto/*" kombolari — o'z id'si bilan (qaysi modelga borishini OmniRoute hal qiladi; served.ts
 * isSubstitution ularni almashtirish demaydi). tools=true — faqat codebase'da tool-calling
 * bilan sinalganlar (CLI: auto/coding:free, REGION_SAFE DeepSeek/Qwen/GLM/Kimi, Codestral).
 */
export const OMNIROUTE_OFFERS: readonly ModelOffer[] = [
  // --- auto/* kombolari (tekin) ---
  // CLI standarti: kod/tool'ga kuchli tekin kombo (sinovda gpt-oss-120b, tool-calling).
  { sovereignIds: ["auto/coding:free"], wire: "auto/coding:free", class: "code", cost: "free", caps: TOOLS },
  { sovereignIds: ["auto/best-free"], wire: "auto/best-free", class: "free", cost: "free", caps: TEXT },
  { sovereignIds: ["auto/glm"], wire: "auto/glm", class: "free", cost: "free", caps: TEXT },
  { sovereignIds: ["auto/minimax"], wire: "auto/minimax", class: "free", cost: "free", caps: TEXT },
  // Web standarti (providers.ts omnirouteFirst: OMNIROUTE_MODEL ?? "auto/gemini").
  { sovereignIds: ["auto/gemini"], wire: "auto/gemini", class: "free", cost: "free", caps: TEXT },

  // --- OpenRouter tekin endpointlari (OmniRoute'ning OpenRouter ulanishi orqali) ---
  {
    sovereignIds: ["openrouter/nvidia/nemotron-3-super-120b-a12b:free", "nvidia/nemotron-3-super-120b-a12b:free"],
    wire: "openrouter/nvidia/nemotron-3-super-120b-a12b:free",
    class: "free",
    cost: "free",
    caps: TEXT,
  },
  {
    // Katalog "nemotron-ultra-free" (config/models.ts) — aynan shu og'irliklar.
    sovereignIds: ["openrouter/nvidia/nemotron-3-ultra-550b-a55b:free", "nemotron-ultra-free", "nvidia/nemotron-3-ultra-550b-a55b:free"],
    wire: "openrouter/nvidia/nemotron-3-ultra-550b-a55b:free",
    class: "free",
    cost: "free",
    caps: TEXT,
  },
  {
    sovereignIds: ["openrouter/google/gemma-4-31b-it:free", "google/gemma-4-31b-it:free"],
    wire: "openrouter/google/gemma-4-31b-it:free",
    class: "free",
    cost: "free",
    caps: TEXT,
  },

  // --- To'g'ridan-to'g'ri kalit bo'lmasa ham OmniRoute ulanishi orqali (hostIdAvailable) ---
  {
    // Katalog "qwen3-8-27b" (qwen/qwen3.8-27b) bilan bir xil ochiq og'irliklar; Groq tekin kvotasi.
    sovereignIds: ["groq/qwen/qwen3.8-27b", "qwen3-8-27b", "qwen/qwen3.8-27b"],
    wire: "groq/qwen/qwen3.8-27b",
    class: "fast",
    cost: "free",
    minTier: "free",
    caps: TOOLS,
  },
  {
    sovereignIds: ["groq/openai/gpt-oss-120b", "openai/gpt-oss-120b"],
    wire: "groq/openai/gpt-oss-120b",
    class: "fast",
    cost: "free",
    minTier: "free",
    caps: TOOLS,
  },
  {
    // Mistral bepul (Experiment) kvotasi; CLI'da tool-calling ishonchli.
    sovereignIds: ["mistral/codestral-latest", "mistralai/codestral-latest"],
    wire: "mistral/codestral-latest",
    class: "code",
    cost: "free",
    caps: TOOLS,
  },

  // --- OpenRouter pullik (kredit) modellari — region.ts REGION_EQUIVALENTS tariflari bilan ---
  {
    sovereignIds: ["openrouter/deepseek/deepseek-v4-flash", "deepseek/deepseek-v4-flash"],
    wire: "openrouter/deepseek/deepseek-v4-flash",
    class: "fast",
    cost: "cheap",
    minTier: "starter",
    caps: TOOLS,
  },
  {
    // Katalog "glm-5-2" (z-ai/glm-5.2, pro) — aynan shu model; o'rinbosar sifatida starter (region.ts).
    sovereignIds: ["openrouter/z-ai/glm-5.2", "glm-5-2", "z-ai/glm-5.2"],
    wire: "openrouter/z-ai/glm-5.2",
    class: "flagship",
    cost: "cheap",
    minTier: "starter",
    caps: TOOLS,
  },
  {
    sovereignIds: ["openrouter/moonshotai/kimi-k2.6", "moonshotai/kimi-k2.6"],
    wire: "openrouter/moonshotai/kimi-k2.6",
    class: "flagship",
    cost: "paid",
    minTier: "pro",
    caps: TOOLS,
  },
  {
    sovereignIds: ["openrouter/google/gemini-2.5-flash", "google/gemini-2.5-flash"],
    wire: "openrouter/google/gemini-2.5-flash",
    class: "fast",
    cost: "cheap",
    minTier: "starter",
    caps: TOOLS_VISION,
  },
];

/** OmniRoute katalogidagi hostlar orasida tekin kvotali (to'g'ridan-to'g'ri kalit tarifi bepul) upstreamlar. */
const FREE_HOSTS = new Set(["groq", "cerebras", "sambanova", "nvidia", "mistral", "cloudflare", "aihorde", "pollinations"]);

/** OpenRouter uslubidagi model ishlab chiqaruvchi nomlari (host emas) — katalog providerModel prefikslari. */
const OPENROUTER_VENDORS = new Set([
  "anthropic", "openai", "google", "meta-llama", "mistralai", "x-ai", "z-ai", "qwen", "deepseek", "nvidia",
  "moonshotai", "perplexity", "minimax", "cohere", "microsoft", "amazon", "xiaomi",
]);

/** OmniRoute katalog id'si: "auto", "auto/<kombo>" yoki "host/vendor/model" / "host/model". */
export function isOmniRouteId(id: string): boolean {
  const s = (id ?? "").trim();
  if (!s || /\s/.test(s) || s.length > 200) return false;
  if (s === "auto" || s.startsWith("auto/")) return true;
  // "cloudflare/@cf/..." OmniRoute'da yo'q (providers.ts hostIdAvailable) — Cloudflare adapteriniki.
  if (s.startsWith("cloudflare/")) return false;
  return s.includes("/");
}

function costOf(id: string, cls: OfferClass): OfferCost {
  if (id === "auto" || id.startsWith("auto/") || /:free$/i.test(id)) return "free";
  const host = id.split("/")[0].toLowerCase();
  if (FREE_HOSTS.has(host)) return "free";
  return cls === "flagship" ? "paid" : "cheap";
}

const COST_TIER: Record<OfferCost, PlanTier> = { free: "free", cheap: "starter", paid: "pro" };

/**
 * Statik ro'yxatda yo'q OmniRoute id uchun dinamik taklif (foydalanuvchi katalogdan tanlagan
 * model yoki OMNIROUTE_MODEL). Imkoniyatlar noma'lum — tools/vision false (CLI tool so'rovi uni
 * tanlamaydi; web chat uchun yetarli). Tarif: katalog gating chat route'da (Pro+) tekshiriladi.
 */
export function resolveOmniRoute(sovereignId: string): ModelOffer | null {
  const id = (sovereignId ?? "").trim();
  const known = OMNIROUTE_OFFERS.find((o) => o.sovereignIds.includes(id) || o.wire === id);
  if (known) return known;
  if (!isOmniRouteId(id)) return null;
  // "vendor/model" (katalog providerModel: "anthropic/claude-opus-5") — OpenRouter adapteriniki;
  // OmniRoute'ga eski kod ham yubormagan (pullik OpenRouter orqali ketib, xarajat oshardi).
  const parts = id.split("/");
  if (parts.length === 2 && OPENROUTER_VENDORS.has(parts[0].toLowerCase())) return null;
  const cls: OfferClass = regionClassOf(id);
  const cost = costOf(id, cls);
  return { sovereignIds: [id], wire: id, class: cls, cost, minTier: COST_TIER[cost], caps: TEXT };
}

/* ------------------------------------------------------------------ */
/* Limits                                                              */
/* ------------------------------------------------------------------ */

/**
 * OmniRoute o'zi qat'iy limit qo'ymaydi (self-hosted; operator sozlagan per-key RPM lease'lar
 * bundan mustasno — bizda sozlanmagan). Haqiqiy limitlar har upstream modelning o'zida
 * (Groq RPD/TPD, OpenRouter :free kunlik so'rovlari, kredit) — shuning uchun perModel:
 * sog'liq/usage kaliti mesh:*:omniroute:<wire>. dailyUnits noma'lum → scheduler R = 1.
 */
export const OMNIROUTE_LIMITS: Limits = {
  perModel: true,
  unit: "requests",
  source:
    "https://github.com/diegosouzapw/OmniRoute (README: per-key RPM leases, 3-layer failover; docs/openapi.yaml: 401/502 'All upstream providers failed') (2026-09-27)",
};

/* ------------------------------------------------------------------ */
/* classifyError                                                       */
/* ------------------------------------------------------------------ */

type ErrBody = {
  error?: { message?: unknown; code?: unknown; type?: unknown; metadata?: { raw?: unknown } } | string;
  message?: unknown;
  detail?: unknown;
  errors?: { message?: unknown; code?: unknown }[];
};

/** Tana → xom xabar va (bo'lsa) tanadagi HTTP kodi (OpenRouter uslubi: error.code 402/429 ...). */
function parseBody(body: string): { message: string; code: number | null; type: string } {
  const text = (body ?? "").trim();
  let message = text;
  let code: number | null = null;
  let type = "";
  try {
    const j = JSON.parse(text) as ErrBody;
    const e = j?.error;
    if (typeof e === "string") message = e;
    else if (e && typeof e === "object") {
      const raw = e.metadata?.raw;
      const msg = typeof e.message === "string" ? e.message : "";
      // Upstream xom xabari ko'proq ma'lumot beradi ("can only afford", "per day" ...).
      message = [msg, typeof raw === "string" ? raw : ""].filter(Boolean).join(" | ") || text;
      if (typeof e.code === "number" && e.code >= 100 && e.code < 600) code = e.code;
      else if (typeof e.code === "string") {
        if (/^\d{3}$/.test(e.code)) code = Number(e.code);
        type = e.code;
      }
      if (typeof e.type === "string") type = [type, e.type].filter(Boolean).join(" ");
    } else if (Array.isArray(j?.errors) && j.errors.length) {
      const first = j.errors[0];
      message = [first?.code, first?.message].filter((x) => typeof x === "string" || typeof x === "number").join(": ") || text;
    } else if (typeof j?.message === "string") message = j.message;
    else if (typeof j?.detail === "string") message = j.detail;
  } catch {
    /* JSON emas (Railway HTML sahifasi yoki bo'sh tana) — xom matn */
  }
  return { message, code, type };
}

/** "2m59.56s", "7.66s", "120ms", "1h2m" (Groq x-ratelimit-reset-*) → ms. */
function parseDuration(v: string): number | null {
  const s = v.trim();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(Number(s) * 1000);
  const re = /(\d+(?:\.\d+)?)(ms|h|m|s)/g;
  let total = 0;
  let matched = false;
  for (const m of s.matchAll(re)) {
    matched = true;
    const n = Number(m[1]);
    total += m[2] === "ms" ? n : m[2] === "s" ? n * 1000 : m[2] === "m" ? n * 60_000 : n * 3_600_000;
  }
  return matched ? Math.round(total) : null;
}

/** Retry-After (soniya yoki HTTP sana), retry-after-ms, x-ratelimit-reset-requests/-tokens → ms. */
function retryAfterMs(headers: Headers, now: number): number | undefined {
  const ms = headers.get("retry-after-ms");
  if (ms && /^\d+(\.\d+)?$/.test(ms.trim())) return Math.max(0, Math.round(Number(ms)));
  const ra = headers.get("retry-after");
  if (ra) {
    if (/^\d+(\.\d+)?$/.test(ra.trim())) return Math.max(0, Math.round(Number(ra) * 1000));
    const at = Date.parse(ra);
    if (Number.isFinite(at)) return Math.max(0, at - now);
  }
  const candidates = [headers.get("x-ratelimit-reset-requests"), headers.get("x-ratelimit-reset-tokens")]
    .map((v) => (v ? parseDuration(v) : null))
    .filter((v): v is number => v !== null);
  return candidates.length ? Math.max(...candidates) : undefined;
}

/** Keyingi 00:00 UTC (kunlik tekin kvotalar — OpenRouter :free, Cloudflare neuron — shu paytda tiklanadi). */
export function nextUtcMidnight(now: number): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
}

/** Kunlik kvota tiklanish vaqti: x-ratelimit-reset (epoch ms/s yoki soniya), Groq *-reset-*, aks holda 00:00 UTC. */
function quotaResetAt(headers: Headers, now: number): number {
  const raw = headers.get("x-ratelimit-reset")?.trim();
  if (raw && /^\d+(\.\d+)?$/.test(raw)) {
    const n = Number(raw);
    if (n > 1e12) return Math.round(n); // epoch ms (OpenRouter)
    if (n > 1e9) return Math.round(n * 1000); // epoch s
    return now + Math.round(n * 1000); // soniya
  }
  const after = retryAfterMs(headers, now);
  // Kunlik kvotada qisqa Retry-After (masalan RPM oynasi) ishonchsiz — faqat uzoq bo'lsa olamiz.
  if (after !== undefined && after >= 10 * 60_000) return now + after;
  return nextUtcMidnight(now);
}

/** 429 / rate-limit signali: kunlik kvota (resetAt) yoki qisqa oyna (retryAfterMs). Scope — shu model upstream'i. */
function rateOrQuota(text: string, headers: Headers, now: number, message: string): ClassifiedError {
  if (RE_DAILY.test(text)) return { kind: "quota_exhausted", scope: "model", resetAt: quotaResetAt(headers, now), message };
  return { kind: "rate_limited", scope: "model", retryAfterMs: retryAfterMs(headers, now), message };
}

const RE_PRESSURE = /resource.pressure/i;
const RE_CONTEXT = /context.length|maximum context|context window|too many tokens|prompt is too long|reduce the length|input is too long|context_length_exceeded/i;
const RE_CREDIT = /can only afford|insufficient.(credit|balance|fund|quota)|\bcredits?\b|billing|payment required|\bbalance\b|insufficient_quota/i;
const RE_DAILY = /per.day|daily|\brpd\b|\btpd\b|free-models-per-day|quota.exceeded|exceeded your (current )?quota|\b4006\b|neurons?|daily free allocation/i;
const RE_RATE = /rate.?limit|too many requests|rate_limit_exceeded|throttl|slow down|\b429\b/i;
const RE_UNAVAILABLE =
  /model.{0,40}(not found|does not exist|not exist|unavailable|not available|not supported|is not a valid)|no (such|matching) model|unknown model|invalid model|decommissioned|deprecated and (no longer|removed)|no (active |available )?(credentials?|connections?|accounts?|providers?)\b/i;
const RE_REGION = /unsupported.(country|region)|not available in your (country|region)|country, region, or territory/i;
const RE_NO_TOOLS = /does not support (tools|tool|function)|tool.{0,20}not supported|tools? (are|is) not supported|function calling is not/i;
/** Upstream (OmniRoute orqasidagi provayder) haqida gap — OmniRoute'ning o'z kaliti emas. */
const RE_UPSTREAM = /upstream|provider|connection|account|openrouter|groq|mistral|nvidia|cerebras|sambanova|gemini|anthropic|openai/i;

/**
 * OmniRoute xatosini tasniflaydi (docs/MESH.md §2.1 jadvali + OmniRoute xususiyatlari). PURE:
 * `now` — deterministik test uchun. Adapter `classifyError` = shu funksiya (now = Date.now()).
 */
export function classifyOmniRouteError(status: number, body: string, headers: Headers, now: number): ClassifiedError {
  const parsed = parseBody(body);
  // Oqim ichidagi xato (HTTP 200 + tana) — tanadagi kod hal qiladi.
  const code = status === 200 || status === 0 ? (parsed.code ?? status) : status;
  const text = `${parsed.type} ${parsed.message}`;
  const message = (parsed.message || `${status}`).slice(0, 300);

  // Tarmoq xatosi / taymaut — butun OmniRoute (Railway) javob bermayapti.
  if (code === 0) return { kind: "transient", scope: "provider", message };

  // "Resource pressure" — OmniRoute o'zi tiqilgan (restart tuzatadi): butun provayder.
  if (RE_PRESSURE.test(text)) {
    return { kind: "transient", scope: "provider", retryAfterMs: retryAfterMs(headers, now), message };
  }

  if (code === 413 || RE_CONTEXT.test(text)) return { kind: "context_length", message };

  // 429 avval: OpenRouter "free-models-per-day ... Add 10 credits to unlock" — bu kvota, kredit xatosi emas.
  if (code === 429) return rateOrQuota(text, headers, now, message);

  if (code === 402 || RE_CREDIT.test(text)) {
    const afford = /can only afford (\d+)/i.exec(text);
    return {
      kind: "no_credit",
      // Kredit upstream hisobiniki (masalan OpenRouter) — OmniRoute'ning boshqa upstreamlari ishlaydi.
      scope: "model",
      ...(afford ? { affordTokens: Number(afford[1]) } : {}),
      message,
    };
  }

  if (RE_REGION.test(text)) return { kind: "unavailable", scope: "model", message };

  if (code === 401 || code === 403) {
    // OmniRoute'ning o'z kaliti (OMNIROUTE_API_KEY) — butun provayder; upstream ulanish kaliti — faqat shu model.
    return { kind: "auth", scope: RE_UPSTREAM.test(text) ? "model" : "provider", message };
  }

  if (code === 404 || RE_UNAVAILABLE.test(text)) return { kind: "unavailable", scope: "model", message };

  // Model tool-calling'ni qo'llamaydi — imkoniyat mos kelmadi (model yo'q emas): keyingi nomzod,
  // sog'liq o'zgarmaydi (6 soat hamma uchun blok yo'q), scheduler xotirada tools=false deb o'rganadi.
  if ((code === 400 || code === 422) && RE_NO_TOOLS.test(text)) {
    return { kind: "unsupported", scope: "model", capability: "tools", message };
  }

  // OmniRoute barcha akkauntlar band bo'lsa 502/503 bilan ham qaytarishi mumkin; oqim ichida (200) ham.
  if (RE_RATE.test(text) && (code === 502 || code === 503 || code >= 400 || status === 200)) {
    return rateOrQuota(text, headers, now, message);
  }

  if (code === 400 || code === 422) return { kind: "bad_request", message };

  if (code === 408 || code === 409 || code === 425 || code >= 500) {
    // 502 "All upstream providers failed" (OmniRoute JSON) — shu model upstreamlari yiqildi;
    // JSON'siz 502/503/504 (Railway proksi: "Application failed to respond") — butun OmniRoute.
    const omniUpstream = code === 502 && parsed.message !== body.trim() && RE_UPSTREAM.test(text);
    return { kind: "transient", scope: omniUpstream ? "model" : "provider", retryAfterMs: retryAfterMs(headers, now), message };
  }

  // Oqim ichidagi kodsiz xato (upstream uzildi) — shu model upstream'ining vaqtinchalik nosozligi.
  if (code === 200) return { kind: "transient", scope: "model", message };

  return { kind: "bad_request", message };
}

/* ------------------------------------------------------------------ */
/* Served model                                                      */
/* ------------------------------------------------------------------ */

/** SSE bo'lagi yoki JSON javobdagi `model` (OmniRoute upstream nomini qaytaradi). "auto/*" aks-sadosi — null. */
export function readOmniServedModel(chunkOrJson: unknown): string | null {
  const m = (chunkOrJson as { model?: unknown } | null)?.model;
  if (typeof m !== "string") return null;
  const s = m.trim().slice(0, 120);
  if (!s || s === "auto" || s.startsWith("auto/")) return null;
  return s;
}

/**
 * Javob sarlavhalaridan haqiqiy model (docs/openapi.yaml: X-OmniRoute-Model "Resolved model",
 * X-OmniRoute-Provider "Resolved provider alias"). Shartnomada sarlavha kanali yo'q — execute
 * xohlasa shu yordamchini chaqiradi (hisobotdagi "contract gap").
 */
export function omniServedFromHeaders(headers: Headers): string | null {
  const model = headers.get("x-omniroute-model")?.trim();
  if (!model || model.startsWith("auto")) return null;
  const provider = headers.get("x-omniroute-provider")?.trim();
  const id = provider && !model.toLowerCase().startsWith(`${provider.toLowerCase()}/`) ? `${provider}/${model}` : model;
  return id.slice(0, 120);
}

/* ------------------------------------------------------------------ */
/* Adapter                                                             */
/* ------------------------------------------------------------------ */

function baseUrl(): string {
  return (process.env.OMNIROUTE_BASE_URL ?? "").trim().replace(/\/+$/, "");
}

export const omnirouteAdapter: ProviderAdapter = {
  id: "omniroute",
  host: "omniroute",
  aggregator: true,
  enabled: () => !!(baseUrl() && process.env.OMNIROUTE_API_KEY?.trim()),
  endpoint: () => ({
    url: `${baseUrl()}/chat/completions`,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OMNIROUTE_API_KEY?.trim() ?? ""}`,
    },
  }),
  /** Statik ro'yxat + OMNIROUTE_MODEL (sozlangan standart kombo, ro'yxatda bo'lmasa). */
  get offers(): ModelOffer[] {
    const list = [...OMNIROUTE_OFFERS];
    const envModel = process.env.OMNIROUTE_MODEL?.trim();
    if (envModel && !list.some((o) => o.wire === envModel)) {
      const extra = resolveOmniRoute(envModel);
      if (extra) list.push(extra);
    }
    return list;
  },
  limits: OMNIROUTE_LIMITS,
  classifyError: (status, body, headers) => classifyOmniRouteError(status, body, headers, Date.now()),
  resolve: resolveOmniRoute,
  readServedModel: readOmniServedModel,
  /** "auto/*" kombo javobida tanadagi model aks-sado — haqiqiy model X-OmniRoute-* sarlavhalarida. */
  readServedFromHeaders: omniServedFromHeaders,
  /**
   * Watchdog: 503 "resource pressure" → Railway restart (fonda, cooldown bilan). Boshqa xatolar
   * (502, 429 ...) restartga sabab bo'lmaydi — omniroute-watchdog.ts qoidasi (foydalanuvchi
   * trafigi restart qo'zg'ata olmasin). Dinamik import: adapter moduli server-only/Supabase'ni
   * import paytida tortmasin (registry testlari tarmoqsiz).
   */
  onFailure(status, error) {
    if (status !== 503 || !RE_PRESSURE.test(error.message)) return;
    void import("../../../omniroute-watchdog")
      .then((m) => m.healOmniRouteIfStuck(status, error.message))
      .catch(() => {});
  },
};
