import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth/profile";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";
import { getServerT } from "@/lib/i18n-server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return { title: t("auOnbMetaTitle") };
}

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/onboarding");

  const profile = await getProfile(supabase, user.id);
  if (profile?.onboarding_completed) redirect("/app");

  return <OnboardingFlow />;
}
