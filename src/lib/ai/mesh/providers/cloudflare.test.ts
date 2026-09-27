/**
 * Lokal test (tarmoqsiz, kalitsiz): npx tsx --conditions=react-server src/lib/ai/mesh/providers/cloudflare.test.ts
 * Cloudflare mesh adapteri: env aniqlash, offers, classifyError, transformBody, served model.
 */
import assert from "node:assert/strict";
import { CF, cfId, cfSameModel } from "../../cloudflare";
import type { ChatBody } from "../types";
import {
  classifyCloudflareError,
  cloudflareAdapter as a,
  nextUtcMidnight,
  parseRetryAfter,
  readCloudflareServedModel,
} from "./cloudflare";

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
const NOW = Date.UTC(2026, 8, 27, 15, 30, 0); // 2026-09-27 15:30 UTC
const MIDNIGHT = Date.UTC(2026, 8, 28, 0, 0, 0);
const offer = (wire: string) => {
  const o = a.offers.find((x) => x.wire === wire);
  assert.ok(o, `offer yo'q: ${wire}`);
  return o;
};

/* ---------------- enabled / endpoint ---------------- */

const saved = { acc: process.env.CLOUDFLARE_ACCOUNT_ID, tok: process.env.CLOUDFLARE_AI_TOKEN };

test("enabled: ikkala env kerak", () => {
  delete process.env.CLOUDFLARE_ACCOUNT_ID;
  delete process.env.CLOUDFLARE_AI_TOKEN;
  assert.equal(a.enabled(), false);
  process.env.CLOUDFLARE_ACCOUNT_ID = "acc123";
  assert.equal(a.enabled(), false);
  process.env.CLOUDFLARE_AI_TOKEN = "   ";
  assert.equal(a.enabled(), false, "faqat bo'sh joy — o'chirilgan");
  process.env.CLOUDFLARE_AI_TOKEN = "tok-fake";
  assert.equal(a.enabled(), true);
  delete process.env.CLOUDFLARE_ACCOUNT_ID;
  assert.equal(a.enabled(), false);
});

test("endpoint: account URL va Bearer", () => {
  process.env.CLOUDFLARE_ACCOUNT_ID = " acc/123 ";
  process.env.CLOUDFLARE_AI_TOKEN = "tok-fake";
  const e = a.endpoint();
  assert.equal(e.url, "https://api.cloudflare.com/client/v4/accounts/acc%2F123/ai/v1/chat/completions");
  assert.equal(e.headers.Authorization, "Bearer tok-fake");
});

