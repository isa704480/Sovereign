import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  SIGNED_IN_HINT_COOKIE,
  SUPABASE_ANON_KEY,
  SUPABASE_MISSING_MESSAGE,
  SUPABASE_URL,
  cookieDomainFor,
  isSupabaseConfigured,
  sessionCookieHttpOnly,
  sessionCookieOptions,
} from "./env";

const PROTECTED_PREFIXES = ["/onboarding", "/app"];
const AUTH_PAGES = ["/login", "/register"];

let warned = false;

/** SIGNED_IN_HINT_COOKIE'ni sessiya holatiga moslaydi (faqat farq bo'lsa Set-Cookie). */
function syncSignedInHint(request: NextRequest, response: NextResponse, signedIn: boolean, domain: string | undefined, secure: boolean) {
  const has = request.cookies.get(SIGNED_IN_HINT_COOKIE)?.value === "1";
  if (signedIn === has) return;
  response.cookies.set(SIGNED_IN_HINT_COOKIE, signedIn ? "1" : "", {
    path: "/",
    sameSite: "lax",
    secure,
    ...(domain ? { domain } : {}),
    maxAge: signedIn ? 400 * 24 * 60 * 60 : 0,
  });
}

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

  // If the OAuth redirect_to is not in Supabase's allow-list, Supabase falls back to
  // the Site URL (the landing) with ?code=… — hand that code to the real callback.
  if (request.nextUrl.pathname === "/" && (request.nextUrl.searchParams.has("code") || request.nextUrl.searchParams.has("error_description"))) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/callback";
    return NextResponse.redirect(url);
  }

  const domain = cookieDomainFor(request.headers.get("host"));
  const secure = process.env.NODE_ENV === "production";
  const httpOnly = sessionCookieHttpOnly();
  const supabase = createServerClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      cookieOptions: sessionCookieOptions(domain, secure, httpOnly),
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

  // httpOnly rejimi: landing JS sessiya cookie'sini ko'rmaydi — alohida maxfiy bo'lmagan ishora.
  if (httpOnly) syncSignedInHint(request, response, Boolean(user), domain, secure);

  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const isAuthPage = AUTH_PAGES.includes(pathname);

  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // So'rov qismi ham saqlanadi (masalan /app?checkout=crypto) — login'dan keyin shu yerga qaytadi.
    url.search = "";
    url.searchParams.set("next", pathname + request.nextUrl.search);
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
