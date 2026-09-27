// Muharrir fayl amallari testlari (Electron'siz): node scripts/test-files.mjs
//
// Elektron `shell` va IPC `handle` soxta (fake) — modul o'zi Electron'ni import
// qilmaydi. Yo'l tekshiruvi CLI'dagi haqiqiy resolvePath/isProtected bilan.

import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync, statSync, symlinkSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { tmpdir, homedir } from "node:os";
import { resolvePath, isProtected } from "../../cli/src/tools.mjs";
import {
  registerFilesIpc,
  validateName,
  parseTegma,
  globToRegExp,
  matchesTegma,
  looksBinary,
  maxLineLength,
  detectEol,
  hasFinalNewline,
  applyEol,
  isStale,
  atomicWrite,
  uniqueName,
  isEnvFile,
  buildTree,
  EDIT_MAX_BYTES,
} from "../electron/files-ipc.mjs";

let n = 0;
const fails = [];
const test = async (name, fn) => {
  try {
    await fn();
    n++;
    console.log(`✓ ${name}`);
  } catch (e) {
    fails.push(name);
    console.log(`✕ ${name}\n    ${e?.message ?? e}`);
  }
};

// ---- Vaqtinchalik ish papkasi ---------------------------------------------
const root = mkdtempSync(join(tmpdir(), "sov-files-"));
const ws = join(root, "proj");
mkdirSync(join(ws, "src"), { recursive: true });
mkdirSync(join(ws, "node_modules", "pkg"), { recursive: true });
mkdirSync(join(ws, ".git"), { recursive: true });
mkdirSync(join(ws, "migrations"), { recursive: true });
writeFileSync(join(ws, "src", "a.js"), "const a = 1;\nconst b = 2;\n");
writeFileSync(join(ws, "src", "crlf.txt"), "bir\r\nikki\r\nuch\r\n");
writeFileSync(join(ws, "src", "nonl.txt"), "oxirida yangi qator yo'q");
writeFileSync(join(ws, "note.md"), "# Salom\n");
writeFileSync(join(ws, ".env"), "SECRET=1\n");
writeFileSync(join(ws, ".env.example"), "SECRET=\n");
writeFileSync(join(ws, "node_modules", "pkg", "index.js"), "module.exports = 1;\n");
writeFileSync(join(ws, "migrations", "001.sql"), "select 1;\n");
writeFileSync(join(ws, "bin.dat"), Buffer.from([0x00, 0x01, 0x02, 0x03, 0x00, 0xff]));
writeFileSync(join(ws, "SOVEREIGN.md"), ["# Test", "", "## Tegma", "- `migrations/**`", "- src/generated.ts", "- (izoh: bu band yo'l emas)", "", "## Qoidalar", "- `README.md` bu yerda emas", ""].join("\n"));
// Ish papkasidan tashqaridagi qo'shni papka (symlink orqali qochish testi uchun).
const outside = join(root, "outside");
mkdirSync(outside, { recursive: true });
writeFileSync(join(outside, "secret.txt"), "sir\n");

// ---- IPC ro'yxati (soxta handle / shell) -----------------------------------
const chans = new Map();
const trashed = [];
const revealed = [];
const events = [];
const api = registerFilesIpc({
  handle: (ch, fn) => chans.set(ch, fn),
  getWorkspace: () => ws,
  resolvePath,
  isProtected,
  backups: { add: (real) => `backup:${real}` },
  shell: { trashItem: async (p) => { trashed.push(p); rmSync(p, { recursive: true, force: true }); }, showItemInFolder: (p) => revealed.push(p) },
  send: (type, payload) => events.push({ type, ...payload }),
});
api.stopWatch();
const call = (ch, arg) => chans.get(ch)(null, arg);

