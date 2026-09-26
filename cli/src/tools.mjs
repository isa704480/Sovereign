import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync, realpathSync } from "node:fs";
import { resolve, relative, dirname, join, isAbsolute, basename, sep, win32, posix } from "node:path";
import { homedir } from "node:os";
import { execSync } from "node:child_process";
import { c } from "./ui.mjs";

const IS_WIN = process.platform === "win32";

/**
 * Mavjud bo'lgan ENG YAQIN ota-papkani realpath orqali yechib, qolgan (hali
 * yaratilmagan) qismini unga qayta ulaydi. Shu tariqa symlink/junction orqali
 * ish papkasidan qochib chiqish (a/link/b/new.txt) aniqlanadi.
 */
function realResolve(abs) {
  let cur = abs;
  const tail = [];
  for (;;) {
    try {
      // .native — Windows'da 8.3 qisqa nomlarni (SOVERE~1) to'liq nomga ochadi,
      // aks holda himoya ro'yxatlari qisqa nom bilan aylanib o'tilardi.
      const real = realpathSync.native(cur);
      return tail.length ? join(real, ...tail.reverse()) : real;
    } catch {
      const parent = dirname(cur);
      if (parent === cur) return abs; // ildizgacha hech narsa yo'q
      tail.push(basename(cur));
      cur = parent;
    }
  }
}

function isUnc(p) {
  return /^[\\/]{2}/.test(String(p));
}

/** `rel` — root'ga nisbatan yo'l; tashqarida bo'lsa true. */
function relIsOutside(rel) {
  return rel === ".." || rel.startsWith(".." + sep) || rel.startsWith("../") || isAbsolute(rel);
}

/**
 * Yo'lni realpath orqali yechadi (symlink hujumlariga qarshi), lekin THROW
 * QILMAYDI — ish papkasidan tashqarida ekanini `outside` bilan bildiradi.
 * Chaqiruvchi tashqarida bo'lsa foydalanuvchidan ruxsat so'raydi.
 */
export function resolvePath(p, rootDir = process.cwd()) {
  const root = realResolve(resolve(rootDir));
  const abs = resolve(root, String(p ?? "."));
  const real = realResolve(abs);
  const rel = relative(root, real);
  const outside = relIsOutside(rel) || (isUnc(real) && !isUnc(root));
  return { real, rel, outside };
}

// ---- Himoyalangan yo'llar ------------------------------------------------

const norm = (p) => String(p).replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();

/** Uy papkasiga nisbatan — ish papkasi ICHIDA bo'lsa ham taqiqlangan. */
const HOME_DENY = [
  ".sovereign", ".ssh", ".aws", ".azure", ".config/gh", ".config/gcloud", ".config/git",
  ".npmrc", ".pypirc", ".gitconfig", ".git-credentials", ".netrc", ".gnupg", ".docker", ".kube",
  ".bashrc", ".zshrc", ".profile", ".bash_profile", ".bash_login", ".zprofile", ".zshenv", ".zlogin",
  ".config/powershell", "documents/powershell", "documents/windowspowershell",
  "onedrive/documents/powershell", "onedrive/documents/windowspowershell",
  // Brauzer profillari (cookie, parol, sessiya)
  ".mozilla", ".config/google-chrome", ".config/chromium", ".config/bravesoftware", ".config/microsoft-edge",
  "library/application support/google/chrome", "library/application support/firefox",
  "library/application support/bravesoftware", "library/application support/microsoft edge",
  "library/safari", "library/keychains", "library/cookies",
  "appdata/local/google/chrome/user data", "appdata/local/microsoft/edge/user data",
  "appdata/local/bravesoftware", "appdata/local/chromium", "appdata/roaming/mozilla",
  "appdata/roaming/opera software", "appdata/roaming/github cli", "appdata/roaming/gcloud",
  "appdata/roaming/microsoft/credentials", "appdata/local/microsoft/credentials",
];

/** Qayerda bo'lishidan qat'i nazar taqiqlangan (normallashtirilgan, `/` bilan). */
const ANYWHERE_DENY = [
  /\/\.ssh(\/|$)/,
  /\/\.git-credentials$/,
  /\/\.netrc$/,
  /\/\.sovereign(\/|$)/,
  /\/documents\/(windows)?powershell(\/|$)/,
  /profile\.ps1$/,
  /\/(google\/chrome|microsoft\/edge|bravesoftware\/brave-browser|chromium)\/user data(\/|$)/,
  /\/mozilla\/firefox(\/|$)/,
  // OS / tizim
  /^\/etc\/(passwd|shadow|gshadow|sudoers)/,
  /^\/boot(\/|$)/,
  /^\/system(\/|$)/,
  /^[a-z]:\/windows(\/|$)/,
  /^[a-z]:\/program files( \(x86\))?(\/|$)/,
  /\/system32(\/|$)/,
];

