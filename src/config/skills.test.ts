/**
 * Lokal test (LLM/tarmoqsiz): npx tsx --conditions=react-server src/config/skills.test.ts
 * SOVEREIGN Skills: katalog yaxlitligi, i18n kalitlari, prompt byudjeti, triggerlar (uz/ru/en —
 * ijobiy va salbiy), taxalluslar, faol skillar limiti, server injeksiyasi (/api/cli/chat helper'lari)
 * va CLI/Cowork kataloglari server bilan mosligi.
 */
import assert from "node:assert/strict";
import {
  DEFAULT_ENABLED_SKILLS,
  KNOWN_SKILL_IDS,
  MAX_ACTIVE_SKILLS,
  MAX_AUTO_SKILLS,
  SKILLS,
  canonicalSkillId,
  contentText,
  detectSkills,
  isTrivialMessage,
  lastUserText,
  normalizeSkillIds,
  resolveActiveSkills,
  skillSystemMessage,
  skillsPrompt,
  withSkillMessage,
} from "./skills";
import { LANGS, translate } from "@/lib/i18n";
import * as cliSkills from "../../cli/src/skills.mjs";
import * as deskSkills from "../../desktop/ui/src/lib/skills.js";
import { applyEvent, initialAgent } from "../../desktop/ui/src/lib/agent.js";

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

const ids = (text: string, enabled: string[] = []) => resolveActiveSkills(enabled, text).map((s) => s.id);

// ─── Katalog ────────────────────────────────────────────────────────────────

test("id va taxalluslar noyob, bir-biriga to'qnashmaydi", () => {
  const all = SKILLS.flatMap((s) => [s.id, ...(s.aliases ?? [])]);
  assert.equal(new Set(all).size, all.length);
  assert.deepEqual([...KNOWN_SKILL_IDS].sort(), [...all].sort());
});

test("katalog JSON'ga to'liq seriyalanadi (triggerlar — regex manba satrlari)", () => {
  const round = JSON.parse(JSON.stringify(SKILLS));
  assert.deepEqual(round, SKILLS);
  for (const s of SKILLS) for (const t of s.triggers) assert.doesNotThrow(() => new RegExp(t.source, t.flags), `${s.id}: ${t.source}`);
});

test("har skill nomi/tavsifi/bandlari 4 tilda bo'sh emas", () => {
  for (const s of SKILLS) {
    assert.ok(s.detailKeys.length >= 3, `${s.id}: details`);
    for (const l of LANGS) {
      for (const k of [s.nameKey, s.descKey, ...s.detailKeys]) {
        const v = translate(l.id, k);
        assert.ok(typeof v === "string" && v.trim() && v !== k, `${s.id} ${l.id} ${k}`);
      }
    }
  }
});

test("prompt byudjeti: har biri ≤ 2400 belgi (≈600 token), hammasi 'SKILL:' bilan boshlanadi", () => {
  for (const s of SKILLS) {
    assert.ok(s.prompt.length <= 2400, `${s.id}: ${s.prompt.length} belgi`);
    assert.ok(s.prompt.startsWith("SKILL: "), s.id);
    // Emoji / bezak belgilarsiz (model uchun ortiqcha token).
    assert.ok(!/\p{Extended_Pictographic}/u.test(s.prompt), `${s.id}: emoji`);
  }
});

test("tashqi manbali skillarda manba va litsenziya bor", () => {
  for (const id of ["ui-ux-pro-max", "apple-design", "cybersecurity", "no-ai-slop", "focus-mode"]) {
    const s = SKILLS.find((x) => x.id === id)!;
    assert.ok(s.source?.url.startsWith("https://github.com/"), id);
    assert.equal(s.source?.license, "MIT", id);
  }
});

test("standart yoqilganlar o'zgarmagan (DB default bilan mos)", () => {
  assert.deepEqual(DEFAULT_ENABLED_SKILLS, ["ui-ux-pro-max", "clean-code"]);
});

test("Apple Liquid Glass: tokenlar va qoidalar promptda", () => {
  const p = SKILLS.find((s) => s.id === "apple-design")!.prompt;
  for (const needle of ["#f5f5f7", "rgba(0,0,0,.07)", "saturate(180%) blur(20px)", "tabular-nums", "prefers-reduced-motion", "pill 999"]) {
    assert.ok(p.includes(needle), needle);
  }
});

