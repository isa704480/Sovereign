import "server-only";
import { PLAN_BY_ID, isPlanId, type PlanId } from "@/config/plans";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * /api/cli/* uchun umumiy hisob yordamchilari (chat, inquiry, verify bir xil qoidada).
 */

/** cli_whoami qatoridan amaldagi tarif: muddati o'tgan pullik tarif = free. */
export function cliPlanId(row: { plan?: string | null; plan_expires_at?: string | null } | null | undefined): PlanId {
  const raw: PlanId = isPlanId(row?.plan) ? (row!.plan as PlanId) : "free";
  const expired = raw !== "free" && !!row?.plan_expires_at && new Date(row.plan_expires_at) < new Date();
  return expired ? "free" : raw;
}

/** Oylik token limiti tugaganmi (web/cli chat bilan bir xil hisob). Xato → false (fail-open). */
export async function monthlyLimitReached(userId: string, planId: PlanId): Promise<boolean> {
  try {
    const { data } = await createServiceClient()
      .from("profiles")
      .select("tokens_used_month, tokens_month_start")
      .eq("id", userId)
      .maybeSingle();
    const u = data as { tokens_used_month?: number | string | null; tokens_month_start?: string | null } | null;
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const used = u?.tokens_month_start && new Date(u.tokens_month_start) >= monthStart ? Number(u.tokens_used_month ?? 0) || 0 : 0;
    const plan = PLAN_BY_ID[planId] ?? PLAN_BY_ID.free;
    return used >= plan.limits.tokensPerMonth;
  } catch {
    return false;
  }
}

/** Oylik token hisobiga yozish (0035 record_token_usage_for — faqat service_role). Hech qachon otmaydi. */
export async function recordCliTokenUsage(userId: string, model: string, input: number, output: number, tag: string): Promise<void> {
  const i = Math.max(0, Math.round(Number(input) || 0));
  const o = Math.max(0, Math.round(Number(output) || 0));
  if (!i && !o) return;
  try {
    const { error } = await createServiceClient().rpc("record_token_usage_for", {
      p_user: userId,
      p_input_tokens: i,
      p_output_tokens: o,
      p_model: model,
    });
    if (error) console.error(`[${tag}] record_token_usage_for:`, error.message);
  } catch (e) {
    console.error(`[${tag}] record_token_usage_for:`, e instanceof Error ? e.message : e);
  }
}
