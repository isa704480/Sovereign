/**
 * Lokal test (tarmoqsiz, kalitsiz, deterministik):
 *   npx tsx --conditions=react-server src/lib/ai/mesh/providers/cerebras.test.ts
 * Cerebras va SambaNova adapterlari: env aniqlash, offers, displayId/region, transformBody,
 * classifyError (§2.1 jadvali) va reset sarlavhalari.
 */
import assert from "node:assert/strict";
import { hostAllowedIn, modelAllowedIn } from "../../region";
import type { ChatBody } from "../types";
import { cerebrasAdapter, CEREBRAS_LIMITS, classifyCerebrasError, parseResetMs } from "./cerebras";
import { classifySambanovaError, sambanovaAdapter, SAMBANOVA_LIMITS } from "./sambanova";

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
const H = (o: Record<string, string> = {}) => new Headers(o);

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

/* ---------------- enabled / endpoint ---------------- */

test("cerebras: enabled() env bo'yicha (bo'sh/probel — yo'q)", () => {
  withEnv({ CEREBRAS_API_KEY: undefined }, () => assert.equal(cerebrasAdapter.enabled(), false));
  withEnv({ CEREBRAS_API_KEY: "   " }, () => assert.equal(cerebrasAdapter.enabled(), false));
  withEnv({ CEREBRAS_API_KEY: "test-key" }, () => assert.equal(cerebrasAdapter.enabled(), true));
});

test("sambanova: enabled() env bo'yicha", () => {
  withEnv({ SAMBANOVA_API_KEY: undefined }, () => assert.equal(sambanovaAdapter.enabled(), false));
  withEnv({ SAMBANOVA_API_KEY: "" }, () => assert.equal(sambanovaAdapter.enabled(), false));
  withEnv({ SAMBANOVA_API_KEY: "test-key" }, () => assert.equal(sambanovaAdapter.enabled(), true));
});

test("endpoint: URL va Bearer sarlavhasi", () => {
  withEnv({ CEREBRAS_API_KEY: "ck", SAMBANOVA_API_KEY: "sk" }, () => {
    const c = cerebrasAdapter.endpoint();
    assert.equal(c.url, "https://api.cerebras.ai/v1/chat/completions");
    assert.equal(c.headers.Authorization, "Bearer ck");
    const s = sambanovaAdapter.endpoint();
    assert.equal(s.url, "https://api.sambanova.ai/v1/chat/completions");
    assert.equal(s.headers.Authorization, "Bearer sk");
  });
});

test("id/host region.ts HOST_POLICY'da", () => {
  assert.equal(cerebrasAdapter.id, "cerebras");
  assert.equal(cerebrasAdapter.host, "cerebras");
  assert.equal(sambanovaAdapter.host, "sambanova");
  assert.ok(hostAllowedIn("cerebras", "UZ"));
  assert.ok(!hostAllowedIn("cerebras", "IR"));
});

/* ---------------- offers ---------------- */

const offer = (a: typeof cerebrasAdapter, wire: string) => a.offers.find((o) => o.wire === wire);

test("cerebras offers: qwen-3.8-27b va gpt-oss-120b (eski llama id'lari yo'q)", () => {
  const wires = cerebrasAdapter.offers.map((o) => o.wire).sort();
  assert.deepEqual(wires, ["gpt-oss-120b", "qwen-3.8-27b"]);
  const q = offer(cerebrasAdapter, "qwen-3.8-27b")!;
  assert.ok(q.sovereignIds.includes("qwen3-8-27b"));
  assert.ok(q.sovereignIds.includes("groq/qwen/qwen3.8-27b"));
  assert.equal(q.cost, "free");
  assert.equal(q.caps.tools, true);
  assert.equal(q.caps.vision, false); // faqat base64 — URL rasm 400 bo'lmasin
  const g = offer(cerebrasAdapter, "gpt-oss-120b")!;
  assert.ok(g.sovereignIds.includes("openai/gpt-oss-120b"));
  assert.ok(!cerebrasAdapter.offers.some((o) => /llama/i.test(o.wire)));
});

