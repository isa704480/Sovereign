import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { embedQuery } from "./embed";

/**
 * Semantik javob keshi. Foydalanuvchining oxirgi savoli embedding'ga aylantiriladi
 * va oldingi savollar bilan solishtiriladi. 92%+ o'xshashlik va 24 soatdan yosh
 * bo'lsa — modelga bormasdan keshdan qaytariladi. Xarajat 100x kamayadi.
 *
 * Xavfsizlik: faqat "umumiy" savollarga tegishli — foydalanuvchining shaxsiy
 * xotirasi, RAG, biriktirilgan fayl yoki attachment bo'lsa kesh chetlanadi.
 */

interface CacheHit {
  id: string;
  query: string;
  answer: string;
  model: string;
  similarity: number;
  created_at: string;
}

const MIN_QUERY_LEN = 12;
const MAX_QUERY_LEN = 500;

function hashOf(q: string): string {
  return createHash("sha256").update(q.trim().toLowerCase()).digest("hex").slice(0, 16);
}

/** Personal savollarni ("mening ...", "meni", ismlar bilan) keshlash mumkin emas. */
function isPersonal(q: string): boolean {
  return /\b(men(ing|i|ga)?|mening|o'zim(ni)?|my|mine|myself)\b/i.test(q);
}

function tooShortOrLong(q: string): boolean {
  const t = q.trim();
  return t.length < MIN_QUERY_LEN || t.length > MAX_QUERY_LEN;
}

/** Keshni tekshirish. Topilsa — javob, aks holda null. */
export async function lookupSemanticCache(
  supabase: SupabaseClient,
  query: string,
): Promise<CacheHit | null> {
  if (tooShortOrLong(query) || isPersonal(query)) return null;
  try {
    const emb = await embedQuery(query);
    if (!emb) return null;
    const { data, error } = await supabase.rpc("answer_cache_search", {
      p_embedding: emb,
      p_max_age_hours: 24,
      p_min_similarity: 0.92,
    });
    if (error || !Array.isArray(data) || data.length === 0) return null;
    const hit = data[0] as CacheHit;
    // Analytics: hit counter'ni oshirish (fire & forget).
    supabase.rpc("answer_cache_touch", { p_id: hit.id }).then(() => {}, () => {});
    return hit;
  } catch {
    return null;
  }
}

/** Yangi javobni keshga yozish. Muvaffaqiyatsizlik indamay o'tadi. */
export async function saveSemanticCache(
  supabase: SupabaseClient,
  query: string,
  answer: string,
  model: string,
): Promise<void> {
  if (tooShortOrLong(query) || isPersonal(query)) return;
  if (!answer || answer.length < 60 || answer.length > 8000) return;
  try {
    const emb = await embedQuery(query);
    if (!emb) return;
    await supabase.rpc("answer_cache_write", {
      p_query_hash: hashOf(query),
      p_query: query.slice(0, MAX_QUERY_LEN),
      p_answer: answer,
      p_model: model,
      p_embedding: emb,
    });
  } catch {
    /* ignore */
  }
}
