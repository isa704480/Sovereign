/**
 * Triage chiqishi sanitizeri — pure, tarmoqsiz:
 *   npx tsx --conditions=react-server src/lib/ai/inquiry/sanitize.test.ts
 * Tekshiriladi: parseTriage (JSON/matn/zod/chegaralar, fail-open null), cleanText (markdown, HTML, URL,
 * boshqaruv, bidi, ko'rinmas belgilar), sir so'rovchi savollar 4 tilda (AC-9).
 */
import assert from "node:assert/strict";
import { cleanText, dropUnsafeFacts, extractJsonObject, isSecretRequest, parseTriage, truncate } from "./sanitize";
import { INQUIRY_TUNING } from "./types";

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

const L = INQUIRY_TUNING.limits;

const VALID = {
  domain: "legal",
  stakes: "high",
  clarity: 0.35,
  goal: "Ishga tiklanish yoki kompensatsiya",
  missing_facts: [
    {
      slot: "jurisdiction",
      critical: true,
      question: "Qaysi mamlakatda ishlagansiz?",
      why: "Mehnat qonuni va muddatlar mamlakatga bog'liq.",
      options: ["O'zbekiston", "Qozog'iston", "Rossiya", "Boshqa…"],
    },
    {
      slot: "documents",
      critical: false,
      question: "Qo'lingizda qanday hujjatlar bor?",
      why: "Dalil kuchi shunga bog'liq.",
      options: ["Mehnat shartnomasi", "Buyruq nusxasi", "Yozishmalar", "Hech narsa"],
      kind: "multi",
    },
  ],
  hidden_assumptions: ["O'zbekiston qonunchiligi"],
  risks: ["Da'vo muddati bir oy"],
  decision: "ask",
};

test("parseTriage: yaroqli obyekt", () => {
  const t = parseTriage(VALID)!;
  assert.ok(t);
  assert.equal(t.domain, "legal");
  assert.equal(t.stakes, "high");
  assert.equal(t.clarity, 0.35);
  assert.equal(t.missing_facts.length, 2);
  assert.equal(t.missing_facts[0].kind, "single");
  assert.equal(t.missing_facts[1].kind, "multi");
  assert.equal(t.missing_facts[1].options?.length, 4);
  assert.equal(t.decision, "ask");
});

test("parseTriage: JSON matn, prose ichidagi {…} va ```json blok", () => {
  assert.ok(parseTriage(JSON.stringify(VALID)));
  assert.ok(parseTriage(`Here is the result:\n\`\`\`json\n${JSON.stringify(VALID)}\n\`\`\`\nDone.`));
  assert.equal(extractJsonObject('x {"a":"}{","b":{"c":1}} y'), '{"a":"}{","b":{"c":1}}');
});

test("parseTriage: yaroqsiz → null (fail-open)", () => {
  assert.equal(parseTriage(""), null);
  assert.equal(parseTriage("not json"), null);
  assert.equal(parseTriage("{broken"), null);
  assert.equal(parseTriage([]), null);
  assert.equal(parseTriage(null), null);
  assert.equal(parseTriage({ ...VALID, stakes: "extreme" }), null);
  assert.equal(parseTriage({ ...VALID, decision: "maybe" }), null);
  assert.equal(parseTriage({ ...VALID, clarity: "abc" }), null);
  const { clarity: _c, ...noClarity } = VALID;
  void _c;
  assert.equal(parseTriage(noClarity), null);
});

test("parseTriage: yumshoq normallashtirish (katta harf, satr raqam, noma'lum domen, clamp)", () => {
  const t = parseTriage({ ...VALID, domain: "Astrology", stakes: "HIGH", clarity: "1.7", decision: " Answer ", blocking: "true" })!;
  assert.equal(t.domain, "general");
  assert.equal(t.stakes, "high");
  assert.equal(t.clarity, 1);
  assert.equal(t.decision, "answer");
  assert.equal(t.blocking, true);
  assert.equal(parseTriage({ ...VALID, clarity: -3 })!.clarity, 0);
  const minimal = parseTriage({ domain: "code", stakes: "low", clarity: 0.9, decision: "answer" })!;
  assert.deepEqual(minimal.missing_facts, []);
  assert.equal(minimal.goal, "");
});

