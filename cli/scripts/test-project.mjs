// Deterministik test: loyiha xotirasi (SOVEREIGN.md) — o'qish, Remember, yangilash, Cowork IPC,
// qoidalarni tahlil qilish, "Tegma" himoyasi va kod yozilgandan keyingi qoidalar tekshiruvi.
// Tarmoqsiz, faqat vaqtinchalik papkada. Ishga tushirish: node cli/scripts/test-project.mjs
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  addProjectNote,
  createProjectFile,
  projectInfo,
  projectMemoryMessage,
  projectTemplate,
  readProjectMemory,
  refreshProjectMessage,
} from "../src/project-memory.mjs";
import { registerProjectIpc } from "../../desktop/electron/project.mjs";
import {
  parseProjectRules,
  protectMatch,
  protectHitForCommand,
  protectHitForPath,
  projectCheckStatus,
  projectClaimIssue,
  projectJudgeLines,
} from "../src/project-rules.mjs";
import { runTool, toolStatus, projectCheckNudge, isProjectCodeFile } from "../src/tools.mjs";
import { agentTurn } from "../src/agent.mjs";

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

const origCwd = process.cwd();
const tmp = realpathSync.native(mkdtempSync(join(tmpdir(), "sov-proj-")));
let n = 0;
/** Yangi bo'sh ish papkasi (har test alohida). */
function freshWs(files = {}) {
  const ws = join(tmp, `ws${++n}`);
  mkdirSync(join(ws, ".git"), { recursive: true }); // git ildizi — qidiruv shu yerda to'xtaydi
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(join(ws, rel, ".."), { recursive: true });
    writeFileSync(join(ws, rel), text);
  }
  return ws;
}
const MARK = "LOYIHA QOIDALARI VA XOTIRASI (SOVEREIGN.md)";
const projMsgs = (messages) => messages.filter((m) => m.role === "system" && String(m.content).startsWith(MARK));

// ---- 1. Mavjud funksiya: o'qish / Remember / yangilash / IPC ------------------
await test("projectInfo: fayl yo'q → exists:false; create shablon yaratadi va ustidan yozmaydi", () => {
  const ws = freshWs({ "package.json": JSON.stringify({ scripts: { test: "node t.js", build: "vite build" } }) });
  assert.equal(projectInfo(ws).exists, false);
  const r = createProjectFile(ws);
  assert.ok(r.ok && r.created);
  const text = readFileSync(join(ws, "SOVEREIGN.md"), "utf8");
  assert.match(text, /- Test: `npm test`/);
  assert.match(text, /- Build: `npm run build`/);
  assert.match(text, /- Lint: …/);
  const again = createProjectFile(ws);
  assert.ok(again.ok && !again.created, "ikkinchi marta yaratmaydi");
  const info = projectInfo(ws);
  assert.equal(info.exists, true);
  assert.ok(info.sections.includes("Tegma") && info.sections.includes("Eslatmalar"));
  assert.equal(info.notes, 0);
});

await test("Remember: eslatma Eslatmalar bo'limiga qo'shiladi, takror rad etiladi, sanoq oshadi", () => {
  const ws = freshWs();
  createProjectFile(ws);
  const r1 = addProjectNote("  har doim   pnpm ishlat ", ws);
  assert.ok(r1.ok && !r1.created);
  const r2 = addProjectNote("Har doim pnpm ishlat", ws);
  assert.equal(r2.error, "duplicate");
  assert.ok(addProjectNote("migratsiyalarga tegma", ws).ok);
  const text = readFileSync(join(ws, "SOVEREIGN.md"), "utf8");
  const lines = text.split("\n");
  const h = lines.indexOf("## Eslatmalar");
  assert.ok(h > 0);
  assert.match(lines[h + 2], /^- \d{4}-\d{2}-\d{2}: har doim pnpm ishlat$/);
  assert.match(lines[h + 3], /^- \d{4}-\d{2}-\d{2}: migratsiyalarga tegma$/);
  assert.equal(projectInfo(ws).notes, 2);
  assert.equal(addProjectNote("   ", ws).error, "empty");
});

