import { createClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_MISSING_MESSAGE, SUPABASE_URL, isSupabaseConfigured } from "./env";

/**
 * Stateless anon client (no cookies) for CLI device-login RPCs.
 * Security lives in the SECURITY DEFINER functions, not in the session.
 */
export function createAnonClient() {
  if (!isSupabaseConfigured()) throw new Error(SUPABASE_MISSING_MESSAGE);
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
