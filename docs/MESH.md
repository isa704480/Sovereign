# Provider Mesh — bitta algoritm, barcha provayderlar

> Kod: `src/lib/ai/mesh/` · Shartnoma: `src/lib/ai/mesh/types.ts` · Holat: 2026-09-27

## 0. Maqsad

SOVEREIGN'da 15 ta upstream bor: **groq, cloudflare, openrouter, omniroute, llm7, mistral,
nvidia, cerebras, sambanova, rsi, gateway, experiential, openai, tella, perplexity**. Hozir
ular ikki joyda alohida-alohida qattiq yozilgan zanjirlar bilan chaqiriladi:

- web chat — `src/lib/ai/providers.ts` (`DIRECT_ROUTES`, `pickDirectRoute`, `omnirouteFirst`,
  `rsiRoute`, `cloudflareRoute`, `nextRoute/failover`, `streamFreeFallback`, `fallbackTargets`);
- CLI/Cowork — `src/app/api/cli/chat/route.ts` (`candidates`, `regionCandidates`, `for` sikl).

Muammo: har so'rov zanjirni boshidan boshlaydi (Groq 429 bersa ham keyingi so'rov yana Groq'ga
boradi), bir provayder kvotasi tugaguncha qolganlari bo'sh turadi, web va CLI turli qoidalar
bilan ishlaydi. **Provider Mesh** — bitta umumiy algoritm:

