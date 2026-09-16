"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

type Result = { ok: true } | { ok: false; error: string };

/** Browser approval: binds the CLI device code to the logged-in user. */
export async function approveCliDevice(code: string): Promise<Result> {
  if (!z.string().min(10).max(80).safeParse(code).success) return { ok: false, error: "Noto'g'ri kod" };
  if (!isSupabaseConfigured()) return { ok: false, error: "Supabase sozlanmagan" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Avval SOVEREIGN'ga kiring" };

  const { data, error } = await supabase.rpc("cli_approve", { p_code: code });
  if (error) return { ok: false, error: error.message };
  if (data !== true) return { ok: false, error: "Kod eskirgan yoki allaqachon ishlatilgan" };
  return { ok: true };
}
