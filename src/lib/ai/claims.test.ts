/**
 * Lokal test (LLM/tarmoqsiz): npx tsx src/lib/ai/claims.test.ts
 * Amal da'volari detektori (uz / uz-cyrl / ru / en), jurnal bilan solishtirish
 * va [n] iqtibos belgilarini tekshirish.
 */
import assert from "node:assert/strict";
import {
  checkClaims,
  citationMarkers,
  detectActionClaims,
  unsourcedMarkers,
  type ActionRecord,
  type ActionVerb,
} from "./claims";

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

const verbs = (text: string) => detectActionClaims(text).map((c) => c.verb);

/* ---------------- Haqiqiy da'volar (topilishi SHART) ---------------- */
const POSITIVE: [string, string, ActionVerb][] = [
  ["uz: xat yubordim", "Xatni Anvarga yubordim, u bugun javob beradi.", "send"],
  ["uz: jadval yaratdim", "Google Sheets'da yangi jadval yaratdim va 5 ta qator qo'shdim.", "create"],
  ["uz: faylni saqladim", "Faylni papkangizga saqladim.", "save"],
  ["uz: xatlarni o'chirdim", "Spam xatlarni o‘chirdim.", "delete"],
  ["uz: majhul yuborildi", "Xat muvaffaqiyatli yuborildi.", "send"],
  ["uz: uchrashuv rejalashtirildi", "Ertangi uchrashuvni kalendarga rejalashtirdim.", "schedule"],
  ["uz-cyrl: хат юбордим", "Хатни мижозга юбордим.", "send"],
  ["uz-cyrl: жадвал яратдим", "Янги жадвал яратдим.", "create"],
  ["uz-cyrl: файл сақладим", "Файлни сақладим.", "save"],
  ["ru: отправил письмо", "Я отправил письмо Ивану.", "send"],
  ["ru: создал таблицу", "Готово, создал таблицу в Google Sheets.", "create"],
  ["ru: удалил файл", "Я удалил старый файл из папки.", "delete"],
  ["ru: письмо отправлено", "Письмо успешно отправлено.", "send"],
  ["ru: забронировал", "Я забронировал столик на 19:00.", "book"],
  ["en: I've sent the email", "I've sent the email to John.", "send"],
  ["en: I created the spreadsheet", "I created a new spreadsheet called Budget.", "create"],
  ["en: saved the file", "I saved the file to your Drive.", "save"],
  ["en: has been scheduled", "Your meeting has been scheduled for Monday.", "schedule"],
  ["en: I just deleted", "I just deleted the duplicate events from your calendar.", "delete"],
  ["en: I ran the tests", "I ran the tests and they all pass.", "run"],
  ["en: I booked", "I booked it for you.", "book"],
];

for (const [name, text, verb] of POSITIVE) {
  test(`+ ${name}`, () => assert.ok(verbs(text).includes(verb), `kutilgan "${verb}", topildi: [${verbs(text).join(", ")}] — ${text}`));
}

/* ---------------- Da'vo EMAS (topilmasligi SHART) ---------------- */
const NEGATIVE: [string, string][] = [
  ["uz: inkor", "Xatni yubormadim — Gmail ulanmagan."],
  ["uz: taklif", "Xohlasangiz, xat matnini tayyorlab beraman, siz uni o'zingiz yuborasiz."],
  ["uz: shart", "Agar faylni saqladim desangiz, uni tekshiring."],
  ["uz: iqtibos", "Men \"yubordim\" deb aytolmayman, chunki amal bajarilmadi."],
  ["uz: javob ichidagi jadval", "Quyida jadval tuzdim:\n\n| A | B |\n|---|---|\n| 1 | 2 |"],
  ["uz: tarix (yil)", "Python tili 1991-yilda yaratildi."],
  ["uz: savol", "Xatni yubordimmi?"],
  ["uz-cyrl: инкор", "Хатни юбормадим."],
  ["ru: не отправил", "Я не отправил письмо: сервис вернул ошибку."],
  ["ru: вы отправили", "Вы отправили письмо вчера."],
  ["ru: история", "Первая электронная таблица была создана в 1979 году."],
  ["ru: инфинитив", "Могу создать таблицу, если подключите Google Sheets."],
  ["en: negation", "I haven't sent the email yet."],
  ["en: could not", "I could not create the spreadsheet because Sheets is not connected."],
  ["en: offer", "Would you like me to send the email?"],
  ["en: instruction to user", "Once you have created the spreadsheet, share the link."],
  ["en: history", "The first spreadsheet program was created in 1979."],
  ["en: content below", "I created a table below comparing the plans:\n\n| Plan | Price |\n|---|---|\n| Pro | $10 |"],
  ["en: code block", "Here is the script:\n```bash\n# I sent the email with this\nmail -s hi a@b.c\n```"],
  ["en: quoted email", "> I have sent you the invoice yesterday.\n\nThe sender says the invoice was attached."],
  ["en: text edit", "I removed the duplicate rows in the text you pasted."],
  ["en: email address", "I removed the email address from the paragraph."],
  ["en: generic created", "I created a plan for your week."],
  ["ru: честная ошибка", "Не удалось создать таблицу: Google Sheets вернул ошибку 403."],
  ["en: honest draft", "I can't send emails from here, but here's a draft you can send:\n\nHi John, ..."],
  ["uz: xotira", "Bu ma'lumotni xotiramga saqladim."],
];

