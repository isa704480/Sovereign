#!/usr/bin/env node
/**
 * i18n tekshiruvi — har bir foydalanuvchiga ko'rinadigan matn 4 tilda bo'lishi shart:
 * uz (lotin), "uz-cyrl", ru, en.
 *
 * Manba fayllarni TypeScript AST orqali o'qiydi (kod bajarilmaydi), DICT tarkibini
 * src/lib/i18n.ts dagi `const DICT = { ...CORE, ...X }` qatoridan aniqlaydi.
 *
 * Fatal (exit 1):
 *   - kalitda til yo'q yoki qiymat bo'sh
 *   - {placeholder} tillar orasida mos emas
 *   - bir kalit bir nechta locale faylda (keyingi spread avvalgisini yashirin bosadi)
 *   - src/** da t("key") / translate(lang, "key") / "key" as TKey — DICT da yo'q
 *   - "uz-cyrl" qiymatida kichik harfli lotin so'z, "uz" qiymatida kirill harfi
 *   - qiymat statik satr emas (tekshirib bo'lmaydi)
 * Ogohlantirish: hech qayerda ishlatilmagan kalitlar (soni; --verbose bilan ro'yxat).
 *
 *   npm run i18n:check            # qisqa hisobot
 *   npm run i18n:check -- --verbose
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
const I18N = join(SRC, "lib", "i18n.ts");
const LANGS = ["uz", "uz-cyrl", "ru", "en"];
const VERBOSE = process.argv.includes("--verbose") || process.argv.includes("-v");

/**
 * Gap bo'laklari (so'z tartibi tillarda farq qiladi): fooPrefix/fooSuffix, foo_a/foo_b, intro2a/intro2b.
 * Bunday kalitda ba'zi tillar ataylab bo'sh bo'lishi mumkin — lekin hammasi bo'sh emas.
 */
const FRAGMENT_KEY = /(?:Prefix|Suffix|_[a-z]|\d[a-z])$/;

/** "uz-cyrl" da lotin bo'lishi shart bo'lgan kalitlar (masalan, ASCII fayl nomi). */
const CYRL_LATIN_KEYS = new Set([
  "chCodeFileBase", // yuklab olinadigan kod fayli nomi — ataylab ASCII
]);

/**
 * "uz-cyrl" matnida ruxsat etilgan kichik harfli lotin so'zlar (buyruq, kod, birlik).
 * Bosh harfli so'zlar (Chrome, Skills, Tella) va KATTA qisqartmalar (API, CLI) avtomatik o'tadi.
 */
const CYRL_LATIN_ALLOW = new Set([
  "sovereign", "npm", "npx", "pnpm", "yarn", "bun", "node", "pip", "git", "curl", "brew", "winget", "cd",
  "install", "login", "chat", "run", "init", "help", "status", "config", "models", "version",
  "http", "https", "www", "localhost", "com", "uz", "ru", "en", "io", "dev", "app", "ai", "org", "net",
  "px", "ms", "kb", "mb", "gb", "tb", "fps", "rpm", "rps", "tok", "sec", "k", "x", "vs", "e", "g", "i",
  "exe", "dmg", "deb", "rpm", "zip", "json", "csv", "pdf", "md", "txt", "docx", "xlsx", "pptx", "png", "jpg",
  "jpeg", "svg", "mp3", "mp4", "webp", "gif", "html", "css", "js", "ts", "tsx", "py", "env", "sh", "yaml",
  "mini", "pro", "max", "flash", "turbo", "lite", "nano", "sonnet", "opus", "haiku", "latest", "preview",
  "api", "key", "token", "id",
  // Terminal / kod
  "sov", "chmod", "sudo", "bash", "zsh", "fish", "powershell", "export", "default", "import", "env",
  // Model nomlari (qidiruv misollari)
  "claude", "gemini", "deepseek", "gpt", "llama", "qwen", "mistral", "grok", "kimi", "glm", "o3", "o4",
  // Ataylab qoldirilgan texnik atamalar (qavs ichidagi izoh / tashqi konsol nomlari)
  "reasoning", "scope", "consent",
]);

// ─── Manba o'qish ────────────────────────────────────────────────────────────

const srcCache = new Map();
function parse(file) {
  if (!srcCache.has(file)) {
    const text = readFileSync(file, "utf8");
    srcCache.set(file, ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS));
  }
  return srcCache.get(file);
}

