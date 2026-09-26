"use server";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { isLang } from "@/lib/i18n";
import { getServerLang } from "@/lib/i18n-server";

async function session() {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { supabase, user } : null;
}

/** "Maslahat va yangiliklarni emailga yuborish" holati (standart: o'chiq). null — o'qib bo'lmadi. */
export async function getEmailTips(): Promise<boolean | null> {
  const s = await session();
  if (!s) return null;
  const { data, error } = await s.supabase.from("profiles").select("email_tips").eq("id", s.user.id).maybeSingle();
  if (error) return null;
  return (data as { email_tips?: boolean } | null)?.email_tips === true;
}

/**
 * Tip emaillariga rozilik (opt-in). Yoqilganda email tili ham saqlanadi — cron shu tilda yozadi.
 * Faqat email_tips va email_lang yoziladi; yuborish hisoblagichlarini 0034 trigger himoya qiladi.
 */
export async function setEmailTips(enabled: boolean, lang?: string): Promise<{ ok: boolean }> {
  if (typeof enabled !== "boolean") return { ok: false };
  const s = await session();
  if (!s) return { ok: false };
  const emailLang = isLang(lang) ? lang : await getServerLang();
  const patch = enabled ? { email_tips: true, email_lang: emailLang } : { email_tips: false };
  const { error } = await s.supabase.from("profiles").update(patch).eq("id", s.user.id);
  return { ok: !error };
}
