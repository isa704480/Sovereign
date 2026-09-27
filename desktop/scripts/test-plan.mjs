// Reja (plan) kartasi: hodisa → reducer → tarixdan qayta tiklash yo'li.
// Electron'siz, faqat sof JS modullari. Ishga tushirish: node scripts/test-plan.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { applyEvent, initialAgent, planItem, replayEvents, PLAN_MAX_STEPS, PLAN_STEP_MAX } from "../ui/src/lib/agent.js";
import { createPlan } from "../../cli/src/tools.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

let n = 0;
let bad = 0;
const test = (name, fn) => {
  try {
    fn();
    n++;
    console.log(`✓ ${name}`);
  } catch (e) {
    bad++;
    console.log(`✕ ${name}\n  ${e?.stack ?? e}`);
  }
};

const snapOf = (steps, active) => ({
  steps,
  active,
  total: steps.length,
  done: steps.filter((s) => s.done).length,
});
const planEv = (steps, active) => ({ type: "plan", ...snapOf(steps, active) });
const step = (text, done = false) => ({ text, done });

// ---- Main jarayon: hodisa tarixga yoziladi -------------------------------
test("main.mjs: plan RECORDED ro'yxatida (tarixdan qayta tiklanadi)", () => {
  const src = readFileSync(join(ROOT, "main.mjs"), "utf8");
  const m = /const RECORDED = new Set\(\[([^\]]*)\]\)/.exec(src);
  assert.ok(m, "RECORDED topilmadi");
  assert.ok(m[1].includes('"plan"'), "plan RECORDED'da yo'q");
  // Reja qadami emas — tasdiq oynasi yo'q, `tool` hodisasi ham yuborilmaydi.
  assert.match(src, /const isPlan = call\.function\.name === "plan";/);
  assert.match(src, /if \(!isPlan\) send\("tool"/);
  assert.match(src, /send\("plan", plan\.snapshot\(\)\)/);
});

test("main.mjs: jurnal hodisasiga reja holati qo'shiladi", () => {
  const src = readFileSync(join(ROOT, "main.mjs"), "utf8");
  assert.equal((src.match(/plan: tracker\.planSnapshot\(\)/g) ?? []).length, 5, "sendLedger chaqiruvlari");
  // `plan` ledger hodisasida yuboriladi (undan keyin boshqa maydonlar ham bo'lishi mumkin).
  assert.match(src, /send\("ledger", \{[^}]*\bplan\b[^}]*\}\)/);
});

test("main.mjs va CLI bir xil reja tuzilmasidan foydalanadi", () => {
  const plan = createPlan();
  plan.apply({ steps: ["a", "b", "c"], done: [1] });
  const snap = plan.snapshot();
  assert.deepEqual(Object.keys(snap).sort(), ["active", "done", "steps", "total"]);
  const it = planItem(snap);
  assert.equal(it.total, 3);
  assert.equal(it.done, 1);
  assert.equal(it.active, 2);
});

// ---- Reducer: tozalash ---------------------------------------------------
test("reducer: qadam matni tozalanadi (bidi/boshqaruv/uzunlik)", () => {
  const rlo = String.fromCharCode(0x202e);
  const it = planItem(planEv([step(`a${rlo}b`), step("c\nd"), step("x".repeat(300))], 1));
  assert.equal(it.steps[0].text, "a b"); // renderer: ko'rinmas belgi bo'sh joyga (plainText)
  assert.ok(!/[‪-‮]/.test(it.steps[0].text));
  assert.equal(it.steps[1].text, "c d");
  assert.equal(it.steps[2].text.length, PLAN_STEP_MAX);
});

test("reducer: 12 tadan ortiq qadam va bo'sh qadamlar kesiladi", () => {
  const it = planItem(planEv(Array.from({ length: 30 }, (_, i) => step(`q${i}`)), 1));
  assert.equal(it.total, PLAN_MAX_STEPS);
  assert.equal(planItem(planEv([step("  "), step("")], 1)), null);
  assert.equal(planItem({ type: "plan" }), null);
  assert.equal(planItem({ type: "plan", steps: "a,b" }), null);
});

test("reducer: chegaradan tashqari active — 0 (hech biri faol emas)", () => {
  assert.equal(planItem(planEv([step("a"), step("b")], 9)).active, 0);
  assert.equal(planItem(planEv([step("a"), step("b")], 0)).active, 0);
  assert.equal(planItem(planEv([step("a"), step("b")], 1.5)).active, 0);
  assert.equal(planItem(planEv([step("a"), step("b")], 2)).active, 2);
});

