// Tiny ANSI helpers — zero dependencies.
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const wrap = (open, close) => (s) => (useColor ? `\x1b[${open}m${s}\x1b[${close}m` : String(s));

export const c = {
  reset: "\x1b[0m",
  bold: wrap(1, 22),
  dim: wrap(2, 22),
  italic: wrap(3, 23),
  indigo: wrap("38;2;124;111;247", 39),
  teal: wrap("38;2;32;212;232", 39),
  green: wrap("38;2;16;212;160", 39),
  amber: wrap("38;2;245;158;11", 39),
  red: wrap("38;2;239;68;68", 39),
  gray: wrap("38;2;120;127;160", 39),
  white: wrap("38;2;240;242;255", 39),
};

export function logo() {
  return c.indigo("⬡") + " " + c.bold(c.white("SOVEREIGN"));
}

export function banner(config) {
  const line = c.gray("─".repeat(48));
  const source = config?.token
    ? `${c.green("SOVEREIGN akkaunt")} ${c.dim("(" + (config.baseUrl || "") + ")")}`
    : `${c.dim("OpenRouter:")} ${c.indigo(config?.model || "")}`;
  return [
    "",
    `  ${logo()}  ${c.dim("terminal AI agent")}`,
    `  ${line}`,
    `  ${c.dim("Manba:")} ${source}`,
    `  ${c.dim("Ish papkasi:")} ${c.white(process.cwd())}`,
    `  ${c.dim("Buyruqlar:")} ${c.white("/help /model /clear /cwd /exit")}`,
    `  ${line}`,
    "",
  ].join("\n");
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