1. **Umumiy sog'liq** (circuit breaker, cooldown, kvota tiklanish vaqti) — Upstash'da, barcha
   Vercel instansiyalari uchun bitta (Redis bo'lmasa — instansiya xotirasi).
2. **Rejalashtirish** — imkoniyat (tools/vision/stream), mintaqa (`region.ts`), tarif bo'yicha
   filtr, keyin skor.
3. **Yukni yoyish** — bir xil sifatli sog'lom nomzodlar orasida skorga proporsional tasodifiy
   tanlov: barcha tekin kvotalar (Groq + Cloudflare + Cerebras + SambaNova + NVIDIA ...) birga
   sarflanadi.
4. **Tor qayta urinish** — faqat vaqtinchalik xatolarda; so'rovning o'zi yaroqsiz bo'lsa zanjir
   to'xtaydi.
5. **Halol "served"** — foydalanuvchi har doim haqiqiy javob bergan modelni ko'radi.
6. **Bitta implementatsiya** — web chat (stream) va CLI (non-stream, tool-calling) bir xil kod.

## 1. Fayllar

| Fayl | Vazifa | Pure? |
|---|---|---|
| `types.ts` | Tiplar + `MESH_TUNING` konstantalari | ha |
| `registry.ts` | `ADAPTERS`, `ADAPTER_BY_ID`, `enabledAdapters()`, `adapterFor()` | env o'qiydi |
| `providers/<id>.ts` | Bitta provayder adapteri, eksport: `<id>Adapter` | env o'qiydi |
| `health.ts` | Holat mashinasi (pure `nextState`) + Upstash/in-memory saqlash | qisman |
| `scheduler.ts` | Nomzodlarni filtrlash, skorlash, yoyish (pure `planCandidates`) | ha |
| `execute.ts` | So'rov yuborish, failover, served, sog'liq yozish | yo'q (tarmoq) |
| `*.test.ts` | `npx tsx --conditions=react-server src/lib/ai/mesh/<x>.test.ts` | — |

Tavsiya etilgan eksportlar (boshqa agentlar uchun shartnoma):

```ts
// health.ts
export function healthKey(provider: ProviderId, wire?: string): string;          // "mesh:health:groq" | "mesh:health:groq:openai/gpt-oss-120b"
export function defaultHealth(): HealthState;
export type HealthEvent = { ok: true; ttfbMs: number } | { ok: false; error: ClassifiedError };
export function nextState(prev: HealthState, ev: HealthEvent, now: number): HealthState;   // PURE, §4
export function effectiveState(h: HealthState, now: number): HealthState["state"];         // open + until o'tgan → half_open
export async function snapshot(adapters: ProviderAdapter[]): Promise<HealthSnapshot>;      // MGET, 5s kesh
export async function record(a: Attempt, units?: number): Promise<void>;                   // fire-and-forget
export async function acquireProbe(key: string): Promise<boolean>;                          // SET NX PX 15000

// scheduler.ts
export function scoreCandidate(c: Omit<Candidate, "score">, req: RouteRequest, h: HealthState, a: ProviderAdapter, now: number): number;
export function planCandidates(req: RouteRequest, adapters: ProviderAdapter[], health: HealthSnapshot,
                               opts?: { now?: number; rng?: () => number }): Candidate[];   // PURE, tartiblangan

// execute.ts
export function meshStream(input: { req: RouteRequest; body: Omit<ChatBody, "model">; signal?: AbortSignal;
                                    lang?: Lang; maxAttempts?: number }): AsyncGenerator<StreamEvent>;
export function meshComplete(input: { req: RouteRequest; body: Omit<ChatBody, "model">; signal?: AbortSignal;
                                      maxAttempts?: number }): Promise<
  | { ok: true; json: unknown; served: ServedInfo; attempts: Attempt[]; usage?: { prompt_tokens: number; completion_tokens: number } }
  | { ok: false; status: number; error: ClassifiedError | null; attempts: Attempt[] }>;
```

`StreamEvent` — `providers.ts` dagi mavjud tip (`served`, `text`, `reasoning`, `error`, `done`).

## 2. Adapter shartnomasi

`ProviderAdapter` (types.ts): `id`, `host` (region.ts `HOST_POLICY` kaliti — hamma 15 provayder
u yerda bor), `enabled()`, `endpoint()`, `offers`, `limits`, `classifyError()`, ixtiyoriy
`transformBody`, `readServedModel`, `displayId`, `resolve`, `onFailure`, `protocol`, `rescue`, `aggregator`.

Qoidalar:

- **Kalitlar faqat `process.env`** dan; hech qachon logga, xatoga yoki javobga yozilmaydi.
- **Offer halol bo'lsin.** `sovereignIds` ga faqat AYNAN shu og'irliklardagi model id'lari kiradi.
  Masalan hozirgi `DIRECT_ROUTES["meta-llama/llama-3.3-70b-instruct"]` dagi
  `groq: openai/gpt-oss-120b` — bu **boshqa model**: Groq offer'i `sovereignIds: []` (yoki
  gpt-oss id'lari) bilan, `class` bo'yicha o'rinbosar bo'ladi, sameModel emas.
- `limits.source` — hujjat URL + tekshirilgan sana (masalan
  `"https://console.groq.com/docs/rate-limits (2026-09-27)"`). Taxmin qilinmaydi.
- `rescue: true` — llm7, experiential, gateway. `aggregator: true` — openrouter, omniroute,
  gateway, rsi.
- `resolve(id)` — aggregatorlar uchun: OpenRouter istalgan katalog `providerModel` ini, OmniRoute
  `host/vendor/model` va `auto/*` ni dinamik offer qiladi.
- `onFailure` — faqat OmniRoute: `healOmniRouteIfStuck(status, message)` (watchdog saqlanadi).
- `transformBody` — Cloudflare: xabarlar faqat matn (`textOf`), gpt-oss uchun `stream:false`
  (`cfStreams`); OpenRouter: `transforms: ["middle-out"]`, `route: "fallback"`, Anthropic uchun
  prompt cache (`withPromptCache`), `HTTP-Referer`/`X-Title` sarlavhalari `endpoint()` da.
- `protocol: "perplexity-responses"` — faqat perplexity.

### 2.1 `classifyError` jadvali (hamma adapter bir xil)

| Signal | `kind` | Qo'shimcha |
|---|---|---|
| status 0 (tarmoq/taymaut), 500, 502, 503, 504, 529 | `transient` | OmniRoute 502/503 "resource pressure" → `onFailure` |
| 429 + Retry-After / `x-ratelimit-reset-*` | `rate_limited` | `retryAfterMs`; Groq → `scope: "model"` |
| 429 + kunlik (Groq RPD/TPD "per day", Cloudflare `4006`/"daily free allocation"/"neurons") | `quota_exhausted` | `resetAt`: Cloudflare — keyingi 00:00 UTC; Groq — sarlavhadan |
| 402, "credits", "can only afford N", "insufficient", "billing", "balance" | `no_credit` | "can only afford N" → `affordTokens: N`; OpenRouter → `pool: "paid"` (faqat pullik takliflar) |
| OpenRouter `free-models-per-day` / `-per-min` | `quota_exhausted` / `rate_limited` | `pool: "free"` — butun hisobning barcha `:free` modellari reset gacha |
| Mistral 429 "per day" / RPD / `4006` | `quota_exhausted` | `resetAt` = keyingi 00:00 UTC (60 s rate limit emas) |
| 401, 403 (kalit — tana shuni aytsa), "invalid api key" | `auth` | Cloudflare 403 tanasiz → `unavailable` (model) |
| 404, "model not found", "decommissioned", "does not exist" | `unavailable` | `scope: "model"` |
| "does not support tools", "No endpoints found that support tool use/image" | `unsupported` | `capability`; sog'liq o'zgarmaydi, xotirada o'rganiladi (`caps.ts`) |
| 413, "context length", "maximum context", "too many tokens" | `context_length` | — |
| 400, 422 (boshqa) | `bad_request` | — |

Bu `chain.ts providerSideFailure` va `cloudflare.ts cfQuotaExceeded` qoidalarining umumlashmasi —
ularni qayta ishlatish mumkin.

## 3. Skor formulasi

Har bir nomzod `(provider, offer)` uchun:

```
score = Q · F · H · L · R · C · S · X

Q = offer.quality ?? MESH_TUNING.classQuality[offer.class]      flagship 1.0, code 0.95, fast 0.8, free 0.7
F = classStepFactor ^ steps                                      steps = so'ralgan sinfdan necha pog'ona pastda (0 → 1.0, 1 → 0.8, 2 → 0.64)
H = successEwma                                                  0..1, boshlang'ich 1
    × halfOpenFactor (0.5), agar effectiveState = half_open
L = 1 / (1 + latencyEwmaMs / latencyRefMs)                       latencyRefMs = 4000, boshlang'ich latency 2000 ms
R = clamp(1 − usedToday / limits.dailyUnits, minHeadroom, 1)     dailyUnits noma'lum → 1  (kvotani yoyish)
C = costFactor[offer.cost]                                       free 1.0, cheap 0.85, paid 0.7
S = noStreamFactor (0.9), agar needs.stream && !offer.caps.stream; aks holda 1
X = rescueFactor (0.3), agar adapter.rescue; aks holda 1
```

Sinf pog'onalari (region.ts `regionEquivalents` bilan bir xil):
`flagship → [flagship, fast, free]`, `code → [code, fast, free]`, `fast → [fast, free]`, `free → [free]`.
So'ralgan sinf: `req.class ?? regionClassOf(sovereignModelId, { tier: katalog tarifi })`.

Misol (tekin foydalanuvchi, `llama-3.3-free`, hammasi sog'lom): Groq (latency 600 ms, kvota 30%
sarflangan) `0.7·1·1·0.87·0.7·1 = 0.426`; Cloudflare (1500 ms, 80% neuron sarflangan)
`0.7·1·1·0.73·0.2·1 = 0.102`; Cerebras (900 ms, 10%) `0.7·1·1·0.82·0.9·1 = 0.514`.
Band chegarasi `0.85 · 0.514 = 0.437`: Groq (0.426) bandga kirmaydi, demak Cerebras birinchi,
keyin Groq, keyin Cloudflare (kvotasi tugashga yaqin). Groq latency'si 500 ms ga tushsa
(`0.7·0.89·0.7 = 0.436` → deyarli) yoki Cerebras kvotasi sarflangan sari, ular navbatma-navbat
tanlana boshlaydi (illyustratsiya; offerlar haqiqatda adapterlarda belgilanadi).

## 4. Nomzod tanlash (scheduler, PURE)

```
1. adapters = enabledAdapters()
2. Har adapter a va har offer o (statik offers + a.resolve(sovereignModelId)):
   a) a.id ∉ req.exclude
   b) sog'liq: provider kaliti VA (perModel yoki model-scope bo'lsa) model kaliti — ikkalasi ham open emas
      (open + until o'tgan = half_open → ruxsat, lekin H × 0.5)
   c) imkoniyat: needs.tools → caps.tools; needs.vision → caps.vision (caps = offer + xotirada o'rganilgan
      "unsupported"; stream — qattiq filtr emas)
   b') hovuz: mesh:health:<provider>:$free (tekin takliflar) / :$paid (pullik) — open bo'lsa tushadi
   d) mintaqa: hostAllowedIn(a.host, country) && modelAllowedIn(displayId(o.wire), country)
      (+ sameModel bo'lmasa, modelAllowedIn ni o.sovereignIds[0] bilan ham)
   e) tarif (tier.ts — web va CLI route darvozasi bilan bir xil funksiya):
             modelTier = modelTierFor(id): katalog id → o'z tarifi; upstream nomi ("anthropic/claude-opus-5",
               "openrouter/…", "…-high" varianti) → mos katalog modeli tarifi; ":free" va pullik variant —
               boshqa-boshqa model; "groq/…" kabi to'g'ridan-to'g'ri host yo'li yoki mos kelmasa → null
             sameModel → max(modelTier, offerMinTier(o)) ≤ planTier (substitutable:false — faqat modelTier)
             o'rinbosar/rescue → offerMinTier(o) ≤ min(planTier, substituteTier ?? planTier)
             offerMinTier = o.minTier ?? costTier(o.cost); costTier: free→free, cheap→starter, paid→pro
             Route darvozasi: requiredPlanTier(id) — katalogda yo'q aniq model kamida Pro, Ultra modelga mos → Ultra
   f) sameModel = o.sovereignIds ∋ req.sovereignModelId (yoki uning providerModel'i),
                  yoki served.ts sameModel(o.wire, providerModel)
   g) o'rinbosar faqat: !req.sameModelOnly va o.class ∈ sinf pog'onalari
   h) rescue adapter faqat: req.allowRescue !== false va !req.sameModelOnly
3. Guruhlar (leksikografik — SAME-MODEL-FIRST qoidasi):
      G0 = sameModel && !rescue,  G1 = !sameModel && !rescue,  G2 = rescue
   Guruh ichida skor bo'yicha tartib; bir provayder+wire faqat bir marta.
4. Har guruh boshida yoyish (§5), keyin qolganlari skor kamayishi bo'yicha.
5. Natija: [...G0, ...G1, ...G2] — execute shu tartibda maxAttempts gacha sinaydi.
```

`sovereignModelId` berilmasa (CLI "auto", Auto qadami) — hamma nomzod G1 (sinf bo'yicha).

## 5. Yukni yoyish

Guruh ichida `best = max(score)`; **band** = `score ≥ best · spreadBand (0.85)` bo'lgan nomzodlar.
Birinchi o'rin band ichidan **skorga proporsional tasodifiy** tanlanadi (`rng` inject qilinadi —
testda deterministik), band qolgani va guruhning qolgani skor bo'yicha. Shunday qilib:

- teng sifatli sog'lom provayderlar navbatma-navbat ishlaydi (Groq ham, Cloudflare ham,
  Cerebras ham) — bitta provayder kvotasi tugab qolgani kutilmaydi;
