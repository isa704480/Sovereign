/**
 * Lokal test (tarmoqsiz, kalitsiz): npx tsx --conditions=react-server src/lib/ai/mesh/providers/openrouter.test.ts
 * OpenRouter adapteri: env aniqlash, offers, transformBody, classifyError (docs/MESH.md §2.1).
 */
import assert from "node:assert/strict";
import { classifyOpenRouterError, nextUtcMidnight, openrouterAdapter, openrouterWireOf, freeFallbacksFor } from "./openrouter";

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

const NOW = Date.UTC(2026, 8, 27, 15, 30, 0); // 2026-09-27 15:30 UTC
const H = (h: Record<string, string> = {}) => new Headers(h);
const orErr = (code: number, message: string, metadata?: Record<string, unknown>) =>
  JSON.stringify({ error: { code, message, ...(metadata ? { metadata } : {}) } });
const cls = (status: number, body: string, headers = H()) => classifyOpenRouterError(status, body, headers, NOW);

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const prev: Record<string, string | undefined> = {};
  for (const k of Object.keys(vars)) {
    prev[k] = process.env[k];
    if (vars[k] === undefined) delete process.env[k];
    else process.env[k] = vars[k];
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

/* ---------------- enabled / endpoint / limits ---------------- */

test("enabled(): OPENROUTER_API_KEY bo'lsa true, yo'q/bo'sh bo'lsa false", () => {
  withEnv({ OPENROUTER_API_KEY: undefined }, () => assert.equal(openrouterAdapter.enabled(), false));
  withEnv({ OPENROUTER_API_KEY: "   " }, () => assert.equal(openrouterAdapter.enabled(), false));
  withEnv({ OPENROUTER_API_KEY: "sk-or-test" }, () => assert.equal(openrouterAdapter.enabled(), true));
});

test("endpoint(): chat/completions, Bearer, HTTP-Referer va X-Title", () => {
  withEnv({ OPENROUTER_API_KEY: " sk-or-test ", NEXT_PUBLIC_SITE_URL: "https://example.test" }, () => {
    const { url, headers } = openrouterAdapter.endpoint();
    assert.equal(url, "https://openrouter.ai/api/v1/chat/completions");
    assert.equal(headers.Authorization, "Bearer sk-or-test");
    assert.equal(headers["HTTP-Referer"], "https://example.test");
    assert.equal(headers["X-Title"], "SOVEREIGN AI");
  });
});

test("id/host/aggregator va limits (manba + sana, OPENROUTER_FREE_RPD)", () => {
  assert.equal(openrouterAdapter.id, "openrouter");
  assert.equal(openrouterAdapter.host, "openrouter");
  assert.equal(openrouterAdapter.aggregator, true);
  assert.ok(!openrouterAdapter.rescue);
  withEnv({ OPENROUTER_FREE_RPD: undefined }, () => {
    const l = openrouterAdapter.limits;
    assert.equal(l.rpm, 20);
    assert.equal(l.rpd, 50);
    assert.equal(l.dailyUnits, 50);
    assert.equal(l.unit, "requests");
    assert.match(l.source, /^https:\/\/openrouter\.ai\/docs\/api-reference\/limits \(\d{4}-\d{2}-\d{2}\)$/);
  });
  withEnv({ OPENROUTER_FREE_RPD: "1000" }, () => assert.equal(openrouterAdapter.limits.rpd, 1000));
});

/* ---------------- offers ---------------- */

const offer = (wire: string) => {
  const o = openrouterAdapter.offers.find((x) => x.wire === wire);
  assert.ok(o, `offer yo'q: ${wire}`);
  return o;
};

test("offer: Claude Sonnet 4.5 — flagship, pullik, pro, tools+vision", () => {
  const o = offer("anthropic/claude-sonnet-4.5");
  assert.ok(o.sovereignIds.includes("claude-sonnet-4-5"));
  assert.ok(o.sovereignIds.includes("openrouter/anthropic/claude-sonnet-4.5"));
  assert.equal(o.class, "flagship");
  assert.equal(o.cost, "paid");
  assert.equal(o.minTier, "pro");
  assert.deepEqual(o.caps, { stream: true, tools: true, vision: true, json: true });
});

test("offer: Llama 3.3 :free — free sinf, tekin, vositasiz", () => {
  const o = offer("meta-llama/llama-3.3-70b-instruct:free");
  assert.ok(o.sovereignIds.includes("llama-3.3-free"));
  assert.equal(o.class, "free");
  assert.equal(o.cost, "free");
  assert.equal(o.caps.tools, false);
});

test("offer: DeepSeek V4 Flash (Auto/region zaxirasi) — openrouter/ prefiksli id bilan", () => {
  const o = offer("deepseek/deepseek-v4-flash");
  assert.ok(o.sovereignIds.includes("openrouter/deepseek/deepseek-v4-flash"));
  assert.equal(o.class, "fast");
  assert.equal(o.cost, "cheap");
  assert.equal(o.minTier, "starter");
});

test("offer: gpt-4o katalogda ikki marta — bitta offer, ikkala id", () => {
  const all = openrouterAdapter.offers.filter((x) => x.wire === "openai/gpt-4o");
  assert.equal(all.length, 1);
  assert.ok(all[0].sovereignIds.includes("gpt-4o") && all[0].sovereignIds.includes("gpt-4o-full"));
});

test("offer: Tella va Perplexity research yo'q, wire'lar takrorlanmaydi", () => {
  const wires = openrouterAdapter.offers.map((o) => o.wire);
  assert.ok(!wires.some((w) => /tella|^sonar/.test(w)));
  assert.equal(new Set(wires).size, wires.length);
});

/* ---------------- resolve ---------------- */

test("resolve(): katalogda yo'q vendor/model — dinamik offer; begona host va Tella — null", () => {
  const r = openrouterAdapter.resolve!("openrouter/qwen/qwen3-coder:free");
  assert.ok(r);
  assert.equal(r.wire, "qwen/qwen3-coder:free");
  assert.equal(r.cost, "free");
  assert.equal(r.class, "code");
  assert.equal(openrouterAdapter.resolve!("claude-sonnet-4-5"), null); // statik offer'da bor
  assert.equal(openrouterAdapter.resolve!("groq/qwen/qwen3.8-27b"), null);
  assert.equal(openrouterAdapter.resolve!("auto/best-free"), null);
  assert.equal(openrouterAdapter.resolve!("tella-2"), null);
  assert.equal(openrouterWireOf("cloudflare/@cf/qwen/x"), null);
});

/* ---------------- transformBody / readServedModel ---------------- */

test("transformBody: middle-out + route fallback; tekin modelga models puli (mintaqa xavfsiz)", () => {
  const o = offer("meta-llama/llama-3.3-70b-instruct:free");
  const body = { model: o.wire, messages: [{ role: "user", content: "salom" }], stream: true };
  const out = openrouterAdapter.transformBody!(body, o);
  assert.deepEqual(out.transforms, ["middle-out"]);
  assert.equal(out.route, "fallback");
  const models = out.models as string[];
  assert.equal(models[0], o.wire);
  assert.ok(models.length >= 2 && models.length <= 3);
  // Llama (meta: faqat sanksiya) zaxirasi Gemini (Google: RU/CN ham) bo'lishi mumkin emas.
  assert.ok(!models.some((m) => /gemini/.test(m)), models.join(","));
  assert.equal(body.messages.length, 1); // kirish tanasi o'zgarmaydi
  assert.equal((body as Record<string, unknown>).transforms, undefined);
});

test("transformBody: vosita so'rovi va pullik modelda models puli yo'q", () => {
  assert.deepEqual(freeFallbacksFor("meta-llama/llama-3.3-70b-instruct:free", { messages: [], tools: [{}] }), []);
  const o = offer("openai/gpt-4o");
  const out = openrouterAdapter.transformBody!({ model: o.wire, messages: [] }, o);
  assert.equal(out.models, undefined);
});

test("transformBody: Anthropic uzun system prompt — cache_control", () => {
  const o = offer("anthropic/claude-sonnet-4.5");
  const long = "x".repeat(2500);
  const out = openrouterAdapter.transformBody!({ model: o.wire, messages: [{ role: "system", content: long }, { role: "user", content: "hi" }] }, o);
  const sys = out.messages[0] as { content: { cache_control?: unknown }[] };
  assert.deepEqual(sys.content[0].cache_control, { type: "ephemeral" });
});

test("readServedModel: chunk.model", () => {
  assert.equal(openrouterAdapter.readServedModel!({ model: "google/gemma-4-31b-it:free", choices: [] }), "google/gemma-4-31b-it:free");
  assert.equal(openrouterAdapter.readServedModel!({ choices: [] }), null);
  assert.equal(openrouterAdapter.readServedModel!(null), null);
});

/* ---------------- classifyError ---------------- */

test("402 insufficient credits → no_credit, faqat $paid hovuzi (:free modellar bloklanmaydi)", () => {
  const e = cls(402, orErr(402, "Insufficient credits. Add more using https://openrouter.ai/credits"));
  assert.equal(e.kind, "no_credit");
  assert.equal(e.scope, "provider");
  assert.equal(e.pool, "paid", "regress #5: butun provayder emas — pullik hovuz");
  assert.equal(e.affordTokens, undefined);
  // Manfiy balans / kalit limiti — :free ham rad etiladi → butun provayder (hovuzsiz).
  assert.equal(cls(402, orErr(402, "Your account has a negative credit balance")).pool, undefined);
});

test("402 can only afford N → no_credit + affordTokens", () => {
  const e = cls(402, orErr(402, "This request requires more credits, or fewer max_tokens. You requested up to 4096 tokens, but can only afford 1234. To increase, visit https://openrouter.ai/settings/credits"));
  assert.equal(e.kind, "no_credit");
  assert.equal(e.affordTokens, 1234);
});

test("oqim ichidagi xato (HTTP 200 + error.code 402) → no_credit", () => {
  const chunk = `data: ${JSON.stringify({ id: "x", object: "chat.completion.chunk", error: { code: 402, message: "Insufficient credits" }, choices: [{ finish_reason: "error" }] })}`;
  assert.equal(cls(200, chunk).kind, "no_credit");
});

test("429 free-models-per-day → quota_exhausted, resetAt X-RateLimit-Reset (metadata.headers, ms)", () => {
  const reset = Date.UTC(2026, 8, 28, 0, 0, 0);
  const e = cls(
    429,
    orErr(429, "Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day", {
      headers: { "X-RateLimit-Limit": "50", "X-RateLimit-Remaining": "0", "X-RateLimit-Reset": String(reset) },
    }),
  );
  assert.equal(e.kind, "quota_exhausted"); // "credits" so'zi bor, lekin no_credit EMAS
  assert.equal(e.resetAt, reset);
  assert.equal(e.pool, "free", "butun hisobning :free modellari — umumiy $free hovuzi reset gacha");
});

test("429 free-models-per-day, sarlavhasiz → keyingi 00:00 UTC", () => {
  const e = cls(429, orErr(429, "Rate limit exceeded: free-models-per-day"));
  assert.equal(e.resetAt, nextUtcMidnight(NOW));
  assert.equal(e.resetAt, Date.UTC(2026, 8, 28));
});

test("429 free-models-per-min → rate_limited, retryAfter sarlavhadan (X-RateLimit-Reset ms)", () => {
  const e = cls(429, orErr(429, "Rate limit exceeded: free-models-per-min."), H({ "X-RateLimit-Reset": String(NOW + 42_000) }));
  assert.equal(e.kind, "rate_limited");
  assert.equal(e.retryAfterMs, 42_000);
  assert.equal(e.scope, "model");
});

test("429 upstream (provider_name, raw) → rate_limited model scope, Retry-After soniya", () => {
  const e = cls(
    429,
    orErr(429, "Provider returned error", { raw: "google/gemini-2.0-flash-exp:free is temporarily rate-limited upstream. Please retry shortly", provider_name: "Google AI Studio" }),
    H({ "retry-after": "7" }),
  );
  assert.equal(e.kind, "rate_limited");
  assert.equal(e.retryAfterMs, 7000);
  assert.equal(e.scope, "model");
  assert.match(e.message, /Google AI Studio/);
});

test("429 umumiy (hisob) → rate_limited provider scope, retryAfter yo'q", () => {
  const e = cls(429, orErr(429, "You are being rate limited"));
  assert.equal(e.kind, "rate_limited");
  assert.equal(e.scope, "provider");
  assert.equal(e.retryAfterMs, undefined);
});

test("401 / 403 kalit → auth; 403 moderation → bad_request; 403 key limit → no_credit", () => {
  assert.equal(cls(401, orErr(401, "No auth credentials found")).kind, "auth");
  assert.equal(cls(403, orErr(403, "Forbidden")).kind, "auth");
  assert.equal(cls(403, orErr(403, "Input was flagged by moderation", { reasons: ["x"] })).kind, "bad_request");
  assert.equal(cls(403, orErr(403, "Key limit exceeded (total limit). Manage it using https://openrouter.ai/settings/keys")).kind, "no_credit");
});

test("404 / no endpoints → unavailable (model); 'support tool use' → unsupported", () => {
  const a = cls(404, orErr(404, "No endpoints found for x-ai/grok-9."));
  assert.equal(a.kind, "unavailable");
  assert.equal(a.scope, "model");
  assert.equal(cls(400, orErr(400, "foo/bar is not a valid model ID")).kind, "unavailable");
  const t = cls(404, orErr(404, "No endpoints found that support tool use."));
  assert.deepEqual([t.kind, t.capability], ["unsupported", "tools"], "imkoniyat mos kelmadi — sog'liq o'zgarmaydi");
  assert.equal(cls(404, orErr(404, "No endpoints found that support image input")).capability, "vision");
});

test("kontekst: 413 va 400 context_length_exceeded → context_length", () => {
  assert.equal(cls(413, "Payload Too Large").kind, "context_length");
  assert.equal(
    cls(400, orErr(400, "Provider returned error", { error_type: "context_length_exceeded", raw: "This model's maximum context length is 131072 tokens" })).kind,
    "context_length",
  );
});

test("vaqtinchalik: 0, 408, 500, 502, 503, 504, 529 → transient", () => {
  for (const s of [0, 408, 500, 502, 503, 504, 529]) assert.equal(cls(s, "").kind, "transient", String(s));
  assert.equal(cls(503, orErr(503, "No available model provider that meets your routing requirements")).kind, "transient");
});

test("400/422 boshqa → bad_request; xabar 500 belgidan oshmaydi", () => {
  assert.equal(cls(400, orErr(400, "messages: field required")).kind, "bad_request");
  assert.equal(cls(422, "{}").kind, "bad_request");
  assert.ok(cls(400, "x".repeat(2000)).message.length <= 500);
});

console.log(`${failed ? "✕" : "✓"} openrouter adapter: ${passed} o'tdi, ${failed} yiqildi`);
if (failed) process.exit(1);
