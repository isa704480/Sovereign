import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const DIR = join(homedir(), ".sovereign");
const FILE = join(DIR, "config.json");

const DEFAULTS = {
  // Account mode: SOVEREIGN server base URL + issued token.
  baseUrl: "https://sovhq.vercel.app",
  token: "",
  // Direct mode: user's own OpenRouter key + model.
  model: "openai/gpt-4o-mini",
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
    baseUrl: process.env.SOVEREIGN_URL || file.baseUrl || DEFAULTS.baseUrl,
    token: process.env.SOVEREIGN_TOKEN || file.token || "",
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

export function clearAuth() {
  if (!existsSync(FILE)) return;
  const cfg = loadConfig();
  saveConfig({ token: "" });
  return cfg.baseUrl;
}

export function resetConfig() {
  if (existsSync(FILE)) rmSync(FILE);
}

/** Account mode when a server token is present. */
export function isAccountMode(cfg) {
  return Boolean(cfg.token);
}

export const CONFIG_PATH = FILE;
