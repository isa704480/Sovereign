/**
 * Lokal test (tarmoqsiz, kalitsiz):
 *   npx tsx --conditions=react-server src/lib/ai/mesh/providers/mistral.test.ts
 * Mistral adapteri: env aniqlash, takliflar, tana moslash, served id va classifyError.
 */
import assert from "node:assert/strict";
import {
  classifyMistralError,
  mistralAdapter,
  mistralToolCallId,
  nextMonthUtc,
  parseDurationMs,
} from "./mistral";
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

const H = (h: Record<string, string> = {}) => new Headers(h);
const NOW = Date.UTC(2026, 8, 27, 12, 0, 0); // 2026-09-27 12:00 UTC
const offerFor = (id: string) => mistralAdapter.offers.find((o) => o.sovereignIds.includes(id));

test("enabled(): MISTRAL_API_KEY bo'lsa true, yo'q/bo'sh bo'lsa false", () => {
  const prev = process.env.MISTRAL_API_KEY;
  try {
    delete process.env.MISTRAL_API_KEY;
    assert.equal(mistralAdapter.enabled(), false);
    process.env.MISTRAL_API_KEY = "   ";
    assert.equal(mistralAdapter.enabled(), false);
    process.env.MISTRAL_API_KEY = "test-key-not-real";
    assert.equal(mistralAdapter.enabled(), true);
    const ep = mistralAdapter.endpoint();
    assert.equal(ep.url, "https://api.mistral.ai/v1/chat/completions");
    assert.equal(ep.headers.Authorization, "Bearer test-key-not-real");
  } finally {
    if (prev === undefined) delete process.env.MISTRAL_API_KEY;
    else process.env.MISTRAL_API_KEY = prev;
  }
});

test("id/host: mistral (region.ts HOST_POLICY kaliti)", () => {
  assert.equal(mistralAdapter.id, "mistral");
  assert.equal(mistralAdapter.host, "mistral");
  assert.ok(!mistralAdapter.rescue);
  assert.ok(!mistralAdapter.aggregator);
});

test("offers: Codestral — kod, tools bor, vision yo'q, CLI/auto-pools id'lari", () => {
  const o = offerFor("mistral/codestral-latest");
  assert.ok(o);
  assert.equal(o.wire, "codestral-latest");
  assert.equal(o.class, "code");
  assert.equal(o.caps.tools, true);
  assert.equal(o.caps.vision, false);
  assert.equal(o.caps.stream, true);
  assert.ok(o.sovereignIds.includes("mistralai/codestral-latest"));
  assert.equal(o.minTier, "free");
});

test("offers: Mistral Small — katalog id, providerModel va eski DIRECT_ROUTES kaliti", () => {
  for (const id of ["mistral-small", "mistralai/mistral-small-latest", "mistralai/mistral-small"]) {
    const o = offerFor(id);
    assert.ok(o, id);
    assert.equal(o.wire, "mistral-small-latest");
    assert.equal(o.class, "fast");
    assert.equal(o.cost, "cheap");
    assert.equal(o.caps.vision, true);
    assert.equal(o.caps.tools, true);
  }
});

test("offers: Large va Medium 3.5 — flagship, paid (standart minTier → pro)", () => {
  const large = offerFor("mistral-large-2");
  assert.ok(large);
  assert.equal(large.wire, "mistral-large-latest");
  assert.equal(large.class, "flagship");
  assert.equal(large.cost, "paid");
  assert.equal(large.minTier, undefined);
  assert.equal(offerFor("mistralai/mistral-large"), large);
  const medium = offerFor("mistral-medium-3-5");
  assert.ok(medium);
  assert.equal(medium.wire, "mistral-medium-latest");
  assert.equal(medium.class, "flagship");
});

test("offers: pixtral-large (retired 2026-05-31) taklif qilinmaydi; wire'lar takrorlanmaydi", () => {
  assert.equal(offerFor("mistralai/pixtral-large"), undefined);
  const wires = mistralAdapter.offers.map((o) => o.wire);
  assert.equal(new Set(wires).size, wires.length);
  assert.equal(wires.length, 4);
});

test("limits: manba va sana bor, raqam taxmin qilinmagan", () => {
  assert.match(mistralAdapter.limits.source, /https:\/\/docs\.mistral\.ai\/.+\(2026-09-27\)/);
  assert.equal(mistralAdapter.limits.dailyUnits, undefined);
  assert.equal(mistralAdapter.limits.rpm, undefined);
});

test("displayId / readServedModel: region va served uchun Mistral nomi saqlanadi", () => {
  const d = mistralAdapter.displayId!;
  assert.equal(d("codestral-latest"), "mistral/codestral-latest");
  assert.equal(d("mistral-medium-latest"), "mistralai/mistral-medium-3-5");
  assert.equal(d("mistral-large-2512"), "mistralai/mistral-large");
  assert.equal(d("ministral-8b-2512"), "mistral/ministral-8b-2512");
  const r = mistralAdapter.readServedModel!;
  assert.equal(r({ id: "x", model: "mistral-small-latest", choices: [] }), "mistralai/mistral-small-latest");
  assert.equal(r({ choices: [] }), null);
  assert.equal(r("data"), null);
});

