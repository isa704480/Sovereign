// OmniRoute model katalogi — dinamik. 1700+ modelni qo'lda yozmaymiz;
// OmniRoute /v1/models dan olib, keshda saqlaymiz (server tomon, kalit oshkor bo'lmaydi).
// CLI, veb va Cowork shu manbadan foydalanadi.

export type CatalogModel = {
  id: string; // OmniRoute model id, mas. "groq/gpt-oss-120b", "auto/best-coding"
  label: string; // ko'rinadigan nom
  owner: string; // provayder (owned_by)
  context: number; // kontekst hajmi (token)
  tools: boolean; // tool-calling qo'llaydimi
  vision: boolean; // rasm kiritish
  reasoning: boolean; // fikrlash/thinking
};

type RawModel = {
  id?: string;
  owned_by?: string;
  context_length?: number;
  max_input_tokens?: number;
  capabilities?: { tool_calling?: boolean; reasoning?: boolean; thinking?: boolean; vision?: boolean };
};

const TTL = 10 * 60_000; // 10 daqiqa kesh
let cache: { at: number; models: CatalogModel[] } | null = null;

function prettify(id: string): string {
  const tail = id.includes("/") ? id.slice(id.indexOf("/") + 1) : id;
  return tail
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase())
    .trim();
}

function normalize(m: RawModel): CatalogModel | null {
  if (!m?.id) return null;
  const cap = m.capabilities ?? {};
  return {
    id: m.id,
    label: prettify(m.id),
    owner: m.owned_by ?? (m.id.includes("/") ? m.id.slice(0, m.id.indexOf("/")) : ""),
    context: m.context_length ?? m.max_input_tokens ?? 0,
    tools: !!cap.tool_calling,
    vision: !!cap.vision || /vision|vl\b/i.test(m.id),
    reasoning: !!cap.reasoning || !!cap.thinking,
  };
}

/** OmniRoute konfiguratsiya qilinganmi. */
export function omniRouteConfigured(): boolean {
  return !!process.env.OMNIROUTE_BASE_URL && !!process.env.OMNIROUTE_API_KEY;
}

