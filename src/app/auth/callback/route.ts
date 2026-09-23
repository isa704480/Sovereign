import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProfile, postAuthPath } from "@/lib/auth/profile";
import { authErrorKey } from "@/lib/locales/auth";

/**
 * /login?error= ga lug'at kaliti (LoginForm uni tanlangan tilga o'giradi);
 * tanilmagan Supabase xatosi o'z holicha o'tadi.
 */
function errorParam(message: string): string {
  return encodeURIComponent(authErrorKey(message) ?? message);
}

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
      // Google connectorni ulash: provider_token'ni connector_accounts'ga saqlaymiz.
      const connect = searchParams.get("connect");
      if (connect && data.session?.provider_token) {
        try {
          await supabase.from("connector_accounts").upsert(
            {
              user_id: data.user.id,
              connector_id: connect,
              enabled: true,
              config: {
                oauth: true,
                token: data.session.provider_token,
                refresh: data.session.provider_refresh_token ?? null,
                meta: data.user.email ?? "Google",
              },
            },
            { onConflict: "user_id,connector_id" },
          );
        } catch {
          // Ulash saqlanmasa ham kirishga xalaqit bermaymiz.
        }
        return NextResponse.redirect(`${base}/app`);
      }
      const profile = await getProfile(supabase, data.user.id);
      return NextResponse.redirect(`${base}${postAuthPath(profile, next)}`);
    }
    return NextResponse.redirect(
      `${base}/login?error=${error?.message ? errorParam(error.message) : "auErrNoSession"}`,
    );
  }

  return NextResponse.redirect(
    `${base}/login?error=${errorDescription ? errorParam(errorDescription) : "auErrSignInCancelled"}`,
  );
}