// ---- Reducer: bitta karta joyida yangilanadi -----------------------------
test("bir navbatda bitta karta: keyingi plan hodisasi uni JOYIDA yangilaydi", () => {
  let s = applyEvent(initialAgent, { type: "user", text: "vazifa", mode: "code" });
  s = applyEvent(s, planEv([step("a"), step("b"), step("c")], 1));
  const first = s.items.filter((i) => i.kind === "plan");
  assert.equal(first.length, 1);
  s = applyEvent(s, planEv([step("a", true), step("b"), step("c")], 2));
  const plans = s.items.filter((i) => i.kind === "plan");
  assert.equal(plans.length, 1, "yangi karta qo'shilmasligi kerak");
  assert.equal(plans[0].id, first[0].id, "id saqlanadi (React qayta chizmaydi)");
  assert.equal(plans[0].done, 1);
  assert.equal(plans[0].active, 2);
});

test("yangi foydalanuvchi xabaridan keyin — YANGI reja kartasi", () => {
  let s = applyEvent(initialAgent, { type: "user", text: "birinchi", mode: "code" });
  s = applyEvent(s, planEv([step("a"), step("b")], 1));
  s = applyEvent(s, { type: "done" });
  s = applyEvent(s, { type: "user", text: "ikkinchi", mode: "code" });
  s = applyEvent(s, planEv([step("x"), step("y")], 1));
  const plans = s.items.filter((i) => i.kind === "plan");
  assert.equal(plans.length, 2);
  assert.deepEqual(plans[1].steps.map((x) => x.text), ["x", "y"]);
});

test("yaroqsiz plan hodisasi holatni o'zgartirmaydi", () => {
  const s = applyEvent(initialAgent, { type: "plan", steps: [] });
  assert.equal(s.items.length, 0);
});

// ---- Tarixdan qayta tiklash ----------------------------------------------
test("replay: tarixdagi plan hodisalari bitta yakuniy kartaga yig'iladi", () => {
  const s = replayEvents([
    { type: "user", text: "vazifa", mode: "code" },
    planEv([step("a"), step("b"), step("c")], 1),
    planEv([step("a", true), step("b"), step("c")], 2),
    planEv([step("a", true), step("b", true), step("c")], 3),
    { type: "text", text: "tayyor" },
  ]);
  const plans = s.items.filter((i) => i.kind === "plan");
  assert.equal(plans.length, 1);
  assert.equal(plans[0].done, 2);
  assert.equal(plans[0].total, 3);
  assert.equal(plans[0].active, 3);
  assert.equal(s.busy, false);
});

// ---- Jurnal kartasidagi reja xulosasi ------------------------------------
test("ledger hodisasi: reja holati tozalanib saqlanadi", () => {
  const s = applyEvent(initialAgent, {
    type: "ledger",
    entries: [],
    plan: snapOf([step("a", true), step("b"), step("c")], 2),
  });
  const led = s.items[0];
  assert.equal(led.kind, "ledger");
  assert.equal(led.plan.total, 3);
  assert.equal(led.plan.done, 1);
  assert.deepEqual(led.plan.steps.filter((x) => !x.done).map((x) => x.text), ["b", "c"]);
});

test("ledger hodisasi: reja bo'lmasa plan null", () => {
  assert.equal(applyEvent(initialAgent, { type: "ledger", entries: [] }).items[0].plan, null);
  assert.equal(applyEvent(initialAgent, { type: "ledger", entries: [], plan: { steps: [] } }).items[0].plan, null);
  assert.equal(applyEvent(initialAgent, { type: "ledger", entries: [], plan: "hammasi bajarildi" }).items[0].plan, null);
});

// ---- UI: karta model belgilamagan qadamni "bajarildi" deb ko'rsatmaydi ----
test("Conversation.jsx: 'bajarildi' faqat done bayrog'idan, matn i18n orqali", () => {
  const src = readFileSync(join(ROOT, "ui/src/components/Conversation.jsx"), "utf8");
  assert.match(src, /export function PlanCard/);
  assert.match(src, /s\.done \? "checkSquare"/);
  assert.match(src, /aria-current=\{active \? "step" : undefined\}/);
  assert.match(src, /role="list"/);
  assert.match(src, /aria-live="polite"/);
  // Reja matni HTML sifatida chizilmaydi (dangerouslySetInnerHTML faqat Assistant'da).
  assert.equal((src.match(/dangerouslySetInnerHTML/g) ?? []).length, 1);
});

console.log(`\n${n} ta test o'tdi${bad ? `, ${bad} ta yiqildi` : ""}`);
process.exit(bad ? 1 : 0);
