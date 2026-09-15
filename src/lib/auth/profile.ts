import type { SupabaseClient, User } from "@supabase/supabase-js";

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  onboarding: Record<string, unknown> | null;
  onboarding_completed: boolean;
  default_model: string;
}

export async function getProfile(supabase: SupabaseClient, userId: string): Promise<Profile | null> {
  const { data } = await supabase
    .from("profiles")
    .select("id, email, full_name, avatar_url, onboarding, onboarding_completed, default_model")
    .eq("id", userId)
    .maybeSingle();
  return (data as Profile | null) ?? null;
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
