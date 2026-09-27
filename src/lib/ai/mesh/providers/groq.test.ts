/**
 * Lokal test (tarmoqsiz, kalitsiz): npx tsx --conditions=react-server src/lib/ai/mesh/providers/groq.test.ts
 * Groq adapteri: env aniqlash, offers, limitlar, classifyError (429 minutlik/kunlik, 413, 404, 401 ...).
 */
import assert from "node:assert/strict";
import {
  GROQ_OFFERS,
  classifyGroqError,
  groqAdapter,
  groqServedModel,
  groqTransformBody,
  parseGroqDuration,
} from "./groq";

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (e) {
    failed++;
    console.error(`FAIL ${name}\n  ${(e as Error).message}`);
  }
}

const NOW = Date.UTC(2026, 8, 27, 12, 0, 0);
const H = (h: Record<string, string> = {}) => new Headers(h);
const err = (message: string, code = "", type = "invalid_request_error") =>
  JSON.stringify({ error: { message, type, ...(code ? { code } : {}) } });
const offer = (wire: string) => {
  const o = GROQ_OFFERS.find((x) => x.wire === wire);
  assert.ok(o, `offer ${wire} yo'q`);
  return o;
};

/* ---------------- env ---------------- */
test("enabled: GROQ_API_KEY bo'lsa true, bo'sh/yo'q bo'lsa false", () => {
  const saved = process.env.GROQ_API_KEY;
  try {
    delete process.env.GROQ_API_KEY;
    assert.equal(groqAdapter.enabled(), false);
    process.env.GROQ_API_KEY = "   ";
    assert.equal(groqAdapter.enabled(), false);
    process.env.GROQ_API_KEY = "gsk_test_fake";
    assert.equal(groqAdapter.enabled(), true);
    const ep = groqAdapter.endpoint();
    assert.equal(ep.url, "https://api.groq.com/openai/v1/chat/completions");
    assert.equal(ep.headers.Authorization, "Bearer gsk_test_fake");
  } finally {
    if (saved === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = saved;
  }
});

test("id/host va region displayId", () => {
  assert.equal(groqAdapter.id, "groq");
  assert.equal(groqAdapter.host, "groq");
  assert.equal(groqAdapter.displayId?.("qwen/qwen3.8-27b"), "groq/qwen/qwen3.8-27b");
  assert.equal(groqAdapter.displayId?.("groq/openai/gpt-oss-120b"), "groq/openai/gpt-oss-120b");
});

/* ---------------- offers ---------------- */
test("offers: 3 ta chat modeli, bepul, tool-calling", () => {
  assert.equal(GROQ_OFFERS.length, 3);
  for (const o of GROQ_OFFERS) {
    assert.equal(o.cost, "free");
    assert.equal(o.class, "free");
    assert.equal(o.caps.tools, true);
    assert.equal(o.caps.stream, true);
    assert.equal(o.caps.vision, false);
  }
  assert.equal(new Set(GROQ_OFFERS.map((o) => o.wire)).size, 3);
});

test("offer qwen3.8-27b: katalog, Auto va Cloudflare id'lari (bir xil og'irlik)", () => {
  const q = offer("qwen/qwen3.8-27b");
  for (const id of ["groq/qwen/qwen3.8-27b", "qwen/qwen3.8-27b", "qwen3-8-27b", "cloudflare/@cf/qwen/qwen3.8-27b"]) {
    assert.ok(q.sovereignIds.includes(id), id);
  }
  assert.equal(q.quality, 0.9);
});

test("offer gpt-oss-120b / 20b: halol — Llama id'lari same-model EMAS", () => {
  const big = offer("openai/gpt-oss-120b");
  const small = offer("openai/gpt-oss-20b");
  assert.ok(big.sovereignIds.includes("groq/openai/gpt-oss-120b"));
  assert.ok(small.sovereignIds.includes("openai/gpt-oss-20b"));
  for (const o of GROQ_OFFERS) {
    assert.ok(!o.sovereignIds.some((id) => /llama/i.test(id)), `${o.wire} llama'ni o'z modeli deb ko'rsatmasin`);
  }
  assert.ok((small.quality ?? 0.7) < (big.quality ?? 0.7));
});

test("limits: rasmiy jadval + manba + sana", () => {
  const l = groqAdapter.limits;
  assert.deepEqual([l.rpm, l.rpd, l.tpm, l.tpd], [30, 1000, 8000, 200000]);
  assert.equal(l.perModel, true);
  assert.equal(l.unit, "tokens");
  assert.equal(l.dailyUnits, 200000);
  assert.match(l.source, /^https:\/\/console\.groq\.com\/docs\/rate-limits \(\d{4}-\d{2}-\d{2}\)$/);
});

/* ---------------- duration ---------------- */
test("parseGroqDuration", () => {
  assert.equal(parseGroqDuration("7.66s"), 7660);
  assert.equal(parseGroqDuration("2m59.56s"), 179560);
  assert.equal(parseGroqDuration("1h2m3s"), 3723000);
  assert.equal(parseGroqDuration("120ms"), 120);
  assert.equal(parseGroqDuration("2"), 2000);
  assert.equal(parseGroqDuration("soon"), null);
  assert.equal(parseGroqDuration(null), null);
});

/* ---------------- classifyError ---------------- */
test("429 TPM → rate_limited, retry-after sarlavhasidan, scope model", () => {
  const body = err(
    "Rate limit reached for model `openai/gpt-oss-120b` in organization `org_x` service tier `on_demand` on tokens per minute (TPM): Limit 8000, Used 7000, Requested 2000. Please try again in 7.5s.",
    "rate_limit_exceeded",
    "tokens",
  );
  const c = classifyGroqError(429, body, H({ "retry-after": "8", "x-ratelimit-remaining-requests": "900" }), NOW);
  assert.equal(c.kind, "rate_limited");
  assert.equal(c.scope, "model");
  assert.equal(c.retryAfterMs, 8000);
  assert.equal(c.resetAt, undefined);
});

test("429 TPM, retry-after yo'q → tanadagi 'try again in'", () => {
  const body = err("... on requests per minute (RPM): Limit 30, Used 30, Requested 1. Please try again in 1.2s.", "rate_limit_exceeded", "requests");
  const c = classifyGroqError(429, body, H(), NOW);
  assert.equal(c.kind, "rate_limited");
  assert.equal(c.retryAfterMs, 1200);
});

test("429 TPD (kunlik) → quota_exhausted, resetAt = now + 'try again in'", () => {
  const body = err(
    "Rate limit reached for model `qwen/qwen3.8-27b` in organization `org_x` on tokens per day (TPD): Limit 200000, Used 199500, Requested 1500. Please try again in 10m48s.",
    "rate_limit_exceeded",
    "tokens",
  );
  const c = classifyGroqError(429, body, H({ "retry-after": "648" }), NOW);
  assert.equal(c.kind, "quota_exhausted");
  assert.equal(c.scope, "model");
  assert.equal(c.resetAt, NOW + 648_000);
});

test("429 RPD — faqat sarlavhalar (remaining-requests 0) → quota_exhausted, reset-requests dan", () => {
  const c = classifyGroqError(
    429,
    "",
    H({ "x-ratelimit-remaining-requests": "0", "x-ratelimit-reset-requests": "2m59.56s", "retry-after": "3" }),
    NOW,
  );
  assert.equal(c.kind, "quota_exhausted");
  assert.equal(c.resetAt, NOW + 179_560);
});

test("429 — tana 'per minute' desa remaining-requests 0 bo'lsa ham rate_limited", () => {
  const body = err("... on tokens per minute (TPM): Limit 8000. Please try again in 3s.", "rate_limit_exceeded");
  const c = classifyGroqError(429, body, H({ "x-ratelimit-remaining-requests": "0" }), NOW);
  assert.equal(c.kind, "rate_limited");
  assert.equal(c.retryAfterMs, 3000);
});

test("413 TPM dan katta so'rov → context_length (model)", () => {
  const body = err(
    "Request too large for model `openai/gpt-oss-20b` in organization `org_x` on tokens per minute (TPM): Limit 8000, Requested 12000, please reduce your message size and try again.",
    "rate_limit_exceeded",
    "tokens",
  );
  const c = classifyGroqError(413, body, H(), NOW);
  assert.equal(c.kind, "context_length");
  assert.equal(c.scope, "model");
});

test("400 context_length_exceeded → context_length", () => {
  const c = classifyGroqError(400, err("Please reduce the length of the messages or completion.", "context_length_exceeded"), H(), NOW);
  assert.equal(c.kind, "context_length");
});

test("404 model_not_found → unavailable (model)", () => {
  const c = classifyGroqError(404, err("The model `llama-3.3-70b-versatile` does not exist or you do not have access to it.", "model_not_found"), H(), NOW);
  assert.deepEqual([c.kind, c.scope], ["unavailable", "model"]);
});

test("400 model_decommissioned → unavailable (model)", () => {
  const c = classifyGroqError(400, err("The model `mixtral-8x7b-32768` has been decommissioned and is no longer supported.", "model_decommissioned"), H(), NOW);
  assert.deepEqual([c.kind, c.scope], ["unavailable", "model"]);
});

test("401 invalid_api_key → auth; 403 HTML (mintaqa) → auth", () => {
  assert.equal(classifyGroqError(401, err("Invalid API Key", "invalid_api_key"), H(), NOW).kind, "auth");
  assert.equal(classifyGroqError(403, "<html>Forbidden</html>", H(), NOW).kind, "auth");
});

test("403 model bloklangan → unavailable (model)", () => {
  const c = classifyGroqError(403, err("The model `qwen/qwen3.8-27b` is blocked at the organization level.", "model_permission_blocked_org"), H(), NOW);
  assert.deepEqual([c.kind, c.scope], ["unavailable", "model"]);
});

test("5xx / 498 / 0 → transient; 503 retry-after o'qiladi", () => {
  for (const s of [0, 500, 502, 504, 498]) assert.equal(classifyGroqError(s, "", H(), NOW).kind, "transient", String(s));
  const c = classifyGroqError(503, err("Service Unavailable: over capacity", "", "internal_server_error"), H({ "retry-after": "2" }), NOW);
  assert.equal(c.kind, "transient");
  assert.equal(c.retryAfterMs, 2000);
});

test("400 tool_use_failed → transient (model); oddiy 400/422 → bad_request", () => {
  const t = classifyGroqError(400, err("Failed to call a function. Please adjust your prompt.", "tool_use_failed"), H(), NOW);
  assert.deepEqual([t.kind, t.scope], ["transient", "model"]);
  assert.equal(classifyGroqError(400, err("'messages' : minimum number of items is 1"), H(), NOW).kind, "bad_request");
  assert.equal(classifyGroqError(422, err("invalid tool schema"), H(), NOW).kind, "bad_request");
});

test("oqim ichidagi xato (status 200 + SSE data) → koddan", () => {
  const sse = `data: ${err("Rate limit reached ... on requests per day (RPD): Limit 1000, Used 1000. Please try again in 1m26.4s.", "rate_limit_exceeded")}`;
  const c = classifyGroqError(200, sse, H(), NOW);
  assert.equal(c.kind, "quota_exhausted");
  assert.equal(c.resetAt, NOW + 86_400);
  assert.equal(classifyGroqError(200, err("internal error", "", "internal_server_error"), H(), NOW).kind, "transient");
});

test("message kesiladi (<= 300) va adapter.classifyError ishlaydi", () => {
  const c = groqAdapter.classifyError(500, "x".repeat(1000), H());
  assert.equal(c.kind, "transient");
  assert.ok(c.message.length <= 300);
});

/* ---------------- body / served ---------------- */
test("transformBody: qo'llanmaydigan maydonlar olib tashlanadi", () => {
  const out = groqTransformBody({ model: "openai/gpt-oss-120b", messages: [], logprobs: true, top_logprobs: 2, logit_bias: { 1: 1 }, n: 2, temperature: 0.2 });
  assert.equal("logprobs" in out, false);
  assert.equal("top_logprobs" in out, false);
  assert.equal("logit_bias" in out, false);
  assert.equal("n" in out, false);
  assert.equal(out.temperature, 0.2);
});

test("readServedModel: chunk.model → groq/<model>", () => {
  assert.equal(groqServedModel({ model: "openai/gpt-oss-120b", choices: [] }), "groq/openai/gpt-oss-120b");
  assert.equal(groqServedModel({ choices: [] }), null);
  assert.equal(groqServedModel(null), null);
});

console.log(`groq adapter: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
