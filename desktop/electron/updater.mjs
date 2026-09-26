// Avtomatik yangilanish (electron-updater, GitHub Releases: isa704480/Sovereign).
// Xavfsiz standartlar: faqat o'rnatilgan (packaged) ilovada, offline bo'lmaganda;
// yuklab olish foydalanuvchi bosganda; release yo'q / tarmoq yo'q — jim (ilova qulamaydi).
//
// macOS: imzosiz .dmg avtomatik yangilana olmaydi — u yerda faqat TEKSHIRUV (GitHub
// Releases API, desktop-v* teglari); yangi versiya bo'lsa renderer saytni ochadi.
//
// Holatlar: idle | disabled | checking | available | downloading | ready | latest |
// no-release | offline | error. Yuklab olish paytidagi xato `phase: "download"` va
// `version` bilan keladi — sidebar kartasi "Qayta urinish"ni ko'rsatadi.

import { app } from "electron";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const REPO = "isa704480/Sovereign";
const TAG_PREFIX = "desktop-v";

let updater = null;
let manual = false; // macOS: faqat tekshiruv, yuklash — sayt orqali
let emit = () => {};
let lastState = { state: "idle" };
let knownVersion = null; // oxirgi "available" versiyasi
let inDownload = false; // yuklab olish (yoki uni qayta urinish) jarayonidami

function set(state) {
  lastState = state;
  emit(state);
}

/** Xato matnidan foydalanuvchiga ko'rsatiladigan qisqa kod. */
function classify(err) {
  const m = String(err?.message ?? err ?? "");
  if (/404|No published versions|ERR_UPDATER_LATEST_VERSION_NOT_FOUND|ERR_UPDATER_CHANNEL_FILE_NOT_FOUND|Cannot find latest/i.test(m)) return "no-release";
  if (/ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|net::|offline|network|timeout|fetch failed/i.test(m)) return "offline";
  return "error";
}

function fail(err) {
  const code = classify(err);
  set(inDownload ? { state: code, version: knownVersion, phase: "download" } : { state: code });
}

/** "1.2.10" > "1.2.9" ? */
function isNewer(a, b) {
  const pa = String(a).split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0);
  return false;
}

export function initUpdater({ enabled, onEvent }) {
  emit = onEvent;
  if (!enabled || !app.isPackaged) {
    lastState = { state: "disabled" };
    return;
  }
  if (process.platform === "darwin") {
    manual = true;
    return;
  }
  try {
    ({ autoUpdater: updater } = require("electron-updater"));
  } catch {
    lastState = { state: "disabled" };
    return;
  }
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = true;
  updater.allowPrerelease = false;
  updater.logger = null;
  updater.on("checking-for-update", () => {
    // Mavjud yangilanish kartasi (yoki yuklash xatosi) tekshiruv paytida yo'qolib-chiqmasin.
    if (lastState.state !== "available" && lastState.phase !== "download") set({ state: "checking" });
  });
  updater.on("update-available", (i) => {
    knownVersion = i?.version ?? knownVersion;
    set({ state: "available", version: knownVersion });
  });
  updater.on("update-not-available", () => set({ state: "latest" }));
  updater.on("download-progress", (p) => set({ state: "downloading", version: knownVersion, percent: Math.round(p?.percent ?? 0) }));
  updater.on("update-downloaded", (i) => {
    inDownload = false;
    set({ state: "ready", version: i?.version ?? knownVersion });
  });
  updater.on("error", fail);
}

/** macOS: GitHub Releases API'dan eng so'nggi desktop-v* relizini solishtiradi. */
async function checkManual() {
  if (lastState.state !== "available") set({ state: "checking" });
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=20`, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "sovereign-cowork" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const list = await res.json();
    const rel = Array.isArray(list)
      ? list.find((r) => r && !r.draft && !r.prerelease && new RegExp(`^${TAG_PREFIX}\\d+\\.\\d+\\.\\d+$`).test(String(r.tag_name ?? "")))
      : null;
    if (!rel) {
      set({ state: "no-release" });
    } else {
      const v = String(rel.tag_name).slice(TAG_PREFIX.length);
      if (isNewer(v, app.getVersion())) {
        knownVersion = v;
        set({ state: "available", version: v, manual: true });
      } else {
        set({ state: "latest" });
      }
    }
  } catch (e) {
    set({ state: classify(e) });
  }
  return lastState;
}

export async function checkForUpdates() {
  // Yuklanayotgan yoki tayyor yangilanishni qayta tekshirish kerak emas.
  if (lastState.state === "downloading" || lastState.state === "ready") return lastState;
  if (manual) return checkManual();
  if (!updater) return lastState;
  inDownload = false;
  try {
    await updater.checkForUpdates();
  } catch (e) {
    fail(e);
  }
  return lastState;
}

export async function downloadUpdate() {
  if (!updater) return lastState;
  const retry = lastState.phase === "download" && (lastState.state === "error" || lastState.state === "offline");
  if (lastState.state !== "available" && !retry) return lastState;
  inDownload = true;
  try {
    if (retry) {
      // Qayta urinish: yangilanish ma'lumoti yangilanadi, keyin yuklash qaytadan.
      await updater.checkForUpdates();
      if (lastState.state !== "available") return lastState;
    }
    set({ state: "downloading", version: knownVersion, percent: 0 });
    await updater.downloadUpdate();
  } catch (e) {
    fail(e);
  }
  return lastState;
}

export function installUpdate() {
  if (updater && lastState.state === "ready") updater.quitAndInstall(false, true);
}

export const updateState = () => lastState;
