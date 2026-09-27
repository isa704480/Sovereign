/**
 * Provayder zanjiri — soxta fetch bilan (tarmoqsiz, kalitsiz):
 *   npx tsx --conditions=react-server src/lib/ai/providers-chain.test.ts
 * Groq → Cloudflare, OpenRouter 402 → Cloudflare, neuron limiti (4006), oqimsiz gpt-oss,
 * "served" (badge) va mintaqa qoidalari tekshiriladi. Haqiqiy kalitlar ishlatilmaydi.
 */
import assert from "node:assert/strict";

// Env — faqat soxta qiymatlar; haqiqiy .env.local o'qilmaydi.
for (const k of Object.keys(process.env)) {
  if (/^(OPENROUTER|GROQ|CLOUDFLARE|OMNIROUTE|RSI|CEREBRAS|SAMBANOVA|MISTRAL|NVIDIA|OPENAI|TELLA|EXPERIENTIAL|GATEWAY|LLM7|PERPLEXITY)_/.test(k)) {
    delete process.env[k];
  }
}
const env = process.env as Record<string, string | undefined>;

type Call = { url: string; body: Record<string, unknown> };
let calls: Call[] = [];
type Reply = (call: Call) => Response;
let replies: Reply[] = [];

function sse(model: string, text: string): Response {
  const lines = [
    `data: ${JSON.stringify({ model, choices: [{ delta: { content: text }, finish_reason: null }] })}`,
    `data: ${JSON.stringify({ model, choices: [{ delta: {}, finish_reason: "stop" }] })}`,
    "data: [DONE]",
    "",
  ].join("\n");
  return new Response(lines, { status: 200, headers: { "content-type": "text/event-stream" } });
}
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
  const call = { url, body };
  calls.push(call);
  const reply = replies.shift();
  if (!reply) return json(503, { error: { message: "no mock reply" } });
  return reply(call);
}) as typeof fetch;

const host = (u: string) =>
  u.includes("api.groq.com")
    ? "groq"
    : u.includes("api.cloudflare.com")
      ? "cloudflare"
      : u.includes("openrouter.ai")
        ? "openrouter"
        : u.includes("llm7")
          ? "llm7"
          : u;

let passed = 0;
let failed = 0;
async function test(name: string, fn: () => Promise<void>) {
  calls = [];
  replies = [];
  try {
    await fn();
    passed++;
  } catch (e) {
    failed++;
    console.error(`✕ ${name}\n  ${(e as Error).message.split("\n").join("\n  ")}`);
  }
}

