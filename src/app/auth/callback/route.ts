import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProfile, postAuthPath } from "@/lib/auth/profile";
import { authErrorKey } from "@/lib/locales/auth";
import { CONNECTOR_BY_ID } from "@/config/connectors";
import { CONNECT_COOKIE, parseConnectCookie } from "@/lib/auth/connect-cookie";
import type { AuthMsgKey } from "@/components/auth/messages";
import { safeNextPath } from "@/components/auth/next-path";
import { RECOVERY_COOKIE, RECOVERY_MAX_AGE, RESET_PASSWORD_PATH } from "@/components/auth/recovery";

/**
 * /login?error= ga FAQAT lug'at kaliti (LoginForm uni tanlangan tilga o'giradi).
 * Tanilmagan Supabase xatosi URL'ga qo'yilmaydi — serverda logga yoziladi.
 */
function errorParam(message: string, recovery: boolean): AuthMsgKey {
  const known = authErrorKey(message);
  if (known) return known;
  // PKCE: havola boshqa brauzerda/qurilmada ochilgan (code verifier cookie yo'q).
  if (/code verifier|code_verifier|pkce/i.test(message)) return "auErrLinkOtherBrowser";
  if (recovery) return "auErrResetExpired";
  console.error("[auth/callback] Noma'lum xato:", message);
  return "auErrNoSession";
}

/**
 * OAuth (Google / GitHub) and email-confirmation callback.
 * Exchanges the PKCE code for a session, then routes to onboarding or the app.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));
  const recovery = searchParams.get("flow") === "recovery";
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
      if (connect) {
        // Ulashni kim boshlagan (connectGoogle belgisi) — boshqa Google akkaunt tanlanib,
        // sessiya begona foydalanuvchiga almashgan bo'lsa token saqlanmaydi va bu
        // sessiya yopiladi (foydalanuvchi o'z hisobiga qayta kiradi).
        const jar = await cookies();
        const started = parseConnectCookie(jar.get(CONNECT_COOKIE)?.value);
        jar.delete({ name: CONNECT_COOKIE, path: "/auth/callback" });
        const spec = CONNECTOR_BY_ID[connect];
        if (!started || started.userId !== data.user.id || started.connectorId !== connect || spec?.auth !== "oauth-google") {
          console.warn("[auth/callback] connector: boshqa akkaunt yoki noto'g'ri so'rov — sessiya yopildi");
          await supabase.auth.signOut({ scope: "local" });
          return NextResponse.redirect(`${base}/login?error=auErrNoSession`);
        }
      }
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
      if (recovery) {
        // Parolni tiklash: yangi parol sahifasiga. Qisqa muddatli httpOnly belgi —
        // updatePassword faqat shu belgi bilan ishlaydi.
        (await cookies()).set(RECOVERY_COOKIE, "1", {
          httpOnly: true,
          secure: process.env.NODE_ENV !== "development",
          sameSite: "lax",
          path: "/",
          maxAge: RECOVERY_MAX_AGE,
        });
        return NextResponse.redirect(`${base}${RESET_PASSWORD_PATH}`);
      }
      const profile = await getProfile(supabase, data.user.id);
      return NextResponse.redirect(`${base}${postAuthPath(profile, next)}`);
    }
    return NextResponse.redirect(
      `${base}/login?error=${error?.message ? errorParam(error.message, recovery) : "auErrNoSession"}`,
    );
  }

  return NextResponse.redirect(
    `${base}/login?error=${errorDescription ? errorParam(errorDescription, recovery) : "auErrSignInCancelled"}`,
  );
}
