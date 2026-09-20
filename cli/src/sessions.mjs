// Sessiyalar: suhbatni saqlash, davom ettirish, orqaga qaytarish va shoxlash.
// Fayllar ~/.sovereign/sessions/<id>.json — faqat lokal, serverga ketmaydi.

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const DIR = join(homedir(), ".sovereign", "sessions");
const MAX_SESSIONS = 50;

function ensureDir() {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true, mode: 0o700 });
}

const newId = () => `s_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** First user message, trimmed — used as the human-readable session name. */
function titleOf(messages) {
  const first = messages.find((m) => m.role === "user");
  const text = typeof first?.content === "string"
    ? first.content
    : (first?.content ?? []).find((p) => p?.type === "text")?.text ?? "";
  return text.replace(/\s+/g, " ").trim().slice(0, 60) || "Nomsiz suhbat";
}

export function saveSession({ id, messages, cwd, model }) {
  ensureDir();
  const sid = id || newId();
  const data = {
    id: sid,
    title: titleOf(messages),
    cwd: cwd ?? process.cwd(),
    model: model ?? "",
    updatedAt: new Date().toISOString(),
    messages,
  };
  writeFileSync(join(DIR, `${sid}.json`), JSON.stringify(data), { mode: 0o600 });
  prune();
  return sid;
}

export function listSessions() {
  ensureDir();
  const out = [];
  for (const f of readdirSync(DIR)) {
    if (!f.endsWith(".json")) continue;
    try {
      const d = JSON.parse(readFileSync(join(DIR, f), "utf8"));
      if (d?.id && Array.isArray(d.messages)) {
        out.push({ id: d.id, title: d.title ?? "", cwd: d.cwd ?? "", updatedAt: d.updatedAt ?? "", turns: countTurns(d.messages) });
      }
    } catch {
      /* skip corrupt file */
    }
  }
  return out.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export function loadSession(id) {
  ensureDir();
  const file = join(DIR, `${id}.json`);
  if (!existsSync(file)) return null;
  try {
    const d = JSON.parse(readFileSync(file, "utf8"));
    return Array.isArray(d?.messages) ? d : null;
  } catch {
    return null;
  }
}

export function deleteSession(id) {
  const file = join(DIR, `${id}.json`);
  if (!existsSync(file)) return false;
  rmSync(file);
  return true;
}

/** How many user turns the session holds. */
export function countTurns(messages) {
  return messages.filter((m) => m.role === "user").length;
}

/**
 * Drops the last `n` user turns (and everything the model produced for them),
 * so the next prompt continues from an earlier point.
 */
export function rewind(messages, n = 1) {
  const idx = [];
  messages.forEach((m, i) => m.role === "user" && idx.push(i));
  if (!idx.length) return messages.slice();
  const cut = idx[Math.max(0, idx.length - n)];
  return messages.slice(0, cut);
}

/** Keeps the newest sessions only. */
function prune() {
  const all = listSessions();
  for (const s of all.slice(MAX_SESSIONS)) deleteSession(s.id);
}

export const SESSIONS_DIR = DIR;
