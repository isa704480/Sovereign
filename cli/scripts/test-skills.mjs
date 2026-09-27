// Deterministik test: CLI tomonida SOVEREIGN Skills (cli/src/skills.mjs + agent.mjs javob ishlovi).
// Tarmoqsiz (fetch mock). Ishga tushirish: node cli/scripts/test-skills.mjs
import assert from "node:assert/strict";
import {
  SKILLS,
  SKILLS_MARK,
  canonicalSkillId,
  normalizeSkillIds,
  responseSkills,
  skillNames,
  syncSkillsMessage,
} from "../src/skills.mjs";
import { SKILLS as CMD_SKILLS, SKILL_IDS } from "../src/commands.mjs";
import { agentTurn } from "../src/agent.mjs";

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
  } catch (e) {
    failed++;
    console.error(`✕ ${name}\n  ${String(e?.message ?? e).split("\n").join("\n  ")}`);
  }
}

await test("katalog: 7 ta skill, commands.mjs bilan bir xil, belgilar emoji emas", () => {
  assert.equal(SKILLS.length, 7);
  assert.equal(CMD_SKILLS, SKILLS);
  assert.deepEqual(SKILL_IDS, SKILLS.map((s) => s.id));
  for (const s of SKILLS) assert.ok(!/\p{Extended_Pictographic}/u.test(s.mark), `${s.id}: ${s.mark}`);
});

await test("taxalluslar va normalizatsiya", () => {
  assert.equal(canonicalSkillId("pro-writing"), "no-ai-slop");
  assert.equal(canonicalSkillId(" Apple-Liquid-Glass "), "apple-design");
  assert.equal(canonicalSkillId("adhd"), "focus-mode");
  assert.equal(canonicalSkillId("unknown"), null);
  assert.deepEqual(normalizeSkillIds(["pro-writing", "no-ai-slop", "x", 5, "clean-code"]), ["no-ai-slop", "clean-code"]);
  assert.deepEqual(normalizeSkillIds(null), []);
});

await test("responseSkills: yangi server → massiv, eski server → null", () => {
  assert.deepEqual(responseSkills({ message: {}, skills: ["clean-code", "pro-writing", "bogus"] }), ["clean-code", "no-ai-slop"]);
  assert.deepEqual(responseSkills({ message: {}, skills: [] }), []);
  assert.equal(responseSkills({ message: {} }), null);
  assert.equal(responseSkills(null), null);
  assert.deepEqual(skillNames(["clean-code", "apple-design"]), ["Clean Code", "Apple Liquid Glass"]);
});

await test("syncSkillsMessage: zaxira (eski server) — nomlar; yangi server — olib tashlanadi", () => {
  const msgs = [{ role: "system", content: "SYS" }, { role: "user", content: "hi" }];
  syncSkillsMessage(msgs, new Set(["clean-code", "pro-writing"]), { fallback: true });
  assert.equal(msgs.length, 3);
  assert.equal(msgs[1].role, "system");
  assert.ok(msgs[1].content.startsWith(SKILLS_MARK));
  assert.ok(msgs[1].content.includes("Clean Code") && msgs[1].content.includes("No AI Slop"));
  // Takroriy chaqiruv — yangi xabar qo'shilmaydi, yangilanadi.
  syncSkillsMessage(msgs, new Set(["data-viz"]), { fallback: true });
  assert.equal(msgs.filter((m) => m.content?.startsWith?.(SKILLS_MARK)).length, 1);
  assert.ok(msgs[1].content.includes("Data Viz"));
  // Yangi server: placebo xabar qolmaydi (eski sessiyadan qolgani ham).
  syncSkillsMessage(msgs, new Set(["data-viz"]), { fallback: false });
  assert.ok(!msgs.some((m) => typeof m.content === "string" && m.content.startsWith(SKILLS_MARK)));
  assert.equal(msgs.length, 2);
});

// ---- agentTurn: server javobidagi `skills` ----------------------------------
const realFetch = globalThis.fetch;
function mockServer(body) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  return calls;
}
const baseConfig = () => ({ token: "t0k", baseUrl: "https://example.invalid", model: "auto" });
const turn = (config) =>
  agentTurn({
    messages: [{ role: "system", content: "SYS" }, { role: "user", content: "Refactor this function" }],
    config,
    confirm: async () => false,
    print: false,
    verify: false,
  });

await test("yangi server: natijada skills, config.skillsServer = true, CLI skill xabari yubormaydi", async () => {
  const calls = mockServer({ message: { role: "assistant", content: "Done." }, skills: ["clean-code"], usage: { prompt_tokens: 10, completion_tokens: 2 } });
  const config = baseConfig();
  const res = await turn(config);
  assert.equal(res.error, undefined);
  assert.deepEqual(res.skills, ["clean-code"]);
  assert.equal(config.skillsServer, true);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.endsWith("/api/cli/chat"));
  assert.ok(!calls[0].body.messages.some((m) => typeof m.content === "string" && m.content.startsWith(SKILLS_MARK)));
});

await test("eski server (skills maydoni yo'q): skills [], config.skillsServer = false", async () => {
  mockServer({ message: { role: "assistant", content: "Done." } });
  const config = baseConfig();
  const res = await turn(config);
  assert.deepEqual(res.skills, []);
  assert.equal(config.skillsServer, false);
});

await test("server bo'sh massiv qaytarsa — yangi server, skill yo'q", async () => {
  mockServer({ message: { role: "assistant", content: "Hi!" }, skills: [] });
  const config = baseConfig();
  const res = await turn(config);
  assert.deepEqual(res.skills, []);
  assert.equal(config.skillsServer, true);
});

globalThis.fetch = realFetch;
console.log(`\ntest-skills: ${passed} o'tdi, ${failed} yiqildi`);
process.exit(failed ? 1 : 0);
