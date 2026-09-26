#!/usr/bin/env node
// i18n tekshiruvi (`npm run i18n:check`). Loyiha qoidasi: har bir foydalanuvchiga
// ko'rinadigan matn 4 tilda — uz (lotin), uz-cyrl, ru, en.
//
// Tekshiradi:
//  1. ui/src/lib/i18n.js: har bir kalit uz, en, ru da bor; uz-cyrl — qo'lda yozilgan
//     (uzCyrl) yoki uz dan translit; uzCyrl'da uz'da yo'q "yetim" kalit bo'lmasin.
//  2. {placeholder}lar barcha tillarda bir xil.
//  3. Koddagi t("kalit") / t(`prefiks.${x}`) / mt("kalit") — mavjud kalitga ishora qiladi.
//  4. electron/i18n-strings.mjs (main jarayon) — 4 tilda bir xil kalitlar.
//  5. JSX'da qattiq yozilgan matn (aria-label/title/placeholder/alt va teglar orasidagi matn).
// Xato bo'lsa — exit 1.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const rel = (p) => relative(ROOT, p).replace(/\\/g, "/");

const { KEYS, UZ_CYRL } = await import(pathToFileURL(join(ROOT, "ui/src/lib/i18n.js")).href);
const { toCyrillic } = await import(pathToFileURL(join(ROOT, "ui/src/lib/translit.js")).href);
const { MAIN_STRINGS } = await import(pathToFileURL(join(ROOT, "electron/i18n-strings.mjs")).href);

const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

// ---- 1-2. Renderer lug'atlari ------------------------------------------------
const LANGS = ["uz", "uz-cyrl", "ru", "en"];
const { uz, en, ru } = KEYS;
const all = new Set([...Object.keys(uz), ...Object.keys(en), ...Object.keys(ru)]);
const cyrlValue = (k) => UZ_CYRL[k] ?? (k in uz ? toCyrillic(uz[k]) : undefined);
const value = { uz: (k) => uz[k], en: (k) => en[k], ru: (k) => ru[k], "uz-cyrl": cyrlValue };

for (const k of [...all].sort()) {
  const missing = LANGS.filter((l) => typeof value[l](k) !== "string" || !value[l](k).trim());
  if (missing.length) err(`[til] "${k}" — yo'q: ${missing.join(", ")}`);
}
for (const k of Object.keys(UZ_CYRL)) if (!(k in uz)) err(`[uz-cyrl] "${k}" — uzCyrl'da bor, lekin uz'da yo'q (yetim kalit)`);

const vars = (s) => [...String(s ?? "").matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
for (const k of all) {
  const ref = vars(uz[k] ?? en[k]);
  for (const l of LANGS) {
    const v = value[l](k);
    if (typeof v === "string" && vars(v) !== ref) err(`[placeholder] "${k}" (${l}): {${vars(v)}} ≠ uz {${ref}}`);
  }
}

// Kirill: lotin harfi qolgan so'zlar faqat ruxsat etilgan texnik atamalar bo'lsin.
const LATIN_OK = /^(SOVEREIGN|Cowork|CLI|AI|API|SQL|VS|CI|OK|UNC|MB|PC|README|md|env|ssh|aws|sovereign|Ctrl|Shift|Enter|Esc|Explorer|Windows|SmartScreen|GitHub|Releases|Undo|Auto|diff|Diff|src|npm|git|Git|rebase|merge|hook|hooks|tasks|Code|React|Express|preload|claude|gemini|deepseek|exit|Shell|grep|R|C|foo|O|More|info|Run|anyway|protected|your|v|Full|auto|push|publish|deploy|sudo|build)$/; // v — versiya belgisi (v0.5.3)
for (const k of Object.keys(uz)) {
  const v = cyrlValue(k).replace(/\{\w+\}/g, "");
  for (const w of v.match(/[A-Za-z]+/g) ?? []) {
    if (!LATIN_OK.test(w)) warn(`[uz-cyrl] "${k}": lotin so'z "${w}" — uzCyrl'ga qo'lda tekshirilgan matn qo'shing yoki translit PROTECT'ga kiriting`);
  }
}

// ---- 4. Main jarayon matnlari ------------------------------------------------
const mainKeys = new Set(Object.values(MAIN_STRINGS).flatMap((d) => Object.keys(d)));
for (const l of LANGS) {
  if (!MAIN_STRINGS[l]) { err(`[main] til yo'q: ${l}`); continue; }
  for (const k of mainKeys) if (!MAIN_STRINGS[l][k]?.trim()) err(`[main] "${k}" — yo'q: ${l}`);
}

// ---- 3 & 5. Manba kod ------------------------------------------------------
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(jsx?|mjs)$/.test(name)) out.push(p);
  }
  return out;
}
const files = [...walk(join(ROOT, "ui/src")), join(ROOT, "main.mjs"), ...walk(join(ROOT, "electron"))];
const used = new Set();
const prefixes = new Set();
const rendererKeys = [...all];

