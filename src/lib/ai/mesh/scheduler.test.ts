/**
 * Lokal test (tarmoqsiz, deterministik):
 *   npx tsx --conditions=react-server src/lib/ai/mesh/scheduler.test.ts
 * Scheduler: filtrlar (mintaqa, tarif, sog'liq, imkoniyat), same-model-first, yukni yoyish.
 * Soxta adapterlar ishlatiladi (env'ga bog'liq emas); oxirida haqiqiy registry bilan smoke test.
 */
import assert from "node:assert/strict";
import { ADAPTERS } from "./registry";
import { MODELS } from "@/config/models";
import { __resetLearnedCaps, learnMissingCapability } from "./caps";
import { explain, formatExplain, meshHealthKey, offerMinTier, plan, planCandidates, type PlanDeps } from "./scheduler";
import type { HealthState, ModelOffer, ProviderAdapter, ProviderId, RouteRequest } from "./types";

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (e) {
    failed++;
    console.error(`✕ ${name}\n  ${(e as Error).message.split("\n").join("\n  ")}`);
  }
}

/** mulberry32 — seed'li deterministik [0,1) generator. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CAPS = { stream: true, tools: true, vision: false, json: true };

function offer(p: Partial<ModelOffer> & Pick<ModelOffer, "wire">): ModelOffer {
  return { sovereignIds: [], class: "free", cost: "free", caps: { ...CAPS }, ...p };
}

function fake(id: ProviderId, offers: ModelOffer[], extra: Partial<ProviderAdapter> = {}): ProviderAdapter {
  return {
    id,
    host: id,
    enabled: () => true,
    endpoint: () => ({ url: `https://${id}.invalid/v1/chat/completions`, headers: {} }),
    offers,
    limits: { source: "test" },
    classifyError: () => ({ kind: "transient", message: "" }),
    ...extra,
  };
}

const NOW = Date.UTC(2026, 8, 27, 12, 0, 0);
const EMPTY = new Map<string, HealthState>();
const H = (p: Partial<HealthState>): HealthState => ({ state: "closed", fails: 0, successEwma: 1, latencyEwmaMs: 2000, ...p });

function req(p: Partial<RouteRequest> = {}): RouteRequest {
  return { needs: { stream: true }, planTier: "free", country: null, ...p };
}

function deps(adapters: ProviderAdapter[], p: Partial<PlanDeps> = {}): PlanDeps {
  return { adapters, health: EMPTY, now: NOW, rand: seeded(1), ...p };
}

const ids = (c: { provider: string; offer: ModelOffer }[]) => c.map((x) => `${x.provider}:${x.offer.wire}`);

/* ---- soxta provayderlar ---- */

const openrouter = fake(
  "openrouter",
  [
    offer({ sovereignIds: ["claude-sonnet-4-5", "anthropic/claude-sonnet-4.5"], wire: "anthropic/claude-sonnet-4.5", class: "flagship", cost: "paid" }),
    offer({ sovereignIds: ["gpt-4o", "openai/gpt-4o"], wire: "openai/gpt-4o", class: "flagship", cost: "paid" }),
    offer({ sovereignIds: ["openrouter/moonshotai/kimi-k2.6"], wire: "moonshotai/kimi-k2.6", class: "flagship", cost: "paid" }),
    offer({ sovereignIds: ["openrouter/deepseek/deepseek-v4-flash"], wire: "deepseek/deepseek-v4-flash", class: "fast", cost: "cheap" }),
  ],
  { aggregator: true, displayId: (w) => `openrouter/${w}` },
);
const groq = fake("groq", [offer({ sovereignIds: ["groq/qwen/qwen3.8-27b"], wire: "qwen/qwen3.8-27b", quality: 0.9 })], {
  displayId: (w) => `groq/${w}`,
  limits: { dailyUnits: 200_000, unit: "tokens", perModel: true, source: "test" },
});
const cloudflare = fake("cloudflare", [offer({ sovereignIds: ["cloudflare/@cf/qwen/qwen3.8-27b", "groq/qwen/qwen3.8-27b"], wire: "@cf/qwen/qwen3.8-27b", quality: 0.9 })], {
  displayId: (w) => `cloudflare/${w}`,
  limits: { dailyUnits: 10_000, unit: "neurons", perModel: false, source: "test" },
});
const llm7 = fake("llm7", [offer({ wire: "gpt-4o-mini", caps: { ...CAPS, tools: false } })], { rescue: true });

