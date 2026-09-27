// Deterministik test: `plan` vositasi (chek-ro'yxat) — validatsiya, tozalash,
// indeks chegaralari, almashtirish/yangilash va jurnal xulosasi.
// Tarmoq, disk va tasdiq YO'Q. Ishga tushirish: node cli/scripts/test-plan.mjs
import assert from "node:assert/strict";
import {
  createPlan,
  createTurnTracker,
  planSummary,
  planText,
  runTool,
  toolStatus,
  ledgerLines,
  PLAN_MAX_STEPS,
  PLAN_RULE,
  PLAN_STEP_MAX,
  TOOL_SCHEMA,
} from "../src/tools.mjs";

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`✕ ${name}\n  ${e?.stack ?? e}`);
  }
}

const noConfirm = async () => {
  throw new Error("plan hech qachon tasdiq so'ramasligi kerak");
};
const call = (plan, args) => runTool("plan", args, noConfirm, { plan });

// ---- Sxema ---------------------------------------------------------------
await test("TOOL_SCHEMA: plan birinchi vosita, majburiy argumentsiz", () => {
  const fns = TOOL_SCHEMA.map((t) => t.function.name);
  assert.equal(fns[0], "plan");
  const p = TOOL_SCHEMA[0].function.parameters;
  assert.equal(p.required, undefined);
  assert.deepEqual(Object.keys(p.properties).sort(), ["active", "done", "steps"]);
  assert.equal(p.properties.steps.items.type, "string");
  assert.equal(p.properties.active.type, "integer");
});

