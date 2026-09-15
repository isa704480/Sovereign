import "server-only";
import { MODEL_BY_ID, type SovereignModel } from "@/config/models";

export interface ChatMessageInput {
  role: "user" | "assistant" | "system";
  content: string;
}

export type StreamEvent =
  | { type: "text"; text: string }
  | { type: "citations"; citations: string[] }
  | { type: "error"; message: string }
  | { type: "done" };

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const PERPLEXITY_BASE = "https://api.perplexity.ai";

export function isResearchModel(model: SovereignModel) {
  return model.category === "research";
}

export function hasKeyFor(model: SovereignModel): boolean {
  return isResearchModel(model) ? !!process.env.PERPLEXITY_API_KEY : !!process.env.OPENROUTER_API_KEY;
}

export function buildSystemPrompt(model: SovereignModel, research: boolean): string {
  const base = [
    `Sen SOVEREIGN AI platformasidagi "${model.name}" modelisan.`,
    "Foydalanuvchi qaysi tilda yozsa, o'sha tilda javob ber (asosan o'zbek tili).",
    "Javoblarni Markdown'da formatla: sarlavhalar, ro'yxatlar, kod bloklari (til ko'rsatilgan).",
    "Aniq, qisqa va foydali bo'l. Bilmasang — bilmasligingni ayt.",
  ];
  if (research || isResearchModel(model)) {
    base.push("Faqat tasdiqlangan manbalardan javob ber va har bir da'voni manba raqami [n] bilan asosla.");
  }
  return base.join(" ");
}

/** Parses an OpenAI-style SSE body into JSON chunks. */
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

type Chunk = {
  choices?: { delta?: { content?: string } }[];
  citations?: string[];
  error?: { message?: string };
};

async function* streamOpenAiCompatible(
  url: string,
  headers: Record<string, string>,
  payload: Record<string, unknown>,
  signal?: AbortSignal,
): AsyncGenerator<StreamEvent> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ ...payload, stream: true }),
    signal,
  });

  if (!res.ok || !res.body) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const j = (await res.json()) as { error?: { message?: string } };
      if (j.error?.message) message = j.error.message;
    } catch {
      /* ignore */
    }
    yield { type: "error", message };
    return;
  }

  let citationsSent = false;
  for await (const chunk of readSse(res.body)) {
    const c = chunk as Chunk;
    if (c.error?.message) {
      yield { type: "error", message: c.error.message };
      return;
    }
    if (!citationsSent && Array.isArray(c.citations) && c.citations.length) {
      citationsSent = true;
      yield { type: "citations", citations: c.citations };
    }
    const text = c.choices?.[0]?.delta?.content;
    if (text) yield { type: "text", text };
  }
  yield { type: "done" };
}

export interface StreamOptions {
  modelId: string;
  messages: ChatMessageInput[];
  research?: boolean;
  temperature?: number;
  maxTokens?: number;
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
    { role: "system", content: buildSystemPrompt(model, !!opts.research) },
    ...opts.messages.filter((m) => m.role !== "system"),
  ];

  if (isResearchModel(model)) {
    yield* streamOpenAiCompatible(
      `${PERPLEXITY_BASE}/chat/completions`,
      { Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}` },
      {
        model: model.providerModel,
        messages,
        temperature: opts.temperature ?? 0.2,
        max_tokens: opts.maxTokens ?? 2048,
        return_citations: true,
        search_recency_filter: "month",
      },
      opts.signal,
    );
    return;
  }

  yield* streamOpenAiCompatible(
    `${OPENROUTER_BASE}/chat/completions`,
    {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
      "X-Title": "SOVEREIGN AI",
    },
    {
      model: model.providerModel,
      messages,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxTokens ?? 4096,
      transforms: ["middle-out"],
      route: "fallback",
    },
    opts.signal,
  );
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
  const last = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
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
