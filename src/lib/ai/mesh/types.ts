/**
 * Provider Mesh — umumiy shartnoma (contract). Barcha provayderlar (Groq, Cloudflare,
 * OpenRouter, OmniRoute, LLM7, Mistral, NVIDIA, Cerebras, SambaNova, RSI, Gateway,
 * Experiential, OpenAI, Tella, Perplexity) bitta algoritm bilan kelishib ishlaydi:
 * umumiy sog'liq holati (circuit breaker, cooldown, kvota tiklanish vaqti — Upstash'da),
 * imkoniyat/mintaqa/tarif bo'yicha rejalashtirish, yukni sog'lom provayderlarga taqsimlash,
 * tor qayta urinish va halol "served model" hisoboti. Web chat ham, CLI ham shu bilan ishlaydi.
 *
 * Bu fayl PURE: faqat tiplar va konstantalar (tarmoq, env, server-only yo'q) — testlar va
 * boshqa mesh modullari (registry, health, scheduler, execute, providers/*) shu yerdan import qiladi.
 * Algoritm spetsifikatsiyasi: docs/MESH.md
 */

/* ------------------------------------------------------------------ */
/* Provayderlar                                                        */
/* ------------------------------------------------------------------ */

/** Mesh'dagi barcha provayderlar. Tartib — registry.ts'dagi ADAPTERS tartibi (ahamiyati yo'q, skor hal qiladi). */
export const PROVIDER_IDS = [
  "groq",
  "cloudflare",
  "openrouter",
  "omniroute",
  "llm7",
  "mistral",
  "nvidia",
  "cerebras",
  "sambanova",
  "rsi",
  "gateway",
  "experiential",
  "openai",
  "tella",
  "perplexity",
] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

/** Tarif darajasi (config/plans.ts PlanId / ModelTier bilan bir xil qiymatlar). */
export type PlanTier = "free" | "starter" | "pro" | "ultra";

/** Tarif tartibi: offer.minTier <= plan bo'lsa ruxsat. */
export const TIER_RANK: Record<PlanTier, number> = { free: 0, starter: 1, pro: 2, ultra: 3 };

/* ------------------------------------------------------------------ */
/* Model takliflari (offers)                                           */
/* ------------------------------------------------------------------ */

/** Model imkoniyatlari. stream=false — model faqat bitta JSON qaytaradi (execute uni bitta bo'lakka aylantiradi). */
export interface Capabilities {
  stream: boolean;
  tools: boolean;
  vision: boolean;
  json: boolean;
}

/** Sinf — region.ts RegionClass bilan bir xil (regionClassOf / CF_BY_CLASS). */
export type OfferClass = "flagship" | "code" | "fast" | "free";

/** Narx toifasi: free — tekin kvota; cheap — arzon pullik; paid — qimmat pullik. */
export type OfferCost = "free" | "cheap" | "paid";

/**
 * Provayder taklif qiladigan bitta model. Bir xil model bir nechta provayderda bo'lishi
 * mumkin (masalan Llama 3.3 70B: Groq, Cloudflare, Cerebras, SambaNova, NVIDIA) — shunda
 * `sovereignIds` bir xil bo'ladi va scheduler ularni "sameModel" guruhida taqsimlaydi.
 */
export interface ModelOffer {
  /**
   * Shu taklif xizmat qiladigan SOVEREIGN id'lari: katalog id (config/models.ts `id`),
   * uning `providerModel`, va/yoki Auto/OmniRoute katalog id'lari ("groq/qwen/qwen3.8-27b",
   * "cloudflare/@cf/..."). Bo'sh — faqat sinf bo'yicha o'rinbosar sifatida ishlatiladi.
   */
  sovereignIds: string[];
  /** Upstream'ga yuboriladigan model id (body.model). */
  wire: string;
  class: OfferClass;
  cost: OfferCost;
  caps: Capabilities;
  /** Cloudflare: 1M token uchun neuron narxi (cloudflare.ts CF_NEURONS_PER_M dan). */
  neuronsPerM?: { in: number; out: number };
  /**
   * O'rinbosar (boshqa model) sifatida berilishi uchun minimal tarif. Berilmasa — `cost` dan:
   * free → "free", cheap → "starter", paid → "pro". Aynan so'ralgan model (sameModel) uchun
   * katalog modelining o'z tarifi amal qiladi (chat/CLI route allaqachon tekshirgan).
   */
  minTier?: PlanTier;
  /** 0..1 sifat bahosi (eval natijasi). Berilmasa — sinf bo'yicha standart (MESH_TUNING.classQuality). */
  quality?: number;
  /**
   * false — faqat aynan shu model so'ralganda (G0); hech qachon boshqa modelning o'rinbosari
   * (G1) bo'lmaydi. Tella (o'z serverimiz, bitta GPU) va Perplexity research presetlari uchun.
   * Standart: true.
   */
  substitutable?: boolean;
}

