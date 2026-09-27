/**
 * Provider Mesh — model tarifini aniqlash (PURE: faqat katalog va served.ts id solishtiruvi).
 *
 * Bitta funksiya hamma joyda ishlatiladi (web chat route, CLI route, scheduler, request):
 *  - `modelTierFor(id)` — so'ralgan model id'sining tarifi: katalog id → o'z tarifi; "auto/*" →
 *    free; upstream nomi ("anthropic/claude-opus-5", "openrouter/…") → mos katalog modelining
 *    tarifi (aniq providerModel, keyin served.ts sameModel, keyin variant-prefiks: "…-high");
 *    ":free" va pullik variant BIR MODEL EMAS (tarif bo'yicha). To'g'ridan-to'g'ri host yo'li
 *    ("groq/…", "cloudflare/@cf/…") va hech narsaga mos kelmagan id → null (offer'ning o'z tarifi).
 *  - `requiredPlanTier(id)` — route darvozasi: katalog / auto → model tarifi; katalogda yo'q aniq
 *    model → kamida "pro" (mahsulot qoidasi), mos katalog modeli qimmatroq bo'lsa — o'sha (ultra).
 *
 * Test: npx tsx --conditions=react-server src/lib/ai/mesh/tier.test.ts
 */
import { MODELS, MODEL_BY_ID } from "@/config/models";
import { modelTokens, sameModel } from "../served";
import { TIER_RANK, type PlanTier } from "./types";

export function maxTier(a: PlanTier, b: PlanTier): PlanTier {
  return TIER_RANK[a] >= TIER_RANK[b] ? a : b;
}

export function minTier(a: PlanTier, b: PlanTier): PlanTier {
  return TIER_RANK[a] <= TIER_RANK[b] ? a : b;
}

/** To'g'ridan-to'g'ri provayder yo'li prefikslari — tarifni shu provayder taklifi (offer) belgilaydi. */
const DIRECT_HOSTS = new Set([
  "groq",
  "cloudflare",
  "cerebras",
  "sambanova",
  "llm7",
  "experiential",
  "gateway",
  "nvidia_nim",
  "rsi",
  "tella",
  "aihorde",
  "pollinations",
  "omniroute",
]);

const isFree = (id: string) => /:free$/i.test(id);

function highest(tiers: PlanTier[]): PlanTier {
  return tiers.reduce((a, b) => maxTier(a, b));
}

/** Katalog modellari (providerModel bor) — bir marta. */
const CATALOG = MODELS.filter((m) => !!m.providerModel).map((m) => ({
  pm: m.providerModel,
  pmLower: m.providerModel.toLowerCase(),
  tier: m.tier as PlanTier,
  free: isFree(m.providerModel),
  toks: modelTokens(m.providerModel),
}));

/**
 * So'ralgan model id'sining tarifi. null — tarifni offer'ning o'zi belgilaydi (to'g'ridan-to'g'ri
 * host yo'li yoki katalogga hech mos kelmaydigan id).
 */
export function modelTierFor(raw: string | null | undefined): PlanTier | null {
  const id = (raw ?? "").trim();
  if (!id) return null;
  if (id === "auto" || id.startsWith("auto/")) return "free";
  const cat = MODEL_BY_ID[id];
  if (cat) return cat.tier as PlanTier;

  let s = id;
  if (s.toLowerCase().startsWith("openrouter/")) s = s.slice("openrouter/".length);
  const parts = s.split("/");
  if (parts.length >= 2 && DIRECT_HOSTS.has(parts[0].toLowerCase())) return null;

  const free = isFree(s);
  const lower = s.toLowerCase();
  const exact = CATALOG.filter((c) => c.pmLower === lower);
  if (exact.length) return highest(exact.map((c) => c.tier));
  // ":free" va pullik variant — tarif bo'yicha boshqa-boshqa model.
  const same = CATALOG.filter((c) => c.free === free && sameModel(c.pm, s));
  if (same.length) return highest(same.map((c) => c.tier));
  if (free) return "free";
  // Variant: "dva/claude-opus-5-high" → Claude Opus 5 (ultra). Kamida 2 tokenli katalog nomi.
  const toks = modelTokens(s);
  const prefix = CATALOG.filter(
    (c) => !c.free && c.toks.length >= 2 && c.toks.length < toks.length && c.toks.every((t, i) => toks[i] === t),
  );
  if (prefix.length) return highest(prefix.map((c) => c.tier));
  return null;
}

/**
 * Route darvozasi (web chat va CLI bir xil): foydalanuvchi shu id'ni tanlashi uchun kerakli tarif.
 * Katalog / auto — o'z tarifi; katalogda yo'q aniq model — kamida Pro, mos katalog modeli
 * qimmatroq bo'lsa — o'sha tarif (Pro foydalanuvchi upstream nomi bilan Ultra modelni ololmaydi).
 */
export function requiredPlanTier(raw: string): PlanTier {
  const id = (raw ?? "").trim();
  const t = modelTierFor(id);
  if (id === "auto" || id.startsWith("auto/") || MODEL_BY_ID[id]) return t ?? "free";
  return maxTier("pro", t ?? "pro");
}
