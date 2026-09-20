"use server";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getMemories } from "@/lib/ai/memory";

async function session() {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { supabase, user } : null;
}

/** GDPR export: all of the user's data as a JSON object. */
export async function exportMyData(): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  const s = await session();
  if (!s) return { ok: false, error: "Sessiya topilmadi" };
  const [{ data: profile }, { data: conversations }, { data: messages }, memories, { data: orders }] = await Promise.all([
    s.supabase.from("profiles").select("*").eq("id", s.user.id).maybeSingle(),
    s.supabase.from("conversations").select("*").eq("user_id", s.user.id),
    s.supabase.from("messages").select("*").eq("user_id", s.user.id),
    getMemories(s.supabase, s.user.id, 1000),
    s.supabase.from("orders").select("id, plan, amount, status, created_at").eq("user_id", s.user.id),
  ]);
  return {
    ok: true,
    data: {
      exportedAt: new Date().toISOString(),
      user: { id: s.user.id, email: s.user.email },
      profile,
      conversations,
      messages,
      memories,
      orders,
    },
  };
}

/** Deletes all of the user's content (conversations, messages, memories). */
export async function deleteMyData(): Promise<{ ok: boolean }> {
  const s = await session();
  if (!s) return { ok: false };
  await Promise.all([
    s.supabase.from("conversations").delete().eq("user_id", s.user.id),
    s.supabase.from("memory_nodes").delete().eq("user_id", s.user.id),
  ]);
  return { ok: true };
}

/**
 * "Javoblarim Tella 2 ni o'rgatishda ishlatilsin" sozlamasi.
 * O'chirilsa, bu foydalanuvchining savol-javoblari trening bazasiga tushmaydi.
 */
export async function setTrainingOptIn(enabled: boolean): Promise<{ ok: boolean }> {
  const s = await session();
  if (!s) return { ok: false };
  const { error } = await s.supabase.from("profiles").update({ training_opt_in: enabled }).eq("id", s.user.id);
  return { ok: !error };
}

/** Joriy holat — sozlamalar panelini to'ldirish uchun. */
export async function getTrainingOptIn(): Promise<boolean> {
  const s = await session();
  if (!s) return false;
  const { data } = await s.supabase.from("profiles").select("training_opt_in").eq("id", s.user.id).maybeSingle();
  return (data as { training_opt_in?: boolean } | null)?.training_opt_in !== false;
}
