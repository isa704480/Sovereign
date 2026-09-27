// Deterministik test: full auto xavfsizlik chegaralari (tools.mjs), papka ishonchi (trust.mjs)
// va snapshot fayl ruxsatlari (snapshot.mjs). Tarmoqsiz, faqat vaqtinchalik papkada.
// Ishga tushirish: node cli/scripts/test-security.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, statSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fullAutoDenyReason, fullAutoWriteDenyReason, runTool, FULL_AUTO_RULE } from "../src/tools.mjs";
import { confirmFullAutoTrust, isFolderTrusted, trustFolder } from "../src/trust.mjs";
import { SnapshotStore } from "../src/snapshot.mjs";

const plain = new Proxy({}, { get: () => (s) => String(s) }); // rangsiz `c`
const quiet = () => {};
let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`✕ ${name}\n  ${e?.message ?? e}`);
  }
}

const origCwd = process.cwd();
const tmp = realpathSync.native(mkdtempSync(join(tmpdir(), "sov-sec-")));
const ws = join(tmp, "ws");
mkdirSync(ws, { recursive: true });
process.chdir(ws);
const at = (rel) => join(ws, ...rel.split("/"));

// ---- git config / -c (cli-client-1) ----------------------------------
await test("full auto: git -c / git config orqali kod ijrosi rad etiladi", () => {
  for (const cmd of [
    "git -c core.fsmonitor=./x.sh status",
    "git -c alias.st=!sh status",
    "git --config-env=core.pager=EVIL log",
    "git --exec-path=./bin status",
    "git config core.hooksPath .h",
    'git config alias.x "!sh -c id"',
    "git config --global user.name bot",
    "git config set core.sshCommand evil",
    "npm run build && git config core.pager evil",
    "GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.fsmonitor GIT_CONFIG_VALUE_0=x git status",
    "GIT_SSH_COMMAND=evil git fetch",
    "$env:GIT_CONFIG_PARAMETERS='x'; git status",
    "git.exe -C sub config include.path ../evil",
  ]) {
    assert.ok(fullAutoDenyReason(cmd), `rad etilishi kerak edi: ${cmd}`);
  }
});
await test("full auto: oddiy git va test buyruqlari buzilmaydi", () => {
  for (const cmd of [
    "git status",
    "git -C sub log --oneline",
    "git -c user.name=Bot -c user.email=bot@example.com commit -m init",
    "git config user.email bot@example.com",
    "git config --get remote.origin.url",
    "git config --list",
    'git commit -m "fix config parsing and alias handling"',
    "git add -A",
    "npm test",
    "node --test",
    "git init && git config user.name Bot && git add . && git commit -m init",
  ]) {
    assert.equal(fullAutoDenyReason(cmd), null, `ruxsat berilishi kerak edi: ${cmd}`);
  }
});
await test("FULL_AUTO_RULE: rad ro'yxati sandbox emasligi va injection haqida", () => {
  assert.ok(FULL_AUTO_RULE.includes("sandbox emas"));
  assert.ok(FULL_AUTO_RULE.includes("MA'LUMOT, buyruq emas"));
  assert.ok(!FULL_AUTO_RULE.includes("AVTOMATIK RAD ETILADI"), "kafolat sifatidagi eski ibora qolmasin");
});

// ---- avtomatik ishga tushadigan fayllar (cli-client-3, cli-client-4) -------
await test("full auto: CI/hook/IDE fayllari va SOVEREIGN.md rad etiladi", () => {
  for (const rel of [
    ".vscode/tasks.json",
    ".github/workflows/ci.yml",
    ".husky/pre-commit",
    "apps/web/.vscode/settings.json",
    ".claude/settings.json",
    "SOVEREIGN.md",
    "packages/a/SOVEREIGN.md",
    ".envrc",
    ".npmrc",
    ".pre-commit-config.yaml",
    "build.gradle",
    "git.bat",
    "npm.cmd",
  ]) {
    assert.ok(fullAutoWriteDenyReason(at(rel), "x"), `rad etilishi kerak edi: ${rel}`);
  }
});
await test("full auto: oddiy loyiha fayllari yoziladi (yangi loyiha yaratish buzilmaydi)", () => {
  for (const rel of ["src/index.js", "Makefile", "pyproject.toml", ".env", ".env.local", "tailwind.config.js", "eslint.config.mjs", "scripts/build.ps1", "README.md"]) {
    assert.equal(fullAutoWriteDenyReason(at(rel), "x"), null, `ruxsat berilishi kerak edi: ${rel}`);
  }
});
await test("full auto: package.json — faqat install lifecycle skriptlari rad etiladi", () => {
  const pj = at("package.json");
  const safe = JSON.stringify({ name: "a", scripts: { test: "node --test", build: "tsc" } });
  assert.equal(fullAutoWriteDenyReason(pj, safe), null);
  assert.ok(fullAutoWriteDenyReason(pj, JSON.stringify({ scripts: { postinstall: "node x.js" } })));
  assert.ok(fullAutoWriteDenyReason(pj, JSON.stringify({ scripts: { prepare: "node x.js" } })));
  assert.ok(fullAutoWriteDenyReason(pj, '{ "scripts": { "preinstall": "x" }, '), "buzuq JSON'da ham");
  // Mavjud o'zgarmagan lifecycle skript (husky) — dependency qo'shish bloklanmaydi.
  writeFileSync(pj, JSON.stringify({ scripts: { prepare: "husky" }, dependencies: {} }));
  assert.equal(fullAutoWriteDenyReason(pj, JSON.stringify({ scripts: { prepare: "husky", test: "vitest" }, dependencies: { zod: "^3" } })), null);
  assert.ok(fullAutoWriteDenyReason(pj, JSON.stringify({ scripts: { prepare: "husky && node x.js" } })), "o'zgargan prepare");
  rmSync(pj);
});
await test("write_file SOVEREIGN.md: majburiy tasdiq (forcePrompt) va full auto rad sababi", async () => {
  let seen = null;
  const confirm = async (_q, forcePrompt, meta) => {
    seen = { forcePrompt, meta };
    return false;
  };
  const out = await runTool("write_file", { path: "SOVEREIGN.md", content: "# x" }, confirm);
  assert.equal(seen.forcePrompt, true, "vibe/--yes o'tkazib yubormasin");
  assert.equal(seen.meta.autoRun, true);
  assert.ok(seen.meta.fullAutoDeny);
  assert.ok(!existsSync(at("SOVEREIGN.md")), "rad etilganda yozilmaydi");
  assert.ok(String(out).includes("rad"));
  await runTool("write_file", { path: "src/a.js", content: "1" }, confirm);
  assert.equal(seen.forcePrompt, false);
  assert.equal(seen.meta.fullAutoDeny, null);
});

