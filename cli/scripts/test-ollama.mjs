// Deterministik test: cli/src/ollama.mjs + agent.mjs mahalliy tarmog'i (fetch mock, tarmoqsiz).
// Ishga tushirish: node cli/scripts/test-ollama.mjs
import assert from "node:assert/strict";
import {
  OLLAMA_BASE,
  MODEL_NAME_RE,
  isValidModelName,
  detect,
  capabilities,
  chat,
  recommend,
  classifyServerError,
  fitToContext,
} from "../src/ollama.mjs";
import { agentTurn } from "../src/agent.mjs";
import { normalizeSetting } from "../src/config.mjs";
import { parseLocalModelId, resolveModelId } from "../src/models.mjs";

const ALLOWED = new Set(["/api/version", "/api/tags", "/api/show", "/v1/chat/completions"]);
let calls = [];
let handler = () => new Response("no handler", { status: 500 });
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), init });
  return handler(String(url), init);
};

const json = (obj, status = 200, headers = {}) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...headers } });
const sse = (chunks) => {
  const enc = new TextEncoder();
  const body = new ReadableStream({
    start(ctrl) {
      for (const ch of chunks) ctrl.enqueue(enc.encode(`data: ${JSON.stringify(ch)}\n\n`));
      ctrl.enqueue(enc.encode("data: [DONE]\n\n"));
      ctrl.close();
    },
  });
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
};
const netError = () => Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } });

/** Har bir Ollama chaqiruvi: faqat loopback, faqat ruxsat etilgan yo'l, redirect:error, Authorization yo'q. */
function assertLocalCallsSafe() {
  for (const c of calls) {
    const u = new URL(c.url);
    if (u.origin !== OLLAMA_BASE) continue;
    assert.ok(ALLOWED.has(u.pathname), `taqiqlangan endpoint: ${u.pathname}`);
    assert.equal(c.init.redirect, "error", "redirect: error bo'lishi shart");
    const h = c.init.headers ?? {};
    assert.ok(!Object.keys(h).some((k) => k.toLowerCase() === "authorization"), "Ollama'ga Authorization ketmasin");
  }
}

