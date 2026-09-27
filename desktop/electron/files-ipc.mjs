// SOVEREIGN Cowork — muharrir uchun fayl amallari (main jarayon).
//
// Renderer HECH QACHON ishonchli emas: har bir yo'l shu yerda qayta tekshiriladi
// (realpath → ish papkasi ichida → himoyalangan ro'yxat → SOVEREIGN.md «Tegma»),
// har bir nom Windows cheklovlariga solishtiriladi. Yozish — atomar (vaqtinchalik
// fayl + rename), fayl diskda o'zgargan bo'lsa rad etiladi (mtime+size).
// O'chirish — OS savatiga (shell.trashItem), butunlay emas.
//
// Bu modul Electron'siz ham import qilinadi (testlar) — `shell`/`app` faqat
// registerFilesIpc() ga parametr sifatida beriladi.

import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, statSync, lstatSync, readdirSync, rmSync, chmodSync, watch } from "node:fs";
import { basename, dirname, extname, join, sep } from "node:path";
import { randomBytes } from "node:crypto";

// ---- Chegaralar -----------------------------------------------------------
/** Bundan katta fayl faqat O'QISH uchun ochiladi (muharrir qotib qolmasin). */
export const EDIT_MAX_BYTES = 1.5 * 1024 * 1024;
/** Bundan katta faylni umuman o'qimaymiz. */
export const READ_MAX_BYTES = 16 * 1024 * 1024;
/** Ko'rish uchun yuboriladigan matn chegarasi (katta fayl qisqartiriladi). */
export const PREVIEW_MAX_CHARS = 512 * 1024;
/** Juda uzun qator — sintaksis ajratish va o'rash sekinlashadi → faqat o'qish. */
export const LONG_LINE = 5000;
/** data: URL bilan ko'rsatiladigan rasm chegarasi. */
export const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
/** Undo zaxirasiga olinadigan eng katta fayl. */
export const BACKUP_MAX_BYTES = 20 * 1024 * 1024;

const IMAGE_TYPES = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

// ---- Nom tekshiruvi -------------------------------------------------------

