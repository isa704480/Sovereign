import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { listConversations } from "@/app/actions/chat";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { displayName, getProfile } from "@/lib/auth/profile";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import type { Conversation } from "@/store/chat";

export const metadata: Metadata = { title: "Chat" };

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

  return (
    <Dashboard
      user={{
        name: displayName(user, profile),
        email: user.email ?? "",
        avatarUrl: profile.avatar_url,
      }}
      defaultModelId={profile.default_model}
      initialConversations={initial}
    />
  );
}
