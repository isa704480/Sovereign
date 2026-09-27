import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type MediaKind = "image" | "video" | "transcribe";

/**
 * Kunlik media kvotasi — BAZADA (0041 consume_media; auth.uid() + UTC kun). Redis limiti
 * (rate-limit.ts) Upstash yo'q/timeout bo'lsa instansiya xotirasiga tushadi; bu esa barcha
 * instansiyalar uchun umumiy va qat'iy hisob (chat-ai-7).
 *
 * true — ruxsat; false — kunlik limit tugagan; null — DB xatosi (chaqiruvchi hal qiladi).
 * Migratsiya hali qo'llanmagan bo'lsa (PGRST202) — true: avvalgidek faqat Redis limiti.
 */
export async function consumeMedia(supabase: Pick<SupabaseClient, "rpc">, kind: MediaKind, limit: number): Promise<boolean | null> {
  try {
    const { data, error } = await supabase.rpc("consume_media", { p_kind: kind, p_limit: limit });
    if (error) {
      if (error.code === "PGRST202") return true;
      console.error("[media-quota]", kind, error.message);
      return null;
    }
    return data === true;
  } catch (e) {
    console.error("[media-quota]", kind, e instanceof Error ? e.message : e);
    return null;
  }
}
