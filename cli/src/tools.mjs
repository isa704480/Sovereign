import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync, realpathSync } from "node:fs";
import { resolve, relative, dirname, join, isAbsolute } from "node:path";
import { execSync } from "node:child_process";
import { c } from "./ui.mjs";

/**
 * Yo'lni realpath orqali yechadi (symlink hujumlariga qarshi), lekin THROW
 * QILMAYDI — ish papkasidan tashqarida ekanini `outside` bilan bildiradi.
 * Chaqiruvchi tashqarida bo'lsa foydalanuvchidan ruxsat so'raydi.
 */
function resolvePath(p) {
  const root = realpathSync(process.cwd());
  const abs = isAbsolute(p) ? p : resolve(root, p);
  // Fayl hali bo'lmasa, ota-papka orqali realpath hisoblaymiz.
  let real = abs;
  try {
    real = realpathSync(abs);
  } catch {
    let parent = dirname(abs);
    try {
      parent = realpathSync(parent);
    } catch {
      /* parent ham yo'q — abs holatida qoladi */
    }
    real = join(parent, abs.slice(dirname(abs).length + 1));
  }
  const rel = relative(root, real);
  const outside = rel.startsWith("..") || isAbsolute(rel);
  return { real, rel, outside };
}

/**
 * Ruxsat berilgan taqdirda ham TAQIQLANGAN tizim yo'llari — parol/kalit/OS.
 * Bu joylarga foydalanuvchi "ha" desa ham yozilmaydi.
 */
const PROTECTED_PATHS = [
  /[\\/]etc[\\/](passwd|shadow|sudoers)/i,
  /[\\/]\.ssh[\\/]/i,
  /[\\/](Windows|System32|Program Files)[\\/]/i,
  /[\\/]boot[\\/]/i,
];
function isProtected(real) {
  return PROTECTED_PATHS.some((re) => re.test(real));
}
function outsideNote(r) {
  return r.outside ? c.amber("⚠️  ish papkasidan TASHQARIDA — ") : "";
}

/**
 * Xavfli buyruqlarni oq ro'yxatga tayangan holda tekshiradi. `--yes` bilan
 * ham ba'zi qat'iy taqiqlangan naqshlar bloklanadi. Buyruq oq ro'yxatdagi
 * biror binariy bilan boshlanmasa yoki `; | & > <` metasimvollari orqali
 * chained bo'lsa — hujum sifatida qabul qilinadi va tasdiq majburiy.
 */
const CMD_ALLOWLIST = [
  "git", "npm", "npx", "node", "pnpm", "yarn", "bun", "deno",
  "python", "python3", "pip", "pip3", "poetry", "uv",
  "go", "cargo", "rustc", "gcc", "g++", "clang", "make", "cmake",
  "docker", "kubectl", "helm", "terraform",
  "ls", "cat", "grep", "find", "sed", "awk", "head", "tail", "wc", "sort", "uniq",
  "cd", "pwd", "echo", "printf", "which", "mkdir", "cp", "mv", "touch", "chmod",
  "rg", "fd", "bat", "jq", "curl", "wget",
  "test", "tsc", "jest", "vitest", "mocha", "pytest",
];

const HARD_BLOCKED = [
  /\brm\s+-rf\s+(\/|~|\$HOME)/i,
  /:\(\)\s*\{\s*:\|:&\s*\}/,           // fork bomb
  /\bmkfs\b/, /\bdd\s+if=/, /\bshred\b/,
  /\b(curl|wget)\b[^|]*\|\s*(sh|bash|zsh|python)\b/i, // pipe-to-shell
  /\b(nc|ncat|socat)\b.*\s-e\s/i,      // reverse shell
  /\/etc\/(passwd|shadow|sudoers)/,
  /\.ssh\/(id_rsa|id_ed25519|authorized_keys)/,
];

