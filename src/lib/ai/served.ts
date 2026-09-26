/**
 * "Haqiqatda qaysi model javob berdi?" — so'ralgan va upstream qaytargan model
 * id'larini solishtirish. Provayderlar bir xil modelni turlicha yozadi
 * ("anthropic/claude-sonnet-4.5" ↔ "claude-sonnet-4-5-20250929",
 * "meta-llama/llama-3.3-70b-instruct" ↔ "Meta-Llama-3.3-70B-Instruct"),
 * lekin boshqa model ("llama-3.3-70b" → "gpt-oss-120b") almashtirish hisoblanadi.
 *
 * Pure funksiya (tarmoqsiz) — test: npx tsx src/lib/ai/served.test.ts
 */

/** Model nomida ma'no bermaydigan qo'shimchalar (variant/kanal belgisi). */
const NOISE = new Set(["instruct", "latest", "chat", "preview", "versatile", "free", "it", "hf"]);
/** Boshida kelsa tashlab yuboriladigan tashkilot nomlari. */
const VENDORS = new Set(["meta", "anthropic", "openai", "google", "mistralai", "microsoft", "nvidia"]);

function tokens(id: string): string[] {
  let s = id.toLowerCase().trim();
  s = s.split("/").pop() ?? s; // "vendor/model" → "model"
  s = s.replace(/:[a-z0-9-]+$/, ""); // ":free", ":beta"
  // Sana qo'shimchalari: -20250929, -2024-07-18
  s = s.replace(/[-_.]?\d{4}-\d{2}-\d{2}$/, "").replace(/[-_.]?\d{8}$/, "");
  const parts = s
    .split(/[^a-z0-9]+/)
    .flatMap((p) => p.split(/(?<=[a-z])(?=\d)|(?<=\d)(?=[a-z])/))
    .filter(Boolean);
  while (parts.length > 1 && VENDORS.has(parts[0])) parts.shift();
  return parts.filter((p) => !NOISE.has(p));
}

/** Ikkala id bir xil modelni bildiradimi (versiya sanasi, vendor prefiksi, registr farqi hisobga olinmaydi). */
export function sameModel(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.length || !tb.length) return false;
  return ta.length === tb.length && ta.every((t, i) => t === tb[i]);
}

/**
 * Upstream javob bergan model foydalanuvchi tanlagan modeldan farq qiladimi.
 * "auto/*" (OmniRoute kombosi) — o'zi yo'naltiruvchi, u almashtirish emas.
 */
export function isSubstitution(requestedProviderModel: string, servedModel: string): boolean {
  if (requestedProviderModel.startsWith("auto/") || requestedProviderModel === "auto") return false;
  return !sameModel(requestedProviderModel, servedModel);
}