/**
 * Faqat YOZISH taqiqlangan (o'qish mumkin) — git orqali kod ijrosi. Butun .git
 * (hooks/config emas, commondir/info va h.k. ham) va istalgan chuqurlikdagi .git
 * FAYLI (gitdir yo'naltirish) — "xavfsiz" git status fsmonitor bilan RCE bermasin.
 */
const WRITE_DENY = [/\/\.git(\/|$)/];

let HOME_REAL = null;
function homeDirs() {
  if (!HOME_REAL) {
    const h = homedir();
    HOME_REAL = [...new Set([norm(h), norm(realResolve(h))])];
  }
  return HOME_REAL;
}

/**
 * Ruxsat berilgan taqdirda ham TAQIQLANGAN yo'llar — parol/kalit/OS/brauzer.
 * Bu joylarga foydalanuvchi "ha" desa ham tegilmaydi (ish papkasi ichida ham).
 * @param {string} real  realResolve qilingan absolyut yo'l
 * @param {{write?: boolean, outside?: boolean}} opts
 */
export function isProtected(real, { write = false, outside = false } = {}) {
  const n = norm(real);
  // NTFS muqobil oqimlari (file::$DATA, file:stream) — ro'yxatlarni aylanib o'tish yo'li.
  if (IS_WIN && n.replace(/^[a-z]:/, "").includes(":")) return true;
  for (const h of homeDirs()) {
    for (const d of HOME_DENY) {
      const full = `${h}/${d}`;
      if (n === full || n.startsWith(full + "/")) return true;
    }
  }
  if (ANYWHERE_DENY.some((re) => re.test(n))) return true;
  if (write && WRITE_DENY.some((re) => re.test(n))) return true;
  // Ish papkasidan tashqaridagi .env fayllar (sirlar).
  const base = n.split("/").pop() ?? "";
  if (outside && /^\.env($|\.)/.test(base) && !/\.(example|sample|template)$/.test(base)) return true;
  return false;
}

/**
 * Sessiya "hammasiga ha" (a) bilan ishonchli deb belgilanishi mumkin bo'lgan
 * papkami? Faqat ish papkasi ICHIDA; uy papkasi, disk ildizi yoki himoyalangan
 * yo'l hech qachon emas.
 */
export function isTrustableDir(p) {
  if (!p) return false;
  const r = resolvePath(p);
  if (r.outside) return false;
  if (dirname(r.real) === r.real) return false; // disk ildizi (C:\ yoki /)
  if (homeDirs().includes(norm(r.real))) return false;
  if (isProtected(r.real, { write: true, outside: false })) return false;
  return true;
}

function outsideNote(r) {
  return r.outside ? c.amber("⚠️  ish papkasidan TASHQARIDA — ") : "";
}

// ---- Buyruq klassifikatori -----------------------------------------------

/**
 * Faqat HAQIQATAN o'qish-uchun buyruqlar "safe" (vibe/--yes/"a" bilan avtomatik
 * bajarilishi mumkin). Qolgan HAMMASI — interpretatorlar, paket menejerlari,
 * tarmoq, docker, fayl o'zgartiruvchilar — "risky": har doim tasdiq so'raladi.
 */
const SAFE_READONLY = new Set(["ls", "dir", "pwd", "echo", "cat", "type", "head", "tail", "wc", "grep", "which", "where", "whoami"]);
/** Faqat `<tool> --version` ko'rinishida xavfsiz. */
const VERSION_ONLY = new Set([
  "node", "npm", "npx", "pnpm", "yarn", "bun", "deno", "python", "python3", "py", "pip", "pip3",
  "go", "cargo", "rustc", "git", "tsc", "docker", "java", "dotnet", "gcc", "make",
]);
const GIT_READONLY = new Set(["status", "diff", "log", "show", "rev-parse", "ls-files", "blame", "describe", "shortlog"]);
/** git'ning fayl yozuvchi yoki tashqi dastur chaqiruvchi opsiyalari. */
const GIT_BAD_ARG = /^(--output|--ext-diff|--textconv|--exec|--upload-pack|--receive-pack|--config-env|-c$|-o$)/i;

// Shell metasimvollari: zanjir, subshell, yo'naltirish, o'zgaruvchi (sh/cmd), uy (~), brace, escape.
// POSIX: glob belgilari (*?[]) ham — sh ularni kengaytiradi va symlink orqali
// ish papkasidan tashqaridagi fayllarni o'qish mumkin bo'lardi.
const RISKY_CHARS = IS_WIN ? /[;&|$()`<>\n\r~%^@{}!,]/ : /[;&|$()`<>\n\r~%^@{}!\\*?[\]]/;

