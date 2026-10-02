/**
 * Token sarfini minimallashtirish pipeline — barcha provayder oilalariga mos.
 *
 * Provayder oilalari:
 *   anthropic   — cache_control (manual), min 1024 (Opus/Haiku 4.5: 4096)
 *   alibaba     — cache_control (manual, Qwen3-max, qwen-plus, qwen3-coder-plus), min 1024
 *   google      — cache_control/implicit (Gemini 2.5+), min 1024 (Pro: 4096)
 *   openai      — implicit (auto), min 1024; GPT-5.6+ session_id/prompt_cache_key
 *   deepseek    — implicit (auto), min 1024
 *   xai         — implicit (auto), min 1024 (Grok)
 *   moonshot    — implicit (auto), min 1024 (Kimi)
 *   groq        — implicit (auto), min 1024
 *   zai         — implicit (auto), min 1024 (GLM)
 *   mistral     — standart (kesh hujjatlashtirilmagan)
 *   *           — standart (noma'lum oila — barqaror prefiks + session_id)
 *
 * Bosqichlar:
 *   1. prefix deterministik (vaqt/UUID yo'q, tool list tartiblangan, system boshida)
 *   2. session_id / prompt_cache_key qo'shish (OpenRouter sticky routing)
 *   3. oilaga mos cache_control breakpoint
 *   4. tool natijalarini tozalash (oxirgi TOOL_RESULT_KEEP ta qoladi)
 *   5. tool chiqishini siqish (head/tail, stack trace qisqartirish)
 *   6. cache usage normallashtirish (upstream javobidan)
 *
 * Foydali shart: prefiks minimal token chegarasidan uzun bo'lganda va sessiya qayta
 * ishlatilganda (2+ so'rov). Bir martalik qisqa savol — tejam minimal.
 */

// ── Konfiguratsiya ─────────────────────────────────────────────────────────

/**
 * Oxirgi shuncha tool natijasi saqlanadi, eskisi o'chiriladi.
 * Env: TOOL_RESULT_KEEP (standart 4)
 */
function toolResultKeep(): number {
  const v = parseInt(process.env.TOOL_RESULT_KEEP ?? "4", 10);
  return Number.isFinite(v) && v > 0 ? v : 4;
}

/**
 * Tool chiqishi shuncha belgidan uzun bo'lsa qisqartiriladi.
 * Env: TOOL_OUTPUT_MAX_CHARS (standart 3000)
 */
function toolOutputMaxChars(): number {
  const v = parseInt(process.env.TOOL_OUTPUT_MAX_CHARS ?? "3000", 10);
  return Number.isFinite(v) && v > 0 ? v : 3000;
}

// ── Oila aniqlanishi ───────────────────────────────────────────────────────

type CacheMode = "cache_control" | "implicit" | "none";

interface FamilySpec {
  mode: CacheMode;
  /** Minimum prefix tokens. Undan qisqa bo'lsa kesh foyda bermaydi. */
  minTokens: number;
  /** Yuqori chegara (Opus/Haiku 4.5, Gemini Pro). */
  minTokensHigh?: number;
}

const FAMILY_SPECS: Record<string, FamilySpec> = {
  anthropic: { mode: "cache_control", minTokens: 1024, minTokensHigh: 4096 },
  alibaba:   { mode: "cache_control", minTokens: 1024 },   // Qwen3-max, qwen-plus, qwen3-coder-plus
  google:    { mode: "cache_control", minTokens: 1024, minTokensHigh: 4096 }, // Gemini 2.5+
  openai:    { mode: "implicit",      minTokens: 1024 },
  deepseek:  { mode: "implicit",      minTokens: 1024 },
  xai:       { mode: "implicit",      minTokens: 1024 },   // Grok
  moonshot:  { mode: "implicit",      minTokens: 1024 },   // Kimi
  groq:      { mode: "implicit",      minTokens: 1024 },
  zai:       { mode: "implicit",      minTokens: 1024 },   // GLM
  mistral:   { mode: "none",          minTokens: 2048 },
  nvidia:    { mode: "none",          minTokens: 2048 },
  meta:      { mode: "implicit",      minTokens: 1024 },
};

/**
 * Model id yoki provayder nomidan oila aniqlanadi.
 * Masalan: "anthropic/claude-sonnet-4.5" → "anthropic"
 *          "openai/gpt-4o" → "openai"
 *          "google/gemini-2.5-flash" → "google"
 *          "z-ai/glm-5.2" → "zai"
 */
