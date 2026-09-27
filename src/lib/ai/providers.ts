import "server-only";
import { MODELS, MODEL_BY_ID, type SovereignModel } from "@/config/models";
import { DEFAULT_LANG, fmt, translate, type Lang, type TKey } from "@/lib/i18n";
import { healOmniRouteIfStuck } from "@/lib/omniroute-watchdog";
import type { AnswerMeta } from "@/lib/chat/answer-meta";
import { isSubstitution } from "./served";
import { hostAllowedIn, modelAllowedIn, regionClassOf, restrictedRegion } from "./region";
import {
  CF,
  CF_BY_CLASS,
  CF_PREFIX,
  cfErrorMessage,
  cfId,
  cfSameModel,
  cfStreams,
  jsonCompletionToChunk,
} from "./cloudflare";
import { providerSideFailure } from "./chain";
import { meshStream, providerWideFailure } from "./mesh/execute";
import { enabledAdapters } from "./mesh/registry";
import { explain, formatExplain, plan as meshPlan } from "./mesh/scheduler";
import { meshMode, modelTierFor, webRouteRequest } from "./mesh/request";
import { PROVIDER_IDS, type HealthSnapshot, type PlanTier, type ProviderId } from "./mesh/types";

/**
 * O'z serverimizdagi modellar (providerModel). Ular faqat o'z serverimizda
 * ishlaydi: tashqi provayderga (OpenRouter, LLM7 va h.k.) hech qachon yuborilmaydi.
 */
const OWN_MODELS = new Set(["tella-2"]);

function isOwnModel(providerModel: string): boolean {
  return OWN_MODELS.has(providerModel);
}

/**
 * Free provider models used as automatic fallbacks when one is rate-limited.
 * O'z modelimiz (Tella) OpenRouter'da yo'q — ro'yxatga kirmaydi.
 */
const FREE_FALLBACKS = MODELS.filter((m) => m.category === "free" && !isOwnModel(m.providerModel)).map(
  (m) => m.providerModel,
);

export interface ChatMessageInput {
  role: "user" | "assistant" | "system";
  /** string, or a multimodal array (text + image_url parts) for vision models. */
  content: string | unknown[];
}

/** Qidiruv natijasi (Perplexity search_results) — verifier uchun; mijozga yuborilmaydi. */
export interface SearchSource {
  url: string;
  title?: string;
  snippet?: string;
  date?: string;
}

export type StreamEvent =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  /** `sources` — faqat server ichida (chat route uni mijozga uzatishdan oldin olib tashlaydi). */
  | { type: "citations"; citations: string[]; sources?: SearchSource[] }
  | { type: "skills"; skills: string[] }
  | { type: "route"; reason: string; steps: { modelId: string; kind: string; purpose: string }[] }
  | { type: "step"; modelId: string; kind: string; purpose: string; index: number }
  | { type: "cache"; model: string; similarity: number }
  /** The server is fetching pages the user linked to. */
  | { type: "reading"; urls: string[] }
  /** A model/provider failed and the answer continues on another model. */
  | { type: "switch"; from: string; to: string; reason: string }
  | { type: "verifier"; issues: { fact: string; verdict: "correct" | "suspicious" | "unverifiable"; note?: string }[] }
  /**
   * Faqat server ichida (chat route mijozga uzatmaydi): upstream haqiqatda qaysi
   * model bilan javob bera boshladi. `substituted` — foydalanuvchi tanlagan
   * modeldan boshqa model; `rescue` — tekin zaxira shlyuz.
   */
  | { type: "served"; model: string; substituted: boolean; rescue?: boolean; provider?: string }
  /** Javob yakunidagi shaffoflik: haqiqiy model + server hisoblagan token (chat route yuboradi). */
  | ({ type: "meta" } & AnswerMeta)
  | { type: "error"; message: string }
  /** Chuqur so'rash: savol kartasi (ask) yoki javob ostidagi follow-up chip'lar (docs/INQUIRY.md §A.8). */
  | import("./inquiry/types").InquiryEvent
  /** Connector yozish amali bajarilmadi — foydalanuvchi kartada tasdiqlashi kerak (connector-confirm-types.ts). */
  | import("./connector-confirm-types").ConnectorConfirmEvent
  | { type: "done" };

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const PERPLEXITY_BASE = "https://api.perplexity.ai";
const GROQ_BASE = "https://api.groq.com/openai/v1";
const OPENAI_BASE = "https://api.openai.com/v1";
const CEREBRAS_BASE = "https://api.cerebras.ai/v1";
const SAMBANOVA_BASE = "https://api.sambanova.ai/v1";
const MISTRAL_BASE = "https://api.mistral.ai/v1";
// Free tiers (awesome-free-llm-apis): NVIDIA NIM needs a free key; LLM7 works
// anonymously, so it is the last-resort route when every other provider fails.
const NVIDIA_BASE = "https://integrate.api.nvidia.com/v1";
const LLM7_BASE = "https://api.llm7.io/v1";
/** LLM7 free tier: no signup. A token only raises the rate limit. */
const LLM7_FREE_MODEL = "mistral-Nemo-Instruct-2407";
/**
 * Cloudflare Workers AI — OpenAI-mos endpoint:
 *   POST {CF_API_BASE}/accounts/{CLOUDFLARE_ACCOUNT_ID}/ai/v1/chat/completions (Bearer CLOUDFLARE_AI_TOKEN).
 * Kunlik 10 000 neuron tekin; oshsa bepul rejada 429 (kod 4006) — keyingi provayderga o'tiladi.
 * Model id'lari developers.cloudflare.com/workers-ai/platform/pricing/ da 2026-09-27 tekshirilgan.
 */
const CF_API_BASE = "https://api.cloudflare.com/client/v4";

/**
 * Direct provider mapping — OpenRouter'ni chetlab tez va ishonchli endpointga
 * yo'naltirish. Har model uchun tarjih tartibi:
 * 1) Groq — dunyodagi eng tez (~500 tok/s)
 * 2) Cerebras — kuchli (Llama 405B tekin sxema)
 * 3) SambaNova — DeepSeek R1 (reasoning) uchun eng tez
 * 4) OpenAI direct — kuchli, ammo pullik
 * 5) OpenRouter — universal fallback
 */
type Provider =
  | "groq"
  | "cerebras"
  | "sambanova"
  | "mistral"
  | "openai"
  | "nvidia"
  | "llm7"
  | "tella"
  | "omniroute"
  | "rsi"
  | "cloudflare";

interface RouteCandidate {
  provider: Provider;
  model: string;
}

/** Tanlangan upstream yo'l (to'g'ridan-to'g'ri provayder, OmniRoute, RSI yoki Cloudflare). */
type DirectRoute = { url: string; auth: string; model: string; provider: Provider };

const DIRECT_ROUTES: Record<string, RouteCandidate[]> = {
  // Tella 2 — faqat o'z serverimiz. Zaxirasi yo'q: boshqa provayderga yuborsak
  // "o'zimizniki" degani yolg'on bo'lardi.
  "tella-2": [{ provider: "tella", model: process.env.TELLA_MODEL ?? "tella2" }],
  // Llama 3.3 70B — Groq → Cerebras → SambaNova (barchada bor)
  "meta-llama/llama-3.3-70b-instruct": [
    { provider: "groq", model: "openai/gpt-oss-120b" },
    { provider: "cloudflare", model: CF.llama },
    { provider: "cerebras", model: "llama-3.3-70b" },
    { provider: "sambanova", model: "Meta-Llama-3.3-70B-Instruct" },
    { provider: "nvidia", model: "meta/llama-3.3-70b-instruct" },
  ],
  // Tekin tarif zanjiri: Groq → Cloudflare → (qolgan kalitlar) → OpenRouter tekin → LLM7.
  "meta-llama/llama-3.3-70b-instruct:free": [
    { provider: "groq", model: "openai/gpt-oss-120b" },
    { provider: "cloudflare", model: CF.llama },
    { provider: "cerebras", model: "llama-3.3-70b" },
    { provider: "sambanova", model: "Meta-Llama-3.3-70B-Instruct" },
    { provider: "nvidia", model: "meta/llama-3.3-70b-instruct" },
    { provider: "llm7", model: LLM7_FREE_MODEL },
  ],
  "meta-llama/llama-3.1-8b-instruct": [
    { provider: "groq", model: "openai/gpt-oss-20b" },
    { provider: "cerebras", model: "llama3.1-8b" },
  ],
  // Llama 3.1 405B — faqat SambaNova va Cerebras da bor
  "meta-llama/llama-3.1-405b-instruct": [
    { provider: "sambanova", model: "Meta-Llama-3.1-405B-Instruct" },
    { provider: "cerebras", model: "llama3.1-405b" },
  ],
  // Qwen Coder
  "qwen/openai/gpt-oss-120b-instruct": [
    { provider: "groq", model: "openai/gpt-oss-120b" },
    { provider: "cerebras", model: "qwen-3-32b" },
  ],
  // Mistral direct — kod, umumiy va Codestral (kod uchun mutaxassis)
  "mistralai/mistral-large": [{ provider: "mistral", model: "mistral-large-latest" }],
  "mistralai/mistral-small": [{ provider: "mistral", model: "mistral-small-latest" }],
  "mistralai/codestral-latest": [{ provider: "mistral", model: "codestral-latest" }],
  "mistralai/pixtral-large": [{ provider: "mistral", model: "pixtral-large-latest" }],
  // DeepSeek R1 — SambaNova eng tez
  "deepseek/openai/gpt-oss-120b": [
    { provider: "sambanova", model: "DeepSeek-R1-Distill-Llama-70B" },
    { provider: "groq", model: "openai/gpt-oss-120b" },
  ],
  "deepseek/openai/gpt-oss-120b:free": [
    { provider: "sambanova", model: "DeepSeek-R1-Distill-Llama-70B" },
    { provider: "groq", model: "openai/gpt-oss-120b" },
    { provider: "llm7", model: LLM7_FREE_MODEL },
  ],

  // OpenAI direct
  "openai/gpt-4o-mini": [{ provider: "openai", model: "gpt-4o-mini" }],
  "openai/gpt-4o": [{ provider: "openai", model: "gpt-4o" }],
  "openai/gpt-4-turbo": [{ provider: "openai", model: "gpt-4-turbo" }],
};

