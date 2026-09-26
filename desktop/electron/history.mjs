// Vazifalar tarixi: userData/history/<id>.json + index.json.
// Har bir vazifada: meta, modelga yuborilgan xabarlar (system'siz) va UI hodisalari
// (ekranni qayta tiklash uchun). Hajm cheklangan — katta fayl tarkiblari saqlanmaydi.

import { app } from "electron";
import { join } from "node:path";
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, readdirSync } from "node:fs";

const MAX_TASKS = 100;
const MAX_EVENTS = 600;
const MAX_MESSAGES = 80;
const MAX_TEXT = 24_000;
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const dir = () => join(app.getPath("userData"), "history");
const indexFile = () => join(dir(), "index.json");

export const validId = (id) => typeof id === "string" && ID_RE.test(id);

function readIndex() {
  try {
    const data = JSON.parse(readFileSync(indexFile(), "utf8"));
    return Array.isArray(data) ? data.filter((t) => validId(t?.id)) : [];
  } catch {
    return [];
  }
}

function writeIndex(list) {
  mkdirSync(dir(), { recursive: true });
  writeFileSync(indexFile(), JSON.stringify(list));
}

const cut = (s) => (typeof s === "string" && s.length > MAX_TEXT ? s.slice(0, MAX_TEXT) + "\n… (qisqartirildi)" : s);

function trimEvent(ev) {
  const out = { ...ev };
  for (const k of ["text", "output", "result", "message"]) if (typeof out[k] === "string") out[k] = cut(out[k]);
  return out;
}

function trimMessage(m) {
  const out = { ...m };
  if (typeof out.content === "string") out.content = cut(out.content);
  return out;
}

export function metaOf(task) {
  const { id, title, cwd, mode, createdAt, updatedAt, status } = task;
  return { id, title, cwd, mode, createdAt, updatedAt, status };
}

export function listTasks() {
  return readIndex().sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
}

export function saveTask(task, messages) {
  try {
    mkdirSync(dir(), { recursive: true });
    const rest = messages.filter((m) => m.role !== "system").slice(-MAX_MESSAGES).map(trimMessage);
    const events = task.events.slice(-MAX_EVENTS).map(trimEvent);
    writeFileSync(join(dir(), `${task.id}.json`), JSON.stringify({ meta: metaOf(task), messages: rest, events }));
    let list = readIndex().filter((t) => t.id !== task.id);
    list.unshift(metaOf(task));
    list.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
    for (const old of list.slice(MAX_TASKS)) rmSync(join(dir(), `${old.id}.json`), { force: true });
    list = list.slice(0, MAX_TASKS);
    writeIndex(list);
  } catch {
    /* tarix yozilmadi — asosiy ish to'xtamaydi */
  }
}

export function loadTask(id) {
  if (!validId(id)) return null;
  try {
    const data = JSON.parse(readFileSync(join(dir(), `${id}.json`), "utf8"));
    if (!data?.meta || data.meta.id !== id) return null;
    return {
      meta: data.meta,
      messages: Array.isArray(data.messages) ? data.messages : [],
      events: Array.isArray(data.events) ? data.events : [],
    };
  } catch {
    return null;
  }
}

export function removeTask(id) {
  if (!validId(id)) return false;
  rmSync(join(dir(), `${id}.json`), { force: true });
  writeIndex(readIndex().filter((t) => t.id !== id));
  return true;
}

export function clearTasks() {
  if (!existsSync(dir())) return;
  for (const f of readdirSync(dir())) if (f.endsWith(".json")) rmSync(join(dir(), f), { force: true });
}
