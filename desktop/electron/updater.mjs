// Avtomatik yangilanish (electron-updater, GitHub Releases: isa704480/Sovereign).
// Xavfsiz standartlar: faqat o'rnatilgan (packaged) ilovada, offline bo'lmaganda;
// yuklab olish foydalanuvchi bosganda; release yo'q / tarmoq yo'q — jim (ilova qulamaydi).

import { app } from "electron";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

let updater = null;
let emit = () => {};
let lastState = { state: "idle" };

function set(state) {
  lastState = state;
  emit(state);
}

/** Xato matnidan foydalanuvchiga ko'rsatiladigan qisqa kod. */
function classify(err) {
  const m = String(err?.message ?? err ?? "");
  if (/404|No published versions|ERR_UPDATER_LATEST_VERSION_NOT_FOUND|ERR_UPDATER_CHANNEL_FILE_NOT_FOUND|Cannot find latest/i.test(m)) return "no-release";
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|net::|offline|network/i.test(m)) return "offline";
  return "error";
}

export function initUpdater({ enabled, onEvent }) {
  emit = onEvent;
  if (!enabled || !app.isPackaged) {
    lastState = { state: "disabled" };
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
  updater.on("checking-for-update", () => set({ state: "checking" }));
  updater.on("update-available", (i) => set({ state: "available", version: i?.version }));
  updater.on("update-not-available", () => set({ state: "latest" }));
  updater.on("download-progress", (p) => set({ state: "downloading", percent: Math.round(p?.percent ?? 0) }));
  updater.on("update-downloaded", (i) => set({ state: "ready", version: i?.version }));
  updater.on("error", (e) => set({ state: classify(e) }));
}

export async function checkForUpdates() {
  if (!updater) return lastState;
  try {
    await updater.checkForUpdates();
  } catch (e) {
    set({ state: classify(e) });
  }
  return lastState;
}

export async function downloadUpdate() {
  if (!updater || lastState.state !== "available") return lastState;
  try {
    await updater.downloadUpdate();
  } catch (e) {
    set({ state: classify(e) });
  }
  return lastState;
}

export function installUpdate() {
  if (updater && lastState.state === "ready") updater.quitAndInstall(false, true);
}

export const updateState = () => lastState;
