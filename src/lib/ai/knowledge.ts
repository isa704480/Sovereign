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