- `R` (kvota ulushi) kamaygan sari provayder kamroq tanlanadi — kun oxirigacha hamma kvotalar
  bir tekis sarflanadi;
- yomonlashgan (sekin, xato beruvchi) provayder bandga kirmaydi, lekin zanjirda qoladi.

## 6. Sog'liq holatlari (circuit breaker)

```
            3 ketma-ket transient
  closed ─────────────────────────────► open (until = now + min(30s·2^(trips−1), 5min), trips++)
    ▲                                      │ now ≥ until
    │ muvaffaqiyat (fails=0, trips=0)      ▼
    └──────────────────────────────── half_open ── xato ──► open (trips++ → cooldown ikki barobar)
                                       (bitta probe: SET mesh:probe:<key> NX PX 15000)
```

| Hodisa | O'tish | `until` |
|---|---|---|
| muvaffaqiyat | → closed, `fails=0`, `trips=0`, EWMA yangilanadi | — |
| `transient` | `fails++`; `fails ≥ 3` → open | `now + min(30s·2^(trips−1), 5 min)` |
| `rate_limited` | darhol open (scope: provider yoki model) | `now + (retryAfterMs ?? 60s)` |
| `quota_exhausted` | open | `resetAt ?? now + 1h` |
| `no_credit` | open (provider; `pool` bo'lsa — `$paid`/`$free` kaliti) | `resetAt ?? now + 1h` |
| `auth` | open (provider) + `console.error("[mesh] auth", provider)`; `authFp` = sha256(kalit)[:8] | `now + 5 min · 3^(strikes−1)`, max 1 soat |
| `unavailable` | open (model scope) | `now + 6h` |
| `bad_request`, `context_length`, `unsupported` | o'zgarmaydi | — |

Auth bloki kalitga bog'liq: `snapshot(adapters)` joriy kalit barmoq izi `authFp` dan farq qilsa (kalit
almashtirilgan) blokni e'tiborsiz qoldiradi. Admin: `POST /api/admin/mesh/reset {provider?}` (is_admin).
Muvaffaqiyat birinchi mazmunli baytda yoziladi; kunlik birlik — javob oxirida (`recordUsage`).
| half_open'da istalgan xato | open, `trips++` | yuqoridagi qoidaga ko'ra, kamida ikki barobar cooldown |

