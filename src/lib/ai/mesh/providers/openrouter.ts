/**
 * OpenRouter adapteri (openrouter.ai/api/v1) — aggregator: bitta kalit bilan deyarli har
 * qanday "vendor/model" (Claude, GPT, Gemini, Grok, DeepSeek, Qwen, GLM, Kimi, Llama, :free ...).
 *
 * - offers: katalogdagi (config/models.ts) tashqi modellar + Auto/region zaxiralaridagi
 *   "openrouter/..." id'lari (auto-pools.ts, region.ts REGION_SAFE). Tella (o'z modelimiz) va
 *   Perplexity research (sonar) — kirmaydi. Katalogda yo'q "vendor/model" — `resolve()`.
 * - transformBody: providers.ts streamOpenRouter bilan bir xil — transforms ["middle-out"],
 *   route "fallback", tekin model uchun `models` zaxira puli (FREE_FALLBACKS), Anthropic
 *   uchun uzun system prompt keshi (cache_control).
 * - classifyError: https://openrouter.ai/docs/api-reference/errors (2026-09-27) —
 *   HTTP kodi `error.code` da ham keladi (oqim ichida status 200 + SSE xato bo'lagi),
 *   `metadata.error_type`, `metadata.raw` (upstream xabari), `metadata.headers` (429 da X-RateLimit-*).
 *
 * PURE import: tarmoq yo'q; env faqat enabled()/endpoint()/limits getter ichida o'qiladi.
 */
import { MODELS } from "@/config/models";
import { PROVIDER_POLICY, policyOwner, regionClassOf } from "@/lib/ai/region";
import type {
  Capabilities,
  ChatBody,
  ClassifiedError,
  Limits,
  ModelOffer,
  OfferClass,
  OfferCost,
  PlanTier,
  ProviderAdapter,
} from "../types";
import { TIER_RANK } from "../types";

export const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const HOST_PREFIX = "openrouter/";

/** Hujjat: https://openrouter.ai/docs/api-reference/limits (2026-09-27). */
const LIMITS_SOURCE = "https://openrouter.ai/docs/api-reference/limits (2026-09-27)";
/** :free modellar — 20 so'rov/daqiqa (hamma hisob uchun). */
const FREE_RPM = 20;
/** :free modellar — kuniga 50 so'rov (jami $10 dan kam kredit sotib olingan) yoki 1000 ($10+). */
const FREE_RPD_BASE = 50;

/* ------------------------------------------------------------------ */
/* Offers                                                              */
/* ------------------------------------------------------------------ */

/** O'z modelimiz (faqat Tella serveri) va research (Perplexity to'g'ridan-to'g'ri) — OpenRouter'ga yuborilmaydi. */
function servable(m: { providerModel: string; category: string }): boolean {
  return !!m.providerModel && m.category !== "research" && !/tella/i.test(m.providerModel) && m.providerModel.includes("/");
}

/** Taxminiy imkoniyatlar (OpenRouter model sahifalari). Aniq bo'lmasa — false (ehtiyotkor). */
export function capsOf(wire: string): Capabilities {
  const id = wire.toLowerCase();
  const image = /-image\b|image$/.test(id);
  const reasoningOnly = /o1-mini|r1-distill/.test(id);
  // :free marshrutlarda tool-calling kafolatlanmagan (Gemini Flash exp bundan mustasno).
  const freeNoTools = id.endsWith(":free") && !/gemini/.test(id);
  return {
    stream: true,
    tools: !image && !reasoningOnly && !freeNoTools,
    vision:
      !reasoningOnly &&
      /claude|gpt-4o|gpt-5|gpt-6|gemini|gemma-4|llama-4|grok-4|pixtral|mistral-medium|omni/.test(id),
    json: !image && !/r1-distill/.test(id),
  };
}

function costOf(tier: PlanTier): OfferCost {
  return tier === "free" ? "free" : tier === "starter" ? "cheap" : "paid";
}

