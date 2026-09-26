import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { displayName, effectivePlan, getProfile } from "@/lib/auth/profile";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { CliConnect } from "@/components/cli/CliConnect";
import { getServerT } from "@/lib/i18n-server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return { title: t("auCliMetaTitle") };
}

export default async function CliConnectPage(props: PageProps<"/cli/connect">) {
  const sp = await props.searchParams;
  const code = typeof sp.code === "string" ? sp.code : "";

  if (!isSupabaseConfigured()) redirect("/");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/cli/connect?code=${code}`)}`);

  const profile = await getProfile(supabase, user.id);

  return (
    <CliConnect
      code={code}
      name={displayName(user, profile)}
      email={user.email ?? ""}
      plan={effectivePlan(profile).id}
    />
  );
}
