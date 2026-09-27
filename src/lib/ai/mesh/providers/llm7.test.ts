/**
 * Lokal test (tarmoqsiz, kalitsiz, deterministik):
 *   npx tsx --conditions=react-server src/lib/ai/mesh/providers/llm7.test.ts
 * LLM7 adapteri: enabled()/endpoint() env aniqlash, offers, limits, classifyError (§2.1), transformBody.
 */
import assert from "node:assert/strict";
import { classifyLlm7Error, llm7Adapter, llm7TransformBody } from "./llm7";
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

/** Env'ni vaqtincha o'rnatib, keyin asl holiga qaytaradi. */
function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const saved: Record<string, string | undefined> = {};
  for (const k of Object.keys(vars)) {
    saved[k] = process.env[k];
    if (vars[k] === undefined) delete process.env[k];
    else process.env[k] = vars[k];
  }
  try {
    fn();
  } finally {
    for (const k of Object.keys(saved)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

const NOW = Date.UTC(2026, 8, 27, 8, 0, 0);
const H = (init: Record<string, string> = {}) => new Headers(init);
const errBody = (e: Record<string, unknown>) => JSON.stringify({ error: e });
const classify = (status: number, body: string, headers = H()) => classifyLlm7Error(status, body, headers, NOW);

/* ---------------- env / endpoint ---------------- */

test("enabled(): anonim — kalitsiz ham yoqiq; LLM7_DISABLED=1/true bilan o'chadi", () => {
  withEnv({ LLM7_API_KEY: undefined, LLM7_DISABLED: undefined }, () => assert.equal(llm7Adapter.enabled(), true));
  withEnv({ LLM7_DISABLED: "1" }, () => assert.equal(llm7Adapter.enabled(), false));
  withEnv({ LLM7_DISABLED: "TRUE" }, () => assert.equal(llm7Adapter.enabled(), false));
  withEnv({ LLM7_DISABLED: "0" }, () => assert.equal(llm7Adapter.enabled(), true));
});

test("endpoint(): kalitsiz Authorization yo'q; kalit bo'lsa Bearer", () => {
  withEnv({ LLM7_API_KEY: undefined }, () => {
    const ep = llm7Adapter.endpoint();
    assert.equal(ep.url, "https://api.llm7.io/v1/chat/completions");
    assert.equal(ep.headers.Authorization, undefined);
  });
  withEnv({ LLM7_API_KEY: "  test-key  " }, () => {
    assert.equal(llm7Adapter.endpoint().headers.Authorization, "Bearer test-key");
  });
  withEnv({ LLM7_API_KEY: "   " }, () => assert.equal(llm7Adapter.endpoint().headers.Authorization, undefined));
});

test("adapter meta: id/host llm7, rescue, aggregator emas", () => {
  assert.equal(llm7Adapter.id, "llm7");
  assert.equal(llm7Adapter.host, "llm7");
  assert.equal(llm7Adapter.rescue, true);
  assert.ok(!llm7Adapter.aggregator);
});

/* ---------------- limits ---------------- */

test("limits: anonim 10 rpm / 500k token; kalit bilan 40 rpm / 1M token; manba + sana", () => {
  withEnv({ LLM7_API_KEY: undefined }, () => {
    const l = llm7Adapter.limits;
    assert.equal(l.rpm, 10);
    assert.equal(l.dailyUnits, 500_000);
    assert.equal(l.unit, "tokens");
    assert.equal(l.perModel, false);
    assert.match(l.source, /^https:\/\/docs\.llm7\.io\/limits\.md \(\d{4}-\d{2}-\d{2}\)$/);
  });
  withEnv({ LLM7_API_KEY: "k" }, () => {
    assert.equal(llm7Adapter.limits.rpm, 40);
    assert.equal(llm7Adapter.limits.dailyUnits, 1_000_000);
  });
});

/* ---------------- offers ---------------- */

const offer = (wire: string) => {
  const o = llm7Adapter.offers.find((x) => x.wire === wire);
  assert.ok(o, `offer ${wire} yo'q`);
  return o;
};

test("offers: hammasi tekin, tool yo'q, vision yo'q", () => {
  assert.ok(llm7Adapter.offers.length >= 3);
  for (const o of llm7Adapter.offers) {
    assert.equal(o.cost, "free", o.wire);
    assert.equal(o.caps.tools, false, o.wire);
    assert.equal(o.caps.vision, false, o.wire);
  }
  // Wire takrorlanmaydi.
  assert.equal(new Set(llm7Adapter.offers.map((o) => o.wire)).size, llm7Adapter.offers.length);
});

test("offer: Mistral Nemo — eski LLM7_FREE_MODEL, free sinf, stream", () => {
  const o = offer("mistral-Nemo-Instruct-2407");
  assert.equal(o.class, "free");
  assert.equal(o.caps.stream, true);
  assert.ok(o.sovereignIds.includes("llm7/mistral-Nemo-Instruct-2407"));
});

test("offer: Codestral — code sinf, DIRECT_ROUTES va auto-pools id'lari", () => {
  const o = offer("codestral-latest");
  assert.equal(o.class, "code");
  assert.ok(o.sovereignIds.includes("mistralai/codestral-latest"));
  assert.ok(o.sovereignIds.includes("mistral/codestral-latest"));
});

test("offer: GLM 5.3 Flash — katalog id'lari, json yo'q; MiniMax — stream yo'q", () => {
  const g = offer("GLM-5.3-Flash");
  assert.equal(g.class, "fast");
  assert.ok(g.sovereignIds.includes("glm-5-3-flash") && g.sovereignIds.includes("z-ai/glm-5.3-flash"));
  assert.equal(g.caps.json, false);
  assert.equal(offer("minimax-m2.7").caps.stream, false);
});

/* ---------------- classifyError ---------------- */

test("429 rate_limit_exceeded + Retry-After: 1 → rate_limited, 1000 ms (haqiqiy shakl)", () => {
  const e = classify(
    429,
    errBody({ message: "Rate limit exceeded. Retry after 1 seconds.", type: "rate_limit_error", code: "rate_limit_exceeded", retry_after: 1 }),
    H({ "Retry-After": "1" }),
  );
  assert.equal(e.kind, "rate_limited");
  assert.equal(e.retryAfterMs, 1000);
  assert.equal(e.resetAt, undefined);
});

test("429 sarlavhasiz — tanadagi retry_after; hech narsa yo'q — retryAfterMs yo'q", () => {
  assert.equal(classify(429, errBody({ code: "rate_limit_exceeded", retry_after: 7 })).retryAfterMs, 7000);
  const e = classify(429, "Too Many Requests");
  assert.equal(e.kind, "rate_limited");
  assert.equal(e.retryAfterMs, undefined);
});

test("429 x-ratelimit-reset-* (davomiylik va epoch)", () => {
  assert.equal(classify(429, "{}", H({ "x-ratelimit-reset-requests": "1m30s" })).retryAfterMs, 90_000);
  const epoch = String(Math.floor((NOW + 120_000) / 1000));
  assert.equal(classify(429, "{}", H({ "x-ratelimit-reset": epoch })).retryAfterMs, 120_000);
});

test("429 kunlik token limiti → quota_exhausted + resetAt (Retry-After dan)", () => {
  const e = classify(
    429,
    errBody({ message: "Daily token limit exceeded", code: "rate_limit_exceeded" }),
    H({ "Retry-After": "7200" }),
  );
  assert.equal(e.kind, "quota_exhausted");
  assert.equal(e.resetAt, NOW + 7_200_000);
  // Retry-After juda uzun (>= 1 soat) — xabarsiz ham kunlik kvota.
  assert.equal(classify(429, "{}", H({ "Retry-After": "5400" })).kind, "quota_exhausted");
  // Reset noma'lum — resetAt yo'q (health o'z standartini qo'llaydi).
  const q = classify(429, errBody({ message: "Token quota exceeded for 24h window" }));
  assert.equal(q.kind, "quota_exhausted");
  assert.equal(q.resetAt, undefined);
});

test("402 / balans → no_credit", () => {
  assert.equal(classify(402, errBody({ message: "Payment Required" })).kind, "no_credit");
  assert.equal(classify(400, errBody({ message: "Insufficient balance for this model" })).kind, "no_credit");
});

test("400 model_unavailable → unavailable (scope model) — haqiqiy shakl", () => {
  const e = classify(
    400,
    errBody({ message: "Model 'no-such-model-xyz' is currently unavailable.", type: "invalid_request_error", code: "model_unavailable" }),
  );
  assert.equal(e.kind, "unavailable");
  assert.equal(e.scope, "model");
  assert.equal(classify(404, "Not Found").kind, "unavailable");
});

test("401 missing_api_key (pullik model kalitsiz) → unavailable model; invalid key → auth", () => {
  const paid = classify(401, errBody({ message: "Missing API key.", type: "authentication_error", code: "missing_api_key" }));
  assert.equal(paid.kind, "unavailable");
  assert.equal(paid.scope, "model");
  const bad = classify(401, errBody({ message: "Invalid API key.", type: "authentication_error", code: "invalid_api_key" }));
  assert.equal(bad.kind, "auth");
  assert.equal(classify(403, "<html>Forbidden</html>").kind, "auth");
});

test("413 / kontekst → context_length", () => {
  assert.equal(classify(413, "Payload Too Large").kind, "context_length");
  assert.equal(classify(400, errBody({ message: "This model's maximum context length is 128000 tokens" })).kind, "context_length");
});

test("400/422 boshqa → bad_request", () => {
  assert.equal(classify(400, errBody({ message: "messages: field required", type: "invalid_request_error" })).kind, "bad_request");
  assert.equal(classify(422, "{}").kind, "bad_request");
});

test("0 / 5xx / 529 / Cloudflare 52x → transient", () => {
  for (const s of [0, 500, 502, 503, 504, 520, 522, 524, 529]) assert.equal(classify(s, "").kind, "transient", String(s));
});

test("oqim ichidagi xato (status 200 + tana)", () => {
  assert.equal(classify(200, errBody({ code: "rate_limit_exceeded", retry_after: 2 })).kind, "rate_limited");
  assert.equal(classify(200, errBody({ message: "upstream error" })).kind, "transient");
});

test("message qisqa va har doim bor", () => {
  const e = classify(500, "x".repeat(1000));
  assert.ok(e.message.length <= 300);
  assert.equal(classify(503, "").message, "HTTP 503");
});

test("adapter.classifyError = classifyLlm7Error (Date.now bilan)", () => {
  assert.equal(llm7Adapter.classifyError(429, "{}", H({ "Retry-After": "3" })).retryAfterMs, 3000);
});

/* ---------------- transformBody / readServedModel ---------------- */

test("transformBody: tool'lar olib tashlanadi, content matnga, max_tokens <= 2048, stream:false (MiniMax)", () => {
  const body: ChatBody = {
    model: "x",
    stream: true,
    max_tokens: 8000,
    tools: [{ type: "function" }],
    tool_choice: "auto",
    messages: [
      { role: "system", content: "sys" },
      { role: "user", content: [{ type: "text", text: "salom" }, { type: "image_url", image_url: { url: "data:" } }, { type: "text", text: "dunyo" }] },
    ],
  };
  const nemo = llm7TransformBody(body, offer("mistral-Nemo-Instruct-2407"));
  assert.equal(nemo.model, "mistral-Nemo-Instruct-2407");
  assert.equal(nemo.tools, undefined);
  assert.equal(nemo.tool_choice, undefined);
  assert.equal(nemo.max_tokens, 2048);
  assert.equal(nemo.stream, true);
  assert.deepEqual(nemo.messages[1], { role: "user", content: "salom dunyo" });
  assert.equal(llm7TransformBody({ ...body, max_tokens: 500 }, offer("codestral-latest")).max_tokens, 500);
  assert.equal(llm7TransformBody(body, offer("minimax-m2.7")).stream, false);
  // Asl tana o'zgarmaydi.
  assert.ok(Array.isArray(body.tools));
});

test("readServedModel: chunk.model yoki null", () => {
  assert.equal(llm7Adapter.readServedModel!({ model: " mistral-Nemo-Instruct-2407 " }), "mistral-Nemo-Instruct-2407");
  assert.equal(llm7Adapter.readServedModel!({ choices: [] }), null);
  assert.equal(llm7Adapter.readServedModel!(null), null);
});

console.log(`llm7: ${passed} o'tdi, ${failed} yiqildi`);
if (failed) process.exit(1);
