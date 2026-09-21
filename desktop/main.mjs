// SOVEREIGN Cowork — Electron main jarayoni.
// Mavjud CLI agentini (tools/xavfsizlik/xotira) qayta ishlatadi; GUI orqali
// chat, fayl yozish (tasdiq bilan) va buyruq ishga tushirishни boshqaradi.

import { app, BrowserWindow, ipcMain, dialog } from "electron";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { loadConfig } from "../cli/src/config.mjs";
import { runTool, TOOL_SCHEMA, contextSummary } from "../cli/src/tools.mjs";
import { memorySystemMessage, syncMemory, addMemory } from "../cli/src/memory.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const SYSTEM = [
  "Sen SOVEREIGN Cowork — ish stolidagi AI koding hamkorisan (Claude Code uslubida).",
  "Foydalanuvchining ochilgan loyiha papkasida fayl va papkalar yarata, o'qiy va o'zgartira olasan (vositalar orqali).",
  "Ish papkasidan tashqaridagi yo'l so'ralsa RAD ETMA — tizim foydalanuvchidan ruxsat so'raydi.",
  "Foydalanuvchi qaysi tilda yozsa, o'sha tilda javob ber (asosan o'zbek).",
  "Har qadamda nima qilayotganingni QISQA tushuntir; avval reja, keyin vositani chaqir.",
  "Kod toza, ishlaydigan va xavfsiz bo'lsin. Ish tugagach 1-2 gapda xulosala.",
].join(" ");

let win = null;
const pending = new Map(); // confirm so'rovlari: id -> resolve

function send(type, payload = {}) {
  win?.webContents.send("agent:event", { type, ...payload });
}

/** Renderer'dan tasdiq so'raydi (runTool confirm(question, forcePrompt) chaqiradi). */
function askConfirm(question, forcePrompt = false) {
  return new Promise((resolve) => {
    const id = Math.random().toString(36).slice(2);
    pending.set(id, resolve);
    send("confirm", { id, question: stripAnsi(question), forcePrompt });
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

async function runRound(messages, config) {
  const res = await fetch(`${config.baseUrl.replace(/\/$/, "")}/api/cli/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.token}` },
    body: JSON.stringify({
      messages: messages.slice(-44),
      tools: TOOL_SCHEMA,
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
      send("tool-done", { name: call.function.name, result: String(result).slice(0, 400) });
      messages.push({ role: "tool", tool_call_id: call.id, content: String(result).slice(0, 24_000) });
    }
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

ipcMain.on("agent:send", async (_e, text) => {
  if (!session.config?.token) {
    send("error", { message: "Tizimga kirilmagan. Terminalda `sovereign login` qiling yoki ilovadan kiring." });
    return;
  }
  session.messages.push({ role: "user", content: String(text) });
  await agentTurn(session.messages, session.config);
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
  win.loadFile(join(__dirname, "renderer", "index.html"));
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
