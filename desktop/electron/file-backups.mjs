// Cowork write_file Undo zaxirasi — asl baytlar DISKDA (userData/file-backups), xotirada
// faqat kichik indeks. Avval to'liq baytlar (faylga 20 MB gacha) main jarayon xotirasida
// turardi — ko'p fayl yozilganda xotira cheksiz o'sardi.
//
// Cheklovlar: bitta fayl ≤ maxFileBytes (katta fayl zaxiralanmaydi — Undo yo'q), jami
// ≤ maxTotalBytes (oshsa eng eski zaxiralar tashlanadi), yoshi ≤ maxAgeMs. Vazifa
// tugaganda (yangi vazifa / papka almashtirish) clear() hammasini o'chiradi; oldingi
// (yiqilgan) jarayonlardan qolgan eski fayllar birinchi ishlatishda yoshi bo'yicha tozalanadi.
// Fayllar 0600, papka 0700 (POSIX) — ichida loyiha fayllari (.env ham) bo'lishi mumkin.
import { mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync, statSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

export const FILE_BACKUP_LIMITS = {
  maxFileBytes: 20 * 1024 * 1024,
  maxTotalBytes: 256 * 1024 * 1024,
  maxAgeMs: 24 * 3600 * 1000,
};

const ID_RE = /^[0-9a-f-]{36}$/;

export class FileBackupStore {
  /** @param {{ dir: string, limits?: Partial<typeof FILE_BACKUP_LIMITS>, now?: () => number }} opts */
  constructor({ dir, limits = {}, now = Date.now }) {
    this.dir = dir;
    this.limits = { ...FILE_BACKUP_LIMITS, ...limits };
    this.now = now;
    this.byId = new Map(); // id -> { real, existed, size, at }
    this.idByReal = new Map(); // real -> id (bir fayl uchun ENG BIRINCHI asl holat)
    this.total = 0;
    this.swept = false;
  }

  #file(id) {
    return join(this.dir, `${id}.bin`);
  }

  #ensureDir() {
    mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    if (process.platform !== "win32") {
      try {
        chmodSync(this.dir, 0o700);
      } catch {
        /* e'tiborsiz */
      }
    }
    if (this.swept) return;
    this.swept = true;
    // Oldingi jarayonlardan qolgan (indeksda yo'q) eski zaxiralar — yoshi bo'yicha.
    const cutoff = this.now() - this.limits.maxAgeMs;
    let names = [];
    try {
      names = readdirSync(this.dir);
    } catch {
      return;
    }
    for (const name of names) {
      const id = name.replace(/\.bin$/, "");
      if (this.byId.has(id)) continue;
      try {
        if (statSync(join(this.dir, name)).mtimeMs < cutoff) rmSync(join(this.dir, name), { force: true });
      } catch {
        /* e'tiborsiz */
      }
    }
  }

  /** Shu fayl uchun mavjud zaxira id'si (birinchi asl holat saqlanadi). */
  idFor(real) {
    const id = this.idByReal.get(real);
    return id && this.byId.has(id) ? id : null;
  }

  /**
   * Zaxira qo'shadi. existed=false — "fayl yo'q edi" belgisi (Undo o'chiradi).
   * Katta fayl yoki disk xatosi — null (Undo yo'q).
   * @param {string} real  @param {boolean} existed  @param {Buffer|null} data
   */
  add(real, existed, data) {
    const size = existed ? (data?.length ?? -1) : 0;
    if (size < 0 || size > this.limits.maxFileBytes) return null;
    const id = randomUUID();
    try {
      this.#ensureDir();
      if (existed) writeFileSync(this.#file(id), data, { mode: 0o600, flag: "wx" });
    } catch {
      return null;
    }
    this.byId.set(id, { real, existed, size, at: this.now() });
    this.idByReal.set(real, id);
    this.total += size;
    this.#prune(id);
    return this.byId.has(id) ? id : null;
  }

  /** Indeks yozuvi ({ real, existed }) yoki null. id faqat shu ombor bergan qiymat bo'lishi mumkin. */
  get(id) {
    if (typeof id !== "string" || !ID_RE.test(id)) return null;
    const b = this.byId.get(id);
    if (!b) return null;
    if (this.now() - b.at > this.limits.maxAgeMs) {
      this.drop(id);
      return null;
    }
    return { real: b.real, existed: b.existed };
  }

  /** Asl baytlar (existed=true bo'lsa); o'qib bo'lmasa — null. */
  read(id) {
    const b = this.get(id) && this.byId.get(id);
    if (!b || !b.existed) return null;
    try {
      const buf = readFileSync(this.#file(id));
      return buf.length === b.size ? buf : null;
    } catch {
      return null;
    }
  }

  drop(id) {
    const b = this.byId.get(id);
    if (!b) return;
    this.byId.delete(id);
    if (this.idByReal.get(b.real) === id) this.idByReal.delete(b.real);
    this.total -= b.size;
    if (b.existed) {
      try {
        rmSync(this.#file(id), { force: true });
      } catch {
        /* e'tiborsiz */
      }
    }
  }

  /** Vazifa tugadi — barcha zaxiralar (diskdan ham) o'chiriladi. */
  clear() {
    for (const id of [...this.byId.keys()]) this.drop(id);
    this.total = 0;
  }

  /** Yoshi o'tgan va umumiy hajm chegarasidan oshgan (eng eskisidan) zaxiralar tashlanadi. */
  #prune(keep) {
    const cutoff = this.now() - this.limits.maxAgeMs;
    for (const [id, b] of [...this.byId]) if (b.at < cutoff && id !== keep) this.drop(id);
    for (const id of [...this.byId.keys()]) {
      if (this.total <= this.limits.maxTotalBytes) break;
      this.drop(id); // Map — qo'shilish tartibida (eng eskisi birinchi)
    }
  }
}
