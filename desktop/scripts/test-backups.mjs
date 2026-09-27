// Cowork write_file Undo zaxirasi (electron/file-backups.mjs) testlari — electron'siz:
//   node scripts/test-backups.mjs
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileBackupStore } from "../electron/file-backups.mjs";

let n = 0;
const test = (name, fn) => {
  fn();
  n++;
  console.log(`✓ ${name}`);
};

const tmp = mkdtempSync(join(tmpdir(), "sov-bk-"));
const dir = join(tmp, "file-backups");

try {
  test("baytlar diskda, xotirada emas; read() asl baytlarni qaytaradi", () => {
    const s = new FileBackupStore({ dir });
    const id = s.add("/w/a.txt", true, Buffer.from("asl"));
    assert.ok(id);
    assert.ok(existsSync(join(dir, `${id}.bin`)));
    assert.equal(JSON.stringify([...s.byId.values()]).includes("asl"), false);
    assert.deepEqual(s.get(id), { real: "/w/a.txt", existed: true });
    assert.equal(s.read(id).toString(), "asl");
    // Bir fayl uchun birinchi asl holat saqlanadi
    assert.equal(s.idFor("/w/a.txt"), id);
    s.clear();
  });

  test("yo'q edi belgisi — fayl yozilmaydi, read() null", () => {
    const s = new FileBackupStore({ dir });
    const id = s.add("/w/new.txt", false, null);
    assert.ok(id);
    assert.equal(existsSync(join(dir, `${id}.bin`)), false);
    assert.deepEqual(s.get(id), { real: "/w/new.txt", existed: false });
    assert.equal(s.read(id), null);
    s.clear();
  });

  test("drop va clear diskdan ham o'chiradi (vazifa tugashi)", () => {
    const s = new FileBackupStore({ dir });
    const a = s.add("/w/a", true, Buffer.from("1"));
    const b = s.add("/w/b", true, Buffer.from("2"));
    s.drop(a);
    assert.equal(existsSync(join(dir, `${a}.bin`)), false);
    assert.equal(s.get(a), null);
    s.clear();
    assert.equal(existsSync(join(dir, `${b}.bin`)), false);
    assert.equal(s.total, 0);
    assert.equal(readdirSync(dir).length, 0);
  });

  test("hajm chegarasi: bitta katta fayl rad, jami oshsa eng eskisi tashlanadi", () => {
    const s = new FileBackupStore({ dir, limits: { maxFileBytes: 10, maxTotalBytes: 20 } });
    assert.equal(s.add("/w/big", true, Buffer.alloc(11)), null);
    const a = s.add("/w/a", true, Buffer.alloc(10));
    const b = s.add("/w/b", true, Buffer.alloc(10));
    const c = s.add("/w/c", true, Buffer.alloc(10));
    assert.equal(s.get(a), null, "eng eskisi tashlanishi kerak edi");
    assert.ok(s.get(b) && s.get(c));
    assert.equal(existsSync(join(dir, `${a}.bin`)), false);
    assert.ok(s.total <= 20);
    s.clear();
  });

  test("yosh chegarasi: eski zaxira ishlatilmaydi va tozalanadi", () => {
    let t = 1_000_000;
    const s = new FileBackupStore({ dir, limits: { maxAgeMs: 1000 }, now: () => t });
    const id = s.add("/w/a", true, Buffer.from("x"));
    t += 2000;
    assert.equal(s.get(id), null);
    assert.equal(existsSync(join(dir, `${id}.bin`)), false);
  });

  test("oldingi jarayondan qolgan eski fayllar birinchi ishlatishda o'chiriladi", () => {
    const stale = join(dir, "00000000-0000-0000-0000-000000000000.bin");
    writeFileSync(stale, "eski");
    const old = new Date(Date.now() - 3 * 24 * 3600 * 1000);
    utimesSync(stale, old, old);
    const fresh = join(dir, "11111111-1111-1111-1111-111111111111.bin");
    writeFileSync(fresh, "yangi");
    const s = new FileBackupStore({ dir });
    s.add("/w/z", false, null);
    assert.equal(existsSync(stale), false);
    assert.equal(existsSync(fresh), true);
    rmSync(fresh);
  });

  test("renderer bergan ixtiyoriy id — rad (yo'l aylanib o'tish yo'q)", () => {
    const s = new FileBackupStore({ dir });
    assert.equal(s.get("../../etc/passwd"), null);
    assert.equal(s.get(42), null);
    assert.equal(s.read("../x"), null);
  });
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
console.log(`\n${n} ta test o'tdi`);