const HARD_BLOCKED = [
  /\brm\s+-[a-z]*r[a-z]*\s+(\/|~|\$HOME)/i,
  /:\(\)\s*\{\s*:\|:&\s*\}/,           // fork bomb
  /\bmkfs\b/, /\bdd\s+if=/, /\bshred\b/,
  /\bformat(\.com)?\s+[a-z]:/i,
  /\b(rd|rmdir)\s+\/s\s+\/q\s+[a-z]:\\?\s*$/i,
  /\b(curl|wget|iwr|irm|invoke-webrequest|invoke-restmethod)\b[^|]*\|\s*(sh|bash|zsh|python\d?|node|iex|invoke-expression|powershell|pwsh)\b/i, // pipe-to-shell
  /\b(nc|ncat|socat)\b.*\s-e\s/i,      // reverse shell
  /\/etc\/(passwd|shadow|sudoers)/,
  // Sir/kalit joylari — buyruq orqali ham tegilmaydi.
  /(^|[\s"'=\\/])\.(ssh|aws|azure|kube|docker|gnupg|sovereign)([\\/\s"']|$)/i,
  /\.(git-credentials|npmrc|pypirc|netrc|gitconfig|bashrc|zshrc|bash_profile|zprofile)\b/i,
  /\.config[\\/](gh|gcloud|git)\b/i,
  /(google[\\/]chrome|microsoft[\\/]edge|bravesoftware|mozilla|firefox)[\\/]/i,
  /\b(windows)?powershell[\\/].*profile|profile\.ps1/i,
];

function stripQuotes(t) {
  return t.replace(/["']/g, "");
}

/** Token ichidagi mumkin bo'lgan yo'l bo'laklari (`--out=/x`, `-f/x`, `a,b`). */
function pathCandidates(tok) {
  const out = new Set([tok]);
  for (const part of tok.split(/[=,;]/)) if (part) out.add(part);
  const sepIdx = tok.search(/[\\/.]/);
  if (sepIdx > 0) out.add(tok.slice(sepIdx));
  const drive = tok.search(/[a-z]:/i);
  if (drive > 0) out.add(tok.slice(drive));
  return [...out];
}

function looksLikePath(p) {
  return (
    isAbsolute(p) || win32.isAbsolute(p) || posix.isAbsolute(p) ||
    /^[a-z]:/i.test(p) || isUnc(p) ||
    /(^|[\\/])\.\.([\\/]|$)/.test(p)
  );
}

/** Argumentlardan biri ish papkasidan tashqariga yoki himoyalangan joyga ishora qiladimi? */
function argsEscape(cmdName, argv) {
  for (const raw of argv) {
    const tok = stripQuotes(raw);
    if (!tok) continue;
    // Windows `dir /b /s` kabi kalitlar yo'l emas.
    if (IS_WIN && cmdName === "dir" && /^\/[a-z?-]{1,3}$/i.test(tok)) continue;
    for (const cand of pathCandidates(tok)) {
      if (!cand || cand === "-" || cand === "--") continue;
      if (IS_WIN && /^[a-z]:(?![\\/])/i.test(cand)) return "Diskka nisbiy yo'l (C:foo)";
      if (cand.startsWith("-") && !looksLikePath(cand)) continue; // oddiy opsiya
      // Nisbiy nomlar ham yechiladi — ish papkasidagi symlink tashqariga olib chiqishi mumkin.
      const r = resolvePath(cand);
      if (r.outside) return `Ish papkasidan tashqaridagi yo'l: ${cand}`;
      if (isProtected(r.real)) return `Himoyalangan yo'l: ${cand}`;
    }
  }
  return null;
}

/**
 * Buyruqni tasniflaydi:
 *  - "blocked" — hech qachon bajarilmaydi;
 *  - "risky"   — HAR DOIM tasdiq (--yes / vibe / "a" ham o'tkazib yubormaydi);
 *  - "safe"    — faqat-o'qish; vibe/--yes/"a" bilan avtomatik bo'lishi mumkin.
 */
export function classifyCommand(command) {
  const cmd = String(command ?? "");
  for (const re of HARD_BLOCKED) if (re.test(cmd)) return { level: "blocked", reason: `Xavfli naqsh: ${re}` };
  if (!cmd.trim()) return { level: "risky", reason: "Bo'sh buyruq" };
  if (RISKY_CHARS.test(cmd)) return { level: "risky", reason: "Shell metasimvoli (zanjir/yo'naltirish/o'zgaruvchi)" };

  const argv = cmd.trim().split(/\s+/);
  const name = stripQuotes(argv[0]);
  const lname = IS_WIN ? name.toLowerCase() : name;
  const rest = argv.slice(1);

  // Birinchi so'z yo'l bo'lmasligi kerak (./ls, /tmp/x/cat ...).
  if (/[\\/]/.test(name)) return { level: "risky", reason: "Dastur yo'l orqali chaqirilgan" };

  let known = false;
  if (VERSION_ONLY.has(lname) && rest.length === 1 && ["--version", "-v", "-V"].includes(stripQuotes(rest[0]))) {
    return { level: "safe", reason: "" };
  }
  if (lname === "go" && rest.length === 1 && rest[0] === "version") return { level: "safe", reason: "" };

  if (lname === "git") {
    const sub = stripQuotes(rest[0] ?? "");
    if (!GIT_READONLY.has(sub)) return { level: "risky", reason: `git ${sub || ""} — faqat-o'qish emas`.trim() };
    if (rest.slice(1).some((a) => GIT_BAD_ARG.test(stripQuotes(a)))) return { level: "risky", reason: "git: fayl yozuvchi/tashqi dastur opsiyasi" };
    known = true;
  } else if (SAFE_READONLY.has(lname)) {
    if (lname === "grep" && rest.some((a) => /^(-[a-zA-Z]*R|--dereference-recursive)/.test(stripQuotes(a)))) {
      return { level: "risky", reason: "grep -R symlinklarga ergashadi" };
    }
    known = true;
  }
  if (!known) return { level: "risky", reason: `Faqat-o'qish ro'yxatida yo'q: ${name}` };

  const esc = argsEscape(lname, rest);
  if (esc) return { level: "risky", reason: esc };
  return { level: "safe", reason: "" };
}

/** OpenAI-style tool schema advertised to the model. */
export const TOOL_SCHEMA = [
  {
    type: "function",
    function: {
      name: "list_dir",
      description: "Papkadagi fayl va papkalar ro'yxatini beradi.",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "Papka yo'li (default: joriy)." } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Fayl tarkibini o'qiydi.",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Faylga yozadi (kerak bo'lsa papkalarni ham yaratadi). Mavjud faylni almashtiradi. Ish papkasidan tashqaridagi yo'l ham mumkin — foydalanuvchidan ruxsat so'raladi.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          content: { type: "string" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "make_dir",
      description: "Papka yaratadi (ichma-ich). Ish papkasidan tashqaridagi yo'l ham mumkin — foydalanuvchidan ruxsat so'raladi.",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_command",
      description: "Terminal buyrug'ini ish papkasida bajaradi (foydalanuvchi tasdig'i bilan).",
      parameters: {
        type: "object",
        properties: { command: { type: "string" } },
        required: ["command"],
      },
    },
  },
];

function tree(dir, prefix = "", depth = 0, max = 2) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir).filter((e) => e !== "node_modules" && e !== ".git" && !e.startsWith(".next"));
  } catch {
    return "";
  }
  entries.sort();
  for (const e of entries) {
    const full = join(dir, e);
    let isDir = false;
    try {
      isDir = statSync(full).isDirectory();
    } catch {
      /* ignore */
    }
    out.push(`${prefix}${isDir ? "📁 " : "   "}${e}`);
    if (isDir && depth < max) out.push(tree(full, prefix + "  ", depth + 1, max));
  }
  return out.filter(Boolean).join("\n");
}

