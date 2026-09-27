/**
 * Lokal test (tarmoqsiz, kalitsiz): npx tsx --conditions=react-server src/lib/ai/mesh/providers/nvidia.test.ts
 * NVIDIA NIM adapteri: env aniqlash, offerlar, xato tasnifi (docs/MESH.md §2.1).
 */
import assert from "node:assert/strict";
import { MODEL_BY_ID } from "@/config/models";
import { HOST_POLICY, hostAllowedIn, modelAllowedIn, policyOwner } from "@/lib/ai/region";
import { PROVIDER_IDS } from "../types";
import {
  NVIDIA_OFFERS,
  classifyNvidiaError,
  nextUtcMidnight,
  nvidiaAdapter,
  parseDurationMs,
  readNvidiaServedModel,
} from "./nvidia";

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
const H = (init: Record<string, string> = {}) => new Headers(init);
const offerFor = (id: string) => NVIDIA_OFFERS.find((o) => o.sovereignIds.includes(id));

/* ---------------- enabled() / endpoint() ---------------- */

function withEnv(value: string | undefined, fn: () => void) {
  const prev = process.env.NVIDIA_API_KEY;
  if (value === undefined) delete process.env.NVIDIA_API_KEY;
  else process.env.NVIDIA_API_KEY = value;
  try {
    fn();
  } finally {
    if (prev === undefined) delete process.env.NVIDIA_API_KEY;
    else process.env.NVIDIA_API_KEY = prev;
  }
}

test("enabled(): kalit yo'q / bo'sh / bor", () => {
  withEnv(undefined, () => assert.equal(nvidiaAdapter.enabled(), false));
  withEnv("   ", () => assert.equal(nvidiaAdapter.enabled(), false));
  withEnv("nvapi-FAKE-test-key", () => assert.equal(nvidiaAdapter.enabled(), true));
});

test("endpoint(): NIM URL va Bearer sarlavha (env'dan)", () => {
  withEnv(" nvapi-FAKE ", () => {
    const ep = nvidiaAdapter.endpoint();
    assert.equal(ep.url, "https://integrate.api.nvidia.com/v1/chat/completions");
    assert.equal(ep.headers.Authorization, "Bearer nvapi-FAKE");
  });
});

test("id/host shartnomasi: region HOST_POLICY'da bor", () => {
  assert.equal(nvidiaAdapter.id, "nvidia");
  assert.ok((PROVIDER_IDS as readonly string[]).includes(nvidiaAdapter.id));
  assert.ok(nvidiaAdapter.host in HOST_POLICY);
  assert.equal(hostAllowedIn(nvidiaAdapter.host, "RU"), false); // NVIDIA 2022 da Rossiyadan chiqqan
  assert.equal(hostAllowedIn(nvidiaAdapter.host, "UZ"), true);
});

/* ---------------- offers ---------------- */

test("offers: Llama 3.3 70B — katalogning ikkala id'si bitta NIM modeliga", () => {
  const a = offerFor("llama-3.3-free");
  const b = offerFor("meta-llama/llama-3.3-70b-instruct");
  assert.ok(a && b && a === b);
  assert.equal(a.wire, "meta/llama-3.3-70b-instruct");
  assert.equal(a.cost, "free");
  assert.equal(a.class, "free");
  assert.deepEqual(a.caps, { stream: true, tools: true, vision: false, json: true });
});

test("offers: DeepSeek V4 Flash — aynan sanali versiya, starter tarifdan", () => {
  const o = offerFor("deepseek-v4-flash");
  assert.ok(o);
  assert.equal(o.wire, "deepseek-ai/deepseek-v4-flash-0731");
  assert.equal(o.class, "fast");
  assert.equal(o.minTier, "starter");
});

test("offers: GLM 5.3 (pro) va Nemotron Ultra (free)", () => {
  const glm = offerFor("glm-5-3");
  assert.ok(glm);
  assert.equal(glm.wire, "z-ai/glm-5.3");
  assert.equal(glm.class, "flagship");
  assert.equal(glm.minTier, "pro");
  const ultra = offerFor("openrouter/nvidia/nemotron-3-ultra-550b-a55b:free");
  assert.ok(ultra && ultra === offerFor("nemotron-ultra-free"));
  assert.equal(ultra.wire, "nvidia/nemotron-3-ultra-550b-a55b");
});