/** Rasm yaratuvchi modellar matnli chat o'rinbosari sifatida kam afzal. */
function qualityOf(wire: string): number | undefined {
  return /-image\b/i.test(wire) ? 0.4 : undefined;
}

type Seed = { wire: string; tier: PlanTier; ids: string[] };

/**
 * Auto (auto-pools.ts) va mintaqa zaxiralari (region.ts REGION_SAFE) ishlatadigan, katalogda
 * alohida yozuvi yo'q OpenRouter modellari. Tarif — Auto pullarida qaysi tarifdan boshlab berilgani.
 */
const EXTRA_SEEDS: Seed[] = [
  { wire: "nvidia/nemotron-3-super-120b-a12b:free", tier: "free", ids: [] },
  { wire: "google/gemma-4-31b-it:free", tier: "free", ids: [] },
  { wire: "deepseek/deepseek-v4-flash", tier: "starter", ids: [] },
  { wire: "google/gemini-2.5-flash", tier: "starter", ids: [] },
  { wire: "moonshotai/kimi-k2.6", tier: "pro", ids: [] },
];

function buildOffers(): ModelOffer[] {
  const byWire = new Map<string, Seed>();
  const add = (s: Seed) => {
    const prev = byWire.get(s.wire);
    if (prev) {
      // Bir xil providerModel katalogda ikki marta (gpt-4o / gpt-4o-full) — id'lar birlashadi,
      // tarif — eng yuqorisi (o'rinbosar sifatida arzon tarifga pullik model berilmasin).
      prev.ids.push(...s.ids);
      if (TIER_RANK[s.tier] > TIER_RANK[prev.tier]) prev.tier = s.tier;
      return;
    }
    byWire.set(s.wire, { ...s, ids: [...s.ids] });
  };
  for (const m of MODELS) {
    if (servable(m)) add({ wire: m.providerModel, tier: m.tier, ids: [m.id] });
  }
  for (const s of EXTRA_SEEDS) add(s);

  return [...byWire.values()].map(({ wire, tier, ids }) => {
    const cls: OfferClass = regionClassOf(wire, { tier });
    const quality = qualityOf(wire);
    return {
      // Katalog id, providerModel va OmniRoute uslubidagi host-prefiksli id — hammasi AYNAN shu model.
      sovereignIds: [...new Set([...ids, wire, HOST_PREFIX + wire])],
      wire,
      class: cls,
      cost: wire.endsWith(":free") ? "free" : costOf(tier),
      caps: capsOf(wire),
      minTier: tier,
      ...(quality !== undefined ? { quality } : {}),
    } satisfies ModelOffer;
  });
}

const OFFERS: ModelOffer[] = buildOffers();
const KNOWN_IDS = new Set(OFFERS.flatMap((o) => o.sovereignIds));

/**
 * providers.ts FREE_FALLBACKS — OpenRouter o'zi almashtiradigan tekin zaxiralar
 * (katalogdagi tekin modellar, Tella'siz).
 */
const FREE_FALLBACKS: string[] = MODELS.filter((m) => m.category === "free" && servable(m)).map((m) => m.providerModel);

/* ------------------------------------------------------------------ */
/* resolve — katalogda yo'q "vendor/model"                             */
/* ------------------------------------------------------------------ */

/** OpenRouter'ga tegishli bo'lmagan host prefikslari (OmniRoute katalogi "host/vendor/model"). */
const FOREIGN_HOSTS = new Set([
  "groq",
  "cloudflare",
  "cerebras",
  "sambanova",
  "omniroute",
  "rsi",
  "llm7",
  "experiential",
  "gateway",
  "tella",
  "aihorde",
  "pollinations",
  "mistral",
  "nvidia_nim",
  "auto",
]);

