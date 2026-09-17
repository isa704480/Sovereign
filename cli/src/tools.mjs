import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync, realpathSync } from "node:fs";
import { resolve, relative, dirname, join, isAbsolute } from "node:path";
import { execSync } from "node:child_process";
import { c } from "./ui.mjs";

/**
 * Har fayl operatsiyasini `sovereign` ishga tushgan ish papkasi ichida saqlaydi.
 * `realpath` orqali symlinklarni yechib, keyin cwd bilan solishtiradi — bu
 * `link → /etc/shadow` toifasidagi symlink hujumlarini to'sadi.
 */
function safe(p) {
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
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`Ruxsat yo'q: "${p}" ish papkasidan tashqarida.`);
  }
  return real;
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
      description: "Faylga yozadi (kerak bo'lsa papkalarni ham yaratadi). Mavjud faylni almashtiradi.",
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
      description: "Papka yaratadi (ichma-ich).",
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
      const dir = safe(args.path ?? ".");
      return tree(dir) || "(bo'sh)";
    }
    case "read_file": {
      const file = safe(args.path);
      if (!existsSync(file)) return `XATO: "${args.path}" topilmadi.`;
      const content = readFileSync(file, "utf8");
      return content.length > 60_000 ? content.slice(0, 60_000) + "\n... (qisqartirildi)" : content;
    }
    case "write_file": {
      const file = safe(args.path);
      const exists = existsSync(file);
      const ok = await confirm(
        `${exists ? "Almashtirilsinmi" : "Yaratilsinmi"}: ${c.white(args.path)} (${(args.content ?? "").length} belgi)?`,
      );
      if (!ok) return "Foydalanuvchi rad etdi.";
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, args.content ?? "");
      console.log(`  ${c.green(exists ? "✎ o'zgartirildi" : "＋ yaratildi")} ${c.dim(args.path)}`);
      return `OK: ${args.path} yozildi.`;
    }
    case "make_dir": {
      const dir = safe(args.path);
      const ok = await confirm(`Papka yaratilsinmi: ${c.white(args.path)}?`);
      if (!ok) return "Foydalanuvchi rad etdi.";
      mkdirSync(dir, { recursive: true });
      console.log(`  ${c.green("📁 yaratildi")} ${c.dim(args.path)}`);
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
      const ok = cls.level === "safe"
        ? await confirm(label)
        : await confirm(label, /*forcePrompt=*/ true);
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

export function contextSummary() {
  return `Joriy ish papkasi: ${process.cwd()}\nTuzilma:\n${tree(process.cwd()) || "(bo'sh)"}`;
}