/**
 * Runs one tool call. `confirm(question)` must return a boolean promise for
 * side-effectful ops (write_file, make_dir, run_command).
 */
/**
 * Keyinroq avtomatik ishga tushadigan fayllar: prompt-injection orqali agent
 * shularga yozsa, kod foydalanuvchi keyingi `npm install`, VS Code task yoki
 * git commit'da bajarilib ketadi. Ish papkasi ichida bo'lsa ham tasdiq kerak.
 */
const AUTO_RUN_FILES = new Set([
  "package.json", ".npmrc", ".yarnrc", ".yarnrc.yml", "makefile", "justfile",
  "taskfile.yml", "taskfile.yaml", ".envrc", "pyproject.toml", "setup.py", "setup.cfg",
  ".pre-commit-config.yaml", "lefthook.yml", "lefthook.yaml", ".lefthook.yml", ".gitlab-ci.yml",
]);
const AUTO_RUN_DIRS = [".vscode", ".idea", ".github", ".husky", ".devcontainer", ".circleci", ".gitlab", ".claude", ".cargo"];
/** IDE/linter avtomatik yuklaydigan konfiglar (eslint.config.mjs, .prettierrc.js ...). */
const AUTO_RUN_CONFIG = /^(eslint\.config\.|\.eslintrc|prettier\.config\.|\.prettierrc)/;
/** Windows'da nomi bilan chaqirilsa ishga tushadigan fayllar (git.bat, npm.cmd ...). */
const EXEC_EXT = /\.(bat|cmd|com|exe|ps1|psm1|vbs|vbe|wsf|wsh|msc|cpl|scr|lnk)$/;
function isAutoRunPath(real) {
  const rel = relative(process.cwd(), real).split(sep).join("/").toLowerCase();
  const parts = rel.split("/");
  const base = parts[parts.length - 1] ?? "";
  if (AUTO_RUN_FILES.has(base) || base.startsWith(".env") || AUTO_RUN_CONFIG.test(base) || EXEC_EXT.test(base)) return true;
  // Istalgan chuqurlikda (apps/web/.vscode/tasks.json ham).
  return parts.some((seg) => AUTO_RUN_DIRS.includes(seg));
}

/** Model yuborgan matnni terminalda xavfsiz ko'rsatish: boshqaruv belgilari ko'rinadigan bo'ladi. */
export function visible(s) {
  return String(s ?? "").replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, (ch) => "\\x" + ch.charCodeAt(0).toString(16).padStart(2, "0"));
}

