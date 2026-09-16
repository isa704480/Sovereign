import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const DIR = join(homedir(), ".sovereign");
const FILE = join(DIR, "config.json");

const DEFAULTS = {
  // OpenRouter model that supports tool calling. Cheap by default.
  model: "openai/gpt-4o-mini",
  // Optional research model (Perplexity).
  researchModel: "sonar",
  openrouterKey: "",
  perplexityKey: "",
};

export function loadConfig() {
  let file = {};
  if (existsSync(FILE)) {
    try {
      file = JSON.parse(readFileSync(FILE, "utf8"));
    } catch {
      /* ignore corrupt config */
    }
  }
  return {
    ...DEFAULTS,
    ...file,
    // Env vars win, so `OPENROUTER_API_KEY` in the shell just works.
    openrouterKey: process.env.OPENROUTER_API_KEY || file.openrouterKey || "",
    perplexityKey: process.env.PERPLEXITY_API_KEY || file.perplexityKey || "",
    model: process.env.SOVEREIGN_MODEL || file.model || DEFAULTS.model,
  };
}

export function saveConfig(patch) {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
  let current = {};
  if (existsSync(FILE)) {
    try {
      current = JSON.parse(readFileSync(FILE, "utf8"));
    } catch {
      /* ignore */
    }
  }
  const next = { ...current, ...patch };
  writeFileSync(FILE, JSON.stringify(next, null, 2));
  return FILE;
}

export const CONFIG_PATH = FILE;
