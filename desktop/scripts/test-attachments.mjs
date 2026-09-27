// Chat biriktirmalari testlari (electron'siz): node scripts/test-attachments.mjs
// Tekshiradi: MIME/magic, hajm chegaralari, qismlar soni, content massivini qurish, tarix serializatsiyasi,
// renderer reducer'i (tarixdan tiklash) va renderer/main chegaralari bir xilligi.
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  LIMITS,
  sniffImage,
  looksBinary,
  parseImageDataUrl,
  validThumb,
  checkPickedPath,
  readPicked,
  AttachmentStore,
  publicItem,
  buildUserContent,
  textOf,
  appendText,
  budgetImages,
  stripImages,
  imagesInLastUser,
  persistableContent,
  sanitizeMeta,
  boundThumbs,
  safeName,
  dialogExtensions,
  IMAGE_PLACEHOLDER,
  IMAGE_HISTORY_PLACEHOLDER,
  IMAGE_NO_VISION,
} from "../electron/attachments.mjs";
import { ATTACH_LIMITS, checkSend, checkAdd, toSendPayload, attachErrKey, sizeParts, totalChars } from "../ui/src/lib/attachments.js";
import { applyEvent, replayEvents, initialAgent, sanitizeAttachments } from "../ui/src/lib/agent.js";
import { KEYS } from "../ui/src/lib/i18n.js";

let n = 0;
const pending = [];
const test = (name, fn) => {
  const r = fn();
  if (r && typeof r.then === "function") {
    pending.push(r.then(() => { n++; console.log(`✓ ${name}`); }));
    return;
  }
  n++;
  console.log(`✓ ${name}`);
};

// ---- Namuna baytlar -------------------------------------------------------------
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4a00000000049454e44ae426082", "hex");
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);
const GIF = Buffer.from("GIF89a\x01\x00\x01\x00\x00\x00\x00;", "latin1");
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.from([26, 0, 0, 0]), Buffer.from("WEBPVP8 "), Buffer.alloc(14)]);
const BMP = Buffer.concat([Buffer.from("BM"), Buffer.alloc(60)]);
const url = (mime, buf) => `data:${mime};base64,${buf.toString("base64")}`;

