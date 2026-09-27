/**
 * Chuqur so'rash siyosati — pure, tarmoqsiz:
 *   npx tsx --conditions=react-server src/lib/ai/inquiry/policy.test.ts
 * Tekshiriladi: pre-gate jadvali (§A.2), qaror jadvali (§A.4), AC-1, AC-4, AC-5, AC-9, AC-10.
 */
import assert from "node:assert/strict";
import { decide, preGate, preGateDetail } from "./policy";
import { detectHighStakes, formatSlotCatalog, isEmergency, PLAYBOOKS } from "./playbooks";
import { INQUIRY_DOMAINS, INQUIRY_TUNING, type MissingFact, type PreGateInput, type TriageResult } from "./types";

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

const gate = (text: string, extra: Partial<PreGateInput> = {}) => preGate({ text, mode: "auto", ...extra });

function fact(slot: string, critical = true, extra: Partial<MissingFact> = {}): MissingFact {
  return { slot, critical, question: `Q about ${slot}?`, why: `Why ${slot}`, ...extra };
}

function tri(extra: Partial<TriageResult> = {}): TriageResult {
  return {
    domain: "legal",
    stakes: "high",
    clarity: 0.35,
    goal: "Ishga tiklanish",
    missing_facts: [fact("jurisdiction", true, { options: ["O'zbekiston", "Qozog'iston", "Rossiya"] }), fact("dates"), fact("documents", false)],
    hidden_assumptions: ["Mehnat shartnomasi bor deb taxmin qilinadi"],
    risks: ["Da'vo muddati o'tib ketishi mumkin"],
    decision: "ask",
    ...extra,
  };
}

// ── Pre-gate ──────────────────────────────────────────────────────────────

test("AC-1: salomlashish (4 til) → skip, triage chaqirilmaydi", () => {
  for (const t of ["Salom", "Assalomu alaykum", "Салом, қалайсиз?", "Привет", "Здравствуйте", "Hi", "hello there", "Rahmat"]) {
    assert.equal(gate(t), "skip", t);
    assert.equal(preGateDetail({ text: t, mode: "auto" }).reason, "small_talk", t);
  }
});

test("mode=off yoki skip=true → skip", () => {
  assert.equal(gate("Ish beruvchim meni ishdan bo'shatdi, nima qilay?", { mode: "off" }), "skip");
  assert.equal(gate("Ish beruvchim meni ishdan bo'shatdi, nima qilay?", { skip: true }), "skip");
});

test("qisqa matn (< 12 belgi, ? yo'q) → skip; ? bo'lsa — o'tadi", () => {
  assert.equal(gate("ok davom et"), "skip");
  assert.equal(gate("nima bu?"), "parallel");
});

test("media / kesh / research / faqat rasm → skip", () => {
  const t = "Menga mushuk rasmini chizib ber, iltimos";
  assert.equal(gate(t, { mediaIntent: true }), "skip");
  assert.equal(gate(t, { cacheHit: true }), "skip");
  assert.equal(gate(t, { research: true }), "skip");
  assert.equal(gate("", { mediaOnly: true }), "skip");
  assert.equal(gate(""), "skip");
});

test("AC-5: reply.round ≥ maxRounds → skip (majburan javob)", () => {
  const t = "Ish beruvchim meni ishdan bo'shatdi, nima qilay?";
  assert.equal(gate(t, { round: 1 }), "blocking");
  assert.equal(gate(t, { round: INQUIRY_TUNING.maxRounds }), "skip");
  assert.equal(preGateDetail({ text: t, mode: "auto", round: 2 }).reason, "max_rounds");
});

test("cooldown: recentSkips > 0 → skip (always rejimida emas)", () => {
  const t = "Ish beruvchim meni ishdan bo'shatdi, nima qilay?";
  assert.equal(gate(t, { recentSkips: 1 }), "skip");
  assert.equal(gate(t, { recentSkips: 1, mode: "always" }), "blocking");
});

test("CLI/Cowork full-auto → skip; web'da fullAuto e'tiborsiz", () => {
  const t = "Loyihani serverga deploy qil va testlarni ishga tushir";
  assert.equal(gate(t, { fullAuto: true, surface: "cowork" }), "skip");
  assert.equal(gate(t, { fullAuto: true, surface: "cli" }), "skip");
  assert.equal(gate(t, { fullAuto: true, surface: "web" }), "parallel");
});