test("transformBody: begona maydonlar olib tashlanadi, seed/max_completion_tokens moslanadi", () => {
  const offer = offerFor("mistral-small")!;
  const body: ChatBody = {
    model: "mistralai/mistral-small-latest",
    messages: [{ role: "user", content: "salom" }],
    stream: true,
    temperature: 0.3,
    max_completion_tokens: 512,
    seed: 7,
    stream_options: { include_usage: true },
    transforms: ["middle-out"],
    route: "fallback",
    user: "u1",
    tool_choice: "auto",
  };
  const out = mistralAdapter.transformBody!(body, offer);
  assert.equal(out.model, "mistral-small-latest");
  assert.equal(out.max_tokens, 512);
  assert.equal(out.random_seed, 7);
  assert.equal(out.stream, true);
  for (const k of ["stream_options", "transforms", "route", "user", "seed", "max_completion_tokens", "tool_choice"]) {
    assert.ok(!(k in out), k);
  }
});

test("transformBody: tool_call id'lari 9 belgili [A-Za-z0-9] ga izchil aylantiriladi", () => {
  const offer = offerFor("codestral-latest")!;
  const tools = [{ type: "function", function: { name: "read_file", parameters: {} } }];
  const body: ChatBody = {
    model: "x",
    tools,
    tool_choice: "auto",
    messages: [
      { role: "user", content: "o'qi" },
      { role: "assistant", content: "", tool_calls: [{ id: "call_abc123XYZ_long", type: "function", function: { name: "read_file", arguments: "{}" } }] },
      { role: "tool", tool_call_id: "call_abc123XYZ_long", content: "..." },
      { role: "assistant", content: "", tool_calls: [{ id: "Ab3dE6gH9", type: "function", function: { name: "read_file", arguments: "{}" } }] },
      { role: "tool", tool_call_id: "Ab3dE6gH9", content: "..." },
    ],
  };
  const out = mistralAdapter.transformBody!(body, offer);
  const msgs = out.messages as Array<Record<string, unknown>>;
  const newId = (msgs[1].tool_calls as Array<{ id: string }>)[0].id;
  assert.match(newId, /^[A-Za-z0-9]{9}$/);
  assert.equal(msgs[2].tool_call_id, newId);
  assert.equal((msgs[3].tool_calls as Array<{ id: string }>)[0].id, "Ab3dE6gH9");
  assert.equal(msgs[4].tool_call_id, "Ab3dE6gH9");
  assert.deepEqual(out.tools, tools);
  assert.equal(out.tool_choice, "auto");
  assert.equal(mistralToolCallId("call_abc123XYZ_long"), newId); // deterministik
  assert.notEqual(mistralToolCallId("call_1"), mistralToolCallId("call_2"));
  // Kiruvchi tana o'zgartirilmaydi.
  assert.equal((body.messages[2] as { tool_call_id: string }).tool_call_id, "call_abc123XYZ_long");
});

test("parseDurationMs: soniya, ms/m/s birikmasi, HTTP-date", () => {
  assert.equal(parseDurationMs("30"), 30_000);
  assert.equal(parseDurationMs("1.5"), 1_500);
  assert.equal(parseDurationMs("250ms"), 250);
  assert.equal(parseDurationMs("1m30s"), 90_000);
  assert.equal(parseDurationMs(new Date(NOW + 5_000).toUTCString(), NOW), 5_000);
  assert.equal(parseDurationMs("abc"), undefined);
  assert.equal(parseDurationMs(null), undefined);
});

test("classifyError: tarmoq va 5xx → transient", () => {
  assert.equal(classifyMistralError(0, "", H(), NOW).kind, "transient");
  for (const s of [500, 502, 503, 504, 529, 408]) {
    assert.equal(classifyMistralError(s, '{"object":"error","message":"Internal server error"}', H(), NOW).kind, "transient", String(s));
  }
  assert.equal(classifyMistralError(503, "<html>Bad gateway</html>", H(), NOW).kind, "transient");
});

test("classifyError: 429 daqiqalik limit → rate_limited, model scope, Retry-After", () => {
  const body = '{"object":"error","message":"Requests rate limit exceeded","type":"rate_limited","param":null,"code":"1300"}';
  const e = classifyMistralError(429, body, H({ "retry-after": "12" }), NOW);
  assert.equal(e.kind, "rate_limited");
  assert.equal(e.scope, "model");
  assert.equal(e.retryAfterMs, 12_000);
  const e2 = classifyMistralError(429, body, H({ "ratelimitbysize-reset": "3" }), NOW);
  assert.equal(e2.retryAfterMs, 3_000);
  const e3 = classifyMistralError(429, body, H(), NOW);
  assert.equal(e3.retryAfterMs, undefined); // health standart 60 s ni qo'yadi
});

test("classifyError: 429 service tier capacity (3505) → rate_limited, model scope", () => {
  const body = '{"object":"error","message":"Service tier capacity exceeded for this model.","type":"service_tier_capacity_exceeded","param":null,"code":"3505"}';
  const e = classifyMistralError(429, body, H(), NOW);
  assert.equal(e.kind, "rate_limited");
  assert.equal(e.scope, "model");
});

