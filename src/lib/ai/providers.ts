import "server-only";
import { MODELS, MODEL_BY_ID, type SovereignModel } from "@/config/models";
import { DEFAULT_LANG, fmt, translate, type Lang } from "@/lib/i18n";
import { healOmniRouteIfStuck } from "@/lib/omniroute-watchdog";

/** Free provider models used as automatic fallbacks when one is rate-limited. */
const FREE_FALLBACKS = MODELS.filter((m) => m.category === "free").map((m) => m.providerModel);

export interface ChatMessageInput {
  role: "user" | "assistant" | "system";
  /** string, or a multimodal array (text + image_url parts) for vision models. */
  content: string | unknown[];
}

export type StreamEvent =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "citations"; citations: string[] }
  | { type: "skills"; skills: string[] }
  | { type: "route"; reason: string; steps: { modelId: string; kind: string; purpose: string }[] }
  | { type: "step"; modelId: string; kind: string; purpose: string; index: number }
  | { type: "cache"; model: string; similarity: number }
  /** The server is fetching pages the user linked to. */
  | { type: "reading"; urls: string[] }
  /** A model/provider failed and the answer continues on another model. */
  | { type: "switch"; from: string; to: string; reason: string }
  | { type: "verifier"; issues: { fact: string; verdict: "correct" | "suspicious" | "unverifiable"; note?: string }[] }
  | { type: "error"; message: string }
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
 * Direct provider mapping — OpenRouter'ni chetlab tez va ishonchli endpointga
 * yo'naltirish. Har model uchun tarjih tartibi:
 * 1) Groq — dunyodagi eng tez (~500 tok/s)
 * 2) Cerebras — kuchli (Llama 405B tekin sxema)
 * 3) SambaNova — DeepSeek R1 (reasoning) uchun eng tez
 * 4) OpenAI direct — kuchli, ammo pullik
 * 5) OpenRouter — universal fallback
 */
type Provider = "groq" | "cerebras" | "sambanova" | "mistral" | "openai" | "nvidia" | "llm7" | "tella" | "omniroute" | "rsi";

interface RouteCandidate {
  provider: Provider;
  model: string;
}