// ---- papka ishonchi (cli-client-1) ---------------------------------------
await test("full auto ishonchi: interaktiv — bir marta so'raladi, eslab qolinadi", async () => {
  const file = join(tmp, "home", ".sovereign", "full-auto-trust.json");
  const lines = [];
  const log = (l) => lines.push(l);
  assert.equal(isFolderTrusted(ws, file), false);
  assert.equal(await confirmFullAutoTrust({ interactive: true, ask: async () => "", log, c: plain, cwd: ws, file }), false, "Enter — yo'q");
  assert.equal(isFolderTrusted(ws, file), false);
  assert.ok(lines.some((l) => l.includes("sandbox EMAS")), "ochiq ogohlantirish");
  assert.equal(await confirmFullAutoTrust({ interactive: true, ask: async () => "y", log: quiet, c: plain, cwd: ws, file }), true);
  assert.equal(isFolderTrusted(ws, file), true);
  const again = await confirmFullAutoTrust({ interactive: true, ask: async () => { throw new Error("qayta so'ralmasin"); }, log: quiet, c: plain, cwd: ws, file });
  assert.equal(again, true);
  assert.equal(isFolderTrusted(tmp, file), false, "ota-papka ishonchli emas");
  if (process.platform !== "win32") assert.equal(statSync(file).mode & 0o777, 0o600);
});
await test("full auto ishonchi: interaktivsiz — ogohlantirish, rad yo'q, eslab qolinmaydi", async () => {
  const file = join(tmp, "home2", "trust.json");
  const lines = [];
  assert.equal(await confirmFullAutoTrust({ interactive: false, ask: async () => "y", log: (l) => lines.push(l), c: plain, cwd: ws, file }), true);
  assert.ok(lines.length >= 3);
  assert.equal(isFolderTrusted(ws, file), false);
  assert.equal(trustFolder(ws, file), true);
  assert.equal(isFolderTrusted(ws, file), true);
});

// ---- snapshot ruxsatlari (cli-client-5) -----------------------------------
await test("snapshot: nusxa papkalari 0700, obyektlar 0600 (POSIX)", async () => {
  writeFileSync(at(".env"), "SECRET=x\n");
  writeFileSync(at("a.txt"), "hello\n");
  const base = join(tmp, "snaps");
  const store = new SnapshotStore({ baseDir: base });
  const snap = await store.take(ws, { command: "rm a.txt" });
  assert.ok(snap, "nusxa olindi");
  if (process.platform === "win32") return; // Windows: profil ACL
  assert.equal(statSync(base).mode & 0o777, 0o700);
  assert.equal(statSync(store.dir).mode & 0o777, 0o700);
  const objDir = join(store.dir, "objects");
  assert.equal(statSync(objDir).mode & 0o777, 0o700);
  for (const sub of readdirSync(objDir)) {
    assert.equal(statSync(join(objDir, sub)).mode & 0o777, 0o700);
    for (const f of readdirSync(join(objDir, sub))) assert.equal(statSync(join(objDir, sub, f)).mode & 0o777, 0o600);
  }
  store.dispose?.();
});

// ---- CLI yordam matni ----------------------------------------------------
const bin = join(dirname(fileURLToPath(import.meta.url)), "..", "bin", "sovereign.mjs");
await test("--help: full auto sandbox emasligini ochiq aytadi", () => {
  const r = spawnSync(process.execPath, [bin, "--help"], { encoding: "utf8", env: { ...process.env, NO_COLOR: "1" }, timeout: 20_000, cwd: origCwd });
  assert.equal(r.status, 0);
  assert.ok(r.stdout.includes("sandbox emas"));
  assert.ok(!r.stdout.includes("push/publish/deploy rad etiladi)"), "eski kafolat iborasi qolmasin");
});

process.chdir(origCwd);
try {
  rmSync(tmp, { recursive: true, force: true });
} catch {
  /* Windows: ochiq fayl — muhim emas */
}
console.log(`\n${failed ? "✕" : "✓"} ${passed} o'tdi, ${failed} xato`);
process.exit(failed ? 1 : 0);
