import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from "node:fs";
import { resolve, relative, dirname, join, isAbsolute } from "node:path";
import { execSync } from "node:child_process";
import { c } from "./ui.mjs";

/** Keep every file operation inside the directory where `sovereign` was started. */
function safe(p) {
  const root = process.cwd();
  const abs = isAbsolute(p) ? p : resolve(root, p);
  const rel = relative(root, abs);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`Ruxsat yo'q: "${p}" ish papkasidan tashqarida.`);
  }
  return abs;
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
      const ok = await confirm(`Buyruq bajarilsinmi: ${c.amber(args.command)}?`);
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
