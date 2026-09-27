// Ilova sozlamalari: userData/settings.json. Renderer faqat ruxsat etilgan
// kalitlarni o'zgartira oladi; har bir qiymat tekshiriladi.

import { app } from "electron";
import { join } from "node:path";
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { isValidModelName } from "./ollama.mjs";

const DEFAULTS = {
  onboarded: false,
  theme: "system", // system | dark | light
  lang: "", // "" = tizim tilidan aniqlanadi
  notifications: true,
  autoUpdate: true,
  defaultMode: "code", // code | chat
  fullAuto: false, // Kod rejimida hech narsa so'ralmaydi (tashqi yo'l / push / deploy rad etiladi)
  fullAutoFolder: "", // Full auto qaysi papka uchun yoqilgan — realpath kaliti (faqat main yozadi)
  fullAutoConsent: [], // Full auto xavfi haqida rozilik berilgan papkalar (realpath kalitlari, faqat main yozadi)
  tokenBudget: 0, // bitta vazifa uchun token byudjeti (0 — cheklovsiz); oshsa navbat to'xtaydi
  sidebar: true,
  rightPanel: false,
  mainView: "chat", // chat | editor — o'rta ustun ko'rinishi (muharrir yorlig'i)
  editorWrap: true, // muharrirda uzun qatorlarni o'rash
  model: "", // OmniRoute katalog id ("" = Auto)
  modelLabel: "",
  // Mahalliy model (Ollama) zaxirasi — docs/INQUIRY.md §B.1:
  localFallback: "ask", // off | ask | auto — limit/offline/server xatosida mahalliy modelga o'tish
  localModel: "", // oxirgi tanlangan mahalliy model ("" — avtomatik tanlanadi)
  fullAutoLocal: false, // Full auto + mahalliy model — alohida tasdiq (aks holda mahalliy rejimda Full auto pauza)
  // Chuqur so'rash (Deep Inquiry) — §A.7: auto | always | off
  inquiryMode: "auto",
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
  fullAuto: (v) => typeof v === "boolean",
  tokenBudget: (v) => Number.isInteger(v) && v >= 0 && v <= 100_000_000,
  sidebar: (v) => typeof v === "boolean",
  rightPanel: (v) => typeof v === "boolean",
  mainView: (v) => ["chat", "editor"].includes(v),
  editorWrap: (v) => typeof v === "boolean",
  model: (v) => typeof v === "string" && v.length <= 200,
  modelLabel: (v) => typeof v === "string" && v.length <= 200,
  localFallback: (v) => ["off", "ask", "auto"].includes(v),
  localModel: (v) => v === "" || isValidModelName(v),
  fullAutoLocal: (v) => typeof v === "boolean",
  inquiryMode: (v) => ["auto", "always", "off"].includes(v),
};
/** Rozilik ro'yxati chegarasi (eng eskilari tushib qoladi — keyin qayta so'raladi). */
export const FULL_AUTO_CONSENT_MAX = 100;
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
  if (typeof data.fullAutoFolder === "string") out.fullAutoFolder = data.fullAutoFolder;
  if (Array.isArray(data.fullAutoConsent)) out.fullAutoConsent = data.fullAutoConsent.filter((p) => typeof p === "string" && p).slice(-FULL_AUTO_CONSENT_MAX);
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