// ---- MIME / magic ----------------------------------------------------------------
test("sniffImage: png/jpeg/gif/webp/bmp aniqlanadi, boshqasi — null", () => {
  assert.equal(sniffImage(PNG), "image/png");
  assert.equal(sniffImage(JPEG), "image/jpeg");
  assert.equal(sniffImage(GIF), "image/gif");
  assert.equal(sniffImage(WEBP), "image/webp");
  assert.equal(sniffImage(BMP), "image/bmp");
  assert.equal(sniffImage(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>")), null);
  assert.equal(sniffImage(Buffer.from("MZ\x90\x00", "latin1")), null);
  assert.equal(sniffImage(Buffer.alloc(0)), null);
});

test("parseImageDataUrl: to'g'ri rasm qabul qilinadi (bayt hajmi bilan)", () => {
  const r = parseImageDataUrl(url("image/png", PNG));
  assert.equal(r.ok, true);
  assert.equal(r.mime, "image/png");
  assert.equal(r.bytes, PNG.length);
  assert.equal(parseImageDataUrl(url("image/jpg", JPEG)).mime, "image/jpeg");
});

test("parseImageDataUrl: e'lon qilingan MIME baytlarga mos kelmasa — rad (magic)", () => {
  assert.equal(parseImageDataUrl(url("image/jpeg", PNG)).error, "bad-image");
  assert.equal(parseImageDataUrl(url("image/png", Buffer.from("not an image at all"))).error, "bad-image");
});

test("parseImageDataUrl: svg/html, http URL, buzuq base64 — rad; juda katta — too-large", () => {
  assert.equal(parseImageDataUrl(url("image/svg+xml", Buffer.from("<svg/>"))).error, "bad-image");
  assert.equal(parseImageDataUrl("https://evil.example/x.png").error, "bad-image");
  assert.equal(parseImageDataUrl("data:image/png;base64,iVBOR!!!").error, "bad-image");
  assert.equal(parseImageDataUrl(`data:image/png;base64,${PNG.toString("base64")}\n<script>`).error, "bad-image");
  assert.equal(parseImageDataUrl(null).error, "bad-image");
  assert.equal(parseImageDataUrl(url("image/png", PNG), { maxChars: 20 }).error, "too-large");
});

test("validThumb: faqat kichik png/jpeg/webp", () => {
  assert.ok(validThumb(url("image/jpeg", JPEG)));
  assert.equal(validThumb(url("image/gif", GIF)), null);
  assert.equal(validThumb(url("image/png", Buffer.concat([PNG, Buffer.alloc(LIMITS.thumbChars)]))), null);
  assert.equal(validThumb("javascript:alert(1)"), null);
});

test("looksBinary: NUL bayt / boshqaruv belgilari — ikkilik; UTF-8 matn — yo'q", () => {
  assert.equal(looksBinary(Buffer.from("hello\x00world", "latin1")), true);
  assert.equal(looksBinary(Buffer.from(Array.from({ length: 200 }, (_, i) => (i % 5) + 1))), true);
  assert.equal(looksBinary(Buffer.from("const x = 1;\n// o‘zbekcha izoh — ✓\n\tindent\r\n", "utf8")), false);
});

test("dialogExtensions: CLI ro'yxatlaridan, .env yo'q", () => {
  const ex = dialogExtensions();
  assert.ok(ex.image.includes("png") && ex.image.includes("jpeg"));
  assert.ok(ex.text.includes("md") && ex.text.includes("py"));
  assert.equal(ex.text.includes("env"), false);
  assert.deepEqual(ex.pdf, ["pdf"]);
});

test("safeName: bidi/boshqaruv belgilari olib tashlanadi, ≤120", () => {
  assert.equal(safeName(`invoice\u202etxt.exe`), "invoice txt.exe");
  assert.equal(safeName("a".repeat(300)).length, 120);
  assert.equal(safeName(42), "");
});

// ---- Diskdan o'qish: yo'l tekshiruvi, tur, hajm --------------------------------------
const dir = mkdtempSync(join(tmpdir(), "sov-attach-"));
const p = (name) => join(dir, name);
writeFileSync(p("notes.md"), "# Sarlavha\nMatn — o‘zbekcha.\n");
writeFileSync(p("big.txt"), "x".repeat(LIMITS.fileTextChars + 5000));
writeFileSync(p("fake.txt"), Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]));
writeFileSync(p("app.exe"), Buffer.from([0x4d, 0x5a, 0x90, 0x00]));
writeFileSync(p("empty.txt"), "");
writeFileSync(p("shot.png"), PNG);
writeFileSync(p("renamed.jpg"), PNG); // kengaytma jpg, baytlar png — haqiqiy tur ishlatiladi
writeFileSync(p("notimage.png"), "just text pretending to be png");
writeFileSync(p("bad.pdf"), "not a pdf");
writeFileSync(p(".env"), "SECRET=1");
mkdirSync(p("folder.txt"));
mkdirSync(p(".ssh"));
writeFileSync(join(p(".ssh"), "key.txt"), "-----BEGIN KEY-----");
let symlinkOk = false;
try {
  symlinkSync(join(p(".ssh"), "key.txt"), p("innocent.txt"));
  symlinkOk = true;
} catch {
  /* Windows'da symlink uchun huquq kerak bo'lishi mumkin — test o'tkazib yuboriladi */
}

test("checkPickedPath: yo'q / papka / UNC / NUL — rad", () => {
  assert.equal(checkPickedPath(p("nope.txt")).error, "not-found");
  assert.equal(checkPickedPath(p("folder.txt")).error, "not-file");
  assert.equal(checkPickedPath("\\\\server\\share\\a.txt").error, "unc");
  assert.equal(checkPickedPath("//server/share/a.txt").error, "unc");
  assert.equal(checkPickedPath("a\0b").error, "bad-path");
  assert.equal(checkPickedPath(42).error, "bad-path");
  assert.ok(checkPickedPath(p("notes.md")).real);
});

