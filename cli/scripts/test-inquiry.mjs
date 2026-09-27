// Deterministik test: cli/src/inquiry.mjs (chuqur so'rash UX + mahalliy zaxira taklifi) va args.mjs flaglari.
// Tarmoqsiz (fetch mock). Oxirida bin/sovereign.mjs ni bola jarayonda bir necha xavfsiz holatda sinaydi.
// Ishga tushirish: node cli/scripts/test-inquiry.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "../src/args.mjs";
import {
  EMERGENCY_FIRST,
  INQUIRY_PATH,
  appendToUserMessage,
  buildContext,
  buildInquiryRequest,
  cleanTerm,
  confirmFullAutoLocal,
  createInquiryState,
  createLimitHandler,
  detectLang,
  fetchInquiry,
  formatClarification,
  inquiryPlan,
  insertAddendum,
  isEmergencyText,
  normalizeInquiryResponse,
  parseAnswer,
  pickLocalModel,
  removeMessage,
  renderCard,
  renderFollowups,
  renderQuestion,
  resolveLocalModel,
  runInquiry,
  splitUserContent,
  toInquiryMessages,
} from "../src/inquiry.mjs";

const plain = new Proxy({}, { get: () => (s) => String(s) }); // rangsiz `c`
const ESC = "\x1b";
let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ✕ ${name}\n    ${String(err?.stack ?? err).split("\n").slice(0, 14).join("\n    ")}`);
  }
}
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
const Q = (o = {}) => ({ id: "q1", slot: "jurisdiction", text: "Qaysi mamlakatda?", why: "Qonun mamlakatga bog'liq.", kind: "single", options: ["O'zbekiston", "Qozog'iston", "Boshqa…"], critical: true, ...o });
const askResp = (o = {}) => ({
  decision: "ask",
  inquiryId: "11111111-1111-4111-8111-111111111111",
  domain: "legal",
  stakes: "high",
  clarity: 0.3,
  goal: "Ishga tiklanish",
  questions: [Q(), Q({ id: "q2", slot: "deadline", text: "Buyruq qachon berildi?", options: ["Shu hafta", "1 oydan ko'p"], critical: false }), Q({ id: "q3", slot: "documents", text: "Qanday hujjatlar bor?", kind: "multi", options: ["Shartnoma", "Buyruq", "Yozishmalar"], critical: false })],
  assumptions: ["O'zbekiston qonunchiligi"],
  blocking: false,
  latencyMs: 300,
  round: 1,
  emergency: false,
  professional: "lawyer",
  addendum: "SKIPPED-ADDENDUM",
  reason: "ask",
  ...o,
});
const answerResp = (o = {}) => ({ ...askResp(), decision: "answer", questions: [], addendum: "FRESH-ADDENDUM", round: 2, ...o });
const scripted = (answers) => {
  const q = [...answers];
  return async () => (q.length ? q.shift() : "");
};

console.log("args.mjs");
await test("--no-ask va --ollama flaglari", () => {
  assert.equal(parseArgs(["--no-ask", "vazifa"]).flags.noAsk, true);
  assert.equal(parseArgs(["--ollama", "vazifa"]).flags.ollama, true);
  const p = parseArgs(["--ollama", "vazifa"]);
  assert.deepEqual(p.positional, ["vazifa"], "--ollama keyingi argumentni model deb olmaydi");
  assert.equal(parseArgs(["--ollama=qwen2.5-coder:7b"]).flags.ollama, "qwen2.5-coder:7b");
  assert.equal(parseArgs(["--ollama=../evil"]).errors.length, 1);
  assert.equal(parseArgs(["--ollama=a b"]).errors.length, 1);
  assert.equal(parseArgs(["--no-ask=1"]).errors.length, 1, "bool flagga qiymat — xato");
});

console.log("inquiryPlan (skip qoidalari, §A.9)");
await test("so'raladigan yagona holat: interaktiv, token bor, birinchi xabar", () => {
  const base = { flags: {}, config: { token: "t", inquiry: "auto" }, interactive: true, firstMessage: true };
  assert.deepEqual(inquiryPlan(base), { mode: "server", ask: true, reason: "ok" });
  assert.equal(inquiryPlan({ ...base, firstMessage: false }).mode, "none");
  const cases = [
    [{ flags: { print: true } }, "print"],
    [{ flags: { json: true } }, "json"],
    [{ interactive: false }, "non_tty"],
    [{ flags: { yes: true } }, "yes"],
    [{ flags: { noAsk: true } }, "no_ask"],
    [{ config: { token: "t", inquiry: "off" } }, "off"],
    [{ config: { token: "t", inquiry: "auto", local: "llama3.2" } }, "local_model"],
    [{ config: { openrouterKey: "k", inquiry: "auto" } }, "no_token"],
  ];
  for (const [patch, reason] of cases) {
    const r = inquiryPlan({ ...base, ...patch });
    assert.equal(r.mode, "local", reason);
    assert.equal(r.ask, false, reason);
    assert.equal(r.reason, reason);
  }
  // Full auto — skip emas: server blocking'ni hal qiladi.
  assert.equal(inquiryPlan({ ...base, fullAuto: true }).mode, "server");
});

console.log("matn yordamchilari");
await test("cleanTerm: ANSI/OSC/boshqaruv/bidi olib tashlanadi, kesiladi", () => {
  const evil = `Salom${ESC}[31mqizil${ESC}]8;;https://evil.test${ESC}\\havola${ESC}]8;;${ESC}\\‮teskari\u0007\r\nqator`;
  const out = cleanTerm(evil, 200);
  assert.ok(!/[\x00-\x1f\x7f‮]/.test(out), JSON.stringify(out));
  assert.ok(!out.includes("evil.test"), "OSC havola manzili chiqmasin");
  assert.ok(out.includes("Salom") && out.includes("qizil") && out.includes("havola"));
  assert.equal(cleanTerm("a".repeat(300), 10).length, 10);
  assert.equal(cleanTerm(42), "");
});
await test("detectLang", () => {
  assert.equal(detectLang("Ishdan bo'shatildim, nima qilay?"), "uz");
  assert.equal(detectLang("Ишдан бўшатилдим, нима қилай?"), "uz-cyrl");
  assert.equal(detectLang("Меня уволили, что делать?"), "ru");
  assert.equal(detectLang("How should I deploy this app?"), "en");
  assert.equal(detectLang("npm test"), "uz");
  // R2-6: ў/қ/ғ/ҳ siz kirillcha o'zbekcha — "ru" emas
  assert.equal(detectLang("Салом, шартнома ёзиб бер"), "uz-cyrl");
  assert.equal(detectLang("Бу кодни тузатиб бер"), "uz-cyrl");
  assert.equal(detectLang("Напиши договор, пожалуйста"), "ru");
});
await test("R1: model savol matnidagi havolalar (markdown bilan bo'lingan ham) olib tashlanadi", () => {
  const r = normalizeInquiryResponse({
    decision: "ask",
    questions: [
      { slot: "jurisdiction", text: "Qaysi davlat? ht**tps://evil.help/c?m=AAA", why: "Manba: ht_*_tps://evil.com/x", options: ["O'zbekiston", "h`ttps://evil.help/o"] },
    ],
    goal: "Maqsad ht|tps://1.2.3.4/p",
    assumptions: ["Taxmin hxxp://evil.help/a"],
  });
  const all = JSON.stringify(r);
  assert.ok(!all.includes("://") && !/evil|1\.2\.3\.4/.test(all), all);
  assert.equal(r.questions[0].text, "Qaysi davlat?");
  assert.deepEqual(r.questions[0].options, ["O'zbekiston"]);
  assert.equal(formatClarification([{ question: r.questions[0].text, answer: "O'zbekiston" }]).includes("://"), false);
});
await test("isEmergencyText — 4 tilda, soxta ijobiysiz", () => {
  for (const t of ["Ko'kragim qattiq og'riyapti", "Кўкрагим қаттиқ оғрияпти", "Сильная боль в груди и немеет левая рука", "I have chest pain", "o'zimni o'ldirmoqchiman", "хочу умереть", "I want to die"]) {
    assert.ok(isEmergencyText(t), t);
  }
  for (const t of ["Testlarni tuzat", "Kill the process on port 3000", "Ko'krak qafasi anatomiyasi haqida yoz", "die() funksiyasini olib tashla"]) {
    assert.ok(!isEmergencyText(t), t);
  }
});
await test("splitUserContent: fayl mazmuni emas, faqat nomi", () => {
  const r = splitUserContent([
    { type: "text", text: "[FAYL: shartnoma.txt]\nMAXFIY MAZMUN\n[/FAYL]" },
    { type: "text", text: "[PDF fayl biriktirildi: hujjat.pdf. matn ajratilmadi.]" },
    { type: "image_url", image_url: { url: "data:image/png;base64,AAA" } },
    { type: "text", text: "Buni tahlil qil" },
  ]);
  assert.equal(r.text, "Buni tahlil qil");
  assert.deepEqual(r.files, ["shartnoma.txt", "hujjat.pdf", "rasm"]);
  assert.deepEqual(splitUserContent("oddiy"), { text: "oddiy", files: [] });
});