/* ---- testlar ---- */

test("RU mintaqa: Claude va GPT tashlanadi, Qwen (Groq/Cloudflare) qoladi, rescue LLM7 host bo'yicha yo'q", () => {
  const all = [openrouter, groq, cloudflare, llm7];
  const got = ids(plan(req({ class: "flagship", planTier: "ultra", country: "RU" }), deps(all)));
  assert.ok(!got.some((x) => /claude|gpt-4o/.test(x)), got.join(", "));
  assert.ok(got.includes("groq:qwen/qwen3.8-27b") && got.includes("cloudflare:@cf/qwen/qwen3.8-27b"), got.join(", "));
  assert.ok(got.includes("openrouter:moonshotai/kimi-k2.6"), "Kimi (moonshot) RU'da ruxsat");
  assert.ok(!got.some((x) => x.startsWith("llm7:")), "llm7 host RU'da cheklangan");
  const why = explain(req({ class: "flagship", planTier: "ultra", country: "RU" }), deps(all));
  const claude = why.find((e) => e.wire === "anthropic/claude-sonnet-4.5");
  assert.equal(claude?.reason, "region_model");
  // Mintaqa cheklanmagan (UZ) — Claude ham bor.
  const uz = ids(plan(req({ class: "flagship", planTier: "ultra", country: "UZ" }), deps(all)));
  assert.ok(uz.includes("openrouter:anthropic/claude-sonnet-4.5"));
});

test("RU mintaqa: aynan Claude so'ralsa ham G0 bo'sh, faqat ruxsat etilgan o'rinbosarlar", () => {
  const c = plan(req({ sovereignModelId: "claude-sonnet-4-5", planTier: "pro", country: "RU" }), deps([openrouter, groq, cloudflare]));
  assert.ok(c.length > 0 && c.every((x) => !x.sameModel));
  assert.ok(!ids(c).some((x) => /claude|gpt/.test(x)));
});

test("free tarif: pullik Kimi hech qachon berilmaydi (o'rinbosar ham, katalogsiz aynan id ham)", () => {
  const all = [openrouter, groq, cloudflare];
  const sub = ids(plan(req({ class: "flagship", planTier: "free" }), deps(all)));
  assert.ok(!sub.some((x) => /kimi|claude|gpt-4o|deepseek/.test(x)), sub.join(", "));
  assert.ok(sub.includes("groq:qwen/qwen3.8-27b"));
  const direct = plan(req({ sovereignModelId: "openrouter/moonshotai/kimi-k2.6", planTier: "free" }), deps(all));
  assert.ok(!ids(direct).some((x) => /kimi/.test(x)));
  const e = explain(req({ sovereignModelId: "openrouter/moonshotai/kimi-k2.6", planTier: "free" }), deps(all));
  assert.equal(e.find((x) => x.wire === "moonshotai/kimi-k2.6")?.reason, "plan_tier");
  // Pro — Kimi bor va aynan model sifatida birinchi.
  const pro = plan(req({ sovereignModelId: "openrouter/moonshotai/kimi-k2.6", planTier: "pro" }), deps(all));
  assert.equal(ids(pro)[0], "openrouter:moonshotai/kimi-k2.6");
  assert.ok(pro[0].sameModel);
  // Starter: cheap DeepSeek o'rinbosar bo'la oladi, paid Kimi yo'q.
  const st = ids(plan(req({ class: "flagship", planTier: "starter" }), deps(all)));
  assert.ok(st.includes("openrouter:deepseek/deepseek-v4-flash") && !st.some((x) => /kimi/.test(x)));
});