// ---- 1. Nom tekshiruvi -----------------------------------------------------
await test("nom: oddiy nomlar o'tadi", () => {
  for (const ok of ["a.js", "README.md", ".gitignore", "bir ikki.txt", "über.ts", "файл.py"]) assert.equal(validateName(ok), null, ok);
});
await test("nom: yo'l ajratgichi, .. va boshqaruv belgilari rad", () => {
  assert.equal(validateName("a/b.js"), "bad-name");
  assert.equal(validateName("a\\b.js"), "bad-name");
  assert.equal(validateName(".."), "bad-name");
  assert.equal(validateName("."), "bad-name");
  assert.equal(validateName("a\u0000b"), "bad-name");
  assert.equal(validateName("a\nb"), "bad-name");
  assert.equal(validateName("a\u001fb"), "bad-name");
});
await test("nom: Windows taqiqlagan belgilar, oxirgi nuqta/bo'shliq", () => {
  for (const bad of ['a<b', "a>b", "a:b", 'a"b', "a|b", "a?b", "a*b", "a.", "a ", "  a"]) assert.equal(validateName(bad), "bad-name", bad);
});
await test("nom: band nomlar (CON, PRN, AUX, NUL, COM1-9, LPT1-9)", () => {
  for (const bad of ["CON", "con", "PRN.txt", "aux", "NUL", "COM1", "com9.js", "LPT3", "lpt1.md"]) assert.equal(validateName(bad), "reserved", bad);
  assert.equal(validateName("console.js"), null); // "con" bilan boshlanadi, lekin band emas
  assert.equal(validateName("COM10"), null); // faqat COM1–COM9
});
await test("nom: bo'sh va juda uzun", () => {
  assert.equal(validateName(""), "empty");
  assert.equal(validateName("   "), "empty");
  assert.equal(validateName("a".repeat(256)), "too-long");
  assert.equal(validateName(null), "bad-name");
});

// ---- 2. Yo'l tekshiruvi ----------------------------------------------------
await test("yo'l: ish papkasi ichidagi fayl o'tadi", () => {
  const r = api.check("src/a.js");
  assert.equal(r.error, undefined);
  assert.equal(r.rel, "src/a.js");
});
await test("yo'l: .. bilan chiqish rad etiladi", () => {
  assert.equal(api.check("../outside/secret.txt").error, "outside");
  assert.equal(api.check("src/../../outside/secret.txt").error, "outside");
  assert.equal(api.check(join(outside, "secret.txt")).error, "outside");
});
await test("yo'l: UNC va nol bayt rad etiladi", () => {
  assert.equal(api.check("\\\\server\\share\\x").error, "unc");
  assert.equal(api.check("//server/share/x").error, "unc");
  assert.equal(api.check("a\u0000b").error, "bad-path");
  assert.equal(api.check("").error, "bad-path");
  assert.equal(api.check("x".repeat(5000)).error, "bad-path");
});
await test("yo'l: symlink orqali qochish realpath bilan aniqlanadi", () => {
  const link = join(ws, "escape");
  try {
    symlinkSync(outside, link, "junction");
  } catch {
    console.log("    (symlink yaratilmadi — o'tkazib yuborildi)");
    return;
  }
  assert.equal(api.check("escape/secret.txt").error, "outside");
  assert.equal(api.check("escape/yangi.txt", { write: true }).error, "outside");
  rmSync(link, { recursive: true, force: true });
});
await test("yo'l: himoyalangan joylar (.ssh, ~/.sovereign, .git yozish) rad", () => {
  // Uy papkasidagi sirlar — ish papkasi ichida bo'lmasa ham tekshiriladi.
  assert.equal(isProtected(join(homedir(), ".ssh", "id_rsa"), { write: false }), true);
  assert.equal(isProtected(join(homedir(), ".sovereign", "config.json"), { write: false }), true);
  assert.equal(isProtected(join(ws, ".git", "config"), { write: true }), true);
  assert.equal(api.check(".git/config", { write: true }).error, "protected");
});
await test("yo'l: .env sir — ochilmaydi, .env.example mumkin", () => {
  assert.equal(isEnvFile(".env"), true);
  assert.equal(isEnvFile("x/.env.local"), true);
  assert.equal(isEnvFile(".env.example"), false);
  assert.equal(api.check(".env").error, "protected");
  assert.equal(api.check(".env.local", { write: true }).error, "protected");
  assert.equal(api.check(".env.example").error, undefined);
});
await test("yo'l: ish papkasi tanlanmagan bo'lsa — no-folder", () => {
  const chans2 = new Map();
  const a2 = registerFilesIpc({ handle: (c, f) => chans2.set(c, f), getWorkspace: () => null, resolvePath, isProtected, backups: {}, shell: {}, send: () => {} });
  a2.stopWatch();
  assert.equal(a2.check("src/a.js").error, "no-folder");
});

