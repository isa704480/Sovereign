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
export function banner(config) {
  const width = Math.min(termWidth() - 2, 88);
  const source = config?.token
    ? `${c.emerald("●")} ${c.white("SOVEREIGN akkaunt")} ${c.dim("· " + (config.baseUrl || ""))}`
    : `${c.amber("●")} ${c.white("O'z kalitingiz")} ${c.dim("· " + (config.model || "openai/gpt-4o-mini"))}`;

  const hero = heroLogo(width);
  const tagline = center(c.dim("terminaldagi ") + c.white("AI koding agenti") + c.dim(" · Uzbek-first"), width);

  const chip = (label, val, col = c.indigo) => `${col("▸")} ${c.dim(label)} ${c.white(val)}`;
  const rowStatus = [
    chip("Manba", "", c.indigo).trim() + " " + source,
  ].join("   ");
  const rowCwd = chip("Ish papkasi", process.cwd(), c.teal);
  const rowKeys = [
    chip("Buyruqlar", "", c.pink).trim() + "  " +
    c.gray("/help") + c.darkGray(" · ") +
    c.gray("/model") + c.darkGray(" · ") +
    c.gray("/attach") + c.darkGray(" · ") +
    c.gray("/cwd") + c.darkGray(" · ") +
    c.gray("/clear") + c.darkGray(" · ") +
    c.gray("/exit"),
  ].join("");

  const boxLines = box(
    [
      "",
      ...hero,
      "",
      tagline,
      "",
      rowStatus,
      rowCwd,
      rowKeys,
      "",
    ],
    { width, color: c.indigo },
  );

  return "\n" + boxLines.join("\n") + "\n";
}

/** Compact one-line hint bar (below the prompt). */
export function hintBar(config, pendingCount = 0) {
  const model = config?.token ? "auto (server)" : (config?.model || "openai/gpt-4o-mini");
  const parts = [
    `${c.indigo("◉")} ${c.dim(model)}`,
    pendingCount ? `${c.amber("📎 " + pendingCount)}` : null,
    `${c.dim("tab")} ${c.gray("history")}`,
    `${c.dim("ctrl+c")} ${c.gray("cancel")}`,
  ].filter(Boolean);
  return "  " + parts.join(c.darkGray("  ·  "));
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
  const width = Math.min(termWidth() - 4, 76);
  return "  " + c.darkGray("─".repeat(width));
}

/** Section header for step announcements. */
export function stepHeader(step, total, label) {
  return "  " + c.indigo(`[${step}/${total}]`) + " " + c.white(label);
}