/** Windows'da (va xavfsizlik uchun hamma joyda) band bo'lgan nomlar. */
const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\.|$)/i;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;
/** Windows fayl nomida ishlatib bo'lmaydigan belgilar. */
const BAD_CHARS = /[<>:"|?*]/;

/**
 * Yangi fayl/papka nomi to'g'rimi.
 * @returns {null|"empty"|"bad-name"|"reserved"|"too-long"} xato kodi (null — yaroqli)
 */
export function validateName(name) {
  if (typeof name !== "string") return "bad-name";
  const n = name;
  if (!n.trim()) return "empty";
  if (Buffer.byteLength(n, "utf8") > 255) return "too-long";
  if (CONTROL.test(n)) return "bad-name";
  if (n.includes("/") || n.includes("\\")) return "bad-name";
  if (n === "." || n === "..") return "bad-name";
  if (BAD_CHARS.test(n)) return "bad-name";
  if (/[. ]$/.test(n)) return "bad-name"; // Windows: oxirida nuqta yoki bo'shliq
  if (/^\s/.test(n)) return "bad-name";
  if (RESERVED.test(n)) return "reserved";
  return null;
}

/** `.env`, `.env.local` — sir; `.env.example` mumkin. */
export function isEnvFile(p) {
  const b = basename(String(p)).toLowerCase();
  return /^\.env($|\.)/.test(b) && !/\.(example|sample|template)$/.test(b);
}

// ---- «Tegma» (SOVEREIGN.md) ----------------------------------------------

/**
 * SOVEREIGN.md dagi `## Tegma` bo'limidan glob'larni ajratadi.
 * Faqat aniq yo'lga o'xshagan bandlar olinadi: `backtick` ichidagilar yoki
 * bo'shliqsiz, yo'lga o'xshash matn. Izoh/qavsli tushuntirish — e'tiborsiz.
 */
export function parseTegma(md) {
  const text = String(md ?? "");
  const lines = text.split(/\r?\n/);
  const out = [];
  let inside = false;
  for (const line of lines) {
    const h = /^\s{0,3}#{2,6}\s+(.*)$/.exec(line);
    if (h) {
      inside = /^tegma\b/i.test(h[1].trim());
      continue;
    }
    if (!inside) continue;
    const m = /^\s*[-*+]\s+(.*)$/.exec(line);
    if (!m) continue;
    const item = m[1].trim();
    const spans = [...item.matchAll(/`([^`]+)`/g)].map((x) => x[1].trim());
    const cands = spans.length ? spans : [item.replace(/[.,;]+$/, "")];
    for (const c of cands) {
      if (!c || /\s/.test(c) || c.startsWith("(")) continue;
      if (!/^[\w.@!+\-/*?[\]{}]+$/.test(c)) continue;
      out.push(c.replace(/^\.\//, "").replace(/\\/g, "/"));
    }
    if (out.length > 200) break;
  }
  return out;
}

/** Oddiy glob: `*` (bitta bo'lak ichida), `**` (ko'p bo'lak), `?`. */
export function globToRegExp(glob) {
  const g = String(glob).replace(/^\/+/, "").replace(/\/+$/, "");
  let re = "";
  for (let i = 0; i < g.length; i++) {
    const ch = g[i];
    if (ch === "*") {
      if (g[i + 1] === "*") {
        i++;
        if (g[i + 1] === "/") i++;
        re += "(?:.*/)?";
      } else {
        re += "[^/]*";
      }
    } else if (ch === "?") re += "[^/]";
    else re += ch.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  // Papka nomi berilgan bo'lsa — ichidagi hamma narsa ham «Tegma».
  return new RegExp(`^${re}(?:/.*)?$`, "i");
}

/** `rel` (posix, ish papkasiga nisbatan) glob'lardan biriga mos keladimi. */
export function matchesTegma(globs, rel) {
  const p = String(rel).replace(/\\/g, "/").replace(/^\.\//, "");
  return (globs ?? []).some((g) => globToRegExp(g).test(p));
}

// ---- Matn / ikkilik / qator oxiri ----------------------------------------

/** Buferda ikkilik (binary) alomatlari bormi: NUL yoki ko'p boshqaruv belgisi. */
export function looksBinary(buf) {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf ?? "");
  const n = Math.min(b.length, 8192);
  if (n === 0) return false;
  let weird = 0;
  for (let i = 0; i < n; i++) {
    const c = b[i];
    if (c === 0) return true;
    if (c < 9 || (c > 13 && c < 32)) weird++;
  }
  return weird / n > 0.1;
}

/** Fayldagi eng uzun qator uzunligi. */
export function maxLineLength(text) {
  let max = 0;
  let start = 0;
  const s = String(text);
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) === 10) {
      if (i - start > max) max = i - start;
      start = i + 1;
    }
  }
  return Math.max(max, s.length - start);
}

/** Fayl qator oxiri uslubi: ko'pchilik CRLF bo'lsa — "crlf". */
export function detectEol(text) {
  const s = String(text);
  const crlf = (s.match(/\r\n/g) ?? []).length;
  const lf = (s.match(/\n/g) ?? []).length;
  if (!lf) return "lf";
  return crlf * 2 >= lf ? "crlf" : "lf";
}

/** Fayl oxirida yangi qator bormi. */
export function hasFinalNewline(text) {
  return /\r?\n$/.test(String(text));
}

/**
 * Muharrirdagi matnni fayl uslubiga qaytaradi: qator oxirlari va oxirgi
 * yangi qator asl fayldagidek bo'ladi.
 */
export function applyEol(text, eol, finalNewline) {
  let s = String(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (finalNewline) {
    if (!s.endsWith("\n")) s += "\n";
  } else {
    s = s.replace(/\n+$/, "");
  }
  return eol === "crlf" ? s.replace(/\n/g, "\r\n") : s;
}

/** Fayl ochilgandan keyin diskda o'zgarganmi (mtime yoki hajm). */
export function isStale(current, expected) {
  if (!expected || typeof expected.mtimeMs !== "number") return false;
  if (!current) return true;
  if (current.size !== expected.size) return true;
  return Math.abs(current.mtimeMs - expected.mtimeMs) > 1;
}

// ---- Atomar yozish --------------------------------------------------------

/**
 * Vaqtinchalik fayl + rename. Yarim yozilgan fayl qolmaydi; xatoda vaqtinchalik
 * fayl o'chiriladi. Mavjud faylning ruxsatlari (mode) saqlanadi.
 */
export function atomicWrite(real, data) {
  const dir = dirname(real);
  const tmp = join(dir, `.${basename(real)}.${randomBytes(6).toString("hex")}.sovtmp`);
  let mode;
  try {
    mode = statSync(real).mode;
  } catch {
    mode = undefined;
  }
  try {
    writeFileSync(tmp, data, { flag: "wx" });
    if (mode !== undefined) {
      try {
        chmodSync(tmp, mode);
      } catch {
        /* ruxsatni ko'chirib bo'lmadi — fayl baribir yoziladi */
      }
    }
    renameSync(tmp, real);
  } catch (e) {
    try {
      rmSync(tmp, { force: true });
    } catch {
      /* tozalash muvaffaqiyatsiz — muhim emas */
    }
    throw e;
  }
}

/** `name` bandmi — bo'sh nom topguncha " (2)", " (3)" … qo'shadi. */
export function uniqueName(dir, name, exists = existsSync) {
  const ext = extname(name);
  const stem = ext ? name.slice(0, -ext.length) : name;
  if (!exists(join(dir, name))) return name;
  for (let i = 2; i < 1000; i++) {
    const cand = `${stem} (${i})${ext}`;
    if (!exists(join(dir, cand))) return cand;
  }
  return `${stem} (${Date.now()})${ext}`;
}

// ---- IPC ------------------------------------------------------------------

/**
 * Muharrir IPC kanallarini ro'yxatdan o'tkazadi.
 *
 * @param {object} deps
 * @param {(ch: string, fn: Function) => void} deps.handle  main.mjs dagi tekshiruvli handle
 * @param {() => string|null} deps.getWorkspace              joriy ish papkasi
 * @param {(p: string, root?: string) => {real: string, rel: string, outside: boolean}} deps.resolvePath
 * @param {(real: string, o?: object) => boolean} deps.isProtected
 * @param {{ add: (real: string) => string|null }} deps.backups  Undo zaxirasi (main.mjs)
 * @param {object} deps.shell   Electron shell (trashItem, showItemInFolder)
 * @param {(type: string, payload?: object) => void} deps.send   renderer'ga hodisa
 */
export function registerFilesIpc({ handle, getWorkspace, resolvePath, isProtected, backups, shell, send }) {
  // --- Tekshiruv ---------------------------------------------------------
  /**
   * Renderer bergan yo'lni tekshiradi. Xato — kod (renderer `fsErr.<kod>` bilan tarjima qiladi).
   * @returns {{error: string}|{real: string, rel: string, tegma: boolean}}
   */
  function check(p, { write = false, allowTegma = false } = {}) {
    const ws = getWorkspace();
    if (!ws) return { error: "no-folder" };
    if (typeof p !== "string" || !p || p.length > 4096 || p.includes("\0")) return { error: "bad-path" };
    if (/^[\\/]{2}/.test(p)) return { error: "unc" };
    let r;
    try {
      r = resolvePath(p, ws);
    } catch {
      return { error: "bad-path" };
    }
    if (r.outside || /^[\\/]{2}/.test(r.real)) return { error: "outside" };
    if (isProtected(r.real, { write, outside: false })) return { error: "protected" };
    // `.env` — ish papkasi ichida ham muharrirda ochilmaydi/yozilmaydi (sirlar).
    if (isEnvFile(r.real)) return { error: "protected" };
    const rel = r.rel.split(sep).join("/");
    const tegma = matchesTegma(tegmaGlobs(ws), rel);
    if (tegma && !allowTegma) return { error: "tegma", rel };
    return { real: r.real, rel, tegma };
  }

  // «Tegma» ro'yxati SOVEREIGN.md dan o'qiladi va mtime bo'yicha keshlanadi.
  let tegmaCache = { key: "", mtimeMs: -1, globs: [] };
  function tegmaGlobs(ws) {
    const candidates = [join(ws, "SOVEREIGN.md"), join(ws, ".sovereign", "PROJECT.md")];
    for (const f of candidates) {
      let st;
      try {
        st = statSync(f);
      } catch {
        continue;
      }
      if (!st.isFile()) continue;
      if (tegmaCache.key === f && tegmaCache.mtimeMs === st.mtimeMs) return tegmaCache.globs;
      let globs = [];
      try {
        globs = st.size <= 256 * 1024 ? parseTegma(readFileSync(f, "utf8")) : [];
      } catch {
        globs = [];
      }
      tegmaCache = { key: f, mtimeMs: st.mtimeMs, globs };
      return globs;
    }
    tegmaCache = { key: "", mtimeMs: -1, globs: [] };
    return [];
  }

  const fsError = (e) => {
    if (e?.code === "ENOENT") return { error: "not-found" };
    if (e?.code === "EEXIST") return { error: "exists" };
    if (e?.code === "EACCES" || e?.code === "EPERM") return { error: "denied" };
    return { error: "io", detail: typeof e?.code === "string" ? e.code : "" };
  };

  /** Papka ichidagi yo'l uchun ota-papka + nom tekshiruvi. */
  function childOf(dirPath, name, opts = {}) {
    const nameErr = validateName(name);
    if (nameErr) return { error: nameErr };
    const d = check(dirPath, { write: true, ...opts });
    if (d.error) return d;
    try {
      if (!statSync(d.real).isDirectory()) return { error: "not-dir" };
    } catch (e) {
      return fsError(e);
    }
    return check(join(d.real, name), { write: true, ...opts });
  }

  // --- Ochish ------------------------------------------------------------
  handle("fs:open", async (_e, arg) => {
    const chk = check(arg?.path, { allowTegma: true });
    if (chk.error) return chk;
    let st;
    try {
      st = lstatSync(chk.real);
      if (st.isSymbolicLink()) st = statSync(chk.real);
    } catch (e) {
      return fsError(e);
    }
    if (st.isDirectory()) return { error: "is-dir" };
    const ext = extname(chk.real).toLowerCase();
    const meta = { path: chk.real, rel: chk.rel, name: basename(chk.real), size: st.size, mtimeMs: st.mtimeMs, tegma: chk.tegma };

    // Rasm — faqat ko'rish (data: URL; CSP img-src 'self' data:).
    if (IMAGE_TYPES[ext]) {
      if (st.size > IMAGE_MAX_BYTES) return { ...meta, kind: "image", readOnly: true, tooLarge: true };
      try {
        const buf = readFileSync(chk.real);
        return { ...meta, kind: "image", readOnly: true, dataUrl: `data:${IMAGE_TYPES[ext]};base64,${buf.toString("base64")}` };
      } catch (e) {
        return fsError(e);
      }
    }
    if (st.size > READ_MAX_BYTES) return { ...meta, kind: "text", readOnly: true, tooLarge: true, content: "" };

    let buf;
    try {
      buf = readFileSync(chk.real);
    } catch (e) {
      return fsError(e);
    }
    if (looksBinary(buf)) return { ...meta, kind: "binary", readOnly: true };

    const full = buf.toString("utf8");
    const eol = detectEol(full);
    const finalNewline = hasFinalNewline(full);
    const tooLarge = st.size > EDIT_MAX_BYTES;
    const truncated = full.length > PREVIEW_MAX_CHARS;
    const shown = truncated ? full.slice(0, PREVIEW_MAX_CHARS) : full;
    const longLines = maxLineLength(shown) > LONG_LINE;
    return {
      ...meta,
      kind: "text",
      // Muharrir doim "\n" bilan ishlaydi; saqlashda asl uslub qaytariladi.
      content: shown.replace(/\r\n/g, "\n"),
      eol,
      finalNewline,
      truncated,
      tooLarge,
      longLines,
      readOnly: tooLarge || truncated || longLines || chk.tegma,
    };
  });

  /** Ochilgan yorliq uchun: fayl diskda o'zgarganmi. */
  handle("fs:stat", async (_e, arg) => {
    const chk = check(arg?.path, { allowTegma: true });
    if (chk.error) return chk;
    try {
      const st = statSync(chk.real);
      return { ok: true, size: st.size, mtimeMs: st.mtimeMs, dir: st.isDirectory() };
    } catch (e) {
      return fsError(e);
    }
  });

  // --- Saqlash -----------------------------------------------------------
  handle("fs:write", async (_e, arg) => {
    const chk = check(arg?.path, { write: true, allowTegma: arg?.confirmTegma === true });
    if (chk.error) return chk;
    if (typeof arg?.content !== "string") return { error: "bad-path" };
    if (arg.content.length > READ_MAX_BYTES) return { error: "too-large" };
    if (arg.eol != null && arg.eol !== "lf" && arg.eol !== "crlf") return { error: "bad-path" };

    let cur = null;
    try {
      const st = statSync(chk.real);
      if (st.isDirectory()) return { error: "is-dir" };
      cur = { size: st.size, mtimeMs: st.mtimeMs };
    } catch (e) {
      if (e?.code !== "ENOENT") return fsError(e);
    }
    // Ochilgandan keyin boshqa birov (agent, tashqi muharrir) yozgan bo'lsa — rad.
    if (arg.force !== true && isStale(cur, arg.expect)) {
      return { error: "stale", size: cur?.size ?? 0, mtimeMs: cur?.mtimeMs ?? 0, missing: !cur };
    }
    if (!cur && arg.expect) return { error: "stale", missing: true, size: 0, mtimeMs: 0 };

    // Undo: asl baytlar main'dagi zaxiraga (O'zgarishlar panelidagi Undo shuni tiklaydi).
    const backupId = backups?.add ? backups.add(chk.real) : null;
    const data = applyEol(arg.content, arg.eol ?? "lf", arg.finalNewline !== false);
    try {
      mkdirSync(dirname(chk.real), { recursive: true });
      atomicWrite(chk.real, Buffer.from(data, "utf8"));
      const st = statSync(chk.real);
      send?.("fs-changed", { paths: [chk.real] });
      return { ok: true, size: st.size, mtimeMs: st.mtimeMs, backupId, rel: chk.rel, existed: !!cur };
    } catch (e) {
      return fsError(e);
    }
  });

  // --- Yaratish ----------------------------------------------------------
  handle("fs:create", async (_e, arg) => {
    const kind = arg?.kind === "folder" ? "folder" : "file";
    const target = childOf(arg?.dir, arg?.name, { allowTegma: arg?.confirmTegma === true });
    if (target.error) return target;
    if (existsSync(target.real)) return { error: "exists" };
    try {
      if (kind === "folder") {
        mkdirSync(target.real);
        send?.("fs-changed", { paths: [target.real] });
        return { ok: true, path: target.real, rel: target.rel, kind };
      }
      const backupId = backups?.add ? backups.add(target.real) : null; // existed:false → Undo o'chiradi
      writeFileSync(target.real, "", { flag: "wx" });
      send?.("fs-changed", { paths: [target.real] });
      return { ok: true, path: target.real, rel: target.rel, kind, backupId };
    } catch (e) {
      return fsError(e);
    }
  });

  // --- Nomini o'zgartirish -----------------------------------------------
  handle("fs:rename", async (_e, arg) => {
    const src = check(arg?.path, { write: true, allowTegma: arg?.confirmTegma === true });
    if (src.error) return src;
    const dst = childOf(dirname(src.real), arg?.name, { allowTegma: arg?.confirmTegma === true });
    if (dst.error) return dst;
    if (dst.real === src.real) return { ok: true, path: src.real, rel: src.rel };
    if (existsSync(dst.real)) return { error: "exists" };
    try {
      renameSync(src.real, dst.real);
      send?.("fs-changed", { paths: [src.real, dst.real] });
      return { ok: true, path: dst.real, rel: dst.rel, from: src.real };
    } catch (e) {
      return fsError(e);
    }
  });

  // --- Nusxa olish --------------------------------------------------------
  handle("fs:duplicate", async (_e, arg) => {
    const src = check(arg?.path, { allowTegma: true });
    if (src.error) return src;
    let st;
    try {
      st = statSync(src.real);
    } catch (e) {
      return fsError(e);
    }
    if (st.isDirectory()) return { error: "is-dir" };
    if (st.size > READ_MAX_BYTES) return { error: "too-large" };
    const name = uniqueName(dirname(src.real), basename(src.real));
    const dst = childOf(dirname(src.real), name, { allowTegma: arg?.confirmTegma === true });
    if (dst.error) return dst;
    try {
      const backupId = backups?.add ? backups.add(dst.real) : null;
      writeFileSync(dst.real, readFileSync(src.real), { flag: "wx" });
      send?.("fs-changed", { paths: [dst.real] });
      return { ok: true, path: dst.real, rel: dst.rel, backupId };
    } catch (e) {
      return fsError(e);
    }
  });

  // --- O'chirish (OS savati) ---------------------------------------------
  handle("fs:trash", async (_e, arg) => {
    const chk = check(arg?.path, { write: true, allowTegma: arg?.confirmTegma === true });
    if (chk.error) return chk;
    const ws = getWorkspace();
    if (chk.real === ws) return { error: "outside" }; // ish papkasining o'zi emas
    if (!existsSync(chk.real)) return { error: "not-found" };
    try {
      await shell.trashItem(chk.real);
    } catch (e) {
      return fsError(e);
    }
    send?.("fs-changed", { paths: [chk.real] });
    return { ok: true, path: chk.real, rel: chk.rel };
  });

  // --- Explorer/Finder'da ko'rsatish --------------------------------------
  handle("fs:reveal-item", async (_e, arg) => {
    const chk = check(arg?.path, { allowTegma: true });
    if (chk.error) return chk;
    if (!existsSync(chk.real)) return { error: "not-found" };
    shell.showItemInFolder(chk.real);
    return { ok: true };
  });

  // --- Kuzatuvchi (debounce) ---------------------------------------------
  // Agent yoki tashqi muharrir fayl o'zgartirsa — daraxt va ochiq yorliqlar yangilanadi.
  let watcher = null;
  let watchRoot = "";
  let timer = null;
  let batch = new Set();

  function flush() {
    timer = null;
    const paths = [...batch].slice(0, 200);
    batch = new Set();
    if (paths.length) send?.("fs-changed", { paths });
  }

  function ensureWatch(dir) {
    if (dir === watchRoot) return;
    stopWatch();
    if (!dir) return;
    watchRoot = dir;
    try {
      watcher = watch(dir, { recursive: true, persistent: false }, (_type, filename) => {
        if (!filename) return;
        const f = String(filename);
        // Shovqinni kesamiz: node_modules, .git va vaqtinchalik fayllarimiz.
        if (/(^|[\\/])(node_modules|\.git|\.next|dist|ui-dist|release|__pycache__)([\\/]|$)/.test(f)) return;
        if (/\.sovtmp$/.test(f)) return;
        batch.add(join(dir, f));
        if (!timer) timer = setTimeout(flush, 300);
        timer?.unref?.();
      });
      watcher.on?.("error", () => stopWatch());
    } catch {
      watcher = null; // rekursiv kuzatuv qo'llab-quvvatlanmasa — yangilash qo'lda
    }
  }

  function stopWatch() {
    try {
      watcher?.close();
    } catch {
      /* allaqachon yopilgan */
    }
    watcher = null;
    watchRoot = "";
    if (timer) clearTimeout(timer);
    timer = null;
    batch = new Set();
  }

  return { ensureWatch, stopWatch, check, tegmaGlobs };
}

/** Testlar uchun: papkadagi fayllar ro'yxati (tartiblangan). */
export function listDir(dir) {
  try {
    return readdirSync(dir).sort();
  } catch {
    return [];
  }
}