test("parseTriage: uzunlik va soni chegaralari", () => {
  const long = "a".repeat(1000);
  const facts = Array.from({ length: 10 }, (_, i) => ({
    slot: `slot_${i}`,
    critical: true,
    question: long,
    why: long,
    options: Array.from({ length: 9 }, (_, j) => `opt ${j} ${long}`),
  }));
  const t = parseTriage({
    ...VALID,
    goal: long,
    missing_facts: facts,
    hidden_assumptions: [long, "b", "c", "d", "e", "f"],
    risks: ["r1", "r2", "r3", "r4"],
  })!;
  assert.equal(t.missing_facts.length, L.maxMissingFacts);
  for (const f of t.missing_facts) {
    assert.ok(Array.from(f.question).length <= L.question);
    assert.ok(Array.from(f.why).length <= L.why);
    assert.ok((f.options?.length ?? 0) <= L.maxOptions);
    for (const o of f.options ?? []) assert.ok(Array.from(o).length <= L.option);
  }
  assert.ok(Array.from(t.goal).length <= L.goal);
  assert.equal(t.hidden_assumptions.length, L.maxAssumptions);
  assert.equal(t.risks.length, L.maxRisks);
});

test("parseTriage: yaroqsiz fact elementlari alohida tashlanadi; options < 2 → text", () => {
  const t = parseTriage({
    ...VALID,
    missing_facts: [
      null,
      "string",
      { slot: "", question: "Bo'sh slot?" },
      { slot: "x", question: "   " },
      { slot: "Due Date", question: "Qachon?", options: ["Ertaga"], kind: "single" },
      { slot: "ok", question: "Yaxshi savol?", critical: "false", options: ["A", "A", "B"] },
    ],
  })!;
  assert.equal(t.missing_facts.length, 2);
  assert.equal(t.missing_facts[0].slot, "due_date");
  assert.equal(t.missing_facts[0].kind, "text");
  assert.equal(t.missing_facts[0].options, undefined);
  assert.equal(t.missing_facts[1].critical, false);
  assert.deepEqual(t.missing_facts[1].options, ["A", "B"]);
});

test("cleanText: markdown, HTML, URL, bidi, zero-width, boshqaruv belgilari", () => {
  assert.equal(cleanText("**Qaysi** _mamlakat_da?", 200), "Qaysi _mamlakat_da?");
  assert.equal(cleanText("# Sarlavha\n> iqtibos `kod`", 200), "Sarlavha iqtibos kod");
  assert.equal(cleanText("[bu yerni bosing](https://evil.example/login) iltimos", 200), "bu yerni bosing iltimos");
  assert.equal(cleanText("![rasm](http://x.io/a.png)Matn", 200), "rasmMatn");
  assert.equal(cleanText("Saytga kiring: https://evil.com/login?x=1 va www.phish.net ham", 200), "Saytga kiring: va ham");
  assert.equal(cleanText("Visit evil.xyz/pay now", 200), "Visit now");
  assert.equal(cleanText("javascript:alert(1) salom", 200), "salom");
  assert.equal(cleanText("<script>alert(1)</script>Salom <b>dunyo</b>", 200), "alert(1) Salom dunyo");
  assert.equal(cleanText("<img src=x onerror=alert(1)>Matn", 200), "Matn");
  assert.equal(cleanText("abc‮evil‬⁦x⁩", 200), "abcevilx");
  assert.equal(cleanText("a​b﻿c­d", 200), "abcd");
  assert.equal(cleanText("a\u0000b\u0007c\u009Fd", 200), "a b c d");
  assert.equal(cleanText("qator1\nqator2\r\nqator3\t!", 200), "qator1 qator2 qator3 !");
  assert.equal(cleanText("  ***  ", 200), "");
  assert.equal(cleanText(123, 200), "");
});

