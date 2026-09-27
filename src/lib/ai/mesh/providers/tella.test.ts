/**
 * Lokal test (tarmoqsiz, kalitsiz): npx tsx --conditions=react-server src/lib/ai/mesh/providers/tella.test.ts
 * Tella (o'z modelimiz, Ollama/vLLM) adapteri: env aniqlash, endpoint, offer, tana, served va classifyError.
 */
import assert from "node:assert/strict";
import { TELLA_BUSY_RETRY_MS, classifyTella, readTellaServedModel, tellaAdapter, tellaWire } from "./tella";
import { isSubstitution } from "../../served";
import { modelAllowedIn, hostAllowedIn } from "../../region";

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

const ENV_KEYS = ["TELLA_BASE_URL", "TELLA_MODEL", "TELLA_API_KEY"];
const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
function withEnv(env: Record<string, string | undefined>, fn: () => void) {
  for (const k of ENV_KEYS) delete process.env[k];
  for (const [k, v] of Object.entries(env)) if (v !== undefined) process.env[k] = v;
  try {
    fn();
  } finally {
    for (const k of ENV_KEYS) delete process.env[k];
  }
}

const NOW = Date.UTC(2026, 8, 27, 12, 0, 0);
const H = (h: Record<string, string> = {}) => new Headers(h);
/** Ollama OpenAI-mos xato tanasi. */
const ollama = (message: string, type = "api_error") => JSON.stringify({ error: { message, type, param: null, code: null } });
/** vLLM xato tanasi. */
const vllm = (message: string, code: number, type = "BadRequestError") => JSON.stringify({ object: "error", message, type, param: null, code });

/* ---------------- env / endpoint ---------------- */

test("enabled(): faqat TELLA_BASE_URL bilan (kalit ixtiyoriy)", () => {
  withEnv({}, () => assert.equal(tellaAdapter.enabled(), false));
  withEnv({ TELLA_BASE_URL: "   " }, () => assert.equal(tellaAdapter.enabled(), false));
  withEnv({ TELLA_API_KEY: "k", TELLA_MODEL: "tella2" }, () => assert.equal(tellaAdapter.enabled(), false));
  withEnv({ TELLA_BASE_URL: "http://localhost:11434/v1/" }, () => {
    assert.equal(tellaAdapter.enabled(), true);
    const ep = tellaAdapter.endpoint();
    assert.equal(ep.url, "http://localhost:11434/v1/chat/completions");
    assert.equal(ep.headers.Authorization, "Bearer ollama");
  });
  withEnv({ TELLA_BASE_URL: "https://tella.example.uz/v1", TELLA_API_KEY: "sekret" }, () => {
    assert.equal(tellaAdapter.endpoint().url, "https://tella.example.uz/v1/chat/completions");
    assert.equal(tellaAdapter.endpoint().headers.Authorization, "Bearer sekret");
  });
});

/* ---------------- offers ---------------- */

test("offers: bitta — faqat o'z modelimiz tella-2, standart wire tella2", () => {
  withEnv({ TELLA_BASE_URL: "http://localhost:11434/v1" }, () => {
    assert.equal(tellaAdapter.offers.length, 1);
    const [o] = tellaAdapter.offers;
    assert.deepEqual(o.sovereignIds, ["tella-2"]);
    assert.equal(o.wire, "tella2");
    assert.equal(o.class, "free");
    assert.equal(o.cost, "free");
    assert.equal(o.minTier, "ultra");
    assert.deepEqual(o.caps, { stream: true, tools: false, vision: false, json: true });
  });
});

test("offers: TELLA_MODEL (vLLM served-model-name) wire'ni o'zgartiradi, id'lar o'sha", () => {
  withEnv({ TELLA_BASE_URL: "http://gpu:8000/v1", TELLA_MODEL: "sovereign/tella-2-7b" }, () => {
    assert.equal(tellaWire(), "sovereign/tella-2-7b");
    const [o] = tellaAdapter.offers;
    assert.equal(o.wire, "sovereign/tella-2-7b");
    assert.deepEqual(o.sovereignIds, ["tella-2"]);
    assert.equal(tellaAdapter.displayId?.(o.wire), "tella-2");
  });
});