await test("Remember: fayl yo'q bo'lsa shablon bilan yaratadi; CRLF saqlanadi; bo'lim yo'q bo'lsa qo'shiladi", () => {
  const ws = freshWs();
  const r = addProjectNote("birinchi", ws);
  assert.ok(r.ok && r.created);
  const ws2 = freshWs({ "SOVEREIGN.md": "# X\r\n\r\n## Qoidalar\r\n- a\r\n" });
  assert.ok(addProjectNote("ikkinchi", ws2).ok);
  const t2 = readFileSync(join(ws2, "SOVEREIGN.md"), "utf8");
  assert.ok(t2.includes("\r\n## Eslatmalar\r\n\r\n- "), "CRLF va yangi bo'lim");
  assert.ok(!/[^\r]\n/.test(t2), "aralash qator oxiri yo'q");
});

await test("refreshProjectMessage: fayl o'zgarsa system xabari yangilanadi, suhbat saqlanadi, o'chsa olib tashlanadi", () => {
  const ws = freshWs({ "SOVEREIGN.md": "# A\n\n## Qoidalar\n- eski qoida\n" });
  const messages = [{ role: "system", content: "SYS" }, projectMemoryMessage(ws), { role: "user", content: "salom" }, { role: "assistant", content: "ok" }];
  assert.equal(projMsgs(messages).length, 1);
  writeFileSync(join(ws, "SOVEREIGN.md"), "# A\n\n## Qoidalar\n- yangi qoida\n");
  refreshProjectMessage(messages, ws);
  assert.equal(projMsgs(messages).length, 1);
  assert.match(projMsgs(messages)[0].content, /yangi qoida/);
  assert.doesNotMatch(projMsgs(messages)[0].content, /eski qoida/);
  assert.equal(messages.length, 4, "suhbat saqlanadi");
  rmSync(join(ws, "SOVEREIGN.md"));
  refreshProjectMessage(messages, ws);
  assert.equal(projMsgs(messages).length, 0);
  // Qayta paydo bo'lsa — system xabarlaridan keyin, suhbatdan oldin qo'shiladi.
  writeFileSync(join(ws, "SOVEREIGN.md"), "# A\n- x\n");
  refreshProjectMessage(messages, ws);
  assert.equal(messages[1].role, "system");
  assert.ok(messages[1].content.startsWith(MARK));
});

await test("Cowork IPC: info / open / create / remember (onChange chaqiriladi, yo'l rendererdan kelmaydi)", async () => {
  const ws = freshWs();
  const handlers = {};
  const opened = [];
  let changes = 0;
  const pm = await import("../src/project-memory.mjs");
  registerProjectIpc({
    handle: (ch, fn) => (handlers[ch] = fn),
    getWorkspace: () => ws,
    openPath: async (p) => (opened.push(p), ""),
    pm,
    onChange: () => changes++,
  });
  assert.equal((await handlers["project:info"]()).exists, false);
  assert.equal((await handlers["project:open"]()).error, "missing");
  const c = await handlers["project:create"]();
  assert.ok(c.ok && c.created && c.info.exists);
  assert.equal(changes, 1);
  assert.deepEqual(await handlers["project:open"](), { ok: true });
  assert.equal(opened[0], join(ws, "SOVEREIGN.md"));
  const r = await handlers["project:remember"]({}, "testlar uchun pnpm");
  assert.ok(r.ok && r.info.notes === 1);
  assert.equal(changes, 2);
  assert.equal((await handlers["project:remember"]({}, 42)).error, "empty");
  assert.equal((await handlers["project:remember"]({}, "x".repeat(501))).error, "too-long");
  assert.equal(changes, 2, "xatoda onChange chaqirilmaydi");
});