export async function runTool(name, args, confirm) {
  switch (name) {
    case "list_dir": {
      const r = resolvePath(args.path ?? ".");
      if (isProtected(r.real, { outside: r.outside })) return `XATO: "${args.path}" — himoyalangan yo'l, ochilmaydi.`;
      if (r.outside) {
        const ok = await confirm(`${outsideNote(r)}ro'yxat ko'rilsinmi: ${c.white(r.real)}?`, /*forcePrompt=*/ true, { tool: "list_dir", path: r.real, dir: true, outside: true });
        if (!ok) return "Foydalanuvchi rad etdi (ish papkasidan tashqaridagi papka).";
      }
      return tree(r.real) || "(bo'sh)";
    }
    case "read_file": {
      const r = resolvePath(args.path);
      if (isProtected(r.real, { outside: r.outside })) return `XATO: "${args.path}" — himoyalangan yo'l (kalit/parol/tizim), o'qilmaydi.`;
      if (r.outside) {
        const ok = await confirm(`${outsideNote(r)}o'qilsinmi: ${c.white(r.real)}?`, /*forcePrompt=*/ true, { tool: "read_file", path: r.real, outside: true });
        if (!ok) return "Foydalanuvchi rad etdi (ish papkasidan tashqaridagi fayl).";
      }
      if (!existsSync(r.real)) return `XATO: "${args.path}" topilmadi.`;
      const content = readFileSync(r.real, "utf8");
      return content.length > 60_000 ? content.slice(0, 60_000) + "\n... (qisqartirildi)" : content;
    }
    case "write_file": {
      const r = resolvePath(args.path);
      // Ishga tushganda kod bajaradigan fayllar (npm skriptlari, VS Code tasks, CI,
      // git hooks, .env) — vibe/"a" rejimida ham HAR DOIM so'raladi.
      const autoRun = !r.outside && isAutoRunPath(r.real);
      if (isProtected(r.real, { write: true, outside: r.outside })) return `XATO: "${args.path}" — himoyalangan yo'l (kalit/parol/tizim/git hook), yozilmaydi.`;
      const exists = existsSync(r.real);
      const ok = await confirm(
        `${outsideNote(r)}${exists ? "Almashtirilsinmi" : "Yaratilsinmi"}: ${c.white(visible(r.outside ? r.real : args.path))} (${(args.content ?? "").length} belgi)?`,
        /*forcePrompt=*/ r.outside || autoRun,
        { tool: "write_file", path: r.outside ? r.real : args.path, content: args.content ?? "", exists, outside: r.outside, autoRun },
      );
      if (!ok) return "Foydalanuvchi rad etdi.";
      mkdirSync(dirname(r.real), { recursive: true });
      writeFileSync(r.real, args.content ?? "");
      console.log(`  ${c.green(exists ? "✎ o'zgartirildi" : "＋ yaratildi")} ${c.dim(r.outside ? r.real : args.path)}`);
      return `OK: ${args.path} yozildi.`;
    }
    case "make_dir": {
      const r = resolvePath(args.path);
      if (isProtected(r.real, { write: true, outside: r.outside })) return `XATO: "${args.path}" — himoyalangan yo'l, yaratilmaydi.`;
      const ok = await confirm(
        `${outsideNote(r)}Papka yaratilsinmi: ${c.white(visible(r.outside ? r.real : args.path))}?`,
        /*forcePrompt=*/ r.outside,
        { tool: "make_dir", path: r.outside ? r.real : args.path, dir: true, outside: r.outside },
      );
      if (!ok) return "Foydalanuvchi rad etdi.";
      mkdirSync(r.real, { recursive: true });
      console.log(`  ${c.green("📁 yaratildi")} ${c.dim(r.outside ? r.real : args.path)}`);
      return `OK: ${args.path} papkasi yaratildi.`;
    }
    case "run_command": {
      const cls = classifyCommand(args.command ?? "");
      // Terminal boshqaruv belgilari (ESC va h.k.) tasdiq oynasida ko'rinadigan buyruqni
      // soxtalashtirishi mumkin — bunday buyruq umuman bajarilmaydi.
      if (/[\x00-\x08\x0b-\x1f\x7f-\x9f]/.test(args.command ?? "")) {
        return "XATO: Buyruqda terminal boshqaruv belgilari bor — xavfsizlik uchun bajarilmaydi.";
      }
      if (cls.level === "blocked") {
        return `XATO: Bu buyruq xavfli sifatida bloklandi (${cls.reason}). Boshqa yechim ishlab bering.`;
      }
      // Faqat "safe" (faqat-o'qish) buyruq avtomatik tasdiqlanishi mumkin;
      // "risky" — `--yes`, vibe yoki "a" bilan ham HAR DOIM so'raladi.
      const label =
        cls.level === "safe"
          ? `Buyruq bajarilsinmi: ${c.amber(visible(args.command))}?`
          : `⚠️  ${cls.reason.toUpperCase()} — bajarilsinmi: ${c.amber(visible(args.command))}?`;
      const cmdMeta = { tool: "run_command", command: args.command, risky: cls.level !== "safe" };
      const ok = cls.level === "safe"
        ? await confirm(label, false, cmdMeta)
        : await confirm(label, /*forcePrompt=*/ true, cmdMeta);
      if (!ok) return "Foydalanuvchi rad etdi.";
      try {
        const out = execSync(args.command, {
          cwd: process.cwd(),
          encoding: "utf8",
          stdio: "pipe",
          timeout: 120_000,
          // Windows cmd.exe buyruqni avval JORIY papkadan qidiradi — agent yaratgan
          // git.bat "xavfsiz" git status o'rniga ishga tushmasin.
          env: IS_WIN ? { ...process.env, NoDefaultCurrentDirectoryInExePath: "1" } : process.env,
        });
        return `EXIT 0\n${out.slice(0, 20_000)}`;
      } catch (err) {
        return `XATO (exit ${err.status ?? "?"}):\n${(err.stdout ?? "") + (err.stderr ?? err.message)}`.slice(0, 20_000);
      }
    }
    default:
      return `Noma'lum vosita: ${name}`;
  }
}

