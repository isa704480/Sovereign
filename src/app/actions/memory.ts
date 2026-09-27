"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { headers } from "next/headers";
import { getMemories, MEMORY_MODEL, rememberFromExchange, type MemoryNode } from "@/lib/ai/memory";
import { modelAllowedIn } from "@/lib/ai/region";
import { resolveUserRegion } from "@/lib/ai/region-server";
import { rateLimit } from "@/lib/rate-limit";

async function session() {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { supabase, user } : null;
}

// Klient to'liq xabar/javobni yuboradi (uzun javoblar ham) — rad etmaymiz, pastda kesiladi.
const exchangeSchema = z.object({ userText: z.string(), assistantText: z.string() });
/** Xotira ajratish (platforma kalitidagi LLM chaqiruvi) — foydalanuvchiga soatiga. */
const EXTRACT_LIMIT = { limit: 120, windowMs: 60 * 60_000 };

/** Extract durable facts from the latest exchange (fire-and-forget from client). */
export async function rememberExchange(userText: string, assistantText: string): Promise<{ added: number }> {
  const parsed = exchangeSchema.safeParse({ userText, assistantText });
  if (!parsed.success || !parsed.data.userText.trim()) return { added: 0 };
  const s = await session();
  if (!s) return { added: 0 };
  if (!(await rateLimit(`mem:extract:${s.user.id}`, EXTRACT_LIMIT.limit, EXTRACT_LIMIT.windowMs)).ok) return { added: 0 };
  // "AI sizni eslab qolsinmi?" o'chiq bo'lsa — suhbat modelga yuborilmaydi va
  // xotiraga yozilmaydi (rozilik). Profilni o'qib bo'lmasa ham yozmaymiz.
  const { data: profile, error: profileErr } = await s.supabase
    .from("profiles")
    .select("memory_enabled")
    .eq("id", s.user.id)
    .maybeSingle();
  if (profileErr || (profile as { memory_enabled?: boolean } | null)?.memory_enabled === false) return { added: 0 };
  // Xotira ajratuvchi model — openai/gpt-4o-mini: provayder mintaqaga xizmat
  // ko'rsatmasa, suhbat matni unga yuborilmaydi (region.ts).
  const region = await resolveUserRegion({ headers: await headers(), supabase: s.supabase, userId: s.user.id });
  if (!modelAllowedIn(MEMORY_MODEL, region.country)) return { added: 0 };
  const added = await rememberFromExchange(
    s.supabase,
    s.user.id,
    parsed.data.userText.slice(0, 4000),
    parsed.data.assistantText.slice(0, 2000),
  );
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
  if (typeof enabled !== "boolean") return { ok: false };
  const s = await session();
  if (!s) return { ok: false };
  const { error } = await s.supabase.from("profiles").update({ memory_enabled: enabled }).eq("id", s.user.id);
  return { ok: !error };
}
