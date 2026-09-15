import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_ANON_KEY, SUPABASE_MISSING_MESSAGE, SUPABASE_URL, isSupabaseConfigured } from "./env";

/** Browser-side Supabase client (client components). */
export function createClient() {
  if (!isSupabaseConfigured()) throw new Error(SUPABASE_MISSING_MESSAGE);
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
