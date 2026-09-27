/**
 * Lokal test (tarmoqsiz, kalitsiz): npx tsx --conditions=react-server src/lib/ai/mesh/providers/openai.test.ts
 * OpenAI va Perplexity mesh adapterlari: env aniqlash, offerlar, tanani moslash, classifyError.
 */
import assert from "node:assert/strict";
import {
  classifyOpenAIError,
  openaiAdapter,
  openaiOffersAt,
  openaiTransformBody,
  parseOpenAIDuration,
} from "./openai";
import { classifyPerplexityError, perplexityAdapter, perplexityTransformBody } from "./perplexity";
import { hostAllowedIn, modelAllowedIn } from "../../region";

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

const NOW = Date.UTC(2026, 8, 27, 12, 0, 0);
const H = (h: Record<string, string> = {}) => new Headers(h);
const oaErr = (message: string, type: string, code: string | null) => JSON.stringify({ error: { message, type, param: null, code } });

function withEnv(env: Record<string, string | undefined>, fn: () => void) {
  const prev: Record<string, string | undefined> = {};
  for (const k of Object.keys(env)) {
    prev[k] = process.env[k];
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
  try {
    fn();
  } finally {
    for (const k of Object.keys(prev)) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  }
}

/* ---------------- OpenAI ---------------- */

test("openai: enabled() faqat OPENAI_API_KEY bo'lsa", () => {
  withEnv({ OPENAI_API_KEY: undefined }, () => assert.equal(openaiAdapter.enabled(), false));
  withEnv({ OPENAI_API_KEY: "   " }, () => assert.equal(openaiAdapter.enabled(), false));
  withEnv({ OPENAI_API_KEY: "sk-test-fake" }, () => {
    assert.equal(openaiAdapter.enabled(), true);
    const ep = openaiAdapter.endpoint();
    assert.equal(ep.url, "https://api.openai.com/v1/chat/completions");
    assert.equal(ep.headers.Authorization, "Bearer sk-test-fake");
  });
});

test("openai: id/host region siyosatida", () => {
  assert.equal(openaiAdapter.id, "openai");
  assert.equal(openaiAdapter.host, "openai");
  assert.equal(hostAllowedIn("openai", null), true);
  assert.equal(hostAllowedIn("openai", "RU"), false);
  assert.equal(modelAllowedIn(openaiAdapter.displayId!("gpt-4o"), "RU"), false);
});

test("openai: gpt-4o / gpt-4o-mini / gpt-6-astra offerlari", () => {
  const offers = openaiOffersAt(NOW);
  const by = (w: string) => offers.find((o) => o.wire === w);
  const g4o = by("gpt-4o")!;
  assert.ok(g4o);
  assert.deepEqual(g4o.sovereignIds, ["gpt-4o", "gpt-4o-full", "openai/gpt-4o"]);
  assert.equal(g4o.class, "flagship");
  assert.equal(g4o.cost, "paid");
  assert.deepEqual(g4o.caps, { stream: true, tools: true, vision: true, json: true });

  const mini = by("gpt-4o-mini")!;
  assert.ok(mini.sovereignIds.includes("openai/gpt-4o-mini"));
  assert.equal(mini.class, "fast");
  assert.equal(mini.cost, "cheap");

  const astra = by("gpt-6-astra")!;
  assert.equal(astra.minTier, "ultra");
  assert.equal(astra.class, "flagship");

  // O'chirilgan / hujjatda yo'q modellar taklif qilinmaydi.
  assert.equal(by("o1-mini"), undefined);
  assert.equal(by("gpt-5.6-luna-pro"), undefined);
  // retiresAt ichki maydoni tashqariga chiqmaydi.
  assert.ok(offers.every((o) => !("retiresAt" in o)));
  // Barcha wire'lar yagona.
  assert.equal(new Set(offers.map((o) => o.wire)).size, offers.length);
});

test("openai: gpt-4-turbo 2026-10-23 dan keyin yo'qoladi", () => {
  assert.ok(openaiOffersAt(NOW).some((o) => o.wire === "gpt-4-turbo"));
  assert.ok(!openaiOffersAt(Date.UTC(2026, 9, 23)).some((o) => o.wire === "gpt-4-turbo"));
  assert.equal(openaiOffersAt(Date.UTC(2026, 9, 23)).length, openaiOffersAt(NOW).length - 1);
});

test("openai: transformBody — max_completion_tokens, reasoning'da temperature yo'q", () => {
  const offers = openaiOffersAt(NOW);
  const g4o = offers.find((o) => o.wire === "gpt-4o")!;
  const sol = offers.find((o) => o.wire === "gpt-5.6-sol")!;
  const body = { model: "x", messages: [{ role: "user", content: "hi" }], temperature: 0.7, max_tokens: 800, stream: true };
  const a = openaiTransformBody(body, g4o);
  assert.equal(a.model, "gpt-4o");
  assert.equal(a.max_tokens, undefined);
  assert.equal(a.max_completion_tokens, 800);
  assert.equal(a.temperature, 0.7);
  const b = openaiTransformBody(body, sol);
  assert.equal(b.model, "gpt-5.6-sol");
  assert.equal(b.temperature, undefined);
  assert.equal(b.max_completion_tokens, 800);
  // Asl tana o'zgarmaydi.
  assert.equal(body.max_tokens, 800);
});

test("openai: readServedModel / displayId", () => {
  assert.equal(openaiAdapter.readServedModel!({ model: "gpt-4o-2024-08-06" }), "openai/gpt-4o-2024-08-06");
  assert.equal(openaiAdapter.readServedModel!({}), null);
  assert.equal(openaiAdapter.displayId!("gpt-4o-mini"), "openai/gpt-4o-mini");
});

test("openai: davomiylik formati", () => {
  assert.equal(parseOpenAIDuration("1s"), 1000);
  assert.equal(parseOpenAIDuration("6m0s"), 360_000);
  assert.equal(parseOpenAIDuration("20ms"), 20);
  assert.equal(parseOpenAIDuration("1h2m3.5s"), 3_723_500);
  assert.equal(parseOpenAIDuration("56"), 56_000);
  assert.equal(parseOpenAIDuration(""), undefined);
  assert.equal(parseOpenAIDuration("soon"), undefined);
});

test("openai: 429 rate_limit_exceeded (TPM) → rate_limited, model scope, reset sarlavhasidan", () => {
  const e = classifyOpenAIError(
    429,
    oaErr("Rate limit reached for gpt-4o in organization org-x on tokens per min (TPM): Limit 30000, Used 29500, Requested 900. Please try again in 1.2s.", "tokens", "rate_limit_exceeded"),
    H({ "x-ratelimit-remaining-tokens": "0", "x-ratelimit-reset-tokens": "1.2s", "x-ratelimit-remaining-requests": "499", "x-ratelimit-reset-requests": "120ms" }),
    NOW,
  );
  assert.equal(e.kind, "rate_limited");
  assert.equal(e.scope, "model");
  assert.equal(e.retryAfterMs, 1200);
});

test("openai: 429 Retry-After sarlavhasi ustun", () => {
  const e = classifyOpenAIError(429, oaErr("Your request rate increased too quickly", "rate_limit_error", "slow_down"), H({ "retry-after": "56" }), NOW);
  assert.equal(e.kind, "rate_limited");
  assert.equal(e.retryAfterMs, 56_000);
});

test("openai: 429 sarlavhasiz — xabardagi 'try again in'", () => {
  const e = classifyOpenAIError(429, oaErr("Rate limit reached ... Please try again in 6m0s.", "requests", "rate_limit_exceeded"), H(), NOW);
  assert.equal(e.retryAfterMs, 360_000);
});

test("openai: 429 RPD → quota_exhausted + resetAt", () => {
  const e = classifyOpenAIError(
    429,
    oaErr("Rate limit reached for gpt-4o-mini in organization org-x on requests per day (RPD): Limit 200, Used 200, Requested 1.", "requests", "rate_limit_exceeded"),
    H({ "x-ratelimit-remaining-requests": "0", "x-ratelimit-reset-requests": "7h12m0s" }),
    NOW,
  );
  assert.equal(e.kind, "quota_exhausted");
  assert.equal(e.scope, "model");
  assert.equal(e.resetAt, NOW + (7 * 60 + 12) * 60_000);
});

test("openai: 429 insufficient_quota → no_credit (provider)", () => {
  const e = classifyOpenAIError(429, oaErr("You exceeded your current quota, please check your plan and billing details.", "insufficient_quota", "insufficient_quota"), H(), NOW);
  assert.equal(e.kind, "no_credit");
  assert.equal(e.scope, "provider");
});

test("openai: 400 billing_hard_limit_reached → no_credit", () => {
  const e = classifyOpenAIError(400, oaErr("Billing hard limit has been reached", "invalid_request_error", "billing_hard_limit_reached"), H(), NOW);
  assert.equal(e.kind, "no_credit");
});

test("openai: 401 / 403 region → auth", () => {
  assert.equal(classifyOpenAIError(401, oaErr("Incorrect API key provided: sk-****.", "invalid_request_error", "invalid_api_key"), H(), NOW).kind, "auth");
  assert.equal(classifyOpenAIError(403, oaErr("Country, region, or territory not supported", "request_forbidden", "unsupported_country_region_territory"), H(), NOW).kind, "auth");
});

test("openai: 404 model_not_found → unavailable (model)", () => {
  const e = classifyOpenAIError(404, oaErr("The model `o1-mini` does not exist or you do not have access to it.", "invalid_request_error", "model_not_found"), H(), NOW);
  assert.equal(e.kind, "unavailable");
  assert.equal(e.scope, "model");
});

test("openai: 400 context_length_exceeded → context_length; boshqa 400 → bad_request", () => {
  assert.equal(
    classifyOpenAIError(400, oaErr("This model's maximum context length is 128000 tokens. However, your messages resulted in 130000 tokens.", "invalid_request_error", "context_length_exceeded"), H(), NOW).kind,
    "context_length",
  );
  assert.equal(classifyOpenAIError(400, oaErr("Invalid value for 'temperature'", "invalid_request_error", "invalid_value"), H(), NOW).kind, "bad_request");
});

test("openai: 0 / 500 / 503 overloaded / HTML → transient", () => {
  assert.equal(classifyOpenAIError(0, "", H(), NOW).kind, "transient");
  assert.equal(classifyOpenAIError(500, oaErr("The server had an error while processing your request.", "server_error", null), H(), NOW).kind, "transient");
  assert.equal(classifyOpenAIError(503, oaErr("The requested model is temporarily overloaded", "service_unavailable_error", "server_is_overloaded"), H(), NOW).kind, "transient");
  assert.equal(classifyOpenAIError(502, "<html>Bad gateway</html>", H(), NOW).kind, "transient");
});

test("openai: adapter.classifyError xabarni 500 belgi bilan cheklaydi", () => {
  const e = openaiAdapter.classifyError(500, "x".repeat(2000), H());
  assert.equal(e.kind, "transient");
  assert.ok(e.message.length <= 500);
});

/* ---------------- Perplexity ---------------- */

test("perplexity: enabled() faqat PERPLEXITY_API_KEY bo'lsa; endpoint /v1/responses", () => {
  withEnv({ PERPLEXITY_API_KEY: undefined }, () => assert.equal(perplexityAdapter.enabled(), false));
  withEnv({ PERPLEXITY_API_KEY: "pplx-test-fake" }, () => {
    assert.equal(perplexityAdapter.enabled(), true);
    const ep = perplexityAdapter.endpoint();
    assert.equal(ep.url, "https://api.perplexity.ai/v1/responses");
    assert.equal(ep.headers.Authorization, "Bearer pplx-test-fake");
  });
  assert.equal(perplexityAdapter.protocol, "perplexity-responses");
});

test("perplexity: offerlar faqat research id'lari uchun", () => {
  const o = perplexityAdapter.offers;
  assert.equal(o.length, 2);
  const fast = o.find((x) => x.wire === "fast")!;
  const medium = o.find((x) => x.wire === "medium")!;
  assert.ok(fast.sovereignIds.includes("sonar-online") && fast.sovereignIds.includes("sonar"));
  assert.ok(medium.sovereignIds.includes("sonar-pro-online") && medium.sovereignIds.includes("sonar-pro"));
  assert.equal(medium.minTier, "ultra");
  assert.ok(o.every((x) => !x.caps.tools && !x.caps.vision && x.caps.stream));
  assert.equal(perplexityAdapter.displayId!("fast"), "perplexity/fast");
  assert.equal(perplexityAdapter.readServedModel!({ model: "some-vendor/x" }), null);
  assert.equal(modelAllowedIn("perplexity/fast", null), true);
});

test("perplexity: transformBody → Responses tanasi (preset, input, instructions)", () => {
  const medium = perplexityAdapter.offers.find((x) => x.wire === "medium")!;
  const out = perplexityTransformBody(
    {
      model: "ignored",
      messages: [
        { role: "system", content: "Be brief." },
        { role: "user", content: [{ type: "text", text: "Latest news?" }, { type: "image_url", image_url: { url: "data:x" } }] },
        { role: "assistant", content: "Earlier answer" },
        { role: "tool", content: "tool output" },
      ],
      max_tokens: 900,
      stream: true,
    },
    medium,
  ) as unknown as Record<string, unknown>;
  assert.equal(out.preset, "medium");
  assert.equal(out.instructions, "Be brief.");
  assert.equal(out.max_output_tokens, 900);
  assert.equal(out.stream, true);
  assert.equal("model" in out, false);
  assert.equal("messages" in out, false);
  assert.deepEqual(out.input, [
    { role: "user", content: "Latest news? " },
    { role: "assistant", content: "Earlier answer" },
  ]);
  const dflt = perplexityTransformBody({ model: "", messages: [] }, medium) as unknown as Record<string, unknown>;
  assert.equal(dflt.max_output_tokens, 1500);
});

test("perplexity: classifyError jadvali", () => {
  const pe = (m: string, extra: Record<string, unknown> = {}) => JSON.stringify({ error: { message: m, ...extra } });
  const rl = classifyPerplexityError(429, pe("Too Many Requests"), H({ "retry-after": "3" }));
  assert.equal(rl.kind, "rate_limited");
  assert.equal(rl.retryAfterMs, 3000);
  assert.equal(classifyPerplexityError(429, pe("Too Many Requests"), H()).retryAfterMs, 2000);
  assert.equal(classifyPerplexityError(402, pe("Payment Required"), H()).kind, "no_credit");
  assert.equal(classifyPerplexityError(401, pe("Insufficient credits. Please add credits to your account."), H()).kind, "no_credit");
  assert.equal(classifyPerplexityError(401, pe("Invalid API key"), H()).kind, "auth");
  assert.equal(classifyPerplexityError(403, "<html>Forbidden</html>", H()).kind, "auth");
  const un = classifyPerplexityError(400, pe("Invalid preset: 'huge'", { type: "invalid_request_error" }), H());
  assert.equal(un.kind, "unavailable");
  assert.equal(un.scope, "model");
  assert.equal(classifyPerplexityError(404, "Not Found", H()).kind, "unavailable");
  assert.equal(classifyPerplexityError(400, pe("Input is too long for the context window"), H()).kind, "context_length");
  assert.equal(classifyPerplexityError(400, pe("instructions must be a string"), H()).kind, "bad_request");
  assert.equal(classifyPerplexityError(500, pe("Internal error"), H()).kind, "transient");
  assert.equal(classifyPerplexityError(0, "", H()).kind, "transient");
  // Oqim ichidagi response.failed (status 200)
  const failedEv = JSON.stringify({ type: "response.failed", response: { status: "failed", error: { message: "upstream timeout" } } });
  const f = classifyPerplexityError(200, failedEv, H());
  assert.equal(f.kind, "transient");
  assert.equal(f.message, "upstream timeout");
});

console.log(`\nopenai/perplexity adapter: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