test("cybersecurity — faqat mudofaa doirasi", () => {
  const p = SKILLS.find((s) => s.id === "cybersecurity")!.prompt;
  assert.match(p, /No malware, detection evasion, credential theft/);
});

// ─── Triggerlar: ijobiy (uz / ru / en) ──────────────────────────────────────

const POSITIVE: [string, string][] = [
  ["ui-ux-pro-max", "Design a landing page for a coffee shop"],
  ["ui-ux-pro-max", "Kofe do'koni uchun landing sahifa dizaynini qilib ber"],
  ["ui-ux-pro-max", "Сделай дизайн лендинга для кофейни"],
  ["ui-ux-pro-max", "Fix the button color and the form layout"],
  ["apple-design", "Make it look like Apple with liquid glass"],
  ["apple-design", "Apple uslubida minimal sahifa yasab ber"],
  ["apple-design", "Сделай интерфейс в стиле Apple"],
  ["clean-code", "Refactor this function to remove duplication"],
  ["clean-code", "Python’da fayllarni saralaydigan skript yozib ber"],
  ["clean-code", "Напиши функцию на TypeScript для валидации email"],
  ["clean-code", "why does this fail?\n```js\nconst a = b.c;\n```"],
  ["cybersecurity", "Review this login endpoint for SQL injection and IDOR"],
  ["cybersecurity", "Loyihamni xavfsizlik bo'yicha tekshirib ber"],
  ["cybersecurity", "Проверь код на уязвимости"],
  ["cybersecurity", "Is storing the JWT token in localStorage secure?"],
  ["no-ai-slop", "Rewrite this blog post so it doesn't sound robotic"],
  ["no-ai-slop", "Mana bu matnni tahrir qilib ber, ohangi rasmiyroq bo'lsin"],
  ["no-ai-slop", "Отредактируй текст поста для телеграма"],
  ["data-viz", "Build a bar chart of monthly revenue with Recharts"],
  ["data-viz", "Oylik savdo bo'yicha grafik chizib ber"],
  ["data-viz", "Построй диаграмму продаж по месяцам"],
];
for (const [skill, text] of POSITIVE) {
  test(`trigger ✓ ${skill}: ${text.slice(0, 48)}`, () => {
    assert.ok(detectSkills(text).includes(skill), `detect: ${JSON.stringify(detectSkills(text))}`);
    assert.ok(ids(text).includes(skill), `active: ${JSON.stringify(ids(text))}`);
  });
}

// ─── Triggerlar: salbiy (oddiy / mavzusiz xabarlar) ──────────────────────────

const TRIVIAL = ["hi", "Hello!", "thanks!", "ok", "salom", "Rahmat!", "Assalomu alaykum", "Привет", "Спасибо!", "ок", "Салом", "   ", "design"];
for (const text of TRIVIAL) {
  test(`trivial → skill yo'q: ${JSON.stringify(text)}`, () => {
    assert.ok(isTrivialMessage(text));
    assert.deepEqual(detectSkills(text), []);
    assert.deepEqual(ids(text), []);
  });
}

const UNRELATED = [
  "What's next?",
  "How are you today?",
  "What is the capital of France?",
  "Qalaysan, ishlar qalay?",
  "O'zbekiston poytaxti qaysi shahar?",
  "Как дела у тебя сегодня?",
  "Какая погода в Ташкенте?",
  "Explain how photosynthesis works in plants",
  "What's the best way to learn English quickly?",
  "Menga bugungi yangiliklarni qisqacha aytib ber",
  "Расскажи анекдот про программистов",
  "Tell me a short story about a cat",
];
for (const text of UNRELATED) {
  test(`mavzusiz → skill yo'q: ${text}`, () => {
    assert.deepEqual(detectSkills(text), []);
  });
}

test("aniq noto'g'ri ishlashlar yo'q", () => {
  assert.ok(!detectSkills("My iOS app crashes on launch").includes("apple-design"), "iOS crash ≠ Apple dizayn");
  assert.ok(!detectSkills("Use dependency injection in this service").includes("cybersecurity"), "DI ≠ xavfsizlik");
  assert.ok(!detectSkills("Write a function that validates the email text field").includes("no-ai-slop"), "kod ≠ matn tahriri");
  assert.ok(!detectSkills("Design a REST API for orders").includes("ui-ux-pro-max"), "API dizayn ≠ UI");
  assert.ok(!detectSkills("I have ADHD, help me focus on this task list").includes("focus-mode"), "focus-mode faqat qo'lda");
});

