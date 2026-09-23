"use server";

import { revalidatePath } from "next/cache";
import { isPlanId, type PlanId } from "@/config/plans";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { fmt } from "@/lib/i18n";
import { getServerT } from "@/lib/i18n-server";

type Result = { ok: true } | { ok: false; error: string };

/**
 * Sets the user's plan. Until payment (Payme / Click / Stripe) is wired,
 * this is only allowed when ALLOW_PLAN_SWITCH=true (testing).
 * The `profiles_protect_plan` trigger blocks direct client updates; this
 * action goes through the service role so it can bypass it.
 */
export async function choosePlan(planId: PlanId): Promise<Result> {
  const t = await getServerT();
  if (!isPlanId(planId)) return { ok: false, error: t("pnErrBadPlan") };
  // XAVFSIZLIK: ALLOW_PLAN_SWITCH prodda ochilib qolsa, har qanday foydalanuvchi
  // o'zini Ultra tarifga chiqarib olishi mumkin. Shu sababli bayroq faqat
  // NODE_ENV=development bilan birgalikda ishlaydi.
  if (process.env.NODE_ENV !== "development" || process.env.ALLOW_PLAN_SWITCH !== "true") {
    return { ok: false, error: t("pnErrPlanPaymentOnly") };
  }
  if (!isSupabaseConfigured()) return { ok: false, error: t("pnErrSupabaseMissing") };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: t("pnErrNoSession") };

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return { ok: false, error: t("pnErrNoServiceKey") };

  const expires = planId === "free" ? null : new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}`, {
    method: "PATCH",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ plan: planId, plan_expires_at: expires }),
  });
  if (!res.ok) return { ok: false, error: fmt(t("pnErrPlanNotSaved"), { status: res.status }) };

  revalidatePath("/app");
  return { ok: true };
}
