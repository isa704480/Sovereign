import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { isValidModelName } from "./ollama.mjs";
import { SANDBOX_MODES, isValidImageName } from "./sandbox.mjs";

const DIR = join(homedir(), ".sovereign");
const FILE = join(DIR, "config.json");

const DEFAULTS = {
  // Account mode: SOVEREIGN server base URL + issued token.
  // API subdomeni (faqat /api/*). Login sahifasi (/cli/connect) serverdan app.'ga yo'naltiriladi.
  baseUrl: "https://api.soveregn.xyz",
  token: "",
  email: "",
  // Direct mode: user's own OpenRouter key + model. Kod-agent uchun tekin va tez
  // Llama 3.3 70B default sifatida — Groq direct sifatida ideal ishlaydi.
  model: "meta-llama/llama-3.3-70b-instruct:free",
  // Akkaunt rejimida foydalanuvchi OmniRoute katalogidan tanlagan model (mas.
  // "dva/claude-opus-5-high", "auto/best-coding"). Bo'sh bo'lsa — server tanlaydi.
  omniModel: "",
  openrouterKey: "",
  perplexityKey: "",
  // Mahalliy model (Ollama, docs/INQUIRY.md §B.1). localModel — tanlangan model nomi
  // (bo'sh — hali tanlanmagan). localFallback: limit/offline'da nima qilish:
  // "off" — hech narsa, "ask" — so'rash (standart), "auto" — ogohlantirish bilan darhol o'tish.
  localModel: "",
  localFallback: "ask",
  // Chuqur so'rash (§A.7): "auto" | "always" | "off".
  inquiry: "auto",
  // Buyruqlar sandbox'i (cli/src/sandbox.mjs): "auto" — Full auto'da eng kuchli mavjud daraja;
  // "required" — Full auto faqat haqiqiy sandbox bilan (bo'lmasa buyruq so'raladi), oddiy rejimda ham
  // tasdiqlangan buyruq sandbox'da; "off" — OS sandbox yo'q (Full auto'da faqat env to'sig'i).
  sandbox: "auto",
  // Konteyner darajasi uchun image ("" — node:22-bookworm-slim). Avtomatik pull qilinmaydi.
  sandboxImage: "",
};

export const LOCAL_FALLBACK_MODES = ["off", "ask", "auto"];
export const INQUIRY_MODES = ["auto", "always", "off"];
export { SANDBOX_MODES };

/**
 * Yangi sozlamalar qiymatini tekshiradi (`sov config key=value` va fayldan o'qishda).
 * @returns {{ok: true, value: string} | {ok: false, error: string}}
 */
export function normalizeSetting(key, value) {
  const v = typeof value === "string" ? value.trim() : "";
  switch (key) {
    case "localFallback":
      return LOCAL_FALLBACK_MODES.includes(v) ? { ok: true, value: v } : { ok: false, error: `localFallback: ${LOCAL_FALLBACK_MODES.join(" | ")}` };
    case "inquiry":
      return INQUIRY_MODES.includes(v) ? { ok: true, value: v } : { ok: false, error: `inquiry: ${INQUIRY_MODES.join(" | ")}` };
    case "localModel":
      return v === "" || isValidModelName(v) ? { ok: true, value: v } : { ok: false, error: "localModel: noto'g'ri model nomi" };
    case "sandbox":
      return SANDBOX_MODES.includes(v) ? { ok: true, value: v } : { ok: false, error: `sandbox: ${SANDBOX_MODES.join(" | ")}` };
    case "sandboxImage":
      return v === "" || isValidImageName(v) ? { ok: true, value: v } : { ok: false, error: "sandboxImage: noto'g'ri image nomi (mas. node:22-bookworm-slim)" };
    default:
      return { ok: false, error: `noma'lum sozlama: ${key}` };
  }
}

function settingOr(key, value) {
  const r = normalizeSetting(key, value);
  return r.ok ? r.value : DEFAULTS[key];
}

/**
 * baseUrl'ni tekshiradi: faqat https (yoki localhost uchun http). Aks holda
 * token boshqa sxema/xostga (file:, javascript:, ochiq http) ketmasligi uchun
 * standart manzilga qaytadi.
 */