// ---- Harakatlar jurnali (action ledger) ----------------------------------
// Model "yaratdim/bajardim" deyishi mumkin, lekin haqiqatni faqat vosita
// natijasi biladi. Jurnal har bir chaqiruvni natija matnidan (runTool qaytaradigan
// aniq prefikslar: "OK:", "EXIT 0", "XATO", "Foydalanuvchi rad etdi") tasniflaydi.
// Bu deterministik — modelga ishonmaydi.

/**
 * "Bajardim" deb aytib, aslida bajarmaslikka qarshi system-prompt qoidasi.
 * CLI (agent.mjs) va desktop (main.mjs) shu bitta matndan foydalanadi.
 */
export const HONESTY_RULE = [
  "HAQQONIYLIK (QAT'IY): faqat vosita natijasi tasdiqlagan amalni 'bajardim/yaratdim/yozdim/ishga tushirdim' deb ayt.",
  "Har bir vosita natijasi boshida [HOLAT: ...] belgisi bor: BAJARILDI bo'lmasa (XATO, RAD ETILDI, TAKROR) — o'sha amal BAJARILMAGAN; buni foydalanuvchiga ochiq ayt va muvaffaqiyat deb ko'rsatma.",
  "Vositani chaqirmasdan turib fayl yozdim, buyruq bajardim yoki test o'tdi dema. Buyruq exit kodi 0 bo'lmasa — u muvaffaqiyatsiz.",
  "[SOVEREIGN TIZIM JURNALI] bloki tizim tomonidan qo'shiladi va haqiqiy natijalarni ko'rsatadi — yakuniy xulosang unga zid bo'lmasin.",
].join(" ");

/** Diskda yoki tizimda iz qoldiradigan vositalar. */
export const SIDE_EFFECT_TOOLS = new Set(["write_file", "make_dir", "run_command"]);

/**
 * Vosita natijasining holati:
 *  "ok" — bajarildi; "failed" — xato (bajarilmadi yoki exit≠0);
 *  "declined" — foydalanuvchi rad etdi (bajarilmadi).
 */
export function toolStatus(name, result) {
  const r = String(result ?? "");
  if (/^Foydalanuvchi rad etdi/.test(r)) return "declined";
  if (/^XATO\b/.test(r) || /^Noma'lum vosita/.test(r)) return "failed";
  if (name === "run_command") return /^EXIT 0\b/.test(r) ? "ok" : "failed";
  if (name === "write_file" || name === "make_dir") return /^OK:/.test(r) ? "ok" : "failed";
  return "ok";
}

const oneLine = (s, max = 120) => {
  const t = visible(String(s ?? "")).replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
};

/** Bitta jurnal yozuvi. `status` berilsa (mas. "skipped") natijadan hisoblanmaydi. */
export function ledgerEntry(name, args, result, status = toolStatus(name, result)) {
  const a = args ?? {};
  const target = name === "run_command" ? oneLine(a.command) : oneLine(a.path ?? ".");
  const r = String(result ?? "");
  let exit = null;
  if (name === "run_command") {
    const m = /^EXIT (\d+)/.exec(r) ?? /^XATO \(exit ([^)]+)\)/.exec(r);
    if (m) exit = m[1];
  }
  const detail = status === "failed" ? oneLine(r.replace(/^XATO(\s*\(exit [^)]+\))?:?\s*/, ""), 160) : "";
  return { tool: name, target, status, exit, detail };
}

/** Modelga yuboriladigan natija boshiga qo'yiladigan aniq holat belgisi. */
export function statusTag(status) {
  switch (status) {
    case "ok":
      return "[HOLAT: BAJARILDI]";
    case "declined":
      return "[HOLAT: RAD ETILDI — bu amal BAJARILMADI]";
    case "skipped":
      return "[HOLAT: TAKROR — qayta bajarilmadi]";
    default:
      return "[HOLAT: XATO — bu amal BAJARILMADI yoki muvaffaqiyatsiz tugadi]";
  }
}