function providerAvailable(p: Provider): boolean {
  if (p === "groq") return !!process.env.GROQ_API_KEY;
  if (p === "cerebras") return !!process.env.CEREBRAS_API_KEY;
  if (p === "sambanova") return !!process.env.SAMBANOVA_API_KEY;
  if (p === "mistral") return !!process.env.MISTRAL_API_KEY;
  if (p === "nvidia") return !!process.env.NVIDIA_API_KEY;
  // Tella — o'z serverimizdagi model (Ollama/vLLM). Manzil yo'q bo'lsa mavjud emas.
  if (p === "tella") return !!process.env.TELLA_BASE_URL;
  if (p === "llm7") return true; // anonymous free tier
  if (p === "cloudflare") return cloudflareConfigured();
  if (p === "omniroute") return !!(process.env.OMNIROUTE_BASE_URL && process.env.OMNIROUTE_API_KEY);
  if (p === "rsi") return !!(process.env.RSI_BASE_URL && process.env.RSI_API_KEY);
  return !!process.env.OPENAI_API_KEY;
}

/** Cloudflare Workers AI faqat ikkala env bo'lsa yoqiladi. */
export function cloudflareConfigured(): boolean {
  return !!(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_AI_TOKEN);
}

function cloudflareEndpoint(): { url: string; auth: string } {
  const account = encodeURIComponent(process.env.CLOUDFLARE_ACCOUNT_ID!.trim());
  return { url: `${CF_API_BASE}/accounts/${account}/ai/v1/chat/completions`, auth: process.env.CLOUDFLARE_AI_TOKEN!.trim() };
}

/**
 * OpenRouter (yoki OmniRoute orqali OpenRouter) krediti/kvotasi tugaganda shu modelning
 * Cloudflare zaxirasi: avval AYNAN shu model (DeepSeek V4 Pro, Kimi, GLM, Qwen ...), bo'lmasa
 * sinf ekvivalenti (flagship → DeepSeek V4 Pro / Kimi / GLM). Mintaqa siyosati va shu so'rovda
 * xato bergan provayderlar hisobga olinadi. `sameOnly` — faqat aynan shu model.
 */
function cloudflareRoute(
  providerModel: string,
  country: string | null | undefined,
  opts: { exclude?: Provider[]; sameOnly?: boolean; tier?: SovereignModel["tier"] } = {},
): DirectRoute | null {
  if (!cloudflareConfigured() || opts.exclude?.includes("cloudflare")) return null;
  if (!hostAllowedIn("cloudflare", country)) return null;
  const same = cfSameModel(providerModel);
  const pool = same
    ? [same]
    : opts.sameOnly
      ? []
      : CF_BY_CLASS[regionClassOf(providerModel, { tier: opts.tier })];
  const model = pool.find((m) => modelAllowedIn(cfId(m), country));
  return model ? { ...cloudflareEndpoint(), model, provider: "cloudflare" } : null;
}

/**
 * Host prefiksli id ("groq/qwen/qwen3.8-27b", "cloudflare/@cf/...") — kalit bo'lsa
 * OmniRoute'siz to'g'ridan-to'g'ri o'sha provayderga. Auto navbati va tekin zanjir shu
 * id'lardan foydalanadi.
 */
function hostPrefixedRoute(id: string): DirectRoute | null {
  if (id.startsWith(CF_PREFIX)) {
    return cloudflareConfigured() ? { ...cloudflareEndpoint(), model: id.slice(CF_PREFIX.length), provider: "cloudflare" } : null;
  }
  if (id.startsWith("groq/") && providerAvailable("groq")) {
    return { ...providerEndpoint("groq"), model: id.slice("groq/".length), provider: "groq" };
  }
  return null;
}

/** Katalogda yo'q "host/..." id chaqirilishi mumkinmi (to'g'ridan-to'g'ri kalit yoki OmniRoute). */
export function hostIdAvailable(id: string): boolean {
  if (!id.includes("/")) return false;
  // Mesh: "groq/qwen/..." ni Cloudflare/Cerebras'dagi AYNAN shu og'irliklar ham bera oladi;
  // "cloudflare/..." OmniRoute'ga hech qachon ketmaydi (OmniRoute adapteri uni resolve qilmaydi).
  if (meshMode() === "on") return meshServes(id);
  if (hostPrefixedRoute(id)) return true;
  // cloudflare/... faqat Cloudflare kaliti bilan (OmniRoute'da bunday provayder yo'q).
  if (id.startsWith(CF_PREFIX)) return false;
  return providerAvailable("omniroute");
}

function providerEndpoint(p: Provider): { url: string; auth: string } {
  if (p === "groq") return { url: `${GROQ_BASE}/chat/completions`, auth: process.env.GROQ_API_KEY! };
  if (p === "cerebras") return { url: `${CEREBRAS_BASE}/chat/completions`, auth: process.env.CEREBRAS_API_KEY! };
  if (p === "sambanova") return { url: `${SAMBANOVA_BASE}/chat/completions`, auth: process.env.SAMBANOVA_API_KEY! };
  if (p === "mistral") return { url: `${MISTRAL_BASE}/chat/completions`, auth: process.env.MISTRAL_API_KEY! };
  if (p === "nvidia") return { url: `${NVIDIA_BASE}/chat/completions`, auth: process.env.NVIDIA_API_KEY! };
  if (p === "tella") {
    return {
      url: `${process.env.TELLA_BASE_URL!.replace(/\/$/, "")}/chat/completions`,
      // Ollama kalit talab qilmaydi; vLLM/proxy orqasida bo'lsa kalit qo'yiladi.
      auth: process.env.TELLA_API_KEY ?? "ollama",
    };
  }
  if (p === "llm7") return { url: `${LLM7_BASE}/chat/completions`, auth: process.env.LLM7_API_KEY ?? "unused" };
  if (p === "cloudflare") return cloudflareEndpoint();
  return { url: `${OPENAI_BASE}/chat/completions`, auth: process.env.OPENAI_API_KEY! };
}

/**
 * OmniRoute ASOSIY yo'l: sozlangan bo'lsa, tekin/arzon modellar avval unga boradi
 * (u o'zi provayderlar orasida kvotaga qarab almashtiradi). Xato bersa — chat
 * route odatdagi zanjirga o'tadi (to'g'ridan-to'g'ri provayderlar, keyin LLM7).
 * Flagman modellar (Claude/GPT) bunga kirmaydi: OmniRoute "auto" ularni pullik
 * OpenRouter orqali yuborib, xarajatni oshirishi sinovda ko'rindi.
 */
function omnirouteFirst(
  providerModel: string,
  country?: string | null,
): { url: string; auth: string; model: string; provider: Provider } | null {
  const base = process.env.OMNIROUTE_BASE_URL;
  if (!base || !process.env.OMNIROUTE_API_KEY) return null;
  const cheap = providerModel.endsWith(":free") || /llama|mistral-small|gemini.*flash|deepseek/i.test(providerModel);
  if (!cheap) return null;
  const model = process.env.OMNIROUTE_MODEL ?? "auto/gemini";
  // Mintaqa siyosati: "auto/gemini" (Google) kabi kombo cheklangan mintaqaga yuborilmaydi —
  // so'ralgan model o'z (ruxsat etilgan) yo'lidan ketadi.
  if (!modelAllowedIn(model, country)) return null;
  return {
    url: `${base.replace(/\/$/, "")}/chat/completions`,
    auth: process.env.OMNIROUTE_API_KEY,
    model,
    provider: "omniroute",
  };
}

/**
 * RSI AI (rsiai.net) — arzon reseller. Faqat u qo'llaydigan qimmat modellarni
 * shu orqali yo'naltiramiz (Opus 5/4.8, GPT-6/5.6, Fable 5). RSI_API_KEY yo'q
 * bo'lsa yoki model ro'yxatda bo'lmasa — null (odatdagi yo'nalish ishlaydi).
 */
const RSI_MODELS: Record<string, string> = {
  "anthropic/claude-opus-5": "claude-opus-5",
  "anthropic/claude-opus-4.8": "claude-opus-4-8",
  "anthropic/claude-fable-5.1": "claude-fable-5",
  "openai/gpt-6-astra": "gpt-6-astra",
  "openai/gpt-5.6-sol": "gpt-5.6-sol",
  "openai/gpt-5.6-terra": "gpt-5.6-terra",
};

function rsiRoute(providerModel: string): { url: string; auth: string; model: string; provider: Provider } | null {
  const key = process.env.RSI_API_KEY;
  const base = process.env.RSI_BASE_URL;
  if (!key || !base) return null;
  const id = RSI_MODELS[providerModel];
  if (!id) return null;
  return { url: `${base.replace(/\/$/, "")}/chat/completions`, auth: key, model: id, provider: "rsi" };
}

function pickDirectRoute(
  providerModel: string,
  opts: { skipOmni?: boolean; country?: string | null; exclude?: Provider[] } = {},
): DirectRoute | null {
  const country = opts.country ?? null;
  const exclude = opts.exclude ?? [];
  if (!opts.skipOmni) {
    const viaRsi = rsiRoute(providerModel);
    if (viaRsi && hostAllowedIn("rsi", country)) return viaRsi;
  }
  const viaOmni = opts.skipOmni ? null : omnirouteFirst(providerModel, country);
  if (viaOmni) return viaOmni;
  const candidates = DIRECT_ROUTES[providerModel];
  if (!candidates) return null;
  for (const c of candidates) {
    // Shu so'rovda xato bergan provayder (Groq 429, Cloudflare neuron limiti ...) qayta tanlanmaydi.
    if (exclude.includes(c.provider)) continue;
    // Mintaqa siyosati: haqiqiy upstream model (Groq'da gpt-oss va h.k.) va host
    // (NVIDIA NIM, LLM7, Mistral ...) ikkalasi ham shu mintaqaga ruxsat bergan bo'lsin.
    if (!modelAllowedIn(c.model, country) || !hostAllowedIn(c.provider, country)) continue;
    if (providerAvailable(c.provider)) {
      const ep = providerEndpoint(c.provider);
      return { ...ep, model: c.model, provider: c.provider };
    }
  }
  return null;
}

/** Perplexity Agent API presets ("sonar" ids kept in config for continuity). */
const PERPLEXITY_PRESET: Record<string, string> = {
  sonar: "fast",
  "sonar-pro": "medium",
};

export function isResearchModel(model: SovereignModel) {
  return model.category === "research";
}