/** Sovereign id → OpenRouter wire ("openrouter/x/y" → "x/y"). OpenRouter formatida bo'lmasa null. */
export function openrouterWireOf(id: string): string | null {
  let s = (id ?? "").trim();
  if (s.toLowerCase().startsWith(HOST_PREFIX)) s = s.slice(HOST_PREFIX.length);
  if (!/^[a-z0-9][\w.-]*\/[a-z0-9][\w.:-]*$/i.test(s)) return null;
  const vendor = s.split("/")[0].toLowerCase();
  if (FOREIGN_HOSTS.has(vendor) || /tella/i.test(s)) return null;
  return s;
}

/* ------------------------------------------------------------------ */
/* Tana (transformBody)                                                */
/* ------------------------------------------------------------------ */

function textOfContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((p) => (p && typeof p === "object" && typeof (p as { text?: unknown }).text === "string" ? (p as { text: string }).text : ""))
    .join("\n");
}

function hasImage(messages: unknown[]): boolean {
  return messages.some(
    (m) =>
      !!m &&
      typeof m === "object" &&
      Array.isArray((m as { content?: unknown }).content) &&
      ((m as { content: unknown[] }).content).some((p) => !!p && typeof p === "object" && (p as { type?: unknown }).type !== "text"),
  );
}

/**
 * Anthropic: uzun system prompt `cache_control` bilan keshlanadi (~90% arzon, ~5 daqiqa TTL).
 * providers.ts withPromptCache bilan bir xil (~500 tokendan qisqa bo'lsa foydasiz).
 */
function withPromptCache(wire: string, messages: unknown[]): unknown[] {
  if (!wire.startsWith("anthropic/")) return messages;
  const sys = messages.find((m) => !!m && typeof m === "object" && (m as { role?: unknown }).role === "system") as
    | { role: string; content: unknown }
    | undefined;
  if (!sys) return messages;
  const text = textOfContent(sys.content);
  if (text.length < 2000) return messages;
  return messages.map((m) =>
    m === sys ? { role: "system", content: [{ type: "text", text, cache_control: { type: "ephemeral" } }] } : m,
  );
}

/**
 * Tekin model uchun OpenRouter `models` zaxira puli. Mintaqa: transformBody mamlakatni bilmaydi,
 * shuning uchun faqat asosiy modeldan KENG ruxsat etilgan (cheklangan mamlakatlar ro'yxati uning
 * qism-to'plami bo'lgan) zaxiralar qo'shiladi — scheduler asosiy modelni shu mamlakatga ruxsat
 * etgan bo'lsa, zaxira ham albatta ruxsat etilgan. Vosita/rasm so'rovida zaxira yo'q (qo'llamasligi mumkin).
 */
export function freeFallbacksFor(wire: string, body: Pick<ChatBody, "tools" | "messages">): string[] {
  if (!wire.endsWith(":free")) return [];
  if ((body.tools?.length ?? 0) > 0 || hasImage(body.messages ?? [])) return [];
  const primary = new Set<string>(PROVIDER_POLICY[policyOwner(wire)].restricted);
  return FREE_FALLBACKS.filter(
    (m) => m !== wire && PROVIDER_POLICY[policyOwner(m)].restricted.every((c) => primary.has(c)),
  ).slice(0, 2);
}

/* ------------------------------------------------------------------ */
/* classifyError                                                       */
/* ------------------------------------------------------------------ */

type OrErrorJson = {
  error?:
    | string
    | {
        code?: number | string;
        message?: string;
        metadata?: { raw?: unknown; provider_name?: string; error_type?: string; headers?: Record<string, unknown> };
      };
  message?: string;
};

function parseBody(body: string): OrErrorJson | null {
  const s = (body ?? "").trim().replace(/^data:\s*/, "");
  if (!s.startsWith("{")) return null;
  try {
    return JSON.parse(s) as OrErrorJson;
  } catch {
    return null;
  }
}

/** Keyingi 00:00 UTC (OpenRouter kunlik tekin limiti "current UTC day" bo'yicha). */
export function nextUtcMidnight(now: number): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
}

