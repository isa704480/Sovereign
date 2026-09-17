// SOVEREIGN CLI — polished TUI. Zero dependencies (ANSI + terminal size only).

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const wrap = (open, close) => (s) => (useColor ? `\x1b[${open}m${s}\x1b[${close}m` : String(s));

export const c = {
  reset: "\x1b[0m",
  bold: wrap(1, 22),
  dim: wrap(2, 22),
  italic: wrap(3, 23),
  underline: wrap(4, 24),
  indigo: wrap("38;2;124;111;247", 39),
  violet: wrap("38;2;168;85;247", 39),
  teal: wrap("38;2;32;212;232", 39),
  cyan: wrap("38;2;103;232;249", 39),
  green: wrap("38;2;16;212;160", 39),
  emerald: wrap("38;2;52;211;153", 39),
  amber: wrap("38;2;245;158;11", 39),
  red: wrap("38;2;239;68;68", 39),
  pink: wrap("38;2;236;72;153", 39),
  gray: wrap("38;2;120;127;160", 39),
  darkGray: wrap("38;2;80;85;110", 39),
  white: wrap("38;2;240;242;255", 39),
  bgIndigo: wrap("48;2;40;35;80", 49),
  bgSurface: wrap("48;2;20;22;38", 49),
};

/** Terminal width, safely clamped. */
export function termWidth() {
  return Math.min(Math.max(process.stdout.columns || 80, 60), 120);
}

/**
 * Adaptive left gutter — kontent chap tomonga tiqilib qolmasin. Katta terminalda
 * ~10-15 belgi bo'shliq, kichigida 2 belgi. Butun UI shu gutterga aliniangan.
 */
export function gutter() {
  const w = termWidth();
  if (w >= 110) return "     ";
  if (w >= 90) return "    ";
  if (w >= 75) return "   ";
  return "  ";
}
const G = gutter;

