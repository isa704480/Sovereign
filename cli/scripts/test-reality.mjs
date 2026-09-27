// Deterministik test (tarmoqsiz, faqat 127.0.0.1 va vaqtinchalik papka):
//  - write_file /undo orqali qaytariladi (snapshot.mjs beginFile/finishFile);
//  - revokeStoredToken: true / false (server xato, tarmoq yo'q) / null (token yo'q);
//  - `sov` nomi: Windows npm shim (argv[1] = skript fayli) — bin/sov.mjs belgisi.
// Ishga tushirish: node cli/scripts/test-reality.mjs
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Uy papkasi vaqtinchalik — ~/.sovereign (config, snapshots) haqiqiy profilga tegmasin.
const origCwd = process.cwd();
const tmp = realpathSync.native(mkdtempSync(join(tmpdir(), "sov-reality-")));
const home = join(tmp, "home");
mkdirSync(home, { recursive: true });
process.env.HOME = home;
process.env.USERPROFILE = home;
delete process.env.SOVEREIGN_URL;

const { runTool } = await import("../src/tools.mjs");
const { SnapshotStore, withCommandSnapshots } = await import("../src/snapshot.mjs");
const { revokeStoredToken, saveConfig } = await import("../src/config.mjs");
const { invokedName, INVOKED_AS_MARK } = await import("../src/invoked.mjs");

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

const ws = join(tmp, "ws");
mkdirSync(ws, { recursive: true });
process.chdir(ws);
const yes = async () => true;
const no = async () => false;
const quietLog = console.log;

async function withQuiet(fn) {
  console.log = () => {};
  try {
    return await fn();
  } finally {
    console.log = quietLog;
  }
}

// ---- write_file → /undo -----------------------------------------------------
await test("write_file: mavjud faylni almashtirish /undo bilan qaytadi", async () => {
  const store = new SnapshotStore({ baseDir: join(tmp, "snaps") });
  const notes = [];
  const run = withCommandSnapshots(runTool, () => store, { files: true, getRoot: () => ws, onChange: (s) => notes.push(s) });
  writeFileSync(join(ws, "a.txt"), "asl matn");
  await withQuiet(() => run("write_file", { path: "a.txt", content: "yangi matn" }, yes));
  assert.equal(readFileSync(join(ws, "a.txt"), "utf8"), "yangi matn");
  const list = store.list();
  assert.equal(list.length, 1);
  assert.equal(list[0].kind, "file");
  assert.equal(list[0].counts.modified, 1);
  assert.equal(notes.length, 1);
  const res = await store.restore(list[0].id);
  assert.equal(res.ok, true);
  assert.equal(res.restored, 1);
  assert.equal(readFileSync(join(ws, "a.txt"), "utf8"), "asl matn");
  assert.equal(store.list().length, 0);
  store.dispose();
});

await test("write_file: yangi fayl (va yangi papka) /undo bilan o'chiriladi", async () => {
  const store = new SnapshotStore({ baseDir: join(tmp, "snaps") });
  const run = withCommandSnapshots(runTool, () => store, { files: true, getRoot: () => ws });
  await withQuiet(() => run("write_file", { path: "yangi/ichki/b.txt", content: "salom" }, yes));
  assert.ok(existsSync(join(ws, "yangi", "ichki", "b.txt")));
  const [s] = store.list();
  assert.equal(s.counts.created, 1);
  const res = await store.restore(s.id);
  assert.equal(res.ok, true);
  assert.equal(res.removed, 1);
  assert.ok(!existsSync(join(ws, "yangi", "ichki", "b.txt")));
  assert.ok(!existsSync(join(ws, "yangi")), "bo'sh papkalar ham o'chirilishi kerak");
  store.dispose();
});

await test("write_file: keyin o'zgartirilgan yangi fayl o'chirilmaydi", async () => {
  const store = new SnapshotStore({ baseDir: join(tmp, "snaps") });
  const run = withCommandSnapshots(runTool, () => store, { files: true, getRoot: () => ws });
  await withQuiet(() => run("write_file", { path: "c.txt", content: "v1" }, yes));
  writeFileSync(join(ws, "c.txt"), "foydalanuvchi o'zgartirdi");
  const res = await store.restore(store.list()[0].id);
  assert.equal(res.kept.length, 1);
  assert.equal(readFileSync(join(ws, "c.txt"), "utf8"), "foydalanuvchi o'zgartirdi");
  store.dispose();
});

await test("write_file: rad etilsa yoki bir xil matn bo'lsa nusxa qolmaydi", async () => {
  const store = new SnapshotStore({ baseDir: join(tmp, "snaps") });
  const run = withCommandSnapshots(runTool, () => store, { files: true, getRoot: () => ws });
  writeFileSync(join(ws, "d.txt"), "bir xil");
  await withQuiet(() => run("write_file", { path: "d.txt", content: "boshqa" }, no));
  await withQuiet(() => run("write_file", { path: "d.txt", content: "bir xil" }, yes));
  assert.equal(store.list().length, 0);
  assert.equal(readFileSync(join(ws, "d.txt"), "utf8"), "bir xil");
  store.dispose();
});