EWMA (`α = 0.2`): `successEwma ← 0.8·successEwma + 0.2·(ok ? 1 : 0)` (bad_request/context_length
hisoblanmaydi); `latencyEwmaMs ← 0.8·latencyEwmaMs + 0.2·ttfbMs` (faqat muvaffaqiyatda).

Kvota hisobi (`usedToday`): muvaffaqiyatdan keyin `INCRBY mesh:usage:<provider>[:<wire>]:<YYYYMMDD>`
— birlik `limits.unit` bo'yicha: `requests` → 1, `tokens` → `usage.total_tokens`, `neurons` →
`cfNeurons(...)` (`offer.neuronsPerM`), `credits` → hisoblanmaydi. TTL 48 soat.

## 7. Qayta urinish siyosati (execute)

- Failover faqat **birinchi matn baytidan oldin**. Matn chiqa boshlagach xato — `error` hodisasi
  (web: qisman javob saqlanadi), boshqa provayderga o'tilmaydi (yarim javob boshqa modeldan
  davom etmasin).
- `transient` → shu nomzodni `transientRetries = 1` marta, 250–750 ms jitter bilan qayta sinash;
  keyin keyingi nomzod.
- `rate_limited`, `quota_exhausted`, `no_credit`, `auth`, `unavailable` → darhol keyingi nomzod
  (qayta urinmasdan). `affordTokens` bo'lsa — shu nomzod bir marta kamroq `max_tokens` bilan.