const ACTION_VERB = {
  write_file: { ok: "fayl yozildi", failed: "fayl YOZILMADI (xato)", declined: "fayl YOZILMADI (rad etildi)", skipped: "fayl — takror chaqiruv, o'tkazib yuborildi" },
  make_dir: { ok: "papka yaratildi", failed: "papka YARATILMADI (xato)", declined: "papka YARATILMADI (rad etildi)", skipped: "papka — takror chaqiruv, o'tkazib yuborildi" },
  run_command: { ok: "buyruq bajarildi", failed: "buyruq MUVAFFAQIYATSIZ", declined: "buyruq BAJARILMADI (rad etildi)", skipped: "buyruq — takror chaqiruv, o'tkazib yuborildi" },
  read_file: { ok: "o'qildi", failed: "o'qilmadi (xato)", declined: "o'qilmadi (rad etildi)", skipped: "takror o'qish" },
  list_dir: { ok: "ko'rildi", failed: "ko'rilmadi (xato)", declined: "ko'rilmadi (rad etildi)", skipped: "takror ko'rish" },
};

/**
 * Jurnalni qatorlarga aylantiradi (rangsiz). Muvaffaqiyatli o'qishlar bitta
 * qatorga yig'iladi; qolgan har bir amal alohida qator.
 * @returns {{status: string, text: string}[]}
 */
export function ledgerLines(entries) {
  const lines = [];
  let reads = 0;
  for (const e of entries ?? []) {
    if (!SIDE_EFFECT_TOOLS.has(e.tool) && e.status === "ok") {
      reads++;
      continue;
    }
    if (!SIDE_EFFECT_TOOLS.has(e.tool) && e.status === "skipped") continue;
    const verb = ACTION_VERB[e.tool]?.[e.status] ?? `${e.tool}: ${e.status}`;
    let text = `${verb}: ${e.target}`;
    if (e.tool === "run_command" && e.exit != null) text += ` (exit ${e.exit})`;
    if (e.status === "failed" && e.detail && e.tool !== "run_command") text += ` — ${e.detail}`;
    lines.push({ status: e.status, text });
  }
  if (reads) lines.push({ status: "ok", text: `${reads} ta o'qish/ko'rish amali bajarildi` });
  return lines;
}

/** Foydalanuvchiga xulosa ko'rsatishga arziydimi (iz qoldiruvchi amal yoki muammo bo'lsa). */
export function ledgerWorthShowing(entries) {
  return (entries ?? []).some((e) => SIDE_EFFECT_TOOLS.has(e.tool) || e.status === "failed" || e.status === "declined");
}

/** Modelga beriladigan faktlar jurnali (vosita natijasiga qo'shiladi). */
export function ledgerForModel(entries) {
  const lines = ledgerLines(entries);
  if (!lines.length) return "";
  const mark = { ok: "✓", failed: "✕", declined: "⊘", skipped: "↺" };
  return [
    "[SOVEREIGN TIZIM JURNALI — shu navbatda vositalar orqali HAQIQATDA sodir bo'lgan amallar. Foydalanuvchiga faqat shunga mos xulosa ber: ✓ bo'lmagan amalni 'bajardim/yaratdim' dema, ✕/⊘ bo'lsa buni ochiq ayt.]",
    ...lines.map((l) => `${mark[l.status] ?? "•"} ${l.text}`),
  ].join("\n");
}

/**
 * Bitta agent navbati uchun kuzatuvchi: vositani ishga tushiradi, natijaga
 * [HOLAT] belgisini qo'yadi, jurnal yuritadi va takror chaqiruvlarni to'g'ri
 * boshqaradi. Eski mantiq har qanday takrorni "allaqachon bajarilgan" deb
 * qaytarardi — hatto birinchi urinish rad etilgan/xato bo'lsa ham (model buni
 * muvaffaqiyat deb tushunardi) va fayl o'zgargandan keyin testni qayta
 * ishga tushirishni ham to'sardi.
 *
 * @param {(name: string, args: object) => Promise<string>} exec  vositani bajaruvchi
 */