/* ------------------------------------------------------------------ */
/* Limitlar                                                            */
/* ------------------------------------------------------------------ */

/** Kunlik birlik: so'rov, token, Cloudflare neuron yoki kredit. */
export type LimitUnit = "requests" | "tokens" | "neurons" | "credits";

/**
 * Provayderning (bepul) limitlari — hujjatdan olingan. Scheduler `dailyUnits` va
 * `usedToday` orqali qolgan ulushni hisoblab, yukni barcha tekin kvotalarga yoyadi.
 */
export interface Limits {
  rpm?: number;
  rpd?: number;
  tpm?: number;
  tpd?: number;
  /** Kunlik umumiy birlik (masalan Cloudflare: 10 000 neuron). */
  dailyUnits?: number;
  unit?: LimitUnit;
  /**
   * true — limitlar har model uchun alohida (Groq: har model o'z RPM/RPD/TPD bucket'i);
   * usage/health kaliti mesh:*:<provider>:<wire>. false/yo'q — butun hisob uchun (Cloudflare neuron).
   */
  perModel?: boolean;
  /** Manba: "https://... (YYYY-MM-DD)" — limit qayerdan va qachon tekshirilgan. */
  source: string;
}

/* ------------------------------------------------------------------ */
/* Xatolar                                                             */
/* ------------------------------------------------------------------ */

/**
 * Xato turi — sog'liq holati va keyingi qadam shu bilan hal qilinadi:
 *  - transient       — 5xx, tarmoq, taymaut: bir marta qisqa qayta urinish mumkin, keyin keyingi nomzod;
 *  - rate_limited    — 429 (RPM/TPM): retryAfter gacha yopiq, keyingi nomzod;
 *  - quota_exhausted — kunlik kvota (Cloudflare 4006, Groq RPD/TPD): resetAt gacha yopiq;
 *  - no_credit       — 402 / "can only afford" / balans: resetAt yoki +1 soat yopiq;
 *  - auth            — 401/403 kalit xatosi: 5 daqiqa → 1 soat (kalit barmoq iziga bog'liq) + log;
 *  - bad_request     — 400/422 so'rovning o'zi yaroqsiz: zanjir TO'XTAYDI (hamma joyda yiqiladi);
 *  - context_length  — 413 / kontekst juda uzun: zanjir to'xtaydi; scope "model" bo'lsa (masalan Groq
 *                      tekin TPM "Request too large") — faqat shu nomzod o'tkaziladi, sog'liq o'zgarmaydi,
 *                      kattaroq kontekstli keyingi nomzod sinaladi;
 *  - unavailable     — 404 model yo'q / o'chirilgan: shu model (scope "model") uzoq yopiq;
 *  - unsupported     — model so'ralgan imkoniyatni (tools/vision) qo'llamaydi: faqat shu nomzod
 *                      o'tkaziladi, sog'liq O'ZGARMAYDI (hamma uchun bloklanmaydi), `capability`
 *                      instansiya xotirasiga yoziladi — scheduler keyingi so'rovlarda uni tanlamaydi.
 */
export type ErrorKind =
  | "transient"
  | "rate_limited"
  | "quota_exhausted"
  | "no_credit"
  | "auth"
  | "bad_request"
  | "context_length"
  | "unavailable"
  | "unsupported";

export interface ClassifiedError {
  kind: ErrorKind;
  /** Retry-After (sarlavha yoki tana) — ms. */
  retryAfterMs?: number;
  /** Kvota qachon tiklanadi (epoch ms), masalan Cloudflare — keyingi 00:00 UTC. */
  resetAt?: number;
  /**
   * Xato butun provayderga (kalit, kredit, Cloudflare neuron) yoki faqat shu modelga
   * (Groq har model uchun alohida RPM/TPD, 404 model yo'q) tegishli. Berilmasa — "provider".
   */
  scope?: "provider" | "model";
  /**
   * Hisob bo'yicha umumiy "hovuz" (scope'dan ustun): "paid" — pullik kredit tugadi (faqat pullik
   * takliflar yopiladi, :free ishlayveradi); "free" — tekin kvota (OpenRouter free-models-per-day:
   * butun hisobning barcha :free modellari). Kalit: mesh:health:<provider>:$paid | $free.
   */
  pool?: "free" | "paid";
  /** unsupported — qaysi imkoniyat yo'q (tools/vision). */
  capability?: "tools" | "vision";
  /** Taymaut (UpstreamTimeoutError) — shu nomzodda qayta urinilmaydi. */
  timeout?: boolean;
  /**
   * OpenRouter "can only afford N" — execute shu nomzodni bir marta max_tokens = max(256, N - 64)
   * bilan qayta sinaydi (providers.ts dagi eski low-credit xatti-harakati).
   */
  affordTokens?: number;
  /** Xom xabar — FAQAT server logi uchun (foydalanuvchiga ko'rsatilmaydi, sirlarni o'z ichiga olishi mumkin). */
  message: string;
}

