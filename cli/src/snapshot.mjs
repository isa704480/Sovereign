// SOVEREIGN — shell buyruqlari uchun Undo (CLI va Cowork desktop umumiy moduli).
//
// Muammo: agent `rm -rf`, `del`, `git reset --hard`, `mv` bilan ma'lumotni yo'q
// qilishi mumkin; write_file zaxirasi shell buyruqlarini qamramaydi.
// Yechim: "safe" (faqat-o'qish) bo'lmagan run_command'dan OLDIN ish papkasining
// yengil nusxasi olinadi (kontent-manzilli, hash → baytlar, nusxalar orasida
// takrorlanmaydi), buyruqdan KEYIN farq hisoblanadi (o'chirilgan / o'zgargan /
// yangi fayllar). Hech narsa o'zgarmagan bo'lsa nusxa tashlanadi. Tiklash: o'chirilgan
// va o'zgargan fayllar asl holiga qaytadi, buyruq yaratgan fayllar o'chiriladi.
//
// Xavfsizlik:
//  - symlink/junction'larga HECH QACHON ergashilmaydi (yurishda ham, tiklashda ham);
//  - faqat ish papkasi ichida, himoyalangan yo'llarga (isProtected) tegilmaydi;
//  - nusxa to'liq olinmagan papkadagi "yangi" fayllar o'chirilmaydi (noma'lum = tegilmaydi);
//  - yaratilgan fayl keyin o'zgargan bo'lsa (hash mos emas) — o'chirilmaydi.
//
// Tezlik: fayl o'lchami/mtime oldingi nusxadagidek bo'lsa qayta o'qilmaydi (hash
// keshdan); og'ir/hosila papkalar (node_modules, .git, dist ...) o'tkazib yuboriladi;
// barcha I/O asinxron — Electron main jarayoni sezilarli bloklanmaydi.

import { promises as fsp, realpathSync, rmSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { homedir } from "node:os";
import { createHash, randomBytes } from "node:crypto";
import { classifyCommand, resolvePath, isProtected } from "./tools.mjs";

export const SNAPSHOT_LIMITS = {
  /** Bundan katta fayl nusxalanmaydi (o'chirilsa — "tiklab bo'lmaydi"). */
  maxFileBytes: 5 * 1024 * 1024,
  /** Bitta nusxada yangi o'qiladigan baytlar chegarasi. */
  maxSnapshotBytes: 200 * 1024 * 1024,
  /** Bitta nusxadagi fayllar soni chegarasi. */
  maxFiles: 20_000,
  /** Nusxa olish vaqti chegarasi (ms) — oshsa nusxa "qisman". */
  timeBudgetMs: 5_000,
  /** Saqlanadigan oxirgi nusxalar soni. */
  maxSnapshots: 20,
  /** Ombordagi obyektlar umumiy hajmi chegarasi. */
  maxStoreBytes: 512 * 1024 * 1024,
};

/** Og'ir yoki qayta tiklanadigan (hosila) papkalar — nomi bo'yicha, har qanday chuqurlikda. */
const SKIP_DIRS = new Set([
  "node_modules", ".git", ".hg", ".svn", "dist", "build", ".next", ".nuxt", ".svelte-kit", ".output",
  "out", "target", "venv", ".venv", "__pycache__", ".pytest_cache", ".mypy_cache", ".ruff_cache", ".tox",
  "coverage", ".nyc_output", ".turbo", ".cache", ".parcel-cache", ".vercel", ".gradle", ".terraform",
  "release", "ui-dist", ".expo", "bower_components", "vendor",
]);
/** Ildizga nisbatan o'tkazib yuboriladigan yo'llar. */
const SKIP_REL = new Set([".claude/worktrees", "desktop/release"]);

/** mtime aniqligi (FAT/SMB ~2 s): shu oraliqdagi fayl hash bilan qayta tekshiriladi. */
const RACY_MS = 2_000;

const hashOf = (buf) => createHash("sha256").update(buf).digest("hex");
const parentRel = (rel) => {
  const i = rel.lastIndexOf("/");
  return i === -1 ? "" : rel.slice(0, i);
};
const toAbs = (root, rel) => (rel ? join(root, ...rel.split("/")) : root);
const depth = (rel) => (rel ? rel.split("/").length : 0);

/** Parallel ishlov (n ta ishchi). */
async function pool(items, n, fn) {
  let i = 0;
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const k = i++;
      await fn(items[k], k);
    }
  });
  await Promise.all(workers);
}