- `bad_request` → provayderga xos bo'lishi mumkin: sog'liq o'zgarmaydi, **keyingi provayder**;
  ikkinchi, boshqa provayder ham `bad_request` desa — zanjir to'xtaydi (CLI 400).
- `context_length` (scope "model" bo'lmasa) → **zanjir to'xtaydi**.
- `unsupported` → shu nomzod o'tkaziladi, sog'liq o'zgarmaydi.
- Taymaut (`UpstreamTimeoutError`) shu nomzodda **qayta urinilmaydi**. Umumiy muddat: web ~100 s
  (chat route `requestDeadline` — nomzodlar bo'ylab), CLI 55 s; har urinish taymauti = min(taymaut,
  qolgan vaqt); muddat tugagach yangi urinish yo'q. Chat route yiqilgan provayderlarni
  (`providerWideFailure`) keyingi `streamCompletion` chaqiruvlariga `exclude` qilib uzatadi.
- Hamma nomzod half_open va probe lock band — hech narsa sinalmasa, eng yaxshisi baribir sinaladi.
- Foydalanuvchi to'xtatsa (`signal.aborted`) — xato emas, sog'liq yozilmaydi.
- `maxAttemptsWeb = 5`, `maxAttemptsCli = 7`; mavjud taymautlar saqlanadi (connect 30 s,
  rescue 20 s, non-stream 90 s, idle 45 s).
- Davom ettirish (`finish_reason: "length"`) — **o'sha nomzodda** qoladi (`exclude` emas, majburiy
  provayder+wire).

