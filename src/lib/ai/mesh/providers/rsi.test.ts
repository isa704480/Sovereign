/**
 * Lokal test (tarmoqsiz, kalitsiz): npx tsx --conditions=react-server src/lib/ai/mesh/providers/rsi.test.ts
 * RSI, Gateway va Experiential adapterlari: env aniqlash, offers, endpoint, tana va classifyError.
 */
import assert from "node:assert/strict";
import { rsiAdapter } from "./rsi";
import { classifyOpenAiCompat, gatewayAdapter, parseDurationMs, retryAfterFromHeaders } from "./gateway";
import { classifyExperiential, experientialAdapter } from "./experiential";
import type { ChatBody } from "../types";

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

const ENV_KEYS = ["RSI_BASE_URL", "RSI_API_KEY", "GATEWAY_BASE_URL", "GATEWAY_API_KEY", "GATEWAY_MODEL", "EXPERIENTIAL_API_KEY", "EXPERIENTIAL_MODEL"];
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
const err = (code: string | number, message: string, type = "error") => JSON.stringify({ error: { message, type, code, param: null } });

/* ---------------- RSI ---------------- */

test("rsi: enabled() faqat RSI_BASE_URL + RSI_API_KEY bilan", () => {
  withEnv({}, () => assert.equal(rsiAdapter.enabled(), false));
  withEnv({ RSI_API_KEY: "k" }, () => assert.equal(rsiAdapter.enabled(), false));
  withEnv({ RSI_BASE_URL: "https://rsi.example/v1" }, () => assert.equal(rsiAdapter.enabled(), false));
  withEnv({ RSI_BASE_URL: "https://rsi.example/v1/", RSI_API_KEY: "k" }, () => {
    assert.equal(rsiAdapter.enabled(), true);
    const ep = rsiAdapter.endpoint();
    assert.equal(ep.url, "https://rsi.example/v1/chat/completions");
    assert.equal(ep.headers.Authorization, "Bearer k");
  });
});

test("rsi: offers — RSI_MODELS jadvali (6 model), halol id va tarif", () => {
  assert.equal(rsiAdapter.offers.length, 6);
  const byWire = new Map(rsiAdapter.offers.map((o) => [o.wire, o]));
  const opus = byWire.get("claude-opus-4-8")!;
  assert.deepEqual(opus.sovereignIds, ["claude-opus-4-8", "anthropic/claude-opus-4.8"]);
  assert.equal(opus.class, "flagship");
  assert.equal(opus.minTier, "ultra");
  assert.equal(opus.caps.stream, true);
  assert.equal(opus.caps.tools, false);
  const sol = byWire.get("gpt-5.6-sol")!;
  assert.deepEqual(sol.sovereignIds, ["gpt-5-6-sol", "openai/gpt-5.6-sol"]);
  assert.equal(sol.minTier, "pro");
  assert.ok(byWire.get("claude-opus-5")!.sovereignIds.includes("anthropic/claude-opus-5"));
  assert.ok(byWire.get("claude-fable-5")!.sovereignIds.includes("anthropic/claude-fable-5.1"));
  assert.equal(rsiAdapter.displayId?.("claude-opus-4-8"), "anthropic/claude-opus-4.8");
  assert.equal(rsiAdapter.displayId?.("unknown-x"), "unknown-x");
  assert.equal(rsiAdapter.rescue, undefined);
  assert.equal(rsiAdapter.aggregator, true);
  assert.equal(rsiAdapter.host, "rsi");
  assert.ok(rsiAdapter.limits.source.includes("2026-09-27"));
});

test("rsi: readServedModel — bo'lakdagi model", () => {
  assert.equal(rsiAdapter.readServedModel?.({ model: " claude-opus-4-8 " }), "claude-opus-4-8");
  assert.equal(rsiAdapter.readServedModel?.({ choices: [] }), null);
  assert.equal(rsiAdapter.readServedModel?.(null), null);
});

/* ---------------- classifyError (umumiy OpenAI-mos) ---------------- */

test("classify: tarmoq/5xx — transient", () => {
  assert.equal(classifyOpenAiCompat(0, "", H(), NOW).kind, "transient");
  for (const s of [500, 502, 503, 504, 529]) assert.equal(classifyOpenAiCompat(s, "upstream error", H(), NOW).kind, "transient", String(s));
  // 5xx matnida "model not available" — model yo'q emas, vaqtinchalik.
  assert.equal(classifyOpenAiCompat(503, err(503, "model is not available right now"), H(), NOW).kind, "transient");
});

