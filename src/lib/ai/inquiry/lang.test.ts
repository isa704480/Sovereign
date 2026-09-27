/**
 * Karta tili/yozuvi (R2 i18n 2–4) — pure:
 *   npx tsx --conditions=react-server src/lib/ai/inquiry/lang.test.ts
 */
import assert from "node:assert/strict";
import { enforceUzCyrl, inquiryLang, toUzCyrlIfLatin } from "./lang";
import type { TriageResult } from "./types";

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

test("inquiryLang: o'zbek UI, xabar yozuvi ustun (R2-2)", () => {
  assert.equal(inquiryLang("uz", "Салом, шартнома ёзиб бер"), "uz-cyrl");
  assert.equal(inquiryLang("uz", "Ишдан бўшатишди, нима қилай?"), "uz-cyrl");
  assert.equal(inquiryLang("uz-cyrl", "Ishdan bo'shatishdi, nima qilay?"), "uz");
  assert.equal(inquiryLang("uz-cyrl", "Next.js 15 app router"), "uz");
  assert.equal(inquiryLang("uz", "Ishdan bo'shatishdi, nima qilay?"), "uz");
  assert.equal(inquiryLang("uz-cyrl", "Ишдан бўшатишди"), "uz-cyrl");
});

test("inquiryLang: boshqa til aniq bo'lsa — o'sha til", () => {
  assert.equal(inquiryLang("uz", "Меня уволили с работы, что делать?"), "ru");
  assert.equal(inquiryLang("uz", "How do I deploy this to my server?"), "en");
  assert.equal(inquiryLang("en", "Qanday qilib serverga joylayman?"), "uz");
  assert.equal(inquiryLang("ru", "Help me write a contract please"), "en");
  assert.equal(inquiryLang("en", "Помоги написать договор"), "ru");
});

test("inquiryLang: qisqa / noaniq — UI tili", () => {
  assert.equal(inquiryLang("ru", "ok"), "ru");
  assert.equal(inquiryLang("uz", "12345 ??"), "uz");
  assert.equal(inquiryLang("ru", "Docker Kubernetes"), "ru");
  assert.equal(inquiryLang("en", "Docker Kubernetes"), "en");
});

test("toUzCyrlIfLatin: o'zbekcha lotin → kirill, texnik nomlar saqlanadi (R2-4)", () => {
  assert.equal(toUzCyrlIfLatin("Qaysi shaharda ishlagansiz?"), "Қайси шаҳарда ишлагансиз?");
  assert.equal(toUzCyrlIfLatin("Qo'lingizda qanday hujjatlar bor?"), "Қўлингизда қандай ҳужжатлар бор?");
  const mixed = toUzCyrlIfLatin("Loyihangiz Next.js yoki React bilanmi?");
  assert.ok(mixed.includes("Next.js") && mixed.includes("React"), mixed);
  assert.ok(mixed.startsWith("Лойиҳангиз"), mixed);
  assert.equal(toUzCyrlIfLatin("[PERSON_A] bilan shartnoma bormi?"), "[PERSON_A] билан шартнома борми?");
  // allaqachon kirill / inglizcha texnik ibora — o'zgarmaydi
  assert.equal(toUzCyrlIfLatin("Қайси шаҳарда?"), "Қайси шаҳарда?");
  assert.equal(toUzCyrlIfLatin("Which database do you use?"), "Which database do you use?");
  assert.equal(toUzCyrlIfLatin("PostgreSQL"), "PostgreSQL");
});

test("enforceUzCyrl: faqat uz-cyrl kartada, barcha matn maydonlari", () => {
  const r: TriageResult = {
    domain: "legal",
    stakes: "high",
    clarity: 0.3,
    goal: "Ishga tiklanish",
    missing_facts: [
      { slot: "jurisdiction", critical: true, question: "Qaysi mamlakatda?", why: "Qonun farq qiladi", kind: "single", options: ["O'zbekiston", "Boshqa"] },
    ],
    hidden_assumptions: ["O'zbekiston qonunchiligi"],
    risks: ["Muddat o'tib ketishi"],
    decision: "ask",
  };
  const c = enforceUzCyrl(r, "uz-cyrl")!;
  assert.equal(c.goal, "Ишга тикланиш");
  assert.equal(c.missing_facts[0].question, "Қайси мамлакатда?");
  assert.deepEqual(c.missing_facts[0].options, ["Ўзбекистон", "Бошқа"]);
  assert.equal(c.hidden_assumptions[0], "Ўзбекистон қонунчилиги");
  assert.equal(c.missing_facts[0].slot, "jurisdiction");
  assert.equal(enforceUzCyrl(r, "uz"), r);
  assert.equal(enforceUzCyrl(null, "uz-cyrl"), null);
});

console.log(`\nlang: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
