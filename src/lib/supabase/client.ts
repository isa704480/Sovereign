import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_ANON_KEY, SUPABASE_MISSING_MESSAGE, SUPABASE_URL, cookieDomainFor, isSupabaseConfigured, sessionCookieOptions } from "./env";

/** Browser-side Supabase client (client components). */
export function createClient() {
  if (!isSupabaseConfigured()) throw new Error(SUPABASE_MISSING_MESSAGE);
  // Umumiy sessiya: app./api./landing bitta cookie (NEXT_PUBLIC_COOKIE_DOMAIN).
  const domain = cookieDomainFor(typeof window !== "undefined" ? window.location.hostname : undefined);
  const secure = typeof window !== "undefined" && window.location.protocol === "https:";
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY, { cookieOptions: sessionCookieOptions(domain, secure) });
}