/** Plain text of a message content (string or multimodal array). */
function textOf(content: string | unknown[]): string {
  if (typeof content === "string") return content;
  return content
    .map((p) => (p && typeof p === "object" && "text" in p ? String((p as { text?: string }).text ?? "") : ""))
    .join(" ");
}

/* ------------------------------------------------------------------ */
/* Provider Mesh (SOVEREIGN_MESH=on — standart): bitta algoritm         */
/* ------------------------------------------------------------------ */

const NO_HEALTH: HealthSnapshot = new Map();

/**
 * Mesh'da aynan shu modelni (bir xil og'irliklar) beradigan kalitli provayder bormi. Sog'liq
 * hisobga olinmaydi ("kalit bor" ma'nosi — vaqtincha yopiq provayder ham "ulangan"), rescue
 * shlyuzlar (LLM7 ...) va o'rinbosarlar sanalmaydi.
 */
function meshServes(id: string): boolean {
  try {
    const adapters = enabledAdapters();
    // Kesh: fallbackModelIds / Auto navbati har so'rovda o'nlab modelni tekshiradi. Kalitlar
    // to'plami o'zgarsa (env) — kesh tozalanadi.
    const sig = adapters.map((a) => a.id).join(",");
    if (sig !== serveCacheSig) {
      serveCache.clear();
      serveCacheSig = sig;
    }
    const hit = serveCache.get(id);
    if (hit && Date.now() - hit.at < SERVE_CACHE_MS) return hit.ok;
    // Faqat "kalit bor" ma'nosi — tarif bu yerda tekshirilmaydi (route darvozasi va so'rovdagi
    // planTier tekshiradi), shuning uchun planTier eng yuqori.
    const tier = modelTierFor(id);
    const ok =
      meshPlan(
        {
          sovereignModelId: id,
          ...(tier ? { modelTier: tier } : {}),
          planTier: "ultra",
          needs: {},
          country: null,
          sameModelOnly: true,
          allowRescue: false,
        },
        { adapters, health: NO_HEALTH },
      ).length > 0;
    serveCache.set(id, { at: Date.now(), ok });
    return ok;
  } catch (err) {
    console.error("[mesh] meshServes:", err instanceof Error ? err.message : err);
    return false;
  }
}

const SERVE_CACHE_MS = 60_000;
const serveCache = new Map<string, { at: number; ok: boolean }>();
let serveCacheSig = "";

export function hasKeyFor(model: SovereignModel): boolean {
  if (isResearchModel(model)) return !!process.env.PERPLEXITY_API_KEY;
  // Mesh: Tella (o'z serverimiz) ham, boshqa modellar ham — aynan shu modelni beradigan adapter.
  if (meshMode() === "on") return meshServes(model.id);
  // Tella 2 faqat o'z serverimizda: TELLA_BASE_URL yo'q bo'lsa "ulanmagan" —
  // OpenRouter'ga "tella-2" id bilan borib, begona model javob bermasin.
  if (isOwnModel(model.providerModel)) return providerAvailable("tella");
  // Agar direct provider (Groq/Cerebras/SambaNova/Mistral/OpenAI) bor bo'lsa, OpenRouter shart emas.
  if (pickDirectRoute(model.providerModel)) return true;
  if (process.env.OPENROUTER_API_KEY) return true;
  // OpenRouter kaliti yo'q, lekin Cloudflare'da AYNAN shu model bor (DeepSeek/Qwen/GLM/Kimi).
  return !!cloudflareRoute(model.providerModel, null, { sameOnly: true });
}

/**
 * Stand-ins for a model that just failed: same kind of model, a tier the plan
 * allows, and a provider we actually hold a key for. Ordered cheapest-first so
 * a rate-limited flagship falls back to something that will answer.
 */
export function fallbackModelIds(
  modelId: string,
  tierAllowed: (tier: SovereignModel["tier"]) => boolean,
  limit = 2,
): string[] {
  const failed = MODEL_BY_ID[modelId];
  if (!failed) return [];
  const rank: Record<string, number> = { free: 0, basic: 1, pro: 2, ultra: 3 };
  return MODELS.filter((m) => m.id !== modelId)
    .filter((m) => (m.category === "research") === (failed.category === "research"))
    .filter((m) => tierAllowed(m.tier))
    .filter((m) => hasKeyFor(m))
    .sort((a, b) => (rank[a.tier] ?? 9) - (rank[b.tier] ?? 9))
    .slice(0, limit)
    .map((m) => m.id);
}

export function buildSystemPrompt(model: SovereignModel, research: boolean, extra?: string): string {
  const base = [
    `Sen SOVEREIGN AI platformasidagi "${model.name}" modelisan.`,
    LANGUAGE_SCRIPT_RULE,
    "Javoblarni Markdown'da formatla: sarlavhalar, ro'yxatlar, kod bloklari (til ko'rsatilgan).",
    "Aniq, qisqa va foydali bo'l.",
    GENERATIVE_UI,
    ANTI_HALLUCINATION,
  ];
  if (research || isResearchModel(model)) {
    base.push("Faqat tasdiqlangan manbalardan javob ber va har bir da'voni manba raqami [n] bilan asosla.");
  }
  if (extra) base.push(extra);
  return base.join(" ");
}

/**
 * Til va yozuv izchilligi: javob lotin/kirill o'zbekcha orasida "sakramasin" va
 * so'ralmagan holda rus/ingliz tiliga o'tib ketmasin. Server script-check.ts
 * bilan buzilishlarni logga yozadi (to'smaydi).
 */
export const LANGUAGE_SCRIPT_RULE = [
  "TIL VA YOZUV (QAT'IY):",
  "1. Javobni foydalanuvchining OXIRGI xabari qaysi tilda VA qaysi yozuvda bo'lsa, aynan shu til va yozuvda yoz.",
  "2. O'zbekcha lotinda yozsa — butun javob faqat lotinda; oʻ va gʻ harflarini ʻ (U+02BB) bilan, tutuq belgisini ʼ (U+02BC) bilan yoz (masalan: oʻzbek, gʻoya, maʼlumot).",
  "3. O'zbekcha kirillda yozsa — butun javob faqat kirillda, o'zbek harflari bilan (ў, қ, ғ, ҳ); bu rus tili EMAS, ruscha so'z va grammatika ishlatma.",
  "4. Bitta javobda lotin va kirill yozuvini HECH QACHON aralashtirma (kod, fayl/model nomlari, atamalar va iqtiboslar bundan mustasno).",
  "5. Foydalanuvchi aniq so'ramasa, rus yoki ingliz tiliga o'tma. Oxirgi xabar tilini aniqlab bo'lmasa (faqat kod, havola, rasm) — quyidagi JAVOB TILI ko'rsatmasiga amal qil.",
].join(" ");

/**
 * "Generative UI" — model javob ichida jonli komponent chiza oladi. Kod emas,
 * faqat JSON spetsifikatsiyasi; uni Markdown.tsx GenerativeUI'ga uzatadi.
 */
export const GENERATIVE_UI = [
  "JONLI KO'RINISH: raqam, taqqoslash, reja yoki ro'yxat javobni tushunarli qiladigan bo'lsa,",
  "matn o'rniga ```sovereign-ui``` blokida FAQAT JSON yoz (izohsiz, bitta blok).",
  "Ruxsat etilgan turlar:",
  '1) {"type":"kpi","title":"...","items":[{"label":"...","value":"...","hint":"..."}]}',
  '2) {"type":"chart","chart":"bar|line|area|pie","title":"...","xKey":"oy","series":[{"key":"savdo","label":"Savdo"}],"data":[{"oy":"Yan","savdo":120}]}',
  '3) {"type":"table","title":"...","columns":["A","B"],"rows":[["1","2"]]}',
  '4) {"type":"steps","title":"...","items":[{"title":"Qadam","detail":"izoh"}]}',
  '5) {"type":"checklist","title":"...","items":["birinchi","ikkinchi"]}',
  "Foydalanuvchi kod, fayl, sayt yoki taqdimot so'rasa — sovereign-ui bloki bilan reja chizma, to'g'ridan-to'g'ri to'liq kodni yoz.",
  "Qoidalar: raqamlarni o'ylab topma — faqat foydalanuvchi bergan yoki manbadagi ma'lumot.",
  "Ma'lumot yo'q bo'lsa jonli ko'rinish ishlatma. Blokdan oldin 1-2 gap izoh yoz.",
  "Oddiy savolga (salom, qisqa ta'rif, kod) jonli ko'rinish KERAK EMAS.",
].join(" ");

/**
 * Faktual xatolarni (gallyusinatsiya) 30-50% kamaytiruvchi asosiy qoida.
 * Modelga "bilmayman deb aytishga" ijozat beradi va aniqroq faktlar so'rashi
 * mumkinligini aytadi.
 */
export const ANTI_HALLUCINATION = [
  "QAT'IY QOIDA (gallyusinatsiyaga qarshi):",
  "1. Agar biror faktga (sana, ism, statistika, funksiya nomi, kutubxona versiyasi) qat'iy ishonchli bo'lmasang — \"bilmayman\" yoki \"tekshirish kerak\" deb yoz. HECH QACHON to'qib chiqarma.",
  "2. Yo'l, URL, API endpoint, raqamli qiymatlarni faqat manbadan olib yoz. O'ylab topib yozma.",
  "3. Kod yozganingda mavjud bo'lgan kutubxonalar va funksiyalarnigina ishlatishga urin. Ishlatgan har bir sinov qilinmagan API ni \"tekshirish kerak\" deb belgila.",
  "4. HARAKAT USTUVOR: so'rov mavzusi va maqsadi tushunarli bo'lsa (kod, sayt, taqdimot, dizayn, matn, tahlil) — DARHOL to'liq bajar. Aytilmagan tafsilotlarga (rang, uslub, bo'limlar soni, tuzilma) o'zing oqilona, professional standart tanlov qil; javob OXIRIDA 1-2 qatorda qanday taxminlar qilganingni yozib, o'zgartirishni taklif qil. Reja yoki savollar ro'yxati bajarilgan ishning o'rnini BOSMAYDI.",
  "5. Savol faqat bajarib bo'lmaydigan holatda: natija butunlay foydalanuvchiga xos ma'lumotga bog'liq bo'lsa (uning ismi, kompaniyasi, aniq raqamlari, login/kalit, qaysi fayl) yoki so'rovning ikki xil ma'nosi butunlay boshqa natija bersa. Unda eng ko'pi 1-3 ta qisqa savol ber va to'xta. Bir vazifa bo'yicha faqat BIR MARTA so'ra: foydalanuvchi javob bergan, so'rovni takrorlagan yoki \"qil/o'zing tanla/davom et\" degan bo'lsa — boshqa savol bermay darhol bajar.",
  "6. Muhim yoki qaytarib bo'lmaydigan ishda (fayl o'chirish, xabar yuborish, to'lov) — taxminga tayanma, avval so'rab tasdiqla.",
].join(" ");

