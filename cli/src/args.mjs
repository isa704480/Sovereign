// Buyruq qatori tahlili (zero-dep). Noma'lum flag — xato (chiqish kodi 2).

export const EXIT = Object.freeze({
  OK: 0,
  ERROR: 1, // agent/API/tarmoq xatosi yoki doctor muammo topdi
  USAGE: 2, // noto'g'ri flag/argument
  AUTH: 3, // login kerak (interaktivsiz rejimda)
  INTERRUPTED: 130, // Ctrl+C
});

export const SUBCOMMANDS = ["login", "logout", "whoami", "who", "doctor", "audit", "models", "sessions", "key", "config", "version", "help"];

/** Qiymat talab qiladigan flaglar. */
const VALUE_FLAGS = {
  "-f": "file",
  "--file": "file",
  "-m": "model",
  "--model": "model",
  "--url": "url",
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
  return { flags, files, positional, errors };
}
