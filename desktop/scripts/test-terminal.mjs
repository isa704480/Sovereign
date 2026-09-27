// Terminal panelining toza mantiqi (Electron'siz, haqiqiy pty'siz):
//   node scripts/test-terminal.mjs
// Soxta (fake) pty/oyna kiritiladi — real jarayon ishga tushmaydi.
import assert from "node:assert/strict";
import * as terminal from "../electron/terminal.mjs";
import {
  MAX_TABS,
  MAX_INPUT,
  SCROLLBACK_LINES,
  OutputBatcher,
  capScrollback,
  clampSize,
  defaultShell,
  isValidShell,
  killTreeArgs,
  ptyEnv,
  shellArgs,
  shellName,
  validateResize,
  validateWrite,
  registerTerminalIpc,
  disposeAllTerminals,
  terminalCount,
} from "../electron/terminal.mjs";
import { needsPasteConfirm, pasteLineCount, pastePreview } from "../ui/src/lib/terminalPaste.js";

const queue = [];
const test = (name, fn) => queue.push([name, fn]);

// ---- Muhit: SOVEREIGN_TOKEN hech qachon pty'ga o'tmaydi -------------------
test("env: SOVEREIGN_TOKEN olib tashlanadi, qolgani saqlanadi", () => {
  const base = { SOVEREIGN_TOKEN: "secret", PATH: "/usr/bin", HOME: "/home/u", OPENROUTER_API_KEY: "k" };
  const env = ptyEnv(base, { platform: "linux" });
  assert.equal("SOVEREIGN_TOKEN" in env, false);
  assert.equal(env.PATH, "/usr/bin");
  assert.equal(env.HOME, "/home/u");
  // Bu foydalanuvchining o'z terminali — odatdagi muhiti (Full auto sandbox'i emas).
  assert.equal(env.OPENROUTER_API_KEY, "k");
  assert.equal(env.TERM, "xterm-256color");
  assert.equal(base.SOVEREIGN_TOKEN, "secret", "asl obyekt o'zgarmaydi");
});
test("env: Electron o'zgaruvchilari va Windows himoyasi", () => {
  const env = ptyEnv({ ELECTRON_RUN_AS_NODE: "1", ELECTRON_NO_ASAR: "1", SystemRoot: "C:\\Windows" }, { platform: "win32" });
  assert.equal("ELECTRON_RUN_AS_NODE" in env, false);
  assert.equal("ELECTRON_NO_ASAR" in env, false);
  assert.equal(env.NoDefaultCurrentDirectoryInExePath, "1");
  assert.equal(ptyEnv({}, { platform: "linux" }).NoDefaultCurrentDirectoryInExePath, undefined);
});

// ---- Standart shell -------------------------------------------------------
test("shell: Windows — PowerShell, mac/Linux — $SHELL", () => {
  assert.equal(defaultShell({ platform: "win32", env: { SystemRoot: "C:\\Windows" } }), "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe");
  assert.equal(defaultShell({ platform: "win32", env: {} }), "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe");
  assert.equal(defaultShell({ platform: "darwin", env: { SHELL: "/bin/fish" } }), "/bin/fish");
  assert.equal(defaultShell({ platform: "darwin", env: {} }), "/bin/zsh");
  assert.equal(defaultShell({ platform: "linux", env: { SHELL: "  " } }), "/bin/bash");
});
test("shell: nom va argumentlar", () => {
  assert.equal(shellName("C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"), "powershell");
  assert.equal(shellName("/bin/zsh"), "zsh");
  assert.equal(shellName(""), "");
  assert.deepEqual(shellArgs("C:\\x\\powershell.exe", { platform: "win32" }), ["-NoLogo"]);
  assert.deepEqual(shellArgs("C:\\x\\cmd.exe", { platform: "win32" }), []);
  assert.deepEqual(shellArgs("/bin/zsh", { platform: "darwin" }), ["-l"]);
  assert.deepEqual(shellArgs("/bin/bash", { platform: "linux" }), []);
});
test("shell sozlamasi: satr, chegaralangan, yangi satrsiz", () => {
  assert.equal(isValidShell(""), true);
  assert.equal(isValidShell("/bin/bash"), true);
  assert.equal(isValidShell("/bin/bash\nrm -rf /"), false);
  assert.equal(isValidShell("a\0b"), false);
  assert.equal(isValidShell("x".repeat(401)), false);
  assert.equal(isValidShell(5), false);
  assert.equal(isValidShell(null), false);
});

