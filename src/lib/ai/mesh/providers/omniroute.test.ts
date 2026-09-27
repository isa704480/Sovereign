/**
 * Lokal test (tarmoqsiz, kalitsiz): npx tsx --conditions=react-server src/lib/ai/mesh/providers/omniroute.test.ts
 * OmniRoute adapteri: env aniqlash, offers/resolve, classifyError jadvali (docs/MESH.md §2.1), served model.
 */
import assert from "node:assert/strict";
import {
  classifyOmniRouteError,
  isOmniRouteId,
  nextUtcMidnight,
  omniServedFromHeaders,
  omnirouteAdapter,
  readOmniServedModel,
  resolveOmniRoute,
} from "./omniroute";

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

const NOW = Date.UTC(2026, 8, 27, 13, 30, 0); // 2026-09-27 13:30 UTC
const H = (h: Record<string, string> = {}) => new Headers(h);
const json = (o: unknown) => JSON.stringify(o);
const cls = (status: number, body: string, headers = H()) => classifyOmniRouteError(status, body, headers, NOW);

const ENV_KEYS = ["OMNIROUTE_BASE_URL", "OMNIROUTE_API_KEY", "OMNIROUTE_MODEL"] as const;
const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
function withEnv(env: Partial<Record<(typeof ENV_KEYS)[number], string>>, fn: () => void) {
  for (const k of ENV_KEYS) delete process.env[k];
  Object.assign(process.env, env);
  try {
    fn();
  } finally {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

/* ---------------- enabled / endpoint ---------------- */

test("enabled: ikkala env kerak", () => {
  withEnv({}, () => assert.equal(omnirouteAdapter.enabled(), false));
  withEnv({ OMNIROUTE_BASE_URL: "https://omni.example.test/v1" }, () => assert.equal(omnirouteAdapter.enabled(), false));
  withEnv({ OMNIROUTE_API_KEY: "test-key" }, () => assert.equal(omnirouteAdapter.enabled(), false));
  withEnv({ OMNIROUTE_BASE_URL: "  ", OMNIROUTE_API_KEY: "test-key" }, () => assert.equal(omnirouteAdapter.enabled(), false));
  withEnv({ OMNIROUTE_BASE_URL: "https://omni.example.test/v1", OMNIROUTE_API_KEY: "test-key" }, () =>
    assert.equal(omnirouteAdapter.enabled(), true),
  );
});

test("endpoint: /chat/completions, oxiridagi / olib tashlanadi, Bearer", () => {
  withEnv({ OMNIROUTE_BASE_URL: "https://omni.example.test/v1/", OMNIROUTE_API_KEY: "test-key" }, () => {
    const e = omnirouteAdapter.endpoint();
    assert.equal(e.url, "https://omni.example.test/v1/chat/completions");
    assert.equal(e.headers.Authorization, "Bearer test-key");
  });
});

test("metadata: host, aggregator, rescue emas, perModel limit, manba sanasi", () => {
  assert.equal(omnirouteAdapter.id, "omniroute");
  assert.equal(omnirouteAdapter.host, "omniroute");
  assert.equal(omnirouteAdapter.aggregator, true);
  assert.notEqual(omnirouteAdapter.rescue, true);
  assert.equal(omnirouteAdapter.limits.perModel, true);
  assert.match(omnirouteAdapter.limits.source, /github\.com\/diegosouzapw\/OmniRoute.*\(2026-09-27\)/);
});

/* ---------------- offers ---------------- */

test("offers: auto/coding:free — kod, tekin, tool-calling", () => {
  withEnv({}, () => {
    const o = omnirouteAdapter.offers.find((x) => x.wire === "auto/coding:free");
    assert.ok(o);
    assert.equal(o.class, "code");
    assert.equal(o.cost, "free");
    assert.equal(o.caps.tools, true);
    assert.equal(o.caps.stream, true);
  });
});

test("offers: Groq Qwen 3.8 27B — katalog qwen3-8-27b bilan bir xil og'irlik, free tarif", () => {
  const o = omnirouteAdapter.offers.find((x) => x.wire === "groq/qwen/qwen3.8-27b");
  assert.ok(o);
  assert.ok(o.sovereignIds.includes("qwen3-8-27b"));
  assert.ok(o.sovereignIds.includes("qwen/qwen3.8-27b"));
  assert.equal(o.minTier, "free");
});

test("offers: Kimi K2.6 — pullik flagship, faqat Pro+ o'rinbosar", () => {
  const o = omnirouteAdapter.offers.find((x) => x.wire === "openrouter/moonshotai/kimi-k2.6");
  assert.ok(o);
  assert.equal(o.class, "flagship");
  assert.equal(o.cost, "paid");
  assert.equal(o.minTier, "pro");
});

test("offers: halollik — wire takrorlanmaydi, har offer o'z wire'ini yoki katalog id'ini beradi", () => {
  const wires = omnirouteAdapter.offers.map((o) => o.wire);
  assert.equal(new Set(wires).size, wires.length);
  for (const o of omnirouteAdapter.offers) assert.ok(o.sovereignIds.length > 0, o.wire);
  // Llama 3.3 so'rovi OmniRoute'da aynan-model sifatida hech qaysi offerda yo'q (auto/gemini — o'rinbosar).
  assert.ok(!omnirouteAdapter.offers.some((o) => o.sovereignIds.includes("meta-llama/llama-3.3-70b-instruct")));
});

test("offers: OMNIROUTE_MODEL ro'yxatda bo'lmasa qo'shiladi, bo'lsa takrorlanmaydi", () => {
  withEnv({ OMNIROUTE_MODEL: "auto/llama" }, () => {
    const o = omnirouteAdapter.offers.find((x) => x.wire === "auto/llama");
    assert.ok(o);
    assert.equal(o.cost, "free");
  });
  withEnv({ OMNIROUTE_MODEL: "auto/gemini" }, () => {
    assert.equal(omnirouteAdapter.offers.filter((x) => x.wire === "auto/gemini").length, 1);
  });
});

/* ---------------- resolve ---------------- */

test("resolve: katalog id'lari", () => {
  assert.equal(isOmniRouteId("auto"), true);
  assert.equal(isOmniRouteId("cloudflare/@cf/qwen/x"), false);
  assert.equal(isOmniRouteId("claude-opus-5"), false);
  assert.equal(resolveOmniRoute("claude-opus-5"), null);
  assert.equal(resolveOmniRoute("cloudflare/@cf/meta/llama"), null);
  // Katalog providerModel ("vendor/model") — OpenRouter adapteriniki, OmniRoute dinamik offer bermaydi.
  assert.equal(resolveOmniRoute("anthropic/claude-opus-5"), null);
  assert.equal(resolveOmniRoute("openai/gpt-4o"), null);
  // Statik offer katalog providerModel orqali ham topiladi.
  assert.equal(resolveOmniRoute("z-ai/glm-5.2")?.wire, "openrouter/z-ai/glm-5.2");
  // Statik offer qaytadi.
  assert.equal(resolveOmniRoute("glm-5-2")?.wire, "openrouter/z-ai/glm-5.2");
  const dyn = resolveOmniRoute("dva/claude-opus-5-high");
  assert.ok(dyn);
  assert.equal(dyn.wire, "dva/claude-opus-5-high");
  assert.equal(dyn.class, "flagship");
  assert.equal(dyn.cost, "paid");
  assert.equal(dyn.minTier, "pro");
  assert.equal(dyn.caps.tools, false);
  const free = resolveOmniRoute("openrouter/qwen/qwen3-coder:free");
  assert.equal(free?.cost, "free");
  assert.equal(free?.class, "code");
  assert.equal(resolveOmniRoute("groq/llama-3.3-70b-versatile")?.cost, "free");
});

/* ---------------- classifyError ---------------- */

test("transient: tarmoq (0), 500/504 — butun provayder", () => {
  assert.deepEqual([cls(0, "").kind, cls(0, "").scope], ["transient", "provider"]);
  assert.equal(cls(500, "Internal Server Error").kind, "transient");
  assert.equal(cls(504, "<html>Gateway Timeout</html>").scope, "provider");
});

test("503 resource pressure — transient (provider), onFailure watchdog signali", () => {
  const e = cls(503, json({ error: { message: "Service unavailable: resource pressure (heap 92%)" } }));
  assert.equal(e.kind, "transient");
  assert.equal(e.scope, "provider");
  assert.match(e.message, /resource pressure/);
});

test("502 'All upstream providers failed' (JSON) — transient, faqat shu model", () => {
  const e = cls(502, json({ error: { message: "All upstream providers failed", type: "upstream_error" } }));
  assert.equal(e.kind, "transient");
  assert.equal(e.scope, "model");
  // Railway proksi (JSON'siz) — butun OmniRoute.
  assert.equal(cls(502, "Application failed to respond").scope, "provider");
});

test("429 Retry-After (soniya / ms / Groq reset) — rate_limited, model scope", () => {
  const body = json({ error: { message: "Rate limit reached for model qwen/qwen3.8-27b in organization on requests per minute (RPM)", code: "rate_limit_exceeded" } });
  const a = cls(429, body, H({ "retry-after": "7" }));
  assert.deepEqual([a.kind, a.scope, a.retryAfterMs], ["rate_limited", "model", 7000]);
  assert.equal(cls(429, body, H({ "retry-after-ms": "1500" })).retryAfterMs, 1500);
  assert.equal(cls(429, body, H({ "x-ratelimit-reset-requests": "2m59.56s", "x-ratelimit-reset-tokens": "7.66s" })).retryAfterMs, 179560);
  const date = new Date(NOW + 30_000).toUTCString();
  assert.equal(cls(429, body, H({ "retry-after": date })).retryAfterMs, 30_000);
  assert.equal(cls(429, "Too Many Requests").retryAfterMs, undefined);
});

test("429 kunlik kvota — quota_exhausted, resetAt (sarlavha yoki 00:00 UTC), kredit emas", () => {
  // OpenRouter :free kunlik limiti (OmniRoute orqali o'tadi) — "credits" so'zi bor, lekin bu kvota.
  const orDaily = json({
    error: { message: "Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day", code: 429 },
  });
  const reset = NOW + 5 * 3600_000;
  const a = cls(429, orDaily, H({ "x-ratelimit-reset": String(reset) }));
  assert.deepEqual([a.kind, a.scope, a.resetAt], ["quota_exhausted", "model", reset]);
  // epoch soniya
  assert.equal(cls(429, orDaily, H({ "x-ratelimit-reset": String(Math.floor(reset / 1000)) })).resetAt, Math.floor(reset / 1000) * 1000);
  // sarlavhasiz — keyingi 00:00 UTC
  assert.equal(cls(429, orDaily).resetAt, Date.UTC(2026, 8, 28));
  assert.equal(nextUtcMidnight(NOW), Date.UTC(2026, 8, 28));
  // Groq TPD: "tokens per day (TPD)"
  const groqTpd = json({ error: { message: "Rate limit reached for model openai/gpt-oss-120b on tokens per day (TPD): Limit 200000, Used 199990", code: "rate_limit_exceeded" } });
  const g = cls(429, groqTpd, H({ "retry-after": "3600" }));
  assert.equal(g.kind, "quota_exhausted");
  assert.equal(g.resetAt, NOW + 3600_000);
});

test("oqim ichidagi xato (200 + tana)", () => {
  assert.equal(cls(200, json({ error: { message: "Provider returned error", code: 429 } })).kind, "rate_limited");
  assert.equal(cls(200, json({ error: { message: "stream interrupted" } })).kind, "transient");
  assert.equal(cls(200, json({ error: { message: "This request requires more credits, or fewer max_tokens. You requested up to 4096 tokens, but can only afford 1234.", code: 402 } })).affordTokens, 1234);
});

test("402 / kredit — no_credit (model scope), affordTokens", () => {
  const a = cls(402, json({ error: { message: "Insufficient credits. Add more using https://openrouter.ai/settings/credits", code: 402 } }));
  assert.deepEqual([a.kind, a.scope, a.affordTokens], ["no_credit", "model", undefined]);
  const b = cls(402, json({ error: { message: "You requested up to 8000 tokens, but can only afford 777." } }));
  assert.equal(b.affordTokens, 777);
  assert.equal(cls(400, json({ error: { message: "insufficient_quota: billing hard limit" } })).kind, "no_credit");
});

test("401/403 auth — OmniRoute kaliti (provider) vs upstream ulanish (model); mintaqa → unavailable", () => {
  const own = cls(401, json({ error: { message: "Invalid API key" } }));
  assert.deepEqual([own.kind, own.scope], ["auth", "provider"]);
  const up = cls(401, json({ error: { message: "Upstream groq: invalid api key for connection" } }));
  assert.deepEqual([up.kind, up.scope], ["auth", "model"]);
  const geo = cls(403, json({ error: { message: "Country, region, or territory not supported", code: "unsupported_country_region_territory" } }));
  assert.deepEqual([geo.kind, geo.scope], ["unavailable", "model"]);
});

test("404 / model yo'q / ulanish yo'q — unavailable (model scope)", () => {
  const a = cls(404, json({ error: { message: "The model `foo/bar` does not exist" } }));
  assert.deepEqual([a.kind, a.scope], ["unavailable", "model"]);
  assert.equal(cls(400, json({ error: { message: "model_decommissioned: llama3-70b-8192 has been decommissioned" } })).kind, "unavailable");
  assert.equal(cls(400, json({ error: { message: "No active credentials for provider cfp" } })).kind, "unavailable");
  // Model tool'ni qo'llamaydi — imkoniyat mos kelmadi (regress #4): 6 soat hamma uchun blok EMAS.
  const nt = cls(400, json({ error: { message: "This model does not support tools" } }));
  assert.deepEqual([nt.kind, nt.scope, nt.capability], ["unsupported", "model", "tools"]);
});

test("413 / kontekst — context_length; boshqa 400/422 — bad_request", () => {
  assert.equal(cls(413, "Payload Too Large").kind, "context_length");
  assert.equal(cls(400, json({ error: { message: "This model's maximum context length is 131072 tokens" } })).kind, "context_length");
  const b = cls(400, json({ error: { message: "messages[0].role must be one of system,user,assistant" } }));
  assert.equal(b.kind, "bad_request");
  assert.equal(cls(422, json({ detail: "Unprocessable" })).kind, "bad_request");
  // Xabar 300 belgigacha qisqartiriladi.
  assert.ok(cls(400, "x".repeat(1000)).message.length <= 300);
});

test("adapter.classifyError — xuddi shu jadval (Date.now bilan)", () => {
  assert.equal(omnirouteAdapter.classifyError(429, json({ error: { message: "rate limit" } }), H({ "retry-after": "2" })).retryAfterMs, 2000);
});

/* ---------------- served / onFailure ---------------- */

test("readServedModel: bo'lakdagi model; auto/* aks-sadosi — null", () => {
  assert.equal(readOmniServedModel({ model: "openai/gpt-oss-120b", choices: [] }), "openai/gpt-oss-120b");
  assert.equal(readOmniServedModel({ model: "auto/best-free" }), null);
  assert.equal(readOmniServedModel({ model: "" }), null);
  assert.equal(readOmniServedModel(null), null);
  assert.equal(omnirouteAdapter.readServedModel?.({ model: "glm-5.2" }), "glm-5.2");
});

test("omniServedFromHeaders: X-OmniRoute-Model + Provider", () => {
  assert.equal(omniServedFromHeaders(H({ "x-omniroute-model": "qwen/qwen3.8-27b", "x-omniroute-provider": "groq" })), "groq/qwen/qwen3.8-27b");
  assert.equal(omniServedFromHeaders(H({ "x-omniroute-model": "groq/qwen/qwen3.8-27b", "x-omniroute-provider": "groq" })), "groq/qwen/qwen3.8-27b");
  assert.equal(omniServedFromHeaders(H({ "x-omniroute-model": "auto/best-free" })), null);
  assert.equal(omniServedFromHeaders(H()), null);
});

test("onFailure: hech qachon otmaydi; pressure bo'lmasa watchdog chaqirilmaydi", () => {
  assert.doesNotThrow(() => omnirouteAdapter.onFailure?.(429, cls(429, "rate limit")));
  assert.doesNotThrow(() => omnirouteAdapter.onFailure?.(502, cls(502, "Application failed to respond")));
});

console.log(`${failed ? "✕" : "✓"} omniroute adapter: ${passed} o'tdi, ${failed} yiqildi`);
if (failed) process.exit(1);
