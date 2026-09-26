// Buyruq qatori tahlili (zero-dep). Noma'lum flag — xato (chiqish kodi 2).

export const EXIT = Object.freeze({
  OK: 0,
  ERROR: 1, // agent/API/tarmoq xatosi yoki doctor muammo topdi
  USAGE: 2, // noto'g'ri flag/argument
  AUTH: 3, // login kerak (interaktivsiz rejimda)
  INTERRUPTED: 130, // Ctrl+C
});

export const SUBCOMMANDS = ["login", "logout", "whoami", "who", "doctor", "init", "audit", "models", "sessions", "key", "config", "version", "help"];

/** Qiymat talab qiladigan flaglar. */
const VALUE_FLAGS = {
  "-f": "file",
  "--file": "file",
  "-m": "model",
  "--model": "model",
  "--url": "url",
  "--budget": "budget",
};

const BOOL_FLAGS = {
  "-h": "help",
  "--help": "help",
  "-V": "version",
  "-v": "version",
  "--version": "version",
  "-p": "print",
  "--print": "print",
  "--json": "json",
  "-y": "yes",
  "--yes": "yes",
  "--vibe": "vibe",
  "--full-auto": "fullAuto",
  "--auto": "fullAuto",
  "--no-vibe": "noVibe",
  "--no-color": "noColor",
  "--no-verify": "noVerify",
  "--local": "local",
  "--verbose": "verbose",
  "--ai": "ai", // sov init --ai — SOVEREIGN.md ni agent to'ldiradi
};

/**
 * @param {string[]} argv  process.argv.slice(2)
 * @returns {{ flags: Record<string, any>, files: string[], positional: string[], errors: string[] }}
 */
export function parseArgs(argv) {
  const flags = {};
  const files = [];
  const positional = [];
  const errors = [];
  let rest = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (rest || a === "-" || !a.startsWith("-") || /^-\d/.test(a)) {
      positional.push(a);
      continue;
    }
    if (a === "--") {
      rest = true;
      continue;
    }
    const eq = a.indexOf("=");
    const name = a.startsWith("--") && eq > 0 ? a.slice(0, eq) : a;
    const inline = a.startsWith("--") && eq > 0 ? a.slice(eq + 1) : null;
    if (VALUE_FLAGS[name]) {
      const val = inline ?? argv[++i];
      if (val == null || val === "") {
        errors.push(`${name} qiymat talab qiladi`);
        continue;
      }
      if (VALUE_FLAGS[name] === "file") files.push(val);
      else flags[VALUE_FLAGS[name]] = val;
      continue;
    }
    if (BOOL_FLAGS[name] && inline == null) {
      flags[BOOL_FLAGS[name]] = true;
      continue;
    }
    // Qisqa flaglar birlashtirilgan bo'lsa: -py → -p -y
    if (/^-[a-zA-Z]{2,}$/.test(a) && [...a.slice(1)].every((ch) => BOOL_FLAGS["-" + ch])) {
      for (const ch of a.slice(1)) flags[BOOL_FLAGS["-" + ch]] = true;
      continue;
    }
    errors.push(`Noma'lum flag: ${a}`);
  }
  flags.verify = !flags.noVerify;
  // --budget <token> — bitta vazifa uchun token byudjeti (musbat son; "50k", "1.5m" ham bo'ladi).
  if (flags.budget != null) {
    const n = parseBudget(flags.budget);
    if (n == null) errors.push(`--budget musbat son bo'lishi kerak (mas. 50000 yoki 50k): ${flags.budget}`);
    else flags.budget = n;
  }
  return { flags, files, positional, errors };
}

/** "50000" | "50k" | "1.5m" → token soni; noto'g'ri bo'lsa null. */
export function parseBudget(v) {
  const m = /^(\d+(?:\.\d+)?)\s*([km])?$/i.exec(String(v ?? "").trim());
  if (!m) return null;
  const mult = !m[2] ? 1 : m[2].toLowerCase() === "k" ? 1_000 : 1_000_000;
  const n = Math.round(Number(m[1]) * mult);
  return Number.isFinite(n) && n > 0 ? n : null;
}