/* ------------------------------------------------------------------ */
/* Adapter                                                             */
/* ------------------------------------------------------------------ */

/** OpenAI chat-completions tanasi (execute quradi, adapter `transformBody` bilan moslaydi). */
export interface ChatBody {
  model: string;
  messages: unknown[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  tools?: unknown[];
  tool_choice?: unknown;
  [key: string]: unknown;
}

/**
 * Wire protokoli. "openai-chat" — POST {url} OpenAI chat-completions (SSE yoki JSON);
 * "perplexity-responses" — Perplexity /v1/responses (faqat research modellari).
 */
export type WireProtocol = "openai-chat" | "perplexity-responses";

export interface ProviderAdapter {
  id: ProviderId;
  /** region.ts HOST_POLICY kaliti — hostAllowedIn(host, country) shu bilan tekshiriladi. */
  host: string;
  /** Env kalitlari bormi (kalit qiymati hech qachon logga/javobga chiqmaydi). */
  enabled(): boolean;
  /** To'liq URL (".../chat/completions") va sarlavhalar (Authorization va h.k.). */
  endpoint(): { url: string; headers: Record<string, string> };
  /** Taklif qilinadigan modellar (env'ga bog'liq bo'lsa — getter bo'lishi mumkin). */
  offers: ModelOffer[];
  limits: Limits;
  /** HTTP xato (yoki oqim ichidagi xato: status 200 + tana) → tur. Tarmoq xatosi/taymaut — execute o'zi "transient" deb oladi. */
  classifyError(status: number, body: string, headers: Headers): ClassifiedError;
  /**
   * Statik `offers` da yo'q id uchun dinamik taklif (aggregatorlar: OpenRouter — istalgan
   * "vendor/model" providerModel; OmniRoute — katalog "host/vendor/model" va "auto/*" kombolari).
   * Qo'llamasa — null. Natija sameModel guruhiga kiradi (id aynan so'ralgan).
   */
  resolve?(sovereignId: string): ModelOffer | null;
  /**
   * Xatodan keyingi yon ta'sir (fire-and-forget, hech qachon otmaydi). Masalan OmniRoute:
   * healOmniRouteIfStuck(status, message). classifyError PURE qoladi.
   */
  onFailure?(status: number, error: ClassifiedError): void;
  /** Tanani provayderga moslash (Cloudflare: faqat matnli xabarlar, gpt-oss uchun stream:false; OpenRouter: transforms). */
  transformBody?(body: ChatBody, offer: ModelOffer): ChatBody;
  /** Upstream haqiqatda qaysi model bilan javob berdi (SSE bo'lagi yoki JSON). Bilinmasa — null (execute offer'dan oladi). */
  readServedModel?(chunkOrJson: unknown): string | null;
  /**
   * Javob sarlavhalaridan served model (masalan OmniRoute X-OmniRoute-Model/-Provider).
   * readServedModel null qaytarsa ishlatiladi. Bilinmasa — null.
   */
  readServedFromHeaders?(headers: Headers): string | null;
  /**
   * Region tekshiruvi va served hisobotidagi id (standart: `wire`). Masalan Cloudflare:
   * "@cf/qwen/..." → "cloudflare/@cf/qwen/..." (modelAllowedIn/badge shu id bilan).
   */
  displayId?(wire: string): string;
  /** Standart: "openai-chat". */
  protocol?: WireProtocol;
  /**
   * Faqat oxirgi chora (LLM7, Experiential, Gateway): barcha odatdagi nomzodlar tugagach
   * sinaladi; javobi har doim `substituted: true, rescue: true` bilan ko'rsatiladi.
   */
  rescue?: boolean;
  /**
   * Aggregator (OpenRouter, OmniRoute, Gateway, RSI): ichida o'zi boshqa provayderga
   * yo'naltirishi mumkin — served model albatta `readServedModel` bilan tekshiriladi.
   */
  aggregator?: boolean;
}

/* ------------------------------------------------------------------ */
/* Sog'liq holati (circuit breaker)                                    */
/* ------------------------------------------------------------------ */

/**
 * closed — ishlaydi; open — `until` gacha tanlanmaydi; half_open — cooldown tugagan,
 * bitta sinov (probe) so'roviga ruxsat (mesh:probe:<key> NX lock bilan).
 * Kalit: mesh:health:<provider> (butun provayder) yoki mesh:health:<provider>:<wire> (shu model).
 */
export interface HealthState {
  state: "closed" | "open" | "half_open";
  /** open bo'lsa — epoch ms, shu vaqtgacha yopiq. */
  until?: number;
  /** Ketma-ket transient xatolar soni (muvaffaqiyatda 0). */
  fails: number;
  /** Muvaffaqiyat EWMA (0..1, boshlang'ich 1). */
  successEwma: number;
  /** Birinchi bayt/bo'lakkacha vaqt EWMA (ms). */
  latencyEwmaMs: number;
  /** Bugun (UTC) sarflangan birlik (Limits.unit) — mesh:usage:<provider>:<YYYYMMDD> dan. */
  usedToday?: number;
  /** Ketma-ket ochilishlar soni — cooldown eksponensial o'sadi (30s · 2^(trips-1), max 5 daqiqa). */
  trips?: number;
  /** Oxirgi xato turi (diagnostika / status sahifasi). */
  lastError?: ErrorKind;
  /** Oxirgi yangilanish (epoch ms). */
  updatedAt?: number;
  /**
   * auth xatosi qaysi kalit bilan olingan: sha256(kalit sarlavhasi) ning birinchi 8 hex belgisi
   * (qaytarib bo'lmaydi). Joriy kalit barmoq izi boshqa bo'lsa (kalit almashtirilgan) — blok e'tiborsiz.
   */
  authFp?: string;
  /** Ketma-ket auth xatolari — cooldown 5 daqiqadan 1 soatgacha o'sadi; muvaffaqiyatda 0. */
  authStrikes?: number;
}

/** Sog'liq kaliti → holat (health.ts snapshot; yo'q kalit = standart "closed"). Kalit: healthKey(provider, wire?). */
export type HealthSnapshot = ReadonlyMap<string, HealthState>;

/* ------------------------------------------------------------------ */
/* Rejalashtirish                                                      */
/* ------------------------------------------------------------------ */

export interface RouteRequest {
  /** Katalog id yoki providerModel yoki host-prefiksli id. Berilmasa — faqat `class` bo'yicha (Auto / CLI). */
  sovereignModelId?: string;
  class?: OfferClass;
  needs: { tools?: boolean; vision?: boolean; stream?: boolean };
  planTier: PlanTier;
  /**
   * So'ralgan modelning tarifi (aynan shu model — G0 — uchun tekshiriladi). Berilmasa katalogdan
   * (MODEL_BY_ID); katalogda yo'q id (OmniRoute/host id) uchun chaqiruvchi beradi — route o'z
   * tarif darvozasidan o'tkazgan bo'ladi.
   */
  modelTier?: PlanTier;
  /**
   * O'rinbosarlar (G1/G2) uchun tarif chegarasi: min(planTier, substituteTier). Web chat —
   * so'ralgan modelning o'z tarifi (Starter modeli yiqilsa Pro model berilmaydi). Berilmasa — planTier.
   */
  substituteTier?: PlanTier;
  /** Serverda aniqlangan mamlakat (region-server.ts). null — cheklov yo'q. */
  country: string | null;
  /** Shu so'rovda yiqilgan provayderlar — qayta tanlanmaydi. */
  exclude?: ProviderId[];
  /**
   * true — faqat aynan shu model (o'rinbosar yo'q). Tella (o'z modelimiz) uchun majburiy:
   * begona javob "Tella" nomi bilan ko'rinmasin.
   */
  sameModelOnly?: boolean;
  /** false — rescue adapterlar (LLM7 va h.k.) ishlatilmaydi (StreamOptions.freeRescue). Standart: true. */
  allowRescue?: boolean;
}

export interface Candidate {
  provider: ProviderId;
  offer: ModelOffer;
  /** Aynan so'ralgan model (bir xil og'irliklar) — substituted: false. */
  sameModel: boolean;
  /** Yakuniy skor (docs/MESH.md §3). */
  score: number;
}

/* ------------------------------------------------------------------ */
/* Bajarish natijasi (web va CLI uchun umumiy)                         */
/* ------------------------------------------------------------------ */

/** Halol "served" hisobot — providers.ts StreamEvent "served" va CLI javobidagi model/provider. */
export interface ServedInfo {
  provider: ProviderId;
  /** Haqiqiy model: readServedModel → displayId(wire). */
  model: string;
  /** So'ralgan modeldan boshqa model (served.ts isSubstitution). */
  substituted: boolean;
  /** Rescue adapter javob berdi. */
  rescue?: boolean;
}

/** Bitta urinish yozuvi — server logi va sog'liq yangilanishi uchun. */
export interface Attempt {
  provider: ProviderId;
  wire: string;
  ok: boolean;
  /** Birinchi bayt/bo'lakkacha (ms). */
  ttfbMs?: number;
  error?: ClassifiedError;
  /** Ishlatilgan kalit barmoq izi (sha256 birinchi 8 hex) — faqat auth blokini kalitga bog'lash uchun. */
  keyFp?: string;
  /**
   * Dinamik (resolve) taklif — statik offers'da yo'q wire: model-scope sog'liq/usage faqat
   * instansiya xotirasida (Upstash'dagi mesh:index foydalanuvchi id'lari bilan o'smasin).
   */
  ephemeral?: boolean;
}

/* ------------------------------------------------------------------ */
/* Sozlamalar (bitta joyda — health/scheduler/execute shu qiymatlardan foydalanadi) */
/* ------------------------------------------------------------------ */

export const MESH_TUNING = {
  /** Ketma-ket shuncha transient xato → open. */
  failThreshold: 3,
  /** Birinchi ochilish cooldown'i; har keyingi trip'da ikki barobar. */
  baseCooldownMs: 30_000,
  maxCooldownMs: 5 * 60_000,
  /** rate_limited, Retry-After yo'q bo'lsa. */
  defaultRetryAfterMs: 60_000,
  /** quota_exhausted / no_credit, resetAt yo'q bo'lsa. */
  quotaCooldownMs: 60 * 60_000,
  /** auth: birinchi 5 daqiqa, har keyingi ketma-ket xatoda ×3, maksimal 1 soat (kalit barmoq iziga bog'liq). */
  authCooldownMs: 5 * 60_000,
  authMaxCooldownMs: 60 * 60_000,
  /** unavailable (404 model yo'q) — model scope. */
  unavailableCooldownMs: 6 * 60 * 60_000,
  /** half_open sinov lock'i. */
  probeLockMs: 15_000,
  /** EWMA og'irligi (yangi qiymat ulushi). */
  ewmaAlpha: 0.2,
  /** Latency normallashtirish: l = 1 / (1 + latencyEwmaMs / latencyRefMs). */
  latencyRefMs: 4_000,
  /** Top guruh: skor >= best * spreadBand bo'lganlar orasida tasodifiy (skorga proporsional) tanlov. */
  spreadBand: 0.85,
  /** Kvota ulushi pastki chegarasi (0 bo'lsa ham to'liq yo'qolmasin — reset aniq bo'lmasligi mumkin). */
  minHeadroom: 0.05,
  /** Sinf standart sifati (offer.quality berilmasa). */
  classQuality: { flagship: 1, code: 0.95, fast: 0.8, free: 0.7 } as Record<OfferClass, number>,
  costFactor: { free: 1, cheap: 0.85, paid: 0.7 } as Record<OfferCost, number>,
  halfOpenFactor: 0.5,
  rescueFactor: 0.3,
  /** Model stream'ni qo'llamasa-yu so'rov stream bo'lsa (bitta bo'lak bo'lib keladi). */
  noStreamFactor: 0.9,
  /** Transient xatoda shu nomzodni qayta sinash (faqat hali bayt chiqmagan bo'lsa). */
  transientRetries: 1,
  retryBackoffMs: [250, 750] as [number, number],
  /** Birinchi baytgacha maksimal urinishlar (nomzodlar). */
  maxAttemptsWeb: 5,
  maxAttemptsCli: 7,
  /** Sog'liq yozuvi yo'q provayder uchun boshlang'ich latency EWMA (ms). */
  defaultLatencyMs: 2_000,
  /** Sinf pog'onasi pastlasa (flagship → fast → free) har pog'ona uchun ko'paytiruvchi. */
  classStepFactor: 0.8,
  /** Upstash o'qish keshi (instansiya ichida). */
  healthCacheMs: 5_000,
  /** Redis chaqiruv taymauti — oshsa in-memory fallback. */
  redisTimeoutMs: 1_000,
  /** Umumiy muddat: web chat (maxDuration 120 s) va CLI (maxDuration 60 s). Har urinish taymauti = min(taymaut, qolgan vaqt). */
  webDeadlineMs: 100_000,
  cliDeadlineMs: 55_000,
  /** mesh:index (Upstash'da saqlanadigan model-scope kalitlar) — maksimal a'zolar. */
  maxIndexSize: 400,
} as const;
