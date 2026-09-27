import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getServerT } from "@/lib/i18n-server";
import { listCliSessions } from "@/app/actions/cli";
import { CliSessions } from "./CliSessions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return { title: t("auCliSessTitle"), robots: { index: false } };
}

/**
 * /cli/sessions — ulangan CLI / Cowork qurilmalari: ko'rish va tokenni serverda bekor qilish
 * (audit cli-api-2). app. subdomenida xizmat qiladi (proxy.ts APP_PREFIXES: /cli).
 */
export default async function CliSessionsPage() {
  if (!isSupabaseConfigured()) redirect("/");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent("/cli/sessions")}`);

  const res = await listCliSessions();
  return <CliSessions initial={res.ok ? res.sessions : []} loadError={res.ok ? null : res.error} />;
}