const DIRECT_ROUTES: Record<string, RouteCandidate[]> = {
  // Tella 2 — faqat o'z serverimiz. Zaxirasi yo'q: boshqa provayderga yuborsak
  // "o'zimizniki" degani yolg'on bo'lardi.
  "tella-2": [{ provider: "tella", model: process.env.TELLA_MODEL ?? "tella2" }],
  // Llama 3.3 70B — Groq → Cerebras → SambaNova (barchada bor)
  "meta-llama/llama-3.3-70b-instruct": [
    { provider: "groq", model: "openai/gpt-oss-120b" },
    { provider: "cerebras", model: "llama-3.3-70b" },
    { provider: "sambanova", model: "Meta-Llama-3.3-70B-Instruct" },
    { provider: "nvidia", model: "meta/llama-3.3-70b-instruct" },
  ],
  "meta-llama/llama-3.3-70b-instruct:free": [
    { provider: "groq", model: "openai/gpt-oss-120b" },
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
  return !!process.env.OPENAI_API_KEY;
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
  return { url: `${OPENAI_BASE}/chat/completions`, auth: process.env.OPENAI_API_KEY! };
}

/**
 * OmniRoute ASOSIY yo'l: sozlangan bo'lsa, tekin/arzon modellar avval unga boradi
 * (u o'zi provayderlar orasida kvotaga qarab almashtiradi). Xato bersa — chat
 * route odatdagi zanjirga o'tadi (to'g'ridan-to'g'ri provayderlar, keyin LLM7).
 * Flagman modellar (Claude/GPT) bunga kirmaydi: OmniRoute "auto" ularni pullik
 * OpenRouter orqali yuborib, xarajatni oshirishi sinovda ko'rindi.
 */
function omnirouteFirst(providerModel: string): { url: string; auth: string; model: string; provider: Provider } | null {
  const base = process.env.OMNIROUTE_BASE_URL;
  if (!base || !process.env.OMNIROUTE_API_KEY) return null;
  const cheap = providerModel.endsWith(":free") || /llama|mistral-small|gemini.*flash|deepseek/i.test(providerModel);
  if (!cheap) return null;
  return {
    url: `${base.replace(/\/$/, "")}/chat/completions`,
    auth: process.env.OMNIROUTE_API_KEY,
    model: process.env.OMNIROUTE_MODEL ?? "auto/gemini",
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
  opts: { skipOmni?: boolean } = {},
): { url: string; auth: string; model: string; provider: Provider } | null {
  if (!opts.skipOmni) {
    const viaRsi = rsiRoute(providerModel);
    if (viaRsi) return viaRsi;
  }
  const viaOmni = opts.skipOmni ? null : omnirouteFirst(providerModel);
  if (viaOmni) return viaOmni;
  const candidates = DIRECT_ROUTES[providerModel];
  if (!candidates) return null;
  for (const c of candidates) {
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

export function hasKeyFor(model: SovereignModel): boolean {
  if (isResearchModel(model)) return !!process.env.PERPLEXITY_API_KEY;
  // Agar direct provider (Groq/Cerebras/SambaNova/Mistral/OpenAI) bor bo'lsa, OpenRouter shart emas.
  if (pickDirectRoute(model.providerModel)) return true;
  return !!process.env.OPENROUTER_API_KEY;
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
    "Foydalanuvchi qaysi tilda yozsa, o'sha tilda javob ber (asosan o'zbek tili).",
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

/** Parses an SSE body into the JSON objects carried by `data:` lines. */
async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<Record<string, unknown>> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
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
}

async function errorMessage(res: Response, lang: Lang = DEFAULT_LANG): Promise<string> {
  let rawMessage = `${res.status} ${res.statusText}`;
  let code = res.status;
  try {
    const j = (await res.json()) as {
      error?: { message?: string; code?: number; metadata?: { raw?: string } } | string;
      message?: string;
    };
    if (typeof j.error === "string") rawMessage = j.error;
    else if (j.error?.message) {
      rawMessage = j.error.metadata?.raw ?? j.error.message;
      code = j.error.code ?? code;
    } else if (j.message) rawMessage = j.message;
  } catch {
    /* ignore */
  }
  // OmniRoute "resource pressure"ga tiqilib qolgan bo'lsa — fonda Railway restart.
  const omniBase = (process.env.OMNIROUTE_BASE_URL ?? "").replace(/\/$/, "");
  if (omniBase && res.url.startsWith(omniBase)) healOmniRouteIfStuck(res.status, rawMessage);
  // Xato'ni serverga xotira uchun log qilamiz (agar keyinroq Sentry ulasak),
  // lekin foydalanuvchiga faqat generic xabar qaytariladi — infra sirlarni fosh qilmaymiz.
  const isAffordError = /can only afford (\d+)/i.exec(rawMessage);
  if (isAffordError) {
    // low-credit auto-retry uchun raw message qoladi (streamOpenRouter ichida ushlanadi)
    return rawMessage;
  }
  if (code === 429 || /rate-limited|rate limit/i.test(rawMessage)) {
    return translate(lang, "chErrModelBusy");
  }
  if (code === 402 || /credits|billing|payment/i.test(rawMessage)) {
    return translate(lang, "chErrServerConfig");
  }
  if (code >= 500) {
    return translate(lang, "chErrProviderTemporary");
  }
  if (code === 401 || code === 403) {
    return translate(lang, "chErrServerConfig");
  }
  return translate(lang, "chErrRequestFailed");
}

/* ------------------------------------------------------------------ */
/* OpenRouter (OpenAI chat-completions format)                          */
/* ------------------------------------------------------------------ */

type OrChunk = {
  choices?: { delta?: { content?: string; reasoning?: string; reasoning_content?: string }; finish_reason?: string | null }[];
  error?: { message?: string };
};

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
): AsyncGenerator<StreamEvent, boolean> {
  const plain = messages.map((m) => ({ role: m.role, content: textOf(m.content) }));

  for (const target of fallbackTargets()) {
    let res: Response;
    try {
      res = await fetch(target.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${target.auth}` },
        body: JSON.stringify({
          model: target.model,
          messages: plain,
          temperature: opts.temperature ?? 0.7,
          max_tokens: Math.min(maxTokens, 2048),
          stream: true,
        }),
        signal: opts.signal,
      });
    } catch {
      continue; // network error — try the next gateway
    }
    if (!res.ok || !res.body) continue;

    let produced = false;
    for await (const chunk of readSse(res.body)) {
      const c = chunk as OrChunk;
      if (c.error?.message) break;
      const text = c.choices?.[0]?.delta?.content;
      if (text) {
        produced = true;
        yield { type: "text", text };
      }
    }
    if (produced) {
      yield { type: "done" };
      return true;
    }
  }
  return false;
}

async function* streamOpenRouter(
  model: SovereignModel,
  messages: ChatMessageInput[],
  opts: StreamOptions,
  maxTokens: number,
  retried = false,
  continuation = 0,
  skipOmni = false,
  forced?: { url: string; auth: string; model: string; provider: Provider },
): AsyncGenerator<StreamEvent> {
  const cached = withPromptCache(model, messages);
  const direct = forced ?? pickDirectRoute(model.providerModel, { skipOmni });

  // Direct route ishlatiladigan bo'lsa uni ishlatamiz — Groq / OpenAI direct
  // OpenRouter proxysidan tezroq va ishonchliroq.
  const url = direct ? direct.url : `${OPENROUTER_BASE}/chat/completions`;
  const auth = direct ? direct.auth : process.env.OPENROUTER_API_KEY!;
  const modelId = direct ? direct.model : model.providerModel;

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
    messages: cached,
    temperature: opts.temperature ?? 0.7,
    max_tokens: maxTokens,
    stream: true,
  };
  if (!direct) {
    // OpenRouter-specific transforms + fallback pool
    body.transforms = ["middle-out"];
    body.route = "fallback";
    if (model.category === "free") {
      body.models = [
        model.providerModel,
        ...FREE_FALLBACKS.filter((m) => m !== model.providerModel).slice(0, 2),
      ];
    }
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: opts.signal,
  });

  if (!res.ok || !res.body) {
    const message = await errorMessage(res, opts.lang);
    // Low-credit accounts: "You requested up to N tokens, but can only afford M."
    const afford = /can only afford (\d+)/i.exec(message);
    if (afford && !retried) {
      const allowed = Math.max(256, Number(afford[1]) - 64);
      yield* streamOpenRouter(model, messages, opts, allowed, true, continuation, skipOmni);
      return;
    }
    // OmniRoute (asosiy yo'l) tugagan/xato bergan bo'lsa — xuddi shu modelni
    // to'g'ridan-to'g'ri provayder yoki OpenRouter orqali qayta urinamiz.
    if ((direct?.provider === "omniroute" || direct?.provider === "rsi") && !skipOmni) {
      yield* streamOpenRouter(model, messages, opts, maxTokens, retried, continuation, true);
      return;
    }
    // Last resort: the anonymous free tier, so the chat still answers when the
    // paid/keyed providers are out of credit or rate-limited.
    if (direct?.provider !== "llm7") {
      const rescued = yield* streamFreeFallback(messages, opts, maxTokens);
      if (rescued) return;
    }
    yield { type: "error", message };
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
  for await (const chunk of readSse(res.body)) {
    const c = chunk as OrChunk;
    if (c.error?.message) {
      yield { type: "error", message: c.error.message };
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
      retried,
      continuation + 1,
      skipOmni,
    );
    return;
  }
  yield { type: "done" };
}

/* ------------------------------------------------------------------ */
/* Perplexity Agent API (/v1/responses, OpenAI Responses format)        */
/* ------------------------------------------------------------------ */

type PplxEvent = {
  type?: string;
  delta?: string;
  results?: { url?: string }[];
  item?: { type?: string; results?: { url?: string }[] };
  response?: {
    status?: string;
    error?: { message?: string } | null;
    output?: { type?: string; results?: { url?: string }[]; content?: { type?: string; text?: string }[] }[];
  };
  error?: { message?: string };
  message?: string;
};

function collectUrls(results?: { url?: string }[]): string[] {
  return (results ?? []).map((r) => r.url).filter((u): u is string => typeof u === "string" && u.length > 0);
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

  const res = await fetch(`${PERPLEXITY_BASE}/v1/responses`, {
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
    signal: opts.signal,
  });

  if (!res.ok || !res.body) {
    yield { type: "error", message: await errorMessage(res, opts.lang) };
    return;
  }

  const citations: string[] = [];
  let sentCount = 0;
  let text = "";

  for await (const chunk of readSse(res.body)) {
    const ev = chunk as PplxEvent;
    const type = ev.type ?? "";

    if (type === "response.output_text.delta" && typeof ev.delta === "string") {
      text += ev.delta;
      yield { type: "text", text: ev.delta };
      continue;
    }

    if (type === "response.reasoning.search_results" || ev.item?.type === "search_results") {
      for (const u of collectUrls(ev.results ?? ev.item?.results)) if (!citations.includes(u)) citations.push(u);
      if (citations.length > sentCount) {
        sentCount = citations.length;
        yield { type: "citations", citations: [...citations] };
      }
      continue;
    }

    if (type === "response.failed" || type === "error" || ev.error) {
      yield { type: "error", message: ev.response?.error?.message ?? ev.error?.message ?? ev.message ?? translate(opts.lang ?? DEFAULT_LANG, "chErrPerplexity") };
      return;
    }

    if (type === "response.completed" && ev.response?.output) {
      for (const item of ev.response.output) {
        if (item.type === "search_results" || Array.isArray(item.results)) {
          for (const u of collectUrls(item.results)) if (!citations.includes(u)) citations.push(u);
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
      if (citations.length > sentCount) yield { type: "citations", citations: [...citations] };
    }
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
}

/** Streams a completion from OpenRouter (or Perplexity for research models). */
/** OmniRoute katalog id — "provider/model" ko'rinishida, curated ro'yxatda yo'q. */
export function isOmniCatalogId(id: string): boolean {
  return typeof id === "string" && id.includes("/") && !MODEL_BY_ID[id];
}

function omniCatalogRoute(modelId: string): { url: string; auth: string; model: string; provider: Provider } | null {
  const base = process.env.OMNIROUTE_BASE_URL;
  const auth = process.env.OMNIROUTE_API_KEY;
  if (!base || !auth) return null;
  return { url: `${base.replace(/\/$/, "")}/chat/completions`, auth, model: modelId, provider: "omniroute" };
}

/** OmniRoute katalog modeli uchun yengil sintetik SovereignModel (brend emas). */
function syntheticOmniModel(id: string): SovereignModel {
  const short = id.split("/").pop() ?? id;
  return {
    id,
    name: short,
    shortName: short,
    provider: "OmniRoute",
    theme: "sovereign",
    cost: "free",
    category: "free",
    tier: "free",
    providerModel: id,
    price: "TEKIN",
    glyph: "✦",
    tagline: "OmniRoute katalog",
    description: "",
    primary: "#7C6FF7",
    accent: "#7C6FF7",
    bg: "#0D1033",
    capabilities: [],
    demo: { user: "", ai: "" },
  };
}

export async function* streamCompletion(opts: StreamOptions): AsyncGenerator<StreamEvent> {
  // Foydalanuvchi OmniRoute katalogidan model tanlagan bo'lsa — o'sha id bilan
  // to'g'ridan-to'g'ri OmniRoute'ga; xato bersa quyidagi zaxira zanjiri ishlaydi.
  if (isOmniCatalogId(opts.modelId)) {
    const route = omniCatalogRoute(opts.modelId);
    if (!route) {
      yield { type: "error", message: translate(opts.lang ?? DEFAULT_LANG, "chErrOmniNotConfigured") };
      return;
    }
    const smodel = syntheticOmniModel(opts.modelId);
    const messages: ChatMessageInput[] = [
      { role: "system", content: buildSystemPrompt(smodel, !!opts.research, opts.extraSystem) },
      ...opts.messages.filter((m) => m.role !== "system"),
    ];
    yield* streamOpenRouter(smodel, messages, opts, opts.maxTokens ?? 2048, false, 0, false, route);
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
