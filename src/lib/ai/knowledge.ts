import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { embedQuery } from "./embed";

export interface KbHit {
  document_id: string;
  document_name: string;
  chunk_index: number;
  content: string;
  similarity: number;
}

/** Retrieves the top-k KB chunks for the current query. */
export async function retrieveKnowledge(
  supabase: SupabaseClient,
  userId: string,
  query: string,
  limit = 6,
): Promise<KbHit[]> {
  if (!query.trim() || !process.env.OPENROUTER_API_KEY) return [];
  const vec = await embedQuery(query.slice(0, 4000)).catch(() => null);
  if (!vec) return [];
  const { data, error } = await supabase.rpc("kb_search", {
    p_user_id: userId,
    p_query: vec as unknown as string,
    p_limit: limit,
  });
  if (error) return [];
  return ((data as KbHit[] | null) ?? []).filter((h) => h.similarity > 0.3);
}

/**
 * Chunks of documents the user explicitly referenced with "@name". No embedding
 * step: the mention already says which document matters. RLS on kb_chunks keeps
 * this to the caller's own documents.
 */
export async function fetchMentionedDocs(
  supabase: SupabaseClient,
  docIds: string[],
  chunksPerDoc = 8,
): Promise<KbHit[]> {
  if (!docIds.length) return [];
  const { data, error } = await supabase
    .from("kb_chunks")
    .select("document_id, chunk_index, content, kb_documents!inner(name)")
    .in("document_id", docIds.slice(0, 4))
    .order("document_id")
    .order("chunk_index")
    .limit(chunksPerDoc * 4);
  if (error || !data) return [];

  const perDoc = new Map<string, number>();
  const hits: KbHit[] = [];
  for (const row of data as unknown as {
    document_id: string;
    chunk_index: number;
    content: string;
    kb_documents: { name: string } | { name: string }[];
  }[]) {
    const seen = perDoc.get(row.document_id) ?? 0;
    if (seen >= chunksPerDoc) continue;
    perDoc.set(row.document_id, seen + 1);
    const doc = Array.isArray(row.kb_documents) ? row.kb_documents[0] : row.kb_documents;
    hits.push({
      document_id: row.document_id,
      document_name: doc?.name ?? "hujjat",
      chunk_index: row.chunk_index,
      content: row.content,
      similarity: 1,
    });
  }
  return hits;
}

/** System-prompt block that grounds the answer in the KB hits. */
export function knowledgePrompt(hits: KbHit[]): string {
  if (!hits.length) return "";
  const byDoc = new Map<string, string[]>();
  for (const h of hits) {
    const list = byDoc.get(h.document_name) ?? [];
    list.push(h.content);
    byDoc.set(h.document_name, list);
  }
  const blocks = [...byDoc.entries()].map(([name, chunks]) => `[FAYL: ${name}]\n${chunks.join("\n---\n")}`);
  return (
    "FOYDALANUVCHI KUTUBXONASIDAN OLINGAN MOS QISMLAR (bulardan foydalanib javob ber, fakt shu yerda bo'lsa manba fayl nomini eslatib o't):\n\n" +
    blocks.join("\n\n") +
    "\n\nAgar javob shu qismlardan topilmasa, ochiq ayt."
  );
}