export function classifyCommand(command) {
  for (const re of HARD_BLOCKED) if (re.test(command)) return { level: "blocked", reason: `Xavfli naqsh: ${re}` };
  const first = command.trim().split(/[\s;&|<>]/, 1)[0];
  const base = first?.split(/[/\\]/).pop() ?? "";
  if (!CMD_ALLOWLIST.includes(base)) return { level: "unknown", reason: `Oq ro'yxatda yo'q: ${base}` };
  // Metasymbols bilan chained bo'lsa tasdiq har doim majburiy.
  if (/[;&|`$(]/.test(command)) return { level: "risky", reason: "Zanjir/subshell mavjud" };
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
export async function runTool(name, args, confirm) {
  switch (name) {
    case "list_dir": {
      const r = resolvePath(args.path ?? ".");
      if (r.outside) {
        if (isProtected(r.real)) return `XATO: "${args.path}" — himoyalangan tizim yo'li, ochilmaydi.`;
        const ok = await confirm(`${outsideNote(r)}ro'yxat ko'rilsinmi: ${c.white(r.real)}?`, /*forcePrompt=*/ true, { tool: "list_dir", path: r.real, dir: true });
        if (!ok) return "Foydalanuvchi rad etdi (ish papkasidan tashqaridagi papka).";
      }
      return tree(r.real) || "(bo'sh)";
    }
    case "read_file": {
      const r = resolvePath(args.path);
      if (r.outside) {
        if (isProtected(r.real)) return `XATO: "${args.path}" — himoyalangan tizim yo'li, o'qilmaydi.`;
        const ok = await confirm(`${outsideNote(r)}o'qilsinmi: ${c.white(r.real)}?`, /*forcePrompt=*/ true, { tool: "read_file", path: r.real });
        if (!ok) return "Foydalanuvchi rad etdi (ish papkasidan tashqaridagi fayl).";
      }
      if (!existsSync(r.real)) return `XATO: "${args.path}" topilmadi.`;
      const content = readFileSync(r.real, "utf8");
      return content.length > 60_000 ? content.slice(0, 60_000) + "\n... (qisqartirildi)" : content;
    }
    case "write_file": {
      const r = resolvePath(args.path);
      if (r.outside && isProtected(r.real)) return `XATO: "${args.path}" — himoyalangan tizim yo'li, yozilmaydi.`;
      const exists = existsSync(r.real);
      const ok = await confirm(
        `${outsideNote(r)}${exists ? "Almashtirilsinmi" : "Yaratilsinmi"}: ${c.white(r.outside ? r.real : args.path)} (${(args.content ?? "").length} belgi)?`,
        /*forcePrompt=*/ r.outside,
        { tool: "write_file", path: r.outside ? r.real : args.path, content: args.content ?? "", exists },
      );
      if (!ok) return "Foydalanuvchi rad etdi.";
      mkdirSync(dirname(r.real), { recursive: true });
      writeFileSync(r.real, args.content ?? "");
      console.log(`  ${c.green(exists ? "✎ o'zgartirildi" : "＋ yaratildi")} ${c.dim(r.outside ? r.real : args.path)}`);
      return `OK: ${args.path} yozildi.`;
    }
    case "make_dir": {
      const r = resolvePath(args.path);
      if (r.outside && isProtected(r.real)) return `XATO: "${args.path}" — himoyalangan tizim yo'li, yaratilmaydi.`;
      const ok = await confirm(
        `${outsideNote(r)}Papka yaratilsinmi: ${c.white(r.outside ? r.real : args.path)}?`,
        /*forcePrompt=*/ r.outside,
        { tool: "make_dir", path: r.outside ? r.real : args.path, dir: true },
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
      // `blocked` bo'lmasa, majburiy tasdiq — `--yes` bilan ham `unknown`/`risky`
      // buyruqlar uchun tasdiq talab qilinadi.
      const label =
        cls.level === "safe"
          ? `Buyruq bajarilsinmi: ${c.amber(args.command)}?`
          : `⚠️  ${cls.reason.toUpperCase()} — bajarilsinmi: ${c.amber(args.command)}?`;
      const cmdMeta = { tool: "run_command", command: args.command };
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