test("AC-10: favqulodda belgilar → skip + emergency (4 tilda)", () => {
  const cases = [
    "Сильная боль в груди и немеет левая рука",
    "Ko'kragim qattiq og'riyapti, nafas olish qiyin",
    "Кўкрагим оғрияпти ва нафасим қисяпти",
    "I have chest pain and my left arm feels numb",
    "I want to kill myself",
    "Не хочу жить больше",
    "O'zimni o'ldirmoqchiman",
    "Бола заҳарланди, нима қилай?",
  ];
  for (const t of cases) {
    const d = preGateDetail({ text: t, mode: "auto" });
    assert.equal(d.gate, "skip", t);
    assert.equal(d.emergency, true, t);
  }
  // mode=off bo'lsa ham emergency bayrog'i qo'yiladi
  assert.equal(preGateDetail({ text: cases[0], mode: "off" }).emergency, true);
});

test("emergency yolg'on urilmaydi", () => {
  for (const t of [
    "Qanday qilib yaxshi suzish texnikasini o'rganaman? stroke of luck",
    "Как почистить грудку курицы?",
    "Swimming stroke technique for beginners",
    "Ingliz tilida gapira olmayman, qanday o'rganay?",
    "He keeps beating me at chess",
  ]) {
    assert.equal(isEmergency(t), false, t);
  }
});

test("yuqori xavf so'zlari (4 til) → blocking", () => {
  const cases: [string, "legal" | "medical" | "financial"][] = [
    ["Ish beruvchim meni ishdan bo'shatdi, nima qilsam bo'ladi?", "legal"],
    ["Иш берувчим мени ишдан бўшатди, судга бориш керакми?", "legal"],
    ["Меня уволили без причины, что делать?", "legal"],
    ["My landlord wants to evict me next month", "legal"],
    ["Uch kundan beri boshim og'riyapti", "medical"],
    ["Бошим оғрияпти, қандай дори ичай?", "medical"],
    ["Какую дозировку парацетамола можно ребенку?", "medical"],
    ["I have a fever and cough, what should I take?", "medical"],
    ["Jamg'armamni kriptoga qo'ysam bo'ladimi?", "financial"],
    ["Ипотека олсам бўладими?", "financial"],
    ["Стоит ли брать кредит на машину?", "financial"],
    ["Should I put my savings into crypto?", "financial"],
  ];
  for (const [t, d] of cases) {
    assert.equal(detectHighStakes(t), d, t);
    assert.equal(gate(t), "blocking", t);
  }
});

test("oddiy savollar → parallel (yolg'on yuqori xavf yo'q)", () => {
  for (const t of [
    "What's the capital of Japan?",
    "sudo npm install ishlamayapti, nima qilay?",
    "Судно qanday suzadi?",
    "Я закончил проект, что дальше?",
    "Python'da ro'yxatni qanday saralayman?",
    "Menga painting haqida gapirib ber",
  ]) {
    assert.equal(gate(t), "parallel", t);
  }
});

test("always rejimi → blocking; birinchi uzun xabar → parallel", () => {
  assert.equal(gate("Python'da ro'yxatni qanday saralayman?", { mode: "always" }), "blocking");
  const long = "Men kichik onlayn do'kon ochmoqchiman. ".repeat(8);
  assert.equal(preGateDetail({ text: long, mode: "auto", isFirstMessage: true }).reason, "first_long");
  assert.equal(gate(long, { isFirstMessage: true }), "parallel");
});

// ── decide ────────────────────────────────────────────────────────────────

test("triage null → answer (fail-open)", () => {
  const d = decide(null, { mode: "auto", gate: "blocking" });
  assert.equal(d.decision, "answer");
  assert.equal(d.decisionLlm, null);
  assert.equal(d.questions.length, 0);
  assert.equal(d.round, 1);
});

test("AC-2 siyosat qismi: high + critical + past clarity + blocking → ask (1..3, why, options)", () => {
  const d = decide(tri(), { mode: "auto", gate: "blocking" });
  assert.equal(d.decision, "ask");
  assert.ok(d.questions.length >= 1 && d.questions.length <= 3);
  assert.ok(d.questions.every((q) => q.why.length > 0));
  assert.ok(d.questions.some((q) => q.options.length >= 2));
  assert.deepEqual(
    d.questions.map((q) => q.id),
    d.questions.map((_, i) => `q${i + 1}`),
  );
  assert.equal(d.professional, "lawyer");
  assert.equal(d.decisionLlm, "ask");
  assert.equal(d.nQuestions, d.questions.length);
  assert.equal(d.questions[0].kind, "single");
  assert.equal(d.questions[2].kind, "text");
});

