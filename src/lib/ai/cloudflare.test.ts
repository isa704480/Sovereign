/**
 * Lokal test (tarmoqsiz): npx tsx src/lib/ai/cloudflare.test.ts
 * Cloudflare Workers AI jadvallari, xato/kvota tasnifi, oqimsiz javob va tekin zanjir qoidalari.
 */
import assert from "node:assert/strict";
import {
  CF,
  CF_BY_CLASS,
  CF_NEURONS_PER_M,
  cfErrorMessage,
  cfId,
  cfNeurons,
  cfQuotaExceeded,
  cfSameModel,
  cfStreams,
  jsonCompletionToChunk,
} from "./cloudflare";
import { CF_IDS, FREE_DIRECT_CHAIN, GROQ_OSS, GROQ_QWEN, freePlanCandidates, providerSideFailure } from "./chain";

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

test("model id'lari: @cf/ prefiksi, har biriga neuron narxi bor", () => {
  for (const id of Object.values(CF)) {
    assert.match(id, /^@cf\/[a-z0-9-]+\/[a-z0-9.-]+$/, id);
    assert.ok(CF_NEURONS_PER_M[id], `neuron narxi yo'q: ${id}`);
  }
  for (const list of Object.values(CF_BY_CLASS)) for (const id of list) assert.ok(CF_NEURONS_PER_M[id], id);
});

test("cfSameModel: OpenRouter / OmniRoute / Groq id → Cloudflare'dagi aynan shu model", () => {
  assert.equal(cfSameModel("deepseek/deepseek-v4-pro-0813"), CF.deepseekPro);
  assert.equal(cfSameModel("openrouter/deepseek/deepseek-v4-flash"), CF.deepseekFlash);
  assert.equal(cfSameModel("openrouter/moonshotai/kimi-k2.6"), CF.kimi);
  assert.equal(cfSameModel("z-ai/glm-5.3"), CF.glm);
  assert.equal(cfSameModel("groq/qwen/qwen3.8-27b"), CF.qwen);
  assert.equal(cfSameModel("groq/openai/gpt-oss-120b"), CF.gptOss);
  assert.equal(cfSameModel("meta-llama/llama-3.3-70b-instruct:free"), CF.llama);
  assert.equal(cfSameModel("cloudflare/@cf/zai-org/glm-5.3"), CF.glm);
  // Boshqa model — aynan ekvivalent yo'q (sinf zaxirasi ishlatiladi).
  assert.equal(cfSameModel("anthropic/claude-sonnet-5"), null);
  assert.equal(cfSameModel("deepseek/deepseek-v4.1-flash"), null);
  assert.equal(cfSameModel(""), null);
});

test("neuron hisobi: pricing jadvali bo'yicha", () => {
  // DeepSeek V4 Pro: 120k / 360k neuron per 1M → 1000 kirish + 1000 chiqish = 480 neuron.
  assert.equal(cfNeurons(CF.deepseekPro, 1000, 1000), 480);
  assert.equal(cfNeurons(cfId(CF.gptOss), 0, 1_000_000), 68_182);
  assert.equal(cfNeurons("@cf/unknown/model", 10, 10), null);
});

test("oqim: gpt-oss oqimsiz, qolganlari oqim bilan", () => {
  assert.equal(cfStreams(CF.gptOss), false);
  for (const id of [CF.deepseekPro, CF.kimi, CF.glm, CF.qwen, CF.llama]) assert.equal(cfStreams(id), true, id);
});

test("kvota: 429 va 4006 (kunlik 10k neuron) — yumshoq xato", () => {
  const body = {
    errors: [{ code: 4006, message: "you have used up your daily free allocation of 10,000 neurons, please upgrade" }],
    success: false,
  };
  const msg = cfErrorMessage(body)!;
  assert.match(msg, /^4006: you have used up/);
  assert.ok(cfQuotaExceeded(429, msg));
  assert.ok(cfQuotaExceeded(400, msg), "matn bo'yicha ham tutiladi");
  assert.ok(!cfQuotaExceeded(400, "Bad input"));
  assert.equal(cfErrorMessage({ error: "x" }), null);
});

test("providerSideFailure: 402/429/5xx/kvota — keyingi provayder; 400/413/422 — yo'q", () => {
  for (const s of [0, 401, 402, 403, 404, 408, 429, 500, 502, 503]) assert.ok(providerSideFailure(s), String(s));
  for (const s of [400, 413, 422]) assert.ok(!providerSideFailure(s, "context too long"), String(s));
  assert.ok(providerSideFailure(400, "This request requires more credits, or fewer max_tokens"));
  assert.ok(providerSideFailure(400, "4006: daily free allocation of 10,000 neurons"));
});

test("jsonCompletionToChunk: OpenAI formati (gpt-oss reasoning bilan) va eski Workers AI formati", () => {
  const c = jsonCompletionToChunk({
    model: "@cf/openai/gpt-oss-120b",
    choices: [{ message: { role: "assistant", content: "Salom!", reasoning_content: "o'ylayapman" }, finish_reason: "stop" }],
    usage: { prompt_tokens: 5, completion_tokens: 3 },
  })!;
  assert.equal(c.choices[0].delta.content, "Salom!");
  assert.equal(c.choices[0].delta.reasoning_content, "o'ylayapman");
  assert.equal(c.choices[0].finish_reason, "stop");
  assert.equal(c.model, "@cf/openai/gpt-oss-120b");
  const old = jsonCompletionToChunk({ result: { response: "Privet" }, success: true })!;
  assert.equal(old.choices[0].delta.content, "Privet");
  assert.equal(jsonCompletionToChunk({ errors: [] }), null);
  assert.equal(jsonCompletionToChunk(null), null);
});

test("tekin zanjir: tanlangan model → Groq (qwen, gpt-oss) → Cloudflare → eski zaxiralar", () => {
  assert.deepEqual([...FREE_DIRECT_CHAIN], [GROQ_QWEN, GROQ_OSS, CF_IDS.qwen]);
  const all = freePlanCandidates("gemini-flash-free", ["llama-3.3-free", GROQ_QWEN], () => true);
  assert.deepEqual(all, ["gemini-flash-free", GROQ_QWEN, GROQ_OSS, CF_IDS.qwen, "llama-3.3-free"]);
  // Cloudflare kaliti yo'q — faqat Groq.
  const noCf = freePlanCandidates("llama-3.3-free", [], (id) => !id.startsWith("cloudflare/"));
  assert.deepEqual(noCf, ["llama-3.3-free", GROQ_QWEN, GROQ_OSS]);
  // Mintaqa filtri chaqiruvchidan.
  const onlyCf = freePlanCandidates("x", [], () => true, (id) => id.startsWith("cloudflare/"));
  assert.deepEqual(onlyCf, ["x", CF_IDS.qwen]);
});

console.log(`${passed} o'tdi, ${failed} yiqildi`);
if (failed) process.exit(1);