for (const [name, text] of NEGATIVE) {
  test(`- ${name}`, () => assert.deepEqual(verbs(text), [], `kutilmagan da'vo: [${verbs(text).join(", ")}] — ${text}`));
}

/* ---------------- Kuch darajasi (LLM tasdig'i faqat borderline'ga) ---------------- */
test("strength: 1-shaxs → strong", () => {
  assert.equal(detectActionClaims("I've sent the email to John.")[0]?.strength, "strong");
  assert.equal(detectActionClaims("Xatni Anvarga yubordim.")[0]?.strength, "strong");
});
test("strength: 3-shaxs/majhul → borderline", () => {
  assert.equal(detectActionClaims("Колумб отправил письмо королеве.")[0]?.strength, "borderline");
  assert.equal(detectActionClaims("Xat muvaffaqiyatli yuborildi.")[0]?.strength, "borderline");
});
test("claim matni asl ko'rinishda (kirill saqlanadi)", () => {
  assert.equal(detectActionClaims("Хатни мижозга юбордим.")[0]?.text, "Хатни мижозга юбордим.");
});

/* ---------------- Jurnal bilan solishtirish ---------------- */
const sheetOk: ActionRecord = {
  tool: "gsheets_create",
  status: "ok",
  attempted: [{ verb: "create", object: "sheet" }, { verb: "add", object: "row" }],
  done: [{ verb: "create", object: "sheet" }, { verb: "add", object: "row" }],
};
const sheetPartial: ActionRecord = {
  tool: "gsheets_create",
  status: "partial",
  attempted: [{ verb: "create", object: "sheet" }, { verb: "add", object: "row" }],
  done: [{ verb: "create", object: "sheet" }],
};
const sheetFailed: ActionRecord = { tool: "gsheets_create", status: "failed", attempted: [{ verb: "create", object: "sheet" }], done: [] };
const gmailRead: ActionRecord = { tool: "gmail_list", status: "ok", attempted: [], done: [] };

test("ledger: ✓ create sheet → tasdiqlangan", () => {
  const claims = detectActionClaims("Google Sheets'da yangi jadval yaratdim va 5 ta qator qo'shdim.");
  assert.deepEqual(checkClaims(claims, [sheetOk]), []);
});
test("ledger: ◐ partial → qatorlar 'partial'", () => {
  const claims = detectActionClaims("Google Sheets'da yangi jadval yaratdim va 5 ta qator qo'shdim.");
  const bad = checkClaims(claims, [sheetPartial]);
  assert.equal(bad.length, 1);
  assert.equal(bad[0].verb, "add");
  assert.equal(bad[0].reason, "partial");
});
test("ledger: halol qisman javob (◐) — ogohlantirish yo'q", () => {
  const text = "Jadval yaratildi: https://docs.google.com/spreadsheets/d/abc, lekin qatorlar qo'shilmadi (Sheets xatosi 400).";
  assert.deepEqual(checkClaims(detectActionClaims(text), [sheetPartial]), []);
});
test("ledger: ✕ failed → 'failed'", () => {
  const bad = checkClaims(detectActionClaims("I created a new spreadsheet called Budget."), [sheetFailed]);
  assert.equal(bad[0]?.reason, "failed");
});
test("ledger: hech qanday chaqiruv yo'q → 'no_calls'", () => {
  const bad = checkClaims(detectActionClaims("Я отправил письмо Ивану."), []);
  assert.equal(bad[0]?.reason, "no_calls");
});
test("ledger: faqat o'qish chaqirildi, xat yuborildi deyildi → 'not_performed'", () => {
  const bad = checkClaims(detectActionClaims("I've sent the email to John."), [gmailRead]);
  assert.equal(bad[0]?.reason, "not_performed");
});
test("ledger: MCP (noma'lum amal) ✓ → tasdiqlangan deb olinadi", () => {
  const mcp: ActionRecord = { tool: "mcp__send", status: "ok", attempted: [{ verb: "any", object: "any" }], done: [{ verb: "any", object: "any" }] };
  assert.deepEqual(checkClaims(detectActionClaims("I've sent the email to John."), [mcp]), []);
});

/* ---------------- Iqtibos [n] ---------------- */
test("cite: belgilar topiladi, kod bloki va havola hisobga olinmaydi", () => {
  const text = "Fakt [1]. Yana [2][3], va [1, 4].\n```js\nconst a = arr[7];\n```\n[5](https://x.y) va arr[9]";
  assert.deepEqual(citationMarkers(text), [1, 2, 3, 4]);
});
test("cite: manbadan tashqari raqamlar", () => {
  assert.deepEqual(unsourcedMarkers("A [1]. B [2]. C [5]. D [0].", 3), [0, 5]);
});
test("cite: manba umuman yo'q — hammasi manbasiz", () => {
  assert.deepEqual(unsourcedMarkers("A [1]. B [2].", 0), [1, 2]);
});
test("cite: hammasi mos — bo'sh", () => {
  assert.deepEqual(unsourcedMarkers("A [1]. B [2][3].", 3), []);
});
test("cite: izoh [^1] va checkbox [x] belgi emas", () => {
  assert.deepEqual(citationMarkers("Matn[^1] va [x] va [ ]"), []);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
