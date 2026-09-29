/**
 * Per-user quota / token-bucket enforcement.
 *
 * The database already stores per-user daily message counts (usage_daily) and
 * monthly token totals (profiles.tokens_used_month). This module provides the
 * TypeScript-side helper that consolidates the checks in one place, making it
 * easy to enforce from multiple API routes without copy-pasting the logic.
 *
 * Tiers (daily msg / monthly tokens) are read from plans.ts but can be
 * overridden per-environment via env vars (useful for load-testing):
 *
 *   QUOTA_FREE_DAILY      — messages/day for free plan     (default from plan)
 *   QUOTA_STARTER_DAILY   — messages/day for starter plan
 *   QUOTA_PRO_DAILY       — messages/day for pro plan
 *   QUOTA_ULTRA_DAILY     — messages/day for ultra plan
 *
 *   QUOTA_FREE_MONTHLY_TOKENS    — tokens/month for free plan
 *   QUOTA_STARTER_MONTHLY_TOKENS
 *   QUOTA_PRO_MONTHLY_TOKENS
 *   QUOTA_ULTRA_MONTHLY_TOKENS
 */

import { PLAN_BY_ID, type Plan, type PlanId } from "@/config/plans";

function envInt(key: string, def: number): number {
  const v = parseInt(process.env[key] ?? "", 10);
  return Number.isFinite(v) && v > 0 ? v : def;
}

export interface PlanQuota {
  messagesPerDay: number;
  tokensPerMonth: number;
}

/**
 * Effective quota for a plan (env overrides win over plan defaults).
 */
export function quotaFor(planId: PlanId): PlanQuota {
  const plan: Plan = PLAN_BY_ID[planId] ?? PLAN_BY_ID.free;
  const upper = planId.toUpperCase();
  return {
    messagesPerDay: envInt(`QUOTA_${upper}_DAILY`, plan.limits.messagesPerDay),
    tokensPerMonth: envInt(`QUOTA_${upper}_MONTHLY_TOKENS`, plan.limits.tokensPerMonth),
  };
}

export type QuotaViolation = "daily_messages" | "monthly_tokens" | "none";

export interface QuotaCheckResult {
  violation: QuotaViolation;
  /** Remaining messages today (0 if exceeded). */
  remainingToday: number;
  /** Remaining tokens this month (0 if exceeded). */
  remainingMonth: number;
  quota: PlanQuota;
}

/**
 * Check whether a request would exceed the user's quota.
 *
 * @param planId            User's current plan
 * @param usedToday         Messages sent today (from usage_daily)
 * @param tokensUsedMonth   Tokens used this calendar month
 * @param estimatedInputTokens  Tokens this request will consume (pre-check)
 */
export function checkQuota(
  planId: PlanId,
  usedToday: number,
  tokensUsedMonth: number,
  estimatedInputTokens = 0,
): QuotaCheckResult {
  const quota = quotaFor(planId);

  const remainingToday = Math.max(0, quota.messagesPerDay - usedToday);
  const remainingMonth = Math.max(0, quota.tokensPerMonth - tokensUsedMonth);

  if (usedToday >= quota.messagesPerDay) {
    return { violation: "daily_messages", remainingToday: 0, remainingMonth, quota };
  }

  if (
    tokensUsedMonth >= quota.tokensPerMonth ||
    (estimatedInputTokens > 0 && tokensUsedMonth + estimatedInputTokens > quota.tokensPerMonth)
  ) {
    return { violation: "monthly_tokens", remainingToday, remainingMonth: 0, quota };
  }

  return { violation: "none", remainingToday, remainingMonth, quota };
}

/**
 * Percentage of monthly token budget consumed (0–100).
 * Used to decide 80% / 95% alert thresholds.
 */
export function monthlyUsagePct(planId: PlanId, tokensUsedMonth: number): number {
  const quota = quotaFor(planId);
  if (quota.tokensPerMonth === 0) return 0;
  return Math.min(100, (tokensUsedMonth / quota.tokensPerMonth) * 100);
}
