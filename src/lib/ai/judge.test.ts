/**
 * Mustaqil hakam (judge.ts) — soxta fetch va soxta env bilan (tarmoqsiz, kalitsiz):
 *   npx tsx --conditions=react-server src/lib/ai/judge.test.ts
 * Tekshiriladi: vendorOf jadvali, hakam hech qachon javob kompaniyasidan emas, mintaqa
 * (RU — OpenAI/Anthropic/Google hakami yo'q), kaliti yo'q yo'llar, timeout → keyingi hakam.
 */
import assert from "node:assert/strict";
import { answerModelsFor, callJudge, isOpaqueAuto, judgeCandidates, vendorOf, extractJson, JUDGE_POOL, type Vendor } from "./judge";

let passed = 0;
let failed = 0;
const queue: [string, () => void | Promise<void>][] = [];
function test(name: string, fn: () => void | Promise<void>) {
  queue.push([name, fn]);
}

const ALL_KEYS = {
  GROQ_API_KEY: "test-groq",
  CLOUDFLARE_ACCOUNT_ID: "acc123",
  CLOUDFLARE_AI_TOKEN: "test-cf",
  OMNIROUTE_BASE_URL: "https://omni.test/v1",
  OMNIROUTE_API_KEY: "test-omni",
  MISTRAL_API_KEY: "test-mistral",
  OPENROUTER_API_KEY: "test-or",
};

const ok = (content: string) =>
  new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content }, finish_reason: "stop" }] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

test("vendorOf jadvali", () => {
  const table: [string, Vendor][] = [
    // Katalog id'lari (config/models.ts)
    ["gpt-5-6-sol", "openai"],
    ["o1-mini", "openai"],
    ["gpt-4o-mini", "openai"],
    ["claude-sonnet-5", "anthropic"],
    ["claude-haiku-4-5", "anthropic"],
    ["gemini-3-5-flash", "google"],
    ["gemini-flash-free", "google"],
    ["llama-3-3-70b", "meta"],
    ["llama-3.3-free", "meta"],
    ["deepseek-v4-pro", "deepseek"],
    ["deepseek-r1-free", "deepseek"],
    ["qwen3-8-27b", "alibaba"],
    ["grok-4-6", "xai"],
    ["glm-5-3", "zhipu"],
    ["mistral-small", "mistral"],
    ["nemotron-ultra-free", "nvidia"],
    ["sonar-online", "perplexity"],
    ["tella-2", "sovereign"],
    // Host prefikslari
    ["groq/openai/gpt-oss-20b", "openai"],
    ["groq/qwen/qwen3.8-27b", "alibaba"],
    ["openrouter/moonshotai/kimi-k2.6", "moonshot"],
    ["openrouter/z-ai/glm-5.2", "zhipu"],
    ["omniroute/deepseek/deepseek-v4-flash", "deepseek"],
    ["cloudflare/@cf/zai-org/glm-5.3", "zhipu"],
    ["cloudflare/@cf/meta/llama-3.3-70b-instruct-fp8-fast", "meta"],
    ["cloudflare/@cf/openai/gpt-oss-120b", "openai"],
    ["cloudflare/@cf/moonshotai/kimi-k2.7-code", "moonshot"],
    ["cloudflare/@cf/deepseek-ai/deepseek-v4-flash-0731", "deepseek"],
    ["nvidia/meta/llama-3.3-70b-instruct", "meta"],
    ["nvidia/nemotron-3.5-lightning:free", "nvidia"],
    ["google/gemma-3-27b-it:free", "google"],
    ["x-ai/grok-build-0.1", "xai"],
    ["minimax/minimax-m2", "minimax"],
    ["auto/glm", "zhipu"],
    ["auto/minimax", "minimax"],
    // Upstream javobidagi nomlar
    ["gpt-oss-120b", "openai"],
    ["Meta-Llama-3.3-70B-Instruct", "meta"],
    ["DeepSeek-R1-Distill-Llama-70B", "deepseek"],
    ["claude-sonnet-4-5-20250929", "anthropic"],
    ["codestral-latest", "mistral"],
    ["mistral-Nemo-Instruct-2407", "mistral"],
    ["perplexity/fast", "perplexity"],
    ["whisper-large-v3", "openai"],
    // Noma'lum
    ["auto", "unknown"],
    ["auto/best-free", "unknown"],
    ["", "unknown"],
    ["some-random-model", "unknown"],
  ];
  for (const [id, want] of table) assert.equal(vendorOf(id), want, id);
});