async function main() {
  const { streamCompletion, hostIdAvailable, hasKeyFor } = await import("./providers");
  const { MODEL_BY_ID } = await import("@/config/models");

  async function run(modelId: string, extra: { country?: string; freeRescue?: boolean } = {}) {
    const events: { type: string; [k: string]: unknown }[] = [];
    for await (const ev of streamCompletion({
      modelId,
      messages: [{ role: "user", content: "salom" }],
      lang: "en",
      freeRescue: extra.freeRescue ?? false,
      country: extra.country ?? null,
    })) {
      events.push(ev as { type: string });
    }
    const served = events.find((e) => e.type === "served") as { model: string; substituted: boolean; rescue?: boolean } | undefined;
    const text = events.filter((e) => e.type === "text").map((e) => e.text).join("");
    const error = events.find((e) => e.type === "error") as { message: string } | undefined;
    return { events, served, text, error };
  }

  // process.env'ga undefined berilsa "undefined" satri yoziladi — shuning uchun delete.
  const put = (k: string, v: string | false | undefined) => {
    if (v) env[k] = v;
    else delete env[k];
  };
  const setKeys = (keys: { groq?: boolean; cf?: boolean; or?: boolean }) => {
    put("GROQ_API_KEY", keys.groq && "test-groq");
    put("CLOUDFLARE_ACCOUNT_ID", keys.cf && "acc123");
    put("CLOUDFLARE_AI_TOKEN", keys.cf && "test-cf");
    put("OPENROUTER_API_KEY", keys.or && "test-or");
  };

  await test("Cloudflare faqat ikkala env bo'lsa yoqiladi", async () => {
    setKeys({ groq: true });
    env.CLOUDFLARE_ACCOUNT_ID = "acc123";
    assert.equal(hostIdAvailable("cloudflare/@cf/qwen/qwen3.8-27b"), false);
    setKeys({ groq: true, cf: true });
    assert.equal(hostIdAvailable("cloudflare/@cf/qwen/qwen3.8-27b"), true);
    assert.equal(hostIdAvailable("groq/qwen/qwen3.8-27b"), true);
    setKeys({ cf: true });
    assert.equal(hostIdAvailable("groq/qwen/qwen3.8-27b"), false, "Groq kaliti yo'q, OmniRoute yo'q");
    // OpenRouter kaliti yo'q: Cloudflare'da aynan shu model bor → mavjud; Claude — yo'q.
    assert.equal(hasKeyFor(MODEL_BY_ID["deepseek-v4-pro"]), true);
    assert.equal(hasKeyFor(MODEL_BY_ID["claude-sonnet-5"]), false);
  });

  await test("tekin: Groq 429 → Cloudflare (Llama 3.3 70B), badge haqiqiy modelni ko'rsatadi", async () => {
    setKeys({ groq: true, cf: true });
    replies = [
      () => json(429, { error: { message: "Rate limit reached for model openai/gpt-oss-120b" } }),
      (c) => sse(String(c.body.model), "Salom!"),
    ];
    const r = await run("llama-3.3-free");
    assert.deepEqual(calls.map((c) => host(c.url)), ["groq", "cloudflare"]);
    assert.equal(calls[1].url, "https://api.cloudflare.com/client/v4/accounts/acc123/ai/v1/chat/completions");
    assert.equal(calls[1].body.model, "@cf/meta/llama-3.3-70b-instruct-fp8-fast");
    assert.equal(calls[1].body.stream, true);
    assert.equal(r.text, "Salom!");
    assert.deepEqual(r.served, { type: "served", model: "cloudflare/@cf/meta/llama-3.3-70b-instruct-fp8-fast", substituted: false });
  });

  await test("host id: groq/qwen 429 → Cloudflare'dagi aynan shu Qwen", async () => {
    setKeys({ groq: true, cf: true });
    replies = [() => json(429, { error: { message: "rate limit" } }), (c) => sse("whatever", `ok:${c.body.model}`)];
    const r = await run("groq/qwen/qwen3.8-27b");
    assert.deepEqual(calls.map((c) => host(c.url)), ["groq", "cloudflare"]);
    assert.equal(calls[0].body.model, "qwen/qwen3.8-27b");
    assert.equal(r.served?.model, "cloudflare/@cf/qwen/qwen3.8-27b");
    assert.equal(r.served?.substituted, false);
  });

  await test("pullik: DeepSeek V4 Pro — Cloudflare birinchi (OpenRouter chaqirilmaydi)", async () => {
    setKeys({ groq: true, cf: true, or: true });
    replies = [(c) => sse(String(c.body.model), "javob")];
    const r = await run("deepseek-v4-pro");
    assert.deepEqual(calls.map((c) => host(c.url)), ["cloudflare"]);
    assert.equal(calls[0].body.model, "@cf/deepseek-ai/deepseek-v4-pro-0813");
    assert.deepEqual(r.served, { type: "served", model: "cloudflare/@cf/deepseek-ai/deepseek-v4-pro-0813", substituted: false });
  });

  await test("Cloudflare neuron limiti (4006) → shu model OpenRouter orqali", async () => {
    setKeys({ cf: true, or: true });
    replies = [
      () => json(429, { errors: [{ code: 4006, message: "you have used up your daily free allocation of 10,000 neurons" }], success: false }),
      () => sse("deepseek/deepseek-v4-pro", "javob"),
    ];
    const r = await run("deepseek-v4-pro");
    assert.deepEqual(calls.map((c) => host(c.url)), ["cloudflare", "openrouter"]);
    assert.equal(r.text, "javob");
    assert.equal(r.served?.model, "deepseek/deepseek-v4-pro");
  });

  await test("pullik: Claude + OpenRouter 402 → Cloudflare flagship ekvivalenti, almashtirish ochiq belgilanadi", async () => {
    setKeys({ cf: true, or: true });
    replies = [() => json(402, { error: { code: 402, message: "credits" } }), (c) => sse(String(c.body.model), "javob")];
    const r = await run("claude-sonnet-5");
    assert.deepEqual(calls.map((c) => host(c.url)), ["openrouter", "cloudflare"]);
    assert.equal(calls[1].body.model, "@cf/deepseek-ai/deepseek-v4-pro-0813");
    assert.equal(r.served?.model, "cloudflare/@cf/deepseek-ai/deepseek-v4-pro-0813");
    assert.equal(r.served?.substituted, true);
  });

  await test("narx nazorati: Starter modeli (Claude Haiku) 402 → DeepSeek V4 Flash, Pro emas", async () => {
    setKeys({ cf: true, or: true });
    replies = [() => json(402, { error: { code: 402, message: "credits" } }), (c) => sse(String(c.body.model), "ok")];
    await run("claude-haiku-4-5");
    assert.equal(calls[1]?.body.model, "@cf/deepseek-ai/deepseek-v4-flash-0731");
  });

  await test("OpenRouter 200 + birinchi bo'lakda kredit xatosi → Cloudflare", async () => {
    setKeys({ cf: true, or: true });
    replies = [
      () =>
        new Response(`data: ${JSON.stringify({ error: { code: 402, message: "Insufficient credits" } })}\n\n`, {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        }),
      (c) => sse(String(c.body.model), "ok"),
    ];
    // Cloudflare'da yo'q model (Claude) — avval OpenRouter, u "200 + kredit xatosi" bersa Cloudflare ekvivalenti.
    const r = await run("claude-sonnet-5");
    assert.deepEqual(calls.map((c) => host(c.url)), ["openrouter", "cloudflare"]);
    assert.equal(calls[1]?.body.model, "@cf/deepseek-ai/deepseek-v4-pro-0813");
    assert.equal(r.served?.model, "cloudflare/@cf/deepseek-ai/deepseek-v4-pro-0813");
    assert.equal(r.served?.substituted, true);
    assert.equal(r.text, "ok");
  });

  await test("Cloudflare neuron limiti (429/4006) — yumshoq xato, qayta Cloudflare'ga bormaydi", async () => {
    setKeys({ cf: true });
    replies = [
      () => json(429, { errors: [{ code: 4006, message: "you have used up your daily free allocation of 10,000 neurons" }], success: false }),
    ];
    const r = await run("cloudflare/@cf/qwen/qwen3.8-27b");
    assert.equal(calls.length, 1);
    assert.ok(r.error, "chat route keyingi nomzodga o'tishi uchun error");
    assert.match(r.error!.message, /busy|band|занят/i);
  });

  await test("neuron limiti + oxirgi nomzod: Cloudflare rescue o'tkazib yuboriladi, LLM7 ishlaydi", async () => {
    setKeys({ cf: true });
    replies = [
      () => json(429, { errors: [{ code: 4006, message: "daily free allocation of 10,000 neurons" }] }),
      (c) => sse("mistral-nemo", `llm7:${c.body.model}`),
    ];
    const r = await run("cloudflare/@cf/qwen/qwen3.8-27b", { freeRescue: true });
    assert.deepEqual(calls.map((c) => host(c.url)), ["cloudflare", "llm7"]);
    assert.equal(r.served?.rescue, true);
  });

  await test("gpt-oss: stream=false, JSON javob bitta matn bo'lib chiqadi (reasoning alohida)", async () => {
    setKeys({ cf: true });
    replies = [
      () =>
        json(200, {
          model: "@cf/openai/gpt-oss-120b",
          choices: [{ message: { content: "To'liq javob", reasoning_content: "fikr" }, finish_reason: "stop" }],
        }),
    ];
    const r = await run("cloudflare/@cf/openai/gpt-oss-120b");
    assert.equal(calls[0].body.stream, false);
    assert.equal(r.text, "To'liq javob");
    assert.ok(r.events.some((e) => e.type === "reasoning" && e.text === "fikr"));
    assert.equal(r.served?.model, "cloudflare/@cf/openai/gpt-oss-120b");
  });

  await test("400 (so'rov yaroqsiz) — zanjir aylanmaydi", async () => {
    setKeys({ groq: true, cf: true });
    replies = [() => json(400, { error: { message: "context length exceeded" } })];
    const r = await run("llama-3.3-free");
    assert.equal(calls.length, 1);
    assert.ok(r.error);
  });

  await test("mintaqa: RU — Cloudflare DeepSeek ochiq; IR — Cloudflare yopiq, so'rov yuborilmaydi", async () => {
    setKeys({ cf: true });
    replies = [(c) => sse(String(c.body.model), "ok")];
    const ru = await run("cloudflare/@cf/deepseek-ai/deepseek-v4-pro-0813", { country: "RU" });
    assert.equal(ru.text, "ok");
    calls = [];
    const ir = await run("cloudflare/@cf/deepseek-ai/deepseek-v4-pro-0813", { country: "IR" });
    assert.equal(calls.length, 0);
    assert.ok(ir.error);
  });

  await test("Cloudflare kaliti yo'q — cloudflare/ id xato beradi (OmniRoute'ga yuborilmaydi)", async () => {
    setKeys({ groq: true });
    env.OMNIROUTE_BASE_URL = "https://omni.test";
    env.OMNIROUTE_API_KEY = "x";
    const r = await run("cloudflare/@cf/qwen/qwen3.8-27b");
    delete env.OMNIROUTE_BASE_URL;
    delete env.OMNIROUTE_API_KEY;
    assert.equal(calls.length, 0);
    assert.ok(r.error);
  });

  console.log(`${passed} o'tdi, ${failed} yiqildi`);
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