test("checkPickedPath: himoyalangan joylar (.ssh, .env) — rad", () => {
  assert.equal(checkPickedPath(join(p(".ssh"), "key.txt")).error, "protected");
  assert.equal(checkPickedPath(p(".env")).error, "protected");
});

test("checkPickedPath: himoyalangan faylga symlink — rad", () => {
  if (!symlinkOk) return;
  assert.equal(checkPickedPath(p("innocent.txt")).error, "protected");
});

test("readPicked: matn fayli → store'ga ketadigan qism (tarkib renderer'ga chiqmaydi)", async () => {
  const r = await readPicked(p("notes.md"));
  assert.equal(r.item.kind, "file");
  assert.equal(r.item.sub, "text");
  assert.match(r.item.part.text, /^\[FAYL: notes\.md\]\n# Sarlavha/);
  const pub = publicItem("id1", r.item);
  assert.equal(pub.part, undefined);
  assert.equal(JSON.stringify(pub).includes("Sarlavha"), false);
});

test("readPicked: katta matn qisqartiriladi va server chegarasiga (40 000) sig'adi", async () => {
  const r = await readPicked(p("big.txt"));
  assert.equal(r.item.truncated, true);
  assert.ok(r.item.part.text.length <= 40_000);
});

test("readPicked: ikkilik / qo'llab-quvvatlanmaydigan / bo'sh / buzuq rasm / buzuq PDF — rad", async () => {
  assert.equal((await readPicked(p("fake.txt"))).error, "binary");
  assert.equal((await readPicked(p("app.exe"))).error, "unsupported");
  assert.equal((await readPicked(p("empty.txt"))).error, "empty");
  assert.equal((await readPicked(p("notimage.png"))).error, "bad-image");
  assert.equal((await readPicked(p("bad.pdf"))).error, "bad-pdf");
  assert.equal((await readPicked(p(".env"))).error, "protected");
  const e = await readPicked(p("app.exe"));
  assert.equal(e.name, "app.exe");
});

test("readPicked: rasm → sniff qilingan MIME bilan data URL", async () => {
  const a = await readPicked(p("shot.png"));
  assert.equal(a.item.kind, "image");
  assert.equal(a.item.mime, "image/png");
  assert.ok(parseImageDataUrl(a.item.dataUrl).ok);
  const b = await readPicked(p("renamed.jpg"));
  assert.equal(b.item.mime, "image/png");
  assert.ok(b.item.dataUrl.startsWith("data:image/png;base64,"));
});

// ---- Store va content massivi --------------------------------------------------------
test("AttachmentStore: qo'shish / olish / o'chirish, hajm chegaralangan", () => {
  const s = new AttachmentStore(3);
  const ids = [1, 2, 3, 4].map((i) => s.add({ kind: "file", i }));
  assert.equal(s.get(ids[0]), null); // eng eskisi chiqarib yuborildi
  assert.equal(s.get(ids[3]).i, 4);
  assert.equal(s.discard(ids[3]), true);
  assert.equal(s.get(ids[3]), null);
  assert.equal(s.get({}), null);
});

const fileEntry = (text, extra = {}) => ({ kind: "file", sub: "text", name: "a.js", size: text.length, chars: text.length, truncated: false, part: { type: "text", text }, ...extra });
const img = (extra = {}) => ({ kind: "image", name: "shot.png", dataUrl: url("image/png", PNG), thumb: url("image/jpeg", JPEG), ...extra });

test("buildUserContent: biriktirmasiz — oddiy satr (eski yo'l)", () => {
  assert.deepEqual(buildUserContent("salom", undefined, null), { content: "salom", meta: [], chars: 0 });
  assert.equal(buildUserContent("salom", [], null).content, "salom");
});

test("buildUserContent: [matn, ...qismlar] tartibda; meta'da tarkib yo'q", () => {
  const s = new AttachmentStore();
  const id = s.add(fileEntry("[FAYL: a.js]\nconsole.log(1)\n[/FAYL]"));
  const r = buildUserContent("Buni tushuntir", [{ kind: "file", id }, img()], s);
  assert.equal(r.content.length, 3);
  assert.deepEqual(r.content[0], { type: "text", text: "Buni tushuntir" });
  assert.equal(r.content[1].type, "text");
  assert.equal(r.content[2].type, "image_url");
  assert.deepEqual(r.meta.map((m) => m.kind), ["file", "image"]);
  assert.equal(r.meta[0].name, "a.js");
  assert.ok(r.meta[1].thumb);
  assert.equal(JSON.stringify(r.meta).includes("console.log"), false);
});

test("buildUserContent: server sxemasiga mos (≤12 qism, matn ≤40 000, faqat data:image)", () => {
  const s = new AttachmentStore();
  const list = [];
  for (let i = 0; i < LIMITS.maxAttachments - 1; i++) list.push({ kind: "file", id: s.add(fileEntry("y".repeat(LIMITS.fileTextChars + 100))) });
  list.push(img());
  const r = buildUserContent("x".repeat(40_000), list, s);
  assert.ok(!r.error, r.error);
  assert.ok(r.content.length <= 12);
  for (const part of r.content) {
    if (part.type === "text") assert.ok(part.text.length <= 40_000);
    else assert.match(part.image_url.url, /^data:image\/(png|jpe?g|gif|webp|bmp);base64,/i);
  }
});

test("buildUserContent: faqat rasm (matnsiz) — matn qismi yo'q", () => {
  const r = buildUserContent("   ", [img()], new AttachmentStore());
  assert.equal(r.content.length, 1);
  assert.equal(r.content[0].type, "image_url");
});

test("buildUserContent: soni, eskirgan id, buzuq rasm, jami hajm — xato kodlari", () => {
  const s = new AttachmentStore();
  const many = Array.from({ length: LIMITS.maxAttachments + 1 }, () => img());
  assert.equal(buildUserContent("a", many, s).error, "too-many");
  assert.equal(buildUserContent("a", [{ kind: "file", id: "nope" }], s).error, "expired");
  assert.equal(buildUserContent("a", [img({ dataUrl: url("image/jpeg", PNG) })], s).error, "bad-image");
  assert.equal(buildUserContent("a", [{ kind: "exe" }], s).error, "bad-request");
  assert.equal(buildUserContent("a", "nope", s).error, "bad-request");
  const huge = url("image/png", Buffer.concat([PNG, Buffer.alloc(560_000)]));
  assert.equal(buildUserContent("a", [img({ dataUrl: huge }), img({ dataUrl: huge })], s).error, "too-large-total");
  const tooBig = url("image/png", Buffer.concat([PNG, Buffer.alloc(700_000)]));
  assert.equal(buildUserContent("a", [img({ dataUrl: tooBig })], s).error, "too-large");
});

test("buildUserContent: yaroqsiz thumb meta'ga tushmaydi", () => {
  const r = buildUserContent("a", [img({ thumb: url("image/gif", GIF) })], new AttachmentStore());
  assert.equal(r.meta[0].thumb, undefined);
});

test("textOf / appendText: satr va massiv", () => {
  assert.equal(textOf("abc"), "abc");
  assert.equal(textOf([{ type: "text", text: "a" }, { type: "image_url", image_url: { url: "x" } }, { type: "text", text: "b" }]), "a\n\nb");
  assert.equal(textOf(null), "");
  assert.equal(appendText("savol", "Aniqlashtirish:"), "savol\n\nAniqlashtirish:");
  const arr = [{ type: "text", text: "savol" }, { type: "image_url", image_url: { url: "u" } }];
  const out = appendText(arr, "blok");
  assert.equal(out[0].text, "savol\n\nblok");
  assert.equal(arr[0].text, "savol"); // asl massiv o'zgarmaydi
  const imgOnly = appendText([{ type: "image_url", image_url: { url: "u" } }], "blok");
  assert.deepEqual(imgOnly[0], { type: "text", text: "blok" });
});

// ---- Serverga/mahalliy modelga yuborish ------------------------------------------------
const imgMsg = (len, text = "q") => ({ role: "user", content: [{ type: "text", text }, { type: "image_url", image_url: { url: `data:image/png;base64,${"A".repeat(len)}` } }] });

test("budgetImages: eng yangi rasmlar saqlanadi, eskilari belgi bilan; asl massiv o'zgarmaydi", () => {
  const msgs = [{ role: "system", content: "s" }, imgMsg(600_000, "old"), { role: "assistant", content: "ok" }, imgMsg(600_000, "new")];
  const out = budgetImages(msgs, 1_000_000);
  assert.equal(out[3].content[1].type, "image_url");
  assert.deepEqual(out[1].content[1], { type: "text", text: IMAGE_PLACEHOLDER });
  assert.equal(msgs[1].content[1].type, "image_url");
  assert.equal(budgetImages([{ role: "user", content: "a" }], 10)[0].content, "a");
  const same = [imgMsg(10)];
  assert.equal(budgetImages(same, 1000), same); // o'zgarish yo'q — o'sha massiv
});

test("stripImages: vision'siz model — rasmlar belgi, massivlar satrga", () => {
  const { messages, dropped } = stripImages([{ role: "system", content: "s" }, imgMsg(10, "nima bu?")]);
  assert.equal(dropped, 1);
  assert.equal(typeof messages[1].content, "string");
  assert.ok(messages[1].content.startsWith("nima bu?"));
  assert.ok(messages[1].content.includes(IMAGE_NO_VISION));
  assert.equal(imagesInLastUser([imgMsg(1), { role: "assistant", content: "x" }]), 1);
  assert.equal(imagesInLastUser([imgMsg(1), { role: "user", content: "matn" }]), 0);
});

// ---- Tarix serializatsiyasi -------------------------------------------------------------
const cut = (s) => (s.length > 100 ? s.slice(0, 100) + "…" : s);

test("persistableContent: rasm base64 diskka yozilmaydi, matn qismlari kesiladi", () => {
  const out = persistableContent([{ type: "text", text: "a".repeat(500) }, { type: "image_url", image_url: { url: `data:image/png;base64,${"A".repeat(50_000)}` } }], cut, 1000);
  assert.equal(out.length, 2);
  assert.equal(out[0].text.length, 101);
  assert.deepEqual(out[1], { type: "text", text: IMAGE_HISTORY_PLACEHOLDER });
  assert.ok(JSON.stringify(out).length < 1000);
  assert.equal(persistableContent("x".repeat(300), cut), "x".repeat(100) + "…");
  assert.equal(persistableContent(null, cut), null);
});

test("persistableContent: xabar bo'yicha jami matn chegarasi", () => {
  const parts = Array.from({ length: 10 }, () => ({ type: "text", text: "b".repeat(90) }));
  const out = persistableContent(parts, cut, 200);
  assert.ok(out.reduce((s, x) => s + x.text.length, 0) <= 200);
});

test("sanitizeMeta / boundThumbs: tarixda faqat eng yangi thumb'lar qoladi", () => {
  const thumb = url("image/jpeg", JPEG);
  const ev = (name) => ({ type: "user", text: "", attachments: [{ kind: "image", name, size: 10, thumb }, { kind: "file", name: "a.md", size: 5, sub: "text", part: "SECRET" }] });
  const events = [ev("1"), { type: "text", text: "x" }, ev("2"), ev("3")];
  const out = boundThumbs(events, 2);
  assert.equal(out[0].attachments[0].thumb, undefined);
  assert.ok(out[2].attachments[0].thumb);
  assert.ok(out[3].attachments[0].thumb);
  assert.equal(JSON.stringify(out).includes("SECRET"), false);
  assert.deepEqual(sanitizeMeta([{ kind: "image", name: "x", thumb: "javascript:alert(1)" }]), [{ kind: "image", name: "x", size: 0 }]);
  assert.equal(sanitizeMeta("x").length, 0);
});

// ---- Renderer: chegaralar, yuk, reducer (tarixdan tiklash) --------------------------------
test("renderer ATTACH_LIMITS main LIMITS bilan bir xil", () => {
  for (const k of Object.keys(ATTACH_LIMITS)) assert.equal(ATTACH_LIMITS[k], LIMITS[k], k);
  assert.ok(LIMITS.maxAttachments + 1 <= 12); // + matn qismi ≤ server 12 qism
  assert.ok(LIMITS.fileTextChars + 200 <= 40_000);
  assert.ok(LIMITS.totalChars < LIMITS.requestChars && LIMITS.requestChars < 1_500_000);
});

test("renderer checkAdd/checkSend/toSendPayload", () => {
  const ready = { key: "a", kind: "image", name: "s.png", dataUrl: "data:image/png;base64,AAAA", thumb: "t", status: "ready" };
  const file = { key: "b", kind: "file", id: "F1", name: "a.md", chars: 100, status: "ready" };
  assert.equal(checkAdd([ready], ATTACH_LIMITS.maxAttachments), "too-many");
  assert.equal(checkAdd([ready], 1), null);
  assert.equal(checkSend([ready, file]), null);
  assert.equal(checkSend([{ ...ready, status: "processing" }]), "processing");
  assert.equal(checkSend([{ ...file, chars: ATTACH_LIMITS.totalChars + 1 }]), "too-large-total");
  assert.equal(totalChars([ready, file]), ready.dataUrl.length + 100);
  assert.deepEqual(toSendPayload([ready, file]), [{ kind: "image", name: "s.png", dataUrl: ready.dataUrl, thumb: "t" }, { kind: "file", id: "F1" }]);
});

test("renderer: har bir xato kodi uchun 4 tilda matn bor", () => {
  const codes = ["unsupported", "too-large", "protected", "not-found", "not-file", "binary", "bad-image", "bad-pdf", "pdf-unavailable", "pdf-empty", "empty", "unc", "too-many", "too-large-total", "expired", "processing", "io", "whatever"];
  for (const c of codes) {
    const key = attachErrKey(c);
    for (const lang of ["uz", "en", "ru"]) assert.ok(KEYS[lang][key], `${lang}: ${key}`);
  }
  assert.equal(attachErrKey("whatever"), "attach.err.io");
  assert.deepEqual(sizeParts(512), { key: "attach.bytes", n: "512" });
  assert.deepEqual(sizeParts(2048), { key: "attach.kb", n: "2" });
  assert.deepEqual(sizeParts(3 * 1024 * 1024), { key: "attach.mb", n: "3.0" });
});

test("reducer: user hodisasidagi biriktirmalar xavfsiz shaklda; tarixdan tiklanadi", () => {
  const thumb = url("image/jpeg", JPEG);
  const ev = { type: "user", text: "", mode: "chat", attachments: [{ kind: "image", name: "a\u202e.png", size: 100, thumb }, { kind: "file", sub: "pdf", name: "spec.pdf", size: 9, truncated: true }, { kind: "image", name: "evil", thumb: "data:image/svg+xml;base64,PHN2Zz4=" }] };
  const live = applyEvent({ ...initialAgent }, ev);
  const it = live.items[0];
  assert.equal(it.kind, "user");
  assert.equal(it.attachments.length, 3);
  assert.equal(it.attachments[0].thumb, thumb);
  assert.equal(it.attachments[0].name, "a .png");
  assert.equal(it.attachments[1].sub, "pdf");
  assert.equal(it.attachments[2].thumb, undefined);
  const restored = replayEvents([ev, { type: "text", text: "javob" }, { type: "notice", code: "localNoVision", model: "llama3.2:3b", n: 2 }, { type: "notice", code: "unknown" }]);
  assert.equal(restored.items[0].attachments.length, 3);
  assert.equal(restored.items[2].kind, "notice");
  assert.equal(restored.items[2].n, 2);
  assert.equal(restored.items.length, 3); // noma'lum notice — e'tiborsiz
  assert.deepEqual(sanitizeAttachments(null), []);
  const plain = applyEvent({ ...initialAgent }, { type: "user", text: "salom", mode: "code" });
  assert.equal(plain.items[0].attachments, undefined);
});

await Promise.all(pending);
rmSync(dir, { recursive: true, force: true });
console.log(`\n${n} ta test o'tdi`);