/** "2m59.5s" / "30s" / "500ms" / "1h" → ms. */
function durationMs(s: string): number | null {
  const re = /(\d+(?:\.\d+)?)(ms|h|m|s)/g;
  let total = 0;
  let matched = "";
  for (let m = re.exec(s); m; m = re.exec(s)) {
    const n = Number(m[1]);
    total += m[2] === "ms" ? n : m[2] === "s" ? n * 1000 : m[2] === "m" ? n * 60_000 : n * 3_600_000;
    matched += m[0];
  }
  return matched && matched === s.replace(/\s+/g, "") ? Math.round(total) : null;
}

/**
 * X-RateLimit-Reset → epoch ms. OpenRouter epoch millisekund beradi; ehtiyot uchun epoch soniya,
 * nisbiy soniya va "30s" ko'rinishlari ham qabul qilinadi.
 */
function resetToEpoch(v: unknown, now: number): number | null {
  if (v === undefined || v === null || v === "") return null;
  const s = String(v).trim();
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (n > 1e12) return Math.round(n);
    if (n > 1e9) return Math.round(n * 1000);
    return now + Math.round(n * 1000);
  }
  const d = durationMs(s);
  if (d !== null) return now + d;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

/** Retry-After: soniya yoki HTTP-sana. */
function retryAfterHeader(v: string | null, now: number): number | null {
  if (!v) return null;
  const s = v.trim();
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(Number(s) * 1000);
  const t = Date.parse(s);
  return Number.isFinite(t) ? Math.max(0, t - now) : null;
}

/** Upstream xabaridagi "retry in 12.3s" / "retryDelay": "30s". */
function retryAfterText(raw: string): number | null {
  const m =
    /retry(?:[ -]?after| in)\s*:?\s*(\d+(?:\.\d+)?)\s*(ms|milliseconds?|s|sec|seconds?)?\b/i.exec(raw) ??
    /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)(s|ms)"/i.exec(raw);
  if (!m) return null;
  const n = Number(m[1]);
  return Math.round(/^ms|^milli/i.test(m[2] ?? "") ? n : n * 1000);
}

function lowerKeys(o: Record<string, unknown> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o ?? {})) out[k.toLowerCase()] = v;
  return out;
}

const CONTEXT_TYPES = new Set(["context_length_exceeded", "max_tokens_exceeded", "token_limit_exceeded", "string_too_long"]);
const TRANSIENT_TYPES = new Set(["server", "timeout", "provider_overloaded", "provider_unavailable", "unmapped"]);
const POLICY_TYPES = new Set(["content_policy_violation", "refusal"]);

/**
 * OpenRouter xatosi → tur (docs/MESH.md §2.1). `now` — testda deterministik.
 * Tartib muhim: 429 "free-models-per-day" xabarida ham "credits" so'zi bor
 * ("Add 10 credits to unlock 1000 free model requests per day") — u no_credit EMAS.
 */
