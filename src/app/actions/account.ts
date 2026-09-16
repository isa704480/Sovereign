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
