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
  // "*" — ustunlar ro'yxatini qo'lda yozsak, hali ishga tushmagan migratsiya
  // (masalan training_opt_in) butun so'rovni yiqitadi va foydalanuvchi "free"
  // bo'lib qoladi. Yangi ustun bo'lmasa shunchaki undefined keladi.
  const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (!data) return null;
  const p = data as Partial<Profile> & { id: string };
  return {
    id: p.id,
    email: p.email ?? null,
    full_name: p.full_name ?? null,
    avatar_url: p.avatar_url ?? null,
    onboarding: p.onboarding ?? null,
    onboarding_completed: p.onboarding_completed ?? false,
    default_model: p.default_model ?? "auto",
    plan: isPlanId(p.plan) ? p.plan : "free",
    plan_expires_at: p.plan_expires_at ?? null,
    memory_enabled: p.memory_enabled ?? true,
    training_opt_in: p.training_opt_in ?? true,
  };
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
