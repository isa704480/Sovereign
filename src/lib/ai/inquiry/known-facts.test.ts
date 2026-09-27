/**
 * "Allaqachon aytilganini so'rama" detektorlari — pure, tarmoqsiz:
 *   npx tsx --conditions=react-server src/lib/ai/inquiry/known-facts.test.ts
 * Tekshiriladi: har slot detektori 4 tilda (uz, uz-cyrl, ru, en), yolg'on urilmaslik, askedSlots,
 * dublikat slotlar, fayl nomlari, AC-4 va eval misoli (§A.11 mustNotAskSlots).
 */
import assert from "node:assert/strict";
import { detectKnownSlots, filterKnownFacts, normalizeSlot } from "./known-facts";
import type { MissingFact } from "./types";

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

const has = (text: string, slot: string) => detectKnownSlots(text).has(slot);
function yes(slot: string, texts: string[]) {
  for (const t of texts) assert.equal(has(t, slot), true, `${slot} topilishi kerak: ${t}`);
}
function no(slot: string, texts: string[]) {
  for (const t of texts) assert.equal(has(t, slot), false, `${slot} topilmasligi kerak: ${t}`);
}
const f = (slot: string): MissingFact => ({ slot, critical: true, question: `${slot}?`, why: "why" });

test("jurisdiction — 4 tilda", () => {
  yes("jurisdiction", [
    "Men O'zbekistonda ishlayman",
    "Toshkentda ijarada turaman",
    "Ўзбекистонда яшайман",
    "Тошкентда ишлайман",
    "Я живу в Узбекистане",
    "Работаю в Ташкенте",
    "I live in Uzbekistan",
    "I'm based in the USA",
    "Qozog'istonda ishladim",
    "Работал в России два года",
  ]);
  no("jurisdiction", [
    "Ish beruvchim meni ishdan bo'shatdi",
    "Переведи этот текст на английский",
    "Translate this to Japanese",
    "Write it in Korean please",
    "Я куплю китайский телефон",
  ]);
  // aliaslar
  const s = detectKnownSlots("Toshkentda");
  assert.ok(s.has("country") && s.has("location"));
});

test("amount va currency — 4 tilda", () => {
  yes("amount", [
    "12 mln so'm zarar",
    "500 000 so'mlik shartnoma",
    "12 млн сўм",
    "Долг 500 000 сум",
    "Мне должны 300 тысяч рублей",
    "I have $5,000 in savings",
    "about 2.5k dollars",
    "1000 usd",
    "€ 200",
  ]);
  no("amount", ["Bu something muhim", "3 marta urindim", "Сумка стоит дорого?", "I have 3 cats", "Python 3 users"]);
  yes("budget", ["Byudjetim 1000 dollar"]);
  yes("currency", ["Dollarda saqlayman", "в рублях", "in USD", "so'mda"]);
  no("currency", ["something else", "сумма неизвестна"]);
});

test("date / dates — 4 tilda", () => {
  yes("dates", [
    "2026-yil 3-sentabrda voqea bo'ldi",
    "3-sentabrda",
    "Voqea 2026-09-03 da bo'lgan",
    "03.09.2026 kuni",
    "Кеча бўлди",
    "3 сентябрь куни",
    "Это случилось 15 октября",
    "вчера уволили",
    "It happened on Sept 3",
    "It happened yesterday",
    "5-mayda",
  ]);
  no("dates", ["Men 3 marta urindim", "You may 2 go", "10 decisions to make", "5 marketing ideas"]);
});

test("deadline — cue + raqam/sana", () => {
  yes("deadline", [
    "15-oktabrgacha javob berishim kerak",
    "Muddat 10 kun",
    "Эртагача топшириш керак",
    "Ответить нужно до 15 октября",
    "Срок — 30 дней",
    "The deadline is Friday 12th",
    "I need it by tomorrow",
    "within 30 days",
  ]);
  no("deadline", ["Da'vo muddati qancha?", "Какой срок исковой давности?", "What is the deadline for appeals?"]);
});

test("duration — 4 tilda", () => {
  yes("duration", [
    "3 kundan beri boshim og'riyapti",
    "ikki haftadan beri yo'talyapman",
    "кечадан бери иситмам бор",
    "3 кундан бери",
    "Болит уже 3 дня",
    "уже неделю кашляю",
    "I've had a fever for 2 weeks",
    "since yesterday",
    "three days ago",
  ]);
  no("duration", ["Boshim og'riyapti", "Болит голова", "My head hurts"]);
  yes("symptom_duration", ["for the past 3 days"]);
});

