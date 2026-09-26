import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { SUPABASE_ANON_KEY, SUPABASE_MISSING_MESSAGE, SUPABASE_URL, cookieDomainFor, isSupabaseConfigured } from "./env";

/**
 * Server-side Supabase client (Server Components, Server Actions, Route Handlers).
 * Cookies are read/written through Next's cookie store; writes are ignored in
 * Server Components (the proxy already refreshed the session there).
 */
export async function createClient() {
  if (!isSupabaseConfigured()) throw new Error(SUPABASE_MISSING_MESSAGE);
  const cookieStore = await cookies();
  // Umumiy sessiya: app./api./landing bitta cookie (NEXT_PUBLIC_COOKIE_DOMAIN).
  const domain = cookieDomainFor((await headers()).get("host"));

  return createServerClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      ...(domain ? { cookieOptions: { domain } } : {}),
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component: safe to ignore because the proxy
            // refreshes sessions before pages render.
          }
        },
      },
    },
  );
}
