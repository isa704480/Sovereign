import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_ANON_KEY, SUPABASE_MISSING_MESSAGE, SUPABASE_URL, isSupabaseConfigured } from "./env";

const PROTECTED_PREFIXES = ["/onboarding", "/app"];
const AUTH_PAGES = ["/login", "/register"];

let warned = false;

/**
 * Refreshes the Supabase session on every matched request and applies
 * coarse route protection. Fine-grained checks (onboarding completed?)
 * live in the pages themselves so the proxy never hits the database.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  if (!isSupabaseConfigured()) {
    if (!warned) {
      console.warn(`[sovereign] ${SUPABASE_MISSING_MESSAGE}`);
      warned = true;
    }
    return response;
  }

  const supabase = createServerClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not add logic between createServerClient and getUser(): it can cause
  // random logouts because the refreshed cookies must be written back first.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const isAuthPage = AUTH_PAGES.includes(pathname);

  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/app";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