console.log("so'rov tanasi");
await test("toInquiryMessages: tool/system/fayl mazmunisiz, oxirgi 8, oxiri user", () => {
  const msgs = [
    { role: "system", content: "SYS" },
    ...Array.from({ length: 6 }, (_, i) => [
      { role: "user", content: `savol ${i}` },
      { role: "assistant", content: null, tool_calls: [{ id: "x" }] },
      { role: "tool", content: "natija" },
      { role: "assistant", content: `javob ${i}` },
    ]).flat(),
    { role: "user", content: [{ type: "text", text: "[FAYL: a.js]\nconst SECRET=1\n[/FAYL]" }, { type: "text", text: "oxirgi" }] },
    { role: "assistant", content: "keyingi" },
  ];
  const out = toInquiryMessages(msgs);
  assert.ok(out.length <= 8);
  assert.equal(out.at(-1).role, "user");
  assert.equal(out.at(-1).content, "oxirgi");
  assert.ok(out.every((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && Object.keys(m).length === 2));
  assert.ok(!JSON.stringify(out).includes("SECRET") && !JSON.stringify(out).includes("natija") && !JSON.stringify(out).includes("SYS"));
  const long = toInquiryMessages([{ role: "user", content: "x".repeat(9000) }]);
  assert.equal(long[0].content.length, 8000);
});
await test("buildInquiryRequest: server .strict() sxemasiga aynan mos", () => {
  const body = buildInquiryRequest({
    messages: [{ role: "user", content: "Меня уволили" }],
    config: { inquiry: "always", token: "t", baseUrl: "https://x" },
    fullAuto: true,
    round: 1,
    askedSlots: ["jurisdiction", "jurisdiction", "a".repeat(41), 5],
    context: buildContext({ files: ["a.pdf"], folder: "src/\n  app/" }),
  });
  assert.deepEqual(Object.keys(body).sort(), ["askedSlots", "context", "fullAuto", "inquiryMode", "lang", "messages", "mode", "round", "surface"]);
  assert.equal(body.surface, "cli");
  assert.equal(body.mode, "code");
  assert.equal(body.lang, "ru");
  assert.equal(body.inquiryMode, "always");
  assert.equal(body.fullAuto, true);
  assert.deepEqual(body.askedSlots, ["jurisdiction"]);
  assert.ok(body.context.startsWith("Attached files: a.pdf"));
  assert.equal(buildInquiryRequest({ messages: [{ role: "system", content: "x" }] }), null);
  assert.ok(buildContext({ folder: "y".repeat(5000) }).length <= 4000);
});

console.log("javobni tozalash");
await test("normalizeInquiryResponse: LLM matni terminal uchun xavfsiz", () => {
  const r = normalizeInquiryResponse(askResp({
    goal: `Maqsad${ESC}[2J`,
    questions: [
      Q({ text: `Savol${ESC}]0;title${ESC}\\ matni`, options: ["a", "b", "c", "d", "e", "f", "g"], slot: "../x" }),
      Q({ text: "" }),
      Q({ id: "q9", kind: "multi", options: [] }),
    ],
  }));
  assert.equal(r.questions.length, 2);
  assert.ok(!r.questions[0].text.includes(ESC));
  assert.equal(r.questions[0].options.length, 6);
  assert.equal(r.questions[0].slot, "q1", "yaroqsiz slot id almashtiriladi");
  assert.equal(r.questions[1].id, "q2");
  assert.equal(r.questions[1].kind, "text", "variantsiz multi → text");
  assert.ok(!r.goal.includes(ESC));
  assert.equal(normalizeInquiryResponse({ decision: "hack" }), null);
  assert.equal(normalizeInquiryResponse(null), null);
  assert.equal(normalizeInquiryResponse(askResp({ questions: [] })).decision, "answer", "savolsiz ask → answer");
  assert.equal(normalizeInquiryResponse(askResp({ professional: "hacker" })).professional, null);
});

console.log("javoblarni o'qish");
await test("parseAnswer", () => {
  const q = normalizeInquiryResponse(askResp()).questions;
  assert.deepEqual(parseAnswer("", q[0]), { value: null });
  assert.deepEqual(parseAnswer("1", q[0]), { value: "O'zbekiston", other: false });
  assert.deepEqual(parseAnswer("1,2", q[0]), { value: "O'zbekiston", other: false }, "single — faqat birinchisi");
  assert.equal(parseAnswer("3", q[0]).other, true);
  assert.equal(parseAnswer("9", q[0]).invalid, true);
  assert.deepEqual(parseAnswer("1, 3", q[2]), { value: "Shartnoma, Yozishmalar", other: false });
  assert.deepEqual(parseAnswer("Toshkent shahri", q[0]), { value: "Toshkent shahri" });
  assert.equal(parseAnswer(`x${ESC}[31m`, q[0]).value, "x");
});
await test("formatClarification / appendToUserMessage / insertAddendum", () => {
  const block = formatClarification([{ question: "Mamlakat?", answer: "O'zbekiston" }], { unanswered: 1 });
  assert.ok(block.startsWith("Aniqlashtirish:\n- Mamlakat? — O'zbekiston"));
  assert.ok(/taxmin/.test(block));
  const m1 = { role: "user", content: "Vazifa" };
  appendToUserMessage(m1, block);
  assert.ok(m1.content.startsWith("Vazifa\n\nAniqlashtirish:"));
  const m2 = { role: "user", content: [{ type: "text", text: "[FAYL: a]\nx\n[/FAYL]" }, { type: "text", text: "Vazifa" }] };
  appendToUserMessage(m2, block);
  assert.ok(m2.content[1].text.includes("Aniqlashtirish:") && !m2.content[0].text.includes("Aniqlashtirish"));
  const msgs = [{ role: "system", content: "S" }, { role: "user", content: "u" }];
  const add = insertAddendum(msgs, "ADD");
  assert.deepEqual(msgs.map((m) => m.content), ["S", "ADD", "u"]);
  removeMessage(msgs, add);
  assert.deepEqual(msgs.map((m) => m.content), ["S", "u"]);
  assert.equal(insertAddendum(msgs, ""), null);
});
await test("render: raqamlangan savollar va variantlar", () => {
  const r = normalizeInquiryResponse(askResp());
  const card = renderCard(r, plain).join("\n");
  assert.ok(card.includes("huquq · yuqori xavf") && card.includes("Maqsad: Ishga tiklanish") && card.includes("advokat") && card.includes("Enter"));
  const q = renderQuestion(r.questions[0], 0, plain).join("\n");
  assert.ok(q.includes("1. Qaysi mamlakatda?") && q.includes("(muhim)") && q.includes("Nega:") && q.includes("[1] O'zbekiston") && q.includes("[3] Boshqa…"));
  assert.ok(renderQuestion(r.questions[2], 2, plain).join("\n").includes("1,3"));
  assert.equal(renderFollowups([], plain).length, 0);
  assert.ok(renderFollowups(r.questions.slice(0, 1), plain).join("\n").includes("Qaysi mamlakatda?"));
});

console.log("fetchInquiry / runInquiry (fetch mock)");
const cfg = { token: "tok-123", baseUrl: "https://api.example.test/", inquiry: "auto" };
const serverPlan = { mode: "server", ask: true };
function mockFetch(responses) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    const r = responses[Math.min(calls.length - 1, responses.length - 1)];
    return typeof r === "function" ? r(url, init) : r === "neterr" ? Promise.reject(new TypeError("fetch failed")) : json(r);
  };
  fn.calls = calls;
  return fn;
}
function convo(text = "Ish beruvchim meni ishdan bo'shatdi, nima qilsam bo'ladi?") {
  const userMsg = { role: "user", content: text };
  return { messages: [{ role: "system", content: "SYS" }, userMsg], userMsg };
}
const quiet = () => {};