await test("files: false (Cowork) — write_file nusxalanmaydi", async () => {
  const store = new SnapshotStore({ baseDir: join(tmp, "snaps") });
  const run = withCommandSnapshots(runTool, () => store, { getRoot: () => ws });
  await withQuiet(() => run("write_file", { path: "e.txt", content: "x" }, yes));
  assert.equal(store.list().length, 0);
  store.dispose();
});

// ---- revokeStoredToken ------------------------------------------------------
async function withServer(status, fn) {
  const hits = [];
  const srv = createServer((req, res) => {
    hits.push({ url: req.url, auth: req.headers.authorization });
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(status === 200 ? '{"ok":true,"revoked":true}' : '{"error":"x"}');
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  try {
    return await fn(`http://127.0.0.1:${srv.address().port}`, hits);
  } finally {
    await new Promise((r) => srv.close(r));
  }
}

await test("revokeStoredToken: token yo'q — null (ogohlantirish kerak emas)", async () => {
  saveConfig({ token: "", baseUrl: "http://127.0.0.1:9" });
  assert.equal(await revokeStoredToken(500), null);
});

await test("revokeStoredToken: server 200 — true", async () => {
  await withServer(200, async (base, hits) => {
    saveConfig({ token: "tok-123", baseUrl: base });
    assert.equal(await revokeStoredToken(2000), true);
    assert.equal(hits[0].url, "/api/cli/logout");
    assert.equal(hits[0].auth, "Bearer tok-123");
  });
});

await test("revokeStoredToken: server xato (500) — false (ogohlantirish)", async () => {
  await withServer(500, async (base) => {
    saveConfig({ token: "tok-123", baseUrl: base });
    assert.equal(await revokeStoredToken(2000), false);
  });
});

await test("revokeStoredToken: tarmoq yo'q — false", async () => {
  // Bo'sh port: server ochib-yopiladi.
  const port = await withServer(200, async (base) => base);
  saveConfig({ token: "tok-123", baseUrl: port });
  assert.equal(await revokeStoredToken(1500), false);
});

const bin = join(dirname(fileURLToPath(import.meta.url)), "..", "bin", "sovereign.mjs");
await test("sov logout: server bekor qila olmasa ogohlantirish chiqadi, mahalliy chiqish bajariladi", async () => {
  await withServer(500, async (base) => {
    saveConfig({ token: "tok-xyz", baseUrl: base });
    // Asinxron spawn — shu jarayondagi server bola jarayonga 500 bilan javob bera oladi.
    const r = await new Promise((resolve, reject) => {
      const ch = spawn(process.execPath, [bin, "logout", "--no-color"], { env: { ...process.env, HOME: home, USERPROFILE: home } });
      let stdout = "";
      ch.stdout.on("data", (d) => (stdout += d));
      const timer = setTimeout(() => ch.kill(), 20_000);
      ch.on("error", reject);
      ch.on("close", (code) => {
        clearTimeout(timer);
        resolve({ code, stdout });
      });
    });
    assert.equal(r.code, 0);
    assert.match(r.stdout, /Chiqdingiz/);
    assert.match(r.stdout, /soveregn\.xyz\/cli\/sessions/);
    const cfg = JSON.parse(readFileSync(join(home, ".sovereign", "config.json"), "utf8"));
    assert.equal(cfg.token, "");
  });
});

// ---- `sov` nomi (vibe) ------------------------------------------------------
await test("invokedName: fayl nomidan (POSIX symlink, binary) va Windows shim belgisi", () => {
  assert.equal(invokedName("/usr/local/bin/sov", undefined), "sov");
  assert.equal(invokedName("C:\\Users\\u\\AppData\\Local\\Programs\\sov\\sov.exe", undefined), "sov");
  assert.equal(invokedName("/usr/lib/node_modules/@islombekrrr/sov-cli/bin/sovereign.mjs", undefined), "sovereign");
  // Windows npm sov.cmd → node .../bin/sov.mjs: fayl nomi ham, belgi ham "sov".
  assert.equal(invokedName("C:\\npm\\node_modules\\@islombekrrr\\sov-cli\\bin\\sov.mjs", undefined), "sov");
  assert.equal(invokedName("C:\\npm\\node_modules\\@islombekrrr\\sov-cli\\bin\\sovereign.mjs", "sov"), "sov");
  assert.equal(typeof INVOKED_AS_MARK, "symbol");
});

await test("package.json: `sov` bin/sov.mjs ga, `sovereign` bin/sovereign.mjs ga bog'langan", () => {
  const pkg = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "package.json"), "utf8"));
  assert.equal(pkg.bin.sov, "bin/sov.mjs");
  assert.equal(pkg.bin.sovereign, "bin/sovereign.mjs");
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "bin", "sov.mjs"), "utf8");
  assert.match(src, /INVOKED_AS_MARK\] = "sov"/);
});

await test("bin/sov.mjs ishga tushadi (--version)", () => {
  const sov = join(dirname(fileURLToPath(import.meta.url)), "..", "bin", "sov.mjs");
  const r = spawnSync(process.execPath, [sov, "--version"], { env: { ...process.env, HOME: home, USERPROFILE: home }, encoding: "utf8", timeout: 20_000 });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^sov \d+\.\d+\.\d+/);
});

process.chdir(origCwd);
rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passed} o'tdi, ${failed} yiqildi`);
process.exit(failed ? 1 : 0);
