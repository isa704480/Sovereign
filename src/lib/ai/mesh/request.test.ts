/**
 * Mesh so'rov yordamchilari (web/CLI → RouteRequest, SOVEREIGN_MESH rejimi) va CLI yo'li
 * (meshComplete + haqiqiy scheduler/registry/health, soxta fetch — tarmoqsiz, kalitsiz):
 *   npx tsx --conditions=react-server src/lib/ai/mesh/request.test.ts
 */
import assert from "node:assert/strict";

for (const k of Object.keys(process.env)) {
  if (
    /^(OPENROUTER|GROQ|CLOUDFLARE|OMNIROUTE|RSI|CEREBRAS|SAMBANOVA|MISTRAL|NVIDIA|OPENAI|TELLA|EXPERIENTIAL|GATEWAY|LLM7|PERPLEXITY|UPSTASH)_/.test(k) ||
    k === "SOVEREIGN_MESH"
  ) {
    delete process.env[k];
  }
}
const env = process.env as Record<string, string | undefined>;

type Call = { url: string; body: Record<string, unknown> };
let calls: Call[] = [];
let replies: ((c: Call) => Response)[] = [];
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  const call = { url, body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {} };
  calls.push(call);
  const reply = replies.shift();
  return reply ? reply(call) : json(503, { error: { message: "no mock reply" } });
}) as typeof fetch;
Math.random = () => 0;

const host = (u: string) =>
  u.includes("api.groq.com") ? "groq" : u.includes("api.cloudflare.com") ? "cloudflare" : u.includes("llm7") ? "llm7" : u.includes("mistral") ? "mistral" : u.includes("openai.com") ? "openai" : u;