/** Butun katalogni qaytaradi (keshdan yoki OmniRoute'dan). Xato bo'lsa bo'sh. */
export async function getOmniRouteModels(): Promise<CatalogModel[]> {
  const base = (process.env.OMNIROUTE_BASE_URL ?? "").replace(/\/$/, "");
  const key = process.env.OMNIROUTE_API_KEY;
  if (!base || !key) return [];
  if (cache && Date.now() - cache.at < TTL) return cache.models;
  try {
    const res = await fetch(`${base}/models`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return cache?.models ?? [];
    const j = (await res.json()) as { data?: RawModel[] };
    const raw = Array.isArray(j.data) ? j.data : [];
    const models = raw.map(normalize).filter((x): x is CatalogModel => !!x);
    // "auto/*" aqlli kombolar birinchi (eng foydali), qolgani alifbo bo'yicha.
    models.sort((a, b) => {
      const aAuto = a.id.startsWith("auto/") ? 0 : 1;
      const bAuto = b.id.startsWith("auto/") ? 0 : 1;
      return aAuto - bAuto || a.id.localeCompare(b.id);
    });
    cache = { at: Date.now(), models };
    return models;
  } catch {
    return cache?.models ?? [];
  }
}

// Model oilalari (Cursor uslubida) — id ichidagi kalit so'zdan aniqlanadi.
const FAMILY_DEFS: { key: string; label: string; kw: string[] }[] = [
  { key: "claude", label: "Claude", kw: ["claude"] },
  { key: "gpt", label: "GPT · OpenAI", kw: ["gpt", "chatgpt", "codex", "o1-", "o3-", "o4-", "/o1", "/o3", "/o4"] },
  { key: "gemini", label: "Gemini", kw: ["gemini"] },
  { key: "gemma", label: "Gemma", kw: ["gemma"] },
  { key: "deepseek", label: "DeepSeek", kw: ["deepseek"] },
  { key: "qwen", label: "Qwen", kw: ["qwen"] },
  { key: "kimi", label: "Kimi", kw: ["kimi"] },
  { key: "llama", label: "Llama", kw: ["llama"] },
  { key: "mistral", label: "Mistral", kw: ["mistral", "mixtral", "ministral", "magistral", "codestral", "devstral", "pixtral"] },
  { key: "glm", label: "GLM · Zhipu", kw: ["glm", "chatglm", "zai"] },
  { key: "minimax", label: "MiniMax", kw: ["minimax"] },
  { key: "grok", label: "Grok", kw: ["grok"] },
  { key: "nemotron", label: "Nemotron · NVIDIA", kw: ["nemotron"] },
  { key: "nova", label: "Nova", kw: ["nova"] },
  { key: "sonar", label: "Perplexity", kw: ["sonar"] },
  { key: "command", label: "Command · Cohere", kw: ["command", "cohere"] },
  { key: "mimo", label: "MiMo", kw: ["mimo"] },
  { key: "phi", label: "Phi", kw: ["phi-", "/phi"] },
  { key: "yi", label: "Yi", kw: ["/yi", "yi-"] },
  { key: "hermes", label: "Hermes", kw: ["hermes"] },
];

// Har oila uchun "auto" (eng yaxshisini OmniRoute tanlaydi) — katalogда bo'lsa.
const FAMILY_AUTO: Record<string, string> = {
  gemini: "auto/gemini",
  llama: "auto/llama",
  glm: "auto/glm",
  gemma: "auto/gemma",
  minimax: "auto/minimax",
  claude: "auto/claude-sonnet",
  mimo: "auto/mimo",
};

/** Model id → oila kaliti (auto/* lar bundan tashqari). */
export function familyOf(id: string): string {
  const low = id.toLowerCase();
  for (const d of FAMILY_DEFS) {
    if (d.kw.some((k) => low.includes(k))) return d.key;
  }
  return "boshqa";
}

export type ModelFamily = { key: string; label: string; count: number; auto?: string };

// Saxiy TEKIN modellar (≥20M token/oy) — har AI oilasidan eng yaxshi bittasi.
// auto/* kombolari OmniRoute'da eng yaxshi tekin modelni (yuqori budjet) tanlaydi.
const FEATURED_FREE: { id: string; label: string; note: string }[] = [
  { id: "auto/best-free", label: "Eng yaxshi tekin", note: "har safar eng saxiy tekin model" },
  { id: "auto/coding:free", label: "Kod — tekin", note: "kod uchun eng yaxshi tekin" },
  { id: "auto/claude-sonnet", label: "Claude", note: "Anthropic — tekin yo'naltirish" },
  { id: "auto/gemini", label: "Gemini", note: "Google — 60M/oy" },
  { id: "auto/llama", label: "Llama", note: "Meta — 30M/oy" },
  { id: "auto/glm", label: "GLM", note: "Zhipu — 30M/oy" },
  { id: "auto/gemma", label: "Gemma", note: "Google — 20M/oy" },
  { id: "auto/minimax", label: "MiniMax", note: "20M/oy" },
];

export type FeaturedModel = { id: string; label: string; note: string; context: number; tools: boolean };

/** Saxiy tekin (≥20M) tavsiya modellari — katalogda mavjudlari. */
export async function getFeaturedFree(): Promise<FeaturedModel[]> {
  const all = await getOmniRouteModels();
  const byId = new Map(all.map((m) => [m.id, m]));
  return FEATURED_FREE.filter((f) => byId.has(f.id)).map((f) => {
    const m = byId.get(f.id)!;
    return { id: f.id, label: f.label, note: f.note, context: m.context, tools: m.tools };
  });
}

/** Oilalar ro'yxati (soni bo'yicha kamayish tartibida). */
export async function getFamilies(): Promise<ModelFamily[]> {
  const all = await getOmniRouteModels();
  const autoIds = new Set(all.filter((m) => m.id.startsWith("auto/")).map((m) => m.id));
  const count = new Map<string, number>();
  for (const m of all) {
    if (m.id.startsWith("auto/")) continue;
    const k = familyOf(m.id);
    count.set(k, (count.get(k) ?? 0) + 1);
  }
  const fams: ModelFamily[] = FAMILY_DEFS.map((d) => ({
    key: d.key,
    label: d.label,
    count: count.get(d.key) ?? 0,
    auto: FAMILY_AUTO[d.key] && autoIds.has(FAMILY_AUTO[d.key]) ? FAMILY_AUTO[d.key] : undefined,
  }))
    .filter((f) => f.count > 0)
    .sort((a, b) => b.count - a.count);
  const other = count.get("boshqa") ?? 0;
  if (other) fams.push({ key: "boshqa", label: "Boshqa", count: other });
  return fams;
}

/** Qidiruv + oila + limit bilan filtrlash. */
export async function searchOmniRouteModels(
  q = "",
  limit = 100,
  family = "",
): Promise<{ total: number; models: CatalogModel[] }> {
  const all = await getOmniRouteModels();
  const query = q.toLowerCase().trim();
  let filtered = all;
  if (family) filtered = filtered.filter((m) => !m.id.startsWith("auto/") && familyOf(m.id) === family);
  if (query)
    filtered = filtered.filter(
      (m) =>
        m.id.toLowerCase().includes(query) ||
        m.label.toLowerCase().includes(query) ||
        m.owner.toLowerCase().includes(query),
    );
  return { total: filtered.length, models: filtered.slice(0, Math.max(1, Math.min(limit, 500))) };
}

/** Berilgan id katalogda bormi (routing uchun — OmniRoute'ga yo'naltirish qarori). */
export async function isOmniRouteModel(id: string): Promise<boolean> {
  if (!id) return false;
  if (id.startsWith("auto/")) return true;
  const all = await getOmniRouteModels();
  return all.some((m) => m.id === id);
}