test("offers halol: versiyasi tasdiqlanmagan yoki boshqa model sameModel emas", () => {
  assert.equal(offerFor("deepseek-v4-pro"), undefined); // katalog -0813, NIM sanasiz
  assert.equal(offerFor("nemotron-nano-free"), undefined); // katalog Omni varianti
  assert.equal(offerFor("mistral-large"), undefined); // NIM'da faqat Mixtral
});

test("offers: wire yagona, katalog id'lari mavjud, mintaqa siyosati egasi aniq", () => {
  const wires = NVIDIA_OFFERS.map((o) => o.wire);
  assert.equal(new Set(wires).size, wires.length);
  for (const o of NVIDIA_OFFERS) {
    assert.notEqual(policyOwner(o.wire), "unknown", o.wire);
    assert.ok(modelAllowedIn(o.wire, null), o.wire);
    for (const id of o.sovereignIds) {
      // Chiziqsiz id — katalog id'si: albatta MODEL_BY_ID'da bo'lsin.
      if (!id.includes("/")) assert.ok(MODEL_BY_ID[id], `katalogda yo'q: ${id}`);
    }
  }
  assert.equal(NVIDIA_OFFERS.length, 15);
});

/* ---------------- limits ---------------- */

test("limits: 40 RPM, butun hisob uchun, manba + sana", () => {
  assert.equal(nvidiaAdapter.limits.rpm, 40);
  assert.equal(nvidiaAdapter.limits.perModel, false);
  assert.match(nvidiaAdapter.limits.source, /https:\/\/.+\(2026-09-27\)/);
});

/* ---------------- classifyError ---------------- */

test("transient: 0, 408, 500, 502, 503, 504, 529", () => {
  for (const s of [0, 408, 500, 502, 503, 504, 529]) {
    assert.equal(classifyNvidiaError(s, "", H(), NOW).kind, "transient", String(s));
  }
  const nvcf = classifyNvidiaError(503, '{"status":503,"title":"Service Unavailable","detail":"Function is not ready"}', H(), NOW);
  assert.equal(nvcf.kind, "transient");
});

test("rate_limited: 429 + Retry-After (soniya va HTTP-date), provider scope", () => {
  const e = classifyNvidiaError(429, '{"status":429,"title":"Too Many Requests"}', H({ "retry-after": "12" }), NOW);
  assert.equal(e.kind, "rate_limited");
  assert.equal(e.retryAfterMs, 12_000);
  assert.equal(e.scope, "provider");
  const date = new Date(NOW + 30_000).toUTCString();
  assert.equal(classifyNvidiaError(429, "", H({ "retry-after": date }), NOW).retryAfterMs, 30_000);
});

test("rate_limited: x-ratelimit-reset-requests '1m30s' va sarlavhasiz", () => {
  const e = classifyNvidiaError(429, "Too Many Requests", H({ "x-ratelimit-reset-requests": "1m30s" }), NOW);
  assert.equal(e.retryAfterMs, 90_000);
  const bare = classifyNvidiaError(429, '{"status":429,"title":"Too Many Requests"}', H(), NOW);
  assert.equal(bare.kind, "rate_limited");
  assert.equal(bare.retryAfterMs, undefined); // health standart 60 s ni qo'llaydi
});

test("quota_exhausted: 429 kunlik limit → keyingi 00:00 UTC", () => {
  const e = classifyNvidiaError(429, '{"error":{"message":"Daily request limit exceeded"}}', H(), NOW);
  assert.equal(e.kind, "quota_exhausted");
  assert.equal(e.resetAt, Date.UTC(2026, 8, 28));
  assert.equal(nextUtcMidnight(NOW), Date.UTC(2026, 8, 28));
});

test("no_credit: 402 NVCF 'Cloud credits expired' va 'can only afford'", () => {
  const body = JSON.stringify({ type: "about:blank", status: 402, title: "Payment Required", detail: "Account 'x': Cloud credits expired - Please contact NVIDIA representatives" });
  assert.equal(classifyNvidiaError(402, body, H(), NOW).kind, "no_credit");
  const afford = classifyNvidiaError(402, "This request requires more credits; can only afford 1234", H(), NOW);
  assert.equal(afford.kind, "no_credit");
  assert.equal(afford.affordTokens, 1234);
});

