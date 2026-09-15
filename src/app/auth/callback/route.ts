import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProfile, postAuthPath } from "@/lib/auth/profile";

/**
 * OAuth (Google / GitHub) and email-confirmation callback.
 * Exchanges the PKCE code for a session, then routes to onboarding or the app.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");
  const errorDescription = searchParams.get("error_description") ?? searchParams.get("error");

  // Behind a proxy (Vercel), prefer the forwarded host for the redirect base.
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? "https";
  const base =
    process.env.NODE_ENV === "development"
      ? origin
      : forwardedHost
        ? `${forwardedProto}://${forwardedHost}`
        : origin;

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      const profile = await getProfile(supabase, data.user.id);
      return NextResponse.redirect(`${base}${postAuthPath(profile, next)}`);
    }
    return NextResponse.redirect(
      `${base}/login?error=${encodeURIComponent(error?.message ?? "Sessiya yaratilmadi")}`,
    );
  }

  return NextResponse.redirect(
    `${base}/login?error=${encodeURIComponent(errorDescription ?? "Kirish bekor qilindi")}`,
  );
}