let passed = 0;
async function test(name, fn) {
  calls = [];
  try {
    await fn();
    assertLocalCallsSafe();
    passed++;
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✕ ${name}\n`, err);
    process.exitCode = 1;
  }
}

const quiet = async (fn) => {
  const log = console.log;
  console.log = () => {};
  try {
    return await fn();
  } finally {
    console.log = log;
  }
};

await test("model nomi regex", () => {
  for (const ok of ["qwen2.5-coder:7b", "llama3.2:3b", "hf.co/user/model:Q4_K_M", "gpt-oss:20b"]) assert.ok(isValidModelName(ok), ok);
  for (const bad of ["", "a b", "x;rm -rf", "\u001b[31mred", "a".repeat(101), "../../etc", "m\nn", "a?b", "a#b", "a%2e"]) {
    assert.ok(!isValidModelName(bad), JSON.stringify(bad));
  }
  assert.equal(String(MODEL_NAME_RE), String(/^[A-Za-z0-9._:/-]{1,100}$/));
});

await test("detect: modellar, g'alati nomlar tashlanadi", async () => {
  handler = (url) => {
    if (url.endsWith("/api/version")) return json({ version: "0.12.3" });
    if (url.endsWith("/api/tags"))
      return json({
        models: [
          { name: "qwen2.5-coder:7b", size: 4.7e9, details: { family: "qwen2", parameter_size: "7.6B", quantization_level: "Q4_K_M" } },
          { name: "evil\u001b[2Jname", size: 1 },
        ],
      });
    return json({}, 404);
  };
  const d = await detect();
  assert.equal(d.available, true);
  assert.equal(d.version, "0.12.3");
  assert.deepEqual(d.models, [{ name: "qwen2.5-coder:7b", size: 4.7e9, paramSize: "7.6B", quant: "Q4_K_M", family: "qwen2" }]);
  assert.ok(calls.every((c) => c.url.startsWith("http://127.0.0.1:11434/")));
});

await test("detect: Ollama o'chiq → available:false", async () => {
  handler = () => {
    throw netError();
  };
  assert.deepEqual(await detect(), { available: false, version: null, models: [] });
});

await test("capabilities: tools/vision/context", async () => {
  handler = (url, init) => {
    assert.ok(url.endsWith("/api/show"));
    assert.equal(JSON.parse(init.body).model, "qwen3:8b");
    return json({ capabilities: ["completion", "tools"], model_info: { "qwen3.context_length": 40960 }, parameters: "temperature 0.6\nnum_ctx 16384" });
  };
  assert.deepEqual(await capabilities("qwen3:8b"), { tools: true, vision: false, contextLength: 40960, numCtx: 16384, known: true });
  calls = [];
  assert.equal((await capabilities("bad name")).known, false);
  assert.equal(calls.length, 0, "noto'g'ri nom bilan so'rov yuborilmaydi");
});

await test("chat: oqim, index'siz tool_call, usage", async () => {
  handler = (url, init) => {
    assert.equal(url, "http://127.0.0.1:11434/v1/chat/completions");
    const b = JSON.parse(init.body);
    assert.equal(b.model, "qwen2.5-coder:7b");
    assert.equal(b.stream, true);
    assert.equal(b.tools.length, 1);
    return sse([
      { choices: [{ delta: { content: "Sal" } }] },
      { choices: [{ delta: { content: "om" } }] },
      { choices: [{ delta: { tool_calls: [{ function: { name: "list_dir", arguments: { path: "." } } }] } }] },
      { choices: [], usage: { prompt_tokens: 10, completion_tokens: 5 } },
    ]);
  };
  let streamed = "";
  const r = await chat({ model: "qwen2.5-coder:7b", messages: [{ role: "user", content: "hi" }], tools: [{ type: "function", function: { name: "list_dir" } }], onText: (t) => (streamed += t) });
  assert.equal(streamed, "Salom");
  assert.equal(r.message.content, "Salom");
  assert.equal(r.toolCalls.length, 1);
  assert.equal(r.toolCalls[0].id, "call_local_0");
  assert.equal(r.toolCalls[0].function.arguments, '{"path":"."}');
  assert.deepEqual(r.usage, { prompt_tokens: 10, completion_tokens: 5 });
});

await test("chat: noto'g'ri model nomi — so'rov yo'q", async () => {
  await assert.rejects(chat({ model: "x y", messages: [] }), /noto'g'ri/);
  assert.equal(calls.length, 0);
});

await test("chat: 404 → ollama pull ko'rsatmasi, local xato", async () => {
  handler = () => json({ error: { message: 'model "qwen3:4b" not found' } }, 404);
  await assert.rejects(chat({ model: "qwen3:4b", messages: [{ role: "user", content: "a" }], stream: false }), (e) => {
    assert.match(e.message, /ollama pull qwen3:4b/);
    assert.equal(classifyServerError(e), null, "Ollama xatosi zaxirani qayta chaqirmaydi");
    return true;
  });
});

await test("fitToContext: system saqlanadi, tail user'dan boshlanadi", () => {
  const big = "x".repeat(7000);
  const msgs = [
    { role: "system", content: "S" },
    { role: "user", content: big },
    { role: "assistant", content: big },
    { role: "tool", tool_call_id: "1", content: big },
    { role: "user", content: "oxirgi" },
    { role: "assistant", content: "ok" },
  ];
  const out = fitToContext(msgs, 3000, 500);
  assert.equal(out[0].role, "system");
  assert.equal(out[1].role, "user");
  assert.equal(out[1].content, "oxirgi");
  assert.deepEqual(fitToContext(msgs, 0), msgs);
});

await test("recommend: RAM/VRAM jadvali", () => {
  assert.deepEqual(recommend(8).map((r) => r.name), ["qwen3:4b", "llama3.2:3b"]);
  assert.deepEqual(recommend(16).map((r) => r.name), ["qwen2.5-coder:7b", "qwen3:8b", "llama3.1:8b"]);
  assert.deepEqual(recommend(32).map((r) => r.name), ["qwen2.5-coder:14b", "qwen3:14b", "gpt-oss:20b"]);
  assert.deepEqual(recommend(16, 12).map((r) => r.name)[0], "qwen2.5-coder:14b");
  assert.deepEqual(recommend(64).map((r) => r.name), ["qwen2.5-coder:32b", "qwen3:32b"]);
  assert.deepEqual(recommend(16, 24)[0].tier, 4);
  assert.ok(recommend(4)[0].why.includes("xotira kam"));
  for (const r of recommend(16)) assert.ok(r.why && r.quality);
});

await test("classifyServerError jadvali", () => {
  const cases = [
    [{ status: 402 }, "user_limit"],
    [{ status: 429 }, "user_limit"],
    [{ status: 429, retryAfter: "30" }, "rate_limited"],
    [{ status: 429, retryAfter: "30", code: "user_limit" }, "user_limit"],
    [{ status: 429, code: "rate_limited" }, "rate_limited"],
    [{ status: 451, code: "region" }, null],
    [{ status: 451 }, null],
    [{ status: 401 }, "auth"],
    [{ status: 403 }, "auth"],
    [{ status: 500 }, "server"],
    [{ status: 502 }, "server"],
    [{ status: 503 }, "server"],
    [{ status: 400 }, null],
    [{ status: 413 }, null],
    [netError(), "offline"],
    [Object.assign(new Error("x"), { code: "ENOTFOUND" }), "offline"],
    [Object.assign(new Error("t"), { name: "TimeoutError" }), "offline"],
    [Object.assign(new Error("a"), { name: "AbortError" }), null],
    [new Error("boshqa"), null],
    [null, null],
  ];
  for (const [err, want] of cases) assert.equal(classifyServerError(err), want, JSON.stringify(err));
});

await test("config/models yordamchilari", () => {
  assert.deepEqual(normalizeSetting("localFallback", "auto"), { ok: true, value: "auto" });
  assert.equal(normalizeSetting("localFallback", "yes").ok, false);
  assert.deepEqual(normalizeSetting("inquiry", "always"), { ok: true, value: "always" });
  assert.equal(normalizeSetting("inquiry", "sometimes").ok, false);
  assert.equal(normalizeSetting("localModel", "qwen3:8b").ok, true);
  assert.equal(normalizeSetting("localModel", "a b").ok, false);
  assert.equal(parseLocalModelId("local:qwen2.5-coder:7b"), "qwen2.5-coder:7b");
  assert.equal(parseLocalModelId("ollama:llama3.2:3b"), "llama3.2:3b");
  assert.equal(parseLocalModelId("local:bad name"), null);
  assert.equal(parseLocalModelId("openai/gpt-4o"), null);
  assert.equal(resolveModelId("local:qwen3:8b"), "local:qwen3:8b");
});

// ---------- agentTurn integratsiyasi ----------
const SERVER = "https://api.example.test";
const baseConfig = () => ({ baseUrl: SERVER, token: "tok_test", localModel: "", localFallback: "ask" });
const localText = (text) =>
  sse([{ choices: [{ delta: { content: text } }] }, { choices: [], usage: { prompt_tokens: 3, completion_tokens: 2 } }]);
const showTools = () => json({ capabilities: ["completion", "tools"], model_info: {} });

await test("agent: 402 → onLimit(user_limit) → mahalliy model, hakam chaqirilmaydi", async () => {
  const seen = [];
  handler = (url) => {
    if (url.startsWith(SERVER)) return json({ error: "Oylik limit" }, 402);
    if (url.endsWith("/api/show")) return showTools();
    if (url.endsWith("/v1/chat/completions")) return localText("Mahalliy javob");
    return json({}, 404);
  };
  const config = { ...baseConfig(), onLimit: async (info) => (seen.push(info), "qwen2.5-coder:7b") };
  const res = await quiet(() => agentTurn({ messages: [{ role: "user", content: "salom" }], config, confirm: async () => true, print: false }));
  assert.equal(res.done, true);
  assert.equal(res.final, "Mahalliy javob");
  assert.equal(res.local, "qwen2.5-coder:7b");
  assert.equal(res.usage.local, "qwen2.5-coder:7b");
  assert.deepEqual(seen.map((s) => s.kind), ["user_limit"]);
  const server = calls.filter((c) => c.url.startsWith(SERVER));
  assert.equal(server.length, 1, "server faqat bir marta (limit xatosi) — verify/boshqa chaqiruv yo'q");
  assert.equal(config.local.tools, true);
});

await test("agent: 401 → onLimit chaqirilmaydi (auth)", async () => {
  let called = 0;
  handler = (url) => (url.startsWith(SERVER) ? json({ error: "Token yaroqsiz" }, 401) : json({}, 404));
  const config = { ...baseConfig(), onLimit: async () => (called++, "qwen3:8b") };
  const res = await quiet(() => agentTurn({ messages: [{ role: "user", content: "x" }], config, confirm: async () => true, print: false }));
  assert.equal(called, 0);
  assert.equal(res.error, "Token yaroqsiz");
  assert.equal(res.errorKind, "auth");
  assert.ok(!calls.some((c) => c.url.startsWith(OLLAMA_BASE)));
});

await test("agent: localFallback=off → onLimit chaqirilmaydi", async () => {
  let called = 0;
  handler = (url) => (url.startsWith(SERVER) ? json({ error: "limit" }, 402) : json({}, 404));
  const config = { ...baseConfig(), localFallback: "off", onLimit: async () => (called++, "qwen3:8b") };
  const res = await quiet(() => agentTurn({ messages: [{ role: "user", content: "x" }], config, confirm: async () => true, print: false }));
  assert.equal(called, 0);
  assert.equal(res.errorKind, "user_limit");
});

await test("agent: 5xx — 1-marta qayta urinish, 2-marta ketma-ket → taklif", async () => {
  const kinds = [];
  let serverHits = 0;
  handler = (url) => {
    if (url.startsWith(SERVER)) return serverHits++, json({ error: "busy" }, 502);
    if (url.endsWith("/api/show")) return json({ capabilities: ["completion"] }); // tools yo'q
    if (url.endsWith("/v1/chat/completions")) return localText("ok");
    return json({}, 404);
  };
  const config = { ...baseConfig(), onLimit: async (i) => (kinds.push(i.kind), true), localModel: "llama3.2:3b" };
  const res = await quiet(() => agentTurn({ messages: [{ role: "user", content: "x" }], config, confirm: async () => true, print: false }));
  assert.equal(serverHits, 2);
  assert.deepEqual(kinds, ["server"]);
  assert.equal(res.final, "ok");
  const chatCall = calls.find((c) => c.url.endsWith("/v1/chat/completions"));
  assert.equal(JSON.parse(chatCall.init.body).tools, undefined, "tools qo'llanmasa — vositasiz yuboriladi");
});

await test("agent: offline → onLimit rad etsa, xato qaytadi", async () => {
  handler = (url) => {
    if (url.startsWith(SERVER)) throw netError();
    return json({}, 404);
  };
  const config = { ...baseConfig(), onLimit: async () => null };
  const res = await quiet(() => agentTurn({ messages: [{ role: "user", content: "x" }], config, confirm: async () => true, print: false }));
  assert.equal(res.errorKind, "offline");
  assert.equal(res.local, null);
});

await test("agent: config.local — serverga hech narsa ketmaydi, tool sikli ishlaydi", async () => {
  let round = 0;
  handler = (url) => {
    if (url.endsWith("/api/show")) return showTools();
    if (url.endsWith("/v1/chat/completions")) {
      round++;
      if (round === 1) return sse([{ choices: [{ delta: { tool_calls: [{ index: 0, id: "c1", function: { name: "list_dir", arguments: "{}" } }] } }] }]);
      return localText("Papka ko'rildi");
    }
    return json({}, 500);
  };
  const config = { ...baseConfig(), local: { model: "qwen2.5-coder:7b" } };
  const res = await quiet(() => agentTurn({ messages: [{ role: "user", content: "papkani ko'r" }], config, confirm: async () => true, print: false }));
  assert.equal(res.final, "Papka ko'rildi");
  assert.equal(round, 2);
  assert.ok(!calls.some((c) => !c.url.startsWith(OLLAMA_BASE)), "mahalliy rejimda faqat 127.0.0.1");
});

await test("agent: noto'g'ri mahalliy model nomi — so'rovsiz xato", async () => {
  const config = { ...baseConfig(), local: "bad name" };
  const res = await quiet(() => agentTurn({ messages: [{ role: "user", content: "x" }], config, confirm: async () => true, print: false }));
  assert.match(res.error, /Mahalliy model/);
  assert.equal(calls.length, 0);
});

console.log(process.exitCode ? `\n✕ ba'zi testlar yiqildi (${passed} o'tdi)` : `\n✓ ${passed} ta test o'tdi`);