test("parallel rejimda ask → answer_then_ask ga tushiriladi", () => {
  const d = decide(tri(), { mode: "auto", gate: "parallel" });
  assert.equal(d.decision, "answer_then_ask");
  assert.ok(d.questions.length <= INQUIRY_TUNING.maxFollowups);
});

test("AC-4: mamlakat oldin aytilgan → jurisdiction savoli olib tashlanadi", () => {
  const d = decide(tri(), {
    mode: "auto",
    gate: "blocking",
    knownText: "Men Toshkentda ishlardim. Ish beruvchim meni ishdan bo'shatdi.",
  });
  assert.equal(d.decision, "ask");
  assert.ok(!d.questions.some((q) => q.slot === "jurisdiction"));
  assert.equal(d.nDedupDropped, 1);
});

test("askedSlots — allaqachon so'ralgan slot qayta so'ralmaydi", () => {
  const d = decide(tri(), { mode: "auto", gate: "blocking", askedSlots: ["jurisdiction", "dates"] });
  assert.ok(!d.questions.some((q) => q.slot === "jurisdiction" || q.slot === "dates"));
  assert.equal(d.nDedupDropped, 2);
});

test("hamma fakt ma'lum → answer", () => {
  const t = tri({ missing_facts: [fact("jurisdiction"), fact("amount")] });
  const d = decide(t, { mode: "auto", gate: "blocking", knownText: "O'zbekistonda, 12 mln so'm" });
  assert.equal(d.decision, "answer");
  assert.equal(d.reason, "no_missing_facts");
});

test("AC-5: round ≥ 2 → answer, qolgan bo'shliqlar remaining'da (taxmin)", () => {
  const d = decide(tri(), { mode: "auto", gate: "blocking", round: 2 });
  assert.equal(d.decision, "answer");
  assert.equal(d.questions.length, 0);
  assert.ok(d.remaining.length > 0);
  assert.equal(d.round, 3);
  assert.equal(decide(tri(), { mode: "auto", gate: "blocking", round: 1 }).round, 2);
});

test("AC-9: sir so'rovchi savol tashlanadi (decide ichida)", () => {
  const t = tri({
    missing_facts: [
      fact("login", true, { question: "Parolingizni yozing, tekshirib beraman" }),
      fact("card", true, { question: "Karta raqamingiz va CVV kodini yuboring" }),
      fact("jurisdiction"),
    ],
  });
  const d = decide(t, { mode: "auto", gate: "blocking" });
  assert.equal(d.nSafetyDropped, 2);
  assert.deepEqual(
    d.questions.map((q) => q.slot),
    ["jurisdiction"],
  );
  const onlyBad = tri({ missing_facts: [fact("otp", true, { question: "SMS kodni ayting" })] });
  assert.equal(decide(onlyBad, { mode: "auto", gate: "blocking" }).decision, "answer");
});

test("AC-10: emergency triage → answer, karta yo'q", () => {
  const d1 = decide(tri({ domain: "medical", emergency: true }), { mode: "auto", gate: "blocking" });
  assert.equal(d1.decision, "answer");
  assert.equal(d1.emergency, true);
  assert.equal(d1.questions.length, 0);
  const d2 = decide(tri({ domain: "medical" }), { mode: "auto", gate: "blocking", emergency: true });
  assert.equal(d2.decision, "answer");
  assert.equal(d2.emergency, true);
});

test("stakes=low: clarity < 0.35 → answer_then_ask (≤2), aks holda answer", () => {
  const facts = [fact("a"), fact("b"), fact("c")];
  const d1 = decide(tri({ domain: "general", stakes: "low", clarity: 0.2, missing_facts: facts }), { mode: "auto", gate: "blocking" });
  assert.equal(d1.decision, "answer_then_ask");
  assert.equal(d1.questions.length, INQUIRY_TUNING.lowMaxFollowups);
  const d2 = decide(tri({ domain: "general", stakes: "low", clarity: 0.5, missing_facts: facts }), { mode: "auto", gate: "blocking" });
  assert.equal(d2.decision, "answer");
  assert.equal(d2.professional, undefined);
});

