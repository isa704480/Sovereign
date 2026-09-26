// CLI versiyasi va ishga tushish turi (npm/Node yoki mustaqil binary).
//
// Binary (Node SEA) yig'ilganda esbuild `__SOV_VERSION__` va `__SOV_BINARY__`
// ni literal qiymatga almashtiradi (scripts/build-binaries.mjs). Oddiy Node'da
// ular aniqlanmagan — versiya package.json'dan o'qiladi.
import { readFileSync } from "node:fs";

function readPkgVersion() {
  try {
    return JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/* global __SOV_VERSION__, __SOV_BINARY__ */
export const VERSION = typeof __SOV_VERSION__ === "string" ? __SOV_VERSION__ : readPkgVersion();

/** true — mustaqil binary (Node o'rnatilmagan bo'lishi mumkin). */
export const IS_BINARY = typeof __SOV_BINARY__ !== "undefined" && __SOV_BINARY__ === true;
