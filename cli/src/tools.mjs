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
      const real = realpathSync(cur);
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

/** Faqat YOZISH taqiqlangan (o'qish mumkin) — git hook/config orqali kod ijrosi. */
const WRITE_DENY = [/\/\.git\/hooks(\/|$)/, /\/\.git\/config$/];

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
const RISKY_CHARS = IS_WIN ? /[;&|$()`<>\n\r~%^@{}!,]/ : /[;&|$()`<>\n\r~%^@{}!\\]/;

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
]);
const AUTO_RUN_DIRS = [".vscode", ".idea", ".github", ".husky", ".devcontainer", ".circleci", ".gitlab"];
function isAutoRunPath(real) {
  const rel = relative(process.cwd(), real).split(sep).join("/").toLowerCase();
  const base = rel.split("/").pop() ?? "";
  if (AUTO_RUN_FILES.has(base) || base.startsWith(".env") || base === ".gitlab-ci.yml") return true;
  return AUTO_RUN_DIRS.some((d) => rel === d || rel.startsWith(d + "/"));
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
        `${outsideNote(r)}${exists ? "Almashtirilsinmi" : "Yaratilsinmi"}: ${c.white(r.outside ? r.real : args.path)} (${(args.content ?? "").length} belgi)?`,
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
        `${outsideNote(r)}Papka yaratilsinmi: ${c.white(r.outside ? r.real : args.path)}?`,
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
      if (cls.level === "blocked") {
        return `XATO: Bu buyruq xavfli sifatida bloklandi (${cls.reason}). Boshqa yechim ishlab bering.`;
      }
      // Faqat "safe" (faqat-o'qish) buyruq avtomatik tasdiqlanishi mumkin;
      // "risky" — `--yes`, vibe yoki "a" bilan ham HAR DOIM so'raladi.
      const label =
        cls.level === "safe"
          ? `Buyruq bajarilsinmi: ${c.amber(args.command)}?`
          : `⚠️  ${cls.reason.toUpperCase()} — bajarilsinmi: ${c.amber(args.command)}?`;
      const cmdMeta = { tool: "run_command", command: args.command, risky: cls.level !== "safe" };
      const ok = cls.level === "safe"
        ? await confirm(label, false, cmdMeta)
        : await confirm(label, /*forcePrompt=*/ true, cmdMeta);
      if (!ok) return "Foydalanuvchi rad etdi.";
      try {
        const out = execSync(args.command, { cwd: process.cwd(), encoding: "utf8", stdio: "pipe", timeout: 120_000 });
        return `EXIT 0\n${out.slice(0, 20_000)}`;
      } catch (err) {
        return `XATO (exit ${err.status ?? "?"}):\n${(err.stdout ?? "") + (err.stderr ?? err.message)}`.slice(0, 20_000);
      }
    }
    default:
      return `Noma'lum vosita: ${name}`;
  }
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
