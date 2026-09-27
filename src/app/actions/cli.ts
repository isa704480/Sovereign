"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getServerT } from "@/lib/i18n-server";
import { fmt, type TKey } from "@/lib/i18n";
import { ipFromHeaders, sessionId } from "@/lib/cli/device";
import { approveWithTypedCode, type ApproveFailure } from "@/lib/cli/approve-flow";
import { cliCodeSecret, legacyLoginEnabled, resolveLoginRef, type CliLoginRef, type CliSessionRow } from "@/lib/cli/user-code";
import { failureCount, ipKey, recordFailure } from "@/lib/rate-limit";

type Result = { ok: true } | { ok: false; error: string };

/** `final` — bu kirishni endi tasdiqlab bo'lmaydi (forma yopiladi). */
export type ApproveResult = { ok: true } | { ok: false; error: string; final?: boolean };

const refSchema = z.object({ kind: z.enum(["h", "code"]), value: z.string().min(10).max(200) }).strict();
const typedSchema = z.string().max(64);

type Supa = Awaited<ReturnType<typeof createClient>>;

const missingFn = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "PGRST202" || /could not find the function/i.test(e.message ?? ""));

/**
 * Tasdiqlash: 0042 qo'llangan bo'lsa — service role `cli_approve_verified(p_code, p_uid)`
 * (to'g'ridan-to'g'ri `cli_approve` authenticated'dan olib qo'yilgan — terilgan kodsiz
 * tasdiqlash yo'li yo'q). Hali qo'llanmagan bo'lsa — foydalanuvchi JWT bilan `cli_approve`.
 * Ikkalasida ham semantika bir xil: faqat pending → approved, user_id = shu foydalanuvchi.
 */
async function approveRpc(supabase: Supa, code: string, uid: string): Promise<boolean | "error"> {
  try {
    const svc = createServiceClient();
    const { data, error } = await svc.rpc("cli_approve_verified", { p_code: code, p_uid: uid });
    if (!error) return data === true;
    if (!missingFn(error)) {
      console.error("[cli] approve (verified):", error.message);
      return "error";
    }
  } catch (e) {
    console.error("[cli] approve (verified):", e instanceof Error ? e.message : e);
  }
  const { data, error } = await supabase.rpc("cli_approve", { p_code: code });
  if (error) {
    console.error("[cli] approve:", error.message);
    return "error";
  }
  return data === true;
}

async function loadSession(code: string): Promise<CliSessionRow | null | "error"> {
  try {
    const { data, error } = await createServiceClient()
      .from("cli_sessions")
      .select("approved, revoked_at, expires_at, created_at, user_id")
      .eq("code", code)
      .maybeSingle();
    if (error) {
      console.error("[cli] approve load:", error.message);
      return "error";
    }
    return (data as CliSessionRow | null) ?? null;
  } catch (e) {
    console.error("[cli] approve load:", e instanceof Error ? e.message : e);
    return "error";
  }
}

async function denyRpc(supabase: Supa, code: string): Promise<void> {
  const { error } = await supabase.rpc("cli_deny", { p_code: code });
  // 0040 hali qo'llanmagan — jim (kod baribir ≤ 10 daqiqada eskiradi, urinishlar qulflangan).
  if (error && !missingFn(error)) console.error("[cli] deny:", error.message);
}

/**
 * Brauzerda tasdiqlash (RFC 8628 uslubi): foydalanuvchi o'z qurilmasida ko'rsatilgan kodni
 * TERADI. URL parametrining o'zi bilan tasdiqlab bo'lmaydi. Noto'g'ri kodlar foydalanuvchi,
 * IP va kod bo'yicha cheklanadi; kod bo'yicha 5 xato → sessiya bekor qilinadi.
 */
export async function approveCliDevice(ref: CliLoginRef, typed: string): Promise<ApproveResult> {
  const t = await getServerT();
  const refOk = refSchema.safeParse(ref);
  if (!refOk.success || !typedSchema.safeParse(typed).success) return { ok: false, error: t("auCliErrBadCode") };
  if (!isSupabaseConfigured()) return { ok: false, error: t("auCliErrNoSupabase") };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: t("auCliErrLogin") };

  const secret = cliCodeSecret();
  const resolved = resolveLoginRef(refOk.data, secret, legacyLoginEnabled());
  if (!resolved.ok) {
    return { ok: false, final: true, error: t(resolved.reason === "legacy_disabled" ? "p17dLegacyDisabled" : "auCliErrExpired") };
  }

  const ip = ipFromHeaders(await headers());
  const outcome = await approveWithTypedCode(
    {
      now: Date.now,
      secret,
      failures: { count: failureCount, record: recordFailure },
      loadSession,
      approve: (code) => approveRpc(supabase, code, user.id),
      deny: (code) => denyRpc(supabase, code),
    },
    { deviceCode: resolved.deviceCode, typed, userId: user.id, ip: ip ? ipKey(ip) : null, allowLegacy: resolved.legacy },
  );
  if (outcome.ok) return { ok: true };
  return failureResult(t, outcome.reason, outcome.remaining);
}

function failureResult(t: (k: TKey) => string, reason: ApproveFailure, remaining?: number): ApproveResult {
  switch (reason) {
    case "malformed":
      return { ok: false, error: t("p17dErrMalformed") };
    case "mismatch":
      return { ok: false, error: fmt(t("p17dErrMismatch"), { n: String(remaining ?? 0) }) };
    case "locked":
      return { ok: false, final: true, error: t("p17dErrLocked") };
    case "rate_limited":
      return { ok: false, error: t("p17dErrRateLimited") };
    case "expired":
      return { ok: false, final: true, error: t("auCliErrExpired") };
    case "used":
      return { ok: false, final: true, error: t("p17dErrUsed") };
    default:
      return { ok: false, error: t("p7cErrGeneric") };
  }
}

/**
 * "Bekor qilish": kutilayotgan kod serverda ham bekor qilinadi (0040 cli_deny) — kod
 * keyinroq (masalan, boshqa oynada yoki boshqa hisob bilan) tasdiqlanib qolmasin (cli-api-1).
 * Migratsiya hali ishlamagan bo'lsa — jim o'tadi (kod 5–10 daqiqada baribir eskiradi).
 * Bekor qilish xavfsiz amal — eski havolalar (CLI_LEGACY_LOGIN=off bo'lsa ham) qabul qilinadi.
 */
export async function denyCliDevice(ref: CliLoginRef): Promise<Result> {
  const t = await getServerT();
  const refOk = refSchema.safeParse(ref);
  if (!refOk.success) return { ok: false, error: t("auCliErrBadCode") };
  if (!isSupabaseConfigured()) return { ok: false, error: t("auCliErrNoSupabase") };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: t("auCliErrLogin") };

  const resolved = resolveLoginRef(refOk.data, cliCodeSecret(), true);
  if (!resolved.ok) return { ok: true }; // yaroqsiz havola — bekor qiladigan narsa yo'q

  const { error } = await supabase.rpc("cli_deny", { p_code: resolved.deviceCode });
  if (error && !missingFn(error)) {
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
