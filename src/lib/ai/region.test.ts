/**
 * Lokal test (tarmoqsiz, deterministik): npx tsx src/lib/ai/region.test.ts
 * Mintaqa bo'yicha model siyosati: provayder jadvali, id → provayder, almashtirish
 * jadvali va chat/CLI route ishlatadigan qaror funksiyasi (regionDecision).
 */
import assert from "node:assert/strict";
import {
  hostAllowedIn,
  modelAllowedIn,
  policyOwner,
  PROVIDER_POLICY,
  REGION_EQUIVALENTS,
  REGION_SAFE,
  regionClassOf,
  regionDecision,
  regionEquivalents,
  restrictedRegion,
  sanctionedRegion,
} from "./region";

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

const RANK = { free: 0, starter: 1, pro: 2, ultra: 3 } as const;
const planUpTo = (max: keyof typeof RANK) => (t: keyof typeof RANK) => RANK[t] <= RANK[max];

test("restrictedRegion: RU/BY/CN/HK/MO + OFAC embargo — cheklangan; UZ/KZ/US — yo'q", () => {
  for (const c of ["RU", "BY", "CN", "HK", "MO", "IR", "KP", "SY", "CU", "ru"]) assert.ok(restrictedRegion(c), c);
  for (const c of ["UZ", "KZ", "US", "DE", "TR", "XX", "", null, undefined, "RUS"]) assert.ok(!restrictedRegion(c), String(c));
  assert.ok(sanctionedRegion("IR") && !sanctionedRegion("RU"));
});