test("free tarif: katalog tarifi (pro) — aynan Claude ham berilmaydi", () => {
  const c = plan(req({ sovereignModelId: "claude-sonnet-4-5", planTier: "free" }), deps([openrouter, groq]));
  assert.ok(!ids(c).some((x) => /claude/.test(x)));
});

test("same-model-first: aynan model (G0) o'rinbosarlardan (G1) oldin, rescue (G2) oxirida", () => {
  const c = plan(req({ sovereignModelId: "groq/qwen/qwen3.8-27b", planTier: "free" }), deps([llm7, openrouter, groq, cloudflare]));
  const g0 = c.filter((x) => x.sameModel).map((x) => x.provider).sort();
  assert.deepEqual(g0, ["cloudflare", "groq"]);
  assert.ok(c.slice(0, 2).every((x) => x.sameModel));
  assert.equal(c[c.length - 1].provider, "llm7");
  // sameModelOnly — o'rinbosar ham, rescue ham yo'q.
  const only = plan(req({ sovereignModelId: "groq/qwen/qwen3.8-27b", sameModelOnly: true }), deps([llm7, groq, cloudflare]));
  assert.ok(only.length === 2 && only.every((x) => x.sameModel));
  // allowRescue:false — LLM7 yo'q.
  assert.ok(!plan(req({ class: "free", allowRescue: false }), deps([llm7, groq])).some((x) => x.provider === "llm7"));
});

test("imkoniyat: tools kerak bo'lsa LLM7 (tools yo'q) tashlanadi", () => {
  const c = plan(req({ class: "free", needs: { tools: true, stream: false } }), deps([llm7, groq]));
  assert.deepEqual(ids(c), ["groq:qwen/qwen3.8-27b"]);
  const v = plan(req({ class: "free", needs: { vision: true } }), deps([llm7, groq]));
  assert.equal(v.length, 0);
});

test("ochiq circuit: provayder (yoki model kaliti) open bo'lsa o'tkazib yuboriladi", () => {
  const health = new Map([[meshHealthKey("groq"), H({ state: "open", until: NOW + 30_000, fails: 3, trips: 1 })]]);
  const c = plan(req({ class: "free" }), deps([groq, cloudflare], { health }));
  assert.deepEqual(ids(c), ["cloudflare:@cf/qwen/qwen3.8-27b"]);
  const model = new Map([[meshHealthKey("cloudflare", "@cf/qwen/qwen3.8-27b"), H({ state: "open", until: NOW + 1 })]]);
  assert.deepEqual(ids(plan(req({ class: "free" }), deps([groq, cloudflare], { health: model }))), ["groq:qwen/qwen3.8-27b"]);
  const e = explain(req({ class: "free" }), deps([groq, cloudflare], { health }));
  assert.equal(e.find((x) => x.provider === "groq")?.reason, "health_open");
  // exclude ham shunday.
  assert.deepEqual(ids(plan(req({ class: "free", exclude: ["cloudflare"] }), deps([groq, cloudflare]))), ["groq:qwen/qwen3.8-27b"]);
});

test("quota_exhausted: resetAt gacha o'tkaziladi, keyin half_open (skor × 0.5) bilan qaytadi", () => {
  const resetAt = Date.UTC(2026, 8, 28, 0, 0, 0);
  const health = new Map([[meshHealthKey("cloudflare"), H({ state: "open", until: resetAt, lastError: "quota_exhausted", usedToday: 10_000 })]]);
  const before = plan(req({ class: "free" }), deps([groq, cloudflare], { health, now: resetAt - 1 }));
  assert.ok(!before.some((x) => x.provider === "cloudflare"));
  const after = plan(req({ class: "free" }), deps([groq, cloudflare], { health, now: resetAt + 1 }));
  const cf = after.find((x) => x.provider === "cloudflare");
  const gq = after.find((x) => x.provider === "groq");
  assert.ok(cf && gq, "reset'dan keyin qaytadi");
  assert.ok(cf.score < gq.score * 0.5, "half_open va kvota ulushi kam — Groq oldinda");
  assert.equal(after[0].provider, "groq");
});