// ---- 3. «Tegma» ------------------------------------------------------------
await test("tegma: SOVEREIGN.md dan glob'lar ajratiladi", () => {
  const globs = parseTegma(readFileSync(join(ws, "SOVEREIGN.md"), "utf8"));
  assert.deepEqual(globs, ["migrations/**", "src/generated.ts"]);
});
await test("tegma: izoh/qavsli band va boshqa bo'lim olinmaydi", () => {
  const globs = parseTegma(["## Tegma", "- (o'zgartirilmasligi kerak bo'lgan fayl va papkalar)", "- bu uzun izoh, yo'l emas", "## Qoidalar", "- `src/**`"].join("\n"));
  assert.deepEqual(globs, []);
});
await test("tegma: glob moslashuvi (**, *, papka ichi)", () => {
  assert.equal(globToRegExp("migrations/**").test("migrations/001.sql"), true);
  assert.equal(globToRegExp("migrations/**").test("src/a.js"), false);
  assert.equal(globToRegExp("src/*.ts").test("src/a.ts"), true);
  assert.equal(globToRegExp("src/*.ts").test("src/deep/a.ts"), false);
  assert.equal(globToRegExp("gen").test("gen/inner/x.js"), true); // papka nomi → ichidagi hamma narsa
  assert.equal(matchesTegma(["migrations/**"], "migrations\\001.sql"), true);
});
await test("tegma: himoyalangan yo'l tasdiqsiz rad, tasdiq bilan o'tadi", () => {
  assert.equal(api.check("migrations/001.sql", { write: true }).error, "tegma");
  assert.equal(api.check("migrations/001.sql", { write: true, allowTegma: true }).error, undefined);
  assert.equal(api.check("migrations/001.sql", { write: true, allowTegma: true }).tegma, true);
});

// ---- 4. Qator oxiri, oxirgi yangi qator, atomar yozish ---------------------
await test("qator oxiri aniqlanadi", () => {
  assert.equal(detectEol("a\r\nb\r\n"), "crlf");
  assert.equal(detectEol("a\nb\n"), "lf");
  assert.equal(detectEol("a\r\nb\nc\r\n"), "crlf"); // ko'pchilik CRLF
  assert.equal(detectEol("bitta qator"), "lf");
  assert.equal(hasFinalNewline("a\n"), true);
  assert.equal(hasFinalNewline("a"), false);
});
await test("applyEol: uslub saqlanadi", () => {
  assert.equal(applyEol("a\nb", "crlf", true), "a\r\nb\r\n");
  assert.equal(applyEol("a\r\nb\r\n", "lf", true), "a\nb\n");
  assert.equal(applyEol("a\nb\n", "lf", false), "a\nb");
  assert.equal(applyEol("a\nb\n\n\n", "lf", false), "a\nb");
  assert.equal(applyEol("a\nb", "lf", true), "a\nb\n");
});
await test("atomik yozish: vaqtinchalik fayl qolmaydi", () => {
  const p = join(ws, "src", "atom.txt");
  atomicWrite(p, Buffer.from("birinchi\n"));
  atomicWrite(p, Buffer.from("ikkinchi\n"));
  assert.equal(readFileSync(p, "utf8"), "ikkinchi\n");
  assert.equal(readdirSync(join(ws, "src")).some((f) => f.endsWith(".sovtmp")), false);
  rmSync(p);
});
await test("uniqueName: band nom uchun « (2)»", () => {
  const taken = new Set([join(ws, "a.js"), join(ws, "a (2).js")]);
  assert.equal(uniqueName(ws, "a.js", (p) => taken.has(p)), "a (3).js");
  assert.equal(uniqueName(ws, "yangi.js", () => false), "yangi.js");
});

// ---- 5. Eskirgan fayl (stale) ---------------------------------------------
await test("stale: mtime yoki hajm o'zgarsa — true", () => {
  assert.equal(isStale({ size: 10, mtimeMs: 100 }, { size: 10, mtimeMs: 100 }), false);
  assert.equal(isStale({ size: 11, mtimeMs: 100 }, { size: 10, mtimeMs: 100 }), true);
  assert.equal(isStale({ size: 10, mtimeMs: 500 }, { size: 10, mtimeMs: 100 }), true);
  assert.equal(isStale(null, { size: 10, mtimeMs: 100 }), true); // fayl yo'qolgan
  assert.equal(isStale({ size: 10, mtimeMs: 100 }, null), false); // kutilgan holat berilmagan
});

