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

/** Qidiruv + limit bilan filtrlash. */
export async function searchOmniRouteModels(q = "", limit = 100): Promise<{ total: number; models: CatalogModel[] }> {
  const all = await getOmniRouteModels();
  const query = q.toLowerCase().trim();
  const filtered = query
    ? all.filter(
        (m) =>
          m.id.toLowerCase().includes(query) ||
          m.label.toLowerCase().includes(query) ||
          m.owner.toLowerCase().includes(query),
      )
    : all;
  return { total: filtered.length, models: filtered.slice(0, Math.max(1, Math.min(limit, 500))) };
}

/** Berilgan id katalogda bormi (routing uchun — OmniRoute'ga yo'naltirish qarori). */
export async function isOmniRouteModel(id: string): Promise<boolean> {
  if (!id) return false;
  if (id.startsWith("auto/")) return true;
  const all = await getOmniRouteModels();
  return all.some((m) => m.id === id);
}
