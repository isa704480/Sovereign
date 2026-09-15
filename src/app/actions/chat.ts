"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

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
  if (!parsed.success) return { ok: false, error: "Noto'g'ri suhbat ma'lumoti" };
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
  if (cErr) return { ok: false, error: cErr.message };

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
    if (mErr) return { ok: false, error: mErr.message };
  }
  return { ok: true };
}

export async function deleteConversationAction(id: string): Promise<SyncResult> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Noto'g'ri id" };
  const s = await session();
  if (!s) return { ok: true, skipped: true };
  const { error } = await s.supabase.from("conversations").delete().eq("id", id).eq("user_id", s.user.id);
  return error ? { ok: false, error: error.message } : { ok: true };
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
  const { data: msgs } = await s.supabase
    .from("messages")
    .select("id, conversation_id, role, content, model_id, citations, created_at")
    .in("conversation_id", ids)
    .order("created_at", { ascending: true });

  const byConv = new Map<string, ServerConversation["messages"]>();
  for (const m of msgs ?? []) {
    const list = byConv.get(m.conversation_id) ?? [];
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
    messages: byConv.get(c.id) ?? [],
  }));
}