await test("fetchInquiry: URL, Bearer, redirect:error; 200 bo'lmasa null", async () => {
  const f = mockFetch([answerResp()]);
  const r = await fetchInquiry(cfg, { messages: [{ role: "user", content: "x" }] }, { fetchImpl: f });
  assert.equal(r.decision, "answer");
  assert.equal(f.calls[0].url, `https://api.example.test${INQUIRY_PATH}`);
  assert.equal(f.calls[0].init.headers.Authorization, "Bearer tok-123");
  assert.equal(f.calls[0].init.redirect, "error");
  assert.equal(await fetchInquiry(cfg, { a: 1 }, { fetchImpl: mockFetch([() => json({ error: "x" }, 500)]) }), null);
  assert.equal(await fetchInquiry(cfg, { a: 1 }, { fetchImpl: mockFetch(["neterr"]) }), null);
  assert.equal(await fetchInquiry(cfg, { a: 1 }, { fetchImpl: mockFetch([() => new Response("not json")]) }), null);
  assert.equal(await fetchInquiry({ baseUrl: "https://x" }, { a: 1 }, { fetchImpl: mockFetch([answerResp()]) }), null, "tokensiz — chaqirilmaydi");
});
await test("ask → javoblar birinchi xabarga qo'shiladi, 2-chaqiruv round=1 + askedSlots, yangi addendum", async () => {
  const { messages, userMsg } = convo();
  const f = mockFetch([askResp(), answerResp()]);
  const st = createInquiryState();
  const out = await runInquiry({ messages, userMsg, config: cfg, plan: serverPlan, state: st, ask: scripted(["1", "", "1,2"]), log: quiet, c: plain, fetchImpl: f });
  assert.equal(f.calls.length, 2);
  assert.equal(out.addendum, "FRESH-ADDENDUM");
  assert.equal(out.asked, 3);
  assert.equal(out.answered, 2);
  assert.ok(userMsg.content.includes("Aniqlashtirish:\n- Qaysi mamlakatda? — O'zbekiston\n- Qanday hujjatlar bor? — Shartnoma, Buyruq"));
  assert.ok(/taxmin/.test(userMsg.content), "javobsiz savol uchun taxmin eslatmasi");
  assert.equal(f.calls[1].body.round, 1);
  assert.deepEqual(f.calls[1].body.askedSlots, ["jurisdiction", "deadline", "documents"]);
  assert.ok(f.calls[1].body.messages.at(-1).content.includes("Aniqlashtirish:"));
  assert.deepEqual(st.askedSlots, ["jurisdiction", "deadline", "documents"]);
});
await test("Enter (hammasi o'tkazildi) → bitta chaqiruv, server bergan skipped-addendum", async () => {
  const { messages, userMsg } = convo();
  const f = mockFetch([askResp()]);
  const out = await runInquiry({ messages, userMsg, config: cfg, plan: serverPlan, ask: scripted(["", "", ""]), log: quiet, c: plain, fetchImpl: f });
  assert.equal(f.calls.length, 1);
  assert.equal(out.addendum, "SKIPPED-ADDENDUM");
  assert.ok(!userMsg.content.includes("Aniqlashtirish"));
});
await test("Boshqa… → qo'shimcha matn so'raladi; noto'g'ri raqam → qayta so'raladi", async () => {
  const { messages, userMsg } = convo();
  const f = mockFetch([askResp({ questions: [Q()] }), answerResp()]);
  const lines = [];
  await runInquiry({ messages, userMsg, config: cfg, plan: serverPlan, ask: scripted(["7", "3", "Tojikiston"]), log: (l) => lines.push(l), c: plain, fetchImpl: f });
  assert.ok(lines.some((l) => l.includes("1–3 oralig'idagi")));
  assert.ok(userMsg.content.includes("- Qaysi mamlakatda? — Tojikiston"));
});
await test("2 raunddan ortiq savol yo'q (server yana ask desa ham)", async () => {
  const { messages, userMsg } = convo();
  const f = mockFetch([askResp(), askResp({ round: 2 }), askResp({ round: 2, addendum: "LAST" })]);
  const out = await runInquiry({ messages, userMsg, config: cfg, plan: serverPlan, ask: scripted(["1", "", "", "1", "", ""]), log: quiet, c: plain, fetchImpl: f });
  assert.equal(f.calls.length, 3);
  assert.equal(out.asked, 6, "ikki raund × 3 savol");
  assert.equal(out.addendum, "LAST");
});
await test("fail-open: xato/taymaut → savolsiz, addendumsiz; javobdan keyin xato → skipped-addendum ishlatilmaydi", async () => {
  const a = convo();
  const out = await runInquiry({ ...a, config: cfg, plan: serverPlan, ask: scripted([]), log: quiet, c: plain, fetchImpl: mockFetch(["neterr"]) });
  assert.deepEqual([out.addendum, out.asked, out.cancelled], ["", 0, false]);
  const b = convo();
  const out2 = await runInquiry({ ...b, config: cfg, plan: serverPlan, ask: scripted(["1", "", ""]), log: quiet, c: plain, fetchImpl: mockFetch([askResp(), "neterr"]) });
  assert.equal(out2.addendum, "");
  // Taymaut: osilib qolgan server — INQUIRY_TIMEOUT_MS (3 s) dan oshmaydi.
  const hang = (_u, init) => new Promise((_, rej) => init.signal.addEventListener("abort", () => rej(init.signal.reason)));
  const t0 = Date.now();
  // AbortSignal.timeout taymeri unref — haqiqiy fetch'da soket jarayonni ushlaydi, bu yerda esa biz ushlaymiz.
  const keep = setTimeout(() => {}, 5000);
  const r = await fetchInquiry(cfg, { a: 1 }, { fetchImpl: hang, timeoutMs: 150 }).finally(() => clearTimeout(keep));
  assert.equal(r, null);
  assert.ok(Date.now() - t0 < 1000);
});
await test("Ctrl+C savol paytida → cancelled", async () => {
  const { messages, userMsg } = convo();
  const ac = new AbortController();
  const out = await runInquiry({ messages, userMsg, config: cfg, plan: serverPlan, ask: async () => (ac.abort(), ""), log: quiet, c: plain, signal: ac.signal, fetchImpl: mockFetch([askResp()]) });
  assert.equal(out.cancelled, true);
});
await test("answer_then_ask → follow-up (≤3), savol so'ralmaydi", async () => {
  const { messages, userMsg } = convo();
  const out = await runInquiry({ messages, userMsg, config: cfg, plan: serverPlan, ask: async () => assert.fail("so'ralmasligi kerak"), log: quiet, c: plain, fetchImpl: mockFetch([askResp({ decision: "answer_then_ask", addendum: "A" })]) });
  assert.equal(out.followups.length, 3);
  assert.equal(out.addendum, "A");
});
await test("mahalliy/interaktivsiz rejim: server chaqirilmaydi, faqat favqulodda addendum", async () => {
  const f = mockFetch([askResp()]);
  const e = convo("Сильная боль в груди и немеет левая рука");
  const out = await runInquiry({ ...e, config: cfg, plan: { mode: "local", ask: false }, ask: scripted([]), log: quiet, c: plain, fetchImpl: f });
  assert.equal(out.addendum, EMERGENCY_FIRST);
  const n = convo("Testlarni tuzat");
  const out2 = await runInquiry({ ...n, config: cfg, plan: { mode: "local", ask: false }, ask: scripted([]), log: quiet, c: plain, fetchImpl: f });
  assert.equal(out2.addendum, "");
  const out3 = await runInquiry({ ...n, config: cfg, plan: { mode: "none" }, ask: scripted([]), log: quiet, c: plain, fetchImpl: f });
  assert.equal(out3.addendum, "");
  assert.equal(f.calls.length, 0);
});
await test("full auto blocking: bitta savol; o'tkazilsa — qaytarib bo'lmaydigan amal taqiqi qo'shiladi", async () => {
  const { messages, userMsg } = convo("Loyihani serverga deploy qil");
  const f = mockFetch([askResp({ domain: "code", blocking: true, questions: [Q({ slot: "constraints", text: "Qaysi serverga?", options: [] })], addendum: "FA" })]);
  const out = await runInquiry({ messages, userMsg, config: cfg, plan: serverPlan, fullAuto: true, ask: scripted([""]), log: quiet, c: plain, fetchImpl: f });
  assert.equal(f.calls[0].body.fullAuto, true);
  assert.ok(out.addendum.startsWith("FA") && /irreversible/.test(out.addendum));
});

