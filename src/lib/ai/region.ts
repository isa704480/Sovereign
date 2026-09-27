/**
 * Mintaqa bo'yicha model siyosati (region model policy).
 *
 * SOVEREIGN yopiq modellarni (Claude, GPT, Gemini, Grok, Mistral ...) o'z upstream
 * hisoblarimiz (OmniRoute / OpenRouter / to'g'ridan-to'g'ri kalitlar) orqali qayta
 * sotadi. Provayder qo'llab-quvvatlamaydigan mintaqadan (Rossiya, Belarus, sanksiya
 * ostidagi hududlar ...) so'rov yuborsak — provayder qoidasi buziladi va upstream hisob
 * HAMMA foydalanuvchilar uchun bloklanishi mumkin. Shuning uchun:
 *   - bunday mintaqadagi foydalanuvchi SOVEREIGN'dan foydalanishda davom etadi,
 *   - lekin faqat shu mintaqaga ruxsat bergan provayderlarning modellari bilan
 *     (DeepSeek, Qwen, GLM, Kimi, MiniMax, ochiq og'irlikli Llama / gpt-oss ...).
 *
 * Bu fayl PURE (tarmoq, env, server-only yo'q) — klient (ModelSwitcher) ham, server
 * (chat route, CLI route, providers) ham bir xil qoidadan foydalanadi.
 * Test: npx tsx src/lib/ai/region.test.ts
 *
 * Qoida: model kimning "siyosati" ostida (policy owner) — id'dan aniqlanadi. Yopiq
 * model uchun — ishlab chiquvchi (u o'zi yoki OpenRouter orqali xizmat qiladi; OpenRouter
 * ToS §5.7 mintaqa cheklovini aynan model provayderiga topshiradi). Ochiq og'irlikli
 * model uchun — xizmat ko'rsatuvchi host (Groq / OpenRouter / Cerebras ...: AQSh
 * kompaniyalari, OFAC to'liq embargo ro'yxatiga bo'ysunadi). Noma'lum model yoki
 * aralash "auto/*" kombo (OmniRoute ichida qaysi provayderga borishini bilmaymiz) —
 * ehtiyotkorlik bilan HAMMA cheklangan mintaqada taqiqlangan.
 */

/** OFAC to'liq (comprehensive) embargo — har bir AQSh upstream'i (OpenRouter, Groq, ...) uchun. */
export const SANCTIONED = ["CU", "IR", "KP", "SY"] as const;
const RU_BY = ["RU", "BY"] as const;
const CN_HK_MO = ["CN", "HK", "MO"] as const;

export type PolicyOwner =
  | "anthropic"
  | "openai"
  | "google"
  | "xai"
  | "mistral"
  | "perplexity"
  | "nvidia"
  | "meta"
  | "openweight"
  | "deepseek"
  | "alibaba"
  | "zhipu"
  | "moonshot"
  | "minimax"
  | "xiaomi"
  | "sovereign"
  | "unknown";

export interface ProviderPolicy {
  /** ISO-3166 alpha-2 — shu mamlakatlarda model ishlatilmaydi. */
  restricted: readonly string[];
  /** Manba (rasmiy hujjat) va tekshirilgan sana. */
  source: string;
  checked: string;
  /** true — rasmiy ro'yxat topilmadi, ehtiyotkorlik bilan cheklangan. */
  conservative?: boolean;
}

const ALL_RESTRICTED = [...RU_BY, ...CN_HK_MO, ...SANCTIONED] as const;

/**
 * Provayder jadvali. Yangilash: manbani qayta o'qing, sanani o'zgartiring,
 * `npx tsx src/lib/ai/region.test.ts` ni ishga tushiring.
 */