// ---- 6. Katta fayl va ikkilik fayl -----------------------------------------
await test("ikkilik fayl aniqlanadi (NUL / boshqaruv belgilari)", () => {
  assert.equal(looksBinary(Buffer.from("oddiy matn\n")), false);
  assert.equal(looksBinary(Buffer.from([0x41, 0x00, 0x42])), true);
  assert.equal(looksBinary(Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 14, 15])), true);
  assert.equal(looksBinary(Buffer.alloc(0)), false);
  assert.equal(looksBinary(Buffer.from("emoji: 🎉 va o‘zbekcha\n")), false);
});
await test("eng uzun qator o'lchanadi", () => {
  assert.equal(maxLineLength("abc\nde\n"), 3);
  assert.equal(maxLineLength("abcdef"), 6);
  assert.equal(maxLineLength(""), 0);
});

// ---- 7. IPC: fs:open -------------------------------------------------------
await test("fs:open — matn fayli, qator oxiri va til", async () => {
  const r = await call("fs:open", { path: "src/a.js" });
  assert.equal(r.kind, "text");
  assert.equal(r.content, "const a = 1;\nconst b = 2;\n");
  assert.equal(r.eol, "lf");
  assert.equal(r.finalNewline, true);
  assert.equal(r.readOnly, false);
  assert.equal(r.rel, "src/a.js");
});
await test("fs:open — CRLF fayl «\\n» ga keltiriladi, uslub eslab qolinadi", async () => {
  const r = await call("fs:open", { path: "src/crlf.txt" });
  assert.equal(r.eol, "crlf");
  assert.equal(r.content, "bir\nikki\nuch\n");
});
await test("fs:open — ikkilik fayl", async () => {
  const r = await call("fs:open", { path: "bin.dat" });
  assert.equal(r.kind, "binary");
  assert.equal(r.readOnly, true);
});
await test("fs:open — rasm data: URL bilan, faqat o'qish", async () => {
  // 1x1 shaffof PNG.
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  writeFileSync(join(ws, "dot.png"), png);
  const r = await call("fs:open", { path: "dot.png" });
  assert.equal(r.kind, "image");
  assert.equal(r.readOnly, true);
  assert.ok(r.dataUrl.startsWith("data:image/png;base64,"));
});
await test("fs:open — katta fayl faqat o'qish uchun ochiladi", async () => {
  const big = join(ws, "big.txt");
  writeFileSync(big, "x".repeat(10) + "\n".repeat(EDIT_MAX_BYTES));
  const r = await call("fs:open", { path: "big.txt" });
  assert.equal(r.kind, "text");
  assert.equal(r.tooLarge, true);
  assert.equal(r.readOnly, true);
  rmSync(big);
});
await test("fs:open — juda uzun qator faqat o'qish uchun", async () => {
  const p = join(ws, "long.txt");
  writeFileSync(p, `${"a".repeat(6000)}\n`);
  const r = await call("fs:open", { path: "long.txt" });
  assert.equal(r.longLines, true);
  assert.equal(r.readOnly, true);
  rmSync(p);
});
await test("fs:open — «Tegma» fayli tahrirlanadi, lekin belgilanadi", async () => {
  const r = await call("fs:open", { path: "migrations/001.sql" });
  assert.equal(r.kind, "text");
  assert.equal(r.tegma, true);
  assert.equal(r.readOnly, false); // saqlashda tasdiq so'raladi
});
await test("fs:open — .env va tashqi yo'l rad etiladi", async () => {
  assert.equal((await call("fs:open", { path: ".env" })).error, "protected");
  assert.equal((await call("fs:open", { path: "../outside/secret.txt" })).error, "outside");
  assert.equal((await call("fs:open", { path: "src" })).error, "is-dir");
  assert.equal((await call("fs:open", { path: "yo-q.txt" })).error, "not-found");
});