export function familyOf(modelId: string): string {
  const id = modelId.toLowerCase();
  if (id.startsWith("anthropic/") || id.includes("claude")) return "anthropic";
  if (id.startsWith("openai/") || id.includes("gpt-") || id.includes("o1") || id.includes("o3")) return "openai";
  if (id.startsWith("google/") || id.includes("gemini") || id.includes("gemma")) return "google";
  if (id.startsWith("qwen/") || id.startsWith("alibaba/") || id.includes("qwen")) return "alibaba";
  if (id.startsWith("deepseek/") || id.includes("deepseek")) return "deepseek";
  if (id.startsWith("x-ai/") || id.includes("grok")) return "xai";
  if (id.startsWith("moonshotai/") || id.includes("kimi")) return "moonshot";
  if (id.startsWith("groq/") || id.includes("groq")) return "groq";
  if (id.startsWith("z-ai/") || id.includes("glm")) return "zai";
  if (id.startsWith("mistralai/") || id.includes("mistral") || id.includes("codestral")) return "mistral";
  if (id.startsWith("nvidia/") || id.includes("nemotron")) return "nvidia";
  if (id.startsWith("meta-llama/") || id.includes("llama")) return "meta";
  // OmniRoute "auto/*" yoki boshqa aggregatorlar — standart
  return "unknown";
}

function specFor(modelId: string): FamilySpec {
  return FAMILY_SPECS[familyOf(modelId)] ?? { mode: "implicit", minTokens: 1024 };
}

/** Yuqori minimal chegarali modellar (Opus 4.5+, Haiku 4.5, Gemini Pro). */
function isHighMinModel(modelId: string): boolean {
  const id = modelId.toLowerCase();
  return (
    id.includes("opus") ||
    id.includes("haiku-4-5") ||
    id.includes("haiku.4.5") ||
    (id.includes("gemini") && (id.includes("pro") || id.includes("3-pro")))
  );
}

// ── Prefix normalizatsiya ──────────────────────────────────────────────────

export interface CacheMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | unknown[];
  tool_calls?: unknown[];
  tool_call_id?: string;
  name?: string;
  [k: string]: unknown;
}

/**
 * Xabarlar ro'yxatini deterministik qiladi: bir xil kirish → bir xil prefiks → kesh to'qnashadi.
 *
 * Qoidalar:
 *  - tool ta'riflari (tools massivi) tartiblangan — har so'rovda bir xil tartib
 *  - system xabarida vaqt belgisi yoki UUID yo'q (kesh buziladi)
 *  - system xabar ro'yxatning boshida
 *  - mazmun normallanadi (ortiqcha bo'shliqlar olib tashlanmaydi — belgi sanash uchun)
 */
export function canonicalizeMessages(messages: CacheMessage[]): CacheMessage[] {
  // system xabarlarni boshiga ko'chiramiz
  const system = messages.filter((m) => m.role === "system");
  const rest = messages.filter((m) => m.role !== "system");
  return [...system, ...rest];
}

/**
 * Tool ta'riflari massivini tartiblab, deterministic qiladi.
 * JSON kalitlari ichida ham tartiblanadi (chuqur emas — 1 daraja yetarli).
 */
export function canonicalizeTools(tools: unknown[]): unknown[] {
  if (!Array.isArray(tools)) return tools;
  return tools
    .map((t) => {
      if (!t || typeof t !== "object") return t;
      const tool = t as Record<string, unknown>;
      // function.parameters.properties kalitlarini tartiblaymiz
      if (tool.type === "function" && tool.function && typeof tool.function === "object") {
        const fn = tool.function as Record<string, unknown>;
        if (fn.parameters && typeof fn.parameters === "object") {
          const params = fn.parameters as Record<string, unknown>;
          if (params.properties && typeof params.properties === "object") {
            const sorted: Record<string, unknown> = {};
            for (const k of Object.keys(params.properties as object).sort()) {
              sorted[k] = (params.properties as Record<string, unknown>)[k];
            }
            return { ...tool, function: { ...fn, parameters: { ...params, properties: sorted } } };
          }
        }
      }
      return tool;
    })
    .sort((a, b) => {
      // function.name bo'yicha saralash
      const nameA = ((a as Record<string, unknown>).function as Record<string, unknown> | undefined)?.name ?? "";
      const nameB = ((b as Record<string, unknown>).function as Record<string, unknown> | undefined)?.name ?? "";
      return String(nameA).localeCompare(String(nameB));
    });
}

// ── cache_control breakpoint ───────────────────────────────────────────────

/**
 * Oxirgi "barqaror" blokka (system yoki birinchi user xabar) cache_control qo'shadi.
 *
 * Qoida:
 *  - Anthropic / Qwen: system xabari array content ga cache_control: { type: "ephemeral" }
 *  - Google Gemini: faqat BIR breakpoint ruxsat — oxirgi system xabarga
 *  - OpenAI va qolganlar: hech narsa qo'shilmaydi (implicit/none)
 */