await test("SYSTEM qoidasi 3+ qadam va `done` belgilashni talab qiladi", () => {
  assert.match(PLAN_RULE, /3 yoki undan ko'p/);
  assert.match(PLAN_RULE, /done/);
  assert.match(PLAN_RULE, /Bajarmagan qadamni `done` deb belgilama/);
});

// ---- Tozalash (sanitizatsiya) --------------------------------------------
await test("planText: boshqaruv, bidi va nol-kenglik belgilari zararsizlantiriladi", () => {
  const rlo = String.fromCharCode(0x202e);
  const zwsp = String.fromCharCode(0x200b);
  assert.equal(planText(`a${rlo}b${zwsp}c`), "abc");
  assert.equal(planText("bir\nikki\tuch"), "bir ikki uch");
  // ESC va boshqa C0/C1 belgilar ko'rinadigan shaklga o'tadi (terminal soxtalashtirilmaydi).
  assert.equal(planText("x\u001b[31my"), "x\\x1b[31my");
  assert.ok(!/\u001b/.test(planText("x\u001b[2Jy")));
  assert.equal(planText("   bo'sh joylar   "), "bo'sh joylar");
  assert.equal(planText(null), "");
  assert.equal(planText({}), "[object Object]");
});

await test("qadam matni 80 belgida kesiladi, bo'sh qadamlar tashlanadi", () => {
  const plan = createPlan();
  call(plan, { steps: ["x".repeat(200), "   ", "", "ikkinchi"] });
  const s = plan.snapshot();
  assert.equal(s.total, 2);
  assert.equal(s.steps[0].text.length, PLAN_STEP_MAX);
  assert.equal(s.steps[1].text, "ikkinchi");
});

await test("12 tadan ortiq qadam qabul qilinmaydi", async () => {
  const plan = createPlan();
  await call(plan, { steps: Array.from({ length: 40 }, (_, i) => `qadam ${i + 1}`) });
  assert.equal(plan.snapshot().total, PLAN_MAX_STEPS);
  assert.equal(plan.snapshot().steps[PLAN_MAX_STEPS - 1].text, `qadam ${PLAN_MAX_STEPS}`);
});

await test("faqat bo'sh/ko'rinmas qadamlar — reja yaratilmaydi", async () => {
  const plan = createPlan();
  const r = await call(plan, { steps: ["   ", String.fromCharCode(0x200b)] });
  assert.match(r, /^XATO/);
  assert.equal(plan.snapshot().total, 0);
  assert.equal(toolStatus("plan", r), "failed");
});

// ---- Yaratish, yangilash, almashtirish ------------------------------------
await test("reja yaratiladi: birinchi qadam avtomatik faol, natija qisqa", async () => {
  const plan = createPlan();
  const r = await call(plan, { steps: ["birinchi", "ikkinchi", "uchinchi"] });
  assert.equal(r, "OK: reja 0/3 — hozir: 1-qadam.");
  // Natijada reja matni TAKRORLANMAYDI (token tejaladi).
  assert.ok(!r.includes("birinchi"));
  const s = plan.snapshot();
  assert.equal(s.active, 1);
  assert.deepEqual(s.steps.map((x) => x.done), [false, false, false]);
});

await test("done belgilangach faol qadam avtomatik keyingisiga o'tadi", async () => {
  const plan = createPlan();
  await call(plan, { steps: ["a", "b", "c"] });
  const r = await call(plan, { done: [1] });
  assert.equal(r, "OK: reja 1/3 — hozir: 2-qadam.");
  assert.equal(plan.snapshot().active, 2);
  await call(plan, { done: [2, 3] });
  assert.equal(plan.snapshot().active, 0);
  assert.equal(await call(plan, {}), "OK: reja 3/3 — hammasi bajarildi.");
});

await test("active qo'lda qo'yiladi; done bitta son sifatida ham qabul qilinadi", async () => {
  const plan = createPlan();
  await call(plan, { steps: ["a", "b", "c", "d"] });
  await call(plan, { done: 2, active: 4 });
  const s = plan.snapshot();
  assert.equal(s.done, 1);
  assert.equal(s.steps[1].done, true);
  assert.equal(s.active, 4);
});

await test("chegaradan tashqari va son bo'lmagan indekslar e'tiborsiz qoldiriladi", async () => {
  const plan = createPlan();
  await call(plan, { steps: ["a", "b"] });
  const r = await call(plan, { done: [0, -1, 3, 99, 1.5, null, NaN, "x"], active: 7 });
  assert.equal(plan.snapshot().done, 0);
  assert.equal(plan.snapshot().active, 1); // noto'g'ri active e'tiborsiz — birinchi ochiq qadam
  assert.match(r, /noto'g'ri raqam e'tiborsiz/);
  // Raqamli satr ("2") — modellar ko'p yuboradi, qabul qilinadi.
  await call(plan, { done: ["2"] });
  assert.equal(plan.snapshot().steps[1].done, true);
});

await test("steps bilan qayta chaqirish rejani ALMASHTIRADI; bir xil matnli qadam belgisi saqlanadi", async () => {
  const plan = createPlan();
  await call(plan, { steps: ["a", "b", "c"] });
  await call(plan, { done: [1, 2] });
  await call(plan, { steps: ["a", "yangi", "c"] });
  const s = plan.snapshot();
  assert.equal(s.total, 3);
  assert.deepEqual(s.steps.map((x) => x.text), ["a", "yangi", "c"]);
  assert.deepEqual(s.steps.map((x) => x.done), [true, false, false]); // "b" ketdi, "a" bajarilganicha qoldi
  assert.equal(s.active, 2);
});

await test("reja yo'q holda done/active — xato, hech narsa yaratilmaydi", async () => {
  const plan = createPlan();
  const r = await call(plan, { done: [1] });
  assert.match(r, /^XATO: reja hali yo'q/);
  assert.equal(plan.snapshot().total, 0);
});

await test("bo'sh steps massivi rejani o'chirmaydi", async () => {
  const plan = createPlan();
  await call(plan, { steps: ["a", "b", "c"] });
  await call(plan, { steps: [], done: [1] });
  assert.equal(plan.snapshot().total, 3);
  assert.equal(plan.snapshot().done, 1);
});

await test("yaroqsiz argumentlar (null, massiv emas) yiqilmaydi", async () => {
  const plan = createPlan();
  assert.match(await runTool("plan", null, noConfirm, { plan }), /^XATO/);
  await call(plan, { steps: ["a", "b"] });
  assert.match(await call(plan, { steps: "a,b,c" }), /^OK/); // massiv emas — e'tiborsiz
  assert.equal(plan.snapshot().total, 2);
  assert.match(await call(plan, { done: "hammasi" }), /noto'g'ri raqam/);
});

// ---- Xavfsizlik ----------------------------------------------------------
await test("plan tasdiq so'ramaydi va diskka tegmaydi", async () => {
  const plan = createPlan();
  // noConfirm chaqirilsa throw bo'ladi — demak tasdiq yo'q.
  assert.match(await call(plan, { steps: ["rm -rf /", "git push --force", "sudo reboot"] }), /^OK/);
  // Reja matni faqat saqlanadi, hech qachon bajarilmaydi.
  assert.deepEqual(plan.snapshot().steps.map((s) => s.text), ["rm -rf /", "git push --force", "sudo reboot"]);
});

await test("plan vositasi berilmasa — aniq xato (yiqilish yo'q)", async () => {
  assert.match(await runTool("plan", { steps: ["a"] }, noConfirm, {}), /^XATO/);
});

// ---- Jurnal (ledger) va halollik -----------------------------------------
await test("planSummary: tugallanmagan qadamlar ochiq aytiladi", () => {
  assert.equal(planSummary(null), null);
  assert.equal(planSummary({ total: 0, done: 0, steps: [] }), null);
  const snap = { total: 3, done: 3, steps: [{ text: "a", done: true }, { text: "b", done: true }, { text: "c", done: true }] };
  assert.equal(planSummary(snap), "Reja: 3/3 qadam bajarildi.");
  const partial = { total: 3, done: 1, steps: [{ text: "a", done: true }, { text: "b", done: false }, { text: "c", done: false }] };
  assert.equal(planSummary(partial), "Reja: 1/3 bajarildi — qolgani: b; c.");
  const many = { total: 7, done: 1, steps: Array.from({ length: 7 }, (_, i) => ({ text: `q${i}`, done: i === 0 })) };
  assert.match(planSummary(many), /\(\+2\)\.$/);
});

await test("tracker: plan alohida jurnal yozuvi yaratmaydi, yakuniy holat forModel'ga tushadi", async () => {
  const plan = createPlan();
  const tracker = createTurnTracker((name, args) => runTool(name, args, noConfirm, { plan }), { plan });
  await tracker.run("plan", { steps: ["a", "b", "c"] });
  await tracker.run("plan", { done: [1] });
  assert.equal(tracker.entries.length, 0, "plan jurnal yozuvlariga qo'shilmaydi");
  assert.equal(ledgerLines(tracker.entries).length, 0);
  const snap = tracker.planSnapshot();
  assert.equal(snap.done, 1);
  assert.equal(snap.total, 3);
  const text = tracker.forModel();
  assert.match(text, /Reja: 1\/3 bajarildi/);
  assert.match(text, /Bajarilmagan qadamlarni 'bajardim' dema/);
});

await test("tracker: reja to'liq bajarilsa ogohlantirish yo'q", async () => {
  const plan = createPlan();
  const tracker = createTurnTracker((name, args) => runTool(name, args, noConfirm, { plan }), { plan });
  await tracker.run("plan", { steps: ["a", "b"] });
  await tracker.run("plan", { done: [1, 2] });
  const text = tracker.forModel();
  assert.match(text, /Reja: 2\/2 qadam bajarildi/);
  assert.ok(!text.includes("dema"));
});

await test("tracker: rejasiz navbatda planSnapshot null, jurnal o'zgarmaydi", async () => {
  const tracker = createTurnTracker(async () => "OK: x yozildi.");
  await tracker.run("write_file", { path: "x", content: "y" });
  assert.equal(tracker.planSnapshot(), null);
  assert.equal(tracker.forModel().includes("REJA"), false);
});

await test("takroriy plan chaqiruvi 'takror' deb o'tkazib yuborilmaydi va siklni boshlamaydi", async () => {
  const plan = createPlan();
  const tracker = createTurnTracker((name, args) => runTool(name, args, noConfirm, { plan }), { plan });
  await tracker.run("plan", { steps: ["a", "b", "c"] });
  for (let i = 0; i < 5; i++) {
    const r = await tracker.run("plan", { done: [1] });
    assert.equal(r.status, "ok");
  }
  assert.equal(tracker.loop, null);
});

console.log(`\n${passed} ta test o'tdi${failed ? `, ${failed} ta yiqildi` : ""}`);
process.exit(failed ? 1 : 0);
