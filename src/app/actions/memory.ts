"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getMemories, rememberFromExchange, type MemoryNode } from "@/lib/ai/memory";

async function session() {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { supabase, user } : null;
}

/** Extract durable facts from the latest exchange (fire-and-forget from client). */
export async function rememberExchange(userText: string, assistantText: string): Promise<{ added: number }> {
  const s = await session();
  if (!s || !userText.trim()) return { added: 0 };
  const added = await rememberFromExchange(s.supabase, s.user.id, userText.slice(0, 4000), assistantText.slice(0, 2000));
  return { added };
}

export async function listMemories(): Promise<MemoryNode[]> {
  const s = await session();
  if (!s) return [];
  return getMemories(s.supabase, s.user.id, 200);
}

export async function deleteMemory(id: string): Promise<{ ok: boolean }> {
  if (!z.uuid().safeParse(id).success) return { ok: false };
  const s = await session();
  if (!s) return { ok: false };
  const { error } = await s.supabase.from("memory_nodes").delete().eq("id", id).eq("user_id", s.user.id);
  return { ok: !error };
}

export async function clearMemories(): Promise<{ ok: boolean }> {
  const s = await session();
  if (!s) return { ok: false };
  const { error } = await s.supabase.from("memory_nodes").delete().eq("user_id", s.user.id);
  return { ok: !error };
}

export async function setMemoryEnabled(enabled: boolean): Promise<{ ok: boolean }> {
  const s = await session();
  if (!s) return { ok: false };
  const { error } = await s.supabase.from("profiles").update({ memory_enabled: enabled }).eq("id", s.user.id);
  return { ok: !error };
}
