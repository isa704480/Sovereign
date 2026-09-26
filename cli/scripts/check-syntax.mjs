// `node --check` barcha .mjs fayllar uchun (bin, src, scripts).
import { readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let failed = 0;
for (const dir of ["bin", "src", "scripts"]) {
  for (const f of readdirSync(join(root, dir))) {
    if (!f.endsWith(".mjs")) continue;
    try {
      execFileSync(process.execPath, ["--check", join(root, dir, f)], { stdio: "pipe" });
    } catch (err) {
      failed++;
      process.stderr.write(`✕ ${dir}/${f}\n${err.stderr}\n`);
    }
  }
}
console.log(failed ? `${failed} ta fayl xato` : "✓ sintaksis toza");
process.exit(failed ? 1 : 0);