test("sambanova offers: Llama 3.3 halol sameModel, gemma — vision, tools yo'q", () => {
  const l = offer(sambanovaAdapter, "Meta-Llama-3.3-70B-Instruct")!;
  assert.ok(l.sovereignIds.includes("llama-3.3-free"));
  assert.ok(l.sovereignIds.includes("meta-llama/llama-3.3-70b-instruct"));
  assert.equal(l.class, "free");
  assert.equal(l.caps.tools, true);
  const gm = offer(sambanovaAdapter, "gemma-4-31B-it")!;
  assert.equal(gm.caps.vision, true);
  assert.equal(gm.caps.tools, false);
  const mm = offer(sambanovaAdapter, "MiniMax-M2.7")!;
  assert.equal(mm.cost, "cheap");
  // deepseek-r1-free (R1 Distill) endi SambaNova'da yo'q — o'rinbosar ham sameModel sifatida da'vo qilinmaydi.
  assert.ok(!sambanovaAdapter.offers.some((o) => o.sovereignIds.some((id) => /r1/i.test(id))));
  // Llama 3.3 ga boshqa model (gpt-oss) sameModel sifatida yozilmagan.
  assert.ok(!offer(sambanovaAdapter, "gpt-oss-120b")!.sovereignIds.some((id) => /llama/i.test(id)));
});

test("offers: wire id'lar takrorlanmaydi", () => {
  for (const a of [cerebrasAdapter, sambanovaAdapter]) {
    const w = a.offers.map((o) => o.wire);
    assert.equal(new Set(w).size, w.length, a.id);
  }
});

test("displayId → host/vendor/model, region qoidasi ishlaydi", () => {
  assert.equal(cerebrasAdapter.displayId!("qwen-3.8-27b"), "cerebras/qwen/qwen3.8-27b");
  assert.equal(sambanovaAdapter.displayId!("Meta-Llama-3.3-70B-Instruct"), "sambanova/meta-llama/llama-3.3-70b-instruct");
  assert.ok(modelAllowedIn(cerebrasAdapter.displayId!("gpt-oss-120b"), "RU"));
  assert.ok(!modelAllowedIn(cerebrasAdapter.displayId!("gpt-oss-120b"), "IR"));
  assert.ok(!modelAllowedIn(sambanovaAdapter.displayId!("gemma-4-31B-it"), "RU")); // Google qoidasi
});

test("limits: manba + sana, har model alohida", () => {
  assert.match(CEREBRAS_LIMITS.source, /cerebras\.ai.*\(2026-09-27\)/);
  assert.equal(CEREBRAS_LIMITS.perModel, true);
  assert.equal(CEREBRAS_LIMITS.dailyUnits, 1_000_000);
  assert.equal(CEREBRAS_LIMITS.unit, "tokens");
  assert.match(SAMBANOVA_LIMITS.source, /sambanova\.ai.*\(2026-09-27\)/);
  assert.equal(SAMBANOVA_LIMITS.rpd, 20);
  assert.equal(SAMBANOVA_LIMITS.unit, "requests");
});

/* ---------------- transformBody ---------------- */

test("transformBody: qo'llanmaydigan maydonlar olib tashlanadi, asl tana o'zgarmaydi", () => {
  const body: ChatBody = { model: "x", messages: [], n: 2, tool_stream: true, service_tier: "auto", tools: [{}], response_format: { type: "json_object" } };
  const c = cerebrasAdapter.transformBody!(body, cerebrasAdapter.offers[0]);
  assert.equal(c.n, undefined);
  assert.equal(c.tool_stream, undefined);
  assert.equal(c.service_tier, undefined);
  assert.equal(c.response_format, undefined);
  assert.equal(body.n, 2); // mutatsiya yo'q
  const s = sambanovaAdapter.transformBody!({ model: "x", messages: [], logit_bias: { 1: 2 }, n: 3, tools: [{}] }, sambanovaAdapter.offers[0]);
  assert.equal(s.logit_bias, undefined);
  assert.equal(s.n, undefined);
});

