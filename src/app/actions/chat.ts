"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getServerT } from "@/lib/i18n-server";

/* Local-first: the browser store is the source of truth for the UI; these
   actions mirror it to Supabase whenever a session exists. */

const messageSchema = z.object({
  id: z.uuid(),
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
  modelId: z.string().optional().nullable(),
  citations: z.array(z.string()).optional().nullable(),
  createdAt: z.string(),
});

const conversationSchema = z.object({
  id: z.uuid(),
  title: z.string().max(200),
  modelId: z.string(),
  research: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  messages: z.array(messageSchema),
});

export type ServerConversation = z.infer<typeof conversationSchema>;
type SyncResult = { ok: true; skipped?: boolean } | { ok: false; error: string };

/** DB xatosi tafsiloti (jadval/constraint nomlari) mijozga chiqmaydi — faqat logga. */
async function syncError(where: string, detail: string): Promise<SyncResult> {
  console.error(`[sync] ${where}:`, detail);
  return { ok: false, error: (await getServerT())("secSyncFailed") };
}

async function session() {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { supabase, user } : null;
}

export async function syncConversation(raw: unknown): Promise<SyncResult> {
  const parsed = conversationSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: (await getServerT())("chBadConversation") };
  const s = await session();
  if (!s) return { ok: true, skipped: true };
  const c = parsed.data;

  const { error: cErr } = await s.supabase.from("conversations").upsert(
    {
      id: c.id,
      user_id: s.user.id,
      title: c.title,
      model_id: c.modelId,
      research: c.research,
      created_at: c.createdAt,
      updated_at: c.updatedAt,
    },
    { onConflict: "id" },
  );
  if (cErr) return syncError("conversations", cErr.message);

  if (c.messages.length) {
    const { error: mErr } = await s.supabase.from("messages").upsert(
      c.messages.map((m) => ({
        id: m.id,
        conversation_id: c.id,
        user_id: s.user.id,
        role: m.role,
        content: m.content,
        model_id: m.modelId ?? null,
        citations: m.citations ?? null,
        created_at: m.createdAt,
      })),
      { onConflict: "id" },
    );
    if (mErr) return syncError("messages", mErr.message);
  }
  return { ok: true };
}

export async function deleteConversationAction(id: string): Promise<SyncResult> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: (await getServerT())("chBadId") };
  const s = await session();
  if (!s) return { ok: true, skipped: true };
  const { error } = await s.supabase.from("conversations").delete().eq("id", id).eq("user_id", s.user.id);
  return error ? syncError("delete", error.message) : { ok: true };
}

export async function listConversations(): Promise<ServerConversation[]> {
  const s = await session();
  if (!s) return [];
  const { data: convs } = await s.supabase
    .from("conversations")
    .select("id, title, model_id, research, created_at, updated_at")
    .eq("user_id", s.user.id)
    .order("updated_at", { ascending: false })
    .limit(100);
  if (!convs?.length) return [];

  const ids = convs.map((c) => c.id);
  // PostgREST bir so'rovda ko'pi bilan ~1000 qator qaytaradi: eng YANGI xabarlardan
  // boshlab sahifalab o'qiymiz (eskilari birinchi kesilsin, yangilari emas) va har
  // suhbatdan oxirgi MAX_PER_CONV tasini olamiz — SSR yuki ham cheklanadi.
  type Row = { id: string; conversation_id: string; role: string; content: string; model_id: string | null; citations: unknown; created_at: string };
  const PAGE = 1000;
  const MAX_ROWS = 4000;
  const MAX_PER_CONV = 300;
  const msgs: Row[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await s.supabase
      .from("messages")
      .select("id, conversation_id, role, content, model_id, citations, created_at")
      .in("conversation_id", ids)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) {
      console.error("[sync] list messages:", error.message);
      break;
    }
    msgs.push(...((data as Row[] | null) ?? []));
    if (!data || data.length < PAGE) break;
  }

  const byConv = new Map<string, ServerConversation["messages"]>();
  // Yangidan eskiga: har suhbatga oxirgi MAX_PER_CONV ta, keyin tartib teskari (eski → yangi).
  for (const m of msgs) {
    const list = byConv.get(m.conversation_id) ?? [];
    if (list.length >= MAX_PER_CONV) continue;
    list.push({
      id: m.id,
      role: m.role as "user" | "assistant" | "system",
      content: m.content,
      modelId: m.model_id,
      citations: (m.citations as string[] | null) ?? null,
      createdAt: m.created_at,
    });
    byConv.set(m.conversation_id, list);
  }

  return convs.map((c) => ({
    id: c.id,
    title: c.title,
    modelId: c.model_id,
    research: c.research,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
    messages: (byConv.get(c.id) ?? []).reverse(),
  }));
}