export function classifyOpenRouterError(status: number, body: string, headers: Headers, now = Date.now()): ClassifiedError {
  const j = parseBody(body);
  const err = j?.error;
  const obj = err && typeof err === "object" ? err : null;
  const meta = obj?.metadata;
  const bodyCode = typeof obj?.code === "number" ? obj.code : Number.parseInt(String(obj?.code ?? ""), 10);
  // Oqim ichidagi xato (HTTP 200 allaqachon yuborilgan) — haqiqiy kod tanada.
  const eff = (status === 0 || (status >= 200 && status < 300)) && bodyCode >= 100 && bodyCode < 600 ? bodyCode : status;
  const rawMeta = meta?.raw === undefined ? "" : typeof meta.raw === "string" ? meta.raw : JSON.stringify(meta.raw);
  const text = [typeof err === "string" ? err : (obj?.message ?? j?.message ?? ""), rawMeta].filter(Boolean).join(" | ") || body || "";
  const errorType = (meta?.error_type ?? "").toLowerCase();
  const provider = meta?.provider_name ? `[${meta.provider_name}] ` : "";
  const message = `${eff} ${provider}${text}`.slice(0, 500);
  const metaHeaders = lowerKeys(meta?.headers);

  // 1) Kam kredit: "You requested up to N tokens, but can only afford M" — kamroq max_tokens bilan qayta urinish.
  //    Pullik kredit hovuzi ($paid): :free modellar kreditga bog'liq emas — ishlashda davom etadi.
  const afford = /can only afford (\d+)/i.exec(text);
  if (afford) return { kind: "no_credit", affordTokens: Number(afford[1]), scope: "provider", pool: "paid", message };

  // 2) 429 va OpenRouter platforma limitlari.
  if (eff === 429 || errorType === "rate_limit_exceeded" || /free-models-per-(day|min)/i.test(text)) {
    const reset =
      resetToEpoch(headers.get("x-ratelimit-reset"), now) ?? resetToEpoch(metaHeaders["x-ratelimit-reset"], now);
    if (/free-models-per-day|per[- ]day|daily/i.test(text)) {
      // Kunlik tekin limit (50 yoki 1000 so'rov/UTC kun) — butun hisobning BARCHA :free modellariga
      // tegishli: umumiy "$free" hovuzi reset vaqtigacha yopiladi (har modelni alohida sinab chiqmaymiz);
      // pullik modellar ishlashda davom etadi.
      const resetAt = reset && reset > now && reset - now <= 48 * 3_600_000 ? reset : nextUtcMidnight(now);
      return { kind: "quota_exhausted", resetAt, scope: "model", pool: "free", message };
    }
    const retryAfterMs =
      retryAfterHeader(headers.get("retry-after"), now) ??
      (reset && reset > now ? reset - now : null) ??
      retryAfterText(text) ??
      undefined;
    // free-models-per-min — butun hisobning :free modellari (20 RPM): "$free" hovuzi;
    // upstream (provider_name bor / "rate-limited upstream") — shu model.
    if (/free-models-per-min/i.test(text)) {
      return { kind: "rate_limited", ...(retryAfterMs !== undefined ? { retryAfterMs } : {}), scope: "model", pool: "free", message };
    }
    const modelScoped = /upstream|provider returned error/i.test(text) || !!meta?.provider_name;
    return { kind: "rate_limited", ...(retryAfterMs !== undefined ? { retryAfterMs } : {}), scope: modelScoped ? "model" : "provider", message };
  }

  // 3) Kredit / balans / kalit limiti (402, 403 "Key limit exceeded"). Faqat pullik hovuz ($paid):
  //    :free modellar kredit sotib olinmagan hisobda ham ishlaydi — ularni 1 soat bloklamaymiz.
  //    Istisno: manfiy balans / kalit limiti — OpenRouter :free so'rovlarni ham rad etadi (butun provayder).
  if (/negative (credit )?balance|key limit exceeded/i.test(text)) return { kind: "no_credit", scope: "provider", message };
  if (
    eff === 402 ||
    errorType === "payment_required" ||
    /insufficient (credits|balance|funds)|credits|billing|payment required/i.test(text)
  ) {
    return { kind: "no_credit", scope: "provider", pool: "paid", message };
  }

  // 4) Moderatsiya / guardrail — so'rov mazmuni sababli (boshqa joyda ham rad etiladi).
  if (POLICY_TYPES.has(errorType) || (eff === 403 && /moderation|flagged|guardrail|content policy|refus/i.test(text))) {
    return { kind: "bad_request", message };
  }

  // 5) Kalit.
  if (eff === 401 || eff === 403 || errorType === "authentication" || errorType === "permission_denied" || /invalid api key|no auth credentials|user not found/i.test(text)) {
    return { kind: "auth", scope: "provider", message };
  }

  // 6) Kontekst.
  if (
    eff === 413 ||
    CONTEXT_TYPES.has(errorType) ||
    /context length|maximum context|context window|too many tokens|prompt is too long|reduce the length/i.test(text)
  ) {
    return { kind: "context_length", message };
  }

  // 7) Imkoniyat mos kelmadi ("No endpoints found that support tool use / image input") — model
  //    yo'q emas: sog'liq o'zgarmaydi (hamma uchun blok yo'q), keyingi nomzod; imkoniyat xotirada o'rganiladi.
  if (/no endpoints found that support/i.test(text)) {
    return { kind: "unsupported", scope: "model", capability: /image|vision/i.test(text) ? "vision" : "tools", message };
  }

  // 8) Model yo'q / o'chirilgan / ma'lumot siyosatiga mos endpoint yo'q.
  if (
    eff === 404 ||
    /model not found|not a valid model|no endpoints found|does not exist|decommissioned|no longer (available|supported)|has been deprecated/i.test(text)
  ) {
    return { kind: "unavailable", scope: "model", message };
  }

  // 9) Vaqtinchalik (tarmoq, 408, 5xx, 529, upstream overload).
  if (eff === 0 || eff === 408 || eff >= 500 || TRANSIENT_TYPES.has(errorType)) return { kind: "transient", message };

  // 10) So'rovning o'zi yaroqsiz.
  if (eff === 400 || eff === 422 || (eff >= 400 && eff < 500)) return { kind: "bad_request", message };

  // Oqim ichida kodsiz xato va boshqalar.
  return { kind: "transient", message };
}