test("yukni yoyish: ikki teng sog'lom provayder — 1000 marta ~50/50 (seed'li rand)", () => {
  const rand = seeded(42);
  const count: Record<string, number> = {};
  for (let i = 0; i < 1000; i++) {
    const first = plan(req({ class: "free" }), deps([groq, cloudflare], { rand }))[0].provider;
    count[first] = (count[first] ?? 0) + 1;
  }
  assert.ok(count.groq >= 450 && count.groq <= 550, JSON.stringify(count));
  assert.ok(count.cloudflare >= 450 && count.cloudflare <= 550, JSON.stringify(count));
});

test("yukni yoyish: kvota ulushi kam provayder bandga kirmaydi va kamroq tanlanadi", () => {
  const health = new Map([[meshHealthKey("cloudflare"), H({ usedToday: 9_000 })]]); // R = 0.1
  const rand = seeded(7);
  let cf = 0;
  for (let i = 0; i < 500; i++) if (plan(req({ class: "free" }), deps([groq, cloudflare], { health, rand }))[0].provider === "cloudflare") cf++;
  assert.equal(cf, 0);
  // Qisman (R=0.9 vs 1): ikkalasi bandda, ulush skorga proporsional (~47% / 53%).
  const mild = new Map([[meshHealthKey("cloudflare"), H({ usedToday: 1_000 })]]);
  const r2 = seeded(9);
  let cf2 = 0;
  for (let i = 0; i < 2000; i++) if (plan(req({ class: "free" }), deps([groq, cloudflare], { health: mild, rand: r2 }))[0].provider === "cloudflare") cf2++;
  assert.ok(cf2 > 820 && cf2 < 1080, String(cf2));
});

test("skor: sinf pog'onasi, cost, latency; explain omillarni beradi", () => {
  const e = explain(req({ class: "flagship", planTier: "pro" }), deps([openrouter, groq]));
  const q = e.find((x) => x.provider === "groq");
  assert.equal(q?.factors?.F, 0.64); // flagship → free: 2 pog'ona
  const k = e.find((x) => x.wire === "moonshotai/kimi-k2.6");
  assert.equal(k?.factors?.C, 0.7);
  assert.ok((k?.score ?? 0) > (q?.score ?? 1)); // flagship Kimi (1·1·0.67·0.7) > Qwen (0.9·0.64·0.67·1)
  assert.ok((q?.rank ?? 0) > (k?.rank ?? 9) && !q?.inBand && k?.inBand);
  assert.ok(formatExplain(e).every((l) => typeof l === "string" && !/key|token/i.test(l)));
  // Latency yomon — skor pastroq.
  const slow = new Map([[meshHealthKey("groq"), H({ latencyEwmaMs: 12_000 })]]);
  const c = plan(req({ class: "free" }), deps([groq, cloudflare], { health: slow }));
  assert.equal(c[0].provider, "cloudflare");
});

test("o'chirilgan / xato otuvchi adapter tashlanadi, planCandidates plan() bilan bir xil", () => {
  const off = fake("mistral", [offer({ wire: "mistral-small" })], { enabled: () => false });
  const boom = fake("nvidia", [offer({ wire: "x" })], {
    enabled: () => {
      throw new Error("env");
    },
  });
  const c = plan(req({ class: "free" }), deps([off, boom, groq]));
  assert.deepEqual(ids(c), ["groq:qwen/qwen3.8-27b"]);
  const a = planCandidates(req({ class: "free" }), [groq, cloudflare], EMPTY, { now: NOW, rng: seeded(3) });
  const b = plan(req({ class: "free" }), deps([groq, cloudflare], { rand: seeded(3) }));
  assert.deepEqual(ids(a), ids(b));
});

