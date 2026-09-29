/**
 * Structured per-request usage logging.
 *
 * The database already has `record_token_usage` / `record_token_usage_for`
 * (migration 0036) that writes to token_usage_daily. This module wraps that
 * call and adds:
 *
 *  - Estimated cost in USD (using model-prices.ts lookup)
 *  - Structured server-side log line (JSON, compatible with Vercel log drains)
 *  - Fire-and-forget: errors are swallowed so they never break the stream
 *
 * Usage (call at the end of a request, after the stream closes):
 *
 *   await logUsage({
 *     userId,
 *     model: servedId,
 *     provider: servedProvider,
 *     upstreamModel: servedUpstream,
 *     inputTokens,
 *     outputTokens,
 *     cached: !!cachedFrom,
 *     planId: plan.id,
 *     requestMs,
 *   });
 */

import { lookupPrice, costUsd } from "@/lib/econ/unit-economics";
import type { PlanId } from "@/config/plans";

export interface UsageLogEntry {
  userId: string;
  model: string;
  provider?: string | null;
  upstreamModel?: string | null;
  inputTokens: number;
  outputTokens: number;
  cached?: boolean;
  planId?: PlanId | string;
  /** Wall-clock milliseconds for the complete request (optional). */
  requestMs?: number;
  /** ISO timestamp; defaults to now(). */
  timestamp?: string;
}

/**
 * Compute estimated cost for a usage entry.
 * Returns 0 when price data is not available.
 */
export function estimateCostUsd(entry: Pick<UsageLogEntry, "model" | "provider" | "inputTokens" | "outputTokens">): number {
  try {
    const match = lookupPrice(entry.model, entry.provider ?? "");
    if (!match) return 0;
    return costUsd(entry.inputTokens, entry.outputTokens, match.price);
  } catch {
    return 0;
  }
}

/**
 * Emit a structured log line to stdout (picked up by Vercel log drains /
 * any structured logging system).
 *
 * Format: JSON on a single line, prefixed with `[usage]` so it's easy to
 * filter in log aggregators.
 */
export function emitUsageLog(entry: UsageLogEntry): void {
  try {
    const estimatedCostUsd = estimateCostUsd(entry);
    const record = {
      type: "usage",
      ts: entry.timestamp ?? new Date().toISOString(),
      user: entry.userId,
      model: entry.model,
      provider: entry.provider ?? null,
      upstream: entry.upstreamModel ?? null,
      in: entry.inputTokens,
      out: entry.outputTokens,
      total: entry.inputTokens + entry.outputTokens,
      cost_usd: estimatedCostUsd > 0 ? +estimatedCostUsd.toFixed(6) : null,
      cached: entry.cached ?? false,
      plan: entry.planId ?? null,
      ms: entry.requestMs ?? null,
    };
    console.log(`[usage] ${JSON.stringify(record)}`);
  } catch {
    // Never throw from a logging function.
  }
}

/**
 * Log usage and swallow all errors.
 * Suitable for fire-and-forget calls at the end of a streaming route.
 */
export function logUsageSafe(entry: UsageLogEntry): void {
  try {
    emitUsageLog(entry);
  } catch {
    /* intentionally swallowed */
  }
}