if (saved.acc === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID;
else process.env.CLOUDFLARE_ACCOUNT_ID = saved.acc;
if (saved.tok === undefined) delete process.env.CLOUDFLARE_AI_TOKEN;
else process.env.CLOUDFLARE_AI_TOKEN = saved.tok;

/* ---------------- offers ---------------- */

test("offers: 9 ta CF modeli, hammasi tekin kvota, vision yo'q", () => {
  assert.equal(a.offers.length, 9);
  assert.equal(new Set(a.offers.map((o) => o.wire)).size, 9);
  for (const o of a.offers) {
    assert.equal(o.cost, "free");
    assert.equal(o.caps.vision, false);
    assert.ok(o.neuronsPerM && o.neuronsPerM.in > 0 && o.neuronsPerM.out > 0, o.wire);
  }
});

test("offer DeepSeek V4 Pro: flagship, pro, katalog id'lari", () => {
  const o = offer(CF.deepseekPro);
  assert.equal(o.class, "flagship");
  assert.equal(o.minTier, "pro");
  assert.equal(o.caps.stream, true);
  assert.equal(o.caps.tools, true);
  for (const id of ["deepseek-v4-pro", "deepseek/deepseek-v4-pro-0813", "deepseek/deepseek-v4-pro", "openrouter/deepseek/deepseek-v4-pro-0813", cfId(CF.deepseekPro)]) {
    assert.ok(o.sovereignIds.includes(id), id);
  }
  assert.deepEqual(o.neuronsPerM, { in: 120_000, out: 360_000 });
});

test("offer Qwen 3.8 27B: fast, free, Groq id ham shu og'irliklar", () => {
  const o = offer(CF.qwen);
  assert.equal(o.class, "fast");
  assert.equal(o.minTier, "free");
  assert.ok(o.sovereignIds.includes("qwen3-8-27b"));
  assert.ok(o.sovereignIds.includes("groq/qwen/qwen3.8-27b"));
});

test("offer gpt-oss-120b: oqimsiz, tool'siz, free", () => {
  const o = offer(CF.gptOss);
  assert.equal(o.caps.stream, false);
  assert.equal(o.caps.tools, false);
  assert.equal(o.class, "free");
});

test("offer Llama: tekin katalog llama-3.3-free ham sameModel", () => {
  const o = offer(CF.llama);
  assert.ok(o.sovereignIds.includes("llama-3.3-free"));
  assert.ok(o.sovereignIds.includes("meta-llama/llama-3.3-70b-instruct:free"));
  assert.ok(o.sovereignIds.includes("llama-3-3-70b"));
});

test("offers halol: har sovereignId aynan shu wire'ga tushadi, boshqa offerga emas", () => {
  const seen = new Map<string, string>();
  for (const o of a.offers) {
    for (const id of o.sovereignIds) {
      assert.ok(!seen.has(id), `${id} ikki offerda: ${seen.get(id)} va ${o.wire}`);
      seen.set(id, o.wire);
      // Katalog id'lari ("deepseek-v4-pro") cfSameModel'da yo'q — ular providerModel orqali bog'langan.
      const direct = cfSameModel(id);
      if (direct) assert.equal(direct, o.wire, id);
    }
  }
  assert.ok(!seen.has("anthropic/claude-sonnet-5"));
});

test("resolve: prefiksli / :free id → statik offer; noma'lum → null", () => {
  assert.equal(a.resolve?.("omniroute/z-ai/glm-5.3")?.wire, CF.glm);
  assert.equal(a.resolve?.("cloudflare/@cf/moonshotai/kimi-k2.6")?.wire, CF.kimi);
  assert.equal(a.resolve?.("anthropic/claude-opus-4.8"), null);
  assert.equal(a.resolve?.("@cf/unknown/model"), null);
});

test("displayId: cloudflare/ prefiksi, idempotent", () => {
  assert.equal(a.displayId?.(CF.qwen), `cloudflare/${CF.qwen}`);
  assert.equal(a.displayId?.(`cloudflare/${CF.qwen}`), `cloudflare/${CF.qwen}`);
});

test("limits: 10k neuron/kun, butun hisob, manba + sana", () => {
  assert.equal(a.limits.dailyUnits, 10_000);
  assert.equal(a.limits.unit, "neurons");
  assert.equal(a.limits.perModel, false);
  assert.equal(a.limits.rpm, 300);
  assert.match(a.limits.source, /developers\.cloudflare\.com.*\(2026-09-27\)/);
});

/* ---------------- classifyError ---------------- */

const cfErr = (code: number, message: string) => JSON.stringify({ errors: [{ code, message }], success: false });

test("nextUtcMidnight / parseRetryAfter", () => {
  assert.equal(nextUtcMidnight(NOW), MIDNIGHT);
  assert.equal(nextUtcMidnight(Date.UTC(2026, 11, 31, 23, 59)), Date.UTC(2027, 0, 1));
  assert.equal(parseRetryAfter("12", NOW), 12_000);
  assert.equal(parseRetryAfter(new Date(NOW + 5_000).toUTCString(), NOW), 5_000);
  assert.equal(parseRetryAfter("soon", NOW), undefined);
  assert.equal(parseRetryAfter(null, NOW), undefined);
});

test("4006 kunlik neuron → quota_exhausted, resetAt = 00:00 UTC, provider", () => {
  const e = classifyCloudflareError(429, cfErr(4006, "you have used up your daily free allocation of 10,000 neurons, please upgrade"), H(), NOW);
  assert.equal(e.kind, "quota_exhausted");
  assert.equal(e.resetAt, MIDNIGHT);
  assert.equal(e.scope, "provider");
});

test("3036 (hujjatdagi kod) va OpenAI-mos shakl ham quota_exhausted", () => {
  assert.equal(classifyCloudflareError(429, cfErr(3036, "Account limited"), H(), NOW).kind, "quota_exhausted");
  const oa = JSON.stringify({ error: { message: "AiError: daily free allocation exceeded (4006)", type: "invalid_request_error" } });
  const e = classifyCloudflareError(429, oa, H(), NOW);
  assert.equal(e.kind, "quota_exhausted");
  assert.equal(e.resetAt, MIDNIGHT);
});

test("oqim ichidagi xato (200 + 4006) → quota_exhausted", () => {
  assert.equal(classifyCloudflareError(200, cfErr(4006, "neurons limit exceeded"), H(), NOW).kind, "quota_exhausted");
});

test("429 RPM + Retry-After → rate_limited provider", () => {
  const e = classifyCloudflareError(429, cfErr(3000, "Too many requests"), H({ "retry-after": "7" }), NOW);
  assert.equal(e.kind, "rate_limited");
  assert.equal(e.retryAfterMs, 7_000);
  assert.equal(e.scope, "provider");
  const noHdr = classifyCloudflareError(429, "", H(), NOW);
  assert.equal(noHdr.kind, "rate_limited");
  assert.equal(noHdr.retryAfterMs, undefined, "health standart 60s ni qo'llaydi");
});

test("3040 out of capacity → rate_limited model, qisqa kutish", () => {
  const e = classifyCloudflareError(429, cfErr(3040, "Out of capacity"), H(), NOW);
  assert.equal(e.kind, "rate_limited");
  assert.equal(e.scope, "model");
  assert.equal(e.retryAfterMs, 20_000);
});

test("auth: 401, 10000, 9109, 7003 account id", () => {
  assert.equal(classifyCloudflareError(401, cfErr(10000, "Authentication error"), H(), NOW).kind, "auth");
  assert.equal(classifyCloudflareError(403, cfErr(9109, "Invalid access token"), H(), NOW).kind, "auth");
  assert.equal(classifyCloudflareError(400, cfErr(7003, "Could not route to /accounts/x/ai, perhaps your object identifier is invalid?"), H(), NOW).kind, "auth");
  // Regress #6: 403 har doim auth emas — tana kalit haqida gapirmasa, faqat shu model yopiladi.
  const f = classifyCloudflareError(403, "Forbidden", H(), NOW);
  assert.deepEqual([f.kind, f.scope], ["unavailable", "model"]);
  assert.equal(classifyCloudflareError(403, "Authentication error: invalid token", H(), NOW).kind, "auth");
});

test("unavailable (model): 404/3042, 400/5007, 403/5035 paid plan, 5016 agreement", () => {
  for (const [s, code, msg] of [
    [404, 3042, "Invalid model ID"],
    [400, 5007, "No such model @cf/x/y or task"],
    [403, 5035, "This model requires the Workers Paid plan"],
    [403, 5016, "Model agreement: prior to using this model, you must submit the prompt 'agree'"],
  ] as const) {
    const e = classifyCloudflareError(s, cfErr(code, msg), H(), NOW);
    assert.equal(e.kind, "unavailable", `${s}/${code}`);
    assert.equal(e.scope, "model", `${s}/${code}`);
  }
});

test("context_length: 413/3006 va 'context length' matni", () => {
  assert.equal(classifyCloudflareError(413, cfErr(3006, "Request too large"), H(), NOW).kind, "context_length");
  assert.equal(classifyCloudflareError(400, JSON.stringify({ error: { message: "This model's maximum context length is 131072 tokens" } }), H(), NOW).kind, "context_length");
});

test("transient: 0, 408/3007, 500, 502, 503, 524", () => {
  for (const s of [0, 500, 502, 503, 524]) assert.equal(classifyCloudflareError(s, "upstream error", H(), NOW).kind, "transient", String(s));
  assert.equal(classifyCloudflareError(408, cfErr(3007, "Timeout"), H(), NOW).kind, "transient");
});

test("bad_request: 400/5004, 405/5019, 422; oddiy son kod deb olinmaydi", () => {
  assert.equal(classifyCloudflareError(400, cfErr(5004, "Invalid data type for base64 input"), H(), NOW).kind, "bad_request");
  assert.equal(classifyCloudflareError(405, cfErr(5019, "Deprecated SDK version"), H(), NOW).kind, "bad_request");
  assert.equal(classifyCloudflareError(422, "unprocessable", H(), NOW).kind, "bad_request");
  // "7000" — kod emas (auth 7000 bilan adashmasin).
  assert.equal(classifyCloudflareError(400, "max_tokens must be <= 7000 for this request", H(), NOW).kind, "bad_request");
});

test("402 → no_credit", () => {
  assert.equal(classifyCloudflareError(402, "Payment Required", H(), NOW).kind, "no_credit");
});

test("adapter.classifyError xabarni cheklaydi va resetAt kelajakda", () => {
  const before = Date.now();
  const e = a.classifyError(429, cfErr(4006, "x".repeat(2000)), H());
  assert.equal(e.kind, "quota_exhausted");
  assert.ok(e.resetAt! > before && e.resetAt! <= nextUtcMidnight(Date.now()));
  assert.ok(e.message.length <= 500);
});

/* ---------------- transformBody / served ---------------- */

test("transformBody: faqat matn, begona maydonlar yo'q, gpt-oss stream:false", () => {
  const body: ChatBody = {
    model: "deepseek/deepseek-v4-pro",
    messages: [
      { role: "user", content: [{ type: "text", text: "salom", cache_control: { type: "ephemeral" } }, { type: "image_url", image_url: { url: "data:x" } }] },
    ],
    stream: true,
    transforms: ["middle-out"],
    route: "fallback",
    stream_options: { include_usage: true },
    tools: [{ type: "function" }],
  };
  const oss = a.transformBody!(body, offer(CF.gptOss));
  assert.equal(oss.model, CF.gptOss);
  assert.equal(oss.stream, false);
  assert.deepEqual(oss.messages, [{ role: "user", content: "salom " }]);
  assert.equal(oss.transforms, undefined);
  assert.equal(oss.route, undefined);
  assert.equal(oss.stream_options, undefined);
  assert.equal(oss.tools, undefined, "gpt-oss — tool'siz");

  const pro = a.transformBody!(body, offer(CF.deepseekPro));
  assert.equal(pro.stream, true);
  assert.ok(Array.isArray(pro.tools));
  assert.equal(body.transforms !== undefined, true, "asl tana o'zgarmaydi");
});

test("transformBody: tool xabarlari (tool_calls, tool_call_id) saqlanadi", () => {
  const body: ChatBody = {
    model: "x",
    messages: [
      { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "ls", arguments: "{}" } }] },
      { role: "tool", tool_call_id: "c1", content: "a.ts" },
    ],
  };
  const out = a.transformBody!(body, offer(CF.kimiCode));
  const [m0, m1] = out.messages as Record<string, unknown>[];
  assert.equal(m0.content, "");
  assert.ok(Array.isArray(m0.tool_calls));
  assert.equal(m1.tool_call_id, "c1");
});

test("readServedModel: @cf id ishonchli, boshqasi null", () => {
  assert.equal(readCloudflareServedModel({ model: CF.qwen, choices: [] }), CF.qwen);
  assert.equal(readCloudflareServedModel({ result: { model: CF.gptOss } }), CF.gptOss);
  assert.equal(readCloudflareServedModel({ model: `cloudflare/${CF.glm}` }), CF.glm);
  assert.equal(readCloudflareServedModel({ model: "gpt-4o" }), null);
  assert.equal(readCloudflareServedModel(null), null);
});

console.log(`\ncloudflare adapter: ${passed} o'tdi, ${failed} yiqildi`);
if (failed) process.exit(1);
