import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { displayName, effectivePlan, getProfile } from "@/lib/auth/profile";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getServerT } from "@/lib/i18n-server";
import { countryOf, ipFromHeaders, isDeviceCode, networkMatch, type PendingInfo } from "@/lib/cli/device";
import { ConnectApproval } from "./ConnectApproval";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return { title: t("auCliMetaTitle") };
}

type PendingRow = {
  device_name: string | null;
  created_at: string;
  expires_at: string;
  approved: boolean;
  revoked_at: string | null;
  start_ip?: string | null;
  start_country?: string | null;
};

/**
 * Kirishni kim boshlagani haqida kontekst (cli-api-1): qurilma nomi, vaqt va boshlovchi tarmoq
 * (0040). Jadval Data API'ga yopiq (RLS, siyosatsiz) — faqat server tomonida service role bilan,
 * aniq kod bo'yicha bitta qator o'qiladi. Xato bo'lsa null (sahifa oddiy ko'rinishda ishlaydi).
 */
async function pendingInfo(code: string, viewer: { ip: string | null; country: string | null }): Promise<PendingInfo | null> {
  if (!isDeviceCode(code)) return null;
  try {
    const sb = createServiceClient();
    const base = "device_name, created_at, expires_at, approved, revoked_at";
    let res = await sb.from("cli_sessions").select(`${base}, start_ip, start_country`).eq("code", code).maybeSingle();
    // 0040 hali ishlamagan — yangi ustunlarsiz.
    if (res.error && /start_ip|start_country|column/i.test(res.error.message)) {
      res = await sb.from("cli_sessions").select(base).eq("code", code).maybeSingle();
    }
    if (res.error) {
      console.error("[cli/connect] pending info:", res.error.message);
      return null;
    }
    const row = res.data as PendingRow | null;
    if (!row) return { pending: false, device: "", requestedAt: null, startCountry: null, startIp: null, match: "unknown" };
    const pending = !row.approved && !row.revoked_at && new Date(row.expires_at).getTime() > Date.now();
    const start = { ip: row.start_ip ?? null, country: row.start_country ?? null };
    return {
      pending,
      device: (row.device_name ?? "").slice(0, 80),
      requestedAt: row.created_at ?? null,
      startCountry: start.country,
      startIp: start.ip,
      match: networkMatch(start, viewer),
    };
  } catch (e) {
    console.error("[cli/connect] pending info:", e instanceof Error ? e.message : e);
    return null;
  }
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

  const h = await headers();
  const [profile, info] = await Promise.all([
    getProfile(supabase, user.id),
    pendingInfo(code, { ip: ipFromHeaders(h), country: countryOf(h) }),
  ]);

  return (
    <ConnectApproval
      code={code}
      name={displayName(user, profile)}
      email={user.email ?? ""}
      plan={effectivePlan(profile).id}
      info={info}
    />
  );
}