export function createTurnTracker(exec) {
  const entries = [];
  const seen = new Map(); // fp -> { status, mutation, detail }
  let mutation = 0; // muvaffaqiyatli iz qoldiruvchi amallar soni
  return {
    entries,
    async run(name, args) {
      const fp = `${name}:${JSON.stringify(args ?? {})}`;
      const prev = seen.get(fp);
      if (prev && (prev.status === "declined" || prev.mutation === mutation)) {
        const msg =
          prev.status === "ok"
            ? "Bu amal shu navbatda allaqachon MUVAFFAQIYATLI bajarilgan va shundan beri hech narsa o'zgarmagan. Boshqa qadamga o't yoki ishni yakunla."
            : prev.status === "declined"
              ? "Bu amalni foydalanuvchi shu navbatda RAD ETGAN — u BAJARILMAGAN. Qayta so'rama; foydalanuvchiga rad etilganini ayt."
              : `Bu amal shu navbatda XATO bergan${prev.detail ? ` (${prev.detail})` : ""} va shundan beri hech narsa o'zgarmagan — u BAJARILMAGAN. Sababini tuzat yoki foydalanuvchiga ayt.`;
        return { status: "skipped", result: msg, content: `${statusTag("skipped")}\n${msg}` };
      }
      let result;
      try {
        result = String(await exec(name, args));
      } catch (err) {
        result = `XATO: ${err?.message ?? err}`;
      }
      const status = toolStatus(name, result);
      if (status === "ok" && SIDE_EFFECT_TOOLS.has(name)) mutation++;
      const entry = ledgerEntry(name, args, result, status);
      seen.set(fp, { status, mutation, detail: entry.detail || (entry.exit != null ? `exit ${entry.exit}` : "") });
      entries.push(entry);
      return { status, result, entry, content: `${statusTag(status)}\n${result}` };
    },
    /** Modelga beriladigan jurnal (ko'rsatishga arzimasa — bo'sh). */
    forModel() {
      return ledgerWorthShowing(entries) ? ledgerForModel(entries) : "";
    },
  };
}

// Modelning "bajardim" turidagi da'volari (uz lotin/kirill, ru, en).
const CLAIM_RE =
  /(yaratdim|yozdim|saqladim|o['‘’ʻ`]?zgartirdim|yangiladim|qo['‘’ʻ`]?shdim|o['‘’ʻ`]?rnatdim|ishga tushirdim|bajardim|tuzatdim|o['‘’ʻ`]?chirdim|яратдим|ёздим|сақладим|ўзгартирдим|бажардим|создал|записал|сохранил|обновил|установил|запустил|исправил|удалил|\bI(?:'ve| have)? (?:created|written|wrote|saved|updated|installed|ran|executed|fixed|deleted)\b|\b(?:created|saved|installed|executed)\b)/i;

// Halol "bajarilmadi" iboralari — bunday qatordagi fayl nomi da'vo emas.
const NEG_RE =
  /(yozilmadi|yaratilmadi|bajarilmadi|saqlanmadi|rad et|xato|muvaffaqiyatsiz|ruxsat berilmadi|ёзилмади|яратилмади|бажарилмади|рад эт|хато|не (удалось|создан|записан|сохранён|выполн)|отклон|ошибк|not (created|written|saved)|fail|declin|denied|error)/i;

/**
 * Oxirgi javob bajarilgan ish haqida gapiradimi-yu, jurnal buni tasdiqlamaydimi?
 * Qaytaradi: null (muammo yo'q) yoki ogohlantirish matni.
 */
export function unsupportedClaim(finalText, entries) {
  const text = String(finalText ?? "");
  if (!text.trim() || !CLAIM_RE.test(text)) return null;
  const list = entries ?? [];
  const okEffects = list.filter((e) => SIDE_EFFECT_TOOLS.has(e.tool) && e.status === "ok");
  if (!okEffects.length) {
    return "Javobda amal bajarilgandek aytilgan, lekin bu navbatda birorta fayl yozilmadi, papka yaratilmadi yoki buyruq muvaffaqiyatli bajarilmadi.";
  }
  // Tilga olingan, lekin hech qachon muvaffaqiyatli yozilmagan fayl/papka.
  const okTargets = new Set(okEffects.map((e) => e.target));
  const missed = [];
  for (const e of list) {
    if (e.tool === "run_command" || !SIDE_EFFECT_TOOLS.has(e.tool)) continue;
    if (e.status === "ok" || okTargets.has(e.target)) continue;
    const base = e.target.split(/[\\/]/).pop();
    if (!base || base.length <= 2 || missed.includes(e.target)) continue;
    // Faylni tilga olgan qatorlarning hammasi uni "yozilmadi/rad etildi" deb halol aytsa — muammo yo'q.
    const mentions = text.split("\n").filter((l) => l.includes(base));
    if (mentions.length && !mentions.every((l) => NEG_RE.test(l))) missed.push(e.target);
  }
  return missed.length ? `Javobda tilga olingan, lekin aslida yozilmagan: ${missed.join(", ")}.` : null;
}

// The server caps a single message at 40k chars; a big cwd (e.g. the home folder)
// can produce 50k+ of tree, so keep the overview short — the agent can list_dir more.
const CONTEXT_MAX = 6_000;

export function contextSummary() {
  let t = tree(process.cwd()) || "(bo'sh)";
  if (t.length > CONTEXT_MAX) {
    t = `${t.slice(0, CONTEXT_MAX).replace(/\n[^\n]*$/, "")}\n… (qisqartirildi — batafsil uchun list_dir ishlating)`;
  }
  return `Joriy ish papkasi: ${process.cwd()}\nTuzilma:\n${t}`;
}
