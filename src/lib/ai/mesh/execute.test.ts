/**
 * Mesh executor — soxta fetch / health / plan bilan (tarmoqsiz, kalitsiz):
 *   npx tsx --conditions=react-server src/lib/ai/mesh/execute.test.ts
 * transient → qayta urinish → keyingi nomzod; kvota → keyingi so'rovda provayder o'tkaziladi;
 * bad_request → failover yo'q; halol served; abort; <think>; afford; continuation; CLI tools.
 */
import assert from "node:assert/strict";
import type {
  Attempt,
  Candidate,
  ClassifiedError,
  HealthSnapshot,
  ModelOffer,
  ProviderAdapter,
  ProviderId,
  RouteRequest,
} from "./types";
import type { MeshDeps } from "./execute";

type Call = { url: string; body: Record<string, unknown>; signal?: AbortSignal | null };
type Reply = (call: Call) => Response | Promise<Response>;

let calls: Call[] = [];
let replies: Reply[] = [];
let records: { attempt: Attempt; units?: number }[] = [];
let usages: { provider: string; wire: string; units: number; ephemeral: boolean }[] = [];
let sleeps: number[] = [];

const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
  const call = { url, body, signal: init?.signal };
  calls.push(call);
  const reply = replies.shift();
  if (!reply) return json(503, { error: { message: "no mock reply" } });
  return reply(call);
}) as typeof fetch;

function sseLines(objs: unknown[]): Response {
  const text = [...objs.map((o) => `data: ${JSON.stringify(o)}`), "data: [DONE]", ""].join("\n");
  return new Response(text, { status: 200, headers: { "content-type": "text/event-stream" } });
}
function sse(model: string, parts: string[], finish = "stop", usage?: unknown): Response {
  return sseLines([
    ...parts.map((p) => ({ model, choices: [{ delta: { content: p }, finish_reason: null }] })),
    { model, choices: [{ delta: {}, finish_reason: finish }], ...(usage ? { usage } : {}) },
  ]);
}
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/* ---------------- soxta adapterlar ---------------- */

function classifyError(status: number, body: string): ClassifiedError {
  const message = `${status} ${body}`.slice(0, 200);
  if (status === 0 || status >= 500) return { kind: "transient", message };
  if (/can only afford (\d+)/.test(body)) return { kind: "no_credit", affordTokens: Number(/can only afford (\d+)/.exec(body)![1]), message };
  if (status === 402 || /credits/.test(body)) return { kind: "no_credit", message };
  if (status === 429 && /daily|4006/.test(body)) return { kind: "quota_exhausted", resetAt: Date.now() + 3_600_000, message };
  if (status === 429) return { kind: "rate_limited", retryAfterMs: 60_000, message };
  if (status === 401) return { kind: "auth", message };
  if (status === 404) return { kind: "unavailable", scope: "model", message };
  if (status === 413) return { kind: "context_length", message };
  if (status === 400) return { kind: "bad_request", message };
  return { kind: "transient", message };
}

function offer(wire: string, ids: string[], extra: Partial<ModelOffer> = {}): ModelOffer {
  return {
    sovereignIds: ids,
    wire,
    class: "fast",
    cost: "free",
    caps: { stream: true, tools: true, vision: false, json: true },
    ...extra,
  };
}

function adapter(id: ProviderId, offers: ModelOffer[], extra: Partial<ProviderAdapter> = {}): ProviderAdapter {
  return {
    id,
    host: id,
    enabled: () => true,
    endpoint: () => ({ url: `https://${id}.test/v1/chat/completions`, headers: { Authorization: "Bearer test" } }),
    offers,
    limits: { unit: "requests", dailyUnits: 1000, source: "test" },
    classifyError: (s, b) => classifyError(s, b),
    ...extra,
  };
}

const LLAMA = "meta-llama/llama-3.3-70b-instruct";

/* ---------------- soxta health + plan ---------------- */

/** Oddiy sog'liq ombori: xato provayder (yoki model) kalitini `until` gacha ochadi. */
const store = new Map<string, number>();
const hk = (p: string, wire?: string) => (wire ? `mesh:health:${p}:${wire}` : `mesh:health:${p}`);

function fakeRecord(attempt: Attempt, units?: number) {
  records.push({ attempt, units });
  const e = attempt.error;
  if (attempt.ok || !e) return;
  if (["rate_limited", "quota_exhausted", "no_credit", "auth", "unavailable"].includes(e.kind)) {
    const key = e.scope === "model" ? hk(attempt.provider, attempt.wire) : hk(attempt.provider);
    store.set(key, e.resetAt ?? Date.now() + (e.retryAfterMs ?? 60_000));
  }
}

function fakeSnapshot(): Promise<HealthSnapshot> {
  const m = new Map<string, { state: "open"; until: number; fails: number; successEwma: number; latencyEwmaMs: number }>();
  for (const [k, until] of store) m.set(k, { state: "open", until, fails: 0, successEwma: 1, latencyEwmaMs: 2000 });
  return Promise.resolve(m);
}