/**
 * RAG konteksti (bilim bazasi hujjatlari) bilan javob berilganda ishlatiladi:
 * modelga faqat berilgan matn ichidan javob berishga majburlaydi.
 */
export const GROUNDED_GENERATION =
  "MUHIM: Yuqorida keltirilgan Bilim Bazasi ma'lumotlariga TAYANIB javob ber. " +
  "Har bir da'voga qavs ichida hujjat nomini yoz (masalan: [architecture.pdf]). " +
  "Agar javob berilgan matnda YO'Q bo'lsa — \"bu bilim bazangizda ko'rsatilmagan\" deb yoz va o'zingdan qo'shma.";

/** Plan-level guardrail for cheap tiers: simple chat, no large code deliverables. */
export const SIMPLE_CHAT_GUARDRAIL =
  "Bu foydalanuvchi tekin/oddiy tarifda. Oddiy savolga javobni qisqa va sodda tut (3-6 gap). " +
  "Ammo kod yoki sayt so'ralsa — RAD ETMA va tarifni eslatma: to'liq, ISHLAYDIGAN o'rtacha hajmli kod yoz " +
  "(odatda bitta fayl). Kodni yarim tashlab ketma — agar uzun bo'lsa oxirigacha yetkaz. " +
  "Ortiqcha izoh yozma, faqat kerakli kod va 1-2 gap tushuntirish.";

/**
 * Upstream kutish chegaralari. Osilib qolgan provayder (masalan, "resource
 * pressure"dagi OmniRoute) butun zaxira zanjirini maxDuration tugaguncha
 * to'xtatib qo'ymasin — vaqt o'tsa keyingi nomzodga o'tamiz.
 */
/** Javob sarlavhalari (birinchi bayt) kelguncha. */
const CONNECT_TIMEOUT_MS = 30_000;
/** Zaxira shlyuzlar uchun qisqaroq — zanjir maxDuration ichida tugashi uchun. */
const RESCUE_CONNECT_TIMEOUT_MS = 20_000;
/** Oqim bo'laklari orasidagi eng uzun jimlik. */
const IDLE_TIMEOUT_MS = 45_000;
/** Perplexity qidiruv bosqichlari orasida uzoqroq jim turishi mumkin. */
const PPLX_IDLE_TIMEOUT_MS = 60_000;

/** Upstream belgilangan vaqtda javob bermadi (ulanish yoki oqim jim qoldi). */
class UpstreamTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UpstreamTimeoutError";
  }
}

/**
 * fetch + birinchi bayt uchun taymaut. Taymaut faqat sarlavhalar kelguncha
 * ishlaydi (keyin tozalanadi) — oqimni readSse'ning jimlik taymeri kuzatadi.
 * Foydalanuvchi to'xtatsa (signal) — odatdagidek AbortError.
 */
async function fetchUpstream(
  url: string,
  init: RequestInit,
  signal: AbortSignal | undefined,
  timeoutMs = CONNECT_TIMEOUT_MS,
): Promise<Response> {
  const connect = new AbortController();
  const timer = setTimeout(
    () => connect.abort(new UpstreamTimeoutError(`upstream ${timeoutMs}ms ichida javob bermadi`)),
    timeoutMs,
  );
  try {
    return await fetch(url, { ...init, signal: signal ? AbortSignal.any([signal, connect.signal]) : connect.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Foydalanuvchi so'rovni o'zi to'xtatganmi (unda xato emas — jim yopiladi). */
function userAborted(opts: { signal?: AbortSignal }): boolean {
  return !!opts.signal?.aborted;
}

/** Parses an SSE body into the JSON objects carried by `data:` lines. */
async function* readSse(
  body: ReadableStream<Uint8Array>,
  idleMs = IDLE_TIMEOUT_MS,
): AsyncGenerator<Record<string, unknown>> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      // Bo'laklar orasida idleMs'dan uzoq jimlik — oqim osilib qolgan.
      let timer: ReturnType<typeof setTimeout> | undefined;
      const idle = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new UpstreamTimeoutError(`oqim ${idleMs}ms jim qoldi`)), idleMs);
      });
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await Promise.race([reader.read(), idle]);
      } finally {
        clearTimeout(timer);
      }
      const { value, done } = chunk;
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const raw of lines) {
        const line = raw.trim();
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") return;
        try {
          yield JSON.parse(data) as Record<string, unknown>;
        } catch {
          // partial / keep-alive line
        }
      }
    }
  } finally {
    // Taymaut, erta chiqish yoki xato — upstream ulanishini yopamiz.
    reader.cancel().catch(() => {});
  }
}

/**
 * Javob tanasi: SSE oqimi yoki (oqimsiz model, masalan Cloudflare'dagi gpt-oss) bitta JSON.
 * JSON — bitta SSE bo'lagi shakliga keltiriladi, shunda o'qish kodi bir xil qoladi.
 */
async function* readChunks(res: Response, idleMs = IDLE_TIMEOUT_MS): AsyncGenerator<Record<string, unknown>> {
  const type = res.headers.get("content-type") ?? "";
  if (type.includes("application/json") && !type.includes("event-stream")) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new Error("upstream JSON javobi o'qilmadi");
    }
    const chunk = jsonCompletionToChunk(body);
    if (chunk) yield chunk as unknown as Record<string, unknown>;
    return;
  }
  yield* readSse(res.body!, idleMs);
}

/** Oqimsiz so'rovda sarlavhalar butun javob tayyor bo'lgach keladi — ulanish kutilishi uzunroq. */
const NON_STREAM_CONNECT_TIMEOUT_MS = 90_000;

/**
 * Provayderning xom xatosini foydalanuvchi tilidagi umumiy xabarga aylantiradi.
 * Xom matn (balans, provayder/model nomlari) faqat server logiga yoziladi.
 */
function friendlyError(raw: string, code: number, lang: Lang, fallback: TKey = "chErrRequestFailed"): string {
  if (code === 429 || /rate-limited|rate limit|daily free allocation|neurons/i.test(raw)) return translate(lang, "chErrModelBusy");
  if (code === 402 || /credits|billing|payment|can only afford/i.test(raw)) return translate(lang, "chErrServerConfig");
  if (code >= 500) return translate(lang, "chErrProviderTemporary");
  if (code === 401 || code === 403) return translate(lang, "chErrServerConfig");
  return translate(lang, fallback);
}

/**
 * HTTP xato javobini o'qiydi. `message` — foydalanuvchiga ko'rsatsa bo'ladigan
 * tarjima; `afford` — "can only afford N" bo'lsa N (low-credit qayta urinish uchun).
 */
async function errorMessage(
  res: Response,
  lang: Lang = DEFAULT_LANG,
): Promise<{ message: string; afford: number | null; soft: boolean }> {
  let rawMessage = `${res.status} ${res.statusText}`;
  let code = res.status;
  try {
    const j = (await res.json()) as {
      error?: { message?: string; code?: number; metadata?: { raw?: string } } | string;
      message?: string;
    };
    const cfMessage = cfErrorMessage(j);
    if (typeof j.error === "string") rawMessage = j.error;
    else if (j.error?.message) {
      rawMessage = j.error.metadata?.raw ?? j.error.message;
      // OpenRouter HTTP kodini tanada ham beradi; boshqa (masalan Cloudflare 4006) raqamlar HTTP emas.
      if (typeof j.error.code === "number" && j.error.code >= 100 && j.error.code < 600) code = j.error.code;
    } else if (cfMessage) rawMessage = cfMessage;
    else if (j.message) rawMessage = j.message;
  } catch {
    /* ignore */
  }
  // OmniRoute "resource pressure"ga tiqilib qolgan bo'lsa — fonda Railway restart.
  const omniBase = (process.env.OMNIROUTE_BASE_URL ?? "").replace(/\/$/, "");
  if (omniBase && res.url.startsWith(omniBase)) healOmniRouteIfStuck(res.status, rawMessage);
  // Xom xato faqat server logiga; foydalanuvchiga faqat generic xabar
  // qaytariladi — infra sirlarni (balans, provayderlar) fosh qilmaymiz.
  console.error(`[ai] upstream ${res.status}:`, rawMessage.slice(0, 500));
  const afford = /can only afford (\d+)/i.exec(rawMessage);
  return {
    message: friendlyError(rawMessage, code, lang),
    // low-credit auto-retry uchun (streamOpenRouter ichida ushlanadi)
    afford: afford ? Number(afford[1]) : null,
    soft: providerSideFailure(code, rawMessage),
  };
}

/* ------------------------------------------------------------------ */
/* OpenRouter (OpenAI chat-completions format)                          */
/* ------------------------------------------------------------------ */

type OrChunk = {
  /** Upstream haqiqatda javob berayotgan model (OpenAI formatidagi ko'p provayderlar qaytaradi). */
  model?: unknown;
  choices?: { delta?: { content?: string; reasoning?: string; reasoning_content?: string }; finish_reason?: string | null }[];
  error?: { message?: string; code?: number | string };
};

/** Chunk'dagi `model` maydoni (bo'lsa, qisqa va toza satr). */
function reportedModel(c: OrChunk): string | null {
  return typeof c.model === "string" && c.model.trim() ? c.model.trim().slice(0, 120) : null;
}

/** How many times a truncated answer may be continued automatically. */
const MAX_CONTINUATIONS = 4;

/**
 * Anthropic modellar OpenRouter orqali `cache_control` orqali system promptni
 * keshlashi mumkin — bu 90% arzon bo'ladi (~5 daqiqa TTL). Faqat system message
 * uzun (>1000 token taxminan) bo'lsa foydali, aks holda kesh cache-write o'zi
 * qimmat.
 */