export const PROVIDER_POLICY: Record<PolicyOwner, ProviderPolicy> = {
  // Ro'yxatda RU, BY, CN, HK, MO, IR, KP, SY, CU yo'q (UZ, KZ — bor).
  anthropic: { restricted: ALL_RESTRICTED, source: "https://www.anthropic.com/supported-countries", checked: "2026-09-27" },
  // "Accessing or offering access ... outside of the countries listed ... may result in your account being blocked".
  openai: { restricted: ALL_RESTRICTED, source: "https://developers.openai.com/api/docs/supported-countries", checked: "2026-09-27" },
  // Gemini API available regions — RU, BY, CN, HK, MO, IR, KP, SY, CU yo'q. Gemma (:free endpointlari Google AI Studio) ham shu yerda.
  google: { restricted: ALL_RESTRICTED, source: "https://ai.google.dev/gemini-api/docs/available-regions", checked: "2026-09-27" },
  // Ochiq mamlakat ro'yxati yo'q; ToS AQSh eksport/OFAC talablariga bo'ysunadi — Rossiya taqiqlangan deb hisoblanadi.
  xai: { restricted: ALL_RESTRICTED, source: "https://x.ai/legal/terms-of-service", checked: "2026-09-27", conservative: true },
  // ToS: sanksiya/eksport qonunlariga zid foydalanish taqiqlangan (EI sanksiyalari: RU, BY). Mamlakat ro'yxati yo'q.
  mistral: { restricted: [...RU_BY, ...SANCTIONED], source: "https://legal.mistral.ai/terms", checked: "2026-09-27", conservative: true },
  // AQSh kompaniyasi, API uchun mamlakat ro'yxati topilmadi — ehtiyotkorlik bilan.
  perplexity: { restricted: [...RU_BY, ...SANCTIONED], source: "https://www.perplexity.ai/hub/legal/terms-of-service", checked: "2026-09-27", conservative: true },
  // NVIDIA 2022 da Rossiyadan chiqqan; Nemotron :free endpointlari va NIM — NVIDIA xizmati.
  nvidia: { restricted: [...RU_BY, ...SANCTIONED], source: "https://www.nvidia.com/en-us/about-nvidia/terms-of-service/", checked: "2026-09-27", conservative: true },
  // Ochiq og'irlik (Llama litsenziyasida mamlakat cheklovi yo'q). Hostlar — Groq/Cerebras/SambaNova/OpenRouter (AQSh, OFAC).
  meta: { restricted: SANCTIONED, source: "https://console.groq.com/docs/legal/services-agreement (§6.3 Export Control Laws)", checked: "2026-09-27" },
  // gpt-oss (Apache-2.0), Whisper large-v3 va boshqa ochiq og'irlikli modellar — host qoidasi (OFAC).
  openweight: { restricted: SANCTIONED, source: "https://openrouter.ai/terms (§5.7 Model Restrictions, 2026-08-31)", checked: "2026-09-27" },
  // DeepSeek ToS mamlakat ro'yxatini bermaydi; Rossiya cheklanmagan. Host (OpenRouter/OmniRoute) — OFAC.
  deepseek: { restricted: SANCTIONED, source: "https://cdn.deepseek.com/policies/en-US/deepseek-open-platform-terms-of-service.html", checked: "2026-09-27" },
  alibaba: { restricted: SANCTIONED, source: "https://www.alibabacloud.com/help/en/model-studio/what-is-model-studio", checked: "2026-09-27" },
  zhipu: { restricted: SANCTIONED, source: "https://openrouter.ai/terms (§5.7) — Z.ai mintaqa cheklovi e'lon qilmagan", checked: "2026-09-27" },
  moonshot: { restricted: SANCTIONED, source: "https://openrouter.ai/terms (§5.7) — Moonshot mintaqa cheklovi e'lon qilmagan", checked: "2026-09-27" },
  minimax: { restricted: SANCTIONED, source: "https://openrouter.ai/terms (§5.7) — MiniMax mintaqa cheklovi e'lon qilmagan", checked: "2026-09-27" },
  xiaomi: { restricted: SANCTIONED, source: "https://openrouter.ai/terms (§5.7) — Xiaomi MiMo mintaqa cheklovi e'lon qilmagan", checked: "2026-09-27" },
  // Tella — o'z serverimiz, tashqi provayder yo'q.
  sovereign: { restricted: [], source: "SOVEREIGN o'z serveri (TELLA_BASE_URL)", checked: "2026-09-27" },
  // Noma'lum model / aralash kombo — qayerga borishini bilmaymiz: hamma cheklangan mintaqada yopiq.
  unknown: { restricted: ALL_RESTRICTED, source: "ehtiyotkorlik: provayder aniqlanmadi", checked: "2026-09-27", conservative: true },
};