## 8. Halol "served model"

```
served.model       = adapter.readServedModel(birinchi bo'lak | JSON) ?? displayId(offer.wire)
served.substituted = !candidate.sameModel || isSubstitution(so'ralgan providerModel, served.model)
served.rescue      = adapter.rescue === true
```

- Web: birinchi mazmunli bo'lakda `{ type: "served", model, substituted, rescue }` (mavjud hodisa).
- CLI: javobdagi `model` = `served.model`, `provider` = `served.provider`; qo'shimcha
  `substituted: true` va `requested` (eski mijozlar e'tiborsiz qoldiradi).
- Aggregator boshqa (mintaqada cheklangan) modelga yo'naltirsa — `modelAllowedIn(served.model)`
  tekshiriladi va log yoziladi (hozirgi `[region]` ogohlantirishi kabi).
- Tella (o'z modelimiz): `sameModelOnly: true`, rescue yo'q — begona javob hech qachon "Tella"
  nomi bilan ko'rinmaydi. Perplexity (research) ham `sameModelOnly: true`.

## 9. Saqlash (Upstash, zaxira — xotira)

| Kalit | Qiymat | TTL |
|---|---|---|
| `mesh:health:<provider>` | `HealthState` JSON (butun provayder) | `max(until − now + 1h, 24h)` |
| `mesh:health:<provider>:<wire>` | `HealthState` JSON (model scope / `perModel`) | shunday |
| `mesh:usage:<provider>[:<wire>]:<YYYYMMDD>` | integer (UTC kun) | 48 soat |
| `mesh:probe:<provider>[:<wire>]` | lock (half_open sinovi) | 15 s (`PX`) |

- Redis klienti `rate-limit.ts` dagi kabi (`UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`);
  har chaqiruv 1 s taymaut; xato yoki sozlanmagan → instansiya ichidagi `Map` (hech qachon so'rovni
  yiqitmaydi).
- O'qish: so'rov boshida bitta `MGET` (hamma enabled provayder kalitlari), instansiyada 5 s kesh.
- `mesh:index` (model-scope kalitlar ro'yxati) — faqat statik `offers` dagi wire'lar; dinamik (`resolve`,
  foydalanuvchi id'si) wire'lar faqat instansiya xotirasida (`Attempt.ephemeral`). Index `maxIndexSize`
  (400) bilan cheklangan, muddati o'tgan a'zolar o'qishda `SREM` qilinadi.
- `storeStatus()` — Upstash sozlanganmi / javob beradimi; status sahifasi noma'lum holatni
  "operational" emas, `degraded` ("Check failed") deb ko'rsatadi.
- Yozish: fire-and-forget (javobni kutdirmaydi). Read-modify-write atomar emas — eventual
  consistency yetarli (o'tishlar idempotentga yaqin, eng yomoni bitta ortiqcha urinish).

## 10. Web va CLI farqlari

| | Web chat (`providers.ts`) | CLI/Cowork (`api/cli/chat`) |
|---|---|---|
| Rejim | `meshStream` (SSE, `StreamEvent`) | `meshComplete` (bitta JSON) |
| `needs` | `{ stream: true, vision: rasm bo'lsa }` | `{ tools: tools.length > 0, stream: false, vision: rasm bo'lsa }` |
| `class` | katalog modelidan (`regionClassOf`) yoki Auto qadami | `chosen` bo'lmasa `"code"` |
| Rescue | `allowRescue = opts.freeRescue !== false` | `allowRescue = !needs.tools` (LLM7 tool qo'llamaydi — `caps.tools=false` baribir filtrlaydi) |
| Urinishlar | 5 | 7 |
| Model-darajadagi almashtirish | chat route (`fallbackModelIds`, "switch") mesh ustida qoladi | — |

Tarif: web — `plan.id`; CLI — `cli_whoami` dan hisoblangan `planId` (muddati o'tgan = free).
Mintaqa: ikkalasi ham `resolveUserRegion` → `country` (cheklanmagan bo'lsa `null`); sanctioned →
451 route darajasida (o'zgarmaydi).

## 11. Integratsiya (migratsiya)

1. Adapterlar to'ldiriladi (`providers/<id>.ts`) — `DIRECT_ROUTES`, `RSI_MODELS`,
   `fallbackTargets`, `CF_SAME_MODEL`, `CF_BY_CLASS`, CLI `candidates()` dagi har bir yo'l biror
   offer'ga aylanadi (halollik qoidasi bilan, §2).
2. `health.ts`, `scheduler.ts` (pure, testlar bilan), keyin `execute.ts`.
3. Env bayroq `SOVEREIGN_MESH` = `off` (standart) | `shadow` (eski yo'l ishlaydi, mesh rejasi faqat
   logga — solishtirish) | `on`.
4. `providers.ts streamOpenRouter`: `on` bo'lsa yo'l tanlash (`pickDirectRoute`, `cloudflareRoute`,
   `omnirouteFirst`, `rsiRoute`, `nextRoute`, `failover`, `streamFreeFallback`) o'rniga
   `yield* meshStream({ req, body, signal, lang })`. `<think>` ajratish, davom ettirish, i18n
   xato matnlari (`friendlyError`) saqlanadi. `hasKeyFor` → "kamida bitta nomzod bormi"
   (`planCandidates(...).length > 0`).
5. `api/cli/chat/route.ts`: `candidates()` + `regionCandidates()` + `for` sikl o'rniga
   `meshComplete(...)`; auth, rate-limit, kunlik/oylik limit, `recordCliUsage`, javob shakli
   o'zgarmaydi.
6. `status/health.ts` — `snapshot()` dan provayder holatlarini ko'rsatishi mumkin (ixtiyoriy).
7. `SOVEREIGN_MESH=on` barqaror bo'lgach — eski zanjir kodi o'chiriladi.

**Holat (2026-09-27):** 1–6 bajarildi. `SOVEREIGN_MESH` standarti — `on` (web chat `providers.ts
streamViaMesh` → `meshStream`; CLI `meshCliComplete` → `meshComplete`; `hasKeyFor`/`hostIdAvailable`
→ "aynan shu modelni beradigan kalitli adapter bormi"; status sahifasi "AI gateway" → mesh sog'liq
surati). `off` — eski zanjir (favqulodda qaytarish), `shadow` — eski zanjir + mesh rejasi logda.
So'rov → RouteRequest: `mesh/request.ts` (`webRouteRequest`, `cliRouteRequest`). Shartnomaga
qo'shilganlar: `ModelOffer.substitutable` (Tella/Perplexity — faqat G0), `RouteRequest.modelTier`,
`ProviderAdapter.readServedFromHeaders` (OmniRoute), scope "model" `context_length` (Groq tekin TPM
413) — faqat shu nomzod o'tkaziladi, zanjir to'xtamaydi.

Region siyosati (`modelAllowedIn` / `hostAllowedIn`) hech bir bosqichda chetlab o'tilmaydi:
scheduler filtrlaydi, `streamCompletion` dagi oxirgi himoya chizig'i ham qoladi.

## 12. Testlar (tarmoqsiz)

- `health.test.ts` — `nextState`: 3 transient → open 30 s; 2-trip → 60 s; rate_limited
  retryAfter; quota resetAt; auth 24 h; bad_request o'zgarmaydi; half_open muvaffaqiyat → closed.
- `scheduler.test.ts` — same-model-first; tools filtri (LLM7 CLI'da yo'q); RU mintaqa (Claude,
  LLM7, Mistral chiqariladi); free tarifda paid o'rinbosar yo'q; open provayder chiqariladi;
  `rng` bilan yoyish taqsimoti (1000 marta — band ichidagilar ulushi skorga proporsional);
  `R` kamaygan provayder kamroq tanlanadi.
- Har adapter: `classifyError` jadvali (§2.1) namunalari.

---

## English summary

**Provider Mesh** replaces the two hand-written fallback chains (web `providers.ts`, CLI
`api/cli/chat`) with one scheduler used by both. Every upstream is a `ProviderAdapter`
(`types.ts`) listed in `registry.ts`; each exposes honest `ModelOffer`s (`sovereignIds` = only
identical weights), documented `Limits`, and a uniform `classifyError` → `ErrorKind`.

- **Filter**: enabled, not excluded, breaker not open, capabilities (`tools`/`vision`), region
  (`hostAllowedIn` + `modelAllowedIn` from `region.ts`), plan (substitutes need
  `minTier ≤ planTier`; same-model offers inherit the catalog check).
- **Order**: same-model group → class substitutes (flagship→fast→free ladder) → rescue gateways.
- **Score** = `quality · classStep^steps · successEwma(·0.5 half-open) · 1/(1+latency/4s) ·
  quotaHeadroom · costFactor · (0.9 if no-stream) · (0.3 if rescue)`.
- **Spread**: weighted random (∝ score) among candidates within 85 % of the group's best, so all
  free quotas are consumed together.
- **Breaker**: 3 transient → open 30 s (doubling, max 5 min) → half-open single probe;
  429 → open until Retry-After; quota/no-credit → until reset or +1 h; auth → 24 h; 404 → model
  scope 6 h; 400/413/422 → stop chain, no health change.
- **State** in Upstash (`mesh:health:<provider>[:<wire>]`, `mesh:usage:…:<YYYYMMDD>`,
  `mesh:probe:…`), in-memory fallback, 1 s timeout, 5 s read cache.
- **Retry**: failover only before the first byte; one jittered retry for transient errors;
  continuation stays on the same candidate.
- **Served honesty**: `served.model` from upstream chunk (or `displayId(wire)`),
  `substituted` = not same model, `rescue` flag; Tella/Perplexity are same-model-only.
- **Rollout**: `SOVEREIGN_MESH=on` (default — web chat and CLI route through the mesh),
  `shadow` (legacy chain + mesh plan logged), `off` (legacy chain, emergency rollback).