console.log("mahalliy model zaxirasi (onLimit)");
const models = [
  { name: "llama3.2:latest", tools: false, paramSize: "3B" },
  { name: "qwen2.5-coder:7b", tools: true, vision: false, paramSize: "7B" },
];
const listOk = async () => ({ available: true, models });
await test("pickLocalModel / resolveLocalModel", async () => {
  assert.equal(pickLocalModel(models, "").name, "qwen2.5-coder:7b", "tool-calling'li afzal");
  assert.equal(pickLocalModel(models, "llama3.2").name, "llama3.2:latest");
  assert.equal(pickLocalModel([], ""), null);
  assert.equal((await resolveLocalModel(true, {}, { listModels: listOk })).model.name, "qwen2.5-coder:7b");
  assert.equal((await resolveLocalModel("llama3.2", {}, { listModels: listOk })).model.name, "llama3.2:latest");
  const miss = await resolveLocalModel("qwen3:8b", {}, { listModels: listOk });
  assert.equal(miss.ok, false);
  assert.ok(miss.hint.join(" ").includes("ollama pull qwen3:8b"));
  assert.equal((await resolveLocalModel("../x", {}, { listModels: listOk })).ok, false);
  const none = await resolveLocalModel("", {}, { c: plain, listModels: async () => ({ available: false, models: [] }) });
  assert.equal(none.ok, false);
  assert.ok(none.hint.join(" ").includes("ollama.com/download"));
});
function handler(o = {}) {
  const saved = [];
  const lines = [];
  const config = { localFallback: "ask", localModel: "", ...(o.config ?? {}) };
  const fullAuto = { on: Boolean(o.fullAuto) };
  const h = createLimitHandler({
    getConfig: () => config,
    interactive: o.interactive ?? true,
    ask: scripted(o.answers ?? []),
    log: (l) => lines.push(l),
    c: plain,
    fullAuto,
    save: (p) => saved.push(p),
    listModels: o.listModels ?? listOk,
  });
  return { h, saved, lines, config, fullAuto };
}
await test("ask: Enter → tavsiya model, localModel saqlanadi", async () => {
  const t = handler({ answers: [""] });
  assert.equal(await t.h({ kind: "user_limit" }), "qwen2.5-coder:7b");
  assert.deepEqual(t.saved, [{ localModel: "qwen2.5-coder:7b" }]);
  assert.ok(t.lines.join("\n").includes("Mahalliy model bilan davom etasizmi?"));
  assert.ok(t.lines.join("\n").includes("Tarif limitingiz tugadi"));
});
await test("ask: n → null; raqam → boshqa model; a → localFallback=auto", async () => {
  assert.equal(await handler({ answers: ["n"] }).h({ kind: "offline" }), null);
  assert.equal(await handler({ answers: ["1"] }).h({ kind: "offline" }), "llama3.2:latest");
  assert.equal(await handler({ answers: ["5"] }).h({ kind: "offline" }), null);
  assert.equal(await handler({ answers: ["balki"] }).h({ kind: "offline" }), null);
  const t = handler({ answers: ["a"] });
  assert.equal(await t.h({ kind: "server" }), "qwen2.5-coder:7b");
  assert.deepEqual(t.saved[0], { localFallback: "auto" });
  assert.equal(t.config.localFallback, "auto");
});
await test("auto: so'ramasdan o'tadi; interaktivsiz ask: so'ramaydi, ko'rsatma beradi", async () => {
  const a = handler({ config: { localFallback: "auto", localModel: "llama3.2:latest" }, answers: [] });
  assert.equal(await a.h({ kind: "user_limit" }), "llama3.2:latest");
  assert.ok(a.lines.join("\n").includes("faqat suhbat"), "tools'siz model ogohlantirishi");
  const b = handler({ interactive: false });
  assert.equal(await b.h({ kind: "user_limit" }), null);
  assert.ok(b.lines.join("\n").includes("sov --ollama="));
});
await test("Ollama yo'q → null + o'rnatish ko'rsatmasi (user_limit'da /upgrade ham)", async () => {
  const t = handler({ listModels: async () => ({ available: false, models: [] }), answers: ["y"] });
  assert.equal(await t.h({ kind: "user_limit" }), null);
  const s = t.lines.join("\n");
  assert.ok(s.includes("ollama.com/download") && s.includes("ollama pull") && s.includes("/upgrade"));
});
await test("Full auto + mahalliy model — alohida tasdiq", async () => {
  const no = handler({ fullAuto: true, answers: ["", "n"] });
  assert.equal(await no.h({ kind: "offline" }), "qwen2.5-coder:7b");
  assert.equal(no.fullAuto.on, false, "rad etilsa full auto o'chadi");
  const yes = handler({ fullAuto: true, answers: ["", "y"] });
  await yes.h({ kind: "offline" });
  assert.equal(yes.fullAuto.on, true);
  const auto = handler({ fullAuto: true, interactive: false, config: { localFallback: "auto" } });
  await auto.h({ kind: "offline" });
  assert.equal(auto.fullAuto.on, false, "interaktivsiz — tasdiqlab bo'lmaydi, full auto o'chadi");
  assert.equal(await confirmFullAutoLocal({ interactive: true, ask: async () => "", log: quiet, c: plain }), false, "Enter — yo'q");
});

