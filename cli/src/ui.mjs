// SOVEREIGN CLI — Apple Liquid Glass adapted for terminal.
// Zero dependencies. Restrained palette, hairline dividers, unified panels.

import { VERSION as PKG_VERSION } from "./version.mjs";

// Rang va spinner holati — ishga tushgach bir marta sozlanadi (configureUi).
// NO_COLOR (https://no-color.org), --no-color, quvur (non-TTY) — ANSI yo'q.
// FORCE_COLOR=1..3 — quvurda ham rang (CI loglari uchun).
const ui = {
  color: Boolean(process.stdout.isTTY) && !process.env.NO_COLOR && process.env.TERM !== "dumb",
  spinner: true,
  /** Spinner/progress yoziladigan oqim (-p rejimida stderr). */
  stream: process.stdout,
};
if (process.env.FORCE_COLOR && process.env.FORCE_COLOR !== "0" && !process.env.NO_COLOR) ui.color = true;

/**
 * Terminal chiqishini sozlaydi.
 * @param {{ color?: boolean, spinner?: boolean, stream?: NodeJS.WriteStream }} opts
 */
export function configureUi(opts = {}) {
  if (typeof opts.color === "boolean") ui.color = opts.color;
  if (typeof opts.spinner === "boolean") ui.spinner = opts.spinner;
  if (opts.stream) ui.stream = opts.stream;
}

export function colorEnabled() {
  return ui.color;
}

/** ANSI kodlarini olib tashlaydi (log/JSON uchun). */
export function stripAnsi(s) {
  return String(s ?? "").replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");
}

const wrap = (open, close) => (s) => (ui.color ? `\x1b[${open}m${s}\x1b[${close}m` : String(s));

/**
 * Apple-style restrained palette:
 * - `text` (white) and `dim` (mid gray) do 90% of the work
 * - `subtle` and `muted` for hairline hierarchies
 * - `accent` (single indigo) — used sparingly for emphasis
 * - Semantic (green/amber/red) only for status meaning, never decoration
 */
export const c = {
  reset: "\x1b[0m",
  bold: wrap(1, 22),
  dim: wrap(2, 22),
  italic: wrap(3, 23),
  underline: wrap(4, 24),

  text: wrap("38;2;235;238;250", 39),
  subtle: wrap("38;2;175;180;205", 39),
  muted: wrap("38;2;120;127;160", 39),
  faint: wrap("38;2;80;85;110", 39),
  hairline: wrap("38;2;48;52;72", 39),

  accent: wrap("38;2;118;108;235", 39),
  accentDim: wrap("38;2;90;82;180", 39),
  ok: wrap("38;2;90;204;150", 39),
  warn: wrap("38;2;245;170;60", 39),
  err: wrap("38;2;235;90;100", 39),

  // Compat aliases (agent.mjs & older code)
  white: wrap("38;2;235;238;250", 39),
  gray: wrap("38;2;120;127;160", 39),
  darkGray: wrap("38;2;80;85;110", 39),
  green: wrap("38;2;90;204;150", 39),
  emerald: wrap("38;2;90;204;150", 39),
  amber: wrap("38;2;245;170;60", 39),
  red: wrap("38;2;235;90;100", 39),
  indigo: wrap("38;2;118;108;235", 39),
  violet: wrap("38;2;140;120;235", 39),
  teal: wrap("38;2;90;180;220", 39),
  cyan: wrap("38;2;100;200;225", 39),
  pink: wrap("38;2;220;125;175", 39),
};

export function termWidth() {
  return Math.min(Math.max(process.stdout.columns || 80, 60), 120);
}

/** Haqiqiy terminal kengligi (markazlashtirish uchun — 120 cheklovsiz). */
export function rawWidth() {
  return Math.max(process.stdout.columns || 80, 40);
}