const completion = (model: string, message: Record<string, unknown>) =>
  json(200, {
    model,
    choices: [{ message: { role: "assistant", ...message }, finish_reason: "stop" }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  });

let passed = 0;
let failed = 0;
let resetHealth: () => void = () => {};
async function test(name: string, fn: () => Promise<void> | void) {
  calls = [];
  replies = [];
  await new Promise((r) => setTimeout(r, 5));
  resetHealth();
  try {
    await fn();
    passed++;
  } catch (e) {
    failed++;
    console.error(`✕ ${name}\n  ${(e as Error).message.split("\n").join("\n  ")}`);
  }
}

async function main() {
  const { meshMode, hasImageInput, webRouteRequest, cliRouteRequest, isGeneralAdapter, modelTierFor, requiredPlanTier } = await import("./request");
  const { plan: meshPlan, offerMinTier } = await import("./scheduler");
  const { meshComplete } = await import("./execute");
  const { ADAPTER_BY_ID } = await import("./registry");
  resetHealth = (await import("./health")).__resetHealthForTests;

  await test("meshMode: standart on; off/shadow bayrog'i", () => {
    delete env.SOVEREIGN_MESH;
    assert.equal(meshMode(), "on");
    env.SOVEREIGN_MESH = "OFF";
    assert.equal(meshMode(), "off");
    env.SOVEREIGN_MESH = "shadow";
    assert.equal(meshMode(), "shadow");
    env.SOVEREIGN_MESH = "whatever";
    assert.equal(meshMode(), "on");
    delete env.SOVEREIGN_MESH;
  });

  await test("hasImageInput: faqat image_url qismi", () => {
    assert.equal(hasImageInput([{ role: "user", content: "salom" }]), false);
    assert.equal(hasImageInput([{ role: "user", content: [{ type: "text", text: "a" }] }]), false);
    assert.equal(hasImageInput([{ role: "user", content: [{ type: "image_url", image_url: { url: "data:image/png;base64,AA" } }] }]), true);
    assert.equal(hasImageInput([null, { content: null }]), false);
  });

  await test("webRouteRequest: katalog tarifi narx chegarasi; Tella — faqat o'zi, rescue yo'q", () => {
    const haiku = webRouteRequest({ modelId: "claude-haiku-4-5", messages: [], country: null, freeRescue: true });
    assert.equal(haiku.planTier, "starter");
    assert.equal(haiku.modelTier, "starter");
    assert.equal(haiku.allowRescue, true);
    assert.equal(haiku.sameModelOnly, undefined);
    assert.equal(haiku.needs.stream, true);
    const tella = webRouteRequest({ modelId: "tella-2", messages: [], country: "UZ", freeRescue: true, ownModel: true });
    assert.equal(tella.sameModelOnly, true);
    assert.equal(tella.allowRescue, false);
    assert.equal(tella.country, "UZ");
    const omni = webRouteRequest({ modelId: "openrouter/moonshotai/kimi-k2.6", messages: [], country: undefined, freeRescue: false });
    assert.equal(omni.substituteTier, "free", "katalogga mos kelmaydigan id: o'rinbosar faqat tekin");
    assert.equal(omni.allowRescue, false);
    assert.equal(modelTierFor("no-such-model"), null, "noma'lum id — 'free' EMAS (offer tarifi)");
    // Foydalanuvchi tarifi uzatilsa — planTier o'sha, o'rinbosar chegarasi model tarifi.
    const proHaiku = webRouteRequest({ modelId: "claude-haiku-4-5", messages: [], country: null, planTier: "pro" });
    assert.equal(proHaiku.planTier, "pro");
    assert.equal(proHaiku.substituteTier, "starter");
  });

  await test("tarif oqishi (regress #1b): upstream nomi bilan Ultra model — web va CLI so'rovida Pro'ga aynan-model yo'q", () => {
    const adapters = Object.values(ADAPTER_BY_ID).map((a) => ({ ...a, enabled: () => true, offers: a.offers }));
    const health = new Map();
    for (const id of ["anthropic/claude-opus-5", "openrouter/anthropic/claude-opus-5", "dva/claude-opus-5-high"]) {
      assert.equal(requiredPlanTier(id), "ultra", `${id} → ultra`);
      const web = webRouteRequest({ modelId: id, messages: [], country: null, planTier: "pro" });
      const cli = cliRouteRequest({ chosen: id, planTier: "pro", country: null, tools: false, messages: [] });
      for (const r of [web, cli]) {
        const same = meshPlan(r, { adapters, health, rand: () => 0.5 }).filter((c) => c.sameModel);
        assert.deepEqual(same.map((c) => `${c.provider}:${c.offer.wire}`), [], `${id}: Pro'ga Ultra yo'l yo'q`);
      }
    }
    // Free: ':free' so'ralsa — pullik variant yo'q (regress #1a).
    const free = webRouteRequest({ modelId: "llama-3.3-free", messages: [], country: null, planTier: "free" });
    const got = meshPlan(free, { adapters, health, rand: () => 0.5 });
    assert.ok(got.length > 0);
    assert.deepEqual(got.filter((c) => offerMinTier(c.offer) !== "free").map((c) => `${c.provider}:${c.offer.wire}`), []);
    assert.ok(!got.some((c) => c.provider === "openrouter" && c.offer.wire === "meta-llama/llama-3.3-70b-instruct"));
    // Katalogda yo'q aniq model — kamida Pro (route darvozasi), katalog id — o'z tarifi, auto — free.
    assert.equal(requiredPlanTier("dva/some-unknown-model"), "pro");
    assert.equal(requiredPlanTier("groq/qwen/qwen3.8-27b"), "pro");
    assert.equal(requiredPlanTier("claude-haiku-4-5"), "starter");
    assert.equal(requiredPlanTier("auto/coding:free"), "free");
    assert.equal(modelTierFor("meta-llama/llama-3.3-70b-instruct:free"), "free");
    assert.equal(modelTierFor("meta-llama/llama-3.3-70b-instruct"), "starter", "':free'siz — pullik variant tarifi");
    assert.equal(modelTierFor("groq/qwen/qwen3.8-27b"), null, "to'g'ridan-to'g'ri host yo'li — offer tarifi");
  });

  await test("cliRouteRequest: tanlanmasa 'code' sinfi; tool'li so'rovda rescue yo'q", () => {
    const auto = cliRouteRequest({ planTier: "free", country: null, tools: true, messages: [] });
    assert.equal(auto.class, "code");
    assert.equal(auto.sovereignModelId, undefined);
    assert.deepEqual(auto.needs, { tools: true, stream: false, vision: false });
    assert.equal(auto.allowRescue, false);
    const chosen = cliRouteRequest({ chosen: "auto/coding:free", planTier: "pro", country: "RU", tools: false, messages: [] });
    assert.equal(chosen.sovereignModelId, "auto/coding:free");
    assert.equal(chosen.class, undefined);
    assert.equal(chosen.allowRescue, true);
  });

  await test("isGeneralAdapter: LLM7 (rescue), Tella va Perplexity umumiy chat provayderi emas", () => {
    assert.equal(isGeneralAdapter(ADAPTER_BY_ID.llm7), false);
    assert.equal(isGeneralAdapter(ADAPTER_BY_ID.tella), false);
    assert.equal(isGeneralAdapter(ADAPTER_BY_ID.perplexity), false);
    assert.equal(isGeneralAdapter(ADAPTER_BY_ID.groq), true);
    assert.equal(isGeneralAdapter(ADAPTER_BY_ID.cloudflare), true);
  });

  await test("CLI: tool'li so'rov LLM7'ga bormaydi; tool_calls o'zgarmasdan qaytadi", async () => {
    env.GROQ_API_KEY = "test-groq";
    replies = [
      () => json(429, { error: { message: "Rate limit reached (TPM)" } }),
      (c) => completion(String(c.body.model), { content: null, tool_calls: [{ id: "call_1", type: "function", function: { name: "read_file", arguments: "{}" } }] }),
    ];
    const tools = [{ type: "function", function: { name: "read_file", parameters: {} } }];
    const r = await meshComplete({
      req: cliRouteRequest({ planTier: "free", country: null, tools: true, messages: [] }),
      body: { messages: [{ role: "user", content: "fayl o'qi" }], tools, tool_choice: "auto", temperature: 0.4, max_tokens: 512 },
    });
    delete env.GROQ_API_KEY;
    assert.ok(r.ok, "javob bo'lishi kerak");
    assert.ok(calls.every((c) => host(c.url) === "groq"), calls.map((c) => host(c.url)).join(","));
    assert.equal(calls.length, 2, "429 dan keyin boshqa Groq modeli (alohida TPM bucket)");
    assert.notEqual(calls[0].body.model, calls[1].body.model);
    assert.equal(calls[0].body.stream, false);
    assert.deepEqual(calls[0].body.tools, tools);
    if (r.ok) {
      assert.equal((r.message as { tool_calls?: unknown[] }).tool_calls?.length, 1);
      assert.equal(r.provider, "groq");
      assert.match(r.model, /^groq\//);
      assert.equal(r.usage?.prompt_tokens, 10);
    }
  });

  await test("CLI: tekin tarifda pullik o'rinbosar (OpenAI) tanlanmaydi, Pro'da tanlanadi", async () => {
    env.OPENAI_API_KEY = "test-openai";
    const req = (planTier: "free" | "pro") => cliRouteRequest({ planTier, country: null, tools: true, messages: [] });
    const free = await meshComplete({ req: req("free"), body: { messages: [{ role: "user", content: "x" }], max_tokens: 64 } });
    assert.equal(free.ok, false);
    assert.equal(calls.length, 0, "free: nomzod yo'q");
    replies = [(c) => completion(String(c.body.model), { content: "ok" })];
    const pro = await meshComplete({ req: req("pro"), body: { messages: [{ role: "user", content: "x" }], max_tokens: 64 } });
    delete env.OPENAI_API_KEY;
    assert.ok(pro.ok);
    assert.equal(host(calls[0].url), "openai");
  });

  await test("CLI: mintaqa RU — Mistral (egasi cheklangan) chaqirilmaydi", async () => {
    env.MISTRAL_API_KEY = "test-mistral";
    const ask = (country: string | null) =>
      meshComplete({
        req: cliRouteRequest({ planTier: "pro", country, tools: true, messages: [] }),
        body: { messages: [{ role: "user", content: "x" }], max_tokens: 64 },
      });
    const ru = await ask("RU");
    assert.equal(ru.ok, false);
    assert.equal(calls.length, 0, "RU: Mistral ham, LLM7 ham chaqirilmaydi");
    replies = [(c) => completion(String(c.body.model), { content: "ok" })];
    const uz = await ask(null);
    delete env.MISTRAL_API_KEY;
    assert.ok(uz.ok);
    assert.equal(host(calls[0].url), "mistral");
  });

  console.log(`request.test: ${passed} o'tdi, ${failed} yiqildi`);
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