/** Ro'yxat tartibida: sameModel avval, keyin o'rinbosarlar, oxirida rescue; ochiq kalitlar chiqariladi. */
function fakePlan(req: RouteRequest, adapters: ProviderAdapter[], health: HealthSnapshot): Candidate[] {
  const out: Candidate[] = [];
  const now = Date.now();
  const open = (k: string) => (health.get(k)?.until ?? 0) > now;
  for (const a of adapters) {
    if (req.exclude?.includes(a.id) || open(hk(a.id))) continue;
    for (const o of a.offers) {
      if (open(hk(a.id, o.wire))) continue;
      if (req.needs.tools && !o.caps.tools) continue;
      const same = !!req.sovereignModelId && o.sovereignIds.includes(req.sovereignModelId);
      if (req.sameModelOnly && !same) continue;
      out.push({ provider: a.id, offer: o, sameModel: same, score: 1 });
    }
  }
  const g = (c: Candidate) => (adapters.find((a) => a.id === c.provider)?.rescue ? 2 : c.sameModel ? 0 : 1);
  return out.sort((x, y) => g(x) - g(y));
}

function deps(adapters: ProviderAdapter[]): Partial<MeshDeps> {
  return {
    adapters: () => adapters,
    snapshot: fakeSnapshot,
    plan: fakePlan,
    record: fakeRecord,
    recordUsage: (provider, wire, units, opts) => {
      usages.push({ provider, wire, units, ephemeral: opts.ephemeral });
    },
    fetch: fakeFetch,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    rng: () => 0.5,
  };
}

const req = (extra: Partial<RouteRequest> = {}): RouteRequest => ({
  sovereignModelId: LLAMA,
  needs: { stream: true },
  planTier: "free",
  country: null,
  ...extra,
});

const host = (u: string) => new URL(u).hostname.replace(/\.test$/, "");

/* ---------------- runner ---------------- */

let passed = 0;
let failed = 0;
async function test(name: string, fn: () => Promise<void>) {
  calls = [];
  replies = [];
  records = [];
  usages = [];
  sleeps = [];
  store.clear();
  try {
    await fn();
    passed++;
  } catch (e) {
    failed++;
    console.error(`✕ ${name}\n  ${(e as Error).stack?.split("\n").slice(0, 6).join("\n  ")}`);
  }
}

type Ev = { type: string; [k: string]: unknown };

