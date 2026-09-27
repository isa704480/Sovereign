/**
 * Lokal test (tarmoqsiz): npx tsx src/lib/econ/unit-economics.test.ts
 * Narx topish, qarshi faraz (bitta vendor flagmani), tekin tarif ulushi va
 * modelsiz/narxsiz qatorlarni chiqarib tashlash.
 */
import assert from "node:assert/strict";
import { MODEL_PRICES } from "@/config/model-prices";
import { computeUnitEconomics, costUsd, inferProvider, lookupPrice, resolveServed, type UsageRow } from "./unit-economics";

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ✗ ${name}\n    ${e instanceof Error ? e.message : e}`);
  }
}
const close = (a: number | null, b: number, eps = 1e-9) => {
  assert.ok(a !== null && Math.abs(a - b) < eps, `${a} ≈ ${b}`);
};
const row = (p: Partial<UsageRow>): UsageRow => ({
  day: "2026-09-20",
  user_id: "u1",
  model: "",
  input_tokens: 0,
  output_tokens: 0,
  calls: 1,
  ...p,
});

test("har narx yozuvida manba URL va sana bor, narxlar manfiy emas", () => {
  for (const p of MODEL_PRICES) {
    assert.match(p.url, /^https:\/\//, p.id);
    assert.match(p.checked, /^\d{4}-\d{2}-\d{2}$/, p.id);
    assert.ok(p.source.length > 0, p.id);
    assert.ok(p.inPerM >= 0 && p.outPerM >= 0, p.id);
  }
});

test("narx topish: aniq id, provayder prefiksi, sana/vendor farqi", () => {
  assert.equal(lookupPrice("openai/gpt-4o")?.price.inPerM, 2.5);
  assert.equal(lookupPrice("gpt-4o-2024-08-06")?.price.id, "openai/gpt-4o");
  assert.equal(lookupPrice("openrouter/moonshotai/kimi-k2.6")?.price.id, "moonshotai/kimi-k2.6");
  assert.equal(lookupPrice("Meta-Llama-3.3-70B-Instruct")?.price.id, "meta-llama/llama-3.3-70b-instruct");
  assert.equal(lookupPrice("perplexity/fast")?.price.id, "perplexity/sonar");
  assert.equal(lookupPrice("codestral-latest", "mistral")?.price.outPerM, 0.9);
  assert.equal(lookupPrice("unknown/model-x"), null);
  assert.equal(lookupPrice(""), null);
});

test("provayderga xos narx ustun: Groq va Cloudflare", () => {
  const groq = lookupPrice("qwen/qwen3.8-27b", "groq");
  assert.equal(groq?.price.provider, "groq");
  assert.equal(groq?.price.inPerM, 0.8);
  // Provayder noma'lum — umumiy (OpenRouter) narx.
  assert.equal(lookupPrice("qwen/qwen3.8-27b")?.price.inPerM, 0.42);
  const cf = lookupPrice("cloudflare/@cf/deepseek-ai/deepseek-v4-flash-0731", inferProvider("cloudflare/@cf/x"));
  assert.equal(cf?.price.provider, "cloudflare");
  close(cf?.price.inPerM ?? null, 0.44); // 40 000 neuron/M × $0.011/1k
  assert.equal(cf?.freeTier, true);
});

test("tekin tarif: ':free' va tekin provayder belgilanadi, pullik — yo'q", () => {
  const nv = lookupPrice("nvidia/nemotron-3.5-lightning:free");
  assert.equal(nv?.freeTier, true);
  assert.equal(nv?.price.inPerM, 0.08); // pullik variant narxida
  assert.equal(lookupPrice("openai/gpt-oss-120b", "groq")?.freeTier, true);
  assert.equal(lookupPrice("openai/gpt-oss-120b", "openrouter")?.freeTier, false);
  assert.equal(lookupPrice("openai/gpt-4o")?.freeTier, false);
});

test("resolveServed: upstream ustun, katalog id → providerModel, auto/bo'sh → null", () => {
  assert.deepEqual(resolveServed({ model: "llama-3.3-free", upstream_model: "openai/gpt-oss-120b", provider: "groq" }), {
    model: "openai/gpt-oss-120b",
    provider: "groq",
    verified: true,
  });
  assert.deepEqual(resolveServed({ model: "claude-sonnet-4-5" }), {
    model: "anthropic/claude-sonnet-4.5",
    provider: "",
    verified: false,
  });
  assert.equal(resolveServed({ model: "groq/qwen/qwen3.8-27b" })?.provider, "groq");
  assert.equal(resolveServed({ model: "" }), null);
  assert.equal(resolveServed({ model: "auto" }), null);
});

test("qarshi faraz: bitta vendor flagmani bilan solishtirish va tejash %", () => {
  const rows = [
    row({ model: "x", upstream_model: "deepseek/deepseek-v4-flash-0731", input_tokens: 1_000_000, output_tokens: 1_000_000 }),
  ];
  const r = computeUnitEconomics(rows, {
    from: "2026-09-01",
    to: "2026-09-30",
    baselines: [{ key: "gpt-4o", label: "GPT-4o", model: "openai/gpt-4o" }],
  });
  close(r.priced.costUsd, 0.021 + 0.32);
  close(r.baselines[0].costUsd, 2.5 + 10);
  close(r.baselines[0].savingsPct, (1 - 0.341 / 12.5) * 100);
  close(r.perAnswerUsd, 0.341);
  close(r.baselines[0].perAnswerUsd, 12.5);
  assert.equal(r.priced.verifiedAnswers, 1);
});

test("tekin tarif ulushi alohida, lekin xarajat ro'yxat narxida qoladi", () => {
  const rows = [
    row({ model: "a", upstream_model: "openai/gpt-oss-120b", provider: "groq", input_tokens: 1_000_000, output_tokens: 0, calls: 3 }),
    row({ model: "b", upstream_model: "openai/gpt-4o-mini", provider: "openai", input_tokens: 1_000_000, output_tokens: 0, calls: 1 }),
  ];
  const r = computeUnitEconomics(rows, { from: "a", to: "b" });
  assert.equal(r.freeTier.answers, 3);
  close(r.freeTier.sharePct, 75);
  close(r.freeTier.costAtListUsd, 0.15);
  close(r.priced.costUsd, 0.15 + 0.15); // tekin qator ham ro'yxat narxida
});

test("modelsiz va narxsiz qatorlar chiqariladi va sanaladi", () => {
  const rows = [
    row({ model: "", input_tokens: 500, output_tokens: 500, calls: 2 }),
    row({ model: "auto", input_tokens: 500, output_tokens: 500, calls: 1 }),
    row({ model: "tella-2", input_tokens: 500, output_tokens: 500, calls: 4 }),
    row({ model: "claude-sonnet-4-5", input_tokens: 1_000_000, output_tokens: 0, calls: 1 }),
  ];
  const r = computeUnitEconomics(rows, { from: "a", to: "b" });
  assert.equal(r.totals.answers, 8);
  assert.equal(r.priced.answers, 1);
  assert.equal(r.excluded.noModelAnswers, 3);
  assert.equal(r.excluded.unpricedAnswers, 4);
  assert.deepEqual(r.excluded.unpriced, [{ model: "tella-2", answers: 4 }]);
  close(r.priced.costUsd, 3);
  assert.equal(r.priced.verifiedAnswers, 0);
  // Qarshi faraz ham faqat narxlangan qatorlar bo'yicha (tella tokenlari kirmaydi).
  close(r.baselines.find((b) => b.key === "gpt-4o")?.costUsd ?? null, 2.5);
});

test("taqsimot: provayder / model / tarif, bo'sh ma'lumot — null", () => {
  const rows = [
    row({ user_id: "u1", model: "cloudflare/@cf/qwen/qwen3.8-27b", input_tokens: 10, output_tokens: 10 }),
    row({ user_id: "u2", model: "gpt-4o-full", input_tokens: 10, output_tokens: 10 }),
  ];
  const r = computeUnitEconomics(rows, { from: "a", to: "b", planByUser: { u1: "free", u2: "pro" } });
  assert.deepEqual(r.byProvider.map((b) => b.key).sort(), ["cloudflare", "unknown"]);
  assert.deepEqual(r.byPlan.map((b) => b.key).sort(), ["free", "pro"]);
  assert.ok(r.byModel.some((b) => b.key === "openai/gpt-4o"));
  const empty = computeUnitEconomics([], { from: "a", to: "b" });
  assert.equal(empty.perAnswerUsd, null);
  assert.equal(empty.freeTier.sharePct, null);
  assert.equal(empty.baselines[0].savingsPct, null);
});

test("costUsd: 1M kirish + 1M chiqish", () => {
  close(costUsd(1_000_000, 1_000_000, { inPerM: 2, outPerM: 10 }), 12);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