const rel = (f) => relative(ROOT, f).replaceAll("\\", "/");
const lineOf = (sf, node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

function unwrap(expr) {
  while (
    expr &&
    (ts.isSatisfiesExpression?.(expr) || ts.isAsExpression(expr) || ts.isParenthesizedExpression(expr) || ts.isTypeAssertionExpression?.(expr))
  ) {
    expr = expr.expression;
  }
  return expr;
}

function propName(p) {
  const n = p.name;
  if (!n) return null;
  if (ts.isIdentifier(n) || ts.isStringLiteral(n) || ts.isNumericLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text;
  return null;
}

/** Statik satr qiymati yoki null. "a" + "b" ham hisoblanadi. */
function staticString(expr) {
  expr = unwrap(expr);
  if (!expr) return null;
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) return expr.text;
  if (ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const a = staticString(expr.left);
    const b = staticString(expr.right);
    return a != null && b != null ? a + b : null;
  }
  return null;
}

function findVar(sf, name) {
  let found = null;
  const visit = (node) => {
    if (found) return;
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) found = node;
    else ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

// ─── DICT tarkibi ────────────────────────────────────────────────────────────

const issues = {
  structure: [],
  missing: [],
  placeholder: [],
  duplicate: [],
  unknownKey: [],
  cyrlLatin: [],
  uzCyrillic: [],
};
const warnings = { unused: [] };

const i18nSf = parse(I18N);
const imports = new Map(); // identifier -> file
for (const st of i18nSf.statements) {
  if (!ts.isImportDeclaration(st) || !st.importClause?.namedBindings) continue;
  const spec = st.moduleSpecifier.text;
  if (!spec.startsWith("@/lib/locales/")) continue;
  const file = join(SRC, spec.slice(2)) + ".ts";
  const nb = st.importClause.namedBindings;
  if (ts.isNamedImports(nb)) for (const el of nb.elements) imports.set(el.name.text, file);
}

const dictDecl = findVar(i18nSf, "DICT");
const dictInit = dictDecl && unwrap(dictDecl.initializer);
if (!dictInit || !ts.isObjectLiteralExpression(dictInit)) {
  console.error("check-i18n: src/lib/i18n.ts ichida `const DICT = { ... }` topilmadi.");
  process.exit(2);
}

/** @type {{name:string, file:string}[]} */
const sources = [];
for (const p of dictInit.properties) {
  if (ts.isSpreadAssignment(p) && ts.isIdentifier(p.expression)) {
    const name = p.expression.text;
    sources.push({ name, file: name === "CORE" ? I18N : imports.get(name) });
  } else {
    issues.structure.push(`src/lib/i18n.ts:${lineOf(i18nSf, p)} DICT ichida kutilmagan element (faqat ...SPREAD bo'lishi kerak)`);
  }
}

/** key -> { src, file, line, values: Record<lang,string|null> } (oxirgi yozilgani) */
const dict = new Map();
/** key -> [{src, file, line}] barcha ta'riflar */
const defs = new Map();

for (const { name, file } of sources) {
  if (!file) {
    issues.structure.push(`DICT: ...${name} qaysi fayldan import qilingani topilmadi`);
    continue;
  }
  const sf = parse(file);
  const decl = findVar(sf, name);
  const obj = decl && unwrap(decl.initializer);
  if (!obj || !ts.isObjectLiteralExpression(obj)) {
    issues.structure.push(`${rel(file)}: \`${name}\` obyekt literal emas yoki topilmadi`);
    continue;
  }
  const seenHere = new Set();
  for (const p of obj.properties) {
    const line = lineOf(sf, p);
    const where = `${rel(file)}:${line}`;
    if (!ts.isPropertyAssignment(p)) {
      issues.structure.push(`${where} statik kalit emas (spread/shorthand/metod) — tekshirib bo'lmaydi`);
      continue;
    }
    const key = propName(p);
    if (key == null) {
      issues.structure.push(`${where} hisoblangan kalit nomi — tekshirib bo'lmaydi`);
      continue;
    }
    if (seenHere.has(key)) issues.duplicate.push(`${key}: ${where} — bir faylda ikki marta`);
    seenHere.add(key);

    const values = {};
    const row = unwrap(p.initializer);
    if (!ts.isObjectLiteralExpression(row)) {
      issues.structure.push(`${where} ${key}: qiymat { uz, "uz-cyrl", ru, en } obyekti emas`);
      continue;
    }
    for (const lp of row.properties) {
      const lang = ts.isPropertyAssignment(lp) ? propName(lp) : null;
      if (!lang) continue;
      if (!LANGS.includes(lang)) {
        issues.structure.push(`${where} ${key}: noma'lum til "${lang}"`);
        continue;
      }
      const v = staticString(lp.initializer);
      if (v == null) issues.structure.push(`${where} ${key}.${lang}: statik satr emas`);
      values[lang] = v;
    }
    const entry = { src: name, file, line, values };
    if (!defs.has(key)) defs.set(key, []);
    defs.get(key).push(entry);
    dict.set(key, entry);
  }
}

for (const [key, list] of defs) {
  if (list.length > 1) {
    const chain = list.map((d) => `${rel(d.file)}:${d.line}`).join(" → ");
    issues.duplicate.push(`${key}: ${chain} (oxirgisi g'olib)`);
  }
}

// ─── Qiymat tekshiruvlari ────────────────────────────────────────────────────

const PH = /\{(\w+)\}/g;
const placeholders = (s) => [...new Set([...s.matchAll(PH)].map((m) => m[1]))].sort().join(",");
const CYR = /[Ѐ-ӿ]/;
const CYR_WORD_CHAR = /[Ѐ-ӿ]/;

/** "uz-cyrl" dagi muammoli lotin so'zlar. */
function latinWordsInCyrl(s) {
  // Kod, URL, placeholder, fayl yo'li, e-mail — chiqarib tashlanadi.
  const cleaned = s
    .replace(/`[^`]*`/g, " ")
    .replace(/“[^”]*”|«[^»]*»|"[^"]*"/g, " ") // qo'shtirnoqdagi tashqi UI yorliqlari ("Run anyway")
    .replace(/\{\w+\}/g, " ")
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, " ")
    .replace(/\S+@\S+\.\S+/g, " ")
    .replace(/(?:[\w.-]*[\\/][\w.\\/-]*)/g, " ")
    .replace(/\b[\w-]+(?:\.[\w-]+)+\b/g, " ") // next.js, file.pdf, api.example.uz
    .replace(/(?:^|\s)--?[\w-]+/g, " "); // CLI flaglari
  const bad = [];
  // Lotin harf ketma-ketliklari; atrofidagi kirill harfi bilan yopishganini ham ko'ramiz.
  for (const m of cleaned.matchAll(/[A-Za-z0-9]*[A-Za-z][A-Za-z0-9]*/g)) {
    const w = m[0];
    const before = cleaned[m.index - 1] ?? "";
    const after = cleaned[m.index + w.length] ?? "";
    const glued = CYR_WORD_CHAR.test(before) || CYR_WORD_CHAR.test(after);
    if (/\d/.test(w) && !glued) continue; // v4, 4o, mp3 — versiya / kod
    if (glued) {
      bad.push(w);
      continue;
    }
    if (w !== w.toLowerCase()) continue; // Brend / qisqartma (Chrome, API, SOVEREIGN)
    if (CYRL_LATIN_ALLOW.has(w)) continue;
    bad.push(w);
  }
  return bad;
}

for (const [key, { file, line, values }] of dict) {
  const where = `${rel(file)}:${line}`;
  const isEmpty = (l) => typeof values[l] === "string" && values[l].trim() === "";
  const fragmentOk = FRAGMENT_KEY.test(key) && !LANGS.every(isEmpty);
  const miss = LANGS.filter((l) => !(l in values) || (isEmpty(l) && !fragmentOk));
  if (miss.length) issues.missing.push(`${key} [${miss.join(", ")}] — ${where}`);

  const phs = LANGS.filter((l) => typeof values[l] === "string" && values[l] !== "").map((l) => [l, placeholders(values[l])]);
  const distinct = new Set(phs.map(([, p]) => p));
  if (distinct.size > 1) {
    issues.placeholder.push(`${key}: ${phs.map(([l, p]) => `${l}={${p}}`).join(" ")} — ${where}`);
  }

  const cy = values["uz-cyrl"];
  if (typeof cy === "string" && !CYRL_LATIN_KEYS.has(key)) {
    const bad = latinWordsInCyrl(cy);
    if (bad.length) issues.cyrlLatin.push(`${key}: ${[...new Set(bad)].join(", ")} — ${where}`);
  }
  const uz = values.uz;
  if (typeof uz === "string" && CYR.test(uz)) {
    const words = [...new Set(uz.match(/\S*[Ѐ-ӿ]+\S*/g) ?? [])];
    issues.uzCyrillic.push(`${key}: ${words.slice(0, 4).join(", ")} — ${where}`);
  }
}

// ─── src/** dagi ishlatilishi ────────────────────────────────────────────────

const dictFiles = new Set(sources.map((s) => s.file).filter(Boolean));
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mts|js|jsx|mjs)$/.test(name) && !name.endsWith(".d.ts")) out.push(p);
  }
  return out;
}

const literalRefs = new Set();
const prefixRefs = new Set();

for (const file of walk(SRC)) {
  const text = readFileSync(file, "utf8");
  const isDict = dictFiles.has(file);

  if (!isDict) {
    for (const m of text.matchAll(/(["'`])([A-Za-z_][A-Za-z0-9_]*)\1/g)) literalRefs.add(m[2]);
    for (const m of text.matchAll(/`([A-Za-z_][A-Za-z0-9_]*)\$\{/g)) prefixRefs.add(m[1]);
    for (const m of text.matchAll(/(["'])([A-Za-z_][A-Za-z0-9_]*)\1\s*\+/g)) prefixRefs.add(m[2]);
  }

  // Tarjima funksiyasi nomlari: t + `const X = useT()` / `await getServerT()`.
  const fnNames = new Set(["t"]);
  for (const m of text.matchAll(/\bconst\s+(\w+)\s*=\s*(?:useT\(\)|await\s+getServerT\(\))/g)) fnNames.add(m[1]);
  const fnAlt = [...fnNames].map((n) => n.replace(/[$]/g, "\\$")).join("|");
  const checks = [
    new RegExp(String.raw`(?<![\w.$])(?:${fnAlt})\(\s*(["'\`])([^"'\`$\s]+)\1\s*\)`, "g"),
    /\btranslate\(\s*[^,()]+,\s*(["'`])([^"'`$\s]+)\1\s*\)/g,
    /(["'`])([A-Za-z_][A-Za-z0-9_]*)\1\s+as\s+TKey\b/g,
  ];
  for (const re of checks) {
    for (const m of text.matchAll(re)) {
      const key = m[2];
      if (!dict.has(key)) {
        const lineStart = text.lastIndexOf("\n", m.index) + 1;
        const before = text.slice(lineStart, m.index);
        if (/^\s*(?:\*|\/\*|\/\/)/.test(before) || /(?:^|[^:])\/\/\s/.test(before)) continue; // izoh ichida
        const line = text.slice(0, m.index).split("\n").length;
        issues.unknownKey.push(`"${key}" — ${rel(file)}:${line}`);
      }
    }
  }
}

for (const key of dict.keys()) {
  if (literalRefs.has(key)) continue;
  let viaPrefix = false;
  for (const p of prefixRefs) if (p.length >= 3 && key.startsWith(p)) { viaPrefix = true; break; }
  if (!viaPrefix) warnings.unused.push(key);
}

// ─── Hisobot ─────────────────────────────────────────────────────────────────

const TITLES = {
  structure: "Tuzilma / statik bo'lmagan qiymatlar",
  missing: "Til yetishmaydi yoki bo'sh qiymat",
  placeholder: "{placeholder} tillar orasida mos emas",
  duplicate: "Takroriy kalitlar (keyingi spread bosib ketadi)",
  unknownKey: "Kodda ishlatilgan, lekin DICT da yo'q kalitlar",
  cyrlLatin: '"uz-cyrl" ichida lotin so\'zlar',
  uzCyrillic: '"uz" ichida kirill harflari',
};

const LIMIT = VERBOSE ? Infinity : 60;
let fatal = 0;
console.log(`i18n: ${dict.size} kalit, ${sources.length} manba (${[...dictFiles].length} fayl), tillar: ${LANGS.join(", ")}`);
for (const [id, list] of Object.entries(issues)) {
  if (!list.length) continue;
  fatal += list.length;
  console.log(`\n✖ ${TITLES[id]} (${list.length})`);
  for (const line of list.slice(0, LIMIT)) console.log(`  ${line}`);
  if (list.length > LIMIT) console.log(`  … yana ${list.length - LIMIT} ta (--verbose)`);
}

if (warnings.unused.length) {
  console.log(`\n⚠ Ishlatilmagan kalitlar (fatal emas): ${warnings.unused.length}`);
  if (VERBOSE) for (const k of warnings.unused) console.log(`  ${k} — ${rel(dict.get(k).file)}:${dict.get(k).line}`);
  else console.log("  Ro'yxat uchun: npm run i18n:check -- --verbose");
}

if (fatal) {
  console.log(`\n✖ ${fatal} ta muammo.`);
  process.exit(1);
}
console.log("\n✔ i18n: barcha kalitlar 4 tilda, mos va to'g'ri alifboda.");