test("provayder jadvali: Anthropic/OpenAI/Google/xAI/Mistral Rossiya va Belarusni cheklaydi, manba bor", () => {
  for (const owner of ["anthropic", "openai", "google", "xai", "mistral"] as const) {
    const p = PROVIDER_POLICY[owner];
    assert.ok(p.restricted.includes("RU") && p.restricted.includes("BY"), owner);
    assert.match(p.source, /^https:\/\//, owner);
    assert.match(p.checked, /^\d{4}-\d{2}-\d{2}$/, owner);
  }
  for (const owner of ["deepseek", "alibaba", "zhipu", "moonshot", "minimax", "meta", "openweight"] as const) {
    assert.ok(!PROVIDER_POLICY[owner].restricted.includes("RU"), owner);
    assert.ok(PROVIDER_POLICY[owner].restricted.includes("IR"), owner); // AQSh hostlari — OFAC
  }
  assert.deepEqual(PROVIDER_POLICY.sovereign.restricted, []);
});

test("policyOwner: katalog, OmniRoute va auto/* id'lari", () => {
  const cases: [string, string][] = [
    ["claude-sonnet-4-5", "anthropic"],
    ["claude-opus-5", "anthropic"],
    ["openrouter/anthropic/claude-opus-5", "anthropic"],
    ["dva/claude-opus-5-high", "anthropic"],
    ["auto/claude-sonnet", "anthropic"],
    ["gpt-4o", "openai"],
    ["gpt-5-6-luna", "openai"],
    ["o1-mini", "openai"],
    ["openrouter/openai/text-embedding-3-small", "openai"],
    ["openai/gpt-oss-120b", "openweight"],
    ["groq/openai/gpt-oss-20b", "openweight"],
    ["groq/whisper-large-v3-turbo", "openweight"],
    ["gemini-pro-1.5", "google"],
    ["auto/gemini", "google"],
    ["openrouter/google/gemma-4-31b-it:free", "google"],
    ["grok-4-6", "xai"],
    ["mistral-large", "mistral"],
    ["mistral/codestral-latest", "mistral"],
    ["mistral-Nemo-Instruct-2407", "mistral"],
    ["sonar-online", "perplexity"],
    ["nemotron-ultra-free", "nvidia"],
    ["openrouter/nvidia/nemotron-3-super-120b-a12b:free", "nvidia"],
    ["deepseek-v4-pro", "deepseek"],
    ["deepseek-r1-free", "deepseek"],
    ["openrouter/deepseek/deepseek-v4-flash", "deepseek"],
    ["qwen3-8-max", "alibaba"],
    ["groq/qwen/qwen3.8-27b", "alibaba"],
    ["glm-5-3", "zhipu"],
    ["auto/glm", "zhipu"],
    ["openrouter/moonshotai/kimi-k2.6", "moonshot"],
    ["auto/minimax", "minimax"],
    ["llama-3.3-free", "meta"],
    ["llama-4-scout", "meta"],
    ["tella-2", "sovereign"],
    ["auto/best-free", "unknown"],
    ["auto/coding:free", "unknown"],
    ["some/mystery-model", "unknown"],
  ];
  for (const [id, owner] of cases) assert.equal(policyOwner(id), owner, id);
});

test("modelAllowedIn: Rossiya — Claude/GPT/Gemini/Grok/Mistral/Perplexity yopiq, DeepSeek/Qwen/GLM/Kimi ochiq", () => {
  const blocked = [
    "claude-sonnet-4-5",
    "claude-haiku-4-5",
    "gpt-4o",
    "gpt-4o-mini",
    "gemini-pro-1.5",
    "gemini-flash-free",
    "grok-4-6",
    "mistral-large",
    "sonar-online",
    "openrouter/anthropic/claude-opus-5",
    "auto/claude-sonnet",
    "auto/gemini",
    "auto/best-free",
    "auto/coding:free",
    "openrouter/google/gemma-4-31b-it:free",
    "nemotron-lightning-free",
  ];
  const allowed = [
    "auto",
    "tella-2",
    "deepseek-v4-pro",
    "qwen3-8-max",
    "glm-5-3",
    "llama-3.3-free",
    "openai/gpt-oss-120b",
    REGION_SAFE.deepseek,
    REGION_SAFE.qwen,
    REGION_SAFE.kimi,
    REGION_SAFE.glm,
    REGION_SAFE.glmAuto,
    REGION_SAFE.minimaxAuto,
  ];
  for (const c of ["RU", "BY"]) {
    for (const id of blocked) assert.ok(!modelAllowedIn(id, c), `${id} @ ${c} yopiq bo'lishi kerak`);
    for (const id of allowed) assert.ok(modelAllowedIn(id, c), `${id} @ ${c} ochiq bo'lishi kerak`);
  }
  // Cheklanmagan mintaqa va noma'lum mamlakat — hammasi ochiq.
  for (const id of [...blocked, ...allowed]) {
    assert.ok(modelAllowedIn(id, "UZ"), id);
    assert.ok(modelAllowedIn(id, null), id);
  }
});

test("modelAllowedIn: Xitoy — Claude/GPT/Gemini yopiq, DeepSeek ochiq; Eron — faqat o'z serverimiz", () => {
  assert.ok(!modelAllowedIn("claude-opus-5", "CN"));
  assert.ok(!modelAllowedIn("gpt-4o", "HK"));
  assert.ok(modelAllowedIn("deepseek-v4-pro", "CN"));
  assert.ok(!modelAllowedIn("deepseek-v4-pro", "IR"));
  assert.ok(!modelAllowedIn("llama-3.3-free", "KP"));
  assert.ok(modelAllowedIn("tella-2", "IR"));
});

test("host qoidasi: NVIDIA NIM, LLM7, Mistral, noma'lum shlyuz — Rossiyada yopiq; Groq/OpenRouter — ochiq", () => {
  for (const h of ["nvidia", "llm7", "mistral", "openai", "rsi", "experiential", "gateway", "no-such-host"]) {
    assert.ok(!hostAllowedIn(h, "RU"), h);
  }
  for (const h of ["groq", "openrouter", "cerebras", "sambanova", "omniroute", "tella"]) assert.ok(hostAllowedIn(h, "RU"), h);
  assert.ok(!hostAllowedIn("groq", "IR"));
  assert.ok(hostAllowedIn("nvidia", "UZ"));
});

test("almashtirish jadvali: har bir ekvivalent RU/BY/CN da ruxsat etilgan", () => {
  for (const [cls, list] of Object.entries(REGION_EQUIVALENTS)) {
    assert.ok(list.length >= 3, cls);
    for (const e of list) for (const c of ["RU", "BY", "CN"]) assert.ok(modelAllowedIn(e.id, c), `${cls}: ${e.id} @ ${c}`);
    // Har sinfda tekin tarifga ham kamida bitta ekvivalent bor.
    assert.ok(list.some((e) => e.tier === "free"), cls);
  }
});

test("regionClassOf: flagship / fast / code / free", () => {
  assert.equal(regionClassOf("claude-opus-5", { tier: "ultra" }), "flagship");
  assert.equal(regionClassOf("gpt-4o", { tier: "pro" }), "flagship");
  assert.equal(regionClassOf("claude-haiku-4-5", { tier: "starter" }), "fast");
  assert.equal(regionClassOf("mistralai/codestral-latest"), "code");
  assert.equal(regionClassOf("grok-build", { tier: "pro" }), "code");
  assert.equal(regionClassOf("claude-sonnet-4-5", { tier: "pro", code: true }), "code");
  assert.equal(regionClassOf("gemini-flash-free", { tier: "free" }), "free");
  assert.equal(regionClassOf("auto/claude-sonnet"), "free");
  assert.equal(regionClassOf("openrouter/anthropic/claude-opus-5"), "flagship");
  assert.equal(regionClassOf("openrouter/openai/gpt-4o-mini"), "fast");
});

test("regionEquivalents: tarif chegarasi va mavjudlik hisobga olinadi", () => {
  // Ultra: Claude Opus → Kimi birinchi.
  assert.equal(regionEquivalents("claude-opus-5", "RU", { tier: "ultra", tierAllowed: planUpTo("ultra") })[0], REGION_SAFE.kimi);
  // Free foydalanuvchi pullik Kimi/DeepSeek olmaydi.
  const free = regionEquivalents("claude-opus-5", "RU", { tier: "ultra", tierAllowed: planUpTo("free") });
  assert.ok(free.length > 0);
  assert.ok(!free.includes(REGION_SAFE.kimi) && !free.includes(REGION_SAFE.deepseek));
  assert.equal(free[0], REGION_SAFE.qwen);
  // OmniRoute sozlanmagan — faqat katalog id'lari (kalit bilan).
  const noOmni = regionEquivalents("gpt-4o", "RU", {
    tier: "pro",
    tierAllowed: planUpTo("pro"),
    available: (id) => !id.includes("/"),
  });
  assert.equal(noOmni[0], "qwen3-8-max");
  assert.ok(noOmni.every((id) => !id.includes("/")));
  // Kod vazifasi — kod ekvivalenti.
  assert.equal(regionEquivalents("mistral/codestral-latest", "RU", { tierAllowed: planUpTo("starter") })[0], REGION_SAFE.deepseek);
  // Embargo — tashqi provayderlarning hech biri yo'q.
  assert.deepEqual(regionEquivalents("gpt-4o", "IR", { tier: "pro" }), []);
});

test("regionDecision (route qarori): cheklanmagan mintaqa — o'zgarishsiz", () => {
  const d = regionDecision({ requested: "claude-sonnet-4-5", candidates: ["claude-sonnet-4-5", "gpt-4o"], country: "UZ" });
  assert.deepEqual(d, { restricted: false, allowed: true, candidates: ["claude-sonnet-4-5", "gpt-4o"], substituted: false });
  const n = regionDecision({ requested: "gpt-4o", candidates: [], country: null });
  assert.deepEqual(n.candidates, ["gpt-4o"]);
});

test("regionDecision: Rossiya — Claude so'ralsa, ruxsat etilgan ekvivalentga o'tadi va buni belgilaydi", () => {
  const d = regionDecision({
    requested: "claude-sonnet-4-5",
    candidates: ["claude-sonnet-4-5", "claude-haiku-4-5", "llama-3.3-free"],
    country: "RU",
    tier: "pro",
    tierAllowed: planUpTo("pro"),
  });
  assert.equal(d.restricted, true);
  assert.equal(d.allowed, false);
  assert.equal(d.substituted, true);
  assert.equal(d.candidates[0], REGION_SAFE.kimi);
  assert.ok(d.candidates.length > 1);
  assert.ok(d.candidates.every((id) => modelAllowedIn(id, "RU")), d.candidates.join(","));
  assert.ok(!d.candidates.includes("claude-haiku-4-5"));
  assert.equal(new Set(d.candidates).size, d.candidates.length, "takrorsiz");
});

test("regionDecision: Rossiya — ruxsat etilgan model o'zi qoladi, yopiq zaxiralar olib tashlanadi", () => {
  const d = regionDecision({
    requested: "deepseek-v4-pro",
    candidates: ["deepseek-v4-pro", "gemini-flash-free", "nemotron-ultra-free", "llama-3.3-free"],
    country: "RU",
  });
  assert.deepEqual(d, { restricted: true, allowed: true, candidates: ["deepseek-v4-pro", "llama-3.3-free"], substituted: false });
});

test("regionDecision: Auto navbati (auto/best-free, Gemma, Qwen) — faqat ruxsat etilganlari", () => {
  const d = regionDecision({
    requested: "auto/best-free",
    candidates: ["auto/best-free", "auto/glm", "openrouter/google/gemma-4-31b-it:free", REGION_SAFE.qwen, "llama-3.3-free"],
    country: "BY",
    tierAllowed: planUpTo("free"),
  });
  assert.equal(d.substituted, true);
  assert.ok(!d.candidates.includes("auto/best-free"));
  assert.ok(!d.candidates.some((id) => id.includes("gemma")));
  assert.ok(d.candidates.includes("auto/glm") && d.candidates.includes("llama-3.3-free"));
});

test("regionDecision: embargo mintaqasi — nomzod yo'q (route rad etadi)", () => {
  const d = regionDecision({ requested: "claude-sonnet-4-5", candidates: ["claude-sonnet-4-5", "llama-3.3-free"], country: "IR" });
  assert.deepEqual(d.candidates, []);
  const own = regionDecision({ requested: "tella-2", candidates: ["tella-2"], country: "IR" });
  assert.deepEqual(own.candidates, ["tella-2"]);
});

console.log(`${passed} o'tdi, ${failed} yiqildi`);
if (failed) process.exit(1);