await test("readProjectMemory: SOVEREIGN.md + .sovereign/PROJECT.md birlashtiriladi; ichki papkadan topiladi", () => {
  const ws = freshWs({ "SOVEREIGN.md": "# A\n- a", ".sovereign/PROJECT.md": "# B\n- b", "src/deep/x.js": "" });
  const pm = readProjectMemory(join(ws, "src", "deep"));
  assert.equal(pm.root, ws);
  assert.match(pm.content, /### SOVEREIGN.md[\s\S]*### .sovereign\/PROJECT.md/);
});

// ---- 2. Tahlil: buyruqlar, Tegma, Qoidalar, Eslatmalar ------------------------
const J1 = `# j1 — loyiha xotirasi

> Bu faylni SOVEREIGN agenti (CLI va Cowork) har suhbat boshida o'qiydi.

## Loyiha haqida
- Nima qiladi: …
- Asosiy papkalar: …

## Stek
- …

## Buyruqlar
- O'rnatish: …
- Ishga tushirish: …
- Test: …
- Build: …
- Lint: …

## Qoidalar
- Yangi funksiya/komponent yozishdan oldin mavjudini qidir — qayta yaratma.
- O'zgarishdan keyin testlarni ishga tushir.

## Tegma
- (o'zgartirilmasligi kerak bo'lgan fayl va papkalar, mas. generatsiya qilingan kod, migratsiyalar)

## Eslatmalar

- 2026-09-27: har doim qilganingdan keyn tekshirgin projectni hatolar cybersecuritysini
`;

await test("parse: bo'sh shablon — '…' va qavsdagi izohlar e'tiborsiz, ma'noli qoida yo'q", () => {
  const ws = freshWs();
  const r = parseProjectRules(projectTemplate(ws));
  assert.deepEqual(r.commands, []);
  assert.deepEqual(r.checks, []);
  assert.deepEqual(r.protect, []);
  assert.deepEqual(r.notes, []);
  assert.equal(r.rules.length, 2, "shablon qoidalari ro'yxatda qoladi");
  assert.equal(r.meaningful, false, "faqat shablon — tekshiruv kerak emas");
});

await test("parse: shablondagi haqiqiy buyruqlar saqlanadi (test/build), '…' lint o'tkaziladi", () => {
  const ws = freshWs({ "package.json": JSON.stringify({ scripts: { test: "node t.js", build: "vite build", dev: "vite" } }) });
  const r = parseProjectRules(projectTemplate(ws));
  assert.deepEqual(r.checks.map((c) => [c.kind, c.command]), [["test", "npm test"], ["build", "npm run build"]]);
  assert.ok(r.commands.some((c) => c.kind === "install" && c.command === "npm install"));
  assert.ok(r.commands.some((c) => c.kind === "run" && c.command === "npm run dev"));
  assert.ok(!r.checks.some((c) => c.kind === "install" || c.kind === "run"), "install/run tekshiruvga kirmaydi");
  assert.equal(r.meaningful, true);
});

await test("parse: asoschining haqiqiy fayli (j1) — eslatma olinadi, sana olib tashlanadi, Tegma izohi e'tiborsiz", () => {
  const r = parseProjectRules(J1);
  assert.deepEqual(r.checks, []);
  assert.deepEqual(r.protect, []);
  assert.deepEqual(r.notes, ["har doim qilganingdan keyn tekshirgin projectni hatolar cybersecuritysini"]);
  assert.equal(r.meaningful, true);
});

await test("parse: ru / en / uz-kirill sarlavhalari va turli yozuvlar", () => {
  const ru = parseProjectRules(`# X\n## Команды\n- Тесты: \`pnpm test\`\n- Линт: \`pnpm lint\`\n- Сборка: …\n## Не трогать\n- \`db/migrations/\` — генерируется\n- src/generated/**\n## Правила команды\n- Всегда используй pnpm\n## Заметки\n- 2026-01-02: не ломай API\n`);
  assert.deepEqual(ru.checks.map((c) => c.kind + ":" + c.command), ["test:pnpm test", "lint:pnpm lint"]);
  assert.deepEqual(ru.protect, ["db/migrations/", "src/generated/**"]);
  assert.deepEqual(ru.rules, ["Всегда используй pnpm"], "«Правила команды» — qoidalar, buyruqlar emas");
  assert.deepEqual(ru.notes, ["не ломай API"]);
  const en = parseProjectRules(`## Commands\n* Test: \`npm test -- --run\`\n* Typecheck: \`npx tsc --noEmit\`\n* Deploy: \`vercel deploy\`\n## Do not touch\n- \`package-lock.json\`, \`*.generated.ts\`\n- generated code from the API\n## Rules\n1. Use strict TypeScript\n   and no any.\n## Notes\n`);
  assert.deepEqual(en.checks.map((c) => c.kind), ["test", "check"], "deploy tekshiruvga kirmaydi");
  assert.ok(en.commands.some((c) => c.kind === "other" && c.command === "vercel deploy"));
  assert.deepEqual(en.protect, ["package-lock.json", "*.generated.ts"], "nasriy izoh naqsh emas");
  assert.deepEqual(en.rules, ["Use strict TypeScript and no any."], "davom qatori qo'shiladi");
  const cy = parseProjectRules(`## Буйруқлар\n- Тест: \`npm test\`\n## Тегма\n- migrations, src/gen/ — генерация\n## Қоидалар\n- Хавфсизликни текшир\n`);
  assert.deepEqual(cy.checks.map((c) => c.command), ["npm test"]);
  assert.deepEqual(cy.protect, ["migrations", "src/gen/"]);
  assert.deepEqual(cy.rules, ["Хавфсизликни текшир"]);
});

await test("parse: boshqaruv/bidi belgilari tozalanadi, '..' va absolyut yo'l naqsh bo'lmaydi", () => {
  const r = parseProjectRules(`## Tegma\n- \`../secret\`\n- \`C:/Windows\`\n- \`ok/dir\`\n## Qoidalar\n- a\u202eb\u0007c\n`);
  assert.deepEqual(r.protect, ["ok/dir"]);
  assert.equal(r.rules[0], "a b c");
});

// ---- 3. Tegma naqshlari --------------------------------------------------------
await test("protectMatch: glob, **, segment, papka, ildizga bog'langan naqsh", () => {
  const P = ["db/migrations/", "src/generated/**", "*.lock", "/config/prod.json", "dist", "src/**/*.gen.ts", "{a,b}.env"];
  const m = (p) => protectMatch(p, P, { platform: "linux" });
  assert.equal(m("db/migrations/001.sql"), "db/migrations/");
  assert.equal(m("db/migrations"), "db/migrations/", "papkaning o'zi (make_dir)");
  assert.equal(m("db/seed.sql"), null);
  assert.equal(m("src/generated"), "src/generated/**");
  assert.equal(m("src/generated/x/y.ts"), "src/generated/**");
  assert.equal(m("src/generatedX.ts"), null);
  assert.equal(m("yarn.lock"), "*.lock");
  assert.equal(m("pkgs/a/Cargo.lock"), "*.lock", "/ siz naqsh — istalgan chuqurlikda");
  assert.equal(m("config/prod.json"), "/config/prod.json");
  assert.equal(m("apps/config/prod.json"), null, "/ bilan boshlangan — faqat ildizdan");
  assert.equal(m("dist/index.js"), "dist");
  assert.equal(m("packages/web/dist/x.js"), "dist");
  assert.equal(m("src/a/b/c.gen.ts"), "src/**/*.gen.ts");
  assert.equal(m("src/c.gen.ts"), "src/**/*.gen.ts");
  assert.equal(m("b.env"), "{a,b}.env");
  assert.equal(m("../db/migrations/x"), null, "papkadan tashqari");
  assert.equal(m(""), null);
});

await test("protectMatch: Windows yo'llari va registr (win32 — befarq, linux — sezgir)", () => {
  const P = ["db/migrations/", "Secrets.json"];
  assert.equal(protectMatch("DB\\Migrations\\001.sql", P, { platform: "win32" }), "db/migrations/");
  assert.equal(protectMatch("secrets.JSON", P, { platform: "win32" }), "Secrets.json");
  assert.equal(protectMatch("secrets.json", P, { platform: "darwin" }), "Secrets.json");
  assert.equal(protectMatch("DB/Migrations/001.sql", P, { platform: "linux" }), null);
  assert.equal(protectMatch(".\\db\\migrations\\x.sql", P, { platform: "linux" }), "db/migrations/");
});

// Tegma bilan ish papkasi (runTool process.cwd() bilan ishlaydi).
const tegmaWs = freshWs({
  "SOVEREIGN.md": "# T\n## Buyruqlar\n- Test: `npm test`\n- Lint: `npm run lint`\n## Tegma\n- `db/migrations/`\n- `src/generated/**`\n- `*.lock`\n## Qoidalar\n- Xavfsizlikni tekshir\n",
  "db/migrations/001.sql": "create table x();",
  "src/generated/api.ts": "export {};",
  "src/app.js": "",
  "backup/.keep": "",
});
process.chdir(tegmaWs);
const plat = process.platform;

await test("protectHitForCommand: o'zgartiruvchi buyruqlar topiladi, o'qish/test/nusxa manbasi — yo'q", () => {
  const hit = (cmd) => protectHitForCommand(cmd, { cwd: tegmaWs })?.pattern ?? null;
  assert.equal(hit("rm -rf db/migrations"), "db/migrations/");
  assert.equal(hit("rm -rf db"), "db/migrations/", "ota papkani o'chirish");
  assert.equal(hit("echo x > db/migrations/002.sql"), "db/migrations/");
  assert.equal(hit("echo x >> src/generated/api.ts"), "src/generated/**");
  assert.equal(hit("git checkout -- src/generated/api.ts"), "src/generated/**");
  assert.equal(hit("git clean -fdx ."), "db/migrations/", "butun loyiha");
  assert.equal(hit("npx -y prettier --write src"), "src/generated/**");
  assert.equal(hit("npx eslint --fix src/generated/api.ts"), "src/generated/**");
  assert.equal(hit("rm -rf *"), "db/migrations/", "glob — ildiz");
  assert.equal(hit("mv yarn.lock old.lock"), "*.lock");
  assert.equal(hit("cp db/migrations/001.sql backup/"), null, "nusxa manbasi o'qiladi");
  assert.equal(hit("cp src/app.js db/migrations/003.sql"), "db/migrations/", "nusxa manzili");
  assert.equal(hit("cat db/migrations/001.sql"), null);
  assert.equal(hit("cd db && npm test"), null);
  assert.equal(hit("npm test"), null);
  assert.equal(hit("git add db/migrations/001.sql"), null);
  assert.equal(hit("node scripts/build.js > out.txt"), null);
  assert.equal(hit("rm -rf src/app.js"), null);
  if (plat === "win32") {
    assert.equal(hit("del db\\migrations\\001.sql"), "db/migrations/");
    assert.equal(hit("Remove-Item -Recurse DB\\Migrations"), "db/migrations/", "win32 — registrga befarq");
  }
});

await test("runTool write_file: Tegma — oddiy rejimda majburiy tasdiq (forcePrompt + meta.protect), rad etilsa yozilmaydi", async () => {
  const calls = [];
  const confirm = async (q, force, meta) => (calls.push({ q, force, meta }), false);
  const out = await runTool("write_file", { path: "db/migrations/002.sql", content: "x" }, confirm, {});
  assert.equal(calls.length, 1);
  assert.equal(calls[0].force, true);
  assert.equal(calls[0].meta.protect.pattern, "db/migrations/");
  assert.match(calls[0].meta.fullAutoDeny, /Tegma/);
  assert.match(calls[0].q, /SOVEREIGN\.md "Tegma"/);
  assert.match(out, /^Foydalanuvchi rad etdi: .*Tegma/);
  assert.equal(toolStatus("write_file", out), "declined");
  assert.ok(!existsSync(join(tegmaWs, "db", "migrations", "002.sql")));
  // Tegma'dan tashqari — oddiy tartib (majburiy emas).
  const c2 = [];
  await runTool("write_file", { path: "src/other.js", content: "" }, async (q, f, m) => (c2.push({ f, m }), false), {});
  assert.equal(c2[0].f, false);
  assert.equal(c2[0].m.protect, undefined);
});

await test("runTool: Full auto'da Tegma — aniq RAD ETILDI xabari (holat: declined), make_dir va run_command ham", async () => {
  const deny = async () => false; // Full auto qarori: meta.protect → rad
  const w = await runTool("write_file", { path: "src/generated/new.ts", content: "x" }, deny, { fullAuto: true });
  assert.match(w, /^RAD ETILDI \(full auto\): "src\/generated\/new\.ts" SOVEREIGN\.md "Tegma" ro'yxatiga tushadi \(src\/generated\/\*\*\)/);
  assert.equal(toolStatus("write_file", w), "declined");
  let meta = null;
  const d = await runTool("make_dir", { path: "db/migrations/sub" }, async (_q, f, m) => ((meta = { f, ...m }), false), { fullAuto: true });
  assert.equal(meta.f, true);
  assert.ok(meta.protect && meta.fullAutoDeny);
  assert.match(d, /^RAD ETILDI/);
  let cmeta = null;
  const r = await runTool("run_command", { command: "rm -rf db/migrations" }, async (_q, f, m) => ((cmeta = { f, ...m }), false), { fullAuto: true });
  assert.equal(cmeta.f, true);
  assert.equal(cmeta.protect.pattern, "db/migrations/");
  assert.match(r, /^RAD ETILDI/);
  assert.ok(existsSync(join(tegmaWs, "db", "migrations", "001.sql")), "buyruq bajarilmadi");
  // Xavfsiz (faqat-o'qish) buyruq Tegma'ga tushmasa — oddiy.
  let smeta = null;
  await runTool("run_command", { command: "ls db" }, async (_q, f, m) => ((smeta = { f, ...m }), false), {});
  assert.equal(smeta.protect, undefined);
});

await test("Tegma naqshi SOVEREIGN.md o'zgarganda darhol yangilanadi (diskdan har safar o'qiladi)", () => {
  const ws = freshWs({ "SOVEREIGN.md": "## Tegma\n- `a/`\n" });
  assert.ok(protectHitForPath(join(ws, "a", "x.js"), null, { cwd: ws }));
  writeFileSync(join(ws, "SOVEREIGN.md"), "## Tegma\n- `b/`\n");
  assert.equal(protectHitForPath(join(ws, "a", "x.js"), null, { cwd: ws }), null);
  assert.ok(protectHitForPath(join(ws, "b", "x.js"), null, { cwd: ws }));
});

// ---- 4. Kod yozilgandan keyingi qoidalar tekshiruvi -----------------------------
const okWrite = (target) => ({ tool: "write_file", target, status: "ok", exit: null, detail: "" });
const cmd = (target, status = "ok") => ({ tool: "run_command", target, status, exit: status === "ok" ? "0" : "1", detail: "" });

await test("projectCheckNudge: faqat kod yozilgandan keyin, bir marta; hujjat yozish yoki o'qish — yo'q", () => {
  const st = {};
  assert.equal(projectCheckNudge([], st, tegmaWs), null);
  assert.equal(projectCheckNudge([okWrite("README.md")], st, tegmaWs), null, "hujjat — kod emas");
  assert.equal(projectCheckNudge([{ ...okWrite("src/a.js"), status: "declined" }], st, tegmaWs), null, "rad etilgan yozish");
  const n = projectCheckNudge([okWrite("src/a.js")], st, tegmaWs);
  assert.ok(n);
  assert.match(n.text, /npm test/);
  assert.match(n.text, /npm run lint/);
  assert.match(n.text, /Xavfsizlikni tekshir/);
  assert.match(n.text, /db\/migrations\//);
  assert.match(n.text, /✅ bajarildi \/ ➖ tegishli emas \/ ❌ bajarilmadi/);
  assert.match(n.text, /MAZMUNI \(ma'lumot\)/,"fayl mazmuni ma'lumot deb belgilangan");
  assert.equal(projectCheckNudge([okWrite("src/a.js"), okWrite("src/b.ts")], st, tegmaWs), null, "bir navbatda faqat bir marta");
  assert.equal(st.verifyNudged, true, "Full auto'ning 'kodni tekshir' eslatmasi takrorlanmaydi");
  assert.ok(projectCheckNudge([okWrite("styles/app.css")], {}, tegmaWs), "css ham kod");
});

await test("projectCheckNudge: fayl yo'q / faqat shablon — o'tkaziladi; diskdan qayta o'qiladi", () => {
  const ws = freshWs();
  assert.equal(projectCheckNudge([okWrite("a.js")], {}, ws), null, "SOVEREIGN.md yo'q");
  createProjectFile(ws);
  assert.equal(projectCheckNudge([okWrite("a.js")], {}, ws), null, "to'ldirilmagan shablon");
  addProjectNote("har doim xavfsizlikni tekshir", ws); // Remember — keyingi tekshiruv darhol ko'radi
  const n = projectCheckNudge([okWrite("a.js")], {}, ws);
  assert.ok(n && /har doim xavfsizlikni tekshir/.test(n.text));
  assert.match(n.text, /test\/build\/lint buyrug'i yozilmagan/);
});

await test("projectCheckStatus: jurnal bo'yicha holat — ishga tushirilmagan / xato / eskirgan 'o'tdi' emas", () => {
  const rules = parseProjectRules("## Buyruqlar\n- Test: `npm test`\n- Lint: `npm run lint`\n- Build: `npm run build`\n");
  const st = projectCheckStatus(rules, [okWrite("src/a.js"), cmd("npm test"), cmd("npm run lint", "failed"), okWrite("src/b.js")], { isCodeFile: isProjectCodeFile });
  assert.deepEqual(st.map((s) => s.status), ["stale", "failed", "notRun"]);
  const st2 = projectCheckStatus(rules, [okWrite("src/a.js"), cmd("cd web && npm test -- --run"), cmd("npm run build"), { ...cmd("npm run lint"), status: "declined" }], { isCodeFile: isProjectCodeFile });
  assert.deepEqual(st2.map((s) => s.status), ["ok", "declined", "ok"]);
  // Javobda ishga tushirilmagan buyruq ✅ deb belgilangan — ogohlantirish; halol ❌ — yo'q.
  const issue = projectClaimIssue("SOVEREIGN.md tekshiruvi:\n- ✅ Test: `npm test` — bajarildi\n- ✅ Build: `npm run build` — o'tdi", st);
  assert.deepEqual(issue?.commands, ["npm test", "npm run build"]);
  assert.equal(projectClaimIssue("- ❌ Build: `npm run build` — ishga tushirilmadi\n- ❌ Lint: `npm run lint` — xato", st), null);
  assert.equal(projectClaimIssue("✅ npm test", st2), null, "haqiqatan o'tgan");
  assert.deepEqual(projectJudgeLines(st).map((l) => l.status), ["failed", "failed", "failed"]);
  assert.match(projectJudgeLines(st)[2].text, /\(ishga tushirilmadi\): npm run build/);
});

// ---- 5. agentTurn (CLI) — soxta model bilan to'liq navbat --------------------------
function sse(delta) {
  const body = [`data: ${JSON.stringify({ choices: [{ delta }] })}`, "data: [DONE]", ""].join("\n\n");
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}
const toolDelta = (name, args) => ({ tool_calls: [{ index: 0, id: `c${Math.random().toString(36).slice(2, 8)}`, function: { name, arguments: JSON.stringify(args) } }] });

async function runScripted(script, { fullAuto = false } = {}) {
  const origFetch = globalThis.fetch;
  const sent = [];
  let i = 0;
  globalThis.fetch = async (_url, init) => {
    sent.push(JSON.parse(init.body).messages);
    const step = script[Math.min(i++, script.length - 1)];
    return sse(step);
  };
  const origLog = console.log;
  console.log = () => {};
  try {
    const messages = [{ role: "system", content: "SYS" }, { role: "user", content: "vazifa" }];
    const res = await agentTurn({ messages, config: { openrouterKey: "k", model: "m", baseUrl: "http://127.0.0.1:9" }, confirm: async () => true, print: false, verify: false, fullAuto });
    return { res, messages, sent, calls: i };
  } finally {
    globalThis.fetch = origFetch;
    console.log = origLog;
  }
}
const nudgesIn = (messages) => messages.filter((m) => m.role === "user" && String(m.content).startsWith("[Avtomatik eslatma — SOVEREIGN.md"));

await test("agentTurn: kod yozilib yakunlanganda BIR MARTA qoidalar eslatmasi; bajarilmagan buyruq 'o'tdi' hisoblanmaydi", async () => {
  const { res, messages, calls } = await runScripted([
    toolDelta("write_file", { path: "src/feature.js", content: "export const x = 1;\n" }),
    { content: "Tayyor." },
    { content: "SOVEREIGN.md tekshiruvi:\n- ✅ Test: `npm test` — bajarildi\n- ➖ Lint: `npm run lint` — tegishli emas" },
  ]);
  assert.equal(calls, 3, "eslatmadan keyin model yana bir marta chaqirildi");
  assert.equal(nudgesIn(messages).length, 1);
  assert.equal(res.done, true);
  assert.deepEqual(res.projectCheck.map((s) => s.status), ["notRun", "notRun"]);
  assert.match(res.honesty.regex ?? "", /SOVEREIGN\.md buyrug'i bajarildi deb belgilangan.*`npm test`/);
  assert.ok(existsSync(join(tegmaWs, "src", "feature.js")));
});

await test("agentTurn: faqat hujjat yozilsa yoki hech narsa yozilmasa — eslatma yo'q", async () => {
  const a = await runScripted([toolDelta("write_file", { path: "NOTES.md", content: "x" }), { content: "Yozdim." }]);
  assert.equal(nudgesIn(a.messages).length, 0);
  assert.equal(a.calls, 2);
  assert.equal(a.res.projectCheck, null);
  const b = await runScripted([{ content: "Salom!" }]);
  assert.equal(nudgesIn(b.messages).length, 0);
});

await test("agentTurn: eslatmadan keyin model yana kod yozsa ham eslatma takrorlanmaydi; Full auto'da ham ishlaydi", async () => {
  const { messages, calls } = await runScripted(
    [
      toolDelta("write_file", { path: "src/a2.js", content: "1" }),
      { content: "Tayyor." },
      toolDelta("write_file", { path: "src/a3.js", content: "2" }),
      { content: "✅ hammasi" },
      { content: "yakun" },
    ],
    { fullAuto: true },
  );
  assert.equal(nudgesIn(messages).length, 1);
  assert.ok(calls <= 5);
});

await test("agentTurn: SOVEREIGN.md suhbat davomida o'zgarsa system xabari yangilanadi", async () => {
  const ws = freshWs({ "SOVEREIGN.md": "## Qoidalar\n- eski\n" });
  const prev = process.cwd();
  process.chdir(ws);
  try {
    const messages = [{ role: "system", content: "SYS" }, projectMemoryMessage(ws), { role: "user", content: "a" }, { role: "assistant", content: "b" }];
    writeFileSync(join(ws, "SOVEREIGN.md"), "## Qoidalar\n- yangi\n");
    messages.push({ role: "user", content: "c" });
    const origFetch = globalThis.fetch;
    let seen = "";
    globalThis.fetch = async (_u, init) => ((seen = JSON.parse(init.body).messages.map((m) => m.content).join("\n")), sse({ content: "ok" }));
    const origLog = console.log;
    console.log = () => {};
    try {
      await agentTurn({ messages, config: { openrouterKey: "k", model: "m" }, confirm: async () => true, print: false, verify: false });
    } finally {
      globalThis.fetch = origFetch;
      console.log = origLog;
    }
    assert.match(seen, /- yangi/);
    assert.doesNotMatch(seen, /- eski/);
    assert.equal(projMsgs(messages).length, 1);
  } finally {
    process.chdir(prev);
  }
});

process.chdir(origCwd);
rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passed} o'tdi, ${failed} yiqildi`);
process.exit(failed ? 1 : 0);
