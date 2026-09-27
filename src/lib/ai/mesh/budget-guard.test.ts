/**
 * Byudjet guard'i mesh'da (tarmoqsiz, soxta adapterlar):
 *   npx tsx --conditions=react-server src/lib/ai/mesh/budget-guard.test.ts
 * RouteRequest.costCeiling (scheduler) va MeshDeps.paidRestricted (execute prepare):
 * guard yoqiq — faqat cost "free" takliflar; tekin nomzod yo'q — so'rov buzilmaydi.
 */
import assert from "node:assert/strict";
import { meshComplete } from "./execute";
import { explain, plan, planCandidates } from "./scheduler";
import type { Attempt, HealthState, ModelOffer, ProviderAdapter, ProviderId, RouteRequest } from "./types";

let passed = 0;
let failed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ✗ ${name}\n    ${e instanceof Error ? e.message : e}`);
  }
}

const CAPS = { stream: true, tools: true, vision: false, json: true };
const offer = (p: Partial<ModelOffer> & Pick<ModelOffer, "wire">): ModelOffer => ({
  sovereignIds: [],
  class: "fast",
  cost: "free",
  caps: { ...CAPS },
  ...p,
});
function fake(id: ProviderId, offers: ModelOffer[]): ProviderAdapter {
  return {
    id,
    host: id,
    enabled: () => true,
    endpoint: () => ({ url: `https://${id}.test/v1/chat/completions`, headers: {} }),
    offers,
    limits: { source: "test" },
    classifyError: (status, body) => ({ kind: status >= 500 ? "transient" : "bad_request", message: `${status} ${body}`.slice(0, 100) }),
  };
}

const openrouter = fake("openrouter", [
  offer({ sovereignIds: ["gpt-4o", "openai/gpt-4o"], wire: "openai/gpt-4o", class: "flagship", cost: "paid" }),
  offer({ sovereignIds: ["deepseek/deepseek-v4-flash"], wire: "deepseek/deepseek-v4-flash", class: "fast", cost: "cheap" }),
]);
const groq = fake("groq", [offer({ sovereignIds: ["groq/llama-3.3-70b"], wire: "llama-3.3-70b-versatile", class: "flagship", cost: "free" })]);
const EMPTY = new Map<string, HealthState>();
const req = (p: Partial<RouteRequest> = {}): RouteRequest => ({
  sovereignModelId: "gpt-4o",
  needs: { stream: false },
  planTier: "ultra",
  country: null,
  ...p,
});

async function main() {
  console.log("mesh budget guard");

  await test("costCeiling yo'q — pullik aynan model birinchi", () => {
    const c = plan(req(), { adapters: [openrouter, groq], health: EMPTY, rand: () => 0 });
    assert.equal(c[0].provider, "openrouter");
    assert.equal(c[0].offer.cost, "paid");
  });

  await test("costCeiling free — faqat tekin takliflar (o'rinbosar sifatida)", () => {
    const c = plan(req({ costCeiling: "free" }), { adapters: [openrouter, groq], health: EMPTY, rand: () => 0 });
    assert.ok(c.length > 0);
    assert.ok(c.every((x) => x.offer.cost === "free"), JSON.stringify(c.map((x) => x.offer.cost)));
    assert.equal(c[0].provider, "groq");
    assert.equal(c[0].sameModel, false);
  });

  await test("costCeiling cheap — paid tashlanadi, cheap qoladi; explain sababi cost_ceiling", () => {
    const e = explain(req({ costCeiling: "cheap" }), { adapters: [openrouter, groq], health: EMPTY, rand: () => 0 });
    const gpt = e.find((x) => x.wire === "openai/gpt-4o");
    assert.equal(gpt?.verdict, "dropped");
    assert.equal(gpt?.reason, "cost_ceiling");
    assert.equal(e.find((x) => x.wire === "deepseek/deepseek-v4-flash")?.verdict, "kept");
  });

  const okJson = (model: string) =>
    new Response(JSON.stringify({ model, choices: [{ message: { role: "assistant", content: "ok" }, finish_reason: "stop" }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  async function run(adapters: ProviderAdapter[], restricted: boolean | "throw") {
    const urls: string[] = [];
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      urls.push(String(input));
      const body = JSON.parse(String(init?.body ?? "{}")) as { model?: string };
      return okJson(body.model ?? "?");
    }) as typeof fetch;
    const records: Attempt[] = [];
    const r = await meshComplete({
      req: req(),
      body: { messages: [{ role: "user", content: "hi" }] },
      deps: {
        adapters: () => adapters,
        snapshot: async () => EMPTY,
        plan: (rq, a, h) => planCandidates(rq, a, h, { rng: () => 0 }),
        record: (a) => void records.push(a),
        paidRestricted: async () => {
          if (restricted === "throw") throw new Error("boom");
          return restricted;
        },
        fetch: fetchImpl,
        sleep: async () => undefined,
      },
    });
    return { r, urls };
  }

  await test("execute: guard o'chiq — pullik (openrouter)", async () => {
    const { urls } = await run([openrouter, groq], false);
    assert.match(urls[0], /openrouter\.test/);
  });

  await test("execute: guard yoqiq — faqat tekin (groq), served halol (substituted)", async () => {
    const { r, urls } = await run([openrouter, groq], true);
    assert.equal(urls.length, 1);
    assert.match(urls[0], /groq\.test/);
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.served.substituted, true);
  });

  await test("execute: guard yoqiq, tekin nomzod yo'q — so'rov buzilmaydi (pullik reja)", async () => {
    const { r, urls } = await run([openrouter], true);
    assert.equal(r.ok, true);
    assert.match(urls[0], /openrouter\.test/);
  });

  await test("execute: guard xatosi — fail-open (pullik ruxsat)", async () => {
    const { r, urls } = await run([openrouter, groq], "throw");
    assert.equal(r.ok, true);
    assert.match(urls[0], /openrouter\.test/);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}

void main();
