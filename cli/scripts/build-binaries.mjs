#!/usr/bin/env node
// SOVEREIGN CLI — mustaqil binary (Node o'rnatilmagan kompyuter uchun).
//
// Node "Single Executable Applications" (SEA) usuli:
//   1) esbuild: bin/sovereign.mjs + src/*.mjs → bitta CommonJS fayl (dist/sov.cjs)
//   2) node --experimental-sea-config → dist/sea-prep.blob
//   3) joriy `node` binary nusxasi + postject bilan blob kiritiladi
//   4) SHA256 yig'indisi (install skriptlar tekshiradi)
//
// Faqat JORIY platforma uchun yig'adi (sov-win-x64.exe, sov-linux-x64,
// sov-macos-arm64, sov-macos-x64). Hamma platformalar — .github/workflows/cli-release.yml.
//
// Foydalanish (cli/ ichida):
//   npm ci
//   node scripts/build-binaries.mjs            # yig'ish
//   node scripts/build-binaries.mjs --smoke    # + `--version` / `--help` sinovi
//   node scripts/build-binaries.mjs --bundle-only
//
// Cheklov: pdf-parse (ixtiyoriy) binary'ga kirmaydi — PDF matni faqat npm versiyasida.

import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, chmodSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const OUT = join(ROOT, argv.includes("--out") ? argv[argv.indexOf("--out") + 1] : "dist");
const SENTINEL = "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2";

const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const log = (s) => console.log(`[build] ${s}`);
const die = (s) => {
  console.error(`[build] XATO: ${s}`);
  process.exit(1);
};

export function targetName(platform = process.platform, arch = process.arch) {
  const os = { win32: "win", darwin: "macos", linux: "linux" }[platform];
  if (!os || !["x64", "arm64"].includes(arch)) return null;
  return `sov-${os}-${arch}${platform === "win32" ? ".exe" : ""}`;
}

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

async function bundle() {
  let esbuild;
  try {
    esbuild = await import("esbuild");
  } catch {
    die("esbuild topilmadi — avval cli/ ichida `npm ci` (yoki `npm install`) bajaring.");
  }
  mkdirSync(OUT, { recursive: true });
  const outfile = join(OUT, "sov.cjs");
  await esbuild.build({
    entryPoints: [join(ROOT, "bin", "sovereign.mjs")],
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node20",
    outfile,
    legalComments: "none",
    // Ixtiyoriy PDF paketi binary'ga kirmaydi (files.mjs buni IS_BINARY bilan boshqaradi).
    external: ["pdf-parse", "pdf-parse/*"],
    define: {
      __SOV_VERSION__: JSON.stringify(pkg.version),
      __SOV_BINARY__: "true",
    },
    // version.mjs'dagi package.json fallback'i binary'da ishlatilmaydi.
    logOverride: { "empty-import-meta": "silent" },
    logLevel: "warning",
  });
  // SEA asosiy skriptida shebang kerak emas.
  const code = readFileSync(outfile, "utf8").replace(/^#![^\n]*\n/, "");
  writeFileSync(outfile, `"use strict";\n${code}`);
  log(`bundle: ${relative(ROOT, outfile)} (${(statSync(outfile).size / 1024).toFixed(0)} KB)`);
  return outfile;
}

async function buildBinary(bundleFile) {
  const name = targetName();
  if (!name) die(`Qo'llab-quvvatlanmaydigan platforma: ${process.platform}-${process.arch}`);
  const major = Number(process.versions.node.split(".")[0]);
  if (major < 20) die(`Node 20+ kerak (hozir ${process.version}).`);

  const blob = join(OUT, "sea-prep.blob");
  const cfg = join(OUT, "sea-config.json");
  writeFileSync(
    cfg,
    JSON.stringify(
      {
        main: bundleFile,
        output: blob,
        disableExperimentalSEAWarning: true,
        useSnapshot: false,
        useCodeCache: false,
      },
      null,
      2,
    ),
  );
  execFileSync(process.execPath, ["--experimental-sea-config", cfg], { stdio: "inherit" });

  const bin = join(OUT, name);
  if (existsSync(bin)) rmSync(bin);
  copyFileSync(process.execPath, bin);
  if (process.platform !== "win32") chmodSync(bin, 0o755);

  const mac = process.platform === "darwin";
  if (mac) execFileSync("codesign", ["--remove-signature", bin], { stdio: "inherit" });

  let postject;
  try {
    postject = await import("postject");
  } catch {
    die("postject topilmadi — avval cli/ ichida `npm ci` bajaring.");
  }
  const inject = postject.inject ?? postject.default?.inject;
  await inject(bin, "NODE_SEA_BLOB", readFileSync(blob), {
    sentinelFuse: SENTINEL,
    ...(mac ? { machoSegmentName: "NODE_SEA" } : {}),
  });
  // macOS arm64 imzosiz binary'ni ishga tushirmaydi — ad-hoc imzo.
  if (mac) execFileSync("codesign", ["--sign", "-", bin], { stdio: "inherit" });

  const hash = sha256(bin);
  writeFileSync(`${bin}.sha256`, `${hash}  ${name}\n`);
  rmSync(blob, { force: true });
  rmSync(cfg, { force: true });
  log(`binary: ${relative(ROOT, bin)} (${(statSync(bin).size / 1024 / 1024).toFixed(1)} MB)`);
  log(`sha256: ${hash}`);
  return bin;
}

function smoke(bin) {
  const env = { ...process.env, NO_COLOR: "1", SOV_NO_UPDATE_CHECK: "1" };
  const run = (args) => spawnSync(bin, args, { encoding: "utf8", env, timeout: 30_000 });
  const v = run(["--version"]);
  if (v.status !== 0 || !v.stdout.includes(pkg.version)) die(`--version: exit ${v.status}\n${v.stdout}${v.stderr}`);
  if (!/binary/.test(v.stdout)) die(`--version binary rejimini ko'rsatmadi: ${v.stdout}`);
  log(`smoke --version → ${v.stdout.trim()}`);
  const h = run(["--help"]);
  if (h.status !== 0 || !h.stdout.includes("doctor")) die(`--help: exit ${h.status}\n${h.stderr}`);
  log(`smoke --help → OK (${h.stdout.split("\n").length} qator)`);
  const bad = run(["--no-such-flag"]);
  if (bad.status !== 2) die(`noma'lum flag chiqish kodi 2 bo'lishi kerak edi, keldi: ${bad.status}`);
  log("smoke --no-such-flag → exit 2 OK");
}

const bundleFile = await bundle();
if (!has("--bundle-only")) {
  const bin = await buildBinary(bundleFile);
  if (has("--smoke")) smoke(bin);
}
