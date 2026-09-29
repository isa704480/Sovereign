/**
 * Token counting — estimates + per-request max_tokens enforcement.
 *
 * We cannot call a tokeniser server-side without adding a heavy dependency,
 * so we use the well-established ~4 chars = 1 token heuristic (same as the
 * rest of the codebase). For enforcement we stay conservative.
 *
 * Per-request max_tokens limits (configurable via env):
 *   TOKEN_MAX_SIMPLE   — for "simple" complexity requests  (default 1 024)
 *   TOKEN_MAX_MEDIUM   — for "medium" complexity requests  (default 2 048)
 *   TOKEN_MAX_COMPLEX  — for "complex" complexity requests (default plan.limits.maxTokens)
 *
 * The plan's own `maxTokens` is always the upper ceiling — these limits
 * only add a tighter per-complexity cap to avoid large outputs for trivial
 * requests.
 */

import type { Complexity } from "./complexity";
import type { Plan } from "@/config/plans";

const CHARS_PER_TOKEN = 4;
const IMAGE_TOKENS = 1_500; // ~6 000 chars / 4

function envInt(key: string, def: number): number {
  const v = parseInt(process.env[key] ?? "", 10);
  return Number.isFinite(v) && v > 0 ? v : def;
}

interface Message {
  role: string;
  content: string | unknown[];
}

/**
 * Estimate total input tokens for a message list + optional extra system text.
 * Matches the heuristic used in route.ts (historyInputChars / 4).
 */
export function estimateInputTokens(messages: Message[], extraSystemChars = 0): number {
  const chars = messages.reduce((n, m) => {
    if (typeof m.content === "string") return n + m.content.length;
    const parts = m.content as { type?: string; text?: string }[];
    const textChars = parts.filter((p) => p.type === "text").reduce((s, p) => s + (p.text?.length ?? 0), 0);
    const images = parts.filter((p) => p.type === "image_url").length;
    return n + textChars + images * IMAGE_TOKENS * CHARS_PER_TOKEN;
  }, 0);
  return Math.round((chars + extraSystemChars) / CHARS_PER_TOKEN);
}

/**
 * Resolve the effective max_tokens for this request.
 *
 * Priority (lowest wins):
 *  1. Plan hard ceiling (plan.limits.maxTokens)
 *  2. Per-complexity cap from env (TOKEN_MAX_SIMPLE / TOKEN_MAX_MEDIUM / TOKEN_MAX_COMPLEX)
 *
 * The result is always ≥ 256 so we never starve short answers.
 */
export function resolveMaxTokens(plan: Plan, complexity: Complexity): number {
  const planMax = plan.limits.maxTokens;

  const complexityCap: Record<Complexity, number> = {
    simple: envInt("TOKEN_MAX_SIMPLE", 1_024),
    medium: envInt("TOKEN_MAX_MEDIUM", 2_048),
    complex: planMax, // complex requests use the full plan allowance
  };

  return Math.max(256, Math.min(planMax, complexityCap[complexity]));
}

/**
 * Check whether the request's estimated input tokens would exceed the plan's
 * monthly token budget (remaining = plan limit − already used this month).
 *
 * Returns true when the request should be BLOCKED.
 */
export function exceedsMonthlyBudget(
  estimatedInputTokens: number,
  tokensUsedMonth: number,
  plan: Plan,
): boolean {
  return tokensUsedMonth + estimatedInputTokens > plan.limits.tokensPerMonth;
}
