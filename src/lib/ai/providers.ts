import "server-only";
import { MODELS, MODEL_BY_ID, type SovereignModel } from "@/config/models";

/** Free provider models used as automatic fallbacks when one is rate-limited. */
const FREE_FALLBACKS = MODELS.filter((m) => m.category === "free").map((m) => m.providerModel);

export interface ChatMessageInput {
  role: "user" | "assistant" | "system";
  /** string, or a multimodal array (text + image_url parts) for vision models. */
  content: string | unknown[];
}

export type StreamEvent =
  | { type: "text"; text: string }
  | { type: "citations"; citations: string[] }
  | { type: "skills"; skills: string[] }
  | { type: "route"; reason: string; steps: { modelId: string; kind: string; purpose: string }[] }
  | { type: "step"; modelId: string; kind: string; purpose: string; index: number }
  | { type: "cache"; model: string; similarity: number }
  | { type: "verifier"; issues: { fact: string; verdict: "correct" | "suspicious" | "unverifiable"; note?: string }[] }
  | { type: "error"; message: string }
  | { type: "done" };

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const PERPLEXITY_BASE = "https://api.perplexity.ai";

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
  return isResearchModel(model) ? !!process.env.PERPLEXITY_API_KEY : !!process.env.OPENROUTER_API_KEY;
}

export function buildSystemPrompt(model: SovereignModel, research: boolean, extra?: string): string {
  const base = [
    `Sen SOVEREIGN AI platformasidagi "${model.name}" modelisan.`,
    "Foydalanuvchi qaysi tilda yozsa, o'sha tilda javob ber (asosan o'zbek tili).",
    "Javoblarni Markdown'da formatla: sarlavhalar, ro'yxatlar, kod bloklari (til ko'rsatilgan).",
    "Aniq, qisqa va foydali bo'l.",
    ANTI_HALLUCINATION,
  ];
  if (research || isResearchModel(model)) {
    base.push("Faqat tasdiqlangan manbalardan javob ber va har bir da'voni manba raqami [n] bilan asosla.");
  }
  if (extra) base.push(extra);
  return base.join(" ");
}

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
  "4. Foydalanuvchi savoli noaniq bo'lsa — o'zing ko'p variantni sanaganingdan ko'ra, aniqlashtiruvchi savol ber.",
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
  "Bu foydalanuvchi oddiy chat tarifida. Javoblarni qisqa va sodda tut (3-6 gap yoki qisqa ro'yxat). " +
  "Kod so'ralsa faqat kichik, oddiy misol (10-15 qatorgacha) ber; to'liq loyiha, ko'p fayl yoki uzun kod yozma — " +
  "buning o'rniga bu imkoniyat Pro tarifida ekanini bir gapda eslat.";

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

async function errorMessage(res: Response): Promise<string> {
  let message = `${res.status} ${res.statusText}`;
  let code = res.status;
  try {
    const j = (await res.json()) as {
      error?: { message?: string; code?: number; metadata?: { raw?: string } } | string;
      message?: string;
    };
    if (typeof j.error === "string") message = j.error;
    else if (j.error?.message) {
      message = j.error.metadata?.raw ?? j.error.message;
      code = j.error.code ?? code;
    } else if (j.message) message = j.message;
  } catch {
    /* ignore */
  }
  if (code === 429 || /rate-limited|rate limit/i.test(message)) {
    return "Tekin modellar hozir band (juda ko'p so'rov). Bir necha soniyadan keyin qayta urinib ko'ring yoki boshqa (masalan Pro) modelni tanlang.";
  }
  if (code === 402 || /credits/i.test(message)) {
    return `Provayder balansi yetarli emas: ${message}`;
  }
  return message;
}

/* ------------------------------------------------------------------ */
/* OpenRouter (OpenAI chat-completions format)                          */
/* ------------------------------------------------------------------ */

type OrChunk = {
  choices?: { delta?: { content?: string } }[];
  error?: { message?: string };
};

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

async function* streamOpenRouter(
  model: SovereignModel,
  messages: ChatMessageInput[],
  opts: StreamOptions,
  maxTokens: number,
  retried = false,
): AsyncGenerator<StreamEvent> {
  const cached = withPromptCache(model, messages);
  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
      "X-Title": "SOVEREIGN AI",
    },
    body: JSON.stringify({
      model: model.providerModel,
      // Free models share an upstream pool and get rate-limited; let OpenRouter
      // auto-fall-back to 2 other free models before failing. OpenRouter cheklovi:
      // `models` massivida 3 tadan ko'p bo'lmasin.
      ...(model.category === "free"
        ? {
            models: [
              model.providerModel,
              ...FREE_FALLBACKS.filter((m) => m !== model.providerModel).slice(0, 2),
            ],
          }
        : {}),
      messages: cached,
      temperature: opts.temperature ?? 0.7,
      max_tokens: maxTokens,
      transforms: ["middle-out"],
      route: "fallback",
      stream: true,
    }),
    signal: opts.signal,
  });

  if (!res.ok || !res.body) {
    const message = await errorMessage(res);
    // Low-credit accounts: "You requested up to N tokens, but can only afford M."
    const afford = /can only afford (\d+)/i.exec(message);
    if (afford && !retried) {
      const allowed = Math.max(256, Number(afford[1]) - 64);
      yield* streamOpenRouter(model, messages, opts, allowed, true);
      return;
    }
    yield { type: "error", message };
    return;
  }

  for await (const chunk of readSse(res.body)) {
    const c = chunk as OrChunk;
    if (c.error?.message) {
      yield { type: "error", message: c.error.message };
      return;
    }
    const text = c.choices?.[0]?.delta?.content;
    if (text) yield { type: "text", text };
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
    yield { type: "error", message: await errorMessage(res) };
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
      yield { type: "error", message: ev.response?.error?.message ?? ev.error?.message ?? ev.message ?? "Perplexity xatosi" };
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
}

/** Streams a completion from OpenRouter (or Perplexity for research models). */
export async function* streamCompletion(opts: StreamOptions): AsyncGenerator<StreamEvent> {
  const model = MODEL_BY_ID[opts.modelId];
  if (!model) {
    yield { type: "error", message: `Noma'lum model: ${opts.modelId}` };
    return;
  }

  if (!hasKeyFor(model)) {
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