function skipDir(name, rel) {
  return SKIP_DIRS.has(name.toLowerCase()) || SKIP_REL.has(rel.toLowerCase());
}

/**
 * Ish papkasini yuradi (symlinklarga ergashmaydi). Qaytaradi:
 *  files  — rel → { size, mtimeMs }
 *  dirs   — ko'rilgan papkalar (ro'yxati olinmagan bo'lishi mumkin)
 *  walked — ro'yxati TO'LIQ olingan papkalar (shu papkalar bo'yicha xulosa ishonchli)
 */
async function walkTree(root, { maxFiles, deadline }) {
  const files = new Map();
  const dirs = new Set([""]);
  const walked = new Set();
  const queue = [""];
  let complete = true;
  while (queue.length) {
    if (files.size >= maxFiles || Date.now() > deadline) {
      complete = false;
      break;
    }
    const relDir = queue.shift();
    let entries;
    try {
      entries = await fsp.readdir(toAbs(root, relDir), { withFileTypes: true });
    } catch {
      continue; // o'qib bo'lmadi — "walked" emas (xulosa chiqarilmaydi)
    }
    const fileRels = [];
    for (const e of entries) {
      const rel = relDir ? `${relDir}/${e.name}` : e.name;
      if (e.isSymbolicLink()) continue; // symlink/junction — hech qachon
      if (e.isDirectory()) {
        if (skipDir(e.name, rel)) continue;
        if (isProtected(toAbs(root, rel), { write: true })) continue;
        dirs.add(rel);
        queue.push(rel);
      } else if (e.isFile()) {
        if (isProtected(toAbs(root, rel), { write: true })) continue;
        fileRels.push(rel);
      }
    }
    if (files.size + fileRels.length > maxFiles) {
      complete = false;
      fileRels.length = Math.max(0, maxFiles - files.size);
    } else {
      walked.add(relDir);
    }
    await pool(fileRels, 32, async (rel) => {
      try {
        const st = await fsp.lstat(toAbs(root, rel));
        if (st.isFile()) files.set(rel, { size: st.size, mtimeMs: st.mtimeMs });
      } catch {
        /* yo'qolgan */
      }
    });
  }
  if (queue.length) complete = false;
  return { files, dirs, walked, complete };
}

/** Jarayon tirikmi (eski nusxa papkalarini tozalash uchun). */
function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e?.code === "EPERM";
  }
}

/**
 * Ildiz→maqsad oralig'idagi MAVJUD har bir bo'g'in haqiqiy papka (symlink/junction
 * emas) ekanini tekshiradi. Yetishmagan papkalar `create` bo'lsa yaratiladi.
 * Qaytaradi: xato kodi yoki null.
 */
async function safeParent(root, relParent, create) {
  let cur = root;
  const parts = relParent ? relParent.split("/") : [];
  for (let i = 0; i < parts.length; i++) {
    cur = join(cur, parts[i]);
    let st = null;
    try {
      st = await fsp.lstat(cur);
    } catch {
      st = null;
    }
    if (!st) {
      if (!create) return "missing";
      try {
        await fsp.mkdir(cur);
      } catch (e) {
        if (e?.code !== "EEXIST") return "mkdir";
        const again = await fsp.lstat(cur).catch(() => null);
        if (!again || again.isSymbolicLink() || !again.isDirectory()) return "not-dir";
      }
      continue;
    }
    if (st.isSymbolicLink()) return "symlink";
    if (!st.isDirectory()) return "not-dir";
  }
  return null;
}

/** Maqsad yo'l tiklash uchun xavfsizmi (ish papkasi ichida, himoyalanmagan)? */
function targetOk(root, rel) {
  if (!rel || rel.split("/").some((s) => !s || s === "." || s === "..")) return false;
  const abs = toAbs(root, rel);
  const r = resolvePath(dirname(abs), root);
  if (r.outside) return false;
  if (isProtected(abs, { write: true }) || isProtected(r.real, { write: true })) return false;
  return true;
}

/** Faqat "risky" (faqat-o'qish emas, bloklanmagan) buyruqlar uchun nusxa olinadi. */
export function isSnapshotCommand(command) {
  return classifyCommand(String(command ?? "")).level === "risky";
}

