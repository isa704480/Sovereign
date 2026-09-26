// CLI ↔ Web umumiy individual xotira (Bosqich 4).
// Akkaunt rejimida xotira SERVERda (web bilan bir xil memory_nodes) — lokal fayl
// faqat tez ko'rsatish uchun kesh. Direct rejimda (token yo'q) — faqat lokal.
// ~/.sovereign/memory/<key>.json  (key = token hash yoki "local").

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

/** [{ text, at, id? }] — foydalanuvchi xotirasi (eng yangi oxirida). */
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

// ---- server (akkaunt rejimi) -----------------------------------------
function memUrl(config, qs = "") {
  return `${(config.baseUrl || "https://soveregn.xyz").replace(/\/$/, "")}/api/cli/memory${qs}`;
}
const authHeaders = (config) => ({ "Content-Type": "application/json", Authorization: `Bearer ${config.token}` });
const timeout = (ms) => new Promise((_, r) => setTimeout(() => r(new Error("timeout")), ms));

/** Serverdan xotirani yuklab, keshni yangilaydi (startupda chaqiriladi). */
export async function syncMemory(config) {
  if (!config?.token) return loadMemory(config);
  try {
    const res = await Promise.race([fetch(memUrl(config), { headers: authHeaders(config) }), timeout(4000)]);
    if (!res.ok) return loadMemory(config);
    const { memories } = await res.json();
    const list = (memories ?? []).map((m) => ({ text: m.content, at: m.created_at, id: m.id }));
    save(config, list);
    return list;
  } catch {
    return loadMemory(config);
  }
}

export function addMemory(config, text) {
  const t = String(text || "").trim().slice(0, 500);
  if (!t) return false;
  const list = loadMemory(config);
  if (list.some((m) => m.text.toLowerCase() === t.toLowerCase())) return false;
  list.push({ text: t, at: new Date().toISOString() });
  save(config, list);
  // Akkaunt rejimida — serverga ham yozamiz (web ham ko'radi). Fire-and-forget.
  if (config?.token) {
    fetch(memUrl(config), { method: "POST", headers: authHeaders(config), body: JSON.stringify({ content: t }) })
      .then((r) => r.ok && r.json())
      .then((d) => {
        if (d?.id) {
          const cur = loadMemory(config);
          const item = cur.find((m) => m.text === t && !m.id);
          if (item) {
            item.id = d.id;
            save(config, cur);
          }
        }
      })
      .catch(() => {});
  }
  return true;
}

export function removeMemory(config, index) {
  const list = loadMemory(config);
  if (index < 1 || index > list.length) return false;
  const [removed] = list.splice(index - 1, 1);
  save(config, list);
  if (config?.token && removed?.id) {
    fetch(memUrl(config, `?id=${encodeURIComponent(removed.id)}`), { method: "DELETE", headers: authHeaders(config) }).catch(() => {});
  }
  return true;
}

export function clearMemory(config) {
  save(config, []);
  if (config?.token) {
    fetch(memUrl(config, "?all=1"), { method: "DELETE", headers: authHeaders(config) }).catch(() => {});
  }
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