test("pool kamida 4 kompaniya, OpenRouter oxirida", () => {
  const vendors = new Set(JUDGE_POOL.map((c) => vendorOf(c.id)));
  assert.ok(vendors.size >= 4, `kompaniyalar: ${[...vendors].join(",")}`);
  assert.ok(!vendors.has("unknown"));
  assert.equal(JUDGE_POOL[JUDGE_POOL.length - 1].route, "openrouter");
  assert.ok(JUDGE_POOL.findIndex((c) => c.route === "openrouter") === JUDGE_POOL.length - 1);
});

const ANSWER_MODELS = [
  "gpt-5-6-sol",
  "groq/openai/gpt-oss-20b",
  "gpt-oss-120b",
  "claude-sonnet-5",
  "gemini-3-5-flash",
  "llama-3-3-70b",
  "cloudflare/@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  "deepseek-v4-pro",
  "cloudflare/@cf/deepseek-ai/deepseek-v4-flash-0731",
  "qwen3-8-27b",
  "groq/qwen/qwen3.8-27b",
  "glm-5-3",
  "cloudflare/@cf/zai-org/glm-5.3",
  "openrouter/moonshotai/kimi-k2.6",
  "mistral-small",
  "codestral-latest",
  "grok-4-6",
  "nemotron-ultra-free",
  "tella-2",
  "openai/gpt-4o-mini",
];

test("20 javob modeli: hakam hech qachon o'sha kompaniyadan emas", async () => {
  assert.equal(ANSWER_MODELS.length, 20);
  for (const m of ANSWER_MODELS) {
    const av = vendorOf(m);
    const list = judgeCandidates({ answerModel: m, env: ALL_KEYS });
    assert.ok(list.length > 0, `${m}: hakam yo'q`);
    for (const c of list) assert.notEqual(c.vendor, av, `${m} → ${c.id}`);
    // Haqiqiy chaqiruv ham (birinchi hakam javob beradi).
    const r = await callJudge({ system: "s", user: "u", answerModel: m, env: ALL_KEYS, fetchImpl: (async () => ok('{"x":1}')) as typeof fetch });
    assert.ok(r, `${m}: natija yo'q`);
    assert.notEqual(r.judgeVendor, av, `${m} → ${r.judgeModel}`);
    assert.equal(r.answerVendor, av);
  }
});

test("bir nechta id (upstream + katalog): ikkala kompaniya ham chiqariladi", () => {
  // llama-3.3-free katalogda Meta, lekin Groq'da gpt-oss-120b (OpenAI) javob bergan.
  const list = judgeCandidates({ answerModel: ["gpt-oss-120b", "llama-3.3-free"], env: ALL_KEYS });
  assert.ok(list.length > 0);
  for (const c of list) assert.ok(c.vendor !== "openai" && c.vendor !== "meta", c.id);
});

test("aralash auto/* kombo: served noma'lum — hech bir kompaniya hakam bo'lmaydi", async () => {
  for (const m of ["auto/best-free", "omniroute/auto/best-free", "auto/coding:free", "auto/best-coding", "auto"]) {
    assert.equal(isOpaqueAuto(m), true, m);
    assert.equal(judgeCandidates({ answerModel: m, env: ALL_KEYS }).length, 0, m);
  }
  // Oila kombolari (auto/glm, auto/claude-sonnet) aralash emas — kompaniyasi ma'lum.
  for (const m of ["auto/glm", "auto/minimax", "auto/claude-sonnet", "auto/gemini", "groq/qwen/qwen3.8-27b", "mystery-model-9"]) {
    assert.equal(isOpaqueAuto(m), false, m);
  }
  const r = await callJudge({ system: "s", user: "u", answerModel: "auto/best-free", env: ALL_KEYS, fetchImpl: (async () => ok("{}")) as typeof fetch });
  assert.equal(r, null);
});