// ---- 8. IPC: fs:write ------------------------------------------------------
await test("fs:write — saqlaydi, qator oxirini saqlaydi, zaxira id qaytaradi", async () => {
  const before = await call("fs:open", { path: "src/crlf.txt" });
  const r = await call("fs:write", {
    path: "src/crlf.txt",
    content: "bir\nikki\nuch\nto'rt\n",
    eol: before.eol,
    finalNewline: before.finalNewline,
    expect: { mtimeMs: before.mtimeMs, size: before.size },
  });
  assert.equal(r.ok, true);
  assert.equal(readFileSync(join(ws, "src", "crlf.txt"), "utf8"), "bir\r\nikki\r\nuch\r\nto'rt\r\n");
  assert.ok(String(r.backupId).startsWith("backup:"));
});
await test("fs:write — oxirgi yangi qatorsiz fayl shunday qoladi", async () => {
  const before = await call("fs:open", { path: "src/nonl.txt" });
  assert.equal(before.finalNewline, false);
  await call("fs:write", { path: "src/nonl.txt", content: "yangi matn\n", eol: before.eol, finalNewline: before.finalNewline, expect: { mtimeMs: before.mtimeMs, size: before.size } });
  assert.equal(readFileSync(join(ws, "src", "nonl.txt"), "utf8"), "yangi matn");
});
await test("fs:write — fayl diskda o'zgargan bo'lsa rad (stale), force bilan yoziladi", async () => {
  const before = await call("fs:open", { path: "note.md" });
  writeFileSync(join(ws, "note.md"), "# Boshqa birov yozdi\n");
  utimesSync(join(ws, "note.md"), new Date(), new Date(Date.now() + 5000));
  const stale = await call("fs:write", { path: "note.md", content: "# Meniki\n", eol: "lf", finalNewline: true, expect: { mtimeMs: before.mtimeMs, size: before.size } });
  assert.equal(stale.error, "stale");
  assert.equal(readFileSync(join(ws, "note.md"), "utf8"), "# Boshqa birov yozdi\n");
  const forced = await call("fs:write", { path: "note.md", content: "# Meniki\n", eol: "lf", finalNewline: true, expect: { mtimeMs: before.mtimeMs, size: before.size }, force: true });
  assert.equal(forced.ok, true);
  assert.equal(readFileSync(join(ws, "note.md"), "utf8"), "# Meniki\n");
});
await test("fs:write — noto'g'ri yuk (payload) rad etiladi", async () => {
  assert.equal((await call("fs:write", { path: "src/a.js", content: 42 })).error, "bad-path");
  assert.equal((await call("fs:write", { path: "src/a.js", content: "x", eol: "cr" })).error, "bad-path");
  assert.equal((await call("fs:write", {})).error, "bad-path");
  assert.equal((await call("fs:write", { path: "../outside/x.txt", content: "x" })).error, "outside");
  assert.equal((await call("fs:write", { path: ".env", content: "x" })).error, "protected");
  assert.equal((await call("fs:write", { path: "src", content: "x" })).error, "is-dir");
});
await test("fs:write — «Tegma» yo'li tasdiqsiz rad, confirmTegma bilan yoziladi", async () => {
  assert.equal((await call("fs:write", { path: "migrations/001.sql", content: "select 2;\n" })).error, "tegma");
  const ok = await call("fs:write", { path: "migrations/001.sql", content: "select 2;\n", eol: "lf", finalNewline: true, confirmTegma: true });
  assert.equal(ok.ok, true);
});