export function sanitizeBaseUrl(raw) {
  try {
    const u = new URL(String(raw));
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
    if (u.protocol === "https:" || (u.protocol === "http:" && local)) {
      return `${u.origin}${u.pathname}`.replace(/\/+$/, "");
    }
  } catch {
    /* noto'g'ri URL */
  }
  return DEFAULTS.baseUrl;
}

export function loadConfig() {
  let file = {};
  if (existsSync(FILE)) {
    try {
      file = JSON.parse(readFileSync(FILE, "utf8"));
    } catch {
      /* ignore corrupt config */
    }
  }
  // `local` / `onLimit` — faqat ish vaqtidagi (runtime) maydonlar: fayldan hech qachon olinmaydi.
  const { local: _local, onLimit: _onLimit, ...stored } = file && typeof file === "object" ? file : {};
  return {
    ...DEFAULTS,
    ...stored,
    localModel: settingOr("localModel", stored.localModel ?? ""),
    localFallback: settingOr("localFallback", stored.localFallback ?? DEFAULTS.localFallback),
    inquiry: settingOr("inquiry", stored.inquiry ?? DEFAULTS.inquiry),
    sandbox: settingOr("sandbox", stored.sandbox ?? DEFAULTS.sandbox),
    sandboxImage: settingOr("sandboxImage", stored.sandboxImage ?? ""),
    baseUrl: sanitizeBaseUrl(process.env.SOVEREIGN_URL || file.baseUrl || DEFAULTS.baseUrl),
    token: process.env.SOVEREIGN_TOKEN || file.token || "",
    openrouterKey: process.env.OPENROUTER_API_KEY || file.openrouterKey || "",
    perplexityKey: process.env.PERPLEXITY_API_KEY || file.perplexityKey || "",
    model: process.env.SOVEREIGN_MODEL || file.model || DEFAULTS.model,
  };
}

export function saveConfig(patch) {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true, mode: 0o700 });
  let current = {};
  if (existsSync(FILE)) {
    try {
      current = JSON.parse(readFileSync(FILE, "utf8"));
    } catch {
      /* ignore */
    }
  }
  const next = { ...current, ...patch };
  delete next.local; // runtime-only
  delete next.onLimit;
  // Token va API kalitlar shu faylda — faqat foydalanuvchi o'qishi kerak (0600).
  // Windows'da chmod tam qo'llanmaydi, lekin POSIX/WSL/macOS/Linux'da ta'sirli.
  writeFileSync(FILE, JSON.stringify(next, null, 2), { mode: 0o600 });
  try {
    chmodSync(FILE, 0o600);
  } catch {
    /* Windows'da chmod no-op — indamay o'tadi */
  }
  return FILE;
}

/**
 * Faylda saqlangan tokenni SERVERDA ham bekor qiladi (POST /api/cli/logout) — ~3 soniya kutiladi.
 * clearAuth()'dan OLDIN chaqiriladi (aks holda sizib chiqqan token 90 kun ishlayverardi).
 * Muhitdagi SOVEREIGN_TOKEN'ga tegmaydi.
 * Natija: true — serverda bekor qilindi; false — bekor qilib BO'LMADI (tarmoq/HTTP xato —
 * chaqiruvchi foydalanuvchini ogohlantiradi: tokenni /cli/sessions'da bekor qilsin);
 * null — saqlangan token yo'q (bekor qiladigan narsa yo'q).
 */
export async function revokeStoredToken(timeoutMs = 3000) {
  let file = {};
  try {
    file = JSON.parse(readFileSync(FILE, "utf8"));
  } catch {
    return null;
  }
  const token = file && typeof file.token === "string" ? file.token.trim() : "";
  if (!token) return null;
  const base = sanitizeBaseUrl(process.env.SOVEREIGN_URL || file.baseUrl || DEFAULTS.baseUrl);
  try {
    const res = await fetch(`${base}/api/cli/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function clearAuth() {
  if (!existsSync(FILE)) return;
  const cfg = loadConfig();
  saveConfig({ token: "", email: "" });
  return cfg.baseUrl;
}

export function resetConfig() {
  if (existsSync(FILE)) rmSync(FILE);
}

/** Account mode when a server token is present. */
export function isAccountMode(cfg) {
  return Boolean(cfg.token);
}

export const CONFIG_PATH = FILE;