console.log("agentTurn + onLimit (T9 hook) integratsiyasi");
await test("user_limit 429 → kutmasdan (retry'siz) taklif → mahalliy modelda davom, serverga qayta so'rov yo'q", async () => {
  const { agentTurn } = await import("../src/agent.mjs");
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    calls.push(u);
    if (u.endsWith("/api/cli/chat")) {
      return new Response(JSON.stringify({ error: "Oylik token limiti tugadi", code: "user_limit" }), { status: 429, headers: { "Content-Type": "application/json", "X-Sovereign-Code": "user_limit" } });
    }
    if (u.endsWith("/api/version")) return json({ version: "0.12.0" });
    if (u.endsWith("/api/tags")) return json({ models: [{ name: "qwen2.5-coder:7b", size: 1, details: {} }] });
    if (u.endsWith("/api/show")) return json({ capabilities: ["completion", "tools"], model_info: { "qwen2.context_length": 32768 } });
    if (u.endsWith("/v1/chat/completions")) {
      assert.ok(!init.headers?.Authorization, "Ollama'ga token ketmaydi");
      const enc = new TextEncoder();
      const body = new ReadableStream({
        start(ctrl) {
          ctrl.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: "Mahalliy javob" } }] })}\n\n`));
          ctrl.enqueue(enc.encode("data: [DONE]\n\n"));
          ctrl.close();
        },
      });
      return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
    }
    return new Response("?", { status: 404 });
  };
  try {
    const config = { token: "tok", baseUrl: "https://api.example.test", localFallback: "ask", localModel: "" };
    const lines = [];
    config.onLimit = createLimitHandler({ getConfig: () => config, interactive: true, ask: scripted([""]), log: (l) => lines.push(l), c: plain, fullAuto: { on: false }, save: () => {} });
    const t0 = Date.now();
    const res = await agentTurn({ messages: [{ role: "user", content: "salom" }], config, confirm: async () => false, print: false, verify: false });
    assert.ok(Date.now() - t0 < 4000, "user_limit'da 5 s+ kutish bo'lmasligi kerak");
    assert.equal(res.error, undefined, res.error);
    assert.equal(res.final, "Mahalliy javob");
    assert.equal(res.local, "qwen2.5-coder:7b");
    assert.equal(calls.filter((u) => u.endsWith("/api/cli/chat")).length, 1, "server faqat bir marta");
    assert.ok(lines.join("\n").includes("Tarif limitingiz tugadi"));
  } finally {
    globalThis.fetch = realFetch;
  }
});

console.log("bin/sovereign.mjs (bola jarayon, tarmoqsiz holatlar)");
const bin = join(dirname(fileURLToPath(import.meta.url)), "..", "bin", "sovereign.mjs");
const run = (args) => spawnSync(process.execPath, [bin, ...args], { encoding: "utf8", env: { ...process.env, NO_COLOR: "1" }, timeout: 20_000 });
await test("--help: yangi flaglar va sozlamalar", () => {
  const r = run(["--help"]);
  assert.equal(r.status, 0);
  assert.ok(r.stdout.includes("--no-ask") && r.stdout.includes("--ollama[=model]") && r.stdout.includes("localFallback"));
});
await test("sov config noto'g'ri qiymat → chiqish kodi 2, hech narsa yozilmaydi", () => {
  const r = run(["config", "inquiry=maybe"]);
  assert.equal(r.status, 2);
  assert.ok(r.stderr.includes("inquiry: auto | always | off"));
  assert.equal(run(["config", "token=abc"]).status, 2, "faqat ruxsat etilgan kalitlar");
  assert.equal(run(["config", "shunchaki"]).status, 2);
});
await test("--ollama=../x → foydalanish xatosi (2)", () => {
  assert.equal(run(["--ollama=../x", "-p", "salom"]).status, 2);
});

console.log(`\n${failed ? "✕" : "✓"} ${passed} o'tdi, ${failed} xato`);
process.exit(failed ? 1 : 0);