export function applyCacheControl(
  messages: CacheMessage[],
  modelId: string,
  prefixTokens: number,
): CacheMessage[] {
  const spec = specFor(modelId);
  if (spec.mode !== "cache_control") return messages;

  const minTokens = isHighMinModel(modelId) ? (spec.minTokensHigh ?? spec.minTokens) : spec.minTokens;
  if (prefixTokens < minTokens) return messages;

  // Eng oxirgi system xabar indeksini topamiz
  let sysIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "system") { sysIdx = i; break; }
  }
  if (sysIdx === -1) return messages; // system xabar yo'q — cache_control qo'yolmaymiz

  return messages.map((m, i) => {
    if (i !== sysIdx) return m;
    const text = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
    return {
      ...m,
      content: [{ type: "text", text, cache_control: { type: "ephemeral" } }],
    };
  });
}

// ── Tool natijalarini tozalash ─────────────────────────────────────────────

/**
 * Eski tool natijalarini o'chiradi — faqat oxirgi N ta tool call+result juftini saqlaydi.
 * Connector/agent suhbatlarida kontekstning 60-80%i eski tool natijalari bo'ladi.
 *
 * Xavfsizlik: system xabarlari va eng so'nggi user xabari hech qachon o'chirilmaydi.
 */
export function pruneToolResults(messages: CacheMessage[], keep = toolResultKeep()): CacheMessage[] {
  // tool_calls va tool role xabarlar indekslarini topamiz
  const toolCallIndices: number[] = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (
      (m.role === "assistant" && Array.isArray(m.tool_calls) && m.tool_calls.length > 0) ||
      m.role === "tool"
    ) {
      toolCallIndices.push(i);
    }
  }

  // Agar juda oz tool call bo'lsa — tozalash kerak emas
  if (toolCallIndices.length <= keep * 2) return messages;

  // Oxirgi `keep` juftiga tegishli indekslarni qoldiramiz
  const keepSet = new Set(toolCallIndices.slice(-keep * 2));

  return messages.filter((m, i) => {
    // system va non-tool xabarlar har doim saqlanadi
    if (m.role === "system" || (m.role !== "assistant" && m.role !== "tool")) return true;
    if (m.role === "tool") return keepSet.has(i);
    if (Array.isArray(m.tool_calls) && m.tool_calls.length > 0) return keepSet.has(i);
    return true;
  });
}

// ── Tool chiqishini siqish ─────────────────────────────────────────────────

/**
 * Uzun tool natijalarini qisqartiradi (head + tail + o'rtada "..." belgisi).
 * Stack trace, git diff, npm install kabi chiqishlar 1000-5000 belgigacha bo'lishi mumkin.
 *
 * Env: TOOL_OUTPUT_MAX_CHARS (standart 3000)
 */
export function compressToolOutput(messages: CacheMessage[]): CacheMessage[] {
  const maxChars = toolOutputMaxChars();
  return messages.map((m) => {
    if (m.role !== "tool") return m;
    const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
    if (content.length <= maxChars) return m;

    const head = Math.floor(maxChars * 0.6);
    const tail = maxChars - head;
    const compressed =
      content.slice(0, head) +
      `\n\n[... ${content.length - maxChars} belgi qisqartirildi ...]\n\n` +
      content.slice(-tail);

    return { ...m, content: compressed };
  });
}

// ── Session kaliti ─────────────────────────────────────────────────────────

/**
 * OpenRouter sticky routing uchun sessiya kaliti.
 * Bir sessiyada bir xil provayder tanlansa — kesh samarasi oshadi.
 * Kalitni suhbat ID'sidan yaratamiz (deterministik, 32 belgi).
 */
export function sessionKeyFor(conversationId: string, modelId: string): string {
  // Sessiya = suhbat + model (model o'zgarsa kesh yo'qoladi, yangi sessiya boshlanadi)
  const raw = `${conversationId}:${modelId.split("/").pop() ?? modelId}`;
  // Oddiy hash — crypto import kerak emas
  let h = 5381;
  for (let i = 0; i < raw.length; i++) h = ((h << 5) + h) ^ raw.charCodeAt(i);
  return (h >>> 0).toString(16).padStart(8, "0") + raw.slice(0, 24).replace(/[^a-zA-Z0-9]/g, "_");
}

// ── Cache usage normalizatsiya ─────────────────────────────────────────────

export interface NormalizedUsage {
  promptTokens: number;
  completionTokens: number;
  /** Keshdan o'qilgan tokenlar (0 = kesh miss yoki ma'lumot yo'q). */
  cacheReadTokens: number;
  /** Keshga yozilgan tokenlar (0 = yozilmagan). */
  cacheWriteTokens: number;
  /** Tejamkorlik foizi: cacheReadTokens / (promptTokens + cacheReadTokens) * 100. */
  cacheHitPct: number;
}