async function main() {
  const { meshStream, meshComplete, __test } = await import("./execute");

  async function run(adapters: ProviderAdapter[], r: RouteRequest = req(), extra: { signal?: AbortSignal; max_tokens?: number } = {}) {
    const events: Ev[] = [];
    for await (const ev of meshStream({
      req: r,
      body: { messages: [{ role: "user", content: "salom" }], max_tokens: extra.max_tokens },
      lang: "en",
      signal: extra.signal,
      deps: deps(adapters),
    })) {
      events.push(ev as Ev);
    }
    return events;
  }
  const textOf = (evs: Ev[]) => evs.filter((e) => e.type === "text").map((e) => e.text).join("");
  // "served" endi haqiqiy provayderni ham beradi (unit economics) — u alohida tekshiriladi,
  // bu yordamchi esa model/substituted/rescue halolligini solishtiradi.
  const served = (evs: Ev[]) =>
    evs.filter((e) => e.type === "served").map((e) => {
      assert.equal(typeof (e as { provider?: unknown }).provider, "string", "served.provider bo'lishi kerak");
      const rest = { ...(e as Ev & { provider?: string }) };
      delete rest.provider;
      return rest;
    });

  const groq = adapter("groq", [offer("llama-3.3-70b-versatile", [LLAMA])]);
  const cerebras = adapter("cerebras", [offer("llama-3.3-70b", [LLAMA])]);
  const cf = adapter("cloudflare", [offer("@cf/meta/llama-3.3-70b-instruct-fp8-fast", [LLAMA])], {
    displayId: (w) => `cloudflare/${w}`,
    limits: { unit: "neurons", dailyUnits: 10_000, source: "test" },
  });
  const qwen = adapter("sambanova", [offer("Qwen3-32B", [])]);

  await test("context_length scope model (Groq tekin TPM) — faqat shu nomzod o'tkaziladi, sog'liq yozilmaydi", async () => {
    const tpm = adapter("groq", [offer("llama-3.3-70b-versatile", [LLAMA])], {
      classifyError: (s, b) => (s === 413 ? { kind: "context_length", scope: "model", message: b } : classifyError(s, b)),
    });
    replies = [() => json(413, { error: { message: "Request too large (TPM)" } }), () => sse("llama-3.3-70b", ["ok"])];
    const evs = await run([tpm, cerebras]);
    assert.equal(textOf(evs), "ok");
    assert.deepEqual(calls.map((c) => host(c.url)), ["groq", "cerebras"]);
    assert.ok(!records.some((r) => !r.attempt.ok), "so'rov aybi — sog'liq yozuvi yo'q");
    // Scope'siz context_length esa zanjirni to'xtatadi.
    calls = [];
    replies = [() => json(413, { error: { message: "too long" } })];
    const stop = await run([groq, cerebras]);
    assert.equal(calls.length, 1);
    assert.ok(stop.some((e) => e.type === "error"));
  });

  await test("served: upstream wire id'ni qaytarsa displayId; sarlavhadagi haqiqiy model (OmniRoute)", async () => {
    replies = [() => sse("@cf/meta/llama-3.3-70b-instruct-fp8-fast", ["ok"])];
    const cfEchoes = adapter("cloudflare", cf.offers, { displayId: cf.displayId, readServedModel: (c) => (c as { model?: string }).model ?? null });
    const evs = await run([cfEchoes]);
    assert.equal(served(evs)[0]?.model, "cloudflare/@cf/meta/llama-3.3-70b-instruct-fp8-fast");
    calls = [];
    const omni = adapter("omniroute", [offer("auto/best-free", [])], {
      aggregator: true,
      readServedModel: () => null,
      readServedFromHeaders: (h) => h.get("x-omniroute-model"),
    });
    replies = [
      () =>
        new Response(`data: ${JSON.stringify({ model: "auto/best-free", choices: [{ delta: { content: "hi" }, finish_reason: "stop" }] })}\n\ndata: [DONE]\n`, {
          status: 200,
          headers: { "content-type": "text/event-stream", "x-omniroute-model": "groq/qwen/qwen3.8-27b" },
        }),
    ];
    const o = await run([omni]);
    assert.equal(served(o)[0]?.model, "groq/qwen/qwen3.8-27b");
    assert.equal(served(o)[0]?.substituted, true);
  });
  const llm7 = adapter("llm7", [offer("mistral-Nemo-Instruct-2407", [], { caps: { stream: true, tools: false, vision: false, json: true } })], {
    rescue: true,
  });

  await test("transient: bir marta qayta urinish (jitter), keyin keyingi nomzod", async () => {
    replies = [() => json(503, { error: { message: "down" } }), () => json(502, { error: { message: "down" } }), () => sse("llama-3.3-70b", ["Salom!"])];
    const evs = await run([groq, cerebras]);
    assert.deepEqual(calls.map((c) => host(c.url)), ["groq", "groq", "cerebras"]);
    assert.equal(sleeps.length, 1);
    assert.ok(sleeps[0] >= 250 && sleeps[0] <= 750, `jitter ${sleeps[0]}`);
    assert.equal(textOf(evs), "Salom!");
    assert.deepEqual(served(evs), [{ type: "served", model: "llama-3.3-70b", substituted: false }]);
    assert.equal(evs.at(-1)?.type, "done");
    assert.deepEqual(records.map((r) => [r.attempt.provider, r.attempt.ok, r.attempt.error?.kind]), [
      ["groq", false, "transient"],
      ["groq", false, "transient"],
      ["cerebras", true, undefined],
    ]);
    assert.deepEqual(usages, [{ provider: "cerebras", wire: "llama-3.3-70b", units: 1, ephemeral: false }], "requests birligi = 1 (oqim oxirida)");
    // wire = offer.wire
    assert.equal(calls[2].body.model, "llama-3.3-70b");
    assert.equal(calls[2].body.stream, true);
  });

  await test("quota_exhausted: darhol keyingi, keyingi so'rovda provayder umuman chaqirilmaydi", async () => {
    replies = [() => json(429, { error: { message: "daily free allocation (4006)" } }), () => sse("llama-3.3-70b", ["A"])];
    await run([cf, cerebras]);
    assert.deepEqual(calls.map((c) => host(c.url)), ["cloudflare", "cerebras"]);
    assert.equal(sleeps.length, 0, "kvota — qayta urinish yo'q");
    calls = [];
    replies = [() => sse("llama-3.3-70b", ["B"])];
    const evs = await run([cf, cerebras]);
    assert.deepEqual(calls.map((c) => host(c.url)), ["cerebras"]);
    assert.equal(textOf(evs), "B");
  });

  await test("bad_request: ikkinchi, boshqa provayder ham rad etsa — zanjir to'xtaydi, sog'liq yozilmaydi", async () => {
    replies = [
      () => json(400, { error: { message: "invalid message format" } }),
      () => json(400, { error: { message: "invalid message format" } }),
      () => sse("x", ["never"]),
    ];
    const evs = await run([groq, cerebras, llm7]);
    assert.deepEqual(calls.map((c) => host(c.url)), ["groq", "cerebras"]);
    assert.equal(evs.length, 1);
    assert.equal(evs[0].type, "error");
    assert.equal(typeof evs[0].message, "string");
    assert.ok(!String(evs[0].message).includes("invalid message format"), "xom xato foydalanuvchiga chiqmaydi");
    assert.equal(records.length, 0);
  });

  await test("bad_request (regress): birinchi provayderga xos 400 — keyingi provayder javob beradi, sog'liq o'zgarmaydi", async () => {
    replies = [() => json(400, { error: { message: "unsupported parameter: stream_options" } }), () => sse("llama-3.3-70b", ["ok"])];
    const evs = await run([groq, cerebras]);
    assert.deepEqual(calls.map((c) => host(c.url)), ["groq", "cerebras"]);
    assert.equal(textOf(evs), "ok");
    assert.ok(!records.some((r) => !r.attempt.ok), "bad_request sog'liqqa yozilmaydi");
    // CLI (meshComplete) ham: birinchi 400 dan keyin keyingi provayder; ikkinchi boshqa provayder 400 → 400.
    calls = [];
    replies = [
      () => json(400, { error: { message: "bad tool schema for this provider" } }),
      () => json(200, { model: "llama-3.3-70b", choices: [{ message: { role: "assistant", content: "ok" } }] }),
    ];
    const ok = await meshComplete({ req: req({ needs: { tools: true } }), body: { messages: [] }, deps: deps([groq, cerebras]) });
    assert.equal(ok.ok, true);
    assert.deepEqual(calls.map((c) => host(c.url)), ["groq", "cerebras"]);
    calls = [];
    replies = [() => json(400, { error: { message: "x" } }), () => json(400, { error: { message: "y" } }), () => json(200, {})];
    const bad = await meshComplete({ req: req({ needs: { tools: true } }), body: { messages: [] }, deps: deps([groq, cerebras, qwen]) });
    assert.equal(bad.ok, false);
    if (!bad.ok) assert.equal(bad.status, 400);
    assert.deepEqual(calls.map((c) => host(c.url)), ["groq", "cerebras"], "ikkinchi boshqa provayder 400 — to'xtaydi");
  });

  await test("taymaut (regress): UpstreamTimeoutError shu nomzodda qayta urinilmaydi; umumiy muddat per-attempt taymautni cheklaydi", async () => {
    // Birinchi nomzod javob bermaydi (signal abort bo'lguncha osiladi) — taymaut = min(30 s, qolgan ~50 ms).
    const hang = (call: Call) =>
      new Promise<Response>((_, reject) => {
        call.signal?.addEventListener("abort", () => reject(call.signal?.reason), { once: true });
      });
    replies = [hang, () => sse("llama-3.3-70b", ["ok"])];
    const started = Date.now();
    const evs: Ev[] = [];
    for await (const ev of meshStream({
      req: req(),
      body: { messages: [{ role: "user", content: "salom" }] },
      lang: "en",
      deps: deps([groq, cerebras]),
      deadline: Date.now() + 60,
    })) evs.push(ev as Ev);
    assert.ok(Date.now() - started < 5_000, "per-attempt taymaut qolgan vaqt bilan cheklangan");
    assert.equal(sleeps.length, 0, "taymaut — jitter bilan qayta urinish yo'q");
    assert.equal(calls.filter((c) => host(c.url) === "groq").length, 1, "groq bir marta");
    assert.equal(records[0]?.attempt.error?.timeout, true);
    // Muddat tugagan — keyingi nomzod boshlanmaydi (yoki boshlansa ham qolgan vaqt ichida).
    assert.ok(evs.some((e) => e.type === "error") || textOf(evs) === "ok");
    // Muddat allaqachon o'tgan — hech qanday fetch yo'q.
    calls = [];
    replies = [() => sse("llama-3.3-70b", ["never"])];
    const late: Ev[] = [];
    for await (const ev of meshStream({ req: req(), body: { messages: [] }, lang: "en", deps: deps([groq]), deadline: Date.now() - 1 })) late.push(ev as Ev);
    assert.equal(calls.length, 0);
    assert.equal(late.at(-1)?.type, "error");
  });

  await test("probe lock (regress): hamma nomzod half-open va lock band — eng yaxshisi baribir sinaladi", async () => {
    replies = [(c) => sse(String(c.body.model), ["ok"])];
    const evs: Ev[] = [];
    for await (const ev of meshStream({
      req: req(),
      body: { messages: [{ role: "user", content: "salom" }] },
      lang: "en",
      deps: { ...deps([groq, cerebras]), claim: async () => false },
    })) evs.push(ev as Ev);
    assert.equal(textOf(evs), "ok");
    assert.deepEqual(calls.map((c) => host(c.url)), ["groq"], "plan tartibida birinchisi");
  });

  await test("muvaffaqiyat birinchi mazmunli baytda yoziladi (oqim oxirini kutmaydi)", async () => {
    let recordedBeforeEnd = false;
    let finished = false;
    const d = deps([groq]);
    d.record = (a, u) => {
      if (a.ok && !finished) recordedBeforeEnd = true;
      fakeRecord(a, u);
    };
    replies = [() => sse("llama-3.3-70b", ["a", "b", "c"])];
    for await (const ev of meshStream({ req: req(), body: { messages: [] }, lang: "en", deps: d })) {
      if ((ev as Ev).type === "text" && (ev as Ev).text === "a") assert.ok(recordedBeforeEnd, "birinchi bo'lakda allaqachon yozilgan");
      if ((ev as Ev).type === "done") finished = true;
    }
    assert.equal(records.filter((r) => r.attempt.ok).length, 1, "bitta muvaffaqiyat yozuvi");
  });

  await test("unsupported (regress): tools yo'q — keyingi nomzod, sog'liq yozilmaydi, xotirada o'rganiladi", async () => {
    const { effectiveCaps, __resetLearnedCaps } = await import("./caps");
    __resetLearnedCaps();
    const omni = adapter("omniroute", [offer("groq/qwen/qwen3.8-27b", [LLAMA])], {
      classifyError: (s, b) =>
        /does not support tools/.test(b) ? { kind: "unsupported", scope: "model", capability: "tools", message: b } : classifyError(s, b),
    });
    replies = [
      () => json(400, { error: { message: "This model does not support tools" } }),
      () => json(200, { model: "llama-3.3-70b", choices: [{ message: { role: "assistant", content: "ok" } }] }),
    ];
    const r = await meshComplete({ req: req({ needs: { tools: true } }), body: { messages: [] }, deps: deps([omni, cerebras]) });
    assert.equal(r.ok, true);
    assert.ok(!records.some((x) => !x.attempt.ok), "unsupported — sog'liqqa yozilmaydi");
    assert.equal(effectiveCaps("omniroute", omni.offers[0]).tools, false, "tools=false o'rganildi");
    assert.equal(effectiveCaps("cerebras", cerebras.offers[0]).tools, true);
    __resetLearnedCaps();
  });

  await test("pool (regress): $paid kredit xatosi — shu so'rovda pullik takliflar o'tkaziladi, tekin taklif sinaladi", async () => {
    const or = adapter("openrouter", [
      offer("anthropic/claude-x", [LLAMA], { cost: "paid" }),
      offer("meta-llama/llama-3.3-70b-instruct:free", [LLAMA]),
      offer("openai/gpt-x", [LLAMA], { cost: "paid" }),
    ], {
      classifyError: (s, b) => (s === 402 ? { kind: "no_credit", scope: "provider", pool: "paid", message: b } : classifyError(s, b)),
    });
    replies = [() => json(402, { error: { message: "Insufficient credits" } }), (c) => sse(String(c.body.model), ["ok"])];
    const evs = await run([or]);
    assert.equal(textOf(evs), "ok");
    assert.deepEqual(calls.map((c) => c.body.model), ["anthropic/claude-x", "meta-llama/llama-3.3-70b-instruct:free"]);
  });

  await test("context_length: zanjir to'xtaydi (CLI 413)", async () => {
    replies = [() => json(413, { error: { message: "context length exceeded" } })];
    const r = await meshComplete({ req: req({ needs: { tools: true } }), body: { messages: [] }, deps: deps([groq, cerebras]) });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.status, 413);
      assert.equal(r.error?.kind, "context_length");
    }
    assert.equal(calls.length, 1);
  });

  await test("served: sameModel nomzod, lekin aggregator boshqa modelga yo'naltirdi → substituted", async () => {
    const agg = adapter("openrouter", [offer(LLAMA, [LLAMA])], { aggregator: true });
    replies = [() => sse("openai/gpt-oss-120b", ["hi"])];
    const evs = await run([agg]);
    assert.deepEqual(served(evs), [{ type: "served", model: "openai/gpt-oss-120b", substituted: true }]);
  });

  await test("served: Cloudflare displayId, sameModel → substituted false", async () => {
    replies = [() => sse("", ["hi"])];
    const evs = await run([cf]);
    assert.deepEqual(served(evs), [
      { type: "served", model: "cloudflare/@cf/meta/llama-3.3-70b-instruct-fp8-fast", substituted: false },
    ]);
  });

  await test("served: o'rinbosar va rescue halol belgilanadi; yiqilgan nomzodning served'i chiqmaydi", async () => {
    replies = [
      // groq: 200, lekin birinchi bo'lakda xato (OpenRouter uslubi) — served chiqmasligi kerak
      () => sseLines([{ model: "llama-3.3-70b-versatile", choices: [{ delta: { role: "assistant" } }] }, { error: { message: "credits exhausted", code: 402 } }]),
      () => json(401, { error: { message: "bad key" } }),
      () => sse("mistral-Nemo-Instruct-2407", ["ok"]),
    ];
    const evs = await run([groq, qwen, llm7]);
    assert.deepEqual(calls.map((c) => host(c.url)), ["groq", "sambanova", "llm7"]);
    assert.deepEqual(served(evs), [{ type: "served", model: "mistral-Nemo-Instruct-2407", substituted: true, rescue: true }]);
    assert.deepEqual(records.map((r) => r.attempt.error?.kind ?? "ok"), ["no_credit", "auth", "ok"]);
  });

  await test("sameModelOnly (Tella): o'rinbosar/rescue yo'q", async () => {
    replies = [() => json(503, {}), () => json(503, {})];
    const evs = await run([groq, qwen, llm7], req({ sameModelOnly: true, allowRescue: false }));
    assert.deepEqual(calls.map((c) => host(c.url)), ["groq", "groq"]);
    assert.equal(evs.at(-1)?.type, "error");
  });

  await test("matn chiqqandan keyin uzilish → error, failover yo'q", async () => {
    replies = [
      () => {
        const enc = new TextEncoder();
        let sent = false;
        const stream = new ReadableStream<Uint8Array>({
          pull(ctl) {
            // error() navbatni tozalaydi — shuning uchun avval bo'lak o'qilsin, keyin uzilish.
            if (!sent) {
              sent = true;
              ctl.enqueue(enc.encode(`data: ${JSON.stringify({ model: "m", choices: [{ delta: { content: "Birinchi qism javob" } }] })}\n`));
            } else ctl.error(new Error("socket hang up"));
          },
        });
        return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } });
      },
      () => sse("x", ["never"]),
    ];
    const evs = await run([groq, cerebras]);
    assert.deepEqual(calls.map((c) => host(c.url)), ["groq"]);
    assert.equal(textOf(evs), "Birinchi qism javob");
    assert.equal(evs.at(-1)?.type, "error");
    assert.equal(records.at(-1)?.attempt.error?.kind, "transient");
  });

  await test("abort: foydalanuvchi to'xtatsa — abort otiladi, keyingi nomzod yo'q, sog'liq yozilmaydi", async () => {
    const ctl = new AbortController();
    replies = [
      (call) =>
        new Promise<Response>((_, reject) => {
          call.signal?.addEventListener("abort", () => reject(call.signal?.reason ?? new Error("aborted")), { once: true });
          setTimeout(() => ctl.abort(new DOMException("user stop", "AbortError")), 5);
        }),
      () => sse("x", ["never"]),
    ];
    await assert.rejects(run([groq, cerebras], req(), { signal: ctl.signal }), (e: unknown) => (e as Error).name === "AbortError");
    assert.equal(calls.length, 1);
    assert.equal(records.length, 0);
  });

  await test("abort CLI: meshComplete ham abort'ni otadi", async () => {
    const ctl = new AbortController();
    ctl.abort(new DOMException("user stop", "AbortError"));
    await assert.rejects(
      meshComplete({ req: req(), body: { messages: [] }, signal: ctl.signal, deps: deps([groq]) }),
      (e: unknown) => (e as Error).name === "AbortError",
    );
    assert.equal(records.length, 0);
  });

  await test("<think> ajratish (teg bo'laklar orasida bo'lingan)", async () => {
    replies = [() => sse("qwen", ["<thi", "nk>o'yla", "yapman</th", "ink>Javob", " tayyor"])];
    const evs = await run([groq]);
    assert.equal(evs.filter((e) => e.type === "reasoning").map((e) => e.text).join(""), "o'ylayapman");
    assert.equal(textOf(evs), "Javob tayyor");
    assert.equal(evs[0].type, "served", "served birinchi mazmundan oldin");
  });

  await test("delta.reasoning_content → reasoning hodisasi", async () => {
    replies = [() => sseLines([{ model: "m", choices: [{ delta: { reasoning_content: "R" } }] }, { model: "m", choices: [{ delta: { content: "T" }, finish_reason: "stop" }] }])];
    const evs = await run([groq]);
    assert.deepEqual(evs.map((e) => e.type), ["served", "reasoning", "text", "done"]);
  });

  await test("needs.thinking: fikrlaydigan modelga reasoning_effort qo'shiladi", async () => {
    const oss = adapter("groq", [offer("openai/gpt-oss-120b", [LLAMA])]);
    replies = [() => sse("openai/gpt-oss-120b", ["ok"])];
    await run([oss], req({ needs: { stream: true, thinking: true } }));
    assert.equal(calls[0].body.reasoning_effort, "medium");
  });

  await test("needs.thinking: fikrlamaydigan modelga hech narsa qo'shilmaydi", async () => {
    replies = [() => sse("llama-3.3-70b", ["ok"])];
    await run([groq], req({ needs: { stream: true, thinking: true } }));
    assert.equal("reasoning_effort" in calls[0].body, false);
    assert.equal("reasoning" in calls[0].body, false);
  });

  await test("thinking so'ralmasa — reasoning maydoni yuborilmaydi", async () => {
    const oss = adapter("groq", [offer("openai/gpt-oss-120b", [LLAMA])]);
    replies = [() => sse("openai/gpt-oss-120b", ["ok"])];
    await run([oss]);
    assert.equal("reasoning_effort" in calls[0].body, false);
  });

  await test("upstream usage bermasa: fikr tokenlari ham chiqishga qo'shiladi", async () => {
    const tok = adapter("groq", [offer("deepseek-r1-distill-llama-70b", [LLAMA])], {
      limits: { unit: "tokens", tpd: 1_000_000, perModel: true, source: "test" },
    });
    const answer = () => sseLines([{ model: "m", choices: [{ delta: { content: "Javob" }, finish_reason: "stop" }] }]);
    // 1) faqat javob
    replies = [answer];
    await run([tok]);
    const withoutThinking = usages[0].units;

    // 2) o'sha javob + 400 belgilik fikr (~100 token)
    calls = [];
    usages = [];
    records = [];
    store.clear();
    replies = [
      () =>
        sseLines([
          { model: "m", choices: [{ delta: { reasoning_content: "o".repeat(400) } }] },
          { model: "m", choices: [{ delta: { content: "Javob" }, finish_reason: "stop" }] },
        ]),
    ];
    await run([tok]);
    assert.equal(usages[0].units, withoutThinking + 100, "fikr matni chiqish tokenlariga qo'shilishi kerak");
  });

  await test("affordTokens: shu nomzod bir marta kamroq max_tokens bilan, sog'liq yozilmaydi", async () => {
    replies = [() => json(402, { error: { message: "You requested up to 8000 tokens, but can only afford 1000" } }), () => sse("m", ["ok"])];
    const evs = await run([groq, cerebras], req(), { max_tokens: 8000 });
    assert.deepEqual(calls.map((c) => host(c.url)), ["groq", "groq"]);
    assert.equal(calls[0].body.max_tokens, 8000);
    assert.equal(calls[1].body.max_tokens, 936);
    assert.equal(textOf(evs), "ok");
    assert.deepEqual(records.map((r) => r.attempt.ok), [true]);
  });

  await test("oqimsiz offer (stream:false) — bitta JSON bo'lak", async () => {
    const cfNs = adapter("cloudflare", [offer("@cf/openai/gpt-oss-120b", [LLAMA], { caps: { stream: false, tools: false, vision: false, json: true } })], {
      displayId: (w) => `cloudflare/${w}`,
    });
    replies = [() => json(200, { result: { choices: [{ message: { content: "bitta javob" }, finish_reason: "stop" }] } })];
    const evs = await run([cfNs], req({ sovereignModelId: undefined, class: "fast" }));
    assert.equal(calls[0].body.stream, false);
    assert.equal(textOf(evs), "bitta javob");
    assert.deepEqual(served(evs), [{ type: "served", model: "cloudflare/@cf/openai/gpt-oss-120b", substituted: false }]);
  });

  await test("finish_reason length → davomi O'SHA nomzodda", async () => {
    replies = [() => sse("m", ["Yarim"], "length"), () => sse("m", [" davomi"])];
    const evs = await run([groq, cerebras]);
    assert.deepEqual(calls.map((c) => host(c.url)), ["groq", "groq"]);
    assert.equal(textOf(evs), "Yarim davomi");
    assert.equal(served(evs).length, 1);
    const msgs = calls[1].body.messages as { role: string; content: string }[];
    assert.equal(msgs.at(-2)?.content, "Yarim");
    assert.equal(msgs.at(-2)?.role, "assistant");
  });

  await test("rate_limited scope model: shu provayderning boshqa modeli sinaladi", async () => {
    const groq2 = adapter("groq", [offer("llama-3.3-70b-versatile", [LLAMA]), offer("llama-3.1-8b-instant", [])]);
    groq2.classifyError = (s, b) => ({ ...classifyError(s, b), scope: "model" });
    replies = [() => json(429, { error: { message: "rpm" } }), () => sse("llama-3.1-8b-instant", ["ok"])];
    const evs = await run([groq2]);
    assert.deepEqual(calls.map((c) => c.body.model), ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"]);
    assert.deepEqual(served(evs), [{ type: "served", model: "llama-3.1-8b-instant", substituted: true }]);
  });

  await test("onFailure (OmniRoute watchdog) chaqiriladi, bad_request'da emas", async () => {
    const seen: [number, string][] = [];
    const omni = adapter("omniroute", [offer(LLAMA, [LLAMA])], { onFailure: (s, e) => seen.push([s, e.kind]) });
    replies = [() => json(503, {}), () => json(503, {})];
    await run([omni]);
    assert.deepEqual(seen, [[503, "transient"], [503, "transient"]]);
  });

  await test("nomzod yo'q → error hodisasi (fetch yo'q)", async () => {
    const evs = await run([]);
    assert.equal(calls.length, 0);
    assert.deepEqual(evs.map((e) => e.type), ["error"]);
  });

  await test("maxAttempts: nomzodlar soni cheklanadi", async () => {
    replies = Array.from({ length: 20 }, () => () => json(401, {}));
    const many = (["groq", "cerebras", "sambanova", "nvidia", "mistral", "openai", "rsi"] as ProviderId[]).map((id) => adapter(id, [offer("w", [LLAMA])]));
    const evs: Ev[] = [];
    for await (const ev of meshStream({ req: req(), body: { messages: [] }, maxAttempts: 3, deps: deps(many) })) evs.push(ev as Ev);
    assert.equal(calls.length, 3);
    assert.equal(evs.at(-1)?.type, "error");
  });

  await test("meshComplete: tools uzatiladi, transient → keyingi, halol natija", async () => {
    const tools = [{ type: "function", function: { name: "read_file", parameters: { type: "object" } } }];
    replies = [
      () => json(500, { error: { message: "boom" } }),
      () => json(500, { error: { message: "boom" } }),
      () =>
        json(200, {
          model: "llama-3.3-70b",
          choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: "t1", type: "function", function: { name: "read_file", arguments: "{}" } }] }, finish_reason: "tool_calls" }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
    ];
    const r = await meshComplete({
      req: req({ needs: { tools: true } }),
      body: { messages: [{ role: "user", content: "fayl o'qi" }], tools, tool_choice: "auto" },
      deps: deps([groq, llm7, cerebras]),
    });
    assert.deepEqual(calls.map((c) => host(c.url)), ["groq", "groq", "cerebras"], "llm7 tool qo'llamaydi");
    assert.deepEqual(calls[2].body.tools, tools);
    assert.equal(calls[2].body.tool_choice, "auto");
    assert.equal(calls[2].body.stream, false);
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.provider, "cerebras");
      assert.equal(r.model, "llama-3.3-70b");
      assert.equal(r.sameModel, true);
      assert.equal(r.finishReason, "tool_calls");
      assert.deepEqual(r.usage, { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 });
      assert.equal((r.message as { tool_calls: unknown[] }).tool_calls.length, 1);
      assert.equal(r.attempts.length, 3);
    }
  });

  await test("meshComplete: 200 + tanada xato (402) → no_credit, keyingi nomzod", async () => {
    replies = [() => json(200, { error: { message: "insufficient credits", code: 402 } }), () => json(200, { model: "x", choices: [{ message: { role: "assistant", content: "ok" } }] })];
    const r = await meshComplete({ req: req({ sovereignModelId: undefined, class: "fast" }), body: { messages: [] }, deps: deps([groq, qwen]) });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.provider, "sambanova");
      assert.equal(r.sameModel, true, "auto (model so'ralmagan) — almashtirish emas");
    }
    assert.equal(records[0].attempt.error?.kind, "no_credit");
  });

  await test("normalizePool: :free modelga kredit xatosi — butun provayder; pullik modelga kunlik tekin limit — faqat model", async () => {
    const free = { provider: "openrouter" as const, offer: offer("x:free", [], { cost: "free" }), sameModel: false, score: 1 };
    const paid = { provider: "openrouter" as const, offer: offer("x/paid", [], { cost: "paid" }), sameModel: false, score: 1 };
    const credit: ClassifiedError = { kind: "no_credit", scope: "provider", pool: "paid", message: "" };
    const daily: ClassifiedError = { kind: "quota_exhausted", scope: "model", pool: "free", message: "" };
    assert.deepEqual(__test.normalizePool(paid, credit), credit);
    assert.deepEqual([__test.normalizePool(free, credit).pool, __test.normalizePool(free, credit).scope], [undefined, "provider"]);
    assert.deepEqual(__test.normalizePool(free, daily), daily);
    assert.deepEqual([__test.normalizePool(paid, daily).pool, __test.normalizePool(paid, daily).scope], [undefined, "model"]);
    assert.equal(__test.providerWideFailure(credit), false, "hovuz — chat route provayderni exclude qilmaydi");
    assert.equal(__test.providerWideFailure({ kind: "auth", message: "" }), true);
    assert.equal(__test.providerWideFailure({ kind: "rate_limited", scope: "model", message: "" }), false);
  });

  await test("neuron birligi: offer.neuronsPerM bo'yicha", async () => {
    const o = offer("@cf/x", [], { neuronsPerM: { in: 1000, out: 2000 } });
    const units = __test.unitsFor(cf, o, { prompt_tokens: 1_000_000, completion_tokens: 500_000 });
    assert.equal(units, 2000);
  });

  await test("integratsiya: haqiqiy health (xotira) + scheduler — kvota tugagan provayder keyingi so'rovda chetlanadi", async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    const a1 = adapter("nvidia", [offer("meta/llama-3.3-70b-instruct", [LLAMA])]);
    const a2 = adapter("sambanova", [offer("Meta-Llama-3.3-70B-Instruct", [LLAMA])]);
    const realDeps: Partial<MeshDeps> = { adapters: () => [a1, a2], fetch: fakeFetch, sleep: async () => {} };
    const runReal = async () => {
      const evs: Ev[] = [];
      // LLAMA (pullik variant id) katalogda Starter — haqiqiy scheduler tarifni tekshiradi.
      for await (const ev of meshStream({ req: req({ planTier: "starter" }), body: { messages: [{ role: "user", content: "hi" }] }, lang: "en", deps: realDeps })) evs.push(ev as Ev);
      return evs;
    };
    // Qaysi biri birinchi tanlanishi tasodifiy (yoyish) — birinchisi kvota xatosi beradi.
    replies = [() => json(429, { error: { message: "daily limit reached (4006)" } }), (c) => sse(String(c.body.model), ["ok"])];
    const first = await runReal();
    assert.equal(textOf(first), "ok");
    const exhausted = host(calls[0].url);
    await new Promise((r) => setTimeout(r, 20)); // fire-and-forget yozuv tugasin
    for (let i = 0; i < 5; i++) {
      calls = [];
      replies = [(c) => sse(String(c.body.model), ["ok"])];
      const evs = await runReal();
      assert.equal(textOf(evs), "ok");
      assert.equal(calls.length, 1);
      assert.notEqual(host(calls[0].url), exhausted, `${exhausted} kvotasi tugagan — tanlanmasligi kerak`);
    }
  });

  console.log(`${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