/* ------------------------------------------------------------------ */
/* Adapter                                                             */
/* ------------------------------------------------------------------ */

function key(): string {
  return (process.env.OPENROUTER_API_KEY ?? "").trim();
}

export const openrouterAdapter: ProviderAdapter = {
  id: "openrouter",
  host: "openrouter",
  aggregator: true,
  enabled: () => !!key(),
  endpoint: () => ({
    url: `${OPENROUTER_BASE}/chat/completions`,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key()}`,
      "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
      "X-Title": "SOVEREIGN AI",
    },
  }),
  offers: OFFERS,
  /**
   * Limitlar faqat :free modellarga tegishli (pullik modellar — kredit bo'yicha, platforma limiti yo'q).
   * OPENROUTER_FREE_RPD=1000 — hisobga jami $10+ kredit sotib olingan bo'lsa.
   */
  get limits(): Limits {
    const rpd = Number(process.env.OPENROUTER_FREE_RPD) > 0 ? Number(process.env.OPENROUTER_FREE_RPD) : FREE_RPD_BASE;
    return { rpm: FREE_RPM, rpd, dailyUnits: rpd, unit: "requests", perModel: false, source: LIMITS_SOURCE };
  },
  classifyError: (status, body, headers) => classifyOpenRouterError(status, body, headers),
  resolve(sovereignId) {
    if (KNOWN_IDS.has(sovereignId)) return null;
    const wire = openrouterWireOf(sovereignId);
    if (!wire) return null;
    return {
      sovereignIds: [...new Set([sovereignId, wire, HOST_PREFIX + wire])],
      wire,
      class: regionClassOf(wire),
      cost: wire.endsWith(":free") ? "free" : "paid",
      caps: capsOf(wire),
    };
  },
  transformBody(body, offer) {
    const out: ChatBody = {
      ...body,
      messages: withPromptCache(offer.wire, body.messages),
      transforms: ["middle-out"],
      route: "fallback",
    };
    const fallbacks = freeFallbacksFor(offer.wire, body);
    if (fallbacks.length) out.models = [offer.wire, ...fallbacks];
    return out;
  },
  readServedModel(chunkOrJson) {
    const m = (chunkOrJson as { model?: unknown } | null)?.model;
    return typeof m === "string" && m.trim() ? m.trim().slice(0, 120) : null;
  },
};
