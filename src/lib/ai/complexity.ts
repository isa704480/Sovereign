/**
 * Request complexity classifier — cheap vs strong model routing.
 *
 * Used when modelId === AUTO_MODEL_ID so the auto router can pick the cheapest
 * model that is capable enough for the task rather than always reaching for a
 * flagship. Also exported for tests and admin tooling.
 *
 * Configuration (env vars, all optional):
 *   COMPLEXITY_SIMPLE_THRESHOLD  — char length below which a request is "simple"
 *                                   (default 200). Override e.g. "400".
 *   COMPLEXITY_STRONG_THRESHOLD  — char length above which a request is "complex"
 *                                   (default 800). Override e.g. "1200".
 *
 * Heuristics (in order of priority):
 *  1. Explicit complexity signals in text (multi-step, compare, analyse, system design…)
 *     → always "complex", regardless of length.
 *  2. Code-heavy or math-heavy content → "medium" or "complex".
 *  3. Very short conversational text → "simple".
 *  4. Length bucket as tiebreaker.
 */

import { isCodeRequest } from "@/lib/ai/router";

export type Complexity = "simple" | "medium" | "complex";

function envInt(key: string, def: number): number {
  const v = parseInt(process.env[key] ?? "", 10);
  return Number.isFinite(v) && v > 0 ? v : def;
}

function simpleThreshold(): number {
  return envInt("COMPLEXITY_SIMPLE_THRESHOLD", 200);
}
function strongThreshold(): number {
  return envInt("COMPLEXITY_STRONG_THRESHOLD", 800);
}

// Patterns that strongly indicate a complex, multi-step task.
const COMPLEX_RE =
  /\b(architecture|system design|compare.*vs|difference between|explain.*deeply|step by step|refactor|implement.*from scratch|dissertat|thesis|essay|research|comprehensive|taqqosla|farqi nima|qanday ishlaydi|to'liq|tizim|loyiha|arxitektura)\b/i;

// Patterns that indicate a simple/conversational request.
const SIMPLE_RE =
  /^(salom|hello|hi|hey|nima|what is|what's|who is|who's|qanday|how do|necha|когда|что такое)\b/i;

/**
 * Classify the complexity of a user request.
 * `text` should be the last user message text only (no history).
 */
export function classifyComplexity(text: string): Complexity {
  const t = text.trim();
  const len = t.length;

  // 1. Explicit complex signals.
  if (COMPLEX_RE.test(t)) return "complex";

  // 2. Code — medium at minimum; long code requests = complex.
  if (isCodeRequest(t)) {
    return len > strongThreshold() ? "complex" : "medium";
  }

  // 3. Explicit simple patterns (greeting / single-word question).
  if (SIMPLE_RE.test(t) && len < simpleThreshold()) return "simple";

  // 4. Length bucket.
  if (len <= simpleThreshold()) return "simple";
  if (len >= strongThreshold()) return "complex";
  return "medium";
}

/**
 * Returns true if the AUTO router should prefer a cheaper model.
 * "simple" and "medium" both qualify; only "complex" gets the flagship.
 */
export function preferCheapModel(text: string): boolean {
  return classifyComplexity(text) !== "complex";
}