test("auth: 401 va kalitga oid 403", () => {
  assert.equal(classifyNvidiaError(401, '{"status":401,"title":"Unauthorized","detail":"Authentication failed"}', H(), NOW).kind, "auth");
  assert.equal(classifyNvidiaError(403, '{"detail":"Invalid API key"}', H(), NOW).kind, "auth");
});

test("unavailable: 403 model ro'yxatdan o'tmagan, 404, 410, 400 'model not found'", () => {
  const reg = classifyNvidiaError(403, '{"status":403,"title":"Forbidden","detail":"Authorization failed"}', H(), NOW);
  assert.equal(reg.kind, "unavailable");
  assert.equal(reg.scope, "model");
  const nf = classifyNvidiaError(404, '{"status":404,"title":"Not Found","detail":"Function \'abc\': Not found for account \'xyz\'"}', H(), NOW);
  assert.equal(nf.kind, "unavailable");
  assert.equal(nf.scope, "model");
  assert.equal(classifyNvidiaError(410, "Gone", H(), NOW).kind, "unavailable");
  assert.equal(classifyNvidiaError(400, '{"message":"Model meta/llama-9 does not exist"}', H(), NOW).kind, "unavailable");
});

test("context_length: 413 va vLLM 400 'maximum context length'", () => {
  assert.equal(classifyNvidiaError(413, "Payload Too Large", H(), NOW).kind, "context_length");
  const body = JSON.stringify({ object: "error", message: "This model's maximum context length is 131072 tokens. However, you requested 140000 tokens", type: "BadRequestError", code: 400 });
  assert.equal(classifyNvidiaError(400, body, H(), NOW).kind, "context_length");
});

test("bad_request: boshqa 400/422", () => {
  assert.equal(classifyNvidiaError(400, '{"message":"temperature must be <= 2"}', H(), NOW).kind, "bad_request");
  assert.equal(classifyNvidiaError(422, '{"detail":[{"loc":["body","messages"],"msg":"field required"}]}', H(), NOW).kind, "bad_request");
});

test("oqim ichidagi xato (200) va kalit logga chiqmaydi", () => {
  assert.equal(classifyNvidiaError(200, '{"error":{"message":"upstream error"}}', H(), NOW).kind, "transient");
  const e = classifyNvidiaError(401, "Invalid key nvapi-SECRETsecret123 / Bearer nvapi-XYZ", H(), NOW);
  assert.ok(!e.message.includes("SECRETsecret123") && !e.message.includes("nvapi-XYZ"));
  assert.ok(classifyNvidiaError(500, "x".repeat(1000), H(), NOW).message.length <= 300);
});

test("adapter.classifyError PURE va shartnomaga mos", () => {
  assert.equal(nvidiaAdapter.classifyError(503, "", H()).kind, "transient");
});

/* ---------------- yordamchilar ---------------- */

test("parseDurationMs", () => {
  assert.equal(parseDurationMs("2"), 2000);
  assert.equal(parseDurationMs("1.5"), 1500);
  assert.equal(parseDurationMs("750ms"), 750);
  assert.equal(parseDurationMs("12.5s"), 12_500);
  assert.equal(parseDurationMs("2m30s"), 150_000);
  assert.equal(parseDurationMs("garbage"), undefined);
  assert.equal(parseDurationMs(null), undefined);
});

test("readServedModel: SSE bo'lagi, JSON obyekt, yaroqsiz", () => {
  assert.equal(readNvidiaServedModel('data: {"id":"x","model":"meta/llama-3.3-70b-instruct","choices":[]}'), "meta/llama-3.3-70b-instruct");
  assert.equal(readNvidiaServedModel({ model: "z-ai/glm-5.3" }), "z-ai/glm-5.3");
  assert.equal(readNvidiaServedModel("data: [DONE]"), null);
  assert.equal(readNvidiaServedModel({ choices: [] }), null);
});

console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
