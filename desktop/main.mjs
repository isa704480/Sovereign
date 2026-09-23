// SOVEREIGN Cowork — Electron main jarayoni.
// Mavjud CLI agentini (tools/xavfsizlik/xotira) qayta ishlatadi; GUI orqali
// chat, fayl yozish (tasdiq bilan) va buyruq ishga tushirishни boshqaradi.

import { app, BrowserWindow, ipcMain, dialog } from "electron";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import { readdirSync, statSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";

import { loadConfig } from "../cli/src/config.mjs";
import { runTool, TOOL_SCHEMA, contextSummary } from "../cli/src/tools.mjs";
import { memorySystemMessage, syncMemory, addMemory } from "../cli/src/memory.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const SYSTEM = [
  "Sen SOVEREIGN Cowork — ish stolidagi AI koding hamkorisan (Claude Code uslubida).",
  "Foydalanuvchining ochilgan loyiha papkasida fayl va papkalar yarata, o'qiy va o'zgartira olasan (vositalar orqali).",
  "Ish papkasidan tashqaridagi yo'l so'ralsa RAD ETMA — tizim foydalanuvchidan ruxsat so'raydi.",
  "Foydalanuvchi qaysi tilda yozsa, o'sha tilda javob ber (asosan o'zbek).",
  "Vazifa tushunarli bo'lsa DARHOL bajar: aytilmagan tafsilotlarga (uslub, tuzilma, nom) oqilona standart tanla va oxirida qanday taxmin qilganingni 1 qatorda ayt. Faqat natija foydalanuvchiga xos ma'lumotga bog'liq bo'lsa (uning ismi, aniq raqamlari, kalit, qaysi fayl yoki yo'l) 1-3 ta qisqa savol ber — bir vazifaga bir marta; foydalanuvchi javob bergan yoki \"qil/davom et\" degan bo'lsa, qayta so'ramay bajar.",
  "Har qadamda nima qilayotganingni QISQA tushuntir; avval reja, keyin vositani chaqir.",
  "Kod toza, ishlaydigan va xavfsiz bo'lsin. Ish tugagach 1-2 gapda xulosala.",
].join(" ");

let win = null;
const pending = new Map(); // confirm so'rovlari: id -> resolve

function send(type, payload = {}) {
  win?.webContents.send("agent:event", { type, ...payload });
}

/** Renderer'dan tasdiq so'raydi. meta (write_file/make_dir/run_command) — diff uchun. */
function askConfirm(question, forcePrompt = false, meta = null) {
  return new Promise((resolve) => {
    const id = Math.random().toString(36).slice(2);
    pending.set(id, resolve);
    send("confirm", { id, question: stripAnsi(question), forcePrompt, meta });
  });
}
function stripAnsi(s) {
  // eslint-disable-next-line no-control-regex
  return String(s).replace(/\[[0-9;]*m/g, "");
}

function initialMessages(config) {
  const base = [
    { role: "system", content: SYSTEM },
    { role: "system", content: contextSummary() },
  ];
  const mem = memorySystemMessage(config);
  if (mem) base.push(mem);
  return base;
}

async function runRound(messages, config, withTools = true) {
  const res = await fetch(`${config.baseUrl.replace(/\/$/, "")}/api/cli/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.token}` },
    body: JSON.stringify({
      messages: messages.slice(-44),
      ...(withTools ? { tools: TOOL_SCHEMA } : {}),
      ...(config.omniModel ? { model: config.omniModel } : {}),
    }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error ?? `${res.status}`);
  }
  const { message } = await res.json();
  return { message, toolCalls: message.tool_calls ?? [] };
}

async function agentTurn(messages, config, maxSteps = 14) {
  for (let step = 0; step < maxSteps; step++) {
    let round;
    try {
      round = await runRound(messages, config);
    } catch (e) {
      send("error", { message: e.message });
      return;
    }
    messages.push(round.message);
    if (round.message.content && round.message.content.trim()) {
      send("text", { text: round.message.content });
    }
    if (!round.toolCalls.length) {
      send("done");
      return;
    }
    for (const call of round.toolCalls) {
      let args = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        /* ignore */
      }
      send("tool", { name: call.function.name, args });
      let result;
      try {
        result = await runTool(call.function.name, args, askConfirm);
      } catch (e) {
        result = `XATO: ${e.message}`;
      }
      if (call.function.name === "run_command") {
        send("terminal", { command: args.command, output: String(result) });
      }
      send("tool-done", { name: call.function.name, result: String(result).slice(0, 400) });
      messages.push({ role: "tool", tool_call_id: call.id, content: String(result).slice(0, 24_000) });
    }
  }
  send("done");
}

