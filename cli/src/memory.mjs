// Per-user (individual) CLI memory. Har akkaunt uchun alohida fayl —
// ~/.sovereign/memory/<key>.json (key = token hash yoki "local").
// AI har suhbatda shu faktlarni eslab turadi (web'dagi Memory Graph kabi, lokal).

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

const DIR = join(homedir(), ".sovereign", "memory");

function keyFor(config) {
  if (config?.token) return createHash("sha256").update(config.token).digest("hex").slice(0, 16);
  return "local";
}

function fileFor(config) {
  return join(DIR, `${keyFor(config)}.json`);
}

/** [{ text, at }] — foydalanuvchi xotirasi (eng yangi oxirida). */
export function loadMemory(config) {
  const f = fileFor(config);
  if (!existsSync(f)) return [];
  try {
    const data = JSON.parse(readFileSync(f, "utf8"));
    return Array.isArray(data) ? data.slice(-200) : [];
  } catch {
    return [];
  }
}

function save(config, list) {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true, mode: 0o700 });
  writeFileSync(fileFor(config), JSON.stringify(list.slice(-200), null, 2), { mode: 0o600 });
}

export function addMemory(config, text) {
  const t = String(text || "").trim().slice(0, 500);
  if (!t) return false;
  const list = loadMemory(config);
  if (list.some((m) => m.text.toLowerCase() === t.toLowerCase())) return false;
  list.push({ text: t, at: new Date().toISOString() });
  save(config, list);
  return true;
}

export function removeMemory(config, index) {
  const list = loadMemory(config);
  if (index < 1 || index > list.length) return false;
  list.splice(index - 1, 1);
  save(config, list);
  return true;
}

export function clearMemory(config) {
  save(config, []);
}

/** Chatga qo'shiladigan system xabari (xotira bo'sh bo'lsa null). */
export function memorySystemMessage(config) {
  const list = loadMemory(config);
  if (!list.length) return null;
  const facts = list.map((m) => `- ${m.text}`).join("\n");
  return {
    role: "system",
    content:
      "FOYDALANUVCHI XOTIRASI (avvalgi suhbatlardan eslab qolingan — javobingda inobatga ol, lekin ortiqcha eslatma):\n" +
      facts,
  };
}