function withPromptCache(model: SovereignModel, messages: ChatMessageInput[]): ChatMessageInput[] {
  if (!model.providerModel.startsWith("anthropic/")) return messages;
  const sys = messages.find((m) => m.role === "system");
  if (!sys) return messages;
  const text = typeof sys.content === "string" ? sys.content : textOf(sys.content);
  if (text.length < 2000) return messages; // ~500 tokendan kam bo'lsa kesh foyda bermaydi
  return messages.map((m) =>
    m.role === "system"
      ? {
          role: "system",
          content: [{ type: "text", text, cache_control: { type: "ephemeral" } }],
        }
      : m,
  );
}

/**
 * OpenAI-compatible gateways used when the primary providers fail. Each one is
 * enabled only by its env key, so nothing is sent anywhere the operator did not
 * configure. Order matters: the first configured gateway is tried first.
 */
function fallbackTargets(): { name: string; url: string; auth: string; model: string }[] {
  const out: { name: string; url: string; auth: string; model: string }[] = [];

  // Experiential Labs — zero-markup gateway (platform.experientiallabs.ai).
  if (process.env.EXPERIENTIAL_API_KEY) {
    out.push({
      name: "experiential",
      url: "https://api.experientiallabs.ai/v1/chat/completions",
      auth: process.env.EXPERIENTIAL_API_KEY,
      model: process.env.EXPERIENTIAL_MODEL ?? "claude-3-haiku",
    });
  }
  // Self-hosted OmniRoute instance (npm i -g omniroute). Key optional.
  if (process.env.OMNIROUTE_BASE_URL) {
    out.push({
      name: "omniroute",
      url: `${process.env.OMNIROUTE_BASE_URL.replace(/\/$/, "")}/chat/completions`,
      auth: process.env.OMNIROUTE_API_KEY ?? "unused",
      model: process.env.OMNIROUTE_MODEL ?? "auto",
    });
  }
  // Any other OpenAI-compatible gateway, configured by URL + key.
  if (process.env.GATEWAY_BASE_URL && process.env.GATEWAY_API_KEY) {
    out.push({
      name: "gateway",
      url: `${process.env.GATEWAY_BASE_URL.replace(/\/$/, "")}/chat/completions`,
      auth: process.env.GATEWAY_API_KEY,
      model: process.env.GATEWAY_MODEL ?? "auto",
    });
  }
  // Cloudflare Workers AI — gpt-oss-120b: neuron bo'yicha eng arzon (kunlik 10k tekin ulushini
  // tejaydi), ochiq og'irlik (mintaqa: faqat OFAC embargosi yopiq).
  if (cloudflareConfigured()) {
    out.push({ name: "cloudflare", ...cloudflareEndpoint(), model: CF.gptOss });
  }
  // Anonymous free tier — always available, so it goes last.
  out.push({
    name: "llm7",
    url: `${LLM7_BASE}/chat/completions`,
    auth: process.env.LLM7_API_KEY ?? "unused",
    model: LLM7_FREE_MODEL,
  });
  return out;
}

/**
 * Tries each configured fallback gateway in turn. Yields text and returns true
 * once one produced output; returns false so the caller can surface its own
 * error when they all fail.
 */
