"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getServerT } from "@/lib/i18n-server";

type Result = { ok: true } | { ok: false; error: string };

/** Browser approval: binds the CLI device code to the logged-in user. */
export async function approveCliDevice(code: string): Promise<Result> {
  const t = await getServerT();
  if (!z.string().min(10).max(80).safeParse(code).success) return { ok: false, error: t("auCliErrBadCode") };
  if (!isSupabaseConfigured()) return { ok: false, error: t("auCliErrNoSupabase") };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: t("auCliErrLogin") };

  const { data, error } = await supabase.rpc("cli_approve", { p_code: code });
  if (error) return { ok: false, error: error.message };
  if (data !== true) return { ok: false, error: t("auCliErrExpired") };
  return { ok: true };
}