test("aralash auto/*: served upstream ma'lum bo'lsa unga yechiladi (o'sha kompaniya chiqariladi)", () => {
  // OmniRoute auto/best-free → X-OmniRoute-Model: groq/openai/gpt-oss-120b
  const models = answerModelsFor(["openai/gpt-oss-120b", "auto/best-free"], ["auto/best-free"]);
  assert.deepEqual(models, ["openai/gpt-oss-120b"]);
  const list = judgeCandidates({ answerModel: models, env: ALL_KEYS });
  assert.ok(list.length > 0);
  for (const c of list) assert.notEqual(c.vendor, "openai", c.id);
  // Served ham noma'lum (header yo'q) — auto qoladi va hakam tanlanmaydi.
  const unresolved = answerModelsFor(["auto/best-free"], ["auto"]);
  assert.deepEqual(unresolved, ["auto/best-free", "auto"]);
  assert.equal(judgeCandidates({ answerModel: unresolved, env: ALL_KEYS }).length, 0);
  // Tadqiqot qadami (Perplexity) + auto javob, served ma'lum: ikkala kompaniya ham chiqariladi.
  const withResearch = answerModelsFor(["deepseek/deepseek-v4-flash"], ["sonar-online", "auto/best-free"]);
  const vendors = new Set(judgeCandidates({ answerModel: withResearch, env: ALL_KEYS }).map((c) => c.vendor));
  assert.ok(!vendors.has("deepseek") && !vendors.has("perplexity"));
  assert.ok(vendors.size > 0);
});

test("javob kompaniyasi noma'lum: hakam baribir ma'lum kompaniyadan", async () => {
  const r = await callJudge({ system: "s", user: "u", answerModel: "mystery-model-9", env: ALL_KEYS, fetchImpl: (async () => ok("{}")) as typeof fetch });
  assert.ok(r);
  assert.equal(r.answerVendor, "unknown");
  assert.notEqual(r.judgeVendor, "unknown");
});

test("RU: OpenAI/Anthropic/Google hakami hech qachon tanlanmaydi", async () => {
  for (const m of ANSWER_MODELS) {
    for (const c of judgeCandidates({ answerModel: m, country: "RU", env: ALL_KEYS })) {
      assert.ok(!["openai", "anthropic", "google"].includes(c.vendor), `${m} → ${c.id}`);
    }
  }
  // Hamma tekin yo'llar yiqilsa ham (faqat OpenRouter gpt-4o-mini qolsa) — RU'da chaqirilmaydi.
  const urls: string[] = [];
  const r = await callJudge({
    system: "s",
    user: "u",
    answerModel: "qwen3-8-27b",
    country: "RU",
    env: ALL_KEYS,
    fetchImpl: (async (u: string) => {
      urls.push(String(u));
      return new Response("{}", { status: 500 });
    }) as typeof fetch,
  });
  assert.equal(r, null);
  assert.ok(!urls.some((u) => u.includes("openrouter.ai")), "RU'da OpenRouter gpt-4o-mini chaqirildi");
});

test("sanksiya mintaqasi (IR): hech qanday tashqi hakam yo'q", () => {
  assert.equal(judgeCandidates({ answerModel: "gpt-5-6-sol", country: "IR", env: ALL_KEYS }).length, 0);
});

