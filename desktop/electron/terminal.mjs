// SOVEREIGN Cowork — foydalanuvchining terminali (pastki panel).
//
// XAVFSIZLIK CHEGARASI (muhim):
//   Bu terminal FOYDALANUVCHINIKI, agentniki emas. Modul pty'ga yozadigan
//   HECH QANDAY funksiyani eksport qilmaydi: `SESSIONS` xaritasi modul ichida
//   yopiq, yozish esa faqat `term:write` IPC kanali orqali bo'ladi. Shu sababli
//   agent kodi (main.mjs dagi turn/runTool yo'li) pty'ga matn kirita olmaydi —
//   unda hech qanday havola yo'q. IPC esa faqat asosiy oynaning o'z sahifasidan
//   qabul qilinadi (main.mjs dagi validSender) va preload qo'shimcha ravishda
//   haqiqiy (isTrusted) klaviatura/paste hodisasini talab qiladi.
//   Terminal mazmuni HECH QAYERGA yozilmaydi: log yo'q, vazifa tarixiga tushmaydi.
//
// Modul faqat node built-in'larini yuqori darajada import qiladi — shuning uchun
// scripts/test-terminal.mjs uni Electron'siz sinay oladi. node-pty lazy yuklanadi.

import { basename } from "node:path";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);

// ---- Chegaralar ------------------------------------------------------------
export const MAX_TABS = 5;
/** Bitta `term:write` xabaridagi maksimal belgilar soni (paste ham shu chegarada bo'laklanadi). */
export const MAX_INPUT = 4096;
/** Renderer'ga yuborishdan oldin main'da saqlanadigan chiqish chegarasi (satr). */
export const SCROLLBACK_LINES = 5000;
/** Chiqishni birlashtirish oynasi — `yarn install` seli UI'ni muzlatmasin. */
export const FLUSH_MS = 16;
/** Bitta flush'dagi maksimal bayt (satr chegarasidan tashqari). */
export const MAX_FLUSH_BYTES = 512 * 1024;
export const MIN_COLS = 2;
export const MAX_COLS = 1000;
export const MIN_ROWS = 1;
export const MAX_ROWS = 400;

// ---- Toza yordamchilar (testlanadi) ----------------------------------------

/**
 * Pty muhiti: foydalanuvchining odatdagi muhiti, LEKIN SOVEREIGN_TOKEN olib
 * tashlanadi (cli/src/tools.mjs `childEnv()` kabi) — tasodifiy skript kirish
 * tokenini o'qiy olmasin.
 */
export function ptyEnv(base = process.env, { platform = process.platform } = {}) {
  const env = { ...base };
  delete env.SOVEREIGN_TOKEN;
  // Electron ichidan meros qoladigan, bola jarayonni buzadigan o'zgaruvchilar.
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.ELECTRON_NO_ASAR;
  env.TERM = "xterm-256color";
  env.COLORTERM = "truecolor";
  // Windows cmd.exe buyruqni avval JORIY papkadan qidiradi (PowerShell — yo'q).
  // Ish papkasidagi soxta git.bat haqiqiy git o'rniga ishga tushmasin.
  if (platform === "win32") env.NoDefaultCurrentDirectoryInExePath = "1";
  return env;
}

/** Standart shell: Windows — PowerShell, mac/Linux — $SHELL. */
export function defaultShell({ platform = process.platform, env = process.env } = {}) {
  if (platform === "win32") {
    const sys = String(env.SystemRoot || env.windir || "C:\\Windows").replace(/[\\/]+$/, "");
    return `${sys}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`;
  }
  const sh = typeof env.SHELL === "string" && env.SHELL.trim() ? env.SHELL.trim() : "";
  if (sh) return sh;
  return platform === "darwin" ? "/bin/zsh" : "/bin/bash";
}

/** Shell argumentlari: PowerShell — logotipsiz, macOS — login shell (to'g'ri PATH). */
export function shellArgs(shell, { platform = process.platform } = {}) {
  const name = shellName(shell).toLowerCase();
  if (platform === "win32") return name === "powershell" || name === "pwsh" ? ["-NoLogo"] : [];
  if (platform === "darwin") return ["-l"];
  return [];
}

