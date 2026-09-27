/**
 * MCP tools/list natijasini tozalash (sof funksiyalar, tarmoqsiz). Tashqi server
 * bergan inputSchema cheksiz katta bo'lishi (har tool-bosqich chaqiruvida
 * platforma hisobidan token sarfi) va tavsiflar orqali prompt-injection tashishi
 * mumkin. Faqat type/properties/enum/items/required qoldiriladi, tavsiflar olib
 * tashlanadi, hajm cheklanadi.
 */

/** tools/list javobining maksimal hajmi (bayt). */
export const MCP_LIST_MAX_BYTES = 256_000;
/** Bitta tool sxemasining maksimal JSON hajmi (tozalangandan keyin). */
export const MCP_TOOL_SCHEMA_MAX = 4_096;
/** Barcha MCP tool'lari (bitta server) JSON hajmi chegarasi. */
export const MCP_TOOLS_TOTAL_MAX = 16_384;
export const MCP_TOOLS_MAX = 20;

const TOOL_NAME_RE = /^[A-Za-z0-9_-]{1,64}$/;
const PROP_NAME_RE = /^[A-Za-z0-9_.-]{1,64}$/;
const SCHEMA_TYPES = new Set(["object", "array", "string", "number", "integer", "boolean", "null"]);
const MAX_PROPS = 30;
const MAX_ENUM = 50;
const MAX_DEPTH = 4;

type Schema = Record<string, unknown>;

function cleanType(t: unknown): string | string[] | undefined {
  if (typeof t === "string") return SCHEMA_TYPES.has(t) ? t : undefined;
  if (Array.isArray(t)) {
    const ts = t.filter((x): x is string => typeof x === "string" && SCHEMA_TYPES.has(x)).slice(0, 7);
    return ts.length ? ts : undefined;
  }
  return undefined;
}

function cleanEnum(e: unknown): (string | number | boolean | null)[] | undefined {
  if (!Array.isArray(e)) return undefined;
  const out = e
    .filter((v) => v === null || typeof v === "number" || typeof v === "boolean" || (typeof v === "string" && v.length <= 100))
    .slice(0, MAX_ENUM) as (string | number | boolean | null)[];
  return out.length ? out : undefined;
}

function cleanNode(node: unknown, depth: number): Schema {
  if (!node || typeof node !== "object" || Array.isArray(node)) return {};
  const n = node as Schema;
  const out: Schema = {};
  const type = cleanType(n.type);
  if (type) out.type = type;
  const en = cleanEnum(n.enum);
  if (en) out.enum = en;
  if (depth < MAX_DEPTH) {
    if (n.items && typeof n.items === "object" && !Array.isArray(n.items)) out.items = cleanNode(n.items, depth + 1);
    if (n.properties && typeof n.properties === "object" && !Array.isArray(n.properties)) {
      const props: Schema = {};
      for (const [k, v] of Object.entries(n.properties as Schema).slice(0, MAX_PROPS)) {
        if (PROP_NAME_RE.test(k)) props[k] = cleanNode(v, depth + 1);
      }
      out.properties = props;
      if (Array.isArray(n.required)) {
        const req = n.required.filter((r): r is string => typeof r === "string" && r in props);
        if (req.length) out.required = req;
      }
    }
  }
  return out;
}

/** MCP inputSchema → xavfsiz, kichik JSON Schema (tavsiflarsiz). Ildiz har doim object. */
export function sanitizeMcpSchema(schema: unknown): Schema {
  const s = cleanNode(schema, 0);
  return { type: "object", properties: (s.properties as Schema | undefined) ?? {}, ...(s.required ? { required: s.required } : {}) };
}

/** Tashqi tavsif — bitta qator, boshqaruv belgilarisiz, qisqa. */
export function cleanMcpDescription(desc: unknown, fallback: string): string {
  return String(desc ?? fallback)
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

export interface SanitizedMcpTool {
  /** Server'dagi asl nom (prefiks qo'shilmagan). */
  name: string;
  description: string;
  parameters: Schema;
}

/**
 * tools/list ro'yxatini tozalaydi: nom tekshiruvi, sxema tozalash, har tool ≤4 KB,
 * jami ≤16 KB, ≤20 tool. Chegaradan oshgan tool tashlanadi (xato emas).
 */
export function sanitizeMcpTools(list: unknown): SanitizedMcpTool[] {
  if (!Array.isArray(list)) return [];
  const out: SanitizedMcpTool[] = [];
  let total = 0;
  const seen = new Set<string>();
  for (const raw of list) {
    if (out.length >= MCP_TOOLS_MAX) break;
    if (!raw || typeof raw !== "object") continue;
    const t = raw as { name?: unknown; description?: unknown; inputSchema?: unknown };
    if (typeof t.name !== "string" || !TOOL_NAME_RE.test(t.name) || seen.has(t.name)) continue;
    const parameters = sanitizeMcpSchema(t.inputSchema);
    const description = cleanMcpDescription(t.description, t.name);
    const size = JSON.stringify(parameters).length + description.length + t.name.length;
    if (size > MCP_TOOL_SCHEMA_MAX) continue;
    if (total + size > MCP_TOOLS_TOTAL_MAX) break;
    total += size;
    seen.add(t.name);
    out.push({ name: t.name, description, parameters });
  }
  return out;
}