test("kaliti yo'q yo'llar o'tkaziladi", async () => {
  // Faqat Cloudflare kaliti bor.
  const env = { CLOUDFLARE_ACCOUNT_ID: "acc123", CLOUDFLARE_AI_TOKEN: "test-cf" };
  const list = judgeCandidates({ answerModel: "gpt-5-6-sol", env });
  assert.ok(list.length > 0 && list.every((c) => c.route === "cloudflare"), list.map((c) => c.id).join(","));
  const urls: string[] = [];
  const r = await callJudge({
    system: "s",
    user: "u",
    answerModel: "gpt-5-6-sol",
    env,
    fetchImpl: (async (u: string) => {
      urls.push(String(u));
      return ok("{}");
    }) as typeof fetch,
  });
  assert.ok(r);
  assert.equal(r.judgeModel, "cloudflare/@cf/zai-org/glm-5.3");
  assert.deepEqual(urls, ["https://api.cloudflare.com/client/v4/accounts/acc123/ai/v1/chat/completions"]);
  // Umuman kalit yo'q — null (throw emas).
  assert.equal(await callJudge({ system: "s", user: "u", answerModel: "x", env: {} }), null);
});

test("timeout / xato → keyingi hakam; yaroqsiz javob (accept) → keyingi", async () => {
  const seen: string[] = [];
  let n = 0;
  const fetchImpl = (async (_u: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { model: string };
    seen.push(body.model);
    n++;
    if (n === 1) {
      // 1-hakam osilib qoladi — timeout signali bilan uziladi.
      return await new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("timeout", "AbortError")));
      });
    }
    if (n === 2) return new Response("{}", { status: 429 });
    if (n === 3) return ok("bu JSON emas");
    return ok('<think>hmm</think>{"unsupported":[]}');
  }) as typeof fetch;
  const t0 = Date.now();
  const r = await callJudge({
    system: "s",
    user: "u",
    answerModel: "gpt-5-6-sol", // OpenAI → gpt-oss hakamlari o'tkaziladi
    env: ALL_KEYS,
    timeoutMs: 200,
    budgetMs: 5_000,
    accept: (t) => extractJson(t) !== null,
    fetchImpl,
  });
  assert.ok(Date.now() - t0 < 3_000, "timeout ishlamadi");
  assert.ok(r, "natija yo'q");
  assert.deepEqual(seen, ["qwen/qwen3.8-27b", "@cf/zai-org/glm-5.3", "@cf/deepseek-ai/deepseek-v4-flash-0731", "@cf/meta/llama-3.3-70b-instruct-fp8-fast"]);
  assert.equal(r.judgeVendor, "meta");
  assert.equal(r.text, '{"unsupported":[]}');
});

test("umumiy byudjet tugasa — to'xtaydi, null", async () => {
  let calls = 0;
  const r = await callJudge({
    system: "s",
    user: "u",
    answerModel: "claude-sonnet-5",
    env: ALL_KEYS,
    timeoutMs: 300,
    budgetMs: 700,
    fetchImpl: (async (_u: string, init?: RequestInit) => {
      calls++;
      return await new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("timeout", "AbortError")));
      });
    }) as typeof fetch,
  });
  assert.equal(r, null);
  assert.ok(calls <= 3, `byudjetdan ortiq chaqiruv: ${calls}`);
});

test("tashqi signal bekor qilinsa — null", async () => {
  const ac = new AbortController();
  ac.abort();
  const r = await callJudge({ system: "s", user: "u", answerModel: "x", env: ALL_KEYS, signal: ac.signal, fetchImpl: (async () => ok("{}")) as typeof fetch });
  assert.equal(r, null);
});

void (async () => {
  // AbortSignal.timeout taymeri unref — soxta "osilgan" fetch paytida jarayon yopilib qolmasin.
  const keepAlive = setInterval(() => {}, 1_000);
  for (const [name, fn] of queue) {
    try {
      await fn();
      passed++;
      console.log(`  ✓ ${name}`);
    } catch (e) {
      failed++;
      console.error(`  ✕ ${name}\n    ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  clearInterval(keepAlive);
  console.log(`\n${passed} o'tdi, ${failed} yiqildi`);
  if (failed) process.exit(1);
})();
