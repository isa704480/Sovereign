"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { chunkText, embedTexts } from "@/lib/ai/embed";
import { getServerT } from "@/lib/i18n-server";

async function session() {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { supabase, user } : null;
}

export interface KbDoc {
  id: string;
  name: string;
  mime: string | null;
  size: number;
  status: string;
  created_at: string;
  chunk_count?: number;
}

const uploadSchema = z.object({
  name: z.string().min(1).max(200),
  mime: z.string().max(120).optional(),
  content: z.string().min(20).max(500_000),
});

export type UploadResult =
  | { ok: true; documentId: string; chunks: number }
  | { ok: false; error: string };

/** Adds a text document to the user's knowledge base and stores embeddings. */
export async function uploadKnowledge(input: unknown): Promise<UploadResult> {
  const t = await getServerT();
  const parsed = uploadSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t("pnErrBadFileData") };
  const s = await session();
  if (!s) return { ok: false, error: t("pnErrLoginFirst") };

  const { name, mime, content } = parsed.data;
  const chunks = chunkText(content);
  if (!chunks.length) return { ok: false, error: t("pnErrFileEmpty") };

  const { data: doc, error: docErr } = await s.supabase
    .from("kb_documents")
    .insert({ user_id: s.user.id, name, mime: mime ?? null, size: content.length, status: "processing" })
    .select("id")
    .single();
  if (docErr || !doc) return { ok: false, error: docErr?.message ?? t("pnErrFileNotSaved") };

  try {
    // Embed in batches so we don't hit provider payload limits.
    const batchSize = 32;
    for (let i = 0; i < chunks.length; i += batchSize) {
      const slice = chunks.slice(i, i + batchSize);
      const vecs = await embedTexts(slice);
      const rows = slice.map((c, j) => ({
        document_id: doc.id,
        user_id: s.user.id,
        chunk_index: i + j,
        content: c,
        embedding: vecs[j] as unknown as string,
      }));
      const { error } = await s.supabase.from("kb_chunks").insert(rows);
      if (error) throw new Error(error.message);
    }
    await s.supabase.from("kb_documents").update({ status: "ready" }).eq("id", doc.id);
  } catch (e) {
    await s.supabase.from("kb_documents").update({ status: "error" }).eq("id", doc.id);
    return { ok: false, error: e instanceof Error ? e.message : t("pnErrIndexing") };
  }

  return { ok: true, documentId: doc.id, chunks: chunks.length };
}

export async function listKnowledge(): Promise<KbDoc[]> {
  const s = await session();
  if (!s) return [];
  const { data } = await s.supabase
    .from("kb_documents")
    .select("id, name, mime, size, status, created_at")
    .eq("user_id", s.user.id)
    .order("created_at", { ascending: false });
  return (data as KbDoc[] | null) ?? [];
}

export async function deleteKnowledge(id: string): Promise<{ ok: boolean }> {
  if (!z.uuid().safeParse(id).success) return { ok: false };
  const s = await session();
  if (!s) return { ok: false };
  const { error } = await s.supabase.from("kb_documents").delete().eq("id", id).eq("user_id", s.user.id);
  return { ok: !error };
}
