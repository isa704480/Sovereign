// REPL buyruqlar tarixi: ~/.sovereign/history (↑/↓ bilan sessiyalar orasida ham).
// Kalit/token o'xshash qatorlar diskka yozilmaydi.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const DIR = join(homedir(), ".sovereign");
export const HISTORY_PATH = join(DIR, "history");
export const HISTORY_SIZE = 500;

const SECRET_RE = /(sk-[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9]{16,}|AKIA[0-9A-Z]{12,}|eyJ[A-Za-z0-9_-]{20,}\.|bearer\s+\S{12,}|(api[_-]?key|token|password|parol)\s*[:=]\s*\S+)/i;

const CONFIRM_RE = /^(y|n|a|yes|no|ha|yo'q|all|hammasi|hammasiga|doim|1|2)$/i;

/** readline `history` formati — eng yangisi BIRINCHI. */
export function loadHistory() {
  if (process.env.SOV_NO_HISTORY) return [];
  try {
    if (!existsSync(HISTORY_PATH)) return [];
    return readFileSync(HISTORY_PATH, "utf8")
      .split("\n")
      .filter(Boolean)
      .slice(-HISTORY_SIZE)
      .reverse();
  } catch {
    return [];
  }
}

/** @param {string[]} history  readline'dan (eng yangisi birinchi) */
export function saveHistory(history) {
  if (process.env.SOV_NO_HISTORY) return;
  try {
    if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true, mode: 0o700 });
    const lines = history
      // Tasdiq javoblari (y/N/a, 1/2) ham readline tarixiga tushadi — ular foydasiz.
      .filter((l) => l && !l.includes("\n") && !SECRET_RE.test(l) && !CONFIRM_RE.test(l.trim()))
      .slice(0, HISTORY_SIZE)
      .reverse();
    writeFileSync(HISTORY_PATH, lines.join("\n") + (lines.length ? "\n" : ""), { mode: 0o600 });
  } catch {
    /* tarix — ixtiyoriy qulaylik */
  }
}