test("stakes=high, critical yo'q yoki clarity yuqori → answer_then_ask", () => {
  const noCrit = tri({ missing_facts: [fact("documents", false), fact("amount", false)] });
  assert.equal(decide(noCrit, { mode: "auto", gate: "blocking" }).decision, "answer_then_ask");
  assert.equal(decide(tri({ clarity: 0.7 }), { mode: "auto", gate: "blocking" }).decision, "answer_then_ask");
});

test("stakes=medium: clarity < 0.8 → answer_then_ask; ≥ 0.8 → answer", () => {
  const m = (clarity: number) => tri({ domain: "code", stakes: "medium", clarity, missing_facts: [fact("stack"), fact("goal")] });
  assert.equal(decide(m(0.5), { mode: "auto", gate: "blocking" }).decision, "answer_then_ask");
  assert.equal(decide(m(0.85), { mode: "auto", gate: "blocking" }).decision, "answer");
});

test("always rejimi: medium ham ask, clarityAsk 0.7, ko'pi bilan 5 savol", () => {
  const facts = ["a", "b", "c", "d", "e", "f"].map((s) => fact(s));
  const t = tri({ domain: "business", stakes: "medium", clarity: 0.65, missing_facts: facts });
  assert.equal(decide(t, { mode: "auto", gate: "blocking" }).decision, "answer_then_ask");
  const d = decide(t, { mode: "always", gate: "blocking" });
  assert.equal(d.decision, "ask");
  assert.equal(d.questions.length, INQUIRY_TUNING.maxQuestions.always);
  const auto = decide(tri({ clarity: 0.3, missing_facts: facts }), { mode: "auto", gate: "blocking" });
  assert.equal(auto.questions.length, INQUIRY_TUNING.maxQuestions.auto);
  assert.equal(auto.remaining.length, facts.length - INQUIRY_TUNING.maxQuestions.auto);
});

test("savollar tartibi: critical birinchi, keyin playbook priority", () => {
  const t = tri({
    missing_facts: [fact("amount", false), fact("deadline"), fact("documents", false), fact("jurisdiction")],
  });
  const d = decide(t, { mode: "always", gate: "blocking" });
  assert.deepEqual(
    d.questions.map((q) => q.slot),
    ["jurisdiction", "deadline", "documents", "amount"],
  );
});

test("personal — ko'pi bilan 2 savol", () => {
  const t = tri({ domain: "personal", stakes: "high", clarity: 0.2, missing_facts: [fact("situation"), fact("goal"), fact("constraints")] });
  assert.equal(decide(t, { mode: "always", gate: "blocking" }).questions.length, 2);
});

test("full-auto: blocking bo'lmasa savol yo'q; blocking → bitta savol (AC-7)", () => {
  const t = tri({ domain: "code", stakes: "high", clarity: 0.2, missing_facts: [fact("stack"), fact("error_output")] });
  const d1 = decide(t, { mode: "auto", gate: "blocking", fullAuto: true });
  assert.equal(d1.decision, "answer");
  assert.equal(d1.questions.length, 0);
  const d2 = decide({ ...t, blocking: true }, { mode: "auto", gate: "blocking", fullAuto: true });
  assert.equal(d2.decision, "ask");
  assert.equal(d2.questions.length, 1);
  assert.equal(d2.blocking, true);
});

test("gate=skip / mode=off → answer", () => {
  assert.equal(decide(tri(), { mode: "auto", gate: "skip" }).decision, "answer");
  assert.equal(decide(tri(), { mode: "off", gate: "blocking" }).decision, "answer");
});

test("options < 2 → kind text; multi saqlanadi", () => {
  const t = tri({
    missing_facts: [
      fact("jurisdiction", true, { options: ["O'zbekiston"], kind: "single" }),
      fact("documents", true, { options: ["Shartnoma", "Buyruq", "Hech narsa"], kind: "multi" }),
    ],
  });
  const d = decide(t, { mode: "auto", gate: "blocking" });
  const j = d.questions.find((q) => q.slot === "jurisdiction")!;
  const docs = d.questions.find((q) => q.slot === "documents")!;
  assert.equal(j.kind, "text");
  assert.deepEqual(j.options, []);
  assert.equal(docs.kind, "multi");
  assert.equal(docs.options.length, 3);
});

test("playbook: har domen bor, slot katalogi bir xil (deterministik)", () => {
  for (const d of INQUIRY_DOMAINS) assert.ok(PLAYBOOKS[d].length > 0, d);
  assert.equal(formatSlotCatalog(), formatSlotCatalog());
  assert.ok(formatSlotCatalog().includes("jurisdiction*"));
});

console.log(`\npolicy: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