/** O'zbekcha qisqa xulosa: "3 ta o'chirilgan, 2 ta o'zgargan, 1 ta yangi". */
export function describeCounts(counts) {
  const parts = [];
  if (counts.deleted) parts.push(`${counts.deleted} ta o'chirilgan`);
  if (counts.modified) parts.push(`${counts.modified} ta o'zgargan`);
  if (counts.created) parts.push(`${counts.created} ta yangi`);
  if (counts.lost) parts.push(`${counts.lost} ta tiklab bo'lmaydi`);
  return parts.join(", ");
}

export class SnapshotStore {
  /**
   * @param {{ baseDir?: string, limits?: Partial<typeof SNAPSHOT_LIMITS> }} [opts]
   *   baseDir — nusxalar papkasi (desktop: userData/snapshots; CLI: ~/.sovereign/snapshots).
   *   Har jarayon o'z ichki papkasini oladi; chiqishda o'chiriladi.
   */
  constructor({ baseDir = join(homedir(), ".sovereign", "snapshots"), limits = {} } = {}) {
    this.baseDir = baseDir;
    this.limits = { ...SNAPSHOT_LIMITS, ...limits };
    this.dir = join(baseDir, `p${process.pid}-${randomBytes(4).toString("hex")}`);
    this.objects = new Map(); // hash → size
    this.totalBytes = 0;
    this.snaps = []; // eskidan yangiga
    this.seq = 0;
    this.cache = { root: null, map: new Map() }; // rel → { size, mtimeMs, hash, at }
    this.dirReady = null;
    this.onExit = () => this.dispose();
    process.once("exit", this.onExit);
  }