/** Yorliqda ko'rinadigan qisqa nom: "…/powershell.exe" → "powershell". */
export function shellName(shell) {
  const s = String(shell ?? "").trim();
  if (!s) return "";
  return basename(s.replace(/[\\/]+$/, "").replace(/\\/g, "/")).replace(/\.(exe|cmd|bat|com)$/i, "");
}

/** Sozlamadagi shell yo'li to'g'rimi? (Bo'sh — standart shell.) */
export function isValidShell(v) {
  return typeof v === "string" && v.length <= 400 && !/[\0\r\n]/.test(v);
}

/**
 * Jarayon daraxtini o'ldirish argumentlari (cli/src/tools.mjs `killTree` yondashuvi).
 * Windows'da taskkill ABSOLYUT yo'l bilan — ish papkasidagi soxta taskkill.exe emas.
 */
export function killTreeArgs(pid, { platform = process.platform, env = process.env } = {}) {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  if (platform === "win32") {
    const sys = String(env.SystemRoot || env.windir || "C:\\Windows").replace(/[\\/]+$/, "");
    return { file: `${sys}\\System32\\taskkill.exe`, args: ["/pid", String(pid), "/T", "/F"] };
  }
  // POSIX: pty seans yetakchisi — butun guruh (-pid) to'xtatiladi.
  return { group: -pid, signal: "SIGKILL" };
}

/** Matnni oxirgi `maxLines` satr va `maxBytes` bayt bilan cheklaydi (boshidan kesiladi). */
export function capScrollback(text, { maxLines = SCROLLBACK_LINES, maxBytes = MAX_FLUSH_BYTES } = {}) {
  let s = String(text ?? "");
  if (s.length > maxBytes) s = s.slice(s.length - maxBytes);
  let nl = 0;
  for (let i = s.length - 1; i >= 0; i--) {
    if (s.charCodeAt(i) !== 10) continue;
    nl++;
    if (nl > maxLines) return s.slice(i + 1);
  }
  return s;
}

/**
 * `term:write` yukini tekshiradi: id — shu oynaga tegishli mavjud yorliq,
 * data — chegaralangan satr.
 */
export function validateWrite(msg, { ids, max = MAX_INPUT } = {}) {
  if (!msg || typeof msg !== "object") return { ok: false, reason: "bad-payload" };
  const { id, data } = msg;
  if (typeof id !== "string" || !id) return { ok: false, reason: "bad-id" };
  if (!ids || typeof ids.has !== "function" || !ids.has(id)) return { ok: false, reason: "unknown-id" };
  if (typeof data !== "string") return { ok: false, reason: "bad-data" };
  if (data.length === 0) return { ok: false, reason: "empty" };
  if (data.length > max) return { ok: false, reason: "too-long" };
  return { ok: true, id, data };
}

/** O'lchamlarni chegaraga siqadi. */
export function clampSize(cols, rows) {
  const c = Number.isFinite(cols) ? Math.min(MAX_COLS, Math.max(MIN_COLS, Math.round(cols))) : 80;
  const r = Number.isFinite(rows) ? Math.min(MAX_ROWS, Math.max(MIN_ROWS, Math.round(rows))) : 24;
  return { cols: c, rows: r };
}

/** `term:resize` yukini tekshiradi va o'lchamlarni chegaraga siqadi. */
export function validateResize(msg, { ids } = {}) {
  if (!msg || typeof msg !== "object") return { ok: false, reason: "bad-payload" };
  const { id, cols, rows } = msg;
  if (typeof id !== "string" || !id) return { ok: false, reason: "bad-id" };
  if (!ids || typeof ids.has !== "function" || !ids.has(id)) return { ok: false, reason: "unknown-id" };
  if (!Number.isFinite(cols) || !Number.isFinite(rows)) return { ok: false, reason: "bad-size" };
  return { ok: true, id, ...clampSize(cols, rows) };
}

/**
 * Chiqishni ~16 ms oynalarda birlashtirib yuboradi va scrollback chegarasini
 * qo'llaydi (sel bo'lsa eng eskisi tushib qoladi).
 */
