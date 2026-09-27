import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { displayName, effectivePlan, getProfile } from "@/lib/auth/profile";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getServerT } from "@/lib/i18n-server";
import { approxIp, countryOf, describeDevice, ipFromHeaders, networkMatch, type PendingInfo } from "@/lib/cli/device";
import { USER_CODE_TTL_MS, cliCodeSecret, legacyLoginEnabled, resolveLoginRef, type CliLoginRef } from "@/lib/cli/user-code";
import { ConnectApproval, type ConnectMode } from "./ConnectApproval";

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
 * Kirishni kim boshlagani haqida kontekst (cli-api-1): qurilma nomi/OS, vaqt va boshlovchi tarmoq
 * (0040). Jadval Data API'ga yopiq (RLS, siyosatsiz) — faqat server tomonida service role bilan,
 * aniq kod bo'yicha bitta qator o'qiladi. Xato bo'lsa null (sahifa oddiy ko'rinishda ishlaydi).
 */
async function pendingInfo(code: string, viewer: { ip: string | null; country: string | null }): Promise<PendingInfo | null> {
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
    if (!row) return gone();
    const deadline = Math.min(Date.parse(row.expires_at), Date.parse(row.created_at) + USER_CODE_TTL_MS);
    const pending = !row.approved && !row.revoked_at && Number.isFinite(deadline) && deadline > Date.now();
    const start = { ip: row.start_ip ?? null, country: row.start_country ?? null };
    const d = describeDevice(row.device_name);
    return {
      pending,
      device: d.host,
      os: d.os,
      app: d.app,
      requestedAt: row.created_at ?? null,
      expiresAt: Number.isFinite(deadline) ? new Date(deadline).toISOString() : null,
      startCountry: start.country,
      ipApprox: approxIp(start.ip),
      match: networkMatch(start, viewer),
    };
  } catch (e) {
    console.error("[cli/connect] pending info:", e instanceof Error ? e.message : e);
    return null;
  }
}

function gone(): PendingInfo {
  return { pending: false, device: "", os: null, app: null, requestedAt: null, expiresAt: null, startCountry: null, ipApprox: null, match: "unknown" };
}

/**
 * /cli/connect — device-login tasdig'i. URL'dagi parametrning o'zi hech narsani tasdiqlamaydi:
 *  - `?h=<handle>`  — yangi CLI/Cowork (device kodi shifrlangan); foydalanuvchi o'z ekranidagi
 *                     user code'ni ("ABCD-1234") TERADI;
 *  - `?code=<hex>`  — eski mijozlar ("legacy"): ekrandagi kodning birinchi 8 belgisini teradi.
 *                     CLI_LEGACY_LOGIN=off bo'lsa — "ilovani yangilang".
 */
export default async function CliConnectPage(props: PageProps<"/cli/connect">) {
  const sp = await props.searchParams;
  const h = typeof sp.h === "string" && sp.h.length <= 200 ? sp.h : "";
  const code = !h && typeof sp.code === "string" && sp.code.length <= 200 ? sp.code : "";
  const loginRef: CliLoginRef | null = h ? { kind: "h", value: h } : code ? { kind: "code", value: code } : null;

  if (!isSupabaseConfigured()) redirect("/");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const qs = new URLSearchParams(h ? { h } : code ? { code } : {}).toString();
    redirect(`/login?next=${encodeURIComponent(`/cli/connect${qs ? `?${qs}` : ""}`)}`);
  }

  const resolved = loginRef ? resolveLoginRef(loginRef, cliCodeSecret(), legacyLoginEnabled()) : null;
  const mode: ConnectMode = resolved?.ok
    ? resolved.legacy
      ? "legacy"
      : "code"
    : resolved?.reason === "legacy_disabled"
      ? "legacy_disabled"
      : "invalid";

  const hd = await headers();
  const [profile, info] = await Promise.all([
    getProfile(supabase, user.id),
    resolved?.ok ? pendingInfo(resolved.deviceCode, { ip: ipFromHeaders(hd), country: countryOf(hd) }) : Promise.resolve(null),
  ]);

  return (
    <ConnectApproval
      loginRef={loginRef}
      mode={mode}
      name={displayName(user, profile)}
      email={user.email ?? ""}
      plan={effectivePlan(profile).id}
      info={mode === "invalid" ? gone() : info}
    />
  );
}
