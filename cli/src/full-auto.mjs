// Full auto xavfsizlik yordamchilari — CLI va Cowork uchun umumiy (electron'siz; desktop/scripts/test-security.mjs bilan sinaladi).
//
// 1) Papka kaliti: Full auto va uning roziligi papkaning REALPATH'iga bog'lanadi.
//    Registr faqat Windows/macOS'da (odatda registrga befarq FS) e'tiborsiz; Linux'da
//    ~/work/app va ~/work/App — boshqa papkalar. Symlink qayta yo'naltirilsa — boshqa kalit.
// 2) Full auto'da ham SO'RALADIGAN holatlar (rad emas — oddiy tasdiq oynasi):
//    - Cowork'dan tashqarida keyinroq bajariladigan fayllar (CI, IDE task, git hook
//      menejerlari, agent sozlamalari) — sessiyadan keyin qoladigan "orqa eshik";
//    - bidi/nol-kenglik belgilari bor buyruq yoki yo'l — ko'rinadigan matn soxtalashtirilishi mumkin;
//    - interpretatorga satr ichida kod (`node -e`, `python -c` ...) — bu SANDBOX EMAS,
//      faqat eng oson prompt-injection yo'lini sekinlatadi (agent faylga yozib ishga tushira oladi).

import { realpathSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Papkaning solishtirish kaliti: realpath, oxirgi ajratkichsiz; win32/darwin'da kichik harf.
 * realpath topilmasa — "" (Full auto yoqilmaydi / o'chadi).
 */
export function folderKey(dir, { platform = process.platform, realpath = realpathSync.native } = {}) {
  if (typeof dir !== "string" || !dir) return "";
  let real;
  try {
    real = String(realpath(resolve(dir)));
  } catch {
    return "";
  }
  const trimmed = real.replace(/[\\/]+$/, "") || real;
  return platform === "win32" || platform === "darwin" ? trimmed.toLowerCase() : trimmed;
}

/** Ikki papka bir xilmi (folderKey bo'yicha). Istalgan biri aniqlanmasa — false. */
export function sameFolder(a, b, opts) {
  const ka = folderKey(a, opts);
  return !!ka && ka === folderKey(b, opts);
}

/** Cowork'dan tashqarida (CI, VS Code, boshqa agent, git) keyinroq bajariladigan papkalar. */
const PERSIST_DIRS = new Set([".github", ".gitlab", ".circleci", ".vscode", ".idea", ".husky", ".devcontainer", ".claude"]);
const PERSIST_FILES = new Set([
  ".gitlab-ci.yml", ".devcontainer.json", ".gitpod.yml", ".pre-commit-config.yaml",
  "lefthook.yml", "lefthook.yaml", ".lefthook.yml", ".envrc",
]);

/** rel — ish papkasiga nisbatan yo'l (istalgan ajratkich). package.json kabi fayllar bu yerda EMAS. */
export function persistentAutoRun(rel) {
  const parts = String(rel ?? "").split(/[\\/]+/).filter(Boolean).map((s) => s.toLowerCase());
  if (!parts.length) return false;
  if (PERSIST_FILES.has(parts[parts.length - 1])) return true;
  return parts.slice(0, -1).some((seg) => PERSIST_DIRS.has(seg));
}

/** Ko'rinmas formatlash belgilari: nol-kenglik, yo'nalish (bidi), qator/paragraf ajratkich, BOM. */
// Diapazonlar kod nuqtalari bilan (manbada ko'rinmas belgi yoki U+2028 literal bo'lmasin).
const HIDDEN_RANGES = [[0x200b, 0x200f], [0x2028, 0x2029], [0x202a, 0x202e], [0x2060, 0x2064], [0x2066, 0x2069], [0xfeff, 0xfeff]];
export const HIDDEN_FORMAT = new RegExp(`[${HIDDEN_RANGES.map(([a, b]) => `${String.fromCharCode(a)}-${String.fromCharCode(b)}`).join("")}]`);
export function hasHiddenFormat(s) {
  return typeof s === "string" && HIDDEN_FORMAT.test(s);
}

/** Interpretatorga satr ichida kod — Full auto'da oddiy tasdiqqa tushadi (tezlik to'sig'i, sandbox emas). */
const INLINE_EVAL = [
  /\b(node|nodejs|bun)(\.exe)?\b[^|;&\n]*\s(-e|-p|-pe|--eval|--print)(\s|=|$)/i,
  /\bdeno(\.exe)?\s+eval\b/i,
  /\b(python[0-9.]*|py|pypy[0-9.]*)(\.exe)?\b[^|;&\n]*\s-c(\s|$)/i,
  /\b(perl|ruby)(\.exe)?\b[^|;&\n]*\s-[a-z]*e(\s|$)/i,
  /\bphp(\.exe)?\b[^|;&\n]*\s-r(\s|$)/i,
  /\b(powershell|pwsh)(\.exe)?\b[^|;&\n]*\s[-/](c|command|e|ec|en|enc|encodedcommand)(\s|$)/i,
];
export function inlineEval(command) {
  const s = String(command ?? "");
  return INLINE_EVAL.some((re) => re.test(s));
}

/**
 * Full auto'da ham oddiy tasdiq kerakmi. Qaytaradi: null | "autoRun" | "hidden" | "inline".
 * @param {object|null} meta runTool tasdiq meta'si
 * @param {string} [rel] write_file uchun ish papkasiga nisbatan haqiqiy yo'l
 */
export function fullAutoMustAsk(meta, rel = "") {
  if (!meta) return null;
  if (meta.tool === "run_command") {
    if (hasHiddenFormat(meta.command)) return "hidden";
    if (inlineEval(meta.command)) return "inline";
    return null;
  }
  if (meta.tool === "write_file" || meta.tool === "make_dir") {
    if (hasHiddenFormat(meta.path)) return "hidden";
    if (meta.tool === "write_file" && !meta.outside && persistentAutoRun(rel || meta.path)) return "autoRun";
  }
  return null;
}