export class OutputBatcher {
  constructor({ flushMs = FLUSH_MS, onFlush, maxLines = SCROLLBACK_LINES, maxBytes = MAX_FLUSH_BYTES, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
    this.flushMs = flushMs;
    this.onFlush = onFlush;
    this.maxLines = maxLines;
    this.maxBytes = maxBytes;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.pending = "";
    this.timer = null;
    this.closed = false;
  }
  push(chunk) {
    if (this.closed || typeof chunk !== "string" || !chunk) return;
    this.pending = capScrollback(this.pending + chunk, { maxLines: this.maxLines, maxBytes: this.maxBytes });
    if (this.timer === null) this.timer = this.setTimer(() => this.flush(), this.flushMs);
  }
  flush() {
    if (this.timer !== null) {
      this.clearTimer(this.timer);
      this.timer = null;
    }
    const data = this.pending;
    this.pending = "";
    if (data && !this.closed) this.onFlush?.(data);
  }
  dispose() {
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null;
    this.pending = "";
    this.closed = true;
  }
}

// ---- Pty modulini yuklash --------------------------------------------------

let ptyMod; // undefined — hali urinilmagan; null — yuklanmadi
let ptyError = "";

/** node-pty (prebuilt) — yuklanmasa, quvur (pipe) rejimiga tushamiz. */
export function loadPty() {
  if (ptyMod !== undefined) return ptyMod;
  try {
    ptyMod = require_("@lydell/node-pty");
  } catch (e) {
    ptyMod = null;
    ptyError = String(e?.message ?? e).slice(0, 300);
  }
  return ptyMod;
}
export const ptyLoadError = () => ptyError;

// ---- Seanslar (modul ichida yopiq — tashqariga yozish yo'li yo'q) ----------

const SESSIONS = new Map(); // id -> session

function spawnSystem(file, args, opts) {
  const { spawn } = require_("node:child_process");
  return spawn(file, args, opts);
}

/** Jarayon daraxtini butunlay to'xtatadi. */
function killTree(pid) {
  const plan = killTreeArgs(pid);
  if (!plan) return;
  try {
    if (plan.file) {
      const k = spawnSystem(plan.file, plan.args, { stdio: "ignore", windowsHide: true });
      k.on("error", () => {});
    } else {
      process.kill(plan.group, plan.signal);
    }
  } catch {
    /* jarayon allaqachon tugagan */
  }
}

/**
 * @param {object} s
 * @param {{ notify?: boolean, kill?: boolean }} opts  kill=false — jarayon o'zi
 *   tugagan (PID qayta ishlatilgan bo'lishi mumkin, daraxtni o'ldirmaymiz).
 */
function destroySession(s, { notify = true, kill = true } = {}) {
  if (!s || s.dead) return;
  s.dead = true;
  SESSIONS.delete(s.id);
  const pid = s.pid;
  if (kill) {
    try {
      if (s.kind === "pty") s.handle.kill();
      else {
        s.handle.stdin?.destroy?.();
        s.handle.kill();
      }
    } catch {
      /* tugagan */
    }
    // Windows'da conpty bolalari (npm → node) qolib ketmasin; POSIX'da guruh.
    if (pid) setTimeout(() => killTree(pid), 150).unref?.();
  }
  // Oxirgi chiqishni yetkazamiz, keyin taymerni to'xtatamiz.
  s.batcher.flush();
  s.batcher.dispose();
  if (notify) s.emit({ type: "exit", id: s.id });
}

/** Barcha terminallarni yopadi (oyna yopilganda va ilovadan chiqishda). */
export function disposeAllTerminals() {
  for (const s of [...SESSIONS.values()]) destroySession(s, { notify: false });
}

/** Faqat test/diagnostika uchun: ochiq yorliqlar soni. */
export const terminalCount = () => SESSIONS.size;

// ---- IPC -------------------------------------------------------------------

/**
 * @param {{
 *   handle: (channel: string, fn: Function) => void,
 *   on: (channel: string, fn: Function) => void,
 *   getWindow: () => object|null,
 *   getCwd: () => string|null,
 *   getShell: () => string,
 *   ptyModule?: object,
 * }} deps  main.mjs o'zining validSender bilan o'ralgan helper'larini beradi.
 *   `ptyModule` — faqat testlar uchun (soxta pty); ishlab chiqarishda berilmaydi.
 */
export function registerTerminalIpc({ handle, on, getWindow, getCwd, getShell, ptyModule = null }) {
  const emitTo = (wcId) => (payload) => {
    const win = getWindow();
    if (!win || win.isDestroyed() || win.webContents.id !== wcId) return;
    // DIQQAT: terminal mazmuni faqat shu kanal orqali oynaga boradi — loglanmaydi.
    win.webContents.send("term:event", payload);
  };

  handle("term:create", (event, opts) => {
    const win = getWindow();
    if (!win || event.sender !== win.webContents) return { error: "no-window" };
    if (SESSIONS.size >= MAX_TABS) return { error: "too-many" };

    const cwd = getCwd() || undefined;
    const shell = (isValidShell(getShell?.()) && getShell().trim()) || defaultShell();
    const args = shellArgs(shell);
    const env = ptyEnv();
    const { cols, rows } = clampSize(opts?.cols, opts?.rows);

    const id = randomUUID();
    const wcId = event.sender.id;
    const emit = emitTo(wcId);
    const batcher = new OutputBatcher({ onFlush: (data) => emit({ type: "data", id, data }) });

    const pty = ptyModule ?? loadPty();
    let handleObj = null;
    let kind = "pty";
    try {
      if (!pty) throw new Error(ptyError || "node-pty unavailable");
      handleObj = pty.spawn(shell, args, { name: "xterm-256color", cols, rows, cwd, env });
    } catch (e) {
      // Zaxira: oddiy quvur. Interaktiv dasturlar va ranglar ishlamasligi mumkin.
      if (!ptyError) ptyError = String(e?.message ?? e).slice(0, 300);
      kind = "pipe";
      try {
        handleObj = spawnSystem(shell, args, {
          cwd,
          env,
          windowsHide: true,
          detached: process.platform !== "win32",
          stdio: ["pipe", "pipe", "pipe"],
        });
      } catch (e2) {
        batcher.dispose();
        return { error: "spawn-failed", detail: String(e2?.message ?? e2).slice(0, 200) };
      }
    }

    const session = { id, wcId, kind, handle: handleObj, pid: handleObj.pid, batcher, emit, dead: false };
    SESSIONS.set(id, session);
    const ended = () => destroySession(SESSIONS.get(id), { kill: false });
    if (kind === "pty") {
      handleObj.onData((d) => batcher.push(d));
      handleObj.onExit(ended);
    } else {
      // Quvurda LF → CRLF: xterm karetkani o'zi qaytarmaydi.
      const onChunk = (b) => batcher.push(b.toString("utf8").replace(/(?<!\r)\n/g, "\r\n"));
      handleObj.stdout?.on("data", onChunk);
      handleObj.stderr?.on("data", onChunk);
      handleObj.on("error", ended);
      handleObj.on("close", ended);
    }
    return { id, shell, name: shellName(shell), cwd: cwd ?? "", mode: kind, ptyError: kind === "pipe" ? ptyError.slice(0, 200) : "" };
  });

  on("term:write", (event, msg) => {
    const ids = idsFor(event.sender.id);
    const v = validateWrite(msg, { ids });
    if (!v.ok) return;
    const s = SESSIONS.get(v.id);
    if (!s || s.dead || s.wcId !== event.sender.id) return;
    try {
      if (s.kind === "pty") s.handle.write(v.data);
      else s.handle.stdin?.write(v.data);
    } catch {
      /* yopilgan */
    }
  });

  on("term:resize", (event, msg) => {
    const ids = idsFor(event.sender.id);
    const v = validateResize(msg, { ids });
    if (!v.ok) return;
    const s = SESSIONS.get(v.id);
    if (!s || s.dead || s.wcId !== event.sender.id || s.kind !== "pty") return;
    try {
      s.handle.resize(v.cols, v.rows);
    } catch {
      /* o'lcham qabul qilinmadi */
    }
  });

  handle("term:close", (event, id) => {
    const s = typeof id === "string" ? SESSIONS.get(id) : null;
    if (!s || s.wcId !== event.sender.id) return { ok: false };
    destroySession(s, { notify: false });
    return { ok: true };
  });

  handle("term:info", () => {
    const shell = (isValidShell(getShell?.()) && getShell().trim()) || defaultShell();
    return { shell, name: shellName(shell), cwd: getCwd() || "", available: (ptyModule ?? loadPty()) !== null, max: MAX_TABS };
  });
}

function idsFor(wcId) {
  const set = new Set();
  for (const [id, s] of SESSIONS) if (s.wcId === wcId && !s.dead) set.add(id);
  return set;
}