const CALL = /(?<![\w.$])(t|mt)\(\s*(["'`])((?:\\.|(?!\2)[^\\])*)\2/g;
for (const f of files) {
  const src = readFileSync(f, "utf8");
  for (const m of src.matchAll(CALL)) {
    const [, fn, q, key] = m;
    const line = src.slice(0, m.index).split("\n").length;
    const where = `${rel(f)}:${line}`;
    if (fn === "mt") {
      if (!mainKeys.has(key)) err(`[kod] ${where}: mt("${key}") — electron/i18n-strings.mjs da yo'q`);
      continue;
    }
    if (q === "`" && key.includes("${")) {
      const prefix = key.slice(0, key.indexOf("${"));
      prefixes.add(prefix);
      if (!rendererKeys.some((k) => k.startsWith(prefix))) err(`[kod] ${where}: t(\`${key}\`) — "${prefix}…" bilan boshlanadigan kalit yo'q`);
      continue;
    }
    used.add(key);
    if (!all.has(key)) err(`[kod] ${where}: t("${key}") — i18n.js da yo'q`);
  }
  // Massiv/jadvallarda saqlangan kalitlar (SHORTCUTS, takliflar, cliText naqshlari).
  for (const m of src.matchAll(/["'`]([\w-]+(?:\.[\w-]+)+)["'`]/g)) if (all.has(m[1])) used.add(m[1]);
}

// JSX'da qattiq yozilgan matn. Ruxsat: brend, klaviatura tugmalari, belgilar.
const TEXT_OK = /^(SOVEREIGN|Cowork|Ctrl|Shift|Enter|Esc|Auto|sovereign|login|K|N|O|B|J|L|E|v|s)$/;
const hasBadWords = (s) => (s.match(/[A-Za-zЀ-ӿ]+/g) ?? []).some((w) => !TEXT_OK.test(w));
for (const f of files.filter((p) => p.endsWith(".jsx"))) {
  const src = readFileSync(f, "utf8");
  const lineOf = (i) => src.slice(0, i).split("\n").length;
  for (const m of src.matchAll(/\b(aria-label|title|placeholder|alt|label)="([^"]*)"/g)) {
    if (hasBadWords(m[2])) err(`[qattiq matn] ${rel(f)}:${lineOf(m.index)}: ${m[1]}="${m[2]}"`);
  }
  // Teg (atributlardagi `=>` bilan) yoki yopuvchi teg → keyingi `<`/`{` gacha bo'lgan matn.
  const TAG_TEXT = /(?:<[A-Za-z][\w.]*(?:=>|[^<>=]|=(?!>))*?>|<\/[\w.]+>|\/>)([^<>{}]*)(?=[<{])/g;
  // JS kodi bo'lagi (ternar, `case`, obyekt kaliti) — JSX matni emas.
  const JS_LIKE = /^[)\]},;:]|[;=]|\breturn\b|\bcase\b|:$|\?\s*\(/;
  for (const m of src.matchAll(TAG_TEXT)) {
    const text = m[1].trim();
    if (text && !JS_LIKE.test(text) && hasBadWords(text)) err(`[qattiq matn] ${rel(f)}:${lineOf(m.index)}: "${text.slice(0, 60)}"`);
  }
}

// Ishlatilmagan kalitlar — faqat ma'lumot (dinamik kalitlar prefiks orqali hisobga olinadi).
const unused = rendererKeys.filter((k) => !used.has(k) && ![...prefixes].some((p) => k.startsWith(p)));

// ---- Hisobot ---------------------------------------------------------------
const explicit = Object.keys(UZ_CYRL).length;
console.log(`i18n: ${all.size} kalit × ${LANGS.length} til (uz-cyrl: ${explicit} qo'lda, ${Object.keys(uz).length - explicit} translit) · main: ${mainKeys.size} kalit · ${files.length} fayl`);
if (unused.length) console.log(`  ma'lumot: statik ishlatilmagan ${unused.length} kalit: ${unused.slice(0, 12).join(", ")}${unused.length > 12 ? " …" : ""}`);
for (const w of warnings) console.log(`  ogohlantirish ${w}`);
for (const e of errors) console.log(`  XATO ${e}`);
if (errors.length) {
  console.log(`\n✕ ${errors.length} xato`);
  process.exit(1);
}
console.log(`✓ i18n tekshiruvi o'tdi${warnings.length ? ` (${warnings.length} ogohlantirish)` : ""}`);