test("cleanText: Next.js, Node.js, Blind Prompting tokenlari saqlanadi", () => {
  assert.equal(cleanText("Next.js yoki Node.js versiyasi?", 200), "Next.js yoki Node.js versiyasi?");
  assert.equal(cleanText("[PERSON_A] bilan shartnoma bormi?", 200), "[PERSON_A] bilan shartnoma bormi?");
  assert.equal(cleanText("Ўзбекистонда қайси шаҳарда?", 200), "Ўзбекистонда қайси шаҳарда?");
});

test("R1: markdown belgilari olib tashlanganda URL qayta tiklanmaydi (idempotent, server fetch yo'q)", () => {
  const httpUrl = /https?:\/\//i;
  for (const s of [
    "Tasdiqlang: ht**tps://evil.help/c?m=secret_memory",
    "Open h`ttps://attacker.example.help/x?d=abc",
    "Check ht|tps://1.2.3.4/p?q=1",
    "Manba: ht_*_tps://evil.help/c?m=AAA",
    "Manba: ht_*_tps://evil.com/c?m=AAA",
    "Manba: h~~t~~tps://evil.help/x",
    "Manba: ht<b>tps://evil.help/x",
    "Manba: ht&amp;tps://evil.help/x",
    "Go hxxp://evil.help/x or ht_tps://evil.help/y",
  ]) {
    const once = cleanText(s, 200);
    const twice = cleanText(once, 200);
    assert.equal(twice, once, `idempotent: ${s}`);
    assert.ok(!httpUrl.test(once) && !once.includes("://"), `${s} → ${once}`);
    assert.ok(!/evil|attacker|1\.2\.3\.4/.test(once), `${s} → ${once}`);
  }
});

test("R1: kengaytirilgan URL naqshlari — istalgan TLD + yo'l, IPv4, IDN, xavfli TLD'lar", () => {
  assert.equal(cleanText("Go to sovereign-support.help/verify now", 200), "Go to now");
  assert.equal(cleanText("Link 93.184.216.34/x ok", 200), "Link ok");
  assert.equal(cleanText("Link 10.0.0.1:8080 ok", 200), "Link ok");
  assert.equal(cleanText("Sahifa пример.испытание/x bor", 200), "Sahifa bor");
  assert.equal(cleanText("Visit evil.help or evil.live today", 200), "Visit or today");
  assert.equal(cleanText("Visit evil․com/login now", 200), "Visit now");
  // yo'lsiz texnik nomlar saqlanadi
  assert.equal(cleanText("package.json va tsconfig.json bormi?", 200), "package.json va tsconfig.json bormi?");
  assert.equal(cleanText("Vue.js yoki Next.js?", 200), "Vue.js yoki Next.js?");
  assert.equal(cleanText("Node 18.17.1 versiyasimi?", 200), "Node 18.17.1 versiyasimi?");
});

test("truncate: kod nuqtalari bo'yicha, …", () => {
  assert.equal(truncate("abcdef", 10), "abcdef");
  assert.equal(truncate("abcdef", 4), "abc…");
  assert.equal(Array.from(truncate("😀".repeat(10), 5)).length, 5);
});

test("AC-9: sir so'rovchi savollar 4 tilda aniqlanadi", () => {
  for (const t of [
    "Parolingizni yozing",
    "Karta raqamingiz qanday?",
    "CVV kodini ayting",
    "PIN kodni kiriting",
    "Pasport seriyasi va raqami?",
    "JShShIR raqamingiz?",
    "SMS kodni yuboring",
    "Tasdiqlash kodini ayting",
    "API kalitingizni yuboring",
    "Паролингизни ёзинг",
    "Карта рақамингизни юборинг",
    "ЖШШИР ни киритинг",
    "Назовите пароль от почты",
    "Укажите номер карты и срок действия карты",
    "Серия и номер паспорта?",
    "Какой код из СМС пришёл?",
    "Сообщите ИНН",
    "What is your password?",
    "Please share your card number and CVV",
    "Send me the OTP you received",
    "What's your API key?",
    "Enter your seed phrase",
    "What is your SSN?",
    "Share your one-time code",
  ]) {
    assert.equal(isSecretRequest(t), true, t);
  }
});