/**
 * Upstream hostlar (to'g'ridan-to'g'ri kalitlar va OmniRoute id prefikslari). Ochiq
 * og'irlikli model ham cheklovchi hostga yuborilmasin (masalan Llama → NVIDIA NIM).
 * Ro'yxatda yo'q host — "unknown" (hamma cheklangan mintaqada yopiq).
 */
export const HOST_POLICY: Record<string, readonly string[]> = {
  openrouter: SANCTIONED, // ToS §5.7: mintaqa cheklovi model provayderiga topshirilgan (model qoidasi alohida tekshiriladi)
  groq: SANCTIONED, // Services Agreement §6.3 (EAR/OFAC)
  cerebras: SANCTIONED,
  sambanova: SANCTIONED,
  omniroute: [], // o'z proksi-serverimiz — model id qoidasi hal qiladi
  tella: [],
  aihorde: SANCTIONED,
  pollinations: SANCTIONED,
  nvidia: PROVIDER_POLICY.nvidia.restricted,
  mistral: PROVIDER_POLICY.mistral.restricted,
  openai: PROVIDER_POLICY.openai.restricted,
  anthropic: PROVIDER_POLICY.anthropic.restricted,
  google: PROVIDER_POLICY.google.restricted,
  gemini: PROVIDER_POLICY.google.restricted,
  perplexity: PROVIDER_POLICY.perplexity.restricted,
  rsi: ALL_RESTRICTED, // Claude/GPT reselleri
  llm7: ALL_RESTRICTED, // hujjatsiz anonim shlyuz — ehtiyotkorlik
  experiential: ALL_RESTRICTED,
  gateway: ALL_RESTRICTED,
};

/** Kamida bitta provayder cheklagan barcha mamlakatlar. */
const RESTRICTED_SET = new Set<string>(Object.values(PROVIDER_POLICY).flatMap((p) => p.restricted));

export function normalizeCountry(country: string | null | undefined): string | null {
  if (!country) return null;
  const c = country.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(c) && c !== "XX" ? c : null;
}

/** Mamlakat kamida bitta provayder tomonidan cheklanganmi (UI va enforcement shu bilan yoqiladi). */
export function restrictedRegion(country: string | null | undefined): boolean {
  const c = normalizeCountry(country);
  return !!c && RESTRICTED_SET.has(c);
}

/** Hamma tashqi provayder (OFAC) yopiq mintaqa: faqat o'z serverimizdagi model qoladi. */
export function sanctionedRegion(country: string | null | undefined): boolean {
  const c = normalizeCountry(country);
  return !!c && (SANCTIONED as readonly string[]).includes(c);
}

/* ------------------------------------------------------------------ */
/* Model id → siyosat egasi                                            */
/* ------------------------------------------------------------------ */

/**
 * Katalog (MODEL_BY_ID) id'lari → upstream providerModel. Bu yerda nusxa — region.ts
 * config/models'ni import qilmasin (u katta, klient bundle'ga ikki marta kirmasin);
 * nomlash qoidalari (claude-*, gpt-*, gemini-* ...) baribir quyidagi regexlar bilan
 * tutiladi. Faqat nomidan provayder ko'rinmaydiganlari:
 */
const STATIC_ALIASES: Record<string, string> = {
  "tella-2": "tella-2",
  "sonar-online": "perplexity/sonar",
  "sonar-pro-online": "perplexity/sonar-pro",
  "o1-mini": "openai/o1-mini",
  "llama-3.3-free": "meta-llama/llama-3.3-70b-instruct:free",
  "deepseek-r1-free": "deepseek/deepseek-r1-distill-llama-70b:free",
};