// ---- 9. IPC: yaratish / nom / nusxa / savat --------------------------------
await test("fs:create — fayl va papka; nom tekshiriladi", async () => {
  assert.equal((await call("fs:create", { dir: "src", name: "yangi.js", kind: "file" })).ok, true);
  assert.equal(existsSync(join(ws, "src", "yangi.js")), true);
  assert.equal((await call("fs:create", { dir: "src", name: "papka", kind: "folder" })).ok, true);
  assert.equal(statSync(join(ws, "src", "papka")).isDirectory(), true);
  assert.equal((await call("fs:create", { dir: "src", name: "yangi.js", kind: "file" })).error, "exists");
  assert.equal((await call("fs:create", { dir: "src", name: "a/b.js", kind: "file" })).error, "bad-name");
  assert.equal((await call("fs:create", { dir: "src", name: "..", kind: "file" })).error, "bad-name");
  assert.equal((await call("fs:create", { dir: "src", name: "NUL", kind: "file" })).error, "reserved");
  assert.equal((await call("fs:create", { dir: "../outside", name: "x.txt", kind: "file" })).error, "outside");
  assert.equal((await call("fs:create", { dir: "src/a.js", name: "x.txt", kind: "file" })).error, "not-dir");
});
await test("fs:rename — yangi nom, band nom rad", async () => {
  const r = await call("fs:rename", { path: "src/yangi.js", name: "eski.js" });
  assert.equal(r.ok, true);
  assert.equal(existsSync(join(ws, "src", "eski.js")), true);
  assert.equal((await call("fs:rename", { path: "src/eski.js", name: "a.js" })).error, "exists");
  assert.equal((await call("fs:rename", { path: "src/eski.js", name: "../qochdi.js" })).error, "bad-name");
  assert.equal((await call("fs:rename", { path: "src/eski.js", name: "COM1" })).error, "reserved");
});
await test("fs:duplicate — nusxa « (2)» bilan", async () => {
  const r = await call("fs:duplicate", { path: "src/a.js" });
  assert.equal(r.ok, true);
  assert.equal(existsSync(join(ws, "src", "a (2).js")), true);
  assert.equal(readFileSync(join(ws, "src", "a (2).js"), "utf8"), "const a = 1;\nconst b = 2;\n");
  assert.equal((await call("fs:duplicate", { path: "src" })).error, "is-dir");
});
await test("fs:trash — OS savatiga; ish papkasining o'zi rad", async () => {
  const r = await call("fs:trash", { path: "src/a (2).js" });
  assert.equal(r.ok, true);
  assert.equal(trashed.length, 1);
  assert.equal((await call("fs:trash", { path: "." })).error, "outside");
  assert.equal((await call("fs:trash", { path: "yo-q.txt" })).error, "not-found");
  assert.equal((await call("fs:trash", { path: ".env" })).error, "protected");
});
await test("fs:reveal-item — faqat ichkaridagi mavjud yo'l", async () => {
  assert.equal((await call("fs:reveal-item", { path: "src/a.js" })).ok, true);
  assert.equal(revealed.length, 1);
  assert.equal((await call("fs:reveal-item", { path: "../outside/secret.txt" })).error, "outside");
});
await test("fs:stat — hajm va mtime", async () => {
  const r = await call("fs:stat", { path: "src/a.js" });
  assert.equal(r.ok, true);
  assert.equal(r.size, statSync(join(ws, "src", "a.js")).size);
  assert.equal((await call("fs:stat", { path: "yo-q.txt" })).error, "not-found");
});

// ---- 10. Daraxt -------------------------------------------------------------
await test("daraxt: papkalar oldinda, node_modules/.git va yashirin fayllar yo'q", () => {
  const nodes = buildTree(ws);
  const names = nodes.map((x) => x.name);
  assert.equal(names.includes("node_modules"), false);
  assert.equal(names.includes(".git"), false);
  assert.equal(names.includes(".env"), false);
  assert.equal(names.includes(".env.example"), true); // ataylab ko'rsatiladi
  assert.equal(names.includes("SOVEREIGN.md"), true);
  // Papkalar birinchi.
  const firstFile = nodes.findIndex((x) => !x.dir);
  assert.equal(nodes.slice(0, firstFile).every((x) => x.dir), true);
  const src = nodes.find((x) => x.name === "src");
  assert.equal(src.dir, true);
  assert.equal(src.children.some((c) => c.name === "a.js"), true);
});
await test("daraxt: chuqurlik chegarasi", () => {
  mkdirSync(join(ws, "src", "d1", "d2", "d3"), { recursive: true });
  writeFileSync(join(ws, "src", "d1", "d2", "d3", "deep.txt"), "x");
  const shallow = buildTree(ws, 0, 1);
  const src = shallow.find((x) => x.name === "src");
  const d1 = src.children.find((x) => x.name === "d1");
  assert.deepEqual(d1.children, []); // max=1 → d1 ichi ochilmaydi
});

// ---- Tozalash ---------------------------------------------------------------
rmSync(root, { recursive: true, force: true });

console.log(`\n${n} test o'tdi${fails.length ? `, ${fails.length} yiqildi` : ""}`);
if (fails.length) process.exit(1);