/** Oddiy chat — vositasiz, bitta javob (ChatGPT uslubi). */
async function chatTurn(messages, config) {
  let round;
  try {
    round = await runRound(messages, config, /*withTools=*/ false);
  } catch (e) {
    send("error", { message: e.message });
    return;
  }
  messages.push(round.message);
  if (round.message.content && round.message.content.trim()) {
    send("text", { text: round.message.content });
  }
  send("done");
}

// ---- IPC ---------------------------------------------------------------
let session = { messages: [], config: null };

ipcMain.handle("app:init", async () => {
  const config = loadConfig();
  session.config = config;
  if (config.token) await syncMemory(config).catch(() => {});
  session.messages = initialMessages(config);
  return {
    authed: !!config.token,
    email: config.email || "",
    baseUrl: config.baseUrl,
    cwd: process.cwd(),
    model: config.omniModel || (config.token ? "SOVEREIGN Auto" : config.model),
  };
});

ipcMain.handle("app:pick-folder", async () => {
  const r = await dialog.showOpenDialog(win, { properties: ["openDirectory"] });
  if (r.canceled || !r.filePaths[0]) return null;
  process.chdir(r.filePaths[0]);
  session.messages = initialMessages(session.config); // yangi kontekst
  return { cwd: process.cwd() };
});

ipcMain.on("agent:send", async (_e, payload) => {
  const { text, mode } = typeof payload === "string" ? { text: payload, mode: "code" } : payload;
  if (!session.config?.token) {
    send("error", { message: "Tizimga kirilmagan. Terminalda `sovereign login` qiling yoki ilovadan kiring." });
    return;
  }
  session.messages.push({ role: "user", content: String(text) });
  if (mode === "chat") await chatTurn(session.messages, session.config);
  else await agentTurn(session.messages, session.config);
});

ipcMain.on("agent:confirm-reply", (_e, { id, ok }) => {
  const resolve = pending.get(id);
  if (resolve) {
    pending.delete(id);
    resolve(!!ok);
  }
});

ipcMain.on("agent:remember", (_e, fact) => {
  if (session.config) addMemory(session.config, String(fact));
});

ipcMain.handle("app:new-task", async () => {
  session.messages = initialMessages(session.config);
  return { ok: true };
});

// ---- Fayl daraxti / o'qish (React sidebar + diff uchun) ----------------
const SKIP = new Set(["node_modules", ".git", ".next", "dist", "build", "out", ".turbo", ".cache", "__pycache__", ".venv", "venv", "ui-dist"]);

function walkTree(dir, depth = 0, max = 6) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const nodes = [];
  entries.sort((a, b) => (a.isDirectory() === b.isDirectory() ? a.name.localeCompare(b.name) : a.isDirectory() ? -1 : 1));
  for (const e of entries) {
    if (e.name.startsWith(".") && e.name !== ".env.example") continue;
    if (e.isDirectory() && SKIP.has(e.name)) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      nodes.push({ name: e.name, path: full, dir: true, children: depth < max ? walkTree(full, depth + 1, max) : [] });
    } else {
      nodes.push({ name: e.name, path: full, dir: false });
    }
    if (nodes.length > 800) break;
  }
  return nodes;
}

ipcMain.handle("fs:tree", async () => ({ cwd: process.cwd(), nodes: walkTree(process.cwd()) }));

ipcMain.handle("fs:read", async (_e, path) => {
  try {
    const root = process.cwd();
    const rel = relative(root, path);
    if (rel.startsWith("..")) return { error: "tashqarida" };
    const content = readFileSync(path, "utf8");
    return { content: content.length > 400_000 ? content.slice(0, 400_000) + "\n… (qisqartirildi)" : content };
  } catch (e) {
    return { error: e.message };
  }
});

// Undo/restore — ish papkasi ichida to'g'ridan-to'g'ri yozadi (foydalanuvchi bosgan).
ipcMain.handle("fs:write", async (_e, { path, content }) => {
  try {
    const root = process.cwd();
    const rel = relative(root, path);
    if (rel.startsWith("..")) return { error: "tashqarida" };
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content ?? "");
    return { ok: true };
  } catch (e) {
    return { error: e.message };
  }
});

// Model tanlash (OmniRoute katalog id) — keyingi so'rovlarda ishlatiladi.
ipcMain.handle("app:set-model", async (_e, id) => {
  if (session.config) session.config.omniModel = id || "";
  return { ok: true };
});

// ---- Window ------------------------------------------------------------
function createWindow() {
  win = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 720,
    minHeight: 520,
    backgroundColor: "#0A0B14",
    title: "SOVEREIGN Cowork",
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  if (process.env.VITE_DEV) {
    win.loadURL("http://localhost:5173");
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadFile(join(__dirname, "ui-dist", "index.html"));
  }
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