/** Adaptive left gutter — Apple-style breathing room. */
export function gutter() {
  const w = termWidth();
  if (w >= 110) return "     ";
  if (w >= 90) return "    ";
  if (w >= 75) return "   ";
  return "  ";
}
const G = gutter;

/** Visible length ignoring ANSI. Doubles wide emoji as 2. */
function visLen(s) {
  const noAnsi = String(s).replace(/\x1b\[[0-9;]*m/g, "");
  // Rough emoji width: chars > U+2600 that are pictographic count 2.
  let n = 0;
  for (const ch of noAnsi) {
    const code = ch.codePointAt(0);
    if (code > 0x1f000 || (code >= 0x2600 && code <= 0x27ff)) n += 2;
    else n += 1;
  }
  return n;
}

function pad(s, width) {
  const diff = Math.max(0, width - visLen(s));
  return s + " ".repeat(diff);
}

function center(s, width) {
  const len = visLen(s);
  const left = Math.max(0, Math.floor((width - len) / 2));
  const right = Math.max(0, width - len - left);
  return " ".repeat(left) + s + " ".repeat(right);
}

/**
 * Apple-style unified panel: single rounded box with hairline dividers
 * INSIDE (not fragmented sub-boxes). Border is subtle, content breathes.
 */
export function panel(sections, opts = {}) {
  const width = opts.width || Math.min(termWidth() - G().length * 2, 78);
  const b = c.hairline;
  const tl = b("╭"), tr = b("╮"), bl = b("╰"), br = b("╯"), h = b("─"), v = b("│");
  const top = tl + h.repeat(width - 2) + tr;
  const bot = bl + h.repeat(width - 2) + br;
  const divider = b("├") + h.repeat(width - 2) + b("┤");

  const body = [];
  sections.forEach((section, i) => {
    if (i > 0) body.push(divider);
    const pad2 = "  ";
    body.push(v + " " + " ".repeat(width - 4) + " " + v); // top-pad
    for (const line of section) {
      body.push(v + pad2 + pad(line, width - 6) + pad2 + v);
    }
    body.push(v + " " + " ".repeat(width - 4) + " " + v); // bottom-pad
  });

  return [top, ...body, bot];
}

/** Simple box (single section — kept for compatibility). */
export function box(lines, opts = {}) {
  return panel([lines], opts);
}

/**
 * Big centered SOVEREIGN wordmark — kept restrained, hairline weight.
 * On narrow terminals falls back to a small mark.
 */
const BIG = [
  "███████╗ ██████╗ ██╗   ██╗███████╗██████╗ ███████╗██╗ ██████╗ ███╗   ██╗",
  "██╔════╝██╔═══██╗██║   ██║██╔════╝██╔══██╗██╔════╝██║██╔════╝ ████╗  ██║",
  "███████╗██║   ██║██║   ██║█████╗  ██████╔╝█████╗  ██║██║  ███╗██╔██╗ ██║",
  "╚════██║██║   ██║╚██╗ ██╔╝██╔══╝  ██╔══██╗██╔══╝  ██║██║   ██║██║╚██╗██║",
  "███████║╚██████╔╝ ╚████╔╝ ███████╗██║  ██║███████╗██║╚██████╔╝██║ ╚████║",
  "╚══════╝ ╚═════╝   ╚═══╝  ╚══════╝╚═╝  ╚═╝╚══════╝╚═╝ ╚═════╝ ╚═╝  ╚═══╝",
];

function heroLogo(width) {
  const needed = BIG[0].length;
  if (width < needed + 4) {
    return [c.accent("◆") + " " + c.bold(c.text("SOVEREIGN"))];
  }
  return BIG.map((line) => center(c.accent(line), width));
}

export function logo() {
  return c.accent("◆") + " " + c.bold(c.text("SOVEREIGN"));
}

/**
 * Welcome banner — Apple-style unified surface.
 * One panel, hairline dividers between sections. Grayscale hierarchy.
 */
// Claude Code uslubidagi ixcham, MARKAZLASHTIRILGAN splash.
// Faqat rang/nom/logo bizniki (SOVEREIGN). Apple restraint: bitta accent, grayscale.
export function banner(config, enabledSkills = [], vibeOn = false) {
  const NL = String.fromCharCode(10);
  const w = rawWidth();
  const mark = c.accent("◆");
  const modelName = config?.omniModel
    ? config.omniModel
    : config?.token
      ? "SOVEREIGN Auto"
      : (config?.model || "openai/gpt-oss-120b");
  const billing = config?.token
    ? (config.email || "akkaunt") + " · " + (config.baseUrl || "").replace(/^https?:\/\//, "")
    : "to'g'ridan-to'g'ri (OpenRouter)";
  const skills = enabledSkills.length ? enabledSkills.join(" · ") : "—";
  const modeLine = vibeOn
    ? c.ok("avto rejim · kodni AI yozadi")
    : c.subtle("oddiy rejim · har o'zgarish tasdiqlanadi");

  const content = [
    mark + "  " + c.bold(c.text("SOVEREIGN CLI")) + " " + c.faint("v" + PKG_VERSION),
    c.subtle(modelName) + c.faint("  ·  " + billing),
    c.faint(process.cwd()),
    "",
    c.dim("Terminaldagi AI koding agenti — fayl yozadi, buyruq ishga tushiradi, test qiladi."),
    c.dim("Modelni ") + c.accent("/model") + c.dim("  ·  buyruqlar ") + c.accent("/help") + c.dim("  ·  skills: ") + c.subtle(skills),
    "",
    c.faint("Masalan: ") + c.subtle("src papkasi bilan Express server yarat va test qil"),
    modeLine,
  ];
  const maxW = Math.max(...content.map((l) => visLen(l)));
  const pad = " ".repeat(Math.max(0, Math.floor((w - maxW) / 2)));
  return NL + content.map((l) => (l ? pad + l : "")).join(NL) + NL;
}

/**
 * Bottom hint bar — Apple system bar aesthetic. Small caps, dim, single accent.
 */
// Claude Code'dagi pastki status qatori uslubida — markazlashtirilgan.
export function hintBar(config, pendingCount = 0, vibeOn = false) {
  const dot = c.faint("·");
  const status = vibeOn ? c.warn("▶▶ avto rejim yoniq") : c.subtle("oddiy rejim");
  const parts = [
    status + c.faint(" (/vibe)"),
    c.faint("/swarm agentlar"),
    pendingCount ? c.warn("📎 " + pendingCount) : null,
    c.faint("/ menyu"),
    c.faint("ctrl+c bekor"),
  ].filter(Boolean);
  const bar = parts.join("  " + dot + "  ");
  const pad = " ".repeat(Math.max(0, Math.floor((rawWidth() - visLen(bar)) / 2)));
  return pad + bar;
}

/**
 * Slash-command menu — Apple-style unified list, hairline dividers between
 * groups (not per-item borders). Two-column alignment.
 */
export function slashMenu(items) {
  const g = G();
  const width = Math.min(termWidth() - g.length * 2, 72);

  // Group by category — Apple-style hierarchy
  const groups = [
    { label: "Suhbat",   cmds: ["/help", "/clear", "/attach", "/detach"] },
    { label: "Sessiya",  cmds: ["/sessions", "/resume", "/rewind", "/fork"] },
    { label: "Rejim",    cmds: ["/vibe", "/swarm"] },
    { label: "Model",    cmds: ["/model", "/models"] },
    { label: "Skillar",  cmds: ["/skills", "/skill"] },
    { label: "Xotira",   cmds: ["/memory", "/remember", "/forget"] },
    { label: "Akkaunt",  cmds: ["/whoami", "/login", "/logout", "/register", "/upgrade"] },
    { label: "Tizim",    cmds: ["/cwd", "/doctor", "/version", "/exit"] },
  ];
  // Guruhga kiritilmagan buyruq ham menyuda ko'rinsin (ro'yxat bilan sinxron qoladi).
  const grouped = new Set(groups.flatMap((g) => g.cmds));
  const rest = items.map((i) => i.cmd).filter((cmd) => !grouped.has(cmd));
  if (rest.length) groups.push({ label: "Boshqa", cmds: rest });

  const byName = Object.fromEntries(items.map((i) => [i.cmd, i]));

  const sections = groups.filter((grp) => grp.cmds.some((cmd) => byName[cmd])).map((g) => {
    const rows = [c.faint(g.label.toUpperCase())];
    for (const cmdName of g.cmds) {
      const item = byName[cmdName];
      if (!item) continue;
      const name = pad(c.text(item.cmd), 11);
      const room = Math.max(10, width - 6 - 2 - 11 - 2);
      const desc = item.desc.length > room ? item.desc.slice(0, room - 1) + "…" : item.desc;
      rows.push("  " + name + "  " + c.subtle(desc));
    }
    return rows;
  });

  const p = panel(sections, { width });
  return "\n" + p.map((l) => g + l).join("\n") + "\n";
}

/**
 * Skills list — Apple settings-style: one panel, unified rows, ON/OFF chip.
 */
export function skillsList(skills, enabledIds) {
  const g = G();
  const width = Math.min(termWidth() - g.length * 2, 76);

  const header = c.faint("SOVEREIGN SKILLS  ") + c.subtle("/skill <id> — yoq/o'chir");

  const rows = skills.map((s) => {
    const on = enabledIds.includes(s.id);
    const badge = on ? c.ok("● ON ") : c.faint("○ OFF");
    const name = pad(c.text(s.name), 22);
    const id = pad(c.faint(s.id), 18);
    return "  " + badge + "   " + name + id + "  " + c.subtle(s.desc);
  });

  const p = panel([[header], rows], { width });
  return "\n" + p.map((l) => g + l).join("\n") + "\n";
}

/** Inline markdown → ANSI (bold / italic / `code`). */
function mdInline(s) {
  s = s.replace(/`([^`]+)`/g, (_, x) => c.accent(x));
  s = s.replace(/\*\*([^*]+)\*\*/g, (_, x) => c.bold(c.text(x)));
  s = s.replace(/__([^_]+)__/g, (_, x) => c.bold(c.text(x)));
  s = s.replace(/(?<![*\w])\*([^*\n]+)\*(?!\*)/g, (_, x) => c.italic(x));
  s = s.replace(/(?<![_\w])_([^_\n]+)_(?![_\w])/g, (_, x) => c.italic(x));
  return s;
}

/**
 * Terminal markdown renderer — sarlavha, ro'yxat, kod bloki, inline formatlar.
 * AI javobini toza, o'qiladigan ko'rinishga keltiradi (xom `**`/`#` yo'qoladi).
 */
/** Bitta markdown qatorini render qiladi; `state.inFence` kod bloki holatini saqlaydi. */
function renderMdLine(raw, state, indent, out) {
  const fence = /^\s*```(\w*)/.exec(raw);
  if (fence) {
    out.push(indent + c.hairline(state.inFence ? "└─" : "┌─ " + (fence[1] || "kod")));
    state.inFence = !state.inFence;
    return;
  }
  if (state.inFence) {
    out.push(indent + c.hairline("│ ") + c.subtle(raw));
    return;
  }
  let m;
  if ((m = /^\s*#{1,6}\s+(.*)$/.exec(raw))) {
    if (out.length ? out[out.length - 1] !== "" : state.lastNonEmpty) out.push("");
    out.push(indent + c.bold(c.text(mdInline(m[1]))));
  } else if ((m = /^(\s*)[-*]\s+(.*)$/.exec(raw))) {
    out.push(indent + m[1] + c.accent("•") + "  " + mdInline(m[2]));
  } else if ((m = /^(\s*)(\d+)\.\s+(.*)$/.exec(raw))) {
    out.push(indent + m[1] + c.accent(m[2] + ".") + "  " + mdInline(m[3]));
  } else if (/^\s*(---|\*\*\*|___)\s*$/.test(raw)) {
    out.push(indent + c.hairline("─".repeat(28)));
  } else {
    out.push(raw.trim() ? indent + mdInline(raw) : "");
  }
}

export function renderMarkdown(md, indent = "      ") {
  const lines = String(md ?? "").replace(/\r/g, "").split("\n");
  const out = [];
  const state = { inFence: false, lastNonEmpty: false };
  for (const raw of lines) renderMdLine(raw, state, indent, out);
  return out.join("\n");
}

/**
 * Oqimli markdown: tokenlar kelishi bilan TO'LIQ qatorlarni darhol render qilib
 * yozadi (kod bloki holati saqlanadi), oxirgi to'liqsiz qator `end()` da chiqadi.
 * @param {(s: string) => void} write
 */
export function markdownStream(write, indent = "      ") {
  let buf = "";
  const state = { inFence: false, lastNonEmpty: false };
  const emit = (line) => {
    const out = [];
    renderMdLine(line, state, indent, out);
    for (const l of out) write(l + "\n");
    state.lastNonEmpty = out.length ? out[out.length - 1] !== "" : state.lastNonEmpty;
  };
  return {
    push(chunk) {
      buf += String(chunk ?? "").replace(/\r/g, "");
      let nl;
      while ((nl = buf.indexOf("\n")) !== -1) {
        emit(buf.slice(0, nl));
        buf = buf.slice(nl + 1);
      }
    },
    end() {
      if (buf) emit(buf);
      buf = "";
    },
  };
}

export function clearScreen() {
  if (process.stdout.isTTY && ui.color) process.stdout.write("\x1b[2J\x1b[H");
}

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
let activeSpinner = null;

/** Faol spinnerni to'xtatadi (mas. Ctrl+C yoki tasdiq so'rovidan oldin). */
export function stopSpinner() {
  activeSpinner?.stop();
}

/**
 * Bitta qatorli spinner: kechgan soniyalar bilan. TTY bo'lmasa, NO_COLOR yoki
 * -p rejimida — umuman chizilmaydi (quvurga ANSI chiqmaydi). Tugagach qator
 * to'liq tozalanadi va kursor qaytariladi.
 */
export function spinner(label) {
  const stream = ui.stream;
  if (!ui.spinner || !stream.isTTY || !ui.color) return { stop() {}, update() {} };
  activeSpinner?.stop();
  let i = 0;
  let text = label;
  const started = Date.now();
  const draw = () => {
    const secs = Math.floor((Date.now() - started) / 1000);
    const time = secs >= 2 ? c.faint(` ${secs}s · ctrl+c bekor`) : "";
    stream.write(`\r\x1b[2K${G()}${c.accent(FRAMES[i++ % FRAMES.length])} ${c.subtle(text)}${time}`);
  };
  stream.write("\x1b[?25l");
  draw();
  const timer = setInterval(draw, 80);
  timer.unref?.();
  const self = {
    update(next) {
      text = next;
    },
    stop(clear = true) {
      if (activeSpinner !== self) return;
      activeSpinner = null;
      clearInterval(timer);
      stream.write((clear ? "\r\x1b[2K" : "\n") + "\x1b[?25h");
    },
  };
  activeSpinner = self;
  return self;
}

// Jarayon kutilmaganda tugasa ham kursor ko'rinadigan qolsin.
process.once("exit", () => {
  if (activeSpinner) activeSpinner.stop();
});

export function separator() {
  const g = G();
  const width = Math.min(termWidth() - g.length * 2, 76);
  return g + c.hairline("─".repeat(width));
}

export function stepHeader(step, total, label) {
  return G() + c.accent(`${step}/${total}`) + "  " + c.text(label);
}