/** Tartib muhim: aniqroq (gpt-oss, gemma, nemotron) umumiyroqdan (gpt, google, llama) oldin. */
const OWNER_RULES: [RegExp, PolicyOwner][] = [
  [/(^|\/)tella/, "sovereign"],
  [/gpt-oss|whisper-large|(^|\/)openai\/whisper-large/, "openweight"],
  [/nemotron|(^|\/)nvidia\//, "nvidia"],
  [/gemma|gemini|imagen|veo-?\d|nano-?banana|(^|\/)google\//, "google"],
  [/claude|anthropic/, "anthropic"],
  [/grok|x-ai|(^|\/)xai\//, "xai"],
  [/mistral|mixtral|ministral|magistral|codestral|devstral|pixtral|voxtral/, "mistral"],
  [/sonar|perplexity/, "perplexity"],
  [/deepseek/, "deepseek"],
  [/qwen|qwq|tongyi|(^|\/)wan-?\d|alibaba/, "alibaba"],
  [/glm|z-ai|(^|\/)zai|zhipu/, "zhipu"],
  [/kimi|moonshot/, "moonshot"],
  [/minimax/, "minimax"],
  [/mimo|xiaomi/, "xiaomi"],
  [/llama|(^|\/)meta\//, "meta"],
  [/(^|\/)gpt|chatgpt|codex|(^|\/)o[134](-|$)|dall-e|whisper-1|text-embedding|tts-|sora|(^|\/)openai\//, "openai"],
];

/** Model id (katalog, OmniRoute "host/vendor/model", "auto/<oila>") → siyosat egasi. */
export function policyOwner(modelId: string): PolicyOwner {
  const raw = (modelId ?? "").trim().toLowerCase();
  if (!raw) return "unknown";
  if (raw === "auto") return "unknown"; // SOVEREIGN Auto — route o'zi ruxsat etilganini tanlaydi
  const id = STATIC_ALIASES[raw] ?? raw;
  for (const [re, owner] of OWNER_RULES) if (re.test(id)) return owner;
  return "unknown";
}

/** Faqat host bo'la oladigan prefikslar (model ishlab chiqaruvchi nomi emas). */
const PURE_HOSTS = new Set(["openrouter", "groq", "cerebras", "sambanova", "omniroute", "aihorde", "pollinations", "rsi", "llm7", "experiential", "gateway"]);

/**
 * OmniRoute id prefiksi ("groq/qwen/..." → "groq") — ma'lum host bo'lsa. "openai/gpt-oss-120b"
 * kabi ikki bo'lakli id'da "openai" — ishlab chiqaruvchi (OpenRouter uslubi), host emas.
 */
export function hostOf(modelId: string): string | null {
  const parts = (modelId ?? "").toLowerCase().split("/");
  if (parts.length < 2 || !(parts[0] in HOST_POLICY)) return null;
  return parts.length >= 3 || PURE_HOSTS.has(parts[0]) ? parts[0] : null;
}

export function hostAllowedIn(host: string, country: string | null | undefined): boolean {
  const c = normalizeCountry(country);
  if (!c) return true;
  const list = HOST_POLICY[host.toLowerCase()] ?? ALL_RESTRICTED;
  return !list.includes(c);
}

/**
 * Model shu mamlakatdagi foydalanuvchiga ruxsat etilganmi (model provayderi VA — id'da
 * ko'rinsa — upstream host qoidasi). Mamlakat noma'lum yoki cheklanmagan — true.
 */
export function modelAllowedIn(modelId: string, country: string | null | undefined): boolean {
  const c = normalizeCountry(country);
  if (!c || !RESTRICTED_SET.has(c)) return true;
  if (modelId === "auto") return true; // SOVEREIGN Auto — faqat ruxsat etilgan nomzodlarni tanlaydi (chat route)
  if (PROVIDER_POLICY[policyOwner(modelId)].restricted.includes(c)) return false;
  const host = hostOf(modelId);
  return !host || hostAllowedIn(host, c);
}

/* ------------------------------------------------------------------ */
/* Almashtirish jadvali (restricted → allowed equivalent)             */
/* ------------------------------------------------------------------ */

export type RegionClass = "flagship" | "fast" | "code" | "free";
type Tier = "free" | "starter" | "pro" | "ultra";

/** OmniRoute orqali 2026-09-23 da sinalgan id'lar (auto-pools.ts bilan bir xil). */
export const REGION_SAFE = {
  deepseek: "openrouter/deepseek/deepseek-v4-flash",
  kimi: "openrouter/moonshotai/kimi-k2.6",
  glm: "openrouter/z-ai/glm-5.2",
  qwen: "groq/qwen/qwen3.8-27b",
  glmAuto: "auto/glm",
  minimaxAuto: "auto/minimax",
} as const;

/**
 * Sinf → ruxsat etilgan ekvivalentlar (afzallik tartibida) va har birining minimal
 * tarifi (narx nazorati: Free foydalanuvchiga pullik Kimi berilmaydi). OmniRoute id'lari
 * avval (ular ishlaydi), keyin katalog id'lari (OpenRouter/Groq kaliti bilan), oxirida
 * Groq'dagi ochiq og'irlikli universal zaxira ("llama-3.3-free" → gpt-oss / Llama).
 *   Claude Opus/Sonnet, GPT-5/6, Gemini Pro, Grok 4, Mistral Large → flagship
 *   Haiku, GPT mini/Luna, Gemini Flash, Mistral Small               → fast
 *   Codestral, GPT Codex, Grok Build (va Auto'dagi kod vazifasi)     → code
 *   Tekin (Gemini :free, Gemma, Nemotron, auto/best-free ...)       → free
 */
export const REGION_EQUIVALENTS: Record<RegionClass, { id: string; tier: Tier }[]> = {
  flagship: [
    { id: REGION_SAFE.kimi, tier: "pro" },
    { id: REGION_SAFE.deepseek, tier: "starter" },
    { id: REGION_SAFE.glm, tier: "starter" },
    { id: "qwen3-8-max", tier: "pro" },
    { id: "deepseek-v4-pro", tier: "pro" },
    { id: "glm-5-3", tier: "pro" },
    { id: REGION_SAFE.qwen, tier: "free" },
    { id: "llama-3.3-free", tier: "free" },
  ],
  fast: [
    { id: REGION_SAFE.deepseek, tier: "starter" },
    { id: REGION_SAFE.glm, tier: "starter" },
    { id: "deepseek-v4-flash", tier: "starter" },
    { id: "qwen3-7-flash", tier: "starter" },
    { id: REGION_SAFE.qwen, tier: "free" },
    { id: REGION_SAFE.glmAuto, tier: "free" },
    { id: "llama-3.3-free", tier: "free" },
  ],
  code: [
    { id: REGION_SAFE.kimi, tier: "pro" },
    { id: REGION_SAFE.deepseek, tier: "starter" },
    { id: "deepseek-v4-pro", tier: "pro" },
    { id: "qwen3-8-27b", tier: "starter" },
    { id: REGION_SAFE.qwen, tier: "free" },
    { id: "llama-3.3-free", tier: "free" },
  ],
  free: [
    { id: REGION_SAFE.qwen, tier: "free" },
    { id: REGION_SAFE.glmAuto, tier: "free" },
    { id: REGION_SAFE.minimaxAuto, tier: "free" },
    { id: "deepseek-r1-free", tier: "free" },
    { id: "llama-3.3-free", tier: "free" },
  ],
};

const CODE_MODEL_RE = /codestral|devstral|coder|codex|grok-build|coding/i;
const FLAGSHIP_RE = /opus|sonnet|fable|gpt-?[4-9](?!.*(mini|nano|luna))|gemini.*pro|grok-?\d|large|medium|ultra|max|o1(?!-mini)|o3|sonar-pro/i;

/**
 * So'ralgan (cheklangan) model qaysi sinfga kiradi. `tier` — katalog modelining tarifi
 * (bo'lsa), `code` — vazifa kod ekani (Auto klassifikatsiyasi yoki savol matni).
 */
export function regionClassOf(modelId: string, opts: { tier?: Tier; code?: boolean } = {}): RegionClass {
  if (opts.code || CODE_MODEL_RE.test(modelId)) return "code";
  if (opts.tier === "free" || /:free$|^auto\//i.test(modelId)) return "free";
  if (opts.tier === "pro" || opts.tier === "ultra") return "flagship";
  if (opts.tier === "starter") return "fast";
  return FLAGSHIP_RE.test(modelId) ? "flagship" : "fast";
}

/**
 * Cheklangan modelning ruxsat etilgan ekvivalentlari (tartib bilan). Faqat tarif ruxsat
 * bergan va shu mamlakatda ruxsat etilganlar. Mavjudlik (kalit / OmniRoute sozlanganmi)
 * — chaqiruvchi filtrlaydi (`available`).
 */
export function regionEquivalents(
  modelId: string,
  country: string | null | undefined,
  opts: {
    tier?: Tier;
    code?: boolean;
    tierAllowed?: (tier: Tier) => boolean;
    available?: (id: string) => boolean;
  } = {},
): string[] {
  const cls = regionClassOf(modelId, opts);
  const tierOk = opts.tierAllowed ?? (() => true);
  const avail = opts.available ?? (() => true);
  const seen = new Set<string>();
  const out: string[] = [];
  // Sinfning o'zi, keyin arzonroq sinflar — biror ruxsat etilgani albatta topilsin.
  const order: RegionClass[] =
    cls === "flagship" ? ["flagship", "fast", "free"] : cls === "code" ? ["code", "fast", "free"] : cls === "fast" ? ["fast", "free"] : ["free"];
  for (const c of order) {
    for (const e of REGION_EQUIVALENTS[c]) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      if (tierOk(e.tier) && modelAllowedIn(e.id, country) && avail(e.id)) out.push(e.id);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Route qarori (pure) — chat va CLI route'lari shu funksiyani chaqiradi */
/* ------------------------------------------------------------------ */

export interface RegionDecision {
  /** Mamlakat cheklangan (UI va loglar uchun). */
  restricted: boolean;
  /** So'ralgan model shu mintaqada ruxsat etilgan. */
  allowed: boolean;
  /** Sinab ko'riladigan nomzodlar (tartib bilan). Bo'sh — xizmat ko'rsatib bo'lmaydi. */
  candidates: string[];
  /** Mintaqa sababli boshqa modelga o'tildi (foydalanuvchiga ochiq aytiladi). */
  substituted: boolean;
}

/**
 * Bitta qadam uchun yakuniy nomzodlar: `candidates` (so'ralgan model + odatdagi
 * zaxiralar) ichidan ruxsat etilmaganlar olib tashlanadi; so'ralgan model cheklangan
 * bo'lsa — mintaqa ekvivalentlari oldinga qo'yiladi. Cheklanmagan mintaqada — o'zgarishsiz.
 */
export function regionDecision(input: {
  requested: string;
  candidates: string[];
  country: string | null | undefined;
  tier?: Tier;
  code?: boolean;
  tierAllowed?: (tier: Tier) => boolean;
  available?: (id: string) => boolean;
}): RegionDecision {
  const { requested, country } = input;
  const base = input.candidates.length ? input.candidates : [requested];
  if (!restrictedRegion(country)) {
    return { restricted: false, allowed: true, candidates: base, substituted: false };
  }
  const allowed = modelAllowedIn(requested, country);
  const kept = base.filter((id) => modelAllowedIn(id, country));
  if (allowed) {
    const extra = kept.length ? [] : regionEquivalents(requested, country, input);
    return { restricted: true, allowed: true, candidates: dedupe([...kept, ...extra]), substituted: false };
  }
  const equivalents = regionEquivalents(requested, country, input);
  return { restricted: true, allowed: false, candidates: dedupe([...equivalents, ...kept]), substituted: true };
}

function dedupe(ids: string[]): string[] {
  return [...new Set(ids)];
}