test("horizon, stack, age", () => {
  yes("horizon", ["5 yilga jamg'aray", "uzoq muddatli investitsiya", "на 5 лет", "long-term", "for 10 years"]);
  yes("stack", ["Next.js 16 va Supabase", "React Native ilova", "Python/Django backend", "Laravel saytim bor", "C# .NET"]);
  no("stack", ["In spring I will start", "I want to express my feelings", "Let's go to the park"]);
  yes("age", ["30 yoshdaman", "Бола 5 ёшда", "Мне 30 лет", "I'm 45 years old", "a 7-year-old child"]);
  yes("age_sex", ["Мне 30 лет"]);
  no("age", ["3 yil ishladim", "уже 3 года болит"]);
});

test("documents va error_output", () => {
  yes("documents", [
    "Dalolatnoma bor",
    "Mehnat shartnomasi qo'limda",
    "Шартнома бор",
    "У меня есть договор",
    "Договор подписан",
    "I have the contract",
    "I kept all receipts",
  ]);
  no("documents", ["Shartnoma tuzmoqchiman", "Как составить договор?"]);
  yes("error_output", ["TypeError: Cannot read properties of undefined", "Traceback (most recent call last):", "Xato: modul topilmadi", "ENOENT no such file"]);
  no("error_output", ["Bu xatoni tuzat", "fix this error please"]);
});

test("fayl nomlari → documents / existing_code (+ nomdagi joy)", () => {
  const s = detectKnownSlots("", { fileNames: ["ijara_toshkent.pdf"] });
  assert.ok(s.has("documents"));
  assert.ok(s.has("existing_code"));
  assert.ok(s.has("jurisdiction"));
  assert.equal(detectKnownSlots("", { fileNames: [] }).has("documents"), false);
});

test("normalizeSlot", () => {
  assert.equal(normalizeSlot(" Jurisdiction "), "jurisdiction");
  assert.equal(normalizeSlot("Due date"), "due_date");
  assert.equal(normalizeSlot("symptom-duration"), "symptom_duration");
  assert.equal(normalizeSlot("<b>x</b>"), "bxb");
});

test("AC-4: oldingi xabarda mamlakat → jurisdiction tashlanadi", () => {
  const r = filterKnownFacts([f("jurisdiction"), f("deadline"), f("documents")], {
    text: "Men Rossiyada ishlaganman.\nIsh beruvchim meni ishdan bo'shatdi",
  });
  assert.deepEqual(
    r.kept.map((x) => x.slot),
    ["deadline", "documents"],
  );
  assert.deepEqual(
    r.dropped.map((x) => x.slot),
    ["jurisdiction"],
  );
});

test("askedSlots va dublikat slotlar", () => {
  const r = filterKnownFacts([f("Jurisdiction"), f("amount"), f("amount"), f("goal")], { askedSlots: ["jurisdiction"] });
  assert.deepEqual(
    r.kept.map((x) => x.slot),
    ["amount", "goal"],
  );
  assert.equal(r.dropped.length, 2);
});

test("eval misoli: faktlar matnda bor → mustNotAskSlots tashlanadi", () => {
  const text =
    "Toshkentda, 2026-yil 3-sentabrda qo'shnim 12 mln so'mlik zarar yetkazdi, dalolatnoma bor. Sudga qanday ariza yozaman?";
  const r = filterKnownFacts([f("jurisdiction"), f("amount"), f("dates"), f("documents"), f("desired_outcome")], { text });
  assert.deepEqual(
    r.kept.map((x) => x.slot),
    ["desired_outcome"],
  );
});

test("xotira + oldingi raund javoblari ham hisobga olinadi", () => {
  const memory = "- fact: Foydalanuvchi Samarqandda yashaydi";
  const reply = "Aniqlashtirish:\n- Mamlakat: O'zbekiston\n- Buyruq sanasi: 1 oydan kam";
  const r = filterKnownFacts([f("jurisdiction"), f("parties")], { text: `${memory}\n${reply}` });
  assert.deepEqual(
    r.kept.map((x) => x.slot),
    ["parties"],
  );
});

console.log(`\nknown-facts: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
