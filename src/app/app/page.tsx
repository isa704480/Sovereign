import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { listConversations } from "@/app/actions/chat";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { displayName, effectivePlan, getProfile } from "@/lib/auth/profile";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getServerT } from "@/lib/i18n-server";
import type { Conversation } from "@/store/chat";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return { title: t("chChatTitle") };
}

export default async function AppPage() {
  // Local design preview without Supabase (development only).
  if (!isSupabaseConfigured()) {
    if (process.env.NODE_ENV !== "development") redirect("/login");
    return (
      <Dashboard
        user={{ name: "Mansurov", email: "dev@sovereign.local" }}
        defaultModelId="claude-sonnet-4-5"
        isDev
      />
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/app");

  const profile = await getProfile(supabase, user.id);
  if (!profile?.onboarding_completed) redirect("/onboarding");

  const initial = (await listConversations()) as Conversation[];

  // Tarif holati — expired/expiring_soon banneri uchun
  const { data: statusData } = await supabase.rpc("plan_status", { p_user_id: user.id });
  const status = Array.isArray(statusData) ? statusData[0] : statusData;

  return (
    <Dashboard
      user={{
        name: displayName(user, profile),
        email: user.email ?? "",
        avatarUrl: profile.avatar_url,
      }}
      defaultModelId={profile.default_model}
      initialConversations={initial}
      plan={effectivePlan(profile).id}
      memoryEnabled={profile.memory_enabled}
      planState={(status?.state as "free" | "active" | "expiring_soon" | "expired") ?? "free"}
      daysLeft={status?.days_left ?? null}
    />
  );
}