test("boshqa katalog modellari Tella offer'ida yo'q; rescue/aggregator emas; mintaqa ochiq", () => {
  withEnv({ TELLA_BASE_URL: "http://localhost:11434/v1" }, () => {
    const ids = tellaAdapter.offers.flatMap((o) => o.sovereignIds);
    for (const other of ["llama-3.3-free", "meta-llama/llama-3.3-70b-instruct", "qwen/qwen-2.5-7b-instruct", "deepseek-r1-free"]) {
      assert.ok(!ids.includes(other), other);
    }
  });
  assert.equal(tellaAdapter.resolve, undefined);
  assert.equal(tellaAdapter.rescue, undefined);
  assert.equal(tellaAdapter.aggregator, undefined);
  assert.equal(tellaAdapter.host, "tella");
  assert.equal(tellaAdapter.id, "tella");
  assert.ok(hostAllowedIn("tella", "IR"));
  assert.ok(modelAllowedIn(tellaAdapter.displayId!("tella2"), "IR"));
  assert.equal(tellaAdapter.limits.dailyUnits, undefined);
  assert.ok(tellaAdapter.limits.source.includes("docs.ollama.com") && tellaAdapter.limits.source.includes("2026-09-27"));
});

/* ---------------- tana va served ---------------- */

test("transformBody: model = wire, vositalar olib tashlanadi, qolgani o'zgarmaydi", () => {
  withEnv({ TELLA_BASE_URL: "http://localhost:11434/v1" }, () => {
    const [o] = tellaAdapter.offers;
    const msgs = [{ role: "user", content: "salom" }];
    const out = tellaAdapter.transformBody!(
      { model: "tella-2", messages: msgs, stream: true, max_tokens: 900, temperature: 0.4, tools: [{ type: "function" }], tool_choice: "auto" },
      o,
    );
    assert.equal(out.model, "tella2");
    assert.equal(out.tools, undefined);
    assert.equal(out.tool_choice, undefined);
    assert.equal(out.max_tokens, 900);
    assert.equal(out.stream, true);
    assert.equal(out.messages, msgs);
  });
});

test("readServedModel: tella2 / tella2:latest → tella-2; begona model — halol xom nom", () => {
  withEnv({ TELLA_BASE_URL: "http://localhost:11434/v1" }, () => {
    assert.equal(readTellaServedModel({ model: "tella2" }), "tella-2");
    assert.equal(readTellaServedModel({ model: "tella2:latest" }), "tella-2");
    assert.equal(tellaAdapter.readServedModel?.({ model: "TELLA-2" }), "tella-2");
    assert.equal(readTellaServedModel({ model: "qwen2.5:7b-instruct" }), "qwen2.5:7b-instruct");
    assert.equal(readTellaServedModel({ choices: [] }), null);
    assert.equal(readTellaServedModel(null), null);
    assert.equal(isSubstitution("tella-2", readTellaServedModel({ model: "tella2:latest" })!), false);
    assert.equal(isSubstitution("tella-2", readTellaServedModel({ model: "qwen2.5:7b-instruct" })!), true);
  });
});

/* ---------------- classifyError ---------------- */

test("classify: tarmoq, Ollama 500 (runner yiqildi), proksi/tunnel 502/504/530 — transient", () => {
  assert.equal(classifyTella(0, "", H(), NOW).kind, "transient");
  assert.equal(classifyTella(500, ollama("llama runner process has terminated: exit status 2"), H(), NOW).kind, "transient");
  assert.equal(classifyTella(500, JSON.stringify({ error: "model requires more system memory (9.1 GiB) than is available (6.0 GiB)" }), H(), NOW).kind, "transient");
  for (const s of [502, 504, 530]) assert.equal(classifyTella(s, "<html>Bad gateway</html>", H(), NOW).kind, "transient", String(s));
});

