/**
 * Lokal test (tarmoqsiz, deterministik):
 *   npx tsx --conditions=react-server src/lib/ai/mesh/thinking.test.ts
 *
 * "O'ylab javob" marshruti: fikrlaydigan modelni tanish, provayderga mos so'rov maydoni va
 * scheduler afzalligi — mos model bo'lmasa ham nomzod TASHLANMAYDI (yumshoq zaxira).
 */
import assert from "node:assert/strict";
import { offerThinks, thinkingFields, thinkingWire } from "./thinking";
import { plan, type PlanDeps } from "./scheduler";
import { MESH_TUNING, type HealthState, type ModelOffer, type ProviderAdapter, type ProviderId, type RouteRequest } from "./types";

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

const CAPS = { stream: true, tools: true, vision: false, json: true };
const offer = (p: Partial<ModelOffer> & Pick<ModelOffer, "wire">): ModelOffer => ({
  sovereignIds: [],
  class: "free",
  cost: "free",
  caps: { ...CAPS },
  ...p,
});

const fake = (id: ProviderId, offers: ModelOffer[]): ProviderAdapter => ({
  id,
  host: id,
  enabled: () => true,
  endpoint: () => ({ url: `https://${id}.invalid/v1/chat/completions`, headers: {} }),
  offers,
  limits: { source: "test" },
  classifyError: () => ({ kind: "transient", message: "" }),
});

const NOW = Date.UTC(2026, 8, 27, 12, 0, 0);
const EMPTY = new Map<string, HealthState>();
const deps = (adapters: ProviderAdapter[]): PlanDeps => ({ adapters, health: EMPTY, rand: () => 0, now: NOW });
const req = (extra: Partial<RouteRequest> = {}): RouteRequest => ({
  planTier: "pro",
  needs: { stream: true },
  country: null,
  ...extra,
});

/* ------------------------------------------------------------------ */
/* Fikrlaydigan modelni tanish                                         */
/* ------------------------------------------------------------------ */

test("thinkingWire: fikrlaydigan oilalar", () => {
  for (const w of [
    "deepseek-r1-distill-llama-70b",
    "deepseek/deepseek-r1",
    "deepseek-reasoner",
    "openai/gpt-oss-120b",
    "o1-mini",
    "openai/o3",
    "qwen/qwq-32b",
    "qwen/qwen3.8-27b",
    "mistralai/magistral-small",
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
    "google/gemini-2.5-flash-thinking",
  ]) {
    assert.equal(thinkingWire(w), true, w);
  }
});

test("thinkingWire: oddiy modellar — yo'q", () => {
  for (const w of [
    "llama-3.3-70b-versatile",
    "gemini-2.0-flash",
    "gpt-4o-mini",
    "claude-3-5-haiku",
    "mistral-small-latest",
    "@cf/meta/llama-3.1-8b-instruct",
    "",
  ]) {
    assert.equal(thinkingWire(w), false, w);
  }
});

test("offerThinks: adapter aniq aytgan qiymat taxmindan ustun", () => {
  assert.equal(offerThinks(offer({ wire: "llama-3.3-70b", reasoning: true })), true);
  assert.equal(offerThinks(offer({ wire: "deepseek-r1", reasoning: false })), false);
  assert.equal(offerThinks(offer({ wire: "deepseek-r1" })), true);
});

/* ------------------------------------------------------------------ */
/* Provayderga mos so'rov maydoni                                      */
/* ------------------------------------------------------------------ */

test("thinkingFields: har provayder o'z maydoni", () => {
  assert.deepEqual(thinkingFields("openrouter", "deepseek/deepseek-r1"), { reasoning: { effort: "medium" } });
  assert.deepEqual(thinkingFields("openai", "o3"), { reasoning_effort: "medium" });
  assert.deepEqual(thinkingFields("groq", "openai/gpt-oss-120b"), { reasoning_effort: "medium" });
  assert.deepEqual(thinkingFields("cerebras", "gpt-oss-120b"), { reasoning_effort: "medium" });
});

