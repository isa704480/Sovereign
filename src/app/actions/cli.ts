"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getServerT } from "@/lib/i18n-server";
import { sessionId } from "@/lib/cli/device";

type Result = { ok: true } | { ok: false; error: string };

const codeSchema = z.string().min(10).max(80);

/** Browser approval: binds the CLI device code to the logged-in user. */
export async function approveCliDevice(code: string): Promise<Result> {
  const t = await getServerT();
  if (!codeSchema.safeParse(code).success) return { ok: false, error: t("auCliErrBadCode") };
  if (!isSupabaseConfigured()) return { ok: false, error: t("auCliErrNoSupabase") };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: t("auCliErrLogin") };

  const { data, error } = await supabase.rpc("cli_approve", { p_code: code });
  if (error) {
    console.error("[cli] approve:", error.message);
    return { ok: false, error: t("p7cErrGeneric") };
  }
  if (data !== true) return { ok: false, error: t("auCliErrExpired") };
  return { ok: true };
}

/**
 * "Bekor qilish": kutilayotgan kod serverda ham bekor qilinadi (0040 cli_deny) — kod
 * keyinroq (masalan, boshqa oynada yoki boshqa hisob bilan) tasdiqlanib qolmasin (cli-api-1).
 * Migratsiya hali ishlamagan bo'lsa — jim o'tadi (kod 5–10 daqiqada baribir eskiradi).
 */
export async function denyCliDevice(code: string): Promise<Result> {
  const t = await getServerT();
  if (!codeSchema.safeParse(code).success) return { ok: false, error: t("auCliErrBadCode") };
  if (!isSupabaseConfigured()) return { ok: false, error: t("auCliErrNoSupabase") };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: t("auCliErrLogin") };

  const { error } = await supabase.rpc("cli_deny", { p_code: code });
  if (error && error.code !== "PGRST202") {
    console.error("[cli] deny:", error.message);
    return { ok: false, error: t("p7cErrGeneric") };
  }
  return { ok: true };
}

export interface CliSessionView {
  /** Shaffof bo'lmagan id (sessiya kodi brauzerga yuborilmaydi). */
  id: string;
  device: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string;
}

type SessionRow = {
  code: string;
  device_name: string | null;
  created_at: string;
  expires_at: string;
  last_used_at: string | null;
};

type Supa = Awaited<ReturnType<typeof createClient>>;

async function ownSessions(supabase: Supa): Promise<SessionRow[] | null> {
  // 0012 cli_sessions_list: faqat auth.uid() ning tasdiqlangan, bekor qilinmagan sessiyalari.
  const { data, error } = await supabase.rpc("cli_sessions_list");
  if (error) {
    console.error("[cli] sessions list:", error.message);
    return null;
  }
  const now = Date.now();
  return ((data ?? []) as SessionRow[]).filter((r) => r && typeof r.code === "string" && new Date(r.expires_at).getTime() > now);
}

/** Veb "Ulangan qurilmalar": foydalanuvchining faol CLI/Cowork tokenlari (cli-api-2). */
export async function listCliSessions(): Promise<{ ok: true; sessions: CliSessionView[] } | { ok: false; error: string }> {
  const t = await getServerT();
  if (!isSupabaseConfigured()) return { ok: false, error: t("auCliErrNoSupabase") };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: t("auCliErrLogin") };

  const rows = await ownSessions(supabase);
  if (!rows) return { ok: false, error: t("p7cErrGeneric") };
  return {
    ok: true,
    sessions: rows.map((r) => ({
      id: sessionId(r.code),
      device: (r.device_name ?? "").slice(0, 80),
      createdAt: r.created_at,
      lastUsedAt: r.last_used_at,
      expiresAt: r.expires_at,
    })),
  };
}

/** Bitta qurilmaning tokenini bekor qilish (id — listCliSessions qaytargan). */
export async function revokeCliSession(id: string): Promise<Result> {
  return revokeWhere((r) => sessionId(r.code) === id, z.string().regex(/^[0-9a-f]{24}$/).safeParse(id).success);
}

/** Barcha CLI/Cowork tokenlarini bekor qilish ("hamma qurilmadan chiqish"). */
export async function revokeAllCliSessions(): Promise<Result> {
  return revokeWhere(() => true, true);
}

async function revokeWhere(match: (r: SessionRow) => boolean, valid: boolean): Promise<Result> {
  const t = await getServerT();
  if (!valid) return { ok: false, error: t("auCliErrBadCode") };
  if (!isSupabaseConfigured()) return { ok: false, error: t("auCliErrNoSupabase") };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: t("auCliErrLogin") };

  const rows = await ownSessions(supabase);
  if (!rows) return { ok: false, error: t("p7cErrGeneric") };
  const targets = rows.filter(match);
  for (const r of targets) {
    // 0012 cli_revoke: faqat `user_id = auth.uid()` qatorlar — boshqa hisobning sessiyasiga tegmaydi.
    const { error } = await supabase.rpc("cli_revoke", { p_code: r.code });
    if (error) {
      console.error("[cli] revoke:", error.message);
      return { ok: false, error: t("p7cErrGeneric") };
    }
  }
  return { ok: true };
}