  #ensureDir() {
    if (!this.dirReady) {
      this.dirReady = fsp.mkdir(join(this.dir, "objects"), { recursive: true }).then(() => {
        this.#cleanStale(); // fonda — natijasi kutilmaydi
      });
    }
    return this.dirReady;
  }

  /** Yiqilgan (tugamay qolgan) jarayonlarning eski nusxa papkalari. */
  async #cleanStale() {
    let names = [];
    try {
      names = await fsp.readdir(this.baseDir);
    } catch {
      return;
    }
    const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
    for (const name of names) {
      const m = /^p(\d+)-[0-9a-f]+$/.exec(name);
      if (!m || join(this.baseDir, name) === this.dir) continue;
      const full = join(this.baseDir, name);
      const st = await fsp.stat(full).catch(() => null);
      if (!st) continue;
      if (!pidAlive(Number(m[1])) || st.mtimeMs < weekAgo) await fsp.rm(full, { recursive: true, force: true }).catch(() => {});
    }
  }

  #objPath(hash) {
    return join(this.dir, "objects", hash.slice(0, 2), hash);
  }

  async #putObject(hash, buf) {
    if (this.objects.has(hash)) return true;
    this.objects.set(hash, buf.length);
    this.totalBytes += buf.length;
    try {
      await this.#ensureDir();
      await fsp.mkdir(dirname(this.#objPath(hash)), { recursive: true });
      await fsp.writeFile(this.#objPath(hash), buf, { flag: "wx" });
      return true;
    } catch (e) {
      if (e?.code === "EEXIST") return true;
      this.objects.delete(hash);
      this.totalBytes -= buf.length;
      return false;
    }
  }

  async #readObject(hash) {
    const buf = await fsp.readFile(this.#objPath(hash));
    if (hashOf(buf) !== hash) throw Object.assign(new Error("corrupt"), { code: "ECORRUPT" });
    return buf;
  }

  #cacheFor(root) {
    if (this.cache.root !== root) this.cache = { root, map: new Map() };
    return this.cache.map;
  }

  /**
   * Buyruqdan OLDIN nusxa. Nusxa olib bo'lmasa (papka yo'q, disk ildizi, uy papkasi) — null.
   * @returns {Promise<object|null>}
   */
  async take(rootDir, { command = "" } = {}) {
    let root;
    try {
      root = realpathSync.native(resolve(String(rootDir)));
      if (!(await fsp.stat(root)).isDirectory()) return null;
    } catch {
      return null;
    }
    // Disk ildizi yoki uy papkasi — juda katta; himoyalangan joy — tegilmaydi.
    if (dirname(root) === root) return null;
    const home = realpathSync.native(homedir());
    if (root.toLowerCase() === home.toLowerCase()) return null;
    if (isProtected(root, { write: true })) return null;

    const L = this.limits;
    const takenAt = Date.now();
    const deadline = takenAt + L.timeBudgetMs;
    const files = new Map();
    // Ro'yxatga darhol qo'shiladi — parallel gc bu nusxa ishlatayotgan obyektlarni o'chirmasin.
    const snap = {
      id: `s${takenAt.toString(36)}${randomBytes(3).toString("hex")}`,
      n: ++this.seq,
      root,
      command: String(command),
      takenAt,
      files,
      dirs: null,
      walked: null,
      partial: false,
      state: "pending",
      changes: null,
    };
    this.snaps.push(snap);
    try {
      return await this.#fill(snap, deadline);
    } catch (e) {
      this.#remove(snap);
      throw e;
    }
  }

  async #fill(snap, deadline) {
    const L = this.limits;
    const { root, files } = snap;
    const w = await walkTree(root, { maxFiles: L.maxFiles, deadline });
    const cache = this.#cacheFor(root);
    const toRead = [];
    let partial = !w.complete;
    for (const [rel, st] of w.files) {
      const c = cache.get(rel);
      const racy = c && c.mtimeMs >= c.at - RACY_MS;
      if (c && !racy && c.size === st.size && c.mtimeMs === st.mtimeMs && this.objects.has(c.hash)) {
        files.set(rel, { ...st, hash: c.hash });
        continue;
      }
      files.set(rel, { ...st, hash: null });
      if (st.size > L.maxFileBytes) continue; // katta fayl — "tiklab bo'lmaydi"
      toRead.push(rel);
    }
    let newBytes = 0;
    await pool(toRead, 8, async (rel) => {
      const ent = files.get(rel);
      if (Date.now() > deadline || newBytes + ent.size > L.maxSnapshotBytes) {
        partial = true;
        return;
      }
      newBytes += ent.size;
      try {
        const buf = await fsp.readFile(toAbs(root, rel));
        if (buf.length > L.maxFileBytes) return;
        const hash = hashOf(buf);
        if (!(await this.#putObject(hash, buf))) return;
        ent.hash = hash;
        cache.set(rel, { size: ent.size, mtimeMs: ent.mtimeMs, hash, at: Date.now() });
      } catch {
        /* o'qib bo'lmadi — hash null */
      }
    });
    snap.dirs = w.dirs;
    snap.walked = w.walked;
    snap.partial = partial;
    return snap;
  }

  /**
   * Buyruqdan KEYIN: farqni hisoblaydi. O'zgarish yo'q bo'lsa nusxa tashlanadi → null.
   * @returns {Promise<ReturnType<SnapshotStore["summary"]>|null>}
   */
  async finish(snap) {
    if (!snap || snap.state !== "pending" || !this.snaps.includes(snap)) return null;
    const L = this.limits;
    const deadline = Date.now() + L.timeBudgetMs * 2;
    const aw = await walkTree(snap.root, { maxFiles: L.maxFiles * 3, deadline });

    // Nusxada shu yo'l bo'yicha ishonchli ma'lumot bormi (eng yaqin ma'lum ota papka to'liq ko'rilganmi)?
    const knownBefore = (rel) => {
      let p = parentRel(rel);
      for (;;) {
        if (snap.dirs.has(p)) return snap.walked.has(p);
        if (p === "") return false;
        p = parentRel(p);
      }
    };
    // Keyingi holatda shu yo'l yo'qligi ishonchlimi?
    const goneAfter = (rel) => {
      let p = parentRel(rel);
      for (;;) {
        if (aw.dirs.has(p)) return aw.walked.has(p);
        if (p === "") return false;
        p = parentRel(p);
      }
    };

    const newCache = new Map();
    const deleted = [];
    const modified = [];
    const created = [];
    const lost = [];
    const hashFile = async (rel, size) => {
      if (size > L.maxFileBytes || Date.now() > deadline) return null;
      try {
        const buf = await fsp.readFile(toAbs(snap.root, rel));
        const hash = hashOf(buf);
        // Keyingi nusxa uchun kesh — fayl o'zgarmasa qayta o'qilmaydi.
        await this.#putObject(hash, buf);
        return hash;
      } catch {
        return null;
      }
    };

    const checks = [];
    for (const [rel, before] of snap.files) {
      const after = aw.files.get(rel);
      if (!after) {
        if (!goneAfter(rel)) continue; // noma'lum — ko'rilmagan papka
        if (before.hash) deleted.push({ rel, hash: before.hash, size: before.size });
        else lost.push({ rel, kind: "deleted" });
        continue;
      }
      const racy = before.mtimeMs >= snap.takenAt - RACY_MS;
      if (!racy && after.size === before.size && after.mtimeMs === before.mtimeMs) {
        if (before.hash) newCache.set(rel, { size: after.size, mtimeMs: after.mtimeMs, hash: before.hash, at: snap.takenAt });
        continue;
      }
      checks.push([rel, before, after]);
    }
    await pool(checks, 8, async ([rel, before, after]) => {
      const afterHash = await hashFile(rel, after.size);
      if (afterHash) newCache.set(rel, { size: after.size, mtimeMs: after.mtimeMs, hash: afterHash, at: Date.now() });
      if (afterHash && before.hash && afterHash === before.hash) return; // faqat mtime o'zgargan
      if (!before.hash) {
        if (after.size !== before.size || after.mtimeMs !== before.mtimeMs) lost.push({ rel, kind: "modified" });
        return;
      }
      if (!afterHash && after.size === before.size && after.mtimeMs === before.mtimeMs) return; // tekshirib bo'lmadi, stat bir xil
      modified.push({ rel, hash: before.hash, size: before.size, afterHash, afterSize: after.size, afterMtime: after.mtimeMs });
    });
    const newFiles = [...aw.files].filter(([rel]) => !snap.files.has(rel) && knownBefore(rel));
    await pool(newFiles, 8, async ([rel, st]) => {
      const afterHash = await hashFile(rel, st.size);
      if (afterHash) newCache.set(rel, { size: st.size, mtimeMs: st.mtimeMs, hash: afterHash, at: Date.now() });
      created.push({ rel, afterHash, afterSize: st.size, afterMtime: st.mtimeMs });
    });
    const dirsDeleted = [...snap.dirs].filter((d) => d && snap.walked.has(d) && !aw.dirs.has(d) && goneAfter(d));
    const dirsCreated = [...aw.dirs].filter((d) => d && !snap.dirs.has(d) && knownBefore(d));

    // Kesh — buyruqdan keyingi holat (yangi nusxa tez olinadi).
    this.cache = { root: snap.root, map: newCache };

    const byRel = (a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0);
    const changes = {
      deleted: deleted.sort(byRel),
      modified: modified.sort(byRel),
      created: created.sort(byRel),
      lost: lost.sort(byRel),
      dirsDeleted: dirsDeleted.sort(),
      dirsCreated: dirsCreated.sort(),
    };
    // Xotirani bo'shatish — faqat farq saqlanadi.
    snap.files = null;
    snap.dirs = null;
    snap.walked = null;

    const any = changes.deleted.length + changes.modified.length + changes.created.length + changes.lost.length + changes.dirsDeleted.length;
    if (!any) {
      this.#remove(snap);
      await this.#gc();
      return null;
    }
    snap.changes = changes;
    snap.state = "done";
    await this.#prune();
    return this.summary(snap);
  }

  /** UI/CLI uchun xulosa (fayl ro'yxati cheklangan). */
  summary(snap) {
    const ch = snap.changes ?? { deleted: [], modified: [], created: [], lost: [], dirsDeleted: [] };
    const counts = {
      deleted: ch.deleted.length,
      modified: ch.modified.length,
      created: ch.created.length,
      lost: ch.lost.length,
    };
    const files = [
      ...ch.deleted.map((f) => ({ path: f.rel, kind: "deleted" })),
      ...ch.modified.map((f) => ({ path: f.rel, kind: "modified" })),
      ...ch.created.map((f) => ({ path: f.rel, kind: "created" })),
      ...ch.lost.map((f) => ({ path: f.rel, kind: "lost" })),
    ];
    return {
      id: snap.id,
      n: snap.n,
      command: snap.command,
      root: snap.root,
      createdAt: snap.takenAt,
      partial: snap.partial,
      counts,
      total: counts.deleted + counts.modified + counts.created,
      files: files.slice(0, 200),
      moreFiles: Math.max(0, files.length - 200),
    };
  }

  /** Tiklash mumkin bo'lgan nusxalar — YANGIDAN eskiga. */
  list() {
    return this.snaps.filter((s) => s.state === "done").reverse().map((s) => this.summary(s));
  }

  has(id) {
    return this.snaps.some((s) => s.id === id && s.state === "done");
  }

  /**
   * Nusxani tiklaydi. Muvaffaqiyatli bo'lsa nusxa ro'yxatdan olib tashlanadi.
   * @returns {Promise<{ok: boolean, error?: string, restored: number, removed: number, kept: string[], failed: {path: string, reason: string}[], lost: number}>}
   */
  async restore(id) {
    const snap = this.snaps.find((s) => s.id === id && s.state === "done");
    if (!snap) return { ok: false, error: "no-backup", restored: 0, removed: 0, kept: [], failed: [], lost: 0 };
    const out = { ok: true, restored: 0, removed: 0, kept: [], failed: [], lost: snap.changes.lost.length };
    let root;
    try {
      root = realpathSync.native(snap.root);
    } catch {
      root = null;
    }
    if (!root || root !== snap.root) return { ...out, ok: false, error: "not-found" };
    const ch = snap.changes;
    const fail = (rel, reason) => out.failed.push({ path: rel, reason });

    // 1) Buyruq yaratgan fayllar — faqat keyin o'zgarmagan bo'lsa o'chiriladi.
    for (const f of ch.created) {
      if (!targetOk(root, f.rel)) {
        fail(f.rel, "protected");
        continue;
      }
      const perr = await safeParent(root, parentRel(f.rel), false);
      if (perr === "missing") continue; // allaqachon yo'q
      if (perr) {
        fail(f.rel, perr);
        continue;
      }
      const abs = toAbs(root, f.rel);
      const st = await fsp.lstat(abs).catch(() => null);
      if (!st) continue;
      if (!st.isFile()) {
        out.kept.push(f.rel);
        continue;
      }
      let same;
      if (f.afterHash) {
        const buf = st.size <= this.limits.maxFileBytes ? await fsp.readFile(abs).catch(() => null) : null;
        same = !!buf && hashOf(buf) === f.afterHash;
      } else {
        same = st.size === f.afterSize && st.mtimeMs === f.afterMtime;
      }
      if (!same) {
        out.kept.push(f.rel); // keyin o'zgargan — foydalanuvchi ishi yo'qolmasin
        continue;
      }
      try {
        await fsp.unlink(abs);
        out.removed++;
      } catch (e) {
        fail(f.rel, e?.code || "io");
      }
    }
    // 2) Buyruq yaratgan papkalar — faqat bo'sh bo'lsa (chuqurdan boshlab).
    for (const d of [...ch.dirsCreated].sort((a, b) => depth(b) - depth(a))) {
      if (!targetOk(root, d)) continue;
      if (await safeParent(root, parentRel(d), false)) continue;
      const st = await fsp.lstat(toAbs(root, d)).catch(() => null);
      if (st?.isDirectory() && !st.isSymbolicLink()) await fsp.rmdir(toAbs(root, d)).catch(() => {});
    }
    // 3) O'chirilgan papkalar (bo'sh bo'lsa ham) qayta yaratiladi.
    for (const d of [...ch.dirsDeleted].sort((a, b) => depth(a) - depth(b))) {
      if (!targetOk(root, d)) continue;
      await safeParent(root, d, true);
    }
    // 4) O'chirilgan va o'zgargan fayllar — asl baytlar.
    for (const f of [...ch.deleted, ...ch.modified]) {
      if (!targetOk(root, f.rel)) {
        fail(f.rel, "protected");
        continue;
      }
      const perr = await safeParent(root, parentRel(f.rel), true);
      if (perr) {
        fail(f.rel, perr);
        continue;
      }
      const abs = toAbs(root, f.rel);
      const st = await fsp.lstat(abs).catch(() => null);
      if (st?.isSymbolicLink()) {
        // Buyruq faylni symlink bilan almashtirgan — havolaning o'zi o'chiriladi (nishoniga tegilmaydi).
        const ok = await fsp.unlink(abs).then(() => true, () => false);
        if (!ok) {
          fail(f.rel, "symlink");
          continue;
        }
      } else if (st && !st.isFile()) {
        fail(f.rel, "not-file");
        continue;
      }
      try {
        const buf = await this.#readObject(f.hash);
        await fsp.writeFile(abs, buf);
        out.restored++;
      } catch (e) {
        fail(f.rel, e?.code || "io");
      }
    }
    if (out.failed.length) {
      out.ok = false;
      out.error = "restore-partial";
      return out;
    }
    this.#remove(snap);
    // Tiklangan fayllarning mtime'i yangi — keshdan olib tashlash shart emas (stat farq qiladi).
    await this.#gc();
    return out;
  }

  /** Nusxani tiklamasdan tashlash. */
  async drop(id) {
    const snap = this.snaps.find((s) => s.id === id);
    if (!snap) return false;
    this.#remove(snap);
    await this.#gc();
    return true;
  }

  /** Barcha nusxalarni tashlash (yangi vazifa / papka almashtirish). */
  async clear() {
    for (const s of this.snaps) s.state = "dropped";
    this.snaps = [];
    await this.#gc();
  }

  #remove(snap) {
    snap.state = "dropped";
    this.snaps = this.snaps.filter((s) => s !== snap);
  }

  async #prune() {
    const L = this.limits;
    const done = () => this.snaps.filter((s) => s.state === "done");
    while (done().length > L.maxSnapshots) this.#remove(done()[0]);
    await this.#gc();
    while (this.totalBytes > L.maxStoreBytes && done().length > 1) {
      this.#remove(done()[0]);
      await this.#gc();
    }
    if (this.totalBytes > L.maxStoreBytes) {
      // Kesh obyektlari ham joy egallaydi — kesh faqat tezlik uchun.
      this.cache = { root: null, map: new Map() };
      await this.#gc();
    }
  }

  /** Hech bir nusxa yoki kesh ishlatmayotgan obyektlarni o'chiradi. */
  async #gc() {
    const used = new Set();
    for (const s of this.snaps) {
      if (s.state === "pending" && s.files) for (const f of s.files.values()) f.hash && used.add(f.hash);
      if (s.state === "done") for (const f of [...s.changes.deleted, ...s.changes.modified]) used.add(f.hash);
    }
    for (const c of this.cache.map.values()) used.add(c.hash);
    const drop = [...this.objects.keys()].filter((h) => !used.has(h));
    for (const h of drop) {
      this.totalBytes -= this.objects.get(h) ?? 0;
      this.objects.delete(h);
    }
    await pool(drop, 16, (h) => fsp.unlink(this.#objPath(h)).catch(() => {}));
  }

  /** Jarayon tugaganda — nusxa papkasi o'chiriladi (sinxron). */
  dispose() {
    process.removeListener("exit", this.onExit);
    this.snaps = [];
    this.objects.clear();
    this.totalBytes = 0;
    try {
      if (existsSync(this.dir)) rmSync(this.dir, { recursive: true, force: true });
    } catch {
      /* e'tiborsiz */
    }
  }
}

