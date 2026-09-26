import "server-only";
import type { PlanId } from "@/config/plans";
import type { TKey } from "@/lib/i18n";
import type { createServiceClient } from "@/lib/supabase/service";

type Service = ReturnType<typeof createServiceClient>;

const RANK: Record<string, number> = { free: 0, starter: 1, pro: 2, ultra: 3 };

/**
 * Checkout'dan oldin: bu xarid ruxsat etiladimi? (0033 RPC'lari qiymatni baribir
 * to'g'ri hisoblaydi — bu foydalanuvchini keraksiz/zararli xariddan saqlaydi.)
 *  - Yuqoriroq tarif faol bo'lsa, pastrog'ini sotib olish — yo'q.
 *  - Karta (Dodo) obunasi faol bo'lsa, ikkinchi parallel karta obunasi — yo'q
 *    (ikkalasi ham pul yechardi).
 * Xato matni kaliti yoki null (ruxsat) qaytaradi.
 */
export async function purchaseBlocker(
  service: Service,
  userId: string,
  plan: Exclude<PlanId, "free">,
  provider: "dodo" | "rollypay" | "zenobank",
): Promise<TKey | null> {
  const { data: profile } = await service
    .from("profiles")
    .select("plan, plan_expires_at")
    .eq("id", userId)
    .maybeSingle();
  const curPlan = (profile?.plan as string | undefined) ?? "free";
  const exp = profile?.plan_expires_at ? new Date(profile.plan_expires_at as string) : null;
  const active = (RANK[curPlan] ?? 0) > 0 && (!exp || exp.getTime() > Date.now());
  if (!active) return null;

  if ((RANK[curPlan] ?? 0) > RANK[plan]) return "chLowerPlanActive";

  if (provider === "dodo") {
    const { count } = await service
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("provider", "dodo")
      .eq("status", "paid");
    if ((count ?? 0) > 0) return "chCardSubActive";
  }
  return null;
}