test("R1: token, SSH/secret kalit, so'zlar orasidagi karta/SMS, СНИЛС, .env, ulanish satri", () => {
  for (const t of [
    "GitHub tokeningizni kiriting",
    "Shaxsiy kirish tokeningiz (PAT) qanday?",
    "npm token qiymatini yozing",
    "What is your GitHub token?",
    "Paste your personal access token",
    "Your PAT, please",
    "Введите ваш токен GitHub",
    "Токен доступа к репозиторию?",
    "ГитҲаб токенингизни юборинг",
    "SSH kalitingizni yuboring",
    "Paste your SSH private key",
    "Stripe secret kalitingiz?",
    "Укажите номер вашей карты",
    "What is the number on your card?",
    "Plastik kartangizning 16 xonali raqamini yozing",
    "Картангизнинг рақамини ёзинг",
    "SMS orqali kelgan kodni yozing",
    "Код, который пришёл в SMS?",
    "Enter the code we sent by SMS",
    "Введите СНИЛС",
    "What's your .env DATABASE_URL value?",
    "Ma'lumotlar bazasi ulanish satrini (connection string) yozing",
    "Строку подключения к базе пришлите",
    "Onangizning qizlik familiyasi?",
    "What is your mother's maiden name?",
  ]) {
    assert.equal(isSecretRequest(t), true, t);
  }
});

test("R1: kengaytirilgan sir naqshlari oddiy savollarni urmaydi", () => {
  for (const t of [
    "JWT tokenlar yoki session cookie ishlatasizmi?",
    "Do you use JWT tokens or server sessions?",
    "Which design tokens should the theme expose?",
    "Siz kartadan to'laysizmi yoki naqd?",
    "Karta orqali to'lov qo'shilsinmi?",
    "Do you accept card payments?",
    "Qaysi SSH server (Ubuntu yoki Debian)?",
    "Loyiha .env faylidan foydalanadimi?",
    "Kartoshka narxi qancha?",
    "Номер договора есть?",
    "How many users do you expect?",
  ]) {
    assert.equal(isSecretRequest(t), false, t);
  }
});

test("sir so'rovi yolg'on urilmaydi", () => {
  for (const t of [
    "Qaysi mamlakatda ishlagansiz?",
    "Bo'shatish buyrug'i qachon berildi?",
    "Qancha summa haqida gap ketyapti?",
    "Какие инновации вы планируете?",
    "Как часто вы стираете вещи?",
    "Какой у вас бюджет?",
    "Which framework do you use — React or Vue?",
    "What's your opinion on the contract terms?",
    "Siz kartadan to'laysizmi yoki naqd?",
  ]) {
    assert.equal(isSecretRequest(t), false, t);
  }
});

test("dropUnsafeFacts: why yoki options ichidagi sir so'rovi ham tashlanadi", () => {
  const r = dropUnsafeFacts([
    { slot: "a", critical: true, question: "Hisobingizni tekshiraymi?", why: "Buning uchun parolingiz kerak" },
    { slot: "b", critical: true, question: "Qanday tasdiqlaysiz?", why: "x", options: ["SMS kod", "Hech qanday"] },
    { slot: "c", critical: true, question: "Qaysi shaharda?", why: "Qonun farq qiladi" },
  ]);
  assert.deepEqual(
    r.kept.map((f) => f.slot),
    ["c"],
  );
  assert.equal(r.dropped.length, 2);
});

console.log(`\nsanitize: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