test("classify: 429 + Retry-After / x-ratelimit-reset — rate_limited", () => {
  const a = classifyOpenAiCompat(429, err("rate_limit_exceeded", "Rate limit reached"), H({ "retry-after": "12" }), NOW);
  assert.equal(a.kind, "rate_limited");
  assert.equal(a.retryAfterMs, 12_000);
  const b = classifyOpenAiCompat(429, err("rate_limit_exceeded", "Too many requests"), H({ "x-ratelimit-reset-requests": "1m30s", "x-ratelimit-reset-tokens": "20ms" }), NOW);
  assert.equal(b.retryAfterMs, 90_000);
  const c = classifyOpenAiCompat(429, "slow down", H({ "retry-after": new Date(NOW + 5_000).toUTCString() }), NOW);
  assert.equal(c.retryAfterMs, 5_000);
  // OpenAI RPM xabarida "billing" havolasi bor — bu no_credit EMAS.
  const d = classifyOpenAiCompat(429, err("rate_limit_exceeded", "Rate limit reached on requests per min (RPM). Add a payment method at https://platform.openai.com/account/billing."), H(), NOW);
  assert.equal(d.kind, "rate_limited");
});

test("classify: 429 kunlik — quota_exhausted + resetAt", () => {
  const e = classifyOpenAiCompat(429, err("rate_limit_exceeded", "Rate limit reached on tokens per day (TPD)"), H({ "retry-after": "3600" }), NOW);
  assert.equal(e.kind, "quota_exhausted");
  assert.equal(e.resetAt, NOW + 3_600_000);
  const epoch = classifyOpenAiCompat(429, "daily limit reached", H({ "x-ratelimit-reset": String(Math.floor(NOW / 1000) + 600) }), NOW);
  assert.equal(epoch.kind, "quota_exhausted");
  assert.equal(epoch.resetAt, NOW + 600_000);
});

test("classify: 402 / can only afford — no_credit + affordTokens", () => {
  const e = classifyOpenAiCompat(402, err(402, "This request requires more credits, or fewer max_tokens. You requested up to 8000 tokens, but can only afford 1234."), H(), NOW);
  assert.equal(e.kind, "no_credit");
  assert.equal(e.affordTokens, 1234);
  assert.equal(classifyOpenAiCompat(429, err("insufficient_quota", "You exceeded your current quota"), H(), NOW).kind, "no_credit");
  assert.equal(classifyOpenAiCompat(400, err(400, "Insufficient balance"), H(), NOW).kind, "no_credit");
});

test("classify: auth, unavailable, context_length, bad_request", () => {
  assert.equal(classifyOpenAiCompat(401, err("invalid_api_key", "Incorrect API key"), H(), NOW).kind, "auth");
  assert.equal(classifyOpenAiCompat(403, "forbidden", H(), NOW).kind, "auth");
  const nf = classifyOpenAiCompat(404, err("model_not_found", "The model `x` does not exist"), H(), NOW);
  assert.equal(nf.kind, "unavailable");
  assert.equal(nf.scope, "model");
  assert.equal(classifyOpenAiCompat(400, err(400, "model claude-x not found"), H(), NOW).kind, "unavailable");
  assert.equal(classifyOpenAiCompat(413, "payload too large", H(), NOW).kind, "context_length");
  assert.equal(classifyOpenAiCompat(400, err("context_length_exceeded", "This model's maximum context length is 8192 tokens"), H(), NOW).kind, "context_length");
  assert.equal(classifyOpenAiCompat(422, err(422, "temperature must be <= 2"), H(), NOW).kind, "bad_request");
  assert.equal(classifyOpenAiCompat(400, "bad", H(), NOW).kind, "bad_request");
});

test("classify: 200 + oqim ichidagi xato — tanadagi kod", () => {
  assert.equal(classifyOpenAiCompat(200, err(429, "Rate limited upstream"), H(), NOW).kind, "rate_limited");
  assert.equal(classifyOpenAiCompat(200, err("server_error", "stream broke"), H(), NOW).kind, "transient");
  assert.equal(rsiAdapter.classifyError(502, "<html>Bad gateway</html>", H()).kind, "transient");
  assert.ok(rsiAdapter.classifyError(401, "x".repeat(2000), H()).message.length <= 500);
});

test("yordamchi: parseDurationMs / retryAfterFromHeaders", () => {
  assert.equal(parseDurationMs("6m0s"), 360_000);
  assert.equal(parseDurationMs("1h2m3.5s"), 3_723_500);
  assert.equal(parseDurationMs("20ms"), 20);
  assert.equal(parseDurationMs("7"), 7_000);
  assert.equal(parseDurationMs("soon"), null);
  assert.equal(retryAfterFromHeaders(H(), NOW), undefined);
  assert.equal(retryAfterFromHeaders(H({ "retry-after-ms": "1500" }), NOW), 1_500);
});

/* ---------------- Gateway ---------------- */

