import type { SupabaseClient, User } from "@supabase/supabase-js";
import { isPlanId, PLAN_BY_ID, type Plan, type PlanId } from "@/config/plans";

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  onboarding: Record<string, unknown> | null;
  onboarding_completed: boolean;
  default_model: string;
  plan: PlanId;
  plan_expires_at: string | null;
  memory_enabled: boolean;
  /** Javoblarim Tella 2 ni o'rgatishda ishlatilsinmi. */
  training_opt_in: boolean;
}

export async function getProfile(supabase: SupabaseClient, userId: string): Promise<Profile | null> {
  const { data } = await supabase
    .from("profiles")
    .select(
      "id, email, full_name, avatar_url, onboarding, onboarding_completed, default_model, plan, plan_expires_at, memory_enabled, training_opt_in",
    )
    .eq("id", userId)
    .maybeSingle();
  if (!data) return null;
  const p = data as Profile;
  return { ...p, plan: isPlanId(p.plan) ? p.plan : "free" };
}

/** Effective plan: expired paid plans fall back to free. */
export function effectivePlan(profile: Pick<Profile, "plan" | "plan_expires_at"> | null): Plan {
  if (!profile) return PLAN_BY_ID.free;
  if (profile.plan !== "free" && profile.plan_expires_at && new Date(profile.plan_expires_at) < new Date()) {
    return PLAN_BY_ID.free;
  }
  return PLAN_BY_ID[profile.plan] ?? PLAN_BY_ID.free;
}

/** Where a signed-in user should land. */
export function postAuthPath(profile: Profile | null, next?: string | null): string {
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : null;
  if (!profile?.onboarding_completed) return "/onboarding";
  if (safeNext && safeNext !== "/onboarding") return safeNext;
  return "/app";
}

export function displayName(user: User | null, profile: Profile | null): string {
  return (
    profile?.full_name ||
    (user?.user_metadata?.full_name as string | undefined) ||
    (user?.user_metadata?.name as string | undefined) ||
    user?.email?.split("@")[0] ||
    "Foydalanuvchi"
  );
}