/* ---------------- parseResetMs ---------------- */

test("parseResetMs: soniya, davomiylik, epoch, HTTP sana", () => {
  assert.equal(parseResetMs("12.5", NOW), 12_500);
  assert.equal(parseResetMs("1m30s", NOW), 90_000);
  assert.equal(parseResetMs("250ms", NOW), 250);
  assert.equal(parseResetMs("2h", NOW), 7_200_000);
  assert.equal(parseResetMs(String(NOW / 1000 + 60), NOW), 60_000);
  assert.equal(parseResetMs(String(NOW + 5_000), NOW), 5_000);
  assert.equal(parseResetMs(new Date(NOW + 30_000).toUTCString(), NOW), 30_000);
  assert.equal(parseResetMs("", NOW), undefined);
  assert.equal(parseResetMs("soon", NOW), undefined);
});

/* ---------------- classifyError ---------------- */

const cer = (s: number, b: unknown, h: Record<string, string> = {}) =>
  classifyCerebrasError(s, typeof b === "string" ? b : JSON.stringify(b), H(h), NOW);
const sam = (s: number, b: unknown, h: Record<string, string> = {}) =>
  classifySambanovaError(s, typeof b === "string" ? b : JSON.stringify(b), H(h), NOW);

test("cerebras 429 minut (RPM) → rate_limited, model scope, reset sarlavhasidan", () => {
  const e = cer(
    429,
    { message: "Requests per minute limit exceeded - too many requests sent.", type: "too_many_requests_error", param: "quota", code: "request_quota_exceeded" },
    { "x-ratelimit-reset-requests-minute": "7.3", "x-ratelimit-remaining-requests-minute": "0" },
  );
  assert.equal(e.kind, "rate_limited");
  assert.equal(e.scope, "model");
  assert.equal(e.retryAfterMs, 7_300);
});

test("cerebras 429 + Retry-After ustun", () => {
  const e = cer(429, { message: "Too many requests", code: "request_quota_exceeded" }, { "retry-after": "3", "x-ratelimit-reset-tokens-minute": "40" });
  assert.equal(e.retryAfterMs, 3_000);
});

test("cerebras 429 kunlik (TPD) → quota_exhausted + resetAt", () => {
  const e = cer(
    429,
    { message: "Tokens per day limit exceeded - too many tokens processed.", type: "too_many_requests_error", code: "token_quota_exceeded" },
    { "x-ratelimit-reset-tokens-day": "33011.5" },
  );
  assert.equal(e.kind, "quota_exhausted");
  assert.equal(e.scope, "model");
  assert.equal(e.resetAt, NOW + 33_011_500);
});

test("cerebras 429 remaining-day=0 sarlavhasi → quota_exhausted", () => {
  const e = cer(429, { message: "Too many requests" }, { "x-ratelimit-remaining-requests-day": "0", "x-ratelimit-reset-requests-day": "3600" });
  assert.equal(e.kind, "quota_exhausted");
  assert.equal(e.resetAt, NOW + 3_600_000);
});

test("cerebras 429 soatlik (TPH) → rate_limited soat sarlavhasi bilan", () => {
  const e = cer(429, { message: "Tokens per hour limit exceeded" }, { "x-ratelimit-reset-tokens-hour": "1200", "x-ratelimit-reset-tokens-minute": "5" });
  assert.equal(e.kind, "rate_limited");
  assert.equal(e.retryAfterMs, 1_200_000);
});