async function* streamFreeFallback(
  messages: ChatMessageInput[],
  opts: StreamOptions,
  maxTokens: number,
  exclude: string[] = [],
): AsyncGenerator<StreamEvent, boolean> {
  const plain = messages.map((m) => ({ role: m.role, content: textOf(m.content) }));

  // Mintaqa siyosati: zaxira shlyuz ham cheklangan provayderga (claude-3-haiku, "auto"
  // kombo, LLM7'dagi Mistral) yuborilmaydi. Shu so'rovda yiqilgan provayder (masalan
  // Cloudflare neuron limiti) qayta sinalmaydi.
  const targets = fallbackTargets().filter(
    (tg) => !exclude.includes(tg.name) && modelAllowedIn(tg.model, opts.country) && hostAllowedIn(tg.name, opts.country),
  );
  for (const target of targets) {
    const isCf = target.name === "cloudflare";
    const stream = !isCf || cfStreams(target.model);
    let res: Response;
    try {
      res = await fetchUpstream(
        target.url,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${target.auth}` },
          body: JSON.stringify({
            model: target.model,
            messages: plain,
            temperature: opts.temperature ?? 0.7,
            max_tokens: Math.min(maxTokens, 2048),
            stream,
          }),
        },
        opts.signal,
        stream ? RESCUE_CONNECT_TIMEOUT_MS : NON_STREAM_CONNECT_TIMEOUT_MS,
      );
    } catch (err) {
      if (userAborted(opts)) throw err;
      console.error(`[ai] zaxira ${target.name} ulanmadi:`, err);
      continue; // network error / timeout — try the next gateway
    }
    if (!res.ok || !res.body) {
      if (isCf) console.error(`[ai] zaxira cloudflare ${res.status}`);
      res.body?.cancel().catch(() => {});
      continue;
    }

    let produced = false;
    try {
      for await (const chunk of readChunks(res)) {
        const c = chunk as OrChunk;
        if (c.error?.message) break;
        const text = c.choices?.[0]?.delta?.content;
        if (text) {
          // Zaxira shlyuz — har doim so'ralgan modeldan boshqa model (shaffoflik uchun belgilanadi).
          const served = isCf ? cfId(target.model) : (reportedModel(c) ?? target.model);
          if (!produced) yield { type: "served", model: served, substituted: true, rescue: true };
          produced = true;
          yield { type: "text", text };
        }
      }
    } catch (err) {
      if (userAborted(opts)) throw err;
      console.error(`[ai] zaxira ${target.name} oqimi uzildi:`, err);
      if (produced) {
        // Javobning bir qismi ko'rsatildi — boshqa shlyuzdan qaytadan boshlab bo'lmaydi.
        yield { type: "error", message: translate(opts.lang ?? DEFAULT_LANG, "chErrProviderTemporary") };
        return true;
      }
      continue;
    }
    if (produced) {
      yield { type: "done" };
      return true;
    }
  }
  return false;
}

/** streamOpenRouter ichki holati: qayta urinish, davom ettirish va zaxira yo'li. */
interface RouteState {
  /** "can only afford N" — kamroq max_tokens bilan bir marta qayta urinildi. */
  retried?: boolean;
  /** Uzilgan javobni avtomatik davom ettirish soni. */
  continuation?: number;
  /** OmniRoute/RSI o'tkazib yuboriladi (ular xato bergandan keyin). */
  skipOmni?: boolean;
  /** Majburiy yo'l: OmniRoute katalog modeli, host prefiksli id yoki Cloudflare zaxirasi. */
  forced?: DirectRoute;
  /** Shu so'rovda provayder tomonida yiqilgan provayderlar — qayta tanlanmaydi. */
  exclude?: Provider[];
}

/** Bular yiqilsa shu model uchun "keyingi provayder" izlanmaydi (o'z yo'li bor yoki oxirgi zaxira). */
const NO_NEXT_PROVIDER: Provider[] = ["omniroute", "rsi", "tella", "llm7"];

async function* streamOpenRouter(
  model: SovereignModel,
  messages: ChatMessageInput[],
  opts: StreamOptions,
  maxTokens: number,
  state: RouteState = {},
): AsyncGenerator<StreamEvent> {
  const { retried = false, continuation = 0, skipOmni = false, forced } = state;
  const exclude = state.exclude ?? [];
  const lang = opts.lang ?? DEFAULT_LANG;
  const cached = withPromptCache(model, messages);
  let direct: DirectRoute | null = forced ?? null;
  if (!direct) {
    const picked = pickDirectRoute(model.providerModel, { skipOmni, country: opts.country, exclude });
    // Cloudflare birinchi: AYNAN shu model (DeepSeek, Kimi, GLM, Qwen, gpt-oss) Cloudflare'da bo'lsa —
    // OmniRoute/OpenRouter krediti o'rniga. Groq bundan mustasno (tezroq, bepul limiti kattaroq).
    // Cloudflare shu so'rovda yiqilsa (neuron limiti) — `exclude` orqali odatdagi yo'lga qaytadi.
    const cfFirst = picked?.provider === "groq" ? null : cloudflareRoute(model.providerModel, opts.country, { exclude, sameOnly: true });
    direct = cfFirst ?? picked;
  }
  // OpenRouter kaliti yo'q — Cloudflare'dagi AYNAN shu model (bo'lsa).
  if (!direct && !process.env.OPENROUTER_API_KEY) {
    direct = cloudflareRoute(model.providerModel, opts.country, { exclude, sameOnly: true });
  }
  const isCf = direct?.provider === "cloudflare";

  // Direct route ishlatiladigan bo'lsa uni ishlatamiz — Groq / OpenAI direct
  // OpenRouter proxysidan tezroq va ishonchliroq.
  const url = direct ? direct.url : `${OPENROUTER_BASE}/chat/completions`;
  const auth = direct ? direct.auth : process.env.OPENROUTER_API_KEY!;
  const modelId = direct ? direct.model : model.providerModel;
  // Cloudflare'dagi ba'zi modellar (gpt-oss) oqimsiz — butun javob bitta bo'lak bo'lib keladi.
  const stream = !isCf || cfStreams(modelId);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${auth}`,
  };
  if (!direct) {
    headers["HTTP-Referer"] = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    headers["X-Title"] = "SOVEREIGN AI";
  }

  const body: Record<string, unknown> = {
    model: modelId,
    // Cloudflare: faqat matn (multimodal qismlar va cache_control yuborilmaydi).
    messages: isCf ? messages.map((m) => ({ role: m.role, content: textOf(m.content) })) : cached,
    temperature: opts.temperature ?? 0.7,
    max_tokens: maxTokens,
    stream,
  };
  if (!direct) {
    // OpenRouter-specific transforms + fallback pool
    body.transforms = ["middle-out"];
    body.route = "fallback";
    if (model.category === "free") {
      body.models = [
        model.providerModel,
        // OpenRouter o'zi almashtiradigan tekin zaxiralar ham mintaqa siyosatiga bo'ysunadi.
        ...FREE_FALLBACKS.filter((m) => m !== model.providerModel && modelAllowedIn(m, opts.country)).slice(0, 2),
      ];
    }
  }

  /**
   * Provayder tomonidagi xatodan keyingi yo'l (bo'lmasa null):
   *  1) to'g'ridan-to'g'ri provayder (Groq 429, Cloudflare neuron limiti ...) — shu model uchun
   *     keyingi provayder, ular tugasa OpenRouter;
   *  2) OpenRouter / OmniRoute / host yo'li (402 kredit, kvota) — Cloudflare'dagi shu model yoki
   *     sinf ekvivalenti. Haqiqiy model "served" orqali ochiq ko'rsatiladi.
   */
  function nextRoute(): RouteState | null {
    const failed = direct?.provider;
    if (direct && !forced && failed && !NO_NEXT_PROVIDER.includes(failed)) {
      // Cloudflare (birinchi urinish) yiqilsa — OmniRoute ham sinalsin (u o'tkazib yuborilmagan edi).
      return { skipOmni: failed === "cloudflare" ? !!skipOmni : true, exclude: [...exclude, failed] };
    }
    if (isCf || failed === "tella" || failed === "llm7" || isOwnModel(model.providerModel)) return null;
    // Katalog modeli bo'lsa uning tarifi (narx nazorati); sintetik (OmniRoute/host) id — nomidan.
    const tier = MODEL_BY_ID[model.id] ? model.tier : undefined;
    const cf = cloudflareRoute(model.providerModel, opts.country, { exclude, tier });
    if (!cf) return null;
    return { skipOmni: true, forced: cf, exclude: failed ? [...exclude, failed] : exclude };
  }

  // Provayder xato bersa, javob bermasa yoki uzilib qolsa — bitta umumiy zanjir.
  async function* failover(message: string, soft = true): AsyncGenerator<StreamEvent> {
    // OmniRoute/RSI (asosiy yo'l) tugagan/xato bergan bo'lsa — xuddi shu modelni
    // to'g'ridan-to'g'ri provayder yoki OpenRouter orqali qayta urinamiz.
    // OmniRoute katalog modeli (forced) bundan mustasno: uning id'si OpenRouter
    // id'si emas va u yerda tarif tekshiruvidan o'tmagan modelga olib borishi mumkin.
    if ((direct?.provider === "omniroute" || direct?.provider === "rsi") && !skipOmni && !forced) {
      yield* streamOpenRouter(model, messages, opts, maxTokens, { retried, continuation, skipOmni: true, exclude });
      return;
    }
    const next = soft ? nextRoute() : null;
    if (next) {
      const to = next.forced ? `cloudflare:${next.forced.model}` : "next-provider";
      console.warn(`[ai] ${direct?.provider ?? "openrouter"} (${modelId}) yiqildi → ${to}`);
      yield* streamOpenRouter(model, messages, opts, maxTokens, { retried, continuation, ...next });
      return;
    }
    // Last resort: the anonymous free tier, so the chat still answers when the
    // paid/keyed providers are out of credit or rate-limited. O'z modelimiz
    // (Tella) uchun emas — begona javob "Tella 2" nomi bilan ko'rinmasin; chat
    // route boshqa modelga ochiq ("switch") o'tadi.
    const own = direct?.provider === "tella" || isOwnModel(model.providerModel);
    if (direct?.provider !== "llm7" && !own && opts.freeRescue !== false) {
      const failed = direct ? [...exclude, direct.provider] : exclude;
      const rescued = yield* streamFreeFallback(messages, opts, maxTokens, failed);
      if (rescued) return;
    }
    yield { type: "error", message };
  }

  // OpenRouter kaliti ham, muqobil yo'l ham yo'q — kalitsiz so'rov yubormaymiz.
  if (!direct && !process.env.OPENROUTER_API_KEY) {
    console.error(`[ai] ${model.providerModel}: OPENROUTER_API_KEY yo'q`);
    yield* failover(translate(lang, "chErrServerConfig"));
    return;
  }

  let res: Response;
  try {
    res = await fetchUpstream(
      url,
      { method: "POST", headers, body: JSON.stringify(body) },
      opts.signal,
      stream ? CONNECT_TIMEOUT_MS : NON_STREAM_CONNECT_TIMEOUT_MS,
    );
  } catch (err) {
    // Foydalanuvchi to'xtatdi — xato emas, chat route jim yopadi.
    if (userAborted(opts)) throw err;
    // Tarmoq xatosi yoki taymaut — generatordan otilmaydi (aks holda chat route
    // zaxira nomzodlarni sinamay umumiy xato beradi), odatdagi zanjirga o'tadi.
    console.error(`[ai] ${direct?.provider ?? "openrouter"} ulanmadi:`, err);
    yield* failover(translate(lang, "chErrProviderTemporary"));
    return;
  }

  if (!res.ok || !res.body) {
    const { message, afford, soft } = await errorMessage(res, lang);
    // Low-credit accounts: "You requested up to N tokens, but can only afford M."
    if (afford !== null && !retried) {
      const allowed = Math.max(256, afford - 64);
      yield* streamOpenRouter(model, messages, opts, allowed, { ...state, retried: true });
      return;
    }
    yield* failover(message, soft);
    return;
  }

  let produced = "";
  let finish: string | null = null;
  // <think>...</think> ni javobdan ajratib "reasoning" sifatida chiqaramiz
  // (tag ikki chunk orasida bo'linsa ham ishlaydi — oxirgi bir necha belgini ushlaymiz).
  let thinking = false;
  let pending = "";
  function* splitThink(flush = false): Generator<StreamEvent> {
    for (;;) {
      if (!thinking) {
        const i = pending.indexOf("<think>");
        if (i === -1) {
          const keep = flush ? 0 : 7;
          const safe = pending.length > keep ? pending.slice(0, pending.length - keep) : "";
          if (safe) { produced += safe; yield { type: "text", text: safe }; pending = pending.slice(safe.length); }
          break;
        }
        if (i > 0) { const t = pending.slice(0, i); produced += t; yield { type: "text", text: t }; }
        pending = pending.slice(i + 7);
        thinking = true;
      } else {
        const j = pending.indexOf("</think>");
        if (j === -1) {
          const keep = flush ? 0 : 8;
          const safe = pending.length > keep ? pending.slice(0, pending.length - keep) : "";
          if (safe) { yield { type: "reasoning", text: safe }; pending = pending.slice(safe.length); }
          break;
        }
        if (j > 0) yield { type: "reasoning", text: pending.slice(0, j) };
        pending = pending.slice(j + 8);
        thinking = false;
      }
    }
  }
  // Birinchi mazmunli bo'lakda: upstream haqiqatda qaysi model bilan javob beryapti.
  // Model maydoni bo'lmasa — biz so'ragan id (to'g'ridan-to'g'ri yo'nalishda u
  // tanlangan modeldan farq qilishi mumkin: masalan Groq'dagi o'rinbosar).
  let servedSent = false;
  try {
    for await (const chunk of readChunks(res)) {
      const c = chunk as OrChunk;
      if (!servedSent && !c.error?.message && c.choices?.length) {
        servedSent = true;
        // Cloudflare — badge'da provayder ham ko'rinsin: "cloudflare/@cf/deepseek-ai/...".
        const served = isCf ? cfId(modelId) : (reportedModel(c) ?? modelId);
        if (!modelAllowedIn(served, opts.country)) {
          // Upstream o'zi boshqa (cheklangan) modelga yo'naltirgan — bu yo'lni yopish uchun log.
          console.warn(`[region] upstream cheklangan modelga yo'naltirdi: ${modelId} → ${served} (${opts.country})`);
        }
        yield { type: "served", model: served, substituted: isSubstitution(model.providerModel, served) };
      }
      if (c.error?.message) {
        // Oqim ichidagi xato: xom matn faqat logga, foydalanuvchiga tarjima.
        console.error(`[ai] ${direct?.provider ?? "openrouter"} oqim xatosi:`, c.error.message.slice(0, 500));
        const code = typeof c.error.code === "number" ? c.error.code : Number(c.error.code) || 0;
        const message = friendlyError(c.error.message, code, lang, "chErrProviderTemporary");
        // Hali matn chiqmagan (OpenRouter 200 + birinchi bo'lakda "credits" xatosi) — zanjir davom etadi.
        if (!produced && !pending) {
          yield* failover(message, providerSideFailure(code, c.error.message));
          return;
        }
        yield { type: "error", message };
        return;
      }
      const choice = c.choices?.[0];
      if (choice?.finish_reason) finish = choice.finish_reason;
      const reason = choice?.delta?.reasoning ?? choice?.delta?.reasoning_content;
      if (reason) yield { type: "reasoning", text: reason };
      const text = choice?.delta?.content;
      if (text) {
        pending += text;
        yield* splitThink();
      }
    }
  } catch (err) {
    if (userAborted(opts)) throw err;
    // Oqim uzildi yoki jim qoldi (taymaut). Hali matn chiqmagan bo'lsa — odatdagi
    // zaxira zanjiri; aks holda xato (chat route qisman javobni saqlab to'xtaydi).
    console.error(`[ai] ${direct?.provider ?? "openrouter"} oqimi uzildi:`, err);
    if (!produced) {
      yield* failover(translate(lang, "chErrProviderTemporary"));
      return;
    }
    if (pending) yield* splitThink(true);
    yield { type: "error", message: translate(lang, "chErrProviderTemporary") };
    return;
  }
  if (pending) yield* splitThink(true);

  // Uzun kod yoki maqola max_tokens ga urilsa javob yarim qoladi. Foydalanuvchini
  // "davom et" deb yozishga majburlamay, o'zimiz davom ettiramiz.
  if (finish === "length" && produced.trim() && continuation < MAX_CONTINUATIONS) {
    yield* streamOpenRouter(
      model,
      [
        ...messages,
        { role: "assistant", content: produced },
        {
          role: "user",
          content:
            "Javobing token chegarasiga yetib yarim uzilib qoldi. AYNAN uzilgan belgidan davom ettir. " +
            "Salomlashma, oldingi qismni takrorlama, izoh yozma — to'g'ridan-to'g'ri davomini yoz. " +
            "Kod blokining o'rtasida uzilgan bo'lsang, yangi ``` ochma — kodning davomini yoz.",
        },
      ],
      opts,
      maxTokens,
      // Davomi ham o'sha yo'lda qolsin (katalog/Cloudflare zaxirasi — forced; yiqilgan
      // provayderlar — exclude), aks holda yarmi boshqa provayder/modeldan kelardi.
      { retried, continuation: continuation + 1, skipOmni, forced: forced ?? (isCf && direct ? direct : undefined), exclude },
    );
    return;
  }
  yield { type: "done" };
}

/* ------------------------------------------------------------------ */
/* Perplexity Agent API (/v1/responses, OpenAI Responses format)        */
/* ------------------------------------------------------------------ */

type PplxResult = { url?: string; title?: unknown; snippet?: unknown; date?: unknown };

type PplxEvent = {
  type?: string;
  delta?: string;
  results?: PplxResult[];
  item?: { type?: string; results?: PplxResult[] };
  response?: {
    status?: string;
    error?: { message?: string } | null;
    output?: { type?: string; results?: PplxResult[]; content?: { type?: string; text?: string }[] }[];
  };
  error?: { message?: string };
  message?: string;
};

const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);

/** search_results → citations (URL tartibi) + verifier uchun sarlavha/snippet (bo'lsa). */
function collectResults(results: PplxResult[] | undefined, citations: string[], meta: Map<string, SearchSource>) {
  for (const r of results ?? []) {
    const url = typeof r.url === "string" && r.url.length > 0 ? r.url : "";
    if (!url) continue;
    if (!citations.includes(url)) citations.push(url);
    const prev = meta.get(url);
    meta.set(url, {
      url,
      title: prev?.title ?? str(r.title, 300),
      snippet: prev?.snippet ?? str(r.snippet, 1200),
      date: prev?.date ?? str(r.date, 40),
    });
  }
}

async function* streamPerplexity(
  model: SovereignModel,
  messages: ChatMessageInput[],
  opts: StreamOptions,
): AsyncGenerator<StreamEvent> {
  const system = textOf(messages.find((m) => m.role === "system")?.content ?? "");
  const input = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role, content: textOf(m.content) }));

  const lang = opts.lang ?? DEFAULT_LANG;
  let res: Response;
  try {
    res = await fetchUpstream(
      `${PERPLEXITY_BASE}/v1/responses`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`,
        },
        body: JSON.stringify({
          preset: PERPLEXITY_PRESET[model.providerModel] ?? "fast",
          input,
          instructions: system,
          max_output_tokens: opts.maxTokens ?? 1500,
          stream: true,
        }),
      },
      opts.signal,
    );
  } catch (err) {
    if (userAborted(opts)) throw err;
    // Tarmoq xatosi/taymaut — "error" hodisasi, chat route keyingi nomzodga o'tadi.
    console.error("[ai] perplexity ulanmadi:", err);
    yield { type: "error", message: translate(lang, "chErrPerplexity") };
    return;
  }

  if (!res.ok || !res.body) {
    yield { type: "error", message: (await errorMessage(res, lang)).message };
    return;
  }

  // Perplexity o'z presetida javob beradi — boshqa modelga almashtirmaydi.
  yield { type: "served", model: `perplexity/${PERPLEXITY_PRESET[model.providerModel] ?? "fast"}`, substituted: false };

  const citations: string[] = [];
  const meta = new Map<string, SearchSource>();
  const citationsEvent = (): StreamEvent => ({
    type: "citations",
    citations: [...citations],
    sources: citations.map((u) => meta.get(u) ?? { url: u }),
  });
  let sentCount = 0;
  let text = "";

  try {
    for await (const chunk of readSse(res.body, PPLX_IDLE_TIMEOUT_MS)) {
      const ev = chunk as PplxEvent;
      const type = ev.type ?? "";

      if (type === "response.output_text.delta" && typeof ev.delta === "string") {
        text += ev.delta;
        yield { type: "text", text: ev.delta };
        continue;
      }

      if (type === "response.reasoning.search_results" || ev.item?.type === "search_results") {
        collectResults(ev.results ?? ev.item?.results, citations, meta);
        if (citations.length > sentCount) {
          sentCount = citations.length;
          yield citationsEvent();
        }
        continue;
      }

      if (type === "response.failed" || type === "error" || ev.error) {
        // Xom xato faqat logga; foydalanuvchiga tarjima qilingan umumiy xabar.
        const raw = ev.response?.error?.message ?? ev.error?.message ?? ev.message ?? "";
        if (raw) console.error("[ai] perplexity oqim xatosi:", raw.slice(0, 500));
        yield { type: "error", message: friendlyError(raw, 0, lang, "chErrPerplexity") };
        return;
      }

      if (type === "response.completed" && ev.response?.output) {
        for (const item of ev.response.output) {
          if (item.type === "search_results" || Array.isArray(item.results)) {
            collectResults(item.results, citations, meta);
          }
          // Fallback: no deltas were streamed → emit the final text once.
          if (!text && item.type === "message" && item.content) {
            const full = item.content.map((c) => c.text ?? "").join("");
            if (full) {
              text = full;
              yield { type: "text", text: full };
            }
          }
        }
        // Yakuniy natijada snippet/sarlavha to'ldirilgan bo'lishi mumkin — verifier uchun
        // har doim oxirgi holat yuboriladi (route mijozga faqat URL ro'yxatini uzatadi).
        if (citations.length) {
          sentCount = citations.length;
          yield citationsEvent();
        }
      }
    }
  } catch (err) {
    if (userAborted(opts)) throw err;
    // Oqim uzildi yoki jim qoldi — otilmaydi, "error" hodisasi bo'ladi.
    console.error("[ai] perplexity oqimi uzildi:", err);
    yield { type: "error", message: translate(lang, "chErrPerplexity") };
    return;
  }
  yield { type: "done" };
}

/* ------------------------------------------------------------------ */

export interface StreamOptions {
  modelId: string;
  messages: ChatMessageInput[];
  research?: boolean;
  temperature?: number;
  maxTokens?: number;
  /** Extra system-prompt clause (plan guardrails). */
  extraSystem?: string;
  signal?: AbortSignal;
  /** Interfeys tili — foydalanuvchiga ko'rinadigan xato matnlari uchun. */
  lang?: Lang;
  /**
   * false — model yiqilsa tekin shlyuzlar (LLM7 va h.k.) jim javob bermaydi,
   * "error" qaytadi va chaqiruvchi o'z navbatidagi keyingi nomzodga ("switch")
   * o'tadi. Faqat oxirgi nomzod uchun true (standart: true — eski xatti-harakat).
   */
  freeRescue?: boolean;
  /**
   * Foydalanuvchi mintaqasi (ISO-2, serverda aniqlangan — region-server.ts). Berilsa,
   * provayderi shu mintaqaga xizmat ko'rsatmaydigan model/host HECH QACHON chaqirilmaydi.
   */
  country?: string | null;
  /**
   * Foydalanuvchi tarifi (chat route: plan.id). Mesh aynan so'ralgan modelning har bir yo'li
   * (offer) tarifini shu bilan solishtiradi: ":free" modelning pullik varianti Free'ga, upstream
   * nomi bilan so'ralgan Ultra model Pro'ga berilmaydi. Berilmasa — model tarifi.
   */
  planTier?: PlanTier;
  /**
   * "O'ylab javob" (thinking) marshrut afzalligi — lib/chat/thinking.ts `resolveThinking`
   * qaytaradi: true — fikrlaydigan modelga ustunlik (pullik tarif, chip yoqilgan);
   * false — tez (flash) modelga ustunlik (Free tarifi); berilmasa — farqi yo'q.
   * Qat'iy filtr emas: mos model bo'lmasa oddiy model javob beradi.
   */
  thinking?: boolean;
  /**
   * Butun so'rovning umumiy muddati (epoch ms). Chat route bir nechta nomzodni ketma-ket
   * chaqirganda ham maxDuration (120 s) dan oshmasin — har urinish taymauti = min(taymaut, qolgan).
   */
  deadline?: number;
  /** Shu so'rovda oldingi nomzodlarda butunlay yiqilgan mesh provayderlari — qayta chaqirilmaydi. */
  exclude?: readonly string[];
  /** Mesh provayderi butunlay yiqildi (auth, 5xx, provayder limiti) — chaqiruvchi keyingi nomzodlarga `exclude` qiladi. */
  onProviderFailed?: (provider: string) => void;
}

/** Tashqi (chat route) exclude ro'yxati → mesh ProviderId'lari. */
function meshExclude(list: readonly string[] | undefined): ProviderId[] {
  if (!list?.length) return [];
  const known = new Set<string>(PROVIDER_IDS);
  return [...new Set(list.filter((p) => known.has(p)))] as ProviderId[];
}

/** Streams a completion from OpenRouter (or Perplexity for research models). */
/** OmniRoute katalog id — "provider/model" ko'rinishida, curated ro'yxatda yo'q. */
export function isOmniCatalogId(id: string): boolean {
  return typeof id === "string" && id.includes("/") && !MODEL_BY_ID[id];
}

function omniCatalogRoute(modelId: string): DirectRoute | null {
  const base = process.env.OMNIROUTE_BASE_URL;
  const auth = process.env.OMNIROUTE_API_KEY;
  if (!base || !auth) return null;
  return { url: `${base.replace(/\/$/, "")}/chat/completions`, auth, model: modelId, provider: "omniroute" };
}

/** OmniRoute katalog / host prefiksli model uchun yengil sintetik SovereignModel (brend emas). */
function syntheticOmniModel(id: string, provider = "OmniRoute"): SovereignModel {
  const short = id.split("/").pop() ?? id;
  return {
    id,
    name: short,
    shortName: short,
    provider,
    theme: "sovereign",
    cost: "free",
    category: "free",
    tier: "free",
    providerModel: id,
    price: "TEKIN",
    glyph: "✦",
    tagline: `${provider} katalog`,
    description: "",
    primary: "#7C6FF7",
    accent: "#7C6FF7",
    bg: "#0D1033",
    capabilities: [],
    demo: { user: "", ai: "" },
  };
}

/** Katalogda yo'q id uchun sintetik model provayder yorlig'i (system prompt'da). */
function hostLabel(id: string): string {
  if (id.startsWith(CF_PREFIX)) return "Cloudflare";
  if (id.startsWith("groq/")) return "Groq";
  return "OmniRoute";
}

/**
 * Web chat — Provider Mesh orqali (docs/MESH.md): yo'l tanlash, sog'liq (circuit breaker, kvota),
 * yukni yoyish, failover, halol "served" — hammasi mesh/execute.ts meshStream'da. Bu yerda faqat
 * katalog/sintetik model, system prompt, research (Perplexity) va mock qoladi.
 */
async function* streamViaMesh(opts: StreamOptions): AsyncGenerator<StreamEvent> {
  const lang = opts.lang ?? DEFAULT_LANG;
  const catalog = MODEL_BY_ID[opts.modelId];
  if (!catalog && !isOmniCatalogId(opts.modelId)) {
    yield { type: "error", message: fmt(translate(lang, "chErrUnknownModelId"), { id: opts.modelId }) };
    return;
  }
  if (catalog && !hasKeyFor(catalog)) {
    // Production'da soxta javob berib bo'lmaydi — xato, chat route boshqa (sozlangan) modelga o'tadi.
    if (process.env.NODE_ENV === "production") {
      yield { type: "error", message: fmt(translate(lang, "chErrModelNotConnected"), { model: catalog.name }) };
      return;
    }
    yield* mockStream(catalog, opts.messages);
    return;
  }
  const model = catalog ?? syntheticOmniModel(opts.modelId, hostLabel(opts.modelId));
  const messages: ChatMessageInput[] = [
    { role: "system", content: buildSystemPrompt(model, !!opts.research, opts.extraSystem) },
    ...opts.messages.filter((m) => m.role !== "system"),
  ];
  // Research (Perplexity /v1/responses) — o'z protokoli, citations bilan (mesh execute qo'llamaydi).
  if (catalog && isResearchModel(catalog)) {
    yield* streamPerplexity(catalog, messages, opts);
    return;
  }
  yield* meshStream({
    req: webRouteRequest({
      modelId: opts.modelId,
      messages,
      country: opts.country,
      freeRescue: opts.freeRescue,
      ownModel: isOwnModel(model.providerModel),
      planTier: opts.planTier,
      ...(opts.thinking === undefined ? {} : { thinking: opts.thinking }),
      exclude: meshExclude(opts.exclude),
    }),
    body: { messages, temperature: opts.temperature ?? 0.7, max_tokens: opts.maxTokens ?? 2048 },
    signal: opts.signal,
    lang,
    ...(opts.deadline ? { deadline: opts.deadline } : {}),
    onAttempt: (a) => {
      if (!a.ok && a.error && providerWideFailure(a.error)) opts.onProviderFailed?.(a.provider);
    },
  });
}

/** SOVEREIGN_MESH=shadow: eski zanjir ishlaydi, mesh qaysi nomzodlarni tanlardi — faqat logga. */
function logShadowPlan(opts: StreamOptions): void {
  try {
    const catalog = MODEL_BY_ID[opts.modelId];
    if (catalog && isResearchModel(catalog)) return;
    const req = webRouteRequest({
      modelId: opts.modelId,
      messages: opts.messages,
      country: opts.country,
      freeRescue: opts.freeRescue,
      ownModel: catalog ? isOwnModel(catalog.providerModel) : false,
      planTier: opts.planTier,
      ...(opts.thinking === undefined ? {} : { thinking: opts.thinking }),
    });
    const kept = formatExplain(explain(req, { adapters: enabledAdapters(), health: NO_HEALTH }))
      .filter((l) => l.startsWith("#"))
      .slice(0, 5);
    console.info(`[mesh:shadow] ${opts.modelId} → ${kept.join(" | ") || "nomzod yo'q"}`);
  } catch {
    /* shadow log hech qachon so'rovni yiqitmaydi */
  }
}

export async function* streamCompletion(opts: StreamOptions): AsyncGenerator<StreamEvent> {
  // Mintaqa siyosati — oxirgi himoya chizig'i: route almashtirishni o'tkazib yuborsa
  // ham cheklangan provayder chaqirilmaydi (xato → route keyingi nomzodga o'tadi).
  if (restrictedRegion(opts.country) && !modelAllowedIn(opts.modelId, opts.country)) {
    const name = MODEL_BY_ID[opts.modelId]?.name ?? opts.modelId;
    yield { type: "error", message: fmt(translate(opts.lang ?? DEFAULT_LANG, "p10RegionModelBlocked"), { model: name }) };
    return;
  }
  const mode = meshMode();
  if (mode === "on") {
    yield* streamViaMesh(opts);
    return;
  }
  // SOVEREIGN_MESH=off|shadow — eski zanjir (favqulodda qaytarish uchun saqlangan).
  if (mode === "shadow") logShadowPlan(opts);
  // Host prefiksli id (Auto / tekin zanjir: "groq/...", "cloudflare/@cf/...") — kalit bo'lsa
  // OmniRoute'siz to'g'ridan-to'g'ri o'sha provayderga.
  const hostRoute = isOmniCatalogId(opts.modelId) ? hostPrefixedRoute(opts.modelId) : null;
  if (hostRoute || (opts.modelId.startsWith(CF_PREFIX) && !MODEL_BY_ID[opts.modelId])) {
    if (!hostRoute) {
      console.error("[ai] Cloudflare modeli: CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_AI_TOKEN sozlanmagan");
      yield { type: "error", message: translate(opts.lang ?? DEFAULT_LANG, "chErrServerConfig") };
      return;
    }
    if (!hostAllowedIn(hostRoute.provider, opts.country)) {
      yield { type: "error", message: fmt(translate(opts.lang ?? DEFAULT_LANG, "p10RegionModelBlocked"), { model: opts.modelId }) };
      return;
    }
    const smodel = syntheticOmniModel(opts.modelId, hostRoute.provider === "cloudflare" ? "Cloudflare" : "Groq");
    const messages: ChatMessageInput[] = [
      { role: "system", content: buildSystemPrompt(smodel, !!opts.research, opts.extraSystem) },
      ...opts.messages.filter((m) => m.role !== "system"),
    ];
    yield* streamOpenRouter(smodel, messages, opts, opts.maxTokens ?? 2048, { forced: hostRoute });
    return;
  }
  // Foydalanuvchi OmniRoute katalogidan model tanlagan bo'lsa — o'sha id bilan
  // to'g'ridan-to'g'ri OmniRoute'ga; xato bersa quyidagi zaxira zanjiri ishlaydi.
  if (isOmniCatalogId(opts.modelId)) {
    const route = omniCatalogRoute(opts.modelId);
    if (!route) {
      console.error("[ai] OmniRoute katalog modeli: OMNIROUTE_* env sozlanmagan");
      yield { type: "error", message: translate(opts.lang ?? DEFAULT_LANG, "chErrServerConfig") };
      return;
    }
    const smodel = syntheticOmniModel(opts.modelId);
    const messages: ChatMessageInput[] = [
      { role: "system", content: buildSystemPrompt(smodel, !!opts.research, opts.extraSystem) },
      ...opts.messages.filter((m) => m.role !== "system"),
    ];
    yield* streamOpenRouter(smodel, messages, opts, opts.maxTokens ?? 2048, { forced: route });
    return;
  }

  const model = MODEL_BY_ID[opts.modelId];
  if (!model) {
    yield { type: "error", message: fmt(translate(opts.lang ?? DEFAULT_LANG, "chErrUnknownModelId"), { id: opts.modelId }) };
    return;
  }

  if (!hasKeyFor(model)) {
    // Production'da soxta javob berib bo'lmaydi — xato qaytaramiz, shunda
    // chat route boshqa (sozlangan) modelga o'zi o'tadi. Mock faqat dev/preview.
    if (process.env.NODE_ENV === "production") {
      yield { type: "error", message: fmt(translate(opts.lang ?? DEFAULT_LANG, "chErrModelNotConnected"), { model: model.name }) };
      return;
    }
    yield* mockStream(model, opts.messages);
    return;
  }

  const messages: ChatMessageInput[] = [
    { role: "system", content: buildSystemPrompt(model, !!opts.research, opts.extraSystem) },
    ...opts.messages.filter((m) => m.role !== "system"),
  ];

  if (isResearchModel(model)) {
    yield* streamPerplexity(model, messages, opts);
    return;
  }
  yield* streamOpenRouter(model, messages, opts, opts.maxTokens ?? 2048);
}

/* ------------------------------------------------------------------ */
/* Local fallback when no API key is configured (design / dev preview) */
/* ------------------------------------------------------------------ */

function mockAnswer(model: SovereignModel, last: string): string {
  const q = last.trim().slice(0, 120) || "savolingiz";
  if (isResearchModel(model)) {
    return [
      `**${q}** bo'yicha internetdan topilgan ma'lumotlar:`,
      "",
      "- EU AI Act 2026 yil boshidan to'liq kuchga kirdi va yuqori xavfli tizimlar uchun audit talab qiladi [1].",
      "- AQShning 12 shtati AI orqali shaxsiy ma'lumotlarni qayta ishlashni cheklovchi qonunlar qabul qildi [2].",
      "- O'zbekistonda \"Shaxsiy ma'lumotlar to'g'risida\"gi qonunga AI bandlari qo'shilishi rejalashtirilmoqda [3].",
      "",
      "> Bu **namunaviy javob**: `PERPLEXITY_API_KEY` kiritilgach, real qidiruv natijalari keladi.",
    ].join("\n");
  }
  return [
    `Siz so'radingiz: **${q}**`,
    "",
    `Men ${model.name} (${model.provider}). Hozircha API kalit kiritilmagani uchun bu **namunaviy javob** — \`OPENROUTER_API_KEY\` qo'shilgach, real model javob beradi.`,
    "",
    "Markdown to'liq ishlaydi:",
    "",
    "1. Ro'yxatlar",
    "2. **Qalin** va _kursiv_ matn",
    "3. Kod bloklari:",
    "",
    "```ts",
    "export function greet(name: string) {",
    "  return `Salom, ${name}!`;",
    "}",
    "```",
    "",
    "| Model | Narx |",
    "|---|---|",
    `| ${model.name} | ${model.price} |`,
  ].join("\n");
}

async function* mockStream(model: SovereignModel, messages: ChatMessageInput[]): AsyncGenerator<StreamEvent> {
  const last = textOf([...messages].reverse().find((m) => m.role === "user")?.content ?? "");
  const text = mockAnswer(model, last);
  yield { type: "served", model: `mock/${model.id}`, substituted: false };
  if (isResearchModel(model)) {
    yield {
      type: "citations",
      citations: [
        "https://artificialintelligenceact.eu/",
        "https://www.ncsl.org/technology-and-communication/artificial-intelligence-2026-legislation",
        "https://lex.uz/",
      ],
    };
  }
  const tokens = text.split(/(\s+)/);
  for (const tok of tokens) {
    if (!tok) continue;
    await new Promise((r) => setTimeout(r, 18));
    yield { type: "text", text: tok };
  }
  yield { type: "done" };
}
