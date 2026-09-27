// Full auto uchun papka ishonchi (~/.sovereign/full-auto-trust.json).
//
// Full auto — "hech narsa so'ralmaydi" rejimi. Rad etish ro'yxati (tools.mjs FULL_AUTO_DENY)
// faqat buyruq MATNINI tekshiradi, OS sandbox emas: repo ichidagi fayl (README, test,
// issue matni) agentni skript yozib ishga tushirishga undashi mumkin va u skript
// foydalanuvchining to'liq huquqlari bilan ishlaydi. Shuning uchun full auto har papkada
// BIR MARTA ochiq ogohlantirish bilan tasdiqlanadi (flag orqali yoqilganda ham).

import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

export const FULL_AUTO_TRUST_PATH = join(homedir(), ".sovereign", "full-auto-trust.json");
const MAX_ENTRIES = 500;

/** Papka kaliti: realpath (symlink orqali aldab bo'lmasin), Windows'da kichik harf. */
export function folderKey(dir) {
  let p = resolve(String(dir ?? "."));
  try {
    p = realpathSync.native(p);
  } catch {
    /* mavjud emas — resolve natijasi */
  }
  return process.platform === "win32" ? p.toLowerCase() : p;
}

function readList(file) {
  try {
    const j = JSON.parse(readFileSync(file, "utf8"));
    return Array.isArray(j?.folders) ? j.folders.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Shu papka full auto uchun avval tasdiqlanganmi (aniq mos — ota-papka hisobga olinmaydi). */
export function isFolderTrusted(dir, file = FULL_AUTO_TRUST_PATH) {
  return readList(file).includes(folderKey(dir));
}

/** Papkani ishonchli deb yozadi (0700 papka, 0600 fayl). Xato bo'lsa — false (sessiya baribir davom etadi). */
export function trustFolder(dir, file = FULL_AUTO_TRUST_PATH) {
  try {
    const key = folderKey(dir);
    const list = readList(file).filter((x) => x !== key);
    list.push(key);
    const parent = dirname(file);
    if (!existsSync(parent)) mkdirSync(parent, { recursive: true, mode: 0o700 });
    writeFileSync(file, JSON.stringify({ folders: list.slice(-MAX_ENTRIES) }, null, 2), { mode: 0o600 });
    try {
      chmodSync(file, 0o600);
    } catch {
      /* Windows'da chmod no-op */
    }
    return true;
  } catch {
    return false;
  }
}

/** Full auto xavfi haqida ochiq ogohlantirish qatorlari (kafolat emas — matn filtri). */
export function fullAutoWarningLines(c) {
  return [
    `${c.amber("⚠ FULL AUTO:")} ${c.dim("hech narsa so'ralmaydi — agent yozgan kod va buyruqlar sizning huquqlaringiz bilan darhol bajariladi.")}`,
    c.dim("  Rad etish ro'yxati (push/publish/deploy/sudo/tarmoq) faqat buyruq MATNINI tekshiradi — bu sandbox EMAS."),
    c.dim("  Buyruqlar mavjud bo'lsa OS sandbox'ida bajariladi (Linux bubblewrap, macOS sandbox-exec, Docker/Podman —"),
    c.dim("  daraja: sov doctor). \"Cheklangan\" darajada (odatda Windows Docker'siz) repo fayllaridagi yashirin ko'rsatmalar"),
    c.dim("  (prompt-injection) agentni skript yozib ishga tushirishga undashi, u esa ~/.ssh kalit va boshqa sirlarni"),
    c.dim("  o'qib tashqariga yuborishi mumkin. To'liq darajada ham ish papkasidagi fayllar (.env) agentga ochiq."),
    c.dim("  Faqat o'zingiz ishonadigan (o'zingiz yozgan yoki tekshirgan) papkada yoqing."),
  ];
}

/**
 * Full auto'ni shu papkada yoqishdan oldin bir martalik tasdiq.
 * Ishonchli papka — so'ralmaydi. Interaktivsiz (-p / quvur) — orqaga moslik uchun
 * rad etilmaydi, lekin ogohlantirish chiqariladi va papka eslab qolinmaydi.
 * @returns {Promise<boolean>} true — full auto yoqiq qoladi
 */
export async function confirmFullAutoTrust({ interactive, ask, log, c, cwd = process.cwd(), file = FULL_AUTO_TRUST_PATH }) {
  if (isFolderTrusted(cwd, file)) return true;
  for (const l of fullAutoWarningLines(c)) log(l);
  if (!interactive) {
    log(c.dim("  Interaktivsiz rejim: tasdiq so'ralmadi — full auto shu ish uchun yoqiq (papka eslab qolinmaydi)."));
    return true;
  }
  const a = String(await ask(`  ${c.amber("?")} Shu papkada full auto yoqilsinmi? ${c.dim(folderKey(cwd))} ${c.dim("[y/N] ")}`)).trim().toLowerCase();
  const ok = ["y", "yes", "ha"].includes(a);
  if (ok) {
    trustFolder(cwd, file);
    log(c.dim("  Full auto yoqildi — bu papka eslab qolindi (keyingi safar so'ralmaydi)."));
  } else {
    log(c.dim("  Full auto yoqilmadi — amallar odatdagidek tasdiqlanadi (/auto — qayta urinish)."));
  }
  return ok;
}