test("haqiqiy registry (hammasi majburan yoqilgan): RU'da Claude/GPT yo'q, free'da paid yo'q", () => {
  const forced = ADAPTERS.map((a) => Object.assign(Object.create(a) as ProviderAdapter, { enabled: () => true }));
  const ru = plan(req({ sovereignModelId: "claude-sonnet-4-5", planTier: "ultra", country: "RU" }), deps(forced));
  assert.ok(ru.length > 0, "RU'da ham biror nomzod bo'lsin");
  for (const c of ru) {
    const a = forced.find((x) => x.id === c.provider)!;
    const shown = a.displayId?.(c.offer.wire) ?? c.offer.wire;
    assert.ok(!/claude|anthropic|gpt-4|gpt-5|gemini|mistral/i.test(shown), shown);
  }
  const free = plan(req({ class: "flagship", planTier: "free" }), deps(forced));
  for (const c of free) assert.ok(c.offer.minTier ? c.offer.minTier === "free" : c.offer.cost === "free", `${c.provider}:${c.offer.wire}`);
});

test("substitutable:false (Tella/Perplexity) — faqat aynan o'zi so'ralganda, hech qachon o'rinbosar emas", () => {
  const tella = fake("tella", [offer({ sovereignIds: ["tella-2"], wire: "tella2", substitutable: false })]);
  const other = req({ sovereignModelId: "groq/qwen/qwen3.8-27b", planTier: "ultra" });
  assert.ok(!ids(plan(other, deps([tella, groq]))).includes("tella:tella2"));
  const e = explain(other, deps([tella, groq])).find((x) => x.provider === "tella");
  assert.equal(e?.reason, "not_substitutable");
  const own = req({ sovereignModelId: "tella-2", sameModelOnly: true, allowRescue: false });
  assert.deepEqual(ids(plan(own, deps([tella, groq, llm7]))), ["tella:tella2"]);
});

test("req.modelTier: aynan-model tarifi = max(model tarifi, offer tarifi) — past modelTier pullik yo'lni ochmaydi", () => {
  const r = req({ sovereignModelId: "openrouter/moonshotai/kimi-k2.6", planTier: "free", sameModelOnly: true });
  assert.equal(plan(r, deps([openrouter])).length, 0, "tarif berilmasa offer tarifi (paid → pro)");
  // Regress: chaqiruvchi modelTier "free" desa ham pullik offer (pro) Free'ga berilmaydi.
  assert.equal(plan({ ...r, modelTier: "free" }, deps([openrouter])).length, 0);
  assert.deepEqual(ids(plan({ ...r, planTier: "pro" }, deps([openrouter]))), ["openrouter:moonshotai/kimi-k2.6"]);
});

/* ---- Tarif oqishi (regress, adversarial review #1) ---- */

// Haqiqiy registry takliflari bilan: env'dan mustaqil bo'lishi uchun enabled() → true.
const REAL = ADAPTERS.map((a) => ({ ...a, enabled: () => true, offers: a.offers }) as ProviderAdapter);
const realPlan = (r: RouteRequest) => plan(r, { adapters: REAL, health: EMPTY, now: NOW, rand: seeded(3) });
const TIERS = { free: 0, starter: 1, pro: 2, ultra: 3 } as const;

test("tarif (a): Free 'llama-3.3-free' so'rasa — pullik OpenRouter llama (':free' siz) G0'ga kirmaydi", () => {
  const got = realPlan(req({ sovereignModelId: "llama-3.3-free", planTier: "free", allowRescue: false }));
  assert.ok(got.length > 0, "tekin yo'llar bor");
  const paid = got.filter((c) => c.offer.cost !== "free");
  assert.deepEqual(paid.map((c) => `${c.provider}:${c.offer.wire}`), [], "Free tarifda pullik taklif yo'q");
  assert.ok(!got.some((c) => c.provider === "openrouter" && c.offer.wire === "meta-llama/llama-3.3-70b-instruct"));
});