// ---- IPC yukini tekshirish + yorliq egaligi -------------------------------
const ids = new Set(["a", "b"]);
test("write: faqat ma'lum id va chegaralangan satr", () => {
  assert.deepEqual(validateWrite({ id: "a", data: "ls" }, { ids }), { ok: true, id: "a", data: "ls" });
  assert.equal(validateWrite({ id: "zzz", data: "ls" }, { ids }).reason, "unknown-id");
  assert.equal(validateWrite({ id: "", data: "ls" }, { ids }).reason, "bad-id");
  assert.equal(validateWrite({ id: 7, data: "ls" }, { ids }).reason, "bad-id");
  assert.equal(validateWrite({ id: "a", data: 7 }, { ids }).reason, "bad-data");
  assert.equal(validateWrite({ id: "a", data: { toString: () => "ls" } }, { ids }).reason, "bad-data");
  assert.equal(validateWrite({ id: "a", data: "" }, { ids }).reason, "empty");
  assert.equal(validateWrite({ id: "a", data: "x".repeat(MAX_INPUT + 1) }, { ids }).reason, "too-long");
  assert.equal(validateWrite({ id: "a", data: "x".repeat(MAX_INPUT) }, { ids }).ok, true);
  assert.equal(validateWrite(null, { ids }).reason, "bad-payload");
  assert.equal(validateWrite("ls", { ids }).reason, "bad-payload");
  assert.equal(validateWrite({ id: "a", data: "ls" }, {}).reason, "unknown-id");
});
test("write: boshqa oynaning yorlig'i qabul qilinmaydi", () => {
  // Har oynaning o'z id to'plami bor — begona id "unknown-id" bo'ladi.
  const win1 = new Set(["t-1"]);
  const win2 = new Set(["t-2"]);
  assert.equal(validateWrite({ id: "t-2", data: "x" }, { ids: win1 }).reason, "unknown-id");
  assert.equal(validateWrite({ id: "t-2", data: "x" }, { ids: win2 }).ok, true);
  // Prototip orqali "id" ham o'tmaydi (Set.has aniq a'zolikni tekshiradi).
  assert.equal(validateWrite({ id: "toString", data: "x" }, { ids: win1 }).reason, "unknown-id");
});
test("resize: o'lchamlar chegaraga siqiladi", () => {
  assert.deepEqual(validateResize({ id: "a", cols: 120, rows: 30 }, { ids }), { ok: true, id: "a", cols: 120, rows: 30 });
  assert.deepEqual(clampSize(-5, 0), { cols: 2, rows: 1 });
  assert.deepEqual(clampSize(99999, 99999), { cols: 1000, rows: 400 });
  assert.deepEqual(clampSize(NaN, undefined), { cols: 80, rows: 24 });
  assert.equal(validateResize({ id: "a", cols: "80", rows: 24 }, { ids }).reason, "bad-size");
  assert.equal(validateResize({ id: "nope", cols: 80, rows: 24 }, { ids }).reason, "unknown-id");
});

// ---- Scrollback chegarasi -------------------------------------------------
test("scrollback: eng eski satrlar tushib qoladi", () => {
  const text = Array.from({ length: 20 }, (_, i) => `line${i}`).join("\n");
  const out = capScrollback(text, { maxLines: 5, maxBytes: 1e6 });
  // Chegara: ko'pi bilan maxLines ta satr ko'chirish saqlanadi (oxiridan).
  assert.equal((out.match(/\n/g) ?? []).length, 5);
  assert.equal(out.startsWith("line14"), true);
  assert.equal(out.endsWith("line19"), true);
  assert.equal(out.includes("line13"), false, "eski satrlar tashlab yuborildi");
});
test("scrollback: bayt chegarasi ham qo'llanadi", () => {
  const out = capScrollback("x".repeat(5000), { maxLines: 5000, maxBytes: 100 });
  assert.equal(out.length, 100);
});
test("scrollback: chegaradan kichik matn o'zgarmaydi", () => {
  assert.equal(capScrollback("a\nb\nc"), "a\nb\nc");
  assert.equal(capScrollback(""), "");
  assert.equal(SCROLLBACK_LINES, 5000);
});