/** Visible length ignoring ANSI escapes. */
function visLen(s) {
  return String(s).replace(/\x1b\[[0-9;]*m/g, "").length;
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

/** Draw a box with rounded corners and colored border. */
export function box(lines, opts = {}) {
  const width = opts.width || Math.min(termWidth() - 4, 76);
  const color = opts.color || c.indigo;
  const tl = color("╭"), tr = color("╮"), bl = color("╰"), br = color("╯"), h = color("─"), v = color("│");
  const top = tl + h.repeat(width - 2) + tr;
  const bot = bl + h.repeat(width - 2) + br;
  const body = lines.map((l) => v + " " + pad(l, width - 4) + " " + v);
  return [top, ...body, bot];
}

/** Big centered SOVEREIGN wordmark using Unicode block glyphs. */
function bigLogo() {
  // 5-line block-lettering — compact "SOVEREIGN"
  const raw = [
    "███████╗ ██████╗ ██╗   ██╗███████╗██████╗ ███████╗██╗ ██████╗ ███╗   ██╗",
    "██╔════╝██╔═══██╗██║   ██║██╔════╝██╔══██╗██╔════╝██║██╔════╝ ████╗  ██║",
    "███████╗██║   ██║██║   ██║█████╗  ██████╔╝█████╗  ██║██║  ███╗██╔██╗ ██║",
    "╚════██║██║   ██║╚██╗ ██╔╝██╔══╝  ██╔══██╗██╔══╝  ██║██║   ██║██║╚██╗██║",
    "███████║╚██████╔╝ ╚████╔╝ ███████╗██║  ██║███████╗██║╚██████╔╝██║ ╚████║",
    "╚══════╝ ╚═════╝   ╚═══╝  ╚══════╝╚═╝  ╚═╝╚══════╝╚═╝ ╚═════╝ ╚═╝  ╚═══╝",
  ];
  return raw;
}

/** Fits `bigLogo` when terminal is wide enough; otherwise falls back to a compact tag. */
function heroLogo(width) {
  const big = bigLogo();
  const needed = big[0].length;
  if (width < needed + 4) {
    // Fallback: bracketed compact wordmark
    return [
      c.indigo("⬡") + " " + c.bold(c.white("SOVEREIGN")) + " " + c.dim("· AI"),
    ];
  }
  return big.map((line) => center(c.indigo(line), width));
}

export function logo() {
  return c.indigo("⬡") + " " + c.bold(c.white("SOVEREIGN"));
}

/** Welcome banner shown when interactive REPL starts. */
export function banner(config, enabledSkills = []) {
  const g = G();
  const width = Math.min(termWidth() - g.length * 2, 84);
  const source = config?.token
    ? `${c.emerald("●")} ${c.white("SOVEREIGN akkaunt")} ${c.dim("· " + (config.baseUrl || ""))}`
    : `${c.amber("●")} ${c.white("O'z kalitingiz")} ${c.dim("· " + (config.model || "openai/gpt-4o-mini"))}`;

  const hero = heroLogo(width);
  const tagline = center(c.dim("terminaldagi ") + c.white("AI koding agenti") + c.dim(" · Uzbek-first"), width);

  const chip = (label, val, col = c.indigo) => `${col("▸")} ${c.dim(label)} ${c.white(val)}`;
  const skillsChip = enabledSkills.length
    ? chip("Skillar", enabledSkills.join(" · "), c.violet)
    : chip("Skillar", "bekor (/skills bilan yoqing)", c.violet);
  const rowStatus = chip("Manba", "", c.indigo).trim() + " " + source;
  const rowCwd = chip("Ish papkasi", process.cwd(), c.teal);
  const rowSkills = skillsChip;
  const rowKeys = chip("Buyruqlar", "", c.pink).trim() + "  " + c.gray("/") + c.white(" yozib menyuni oching");

  const boxLines = box(
    [
      "",
      ...hero,
      "",
      tagline,
      "",
      rowStatus,
      rowCwd,
      rowSkills,
      rowKeys,
      "",
    ],
    { width, color: c.indigo },
  );

  return "\n" + boxLines.map((l) => g + l).join("\n") + "\n";
}

/** Compact one-line hint bar (below the prompt). */
export function hintBar(config, pendingCount = 0) {
  const model = config?.token ? "auto (server)" : (config?.model || "openai/gpt-4o-mini");
  const parts = [
    `${c.indigo("◉")} ${c.dim(model)}`,
    pendingCount ? `${c.amber("📎 " + pendingCount)}` : null,
    `${c.dim("/")} ${c.gray("menu")}`,
    `${c.dim("tab")} ${c.gray("autocomplete")}`,
    `${c.dim("ctrl+c")} ${c.gray("cancel")}`,
  ].filter(Boolean);
  return G() + parts.join(c.darkGray("  ·  "));
}

/**
 * Slash-command menyusi. Foydalanuvchi shunchaki `/` yozsa yoki `/help`
 * chaqirsa chiqariladi. Har element: glyph, buyruq, tavsif.
 */
export function slashMenu(items) {
  const g = G();
  const width = Math.min(termWidth() - g.length * 2, 74);
  const rows = items.map(({ glyph, cmd, desc, color = c.indigo }) => {
    const glyphPad = pad(color(glyph), 4);
    const cmdPad = pad(c.white(cmd), 16);
    return `${glyphPad}  ${cmdPad}  ${c.dim(desc)}`;
  });
  const header = c.dim("Buyruqlar menyusi · ") + c.white("tab") + c.dim(" bilan to'ldiriladi");
  const lines = box(["", header, "", ...rows, ""], { width, color: c.violet });
  return "\n" + lines.map((l) => g + l).join("\n") + "\n";
}

/**
 * Skillar ro'yxati — yoqilgan/o'chirilgan holatini ko'rsatadi.
 */
export function skillsList(skills, enabledIds) {
  const g = G();
  const width = Math.min(termWidth() - g.length * 2, 78);
  const rows = skills.map((s) => {
    const on = enabledIds.includes(s.id);
    const badge = on ? c.emerald("● ON ") : c.darkGray("○ OFF");
    const glyph = c.violet(pad(s.glyph, 3));
    const name = pad(c.white(s.name), 20);
    const id = pad(c.dim(s.id), 20);
    return `${badge}  ${glyph}${name} ${id} ${c.dim(s.desc)}`;
  });
  const header = c.dim("SOVEREIGN Skills · ") + c.white("/skill <id>") + c.dim(" bilan yoqing/o'chiring");
  const lines = box(["", header, "", ...rows, ""], { width, color: c.emerald });
  return "\n" + lines.map((l) => g + l).join("\n") + "\n";
}

/** Full-screen clear helper. */
export function clearScreen() {
  if (process.stdout.isTTY) {
    process.stdout.write("\x1b[2J\x1b[H");
  }
}

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
export function spinner(label) {
  if (!process.stdout.isTTY) {
    return { stop() {} };
  }
  let i = 0;
  const timer = setInterval(() => {
    process.stdout.write(`\r  ${c.indigo(FRAMES[i++ % FRAMES.length])} ${c.dim(label)} `);
  }, 80);
  return {
    stop(clear = true) {
      clearInterval(timer);
      if (clear) process.stdout.write("\r" + " ".repeat(label.length + 8) + "\r");
    },
  };
}

/** Print a subtle separator between agent turns. */
export function separator() {
  const g = G();
  const width = Math.min(termWidth() - g.length * 2, 76);
  return g + c.darkGray("─".repeat(width));
}

/** Section header for step announcements. */
export function stepHeader(step, total, label) {
  return G() + c.indigo(`[${step}/${total}]`) + " " + c.white(label);
}