test("classifyError: oylik token limiti → quota_exhausted, resetAt = keyingi oy 00:00 UTC", () => {
  const byHeader = classifyMistralError(
    429,
    '{"object":"error","message":"Tokens rate limit exceeded","type":"rate_limited","code":"1300"}',
    H({ "x-ratelimit-remaining-tokens-month": "0" }),
    NOW,
  );
  assert.equal(byHeader.kind, "quota_exhausted");
  assert.equal(byHeader.scope, "provider");
  assert.equal(byHeader.resetAt, Date.UTC(2026, 9, 1));
  const byBody = classifyMistralError(429, '{"message":"Monthly token limit exceeded"}', H(), NOW);
  assert.equal(byBody.kind, "quota_exhausted");
  assert.equal(nextMonthUtc(Date.UTC(2026, 11, 31, 23, 59)), Date.UTC(2027, 0, 1));
  // Qolgan oylik token > 0 — oddiy daqiqalik limit.
  const minute = classifyMistralError(429, '{"message":"Requests rate limit exceeded"}', H({ "x-ratelimit-remaining-tokens-month": "999" }), NOW);
  assert.equal(minute.kind, "rate_limited");
});

test("classifyError (regress): kunlik limit (RPD / 4006) → quota_exhausted keyingi 00:00 UTC gacha, 60 s rate limit EMAS", () => {
  const e = classifyMistralError(429, '{"message":"Rate limit reached: requests per day (RPD) daily limit reached (4006)"}', H(), NOW);
  assert.equal(e.kind, "quota_exhausted");
  const d = new Date(NOW);
  assert.equal(e.resetAt, Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1));
  // Daqiqalik limit o'zgarmadi.
  assert.equal(classifyMistralError(429, '{"message":"Requests rate limit exceeded"}', H(), NOW).kind, "rate_limited");
});

test("classifyError: 401/403 → auth; 403 model ruxsati → unavailable (model)", () => {
  assert.equal(classifyMistralError(401, '{"message":"Unauthorized","request_id":"r1"}', H(), NOW).kind, "auth");
  assert.equal(classifyMistralError(401, '{"detail":"Unauthorized"}', H(), NOW).kind, "auth");
  assert.equal(classifyMistralError(403, '{"message":"Forbidden"}', H(), NOW).kind, "auth");
  const m = classifyMistralError(403, '{"message":"You do not have access to this model"}', H(), NOW);
  assert.equal(m.kind, "unavailable");
  assert.equal(m.scope, "model");
});

test("classifyError: 402 / billing → no_credit", () => {
  assert.equal(classifyMistralError(402, '{"message":"Payment required"}', H(), NOW).kind, "no_credit");
  assert.equal(classifyMistralError(400, '{"message":"Insufficient balance, please add credits"}', H(), NOW).kind, "no_credit");
});

test("classifyError: invalid_model / 404 → unavailable (model scope)", () => {
  const e = classifyMistralError(400, '{"object":"error","message":"Invalid model: pixtral-large-latest","type":"invalid_model","param":null,"code":"1500"}', H(), NOW);
  assert.equal(e.kind, "unavailable");
  assert.equal(e.scope, "model");
  assert.equal(classifyMistralError(404, '{"message":"Not Found"}', H(), NOW).kind, "unavailable");
});

test("classifyError: kontekst juda uzun → context_length", () => {
  const body = '{"object":"error","message":"Prompt contains 140000 tokens and 0 draft tokens, too large for model with 131072 maximum context length","type":"invalid_request_error","code":"3051"}';
  assert.equal(classifyMistralError(400, body, H(), NOW).kind, "context_length");
  assert.equal(classifyMistralError(413, "Request Entity Too Large", H(), NOW).kind, "context_length");
});

test("classifyError: 422 validatsiya / 400 boshqa → bad_request (zanjir to'xtaydi)", () => {
  const v = '{"object":"error","message":{"detail":[{"type":"extra_forbidden","loc":["body","foo"],"msg":"Extra inputs are not permitted"}]},"type":"invalid_request_error","param":null,"code":null}';
  assert.equal(classifyMistralError(422, v, H(), NOW).kind, "bad_request");
  assert.equal(classifyMistralError(400, '{"object":"error","message":"Tool call id has to be 9 characters","type":"invalid_request_message"}', H(), NOW).kind, "bad_request");
});

test("classifyError: oqim ichidagi xato (200 + tana) → transient; xabar kalitni o'z ichiga olmaydi", () => {
  const e = classifyMistralError(200, '{"object":"error","message":"stream interrupted"}', H(), NOW);
  assert.equal(e.kind, "transient");
  assert.ok(e.message.startsWith("mistral 200:"));
  assert.ok(e.message.length <= 500);
});

test("adapter.classifyError — shartnoma imzosi bilan ishlaydi", () => {
  assert.equal(mistralAdapter.classifyError(429, '{"message":"Requests rate limit exceeded"}', H({ "retry-after": "1" })).kind, "rate_limited");
});

console.log(`mistral adapter: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