// ---- Chiqishni birlashtirish (batching) ----------------------------------
function fakeTimers() {
  let seq = 0;
  const jobs = new Map();
  return {
    setTimer: (fn) => {
      jobs.set(++seq, fn);
      return seq;
    },
    clearTimer: (id) => jobs.delete(id),
    run: () => {
      for (const [id, fn] of [...jobs]) {
        jobs.delete(id);
        fn();
      }
    },
    pending: () => jobs.size,
  };
}
test("batching: ko'p bo'lak — bitta flush", () => {
  const T = fakeTimers();
  const seen = [];
  const b = new OutputBatcher({ onFlush: (d) => seen.push(d), setTimer: T.setTimer, clearTimer: T.clearTimer });
  for (let i = 0; i < 500; i++) b.push(`chunk${i} `);
  assert.equal(seen.length, 0, "taymergacha hech narsa yuborilmaydi");
  assert.equal(T.pending(), 1, "faqat bitta taymer");
  T.run();
  assert.equal(seen.length, 1);
  assert.equal(seen[0].startsWith("chunk0 "), true);
  assert.equal(seen[0].endsWith("chunk499 "), true);
});
test("batching: sel — eng eskisi tushadi, UI muzlamaydi", () => {
  const T = fakeTimers();
  const seen = [];
  const b = new OutputBatcher({ onFlush: (d) => seen.push(d), maxLines: 10, maxBytes: 1e6, setTimer: T.setTimer, clearTimer: T.clearTimer });
  for (let i = 0; i < 1000; i++) b.push(`row${i}\n`);
  T.run();
  assert.equal(seen[0].split("\n").filter(Boolean).length, 10);
  assert.equal(seen[0].startsWith("row990"), true);
});
test("batching: bo'sh flush yuborilmaydi; dispose'dan keyin jim", () => {
  const T = fakeTimers();
  const seen = [];
  const b = new OutputBatcher({ onFlush: (d) => seen.push(d), setTimer: T.setTimer, clearTimer: T.clearTimer });
  b.flush();
  assert.equal(seen.length, 0);
  b.push("a");
  b.dispose();
  T.run();
  b.push("b");
  b.flush();
  assert.equal(seen.length, 0);
  assert.equal(T.pending(), 0, "taymer tozalandi");
});

// ---- Jarayon daraxtini o'ldirish -----------------------------------------
test("killTree: Windows — absolyut taskkill, /T /F", () => {
  const a = killTreeArgs(4321, { platform: "win32", env: { SystemRoot: "C:\\Windows" } });
  assert.equal(a.file, "C:\\Windows\\System32\\taskkill.exe");
  assert.deepEqual(a.args, ["/pid", "4321", "/T", "/F"]);
  // Ish papkasidagi soxta taskkill.exe ishlamasin — yo'l har doim absolyut.
  assert.equal(killTreeArgs(1, { platform: "win32", env: { windir: "D:\\Win\\" } }).file, "D:\\Win\\System32\\taskkill.exe");
  assert.equal(killTreeArgs(1, { platform: "win32", env: {} }).file, "C:\\Windows\\System32\\taskkill.exe");
});
test("killTree: POSIX — butun jarayon guruhi", () => {
  assert.deepEqual(killTreeArgs(4321, { platform: "linux" }), { group: -4321, signal: "SIGKILL" });
  assert.deepEqual(killTreeArgs(7, { platform: "darwin" }), { group: -7, signal: "SIGKILL" });
});
test("killTree: yaroqsiz pid — hech narsa", () => {
  for (const bad of [0, -1, null, undefined, 1.5, "123", NaN]) assert.equal(killTreeArgs(bad, { platform: "linux" }), null, String(bad));
});

// ---- Ko'p satrli paste ----------------------------------------------------
test("paste: satr ko'chirish bo'lsa — tasdiq so'raladi", () => {
  assert.equal(needsPasteConfirm("npm test"), false);
  assert.equal(needsPasteConfirm(""), false);
  assert.equal(needsPasteConfirm(null), false);
  assert.equal(needsPasteConfirm("npm test\n"), true, "oxiridagi Enter ham darhol bajaradi");
  assert.equal(needsPasteConfirm("a\nb"), true);
  assert.equal(needsPasteConfirm("a\r\nb"), true);
  assert.equal(needsPasteConfirm("curl x | sh\rrm -rf ~"), true, "yolg'iz CR ham buyruqni bajaradi");
});
test("paste: satrlar soni", () => {
  assert.equal(pasteLineCount("a\nb\nc"), 3);
  assert.equal(pasteLineCount("a\r\nb\r\n"), 2);
  assert.equal(pasteLineCount("a"), 1);
  assert.equal(pasteLineCount(""), 0);
});
test("paste: ko'rinmas belgilar ochib beriladi", () => {
  const RLO = String.fromCharCode(0x202e);
  const p = pastePreview(`echo ${RLO}exe.txt\u0007\u200b`);
  assert.equal(p.includes(RLO), false);
  assert.equal(p.includes("\\u202e"), true);
  assert.equal(p.includes("\\u0007"), true);
  assert.equal(p.includes("\\u200b"), true);
  assert.equal(pastePreview("a\r\nb"), "a\nb");
  assert.equal(pastePreview("x".repeat(5000)).length, 2000);
});