/**
 * runTool'ni o'raydi: "risky" run_command TASDIQLANGANDAN keyin (bajarilishidan
 * oldin) nusxa oladi, bajarilgach farqni hisoblaydi va o'zgarish bo'lsa
 * `onChange(summary)` chaqiradi. Boshqa vositalar o'zgarishsiz o'tadi.
 *
 * @param {typeof import("./tools.mjs").runTool} run
 * @param {() => SnapshotStore|null} getStore
 * @param {{ getRoot?: () => string, onChange?: (summary: object) => void }} [opts]
 */
export function withCommandSnapshots(run, getStore, { getRoot = () => process.cwd(), onChange } = {}) {
  return async (name, args, confirm, opts) => {
    const store = name === "run_command" ? getStore?.() : null;
    if (!store || !isSnapshotCommand(args?.command)) return run(name, args, confirm, opts);
    let snap = null;
    const confirmThenSnap = async (...q) => {
      const ok = await confirm(...q);
      if (ok) {
        try {
          snap = await store.take(getRoot(), { command: String(args.command ?? "") });
        } catch {
          snap = null;
        }
      }
      return ok;
    };
    try {
      return await run(name, args, confirmThenSnap, opts);
    } finally {
      if (snap) {
        let info = null;
        try {
          info = await store.finish(snap);
        } catch {
          info = null;
        }
        if (info) {
          try {
            onChange?.(info);
          } catch {
            /* e'tiborsiz */
          }
        }
      }
    }
  };
}

// ---- CLI: sessiya bo'yicha bitta ombor ------------------------------------
let cliStore = null;
/** CLI jarayoni uchun umumiy ombor (~/.sovereign/snapshots/p<pid>-…). */
export function cliSnapshotStore() {
  if (!cliStore) cliStore = new SnapshotStore();
  return cliStore;
}