test("gateway: env, endpoint, offer va tana", () => {
  withEnv({ GATEWAY_BASE_URL: "https://gw.example/v1" }, () => assert.equal(gatewayAdapter.enabled(), false));
  withEnv({ GATEWAY_BASE_URL: "https://gw.example/v1/", GATEWAY_API_KEY: "g" }, () => {
    assert.equal(gatewayAdapter.enabled(), true);
    assert.equal(gatewayAdapter.endpoint().url, "https://gw.example/v1/chat/completions");
    assert.equal(gatewayAdapter.offers[0].wire, "auto");
  });
  withEnv({ GATEWAY_BASE_URL: "https://gw.example/v1", GATEWAY_API_KEY: "g", GATEWAY_MODEL: "my/model" }, () => {
    const [o] = gatewayAdapter.offers;
    assert.equal(o.wire, "my/model");
    assert.deepEqual(o.sovereignIds, []);
    assert.equal(o.class, "free");
    assert.equal(o.minTier, "free");
    assert.equal(o.caps.tools, false);
    const body: ChatBody = {
      model: "x",
      messages: [{ role: "user", content: [{ type: "text", text: "salom" }, { type: "image_url", image_url: { url: "data:..." } }] }],
      max_tokens: 8000,
      stream: true,
      tools: [{ type: "function" }],
    };
    const out = gatewayAdapter.transformBody!(body, o);
    assert.equal(out.model, "my/model");
    assert.equal(out.max_tokens, 2048);
    assert.equal(out.tools, undefined);
    assert.deepEqual(out.messages, [{ role: "user", content: "salom " }]);
    assert.equal(out.stream, true);
  });
  assert.equal(gatewayAdapter.rescue, true);
  assert.equal(gatewayAdapter.aggregator, true);
});

/* ---------------- Experiential ---------------- */

test("experiential: env, endpoint, offer va tana", () => {
  withEnv({}, () => assert.equal(experientialAdapter.enabled(), false));
  withEnv({ EXPERIENTIAL_API_KEY: "xpl_test" }, () => {
    assert.equal(experientialAdapter.enabled(), true);
    const ep = experientialAdapter.endpoint();
    assert.equal(ep.url, "https://api.experientiallabs.ai/v1/chat/completions");
    assert.equal(ep.headers.Authorization, "Bearer xpl_test");
    const [o] = experientialAdapter.offers;
    assert.equal(o.wire, "claude-3-haiku");
    assert.equal(o.caps.tools, true);
    assert.equal(o.caps.vision, false);
    const toolMsg = { role: "assistant", content: null, tool_calls: [{ id: "1" }] };
    const out = experientialAdapter.transformBody!(
      { model: "x", messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }, toolMsg], max_tokens: 500, tools: [{ type: "function" }] },
      o,
    );
    assert.equal(out.model, "claude-3-haiku");
    assert.equal(out.max_tokens, 500);
    assert.deepEqual(out.messages[0], { role: "user", content: "hi" });
    assert.deepEqual(out.messages[1], toolMsg);
    assert.ok(Array.isArray(out.tools));
  });
  withEnv({ EXPERIENTIAL_API_KEY: "xpl_test", EXPERIENTIAL_MODEL: "claude-sonnet-5" }, () => {
    assert.equal(experientialAdapter.offers[0].wire, "claude-sonnet-5");
  });
  assert.equal(experientialAdapter.rescue, true);
});

test("experiential: hujjatdagi xato kodlari", () => {
  const c = (s: number, code: string, msg = "x", h: Record<string, string> = {}) => classifyExperiential(s, err(code, msg), H(h), NOW);
  assert.equal(c(401, "invalid_key").kind, "auth");
  assert.equal(c(429, "org_under_review").kind, "auth");
  assert.equal(c(403, "model_not_granted").kind, "unavailable");
  assert.equal(c(403, "model_not_granted").scope, "model");
  assert.equal(c(403, "model_location_not_supported").kind, "unavailable");
  const credit = c(429, "insufficient_quota", "Credits exhausted");
  assert.equal(credit.kind, "no_credit");
  const free = c(429, "insufficient_quota", "Free-tier daily token allowance exhausted", { "retry-after": "7200" });
  assert.equal(free.kind, "quota_exhausted");
  assert.equal(free.resetAt, NOW + 7_200_000);
  const thr = c(429, "unavailable_route", "throttled", { "retry-after": "3" });
  assert.equal(thr.kind, "rate_limited");
  assert.equal(thr.retryAfterMs, 3_000);
  assert.equal(c(503, "unavailable_route").kind, "rate_limited");
  assert.equal(c(429, "gateway_overloaded").kind, "rate_limited");
  for (const [s, code] of [[502, "provider_internal"], [502, "all_routes_failed"], [503, "gateway_draining"], [504, "deadline_exceeded"], [500, "internal_error"], [499, "request_cancelled"]] as const) {
    assert.equal(c(s, code).kind, "transient", code);
  }
  for (const code of ["invalid_json", "invalid_request", "invalid_parameter", "unsupported_capability", "unsupported_parameter", "refusal"]) {
    assert.equal(c(400, code).kind, "bad_request", code);
  }
  assert.equal(c(400, "invalid_request", "prompt is too long: maximum context length exceeded").kind, "context_length");
  // 200 + x-gateway-warning: empty_completion
  assert.equal(classifyExperiential(200, "", H({ "x-gateway-warning": "empty_completion" }), NOW).kind, "transient");
  // Noma'lum kod — umumiy qoidalar
  assert.equal(classifyExperiential(402, "Payment required", H(), NOW).kind, "no_credit");
  assert.equal(experientialAdapter.classifyError(404, err("not_found", "no such model"), H()).kind, "unavailable");
});

for (const [k, v] of Object.entries(saved)) if (v !== undefined) process.env[k] = v;

console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