// ---- Soxta pty bilan to'liq IPC hayot sikli -------------------------------
// Haqiqiy jarayon ishga tushmaydi: pid 0 (killTreeArgs null qaytaradi).
function harness({ cwd = "/w/app", shell = "/bin/bash" } = {}) {
  const spawned = [];
  const fakePty = {
    spawn(file, args, opts) {
      const h = {
        pid: 0,
        file,
        args,
        opts,
        written: [],
        sizes: [],
        killed: 0,
        _data: null,
        _exit: null,
        onData(cb) {
          h._data = cb;
        },
        onExit(cb) {
          h._exit = cb;
        },
        write(d) {
          h.written.push(d);
        },
        resize(c, r) {
          h.sizes.push([c, r]);
        },
        kill() {
          h.killed++;
        },
      };
      spawned.push(h);
      return h;
    },
  };
  const sent = [];
  const wc = { id: 11, send: (ch, payload) => sent.push({ ch, payload }) };
  const win = { isDestroyed: () => false, webContents: wc };
  const H = new Map();
  const O = new Map();
  registerTerminalIpc({
    handle: (ch, fn) => H.set(ch, fn),
    on: (ch, fn) => O.set(ch, fn),
    getWindow: () => win,
    getCwd: () => cwd,
    getShell: () => shell,
    ptyModule: fakePty,
  });
  const ev = { sender: wc };
  const other = { sender: { id: 99, send() {} } };
  return { H, O, ev, other, spawned, sent, fakePty };
}
const tick = (ms = 40) => new Promise((r) => setTimeout(r, ms));

test("soxta pty: yorliq ochiladi, muhit tozalanadi, chegara 5 ta", async () => {
  disposeAllTerminals();
  process.env.SOVEREIGN_TOKEN = "top-secret";
  const h = harness();
  const first = await h.H.get("term:create")(h.ev, { cols: 100, rows: 30 });
  assert.equal(typeof first.id, "string");
  assert.equal(first.mode, "pty");
  assert.equal(first.name, "bash");
  assert.equal(first.cwd, "/w/app");
  assert.equal(h.spawned[0].opts.cwd, "/w/app");
  assert.equal(h.spawned[0].opts.cols, 100);
  assert.equal("SOVEREIGN_TOKEN" in h.spawned[0].opts.env, false, "token pty'ga o'tmadi");
  for (let i = 1; i < MAX_TABS; i++) assert.equal(typeof (await h.H.get("term:create")(h.ev, {})).id, "string");
  assert.equal(terminalCount(), MAX_TABS);
  assert.deepEqual(await h.H.get("term:create")(h.ev, {}), { error: "too-many" });
  delete process.env.SOVEREIGN_TOKEN;
  disposeAllTerminals();
});

test("soxta pty: faqat o'z oynasining id'siga yoziladi", async () => {
  disposeAllTerminals();
  const h = harness();
  const a = await h.H.get("term:create")(h.ev, {});
  const pty = h.spawned[0];
  h.O.get("term:write")(h.ev, { id: a.id, data: "node -v\r" });
  assert.deepEqual(pty.written, ["node -v\r"]);
  // Boshqa oyna (boshqa webContents) — o'tmaydi.
  h.O.get("term:write")(h.other, { id: a.id, data: "rm -rf /\r" });
  // Noma'lum id, yaroqsiz yuk, juda uzun matn — hammasi jim rad etiladi.
  h.O.get("term:write")(h.ev, { id: "boshqa", data: "x\r" });
  h.O.get("term:write")(h.ev, { id: a.id, data: "x".repeat(MAX_INPUT + 1) });
  h.O.get("term:write")(h.ev, null);
  h.O.get("term:write")(h.ev, { id: a.id, data: 5 });
  assert.deepEqual(pty.written, ["node -v\r"], "faqat bitta yozuv o'tdi");
  disposeAllTerminals();
});