test("ʻ ’ apostroflar ham tanlanadi (ma’lumot)", () => {
  assert.ok(detectSkills("Oylik maʼlumotlar bo‘yicha grafik tuz").includes("data-viz"));
});

// ─── Taxalluslar ─────────────────────────────────────────────────────────────

test("taxalluslar: pro-writing → no-ai-slop, apple-liquid-glass → apple-design", () => {
  assert.equal(canonicalSkillId("pro-writing"), "no-ai-slop");
  assert.equal(canonicalSkillId("apple-liquid-glass"), "apple-design");
  assert.equal(canonicalSkillId("APPLE-DESIGN"), "apple-design");
  assert.equal(canonicalSkillId("i-have-adhd"), "focus-mode");
  assert.equal(canonicalSkillId("custom:abc"), null);
  assert.equal(canonicalSkillId("nope"), null);
  assert.equal(canonicalSkillId(42), null);
  assert.deepEqual(normalizeSkillIds(["pro-writing", "no-ai-slop", "x", "apple-design", null]), ["no-ai-slop", "apple-design"]);
});

test("eski saqlangan enabled_skills ishlashda davom etadi", () => {
  const got = ids("Rewrite the landing page copy and polish the UI design of the hero section", ["pro-writing", "apple-design"]);
  assert.ok(got.includes("apple-design") && got.includes("no-ai-slop"), JSON.stringify(got));
});

// ─── Limit ───────────────────────────────────────────────────────────────────

test(`faol skillar ko'pi bilan ${MAX_ACTIVE_SKILLS} ta (hammasi yoqilgan bo'lsa ham)`, () => {
  const all = SKILLS.map((s) => s.id);
  // Token tejash: "hi" — faqat trigger'siz (uslub) skill qoladi.
  assert.deepEqual(ids("hi", all), ["focus-mode"]);
  assert.equal(ids("Security audit of the chart dashboard code", all).length, MAX_ACTIVE_SKILLS);
});

test("ko'p yoqilganda — xabarga eng moslari tanlanadi", () => {
  const all = SKILLS.map((s) => s.id);
  const got = ids("Check this endpoint for SQL injection and XSS, then plot the results as a bar chart", all);
  assert.ok(got.includes("cybersecurity") && got.includes("data-viz"), JSON.stringify(got));
});

test(`avto-aniqlash ko'pi bilan ${MAX_AUTO_SKILLS} ta qo'shadi`, () => {
  const text = "Design a responsive landing page UI with a revenue chart, refactor the TypeScript code and check it for XSS vulnerabilities";
  assert.ok(detectSkills(text).length > MAX_AUTO_SKILLS, JSON.stringify(detectSkills(text)));
  assert.equal(ids(text).length, MAX_AUTO_SKILLS);
});

test("yoqilganlar + avto umumiy limitdan oshmaydi", () => {
  const text = "Refactor the TypeScript code of this dashboard UI layout, build a bar chart of monthly revenue and review it for SQL injection";
  const got = ids(text, ["ui-ux-pro-max", "clean-code", "focus-mode"]);
  assert.ok(got.length <= MAX_ACTIVE_SKILLS, JSON.stringify(got));
  assert.ok(got.includes("focus-mode") && got.includes("ui-ux-pro-max") && got.includes("clean-code"), JSON.stringify(got));
});

test("natija katalog tartibida (barqaror prompt)", () => {
  const got = ids("Design a dashboard layout with a bar chart", ["data-viz", "ui-ux-pro-max"]).filter((id) => id === "data-viz" || id === "ui-ux-pro-max");
  assert.deepEqual(got, ["ui-ux-pro-max", "data-viz"]);
});

test("token tejash: yoqilgan skill mavzuga aloqasiz xabarda qo'shilmaydi", () => {
  assert.deepEqual(ids("salom, qalaysan?", ["ui-ux-pro-max", "clean-code"]), []);
  assert.deepEqual(ids("Toshkentda ertaga ob-havo qanday bo'ladi?", ["ui-ux-pro-max", "clean-code"]), []);
  assert.ok(ids("Fix the bug in this TypeScript function", ["clean-code"]).includes("clean-code"));
});

// ─── Server injeksiyasi (/api/cli/chat helper'lari) ──────────────────────────

