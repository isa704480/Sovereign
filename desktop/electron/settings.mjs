// Ilova sozlamalari: userData/settings.json. Renderer faqat ruxsat etilgan
// kalitlarni o'zgartira oladi; har bir qiymat tekshiriladi.

import { app } from "electron";
import { join } from "node:path";
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from "node:fs";

const DEFAULTS = {
  onboarded: false,
  theme: "system", // system | dark | light
  lang: "", // "" = tizim tilidan aniqlanadi
  notifications: true,
  autoUpdate: true,
  defaultMode: "code", // code | chat
  sidebar: true,
  rightPanel: false,
  model: "", // OmniRoute katalog id ("" = Auto)
  modelLabel: "",
  lastFolder: "",
  recent: [], // oxirgi ish papkalari (main o'zi yozadi)
  window: null, // { x, y, width, height, maximized }
};

const VALID = {
  onboarded: (v) => typeof v === "boolean",
  theme: (v) => ["system", "dark", "light"].includes(v),
  lang: (v) => ["", "uz", "uz-cyrl", "ru", "en"].includes(v),
  notifications: (v) => typeof v === "boolean",
  autoUpdate: (v) => typeof v === "boolean",
  defaultMode: (v) => ["code", "chat"].includes(v),
  sidebar: (v) => typeof v === "boolean",
  rightPanel: (v) => typeof v === "boolean",
  model: (v) => typeof v === "string" && v.length <= 200,
  modelLabel: (v) => typeof v === "string" && v.length <= 200,
};
/** Renderer o'zgartira oladigan kalitlar. lastFolder/recent/window — faqat main. */
export const RENDERER_KEYS = Object.keys(VALID);

let cache = null;
const file = () => join(app.getPath("userData"), "settings.json");

export function loadSettings() {
  if (cache) return cache;
  let data = {};
  try {
    if (existsSync(file())) data = JSON.parse(readFileSync(file(), "utf8")) ?? {};
  } catch {
    data = {};
  }
  const out = { ...DEFAULTS };
  for (const k of Object.keys(VALID)) if (k in data && VALID[k](data[k])) out[k] = data[k];
  if (typeof data.lastFolder === "string") out.lastFolder = data.lastFolder;
  if (Array.isArray(data.recent)) out.recent = data.recent.filter((p) => typeof p === "string").slice(0, 8);
  if (data.window && typeof data.window === "object") out.window = sanitizeBounds(data.window);
  cache = out;
  return cache;
}

function persist() {
  try {
    mkdirSync(app.getPath("userData"), { recursive: true });
    writeFileSync(file(), JSON.stringify(cache, null, 2));
  } catch {
    /* sozlama yozilmadi — ilova ishlashda davom etadi */
  }
}

/** Renderer'dan kelgan patch — faqat oq ro'yxatdagi, to'g'ri qiymatlar. */
export function updateFromRenderer(patch) {
  const s = loadSettings();
  if (!patch || typeof patch !== "object") return s;
  let changed = false;
  for (const k of RENDERER_KEYS) {
    if (k in patch && VALID[k](patch[k]) && s[k] !== patch[k]) {
      s[k] = patch[k];
      changed = true;
    }
  }
  if (changed) persist();
  return s;
}

/** Faqat main ishlatadi (window, lastFolder, recent). */
export function updateInternal(patch) {
  Object.assign(loadSettings(), patch);
  persist();
}

export function rememberFolder(path) {
  const s = loadSettings();
  const recent = [path, ...s.recent.filter((p) => p.toLowerCase() !== path.toLowerCase())].slice(0, 8);
  updateInternal({ lastFolder: path, recent });
}

export function isDir(p) {
  try {
    return typeof p === "string" && !!p && existsSync(p) && statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function sanitizeBounds(b) {
  const num = (v) => (Number.isFinite(v) ? Math.round(v) : undefined);
  const w = num(b.width);
  const h = num(b.height);
  if (!w || !h || w < 400 || h < 300) return null;
  return { x: num(b.x), y: num(b.y), width: w, height: h, maximized: !!b.maximized };
}