test("tarif (b): Pro upstream nomi bilan Ultra model so'rasa (anthropic/claude-opus-5) — hech bir yo'l berilmaydi", () => {
  for (const id of ["anthropic/claude-opus-5", "openrouter/anthropic/claude-opus-5", "claude-opus-5"]) {
    const got = realPlan(req({ sovereignModelId: id, planTier: "pro", sameModelOnly: true }));
    assert.deepEqual(ids(got), [], `${id}: Pro'ga Ultra model yo'q`);
    const ultra = realPlan(req({ sovereignModelId: id, planTier: "ultra", sameModelOnly: true }));
    assert.ok(ultra.length > 0, `${id}: Ultra'da bor`);
  }
});

test("tarif: barcha katalog modellari × barcha tariflar — G0 yo'lining tarifi tarifdan oshmaydi, G1 ham", () => {
  for (const m of MODELS) {
    for (const planTier of ["free", "starter", "pro", "ultra"] as const) {
      for (const id of [m.id, m.providerModel].filter(Boolean)) {
        const got = realPlan(req({ sovereignModelId: id, planTier }));
        for (const c of got) {
          // Tella/Perplexity (substitutable:false) — faqat aynan o'zi, model tarifi amal qiladi (pastda).
          if (c.offer.substitutable !== false) {
            assert.ok(TIERS[offerMinTier(c.offer)] <= TIERS[planTier], `${planTier} ← ${id}: ${c.provider}:${c.offer.wire} (${offerMinTier(c.offer)})`);
          }
          if (c.sameModel) {
            assert.ok(TIERS[m.tier as keyof typeof TIERS] <= TIERS[planTier], `${planTier} ← ${id} (${m.tier}) same-model ${c.provider}:${c.offer.wire}`);
          }
        }
      }
    }
  }
});

test("pool: $paid yopiq — pullik takliflar tushadi, :free ishlaydi; $free yopiq — aksincha", () => {
  const or = fake("openrouter", [
    offer({ wire: "x/paid", cost: "paid", class: "free" }),
    offer({ wire: "x/free:free", cost: "free", class: "free" }),
  ]);
  const paidDown = new Map([[meshHealthKey("openrouter", "$paid"), H({ state: "open", until: NOW + 3_600_000 })]]);
  assert.deepEqual(ids(plan(req({ planTier: "ultra", class: "free" }), deps([or], { health: paidDown }))), ["openrouter:x/free:free"]);
  const freeDown = new Map([[meshHealthKey("openrouter", "$free"), H({ state: "open", until: NOW + 3_600_000 })]]);
  assert.deepEqual(ids(plan(req({ planTier: "ultra", class: "free" }), deps([or], { health: freeDown }))), ["openrouter:x/paid"]);
});

test("caps: o'rganilgan tools=false — tool'li so'rovda shu wire tanlanmaydi (faqat xotirada)", () => {
  __resetLearnedCaps();
  const om = fake("omniroute", [offer({ wire: "groq/x", class: "free" }), offer({ wire: "groq/y", class: "free" })]);
  learnMissingCapability("omniroute", "groq/x", "tools", NOW);
  assert.deepEqual(ids(plan(req({ class: "free", needs: { tools: true } }), deps([om]))), ["omniroute:groq/y"]);
  assert.equal(plan(req({ class: "free", needs: { stream: true } }), deps([om])).length, 2, "tool'siz so'rovga ta'sir yo'q");
  __resetLearnedCaps();
});

console.log(`${passed} o'tdi, ${failed} yiqildi`);
if (failed) process.exit(1);
