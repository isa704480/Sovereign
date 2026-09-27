/**
 * Lokal test (tarmoqsiz): npx tsx src/lib/ai/served.test.ts
 * "Qaysi model javob berdi" solishtiruvi va o'zbek yozuvi siljishi detektori.
 */
import assert from "node:assert/strict";
import { isSubstitution, sameModel } from "./served";
import { scriptDrift } from "./script-check";

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

test("bir xil model — turli yozilishi", () => {
  assert.ok(sameModel("anthropic/claude-sonnet-4.5", "claude-sonnet-4-5-20250929"));
  assert.ok(sameModel("meta-llama/llama-3.3-70b-instruct", "Meta-Llama-3.3-70B-Instruct"));
  assert.ok(sameModel("meta-llama/llama-3.3-70b-instruct", "llama-3.3-70b"));
  assert.ok(sameModel("openai/gpt-4o-mini", "gpt-4o-mini-2024-07-18"));
  assert.ok(sameModel("meta-llama/llama-3.3-70b-instruct:free", "meta-llama/llama-3.3-70b-instruct"));
});

test("boshqa model — almashtirish", () => {
  assert.ok(!sameModel("meta-llama/llama-3.3-70b-instruct", "openai/gpt-oss-120b"));
  assert.ok(!sameModel("openai/gpt-4o", "gpt-4o-mini"));
  assert.ok(!sameModel("anthropic/claude-opus-5", "claude-sonnet-4-5"));
  assert.ok(isSubstitution("meta-llama/llama-3.3-70b-instruct:free", "mistral-Nemo-Instruct-2407"));
});

test("Cloudflare: xuddi shu model (host prefiksi, @cf/, kvantlash) — almashtirish emas", () => {
  assert.ok(!isSubstitution("deepseek/deepseek-v4-pro-0813", "cloudflare/@cf/deepseek-ai/deepseek-v4-pro-0813"));
  assert.ok(!isSubstitution("qwen/qwen3.8-27b", "cloudflare/@cf/qwen/qwen3.8-27b"));
  assert.ok(!isSubstitution("z-ai/glm-5.3", "cloudflare/@cf/zai-org/glm-5.3"));
  assert.ok(!isSubstitution("groq/qwen/qwen3.8-27b", "cloudflare/@cf/qwen/qwen3.8-27b"));
  assert.ok(!isSubstitution("meta-llama/llama-3.3-70b-instruct:free", "cloudflare/@cf/meta/llama-3.3-70b-instruct-fp8-fast"));
  assert.ok(!isSubstitution("cloudflare/@cf/moonshotai/kimi-k2.6", "cloudflare/@cf/moonshotai/kimi-k2.6"));
});

test("Cloudflare: boshqa model (OpenRouter krediti tugagan Claude → DeepSeek) — almashtirish", () => {
  assert.ok(isSubstitution("anthropic/claude-sonnet-5", "cloudflare/@cf/deepseek-ai/deepseek-v4-pro-0813"));
  assert.ok(isSubstitution("deepseek/deepseek-v4.1-flash", "cloudflare/@cf/deepseek-ai/deepseek-v4-flash-0731"));
  assert.ok(isSubstitution("moonshotai/kimi-k2.6", "cloudflare/@cf/moonshotai/kimi-k2.7-code"));
  // Kvantlash qo'shimchasi faqat oxirida — "fast" model nomining o'zi bo'lsa saqlanadi.
  assert.ok(isSubstitution("x-ai/grok-4", "x-ai/grok-4-fast"));
});

test("auto/* kombosi almashtirish emas", () => {
  assert.ok(!isSubstitution("auto/gemini", "gemini-2.5-flash"));
});

test("yozuv: lotin savol, aralash javob — log", () => {
  const d = scriptDrift(
    "Salom, menga Toshkent haqida qisqacha yozib bering",
    "Toshkent — O‘zbekistonning poytaxti. Шаҳар аҳолиси тахминан уч миллиондан ортиқ, у Марказий Осиёдаги энг катта шаҳарлардан бири hisoblanadi.",
  );
  assert.equal(d?.kind, "mixed");
});

test("yozuv: toza lotin javob — log yo'q", () => {
  assert.equal(
    scriptDrift(
      "Salom, menga Toshkent haqida yozing",
      "Toshkent — O‘zbekistonning poytaxti va Markaziy Osiyodagi eng katta shaharlardan biri. `const x = 'Шаҳар'` kodi hisobga olinmaydi.",
    ),
    null,
  );
});

test("yozuv: o'zbekcha kirill savol, ruscha javob — log", () => {
  const ru =
    "Ташкент является столицей Узбекистана и одним из крупнейших городов Центральной Азии. " +
    "Население города превышает три миллиона человек, здесь расположено множество музеев, парков и исторических памятников, " +
    "а также современный деловой центр и метрополитен, открытый в семидесятых годах прошлого века.";
  assert.equal(scriptDrift("Тошкент ҳақида қисқача ёзинг", ru)?.kind, "russian-for-uz-cyrl");
});

console.log(`${passed} o'tdi, ${failed} yiqildi`);
if (failed) process.exit(1);