test("thinkingFields: noma'lum yo'l — bo'sh (400 xavfi yo'q)", () => {
  // Groq qwen3: reasoning_effort hujjatda gpt-oss uchun — boshqa modelga yubormaymiz.
  assert.deepEqual(thinkingFields("groq", "qwen/qwen3.8-27b"), {});
  // Fikrlamaydigan model — hech qachon.
  assert.deepEqual(thinkingFields("openrouter", "gpt-4o-mini"), {});
  // Maydonni qo'llashi hujjatlashtirilmagan provayder — <think> ajratishga tayanamiz.
  assert.deepEqual(thinkingFields("cloudflare", "@cf/deepseek/deepseek-r1"), {});
  assert.deepEqual(thinkingFields("llm7", "deepseek-r1"), {});
});

/* ------------------------------------------------------------------ */
/* Scheduler afzalligi                                                 */
/* ------------------------------------------------------------------ */

const THINKER = offer({ wire: "deepseek-r1-distill-llama-70b", sovereignIds: ["a/think"] });
const FAST = offer({ wire: "llama-3.3-70b-versatile", sovereignIds: ["b/fast"] });

test("needs.thinking=true: fikrlaydigan model birinchi", () => {
  const c = plan(req({ needs: { stream: true, thinking: true } }), deps([fake("groq", [THINKER]), fake("cerebras", [FAST])]));
  assert.equal(c[0].offer.wire, THINKER.wire);
  // Oddiy model TASHLANMAYDI — faqat keyinroq turadi (yumshoq zaxira).
  assert.equal(c.length, 2);
  assert.equal(c[1].offer.wire, FAST.wire);
});

test("needs.thinking=false (Free): tez model birinchi", () => {
  const c = plan(req({ needs: { stream: true, thinking: false } }), deps([fake("groq", [THINKER]), fake("cerebras", [FAST])]));
  assert.equal(c[0].offer.wire, FAST.wire);
  assert.equal(c.length, 2);
});

test("needs.thinking berilmasa — tartib o'zgarmaydi", () => {
  const withPref = plan(req({ needs: { stream: true } }), deps([fake("groq", [THINKER]), fake("cerebras", [FAST])]));
  assert.equal(withPref.length, 2);
  // Ikkala nomzod ham bir xil omillarga ega (sinf/narx/sog'liq) — T omili 1.
  assert.equal(Math.round(withPref[0].score * 1e6), Math.round(withPref[1].score * 1e6));
});

test("fikrlaydigan model umuman yo'q: so'rov yiqilmaydi — oddiy model qaytadi", () => {
  const c = plan(req({ needs: { stream: true, thinking: true } }), deps([fake("cerebras", [FAST])]));
  assert.equal(c.length, 1);
  assert.equal(c[0].offer.wire, FAST.wire);
});

test("afzallik — qat'iy filtr emas: mos kelmagan nomzod skori aynan thinkingMismatchFactor'ga bo'linadi", () => {
  const neutral = plan(req({ needs: { stream: true } }), deps([fake("cerebras", [FAST])]))[0].score;
  const mismatched = plan(req({ needs: { stream: true, thinking: true } }), deps([fake("cerebras", [FAST])]))[0].score;
  assert.equal(Math.round((mismatched / neutral) * 1e6), Math.round(MESH_TUNING.thinkingMismatchFactor * 1e6));
});

test("afzallik sifatdan ustun kelmaydi: kuchli flagship o'ylamasa ham tanlanishi mumkin", () => {
  // Sifat farqi 2× dan katta bo'lsa (0.4 vs 1.0), 0.5 lik jazo uni yengmaydi.
  const weakThinker = offer({ wire: "deepseek-r1-tiny", quality: 0.4, sovereignIds: ["a/weak"] });
  const strongFast = offer({ wire: "gemini-2.0-flash", quality: 1, sovereignIds: ["b/strong"] });
  const c = plan(
    req({ needs: { stream: true, thinking: true } }),
    deps([fake("groq", [weakThinker]), fake("cerebras", [strongFast])]),
  );
  assert.equal(c[0].offer.wire, strongFast.wire);
});

console.log(`${passed} o'tdi, ${failed} yiqildi`);
if (failed) process.exit(1);