test("skillSystemMessage: hech narsa faol bo'lmasa — null", () => {
  assert.equal(skillSystemMessage([], "hi"), null);
  assert.equal(skillSystemMessage(null, "thanks"), null);
  assert.equal(skillSystemMessage(["bogus"], "hello"), null);
});

test("skillSystemMessage: yoqilgan + avto → id'lar va to'liq qo'llanma", () => {
  const m = skillSystemMessage(["clean-code"], "Review this login endpoint for SQL injection");
  assert.ok(m);
  assert.deepEqual(m.ids, ["clean-code", "cybersecurity"]);
  assert.ok(m.content.startsWith("SOVEREIGN SKILLS"));
  assert.ok(m.content.includes("SKILL: Clean Code") && m.content.includes("SKILL: Cybersecurity"));
  assert.equal(m.content, skillsPrompt(resolveActiveSkills(["clean-code"], "Review this login endpoint for SQL injection")));
});

test("lastUserText / contentText: matn qismlari, rasm e'tiborsiz", () => {
  const msgs = [
    { role: "system", content: "SYS" },
    { role: "user", content: "first" },
    { role: "assistant", content: "ok" },
    { role: "user", content: [{ type: "image_url", image_url: { url: "data:image/png;base64,AA" } }, { type: "text", text: "draw a chart" }] },
    { role: "tool", content: "tool output mentions security" },
  ];
  assert.equal(lastUserText(msgs), "draw a chart");
  assert.equal(contentText(null), "");
  assert.equal(lastUserText([{ role: "system", content: "x" }]), "");
});

test("withSkillMessage: boshlang'ich system blokidan keyin, asl massiv o'zgarmaydi", () => {
  const msgs = [
    { role: "system", content: "A" },
    { role: "system", content: "B" },
    { role: "user", content: "u" },
    { role: "system", content: "late" },
  ];
  const out = withSkillMessage(msgs, "SKILLS");
  assert.deepEqual(out.map((m) => m.role), ["system", "system", "system", "user", "system"]);
  assert.equal((out[2] as { content: string }).content, "SKILLS");
  assert.equal(msgs.length, 4);
  assert.deepEqual(withSkillMessage([{ role: "user", content: "u" }], "S").map((m) => m.role), ["system", "user"]);
});

// ─── CLI / Cowork kataloglari server bilan mos ───────────────────────────────

test("CLI katalogi: id tartibi va taxalluslar server bilan bir xil", () => {
  assert.deepEqual(cliSkills.SKILL_IDS, SKILLS.map((s) => s.id));
  for (const s of SKILLS) {
    const c = cliSkills.SKILLS.find((x: { id: string }) => x.id === s.id);
    assert.ok(c, s.id);
    assert.deepEqual([...(c.aliases ?? [])].sort(), [...(s.aliases ?? [])].sort(), s.id);
    assert.equal(Boolean(c.manual), s.triggers.length === 0, `${s.id}: manual`);
  }
  for (const id of KNOWN_SKILL_IDS) assert.equal(cliSkills.canonicalSkillId(id), canonicalSkillId(id), id);
});

test("Cowork katalogi: id'lar, avto/qo'lda va limit server bilan bir xil", () => {
  assert.deepEqual(deskSkills.SKILLS.map((s: { id: string }) => s.id), SKILLS.map((s) => s.id));
  for (const s of SKILLS) assert.equal(deskSkills.SKILL_BY_ID[s.id].auto, s.triggers.length > 0, s.id);
  assert.equal(deskSkills.MAX_ACTIVE_SKILLS, MAX_ACTIVE_SKILLS);
});

test("Cowork reducer: 'skills' hodisasi → chip qatori (noma'lum id'lar tashlanadi)", () => {
  const s1 = applyEvent(initialAgent, { type: "skills", skills: ["clean-code", "evil<script>", "clean-code", "data-viz"] });
  const last = s1.items[s1.items.length - 1];
  assert.equal(last.kind, "skills");
  assert.deepEqual(last.ids, ["clean-code", "data-viz"]);
  assert.equal(applyEvent(initialAgent, { type: "skills", skills: ["nope"] }), initialAgent);
  assert.equal(applyEvent(initialAgent, { type: "skills" }), initialAgent);
});

console.log(`\nskills: ${passed} o'tdi, ${failed} yiqildi`);
if (failed) process.exit(1);