/**
 * Provayder/OpenRouter javobidan usage ni normallashtiradi.
 *
 * OpenRouter: usage.prompt_tokens_details.cached_tokens, cache_write_tokens, cache_discount
 * Anthropic direct: cache_read_input_tokens, cache_creation_input_tokens
 * OpenAI direct: prompt_tokens_details.cached_tokens
 * DeepSeek/Groq/Grok/Kimi: usage.prompt_tokens_details.cached_tokens
 * GLM (Z.AI): usage.prompt_tokens_details.cached_tokens
 */
export function normalizeUsage(usage: Record<string, unknown> | null | undefined): NormalizedUsage {
  const zero: NormalizedUsage = { promptTokens: 0, completionTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, cacheHitPct: 0 };
  if (!usage) return zero;

  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const promptTokens = num(usage.prompt_tokens ?? usage.input_tokens);
  const completionTokens = num(usage.completion_tokens ?? usage.output_tokens);

  // OpenRouter format
  const details = usage.prompt_tokens_details as Record<string, unknown> | undefined;
  const orCached = num(details?.cached_tokens ?? usage.cached_tokens);
  const orCacheWrite = num((usage as Record<string, unknown>).cache_write_tokens);

  // Anthropic direct format
  const anthCacheRead = num(usage.cache_read_input_tokens);
  const anthCacheWrite = num(usage.cache_creation_input_tokens);

  const cacheReadTokens = Math.max(orCached, anthCacheRead);
  const cacheWriteTokens = Math.max(orCacheWrite, anthCacheWrite);

  const total = promptTokens + cacheReadTokens;
  const cacheHitPct = total > 0 ? Math.round((cacheReadTokens / total) * 100) : 0;

  return { promptTokens, completionTokens, cacheReadTokens, cacheWriteTokens, cacheHitPct };
}

// ── Ana pipeline ───────────────────────────────────────────────────────────

export interface PipelineInput {
  messages: CacheMessage[];
  tools?: unknown[];
  modelId: string;
  /** Taxminiy prefix token soni (system + barqaror kontekst). ~4 belgi = 1 token. */
  prefixTokens?: number;
  /** Suhbat ID'si — sessiya kaliti uchun. */
  conversationId?: string;
  /** Sessiyada modelni qayta ishlatish kutilayapti (2+ so'rov). */
  reuseExpected?: boolean;
}

export interface PipelineOutput {
  messages: CacheMessage[];
  tools: unknown[];
  /** OpenRouter ga qo'shilishi kerak bo'lgan extra headers/fields. */
  extra: {
    session_id?: string;
    prompt_cache_key?: string;
  };
  /** Normalizatsiya qilingan usage (upstream javobidan keyin to'ldirish uchun stub). */
  usageStub: NormalizedUsage;
}

/**
 * Barcha optimizatsiya bosqichlarini ketma-ket qo'llaydi.
 * Fail-open: har qanday xatoda original kirish qaytariladi.
 */
export function applyTokenPipeline(input: PipelineInput): PipelineOutput {
  const empty: NormalizedUsage = { promptTokens: 0, completionTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, cacheHitPct: 0 };
  try {
    // 1. Deterministik prefix
    let messages = canonicalizeMessages(input.messages);
    const tools = canonicalizeTools(input.tools ?? []);

    // 2. Tool natijalarini tozalash
    messages = pruneToolResults(messages);

    // 3. Tool chiqishini siqish
    messages = compressToolOutput(messages);

    // 4. Prefix token taxmini
    const prefixText = messages
      .filter((m) => m.role === "system")
      .map((m) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content)))
      .join("\n");
    const prefixTokens = input.prefixTokens ?? Math.ceil(prefixText.length / 4);

    // 5. cache_control breakpoint (Anthropic/Qwen/Gemini)
    const reuseExpected = input.reuseExpected ?? true;
    if (reuseExpected) {
      messages = applyCacheControl(messages, input.modelId, prefixTokens);
    }

    // 6. Sessiya kaliti (OpenRouter sticky routing)
    const conversationId = input.conversationId ?? "default";
    const sessionId = sessionKeyFor(conversationId, input.modelId);

    return {
      messages,
      tools,
      extra: {
        session_id: sessionId,
        prompt_cache_key: sessionId,
      },
      usageStub: empty,
    };
  } catch (e) {
    console.error("[cache-pipeline] xato, original kirish qaytarildi:", e instanceof Error ? e.message : e);
    return {
      messages: input.messages,
      tools: input.tools ?? [],
      extra: {},
      usageStub: empty,
    };
  }
}
