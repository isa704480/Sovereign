// CLI qaysi nom bilan chaqirilgani: `sov` (vibe rejim) yoki `sovereign` (oddiy).
//
// Windows'da npm `sov.cmd` shim'i `node .../bin/<fayl>.mjs` ni ishga tushiradi — argv[1]
// shim nomi EMAS, skript fayli bo'ladi. Shuning uchun `sov` alohida kirish fayliga
// (bin/sov.mjs) bog'langan: u quyidagi belgini qo'yib, asosiy skriptni import qiladi.
// Belgi faqat shu jarayonda (env emas — bola jarayonlarga o'tmaydi).
// POSIX symlink (`.../bin/sov`) va mustaqil binary (`sov.exe`) — fayl nomidan aniqlanadi.

export const INVOKED_AS_MARK = Symbol.for("sovereign.invokedAs");

/** Chaqiruv nomi (kichik harf, kengaytmasiz): "sov" | "sovereign" | ... */
export function invokedName(argv1 = process.argv[1], mark = globalThis[INVOKED_AS_MARK]) {
  if (typeof mark === "string" && mark) return mark.toLowerCase();
  return (
    String(argv1 ?? "")
      .split(/[\\/]/)
      .pop()
      ?.replace(/\.(mjs|cjs|js|exe|cmd)$/i, "")
      .toLowerCase() ?? ""
  );
}
