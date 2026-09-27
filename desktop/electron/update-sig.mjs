// Yangilanish manifesti (latest.yml) imzosi — Ed25519, kalit ilovaga o'rnatilgan.
// electron-builder imzosiz (verifyUpdateCodeSignature: false) — relizni e'lon qila oladigan
// har kim (o'g'irlangan token, buzilgan workflow) istalgan .exe ni yubora olardi. Imzo
// yopiq kalit bilan OFFLINE qo'yiladi (Actions secret EMAS): scripts/sign-update.mjs.
//
// UPDATE_PUBKEY_PEM bo'sh — tekshiruv o'chiq (eski xatti-harakat). Kalit qo'yilgach, imzosi
// yo'q yoki noto'g'ri reliz YUKLANMAYDI. Electron'siz modul (scripts/test-update-sig.mjs).

import { createPublicKey, verify } from "node:crypto";

/** Ed25519 ochiq kalit (SPKI PEM). Bo'sh — imzo tekshiruvi o'chiq. */
export const UPDATE_PUBKEY_PEM = "";

/** Platformaning kanal fayli (electron-updater nomlashi). */
export function channelFile(platform = process.platform, arch = process.arch) {
  if (platform === "linux") return arch === "arm64" ? "latest-linux-arm64.yml" : "latest-linux.yml";
  if (platform === "darwin") return "latest-mac.yml";
  return "latest.yml";
}

/** .sig: 64 baytli xom imzo yoki uning base64 matni. Noto'g'ri — null. */
export function parseSig(buf) {
  if (!buf) return null;
  const b = Buffer.from(buf);
  if (b.length === 64) return b;
  const txt = b.toString("utf8").trim();
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(txt)) return null;
  const raw = Buffer.from(txt, "base64");
  return raw.length === 64 ? raw : null;
}

/** Manifest baytlari imzosini tekshiradi. Istalgan xato — false. */
export function verifyManifest(manifest, sig, pubPem = UPDATE_PUBKEY_PEM) {
  try {
    const s = parseSig(sig);
    if (!s || !pubPem) return false;
    return verify(null, Buffer.from(manifest), createPublicKey(pubPem), s);
  } catch {
    return false;
  }
}

const esc = (v) => String(v).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * electron-updater yuklaydigan ma'lumot (updateInfo) imzolangan manifestga mosmi:
 * versiya va HAR BIR faylning sha512 qiymati manifestda bo'lishi shart (yuklangan fayl
 * sha512 ni electron-updater o'zi tekshiradi — zanjir shu bilan yopiladi).
 */
export function infoMatchesManifest(info, manifestText) {
  const text = String(manifestText ?? "");
  if (!info || typeof info.version !== "string" || !info.version) return false;
  if (!new RegExp(`^version:\\s*['"]?${esc(info.version)}['"]?\\s*$`, "m").test(text)) return false;
  const shas = [...(Array.isArray(info.files) ? info.files.map((f) => f?.sha512) : []), info.sha512].filter((v) => v !== undefined);
  if (!shas.length) return false;
  return shas.every((sha) => typeof sha === "string" && sha.length >= 40 && new RegExp(`^\\s*sha512:\\s*['"]?${esc(sha)}['"]?\\s*$`, "m").test(text));
}