test("402 va 403 (to'lov kerak) → no_credit, provider scope", () => {
  assert.equal(cer(402, { message: "Payment required" }).kind, "no_credit");
  assert.equal(cer(402, "").scope, "provider");
  assert.equal(cer(403, { message: "Your free trial has ended. Please upgrade your plan." }).kind, "no_credit");
  assert.equal(sam(403, { error: { message: "Forbidden" } }).kind, "no_credit");
  assert.equal(sam(402, { error: { message: "Insufficient balance" } }).kind, "no_credit");
});

test("401 / 403 kalit xatosi → auth", () => {
  assert.equal(cer(401, { message: "Wrong API Key", type: "invalid_request_error", code: "wrong_api_key" }).kind, "auth");
  assert.equal(sam(403, { error: { message: "Invalid API key provided" } }).kind, "auth");
});

test("404 / model topilmadi → unavailable (model scope)", () => {
  const e = cer(404, { message: "Model llama-3.3-70b does not exist or you do not have access to it.", code: "model_not_found" });
  assert.equal(e.kind, "unavailable");
  assert.equal(e.scope, "model");
  assert.equal(sam(400, { error: { message: "Model Meta-Llama-3.1-405B-Instruct not found" } }).kind, "unavailable");
});

test("413 / kontekst → context_length", () => {
  assert.equal(cer(413, "Content Too Large").kind, "context_length");
  assert.equal(cer(400, { message: "Please reduce the length of the messages or completion. Current length is 70000 while limit is 65536", code: "context_length_exceeded" }).kind, "context_length");
});

test("400/422 boshqa → bad_request (zanjir to'xtaydi)", () => {
  assert.equal(cer(400, { message: "messages: field required", type: "invalid_request_error" }).kind, "bad_request");
  assert.equal(sam(422, { error: { message: "Unprocessable Entity" } }).kind, "bad_request");
  // max_tokens haqida xabar kredit deb olinmasin.
  assert.equal(cer(400, { message: "max_tokens must be less than the credits of context" }).kind, "bad_request");
});

test("5xx / 0 / 529 → transient", () => {
  for (const s of [0, 500, 502, 503, 504, 529]) assert.equal(cer(s, "upstream error").kind, "transient", String(s));
  assert.equal(sam(503, { error: { message: "Service Unavailable" } }, { "retry-after": "2" }).retryAfterMs, 2_000);
});

test("sambanova 429: RPD (remaining-requests-day=0) → quota_exhausted, RPM → rate_limited", () => {
  const d = sam(429, { error: { message: "Rate limit exceeded", type: "rate_limit_exceeded" } }, {
    "x-ratelimit-remaining-requests-day": "0",
    "x-ratelimit-reset-requests-day": "43200",
    "x-ratelimit-remaining-requests": "5",
  });
  assert.equal(d.kind, "quota_exhausted");
  assert.equal(d.resetAt, NOW + 43_200_000);
  const m = sam(429, { error: { message: "Rate limit exceeded" } }, { "x-ratelimit-remaining-requests": "0", "x-ratelimit-reset-requests": "20" });
  assert.equal(m.kind, "rate_limited");
  assert.equal(m.retryAfterMs, 20_000);
  assert.equal(m.scope, "model");
});

test("oqim ichidagi xato (status 200 + tana)", () => {
  assert.equal(cer(200, { error: { message: "rate limit", type: "rate_limit_exceeded" } }).kind, "rate_limited");
  assert.equal(cer(200, { status_code: 503, message: "Service temporarily overloaded" }).kind, "transient");
  assert.equal(sam(200, { error: { message: "Something went wrong" } }).kind, "transient");
});

test("message: qisqa (<= 300), JSON bo'lmagan tana ham ishlaydi", () => {
  const e = cer(500, "x".repeat(1000));
  assert.ok(e.message.length <= 300);
  assert.equal(cerebrasAdapter.classifyError(502, "<html>Bad Gateway</html>", H()).kind, "transient");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