test("soxta pty: resize chegaraga siqiladi, begona oyna o'tmaydi", async () => {
  disposeAllTerminals();
  const h = harness();
  const a = await h.H.get("term:create")(h.ev, {});
  const pty = h.spawned[0];
  h.O.get("term:resize")(h.ev, { id: a.id, cols: 140, rows: 42 });
  h.O.get("term:resize")(h.ev, { id: a.id, cols: 99999, rows: -3 });
  h.O.get("term:resize")(h.other, { id: a.id, cols: 10, rows: 10 });
  h.O.get("term:resize")(h.ev, { id: a.id, cols: "80", rows: 24 });
  assert.deepEqual(pty.sizes, [[140, 42], [1000, 1]]);
  disposeAllTerminals();
});

test("soxta pty: chiqish ~16 ms oynalarda birlashib yuboriladi", async () => {
  disposeAllTerminals();
  const h = harness();
  const a = await h.H.get("term:create")(h.ev, {});
  const pty = h.spawned[0];
  for (let i = 0; i < 300; i++) pty._data(`out${i}\n`);
  assert.equal(h.sent.length, 0, "darhol yuborilmaydi");
  await tick();
  const data = h.sent.filter((x) => x.ch === "term:event" && x.payload.type === "data");
  assert.equal(data.length, 1, "300 bo'lak — bitta xabar");
  assert.equal(data[0].payload.id, a.id);
  assert.equal(data[0].payload.data.endsWith("out299\n"), true);
  disposeAllTerminals();
});

test("soxta pty: yopish — pty o'ldiriladi, begona oyna yopa olmaydi", async () => {
  disposeAllTerminals();
  const h = harness();
  const a = await h.H.get("term:create")(h.ev, {});
  const pty = h.spawned[0];
  assert.deepEqual(await h.H.get("term:close")(h.other, a.id), { ok: false });
  assert.equal(pty.killed, 0);
  assert.deepEqual(await h.H.get("term:close")(h.ev, a.id), { ok: true });
  assert.equal(pty.killed, 1);
  assert.equal(terminalCount(), 0);
  assert.deepEqual(await h.H.get("term:close")(h.ev, a.id), { ok: false }, "ikkinchi marta — yo'q");
  assert.deepEqual(await h.H.get("term:close")(h.ev, { id: "x" }), { ok: false });
});

test("soxta pty: ilovadan chiqishda hamma yorliq o'ldiriladi", async () => {
  disposeAllTerminals();
  const h = harness();
  await h.H.get("term:create")(h.ev, {});
  await h.H.get("term:create")(h.ev, {});
  assert.equal(terminalCount(), 2);
  disposeAllTerminals();
  assert.equal(terminalCount(), 0);
  assert.deepEqual(h.spawned.map((p) => p.killed), [1, 1]);
  // Yopilgandan keyin kelgan chiqish oynaga yuborilmaydi.
  const before = h.sent.length;
  h.spawned[0]._data("kech kelgan chiqish\n");
  await tick();
  assert.equal(h.sent.length, before);
});

test("soxta pty: shell o'zi tugasa — daraxt qayta o'ldirilmaydi (PID qayta ishlatilishi)", async () => {
  disposeAllTerminals();
  const h = harness();
  const a = await h.H.get("term:create")(h.ev, {});
  const pty = h.spawned[0];
  pty._exit({ exitCode: 0 });
  assert.equal(pty.killed, 0, "o'zi tugagan jarayonni o'ldirmaymiz");
  assert.equal(terminalCount(), 0);
  const exits = h.sent.filter((x) => x.payload.type === "exit");
  assert.equal(exits.length, 1);
  assert.equal(exits[0].payload.id, a.id);
});

// ---- Xavfsizlik chegarasi: modul pty'ga yozish yo'lini eksport qilmaydi ----
test("xavfsizlik: terminal.mjs pty'ga yozadigan funksiya eksport qilmaydi", () => {
  // Agent kodi (main.mjs turn/runTool) shu modul orqali pty'ga matn kirita olmasligi kerak.
  const writers = Object.keys(terminal).filter((k) => /^(write|input|send|type|paste|exec|inject)/i.test(k));
  assert.deepEqual(writers, [], `yozish yo'li topildi: ${writers.join(", ")}`);
  assert.equal(typeof terminal.registerTerminalIpc, "function");
  assert.equal(typeof terminal.disposeAllTerminals, "function");
});

let n = 0;
for (const [name, fn] of queue) {
  await fn();
  n++;
  console.log(`✓ ${name}`);
}
disposeAllTerminals();
console.log(`\n${n} ta test o'tdi`);