test("classify: oqim ichidagi xato (status 200) — transient", () => {
  assert.equal(classifyTella(200, JSON.stringify({ error: "an error was encountered while running the model" }), H(), NOW).kind, "transient");
  assert.equal(classifyTella(200, ollama("unexpected EOF"), H(), NOW).kind, "transient");
});

test("classify: Ollama navbati to'la (503 server busy) — rate_limited, qisqa kutish", () => {
  const busy = classifyTella(503, ollama("server busy, please try again.  maximum pending requests exceeded"), H(), NOW);
  assert.equal(busy.kind, "rate_limited");
  assert.equal(busy.retryAfterMs, TELLA_BUSY_RETRY_MS);
  const withHeader = classifyTella(503, "server busy, please try again.", H({ "retry-after": "2" }), NOW);
  assert.equal(withHeader.retryAfterMs, 2_000);
  assert.equal(classifyTella(200, JSON.stringify({ error: "server busy, please try again." }), H(), NOW).kind, "rate_limited");
});

test("classify: proksi 429 — rate_limited / kunlik — quota_exhausted + resetAt", () => {
  const rl = classifyTella(429, ollama("rate limit exceeded"), H({ "retry-after": "10" }), NOW);
  assert.equal(rl.kind, "rate_limited");
  assert.equal(rl.retryAfterMs, 10_000);
  const daily = classifyTella(429, "daily request limit reached", H({ "retry-after": "3600" }), NOW);
  assert.equal(daily.kind, "quota_exhausted");
  assert.equal(daily.resetAt, NOW + 3_600_000);
});

test("classify: model yo'q (Ollama 404 / vLLM NotFoundError) — unavailable, scope model", () => {
  const o = classifyTella(404, ollama('model "tella2" not found, try pulling it first', "invalid_request_error"), H(), NOW);
  assert.equal(o.kind, "unavailable");
  assert.equal(o.scope, "model");
  const v = classifyTella(404, vllm("The model `tella-2` does not exist.", 404, "NotFoundError"), H(), NOW);
  assert.equal(v.kind, "unavailable");
  assert.equal(v.message, "The model `tella-2` does not exist.");
});

test("classify: kontekst (vLLM 400 / 413) — context_length", () => {
  const c = classifyTella(400, vllm("This model's maximum context length is 8192 tokens. However, you requested 9500 tokens (8500 in the messages, 1000 in the completion).", 400), H(), NOW);
  assert.equal(c.kind, "context_length");
  assert.equal(classifyTella(400, ollama("input length exceeds the context length"), H(), NOW).kind, "context_length");
  assert.equal(classifyTella(413, "Request Entity Too Large", H(), NOW).kind, "context_length");
});

test("classify: auth (proksi kalitni rad etdi) va bad_request", () => {
  assert.equal(classifyTella(401, "Unauthorized", H(), NOW).kind, "auth");
  assert.equal(classifyTella(403, "Forbidden", H(), NOW).kind, "auth");
  // Imkoniyat yo'q — so'rov aybi, model 6 soat yopilmasin.
  assert.equal(classifyTella(400, ollama("registry.ollama.ai/library/tella2:latest does not support tools"), H(), NOW).kind, "bad_request");
  assert.equal(classifyTella(400, ollama("model tella2 does not support images"), H(), NOW).kind, "bad_request");
  assert.equal(classifyTella(400, vllm("temperature must be non-negative", 400), H(), NOW).kind, "bad_request");
  assert.equal(classifyTella(422, "invalid json", H(), NOW).kind, "bad_request");
});

test("classifyError (adapter): xabar 500 belgidan oshmaydi, kalit tanaga qo'shilmaydi", () => {
  const e = tellaAdapter.classifyError(500, "x".repeat(2000), H());
  assert.equal(e.kind, "transient");
  assert.ok(e.message.length <= 500);
  withEnv({ TELLA_BASE_URL: "http://localhost:11434/v1", TELLA_API_KEY: "sekret" }, () => {
    assert.ok(!tellaAdapter.classifyError(401, "Unauthorized", H()).message.includes("sekret"));
  });
});

for (const [k, v] of Object.entries(saved)) if (v !== undefined) process.env[k] = v;

console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
