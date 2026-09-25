"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile, postAuthPath, isSafeNextPath } from "@/lib/auth/profile";
import { getServerT } from "@/lib/i18n-server";
import { authErrorKey, isAuthKey } from "@/lib/locales/auth";
import {
  loginSchema,
  registerSchema,
  resetSchema,
  type LoginInput,
  type OAuthProvider,
  type RegisterInput,
} from "@/lib/validations/auth";

export type AuthResult =
  | { ok: true; status?: "confirm-email" | "reset-sent" }
  | { ok: false; error: string };

async function siteUrl(): Promise<string> {
  const env = process.env.NEXT_PUBLIC_SITE_URL;
  if (env) return env.replace(/\/$/, "");
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

async function getSupabase() {
  try {
    return await createClient();
  } catch {
    return null;
  }
}

/** Supabase xatosi yoki lug'at kaliti → foydalanuvchi tanlagan tildagi matn. */
async function translate(message: string): Promise<string> {
  const t = await getServerT();
  if (isAuthKey(message)) return t(message);
  const key = authErrorKey(message);
  return key ? t(key) : message;
}

async function fail(message: string): Promise<AuthResult> {
  return { ok: false, error: await translate(message) };
}

export async function signUpWithEmail(input: RegisterInput): Promise<AuthResult> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "auErrInvalidData");

  const supabase = await getSupabase();
  if (!supabase) return fail("auErrSupabaseMissing");
  const { email, password } = parsed.data;
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${await siteUrl()}/auth/callback?next=/onboarding` },
  });

  // Account already exists (explicit error, or Supabase's obfuscated user with no
  // identities when email confirmation is on): try to log the user in instead.
  const alreadyExists =
    (error && /already( been)? registered/i.test(error.message)) ||
    (!error && data.user?.identities?.length === 0);

  if (alreadyExists) {
    const signIn = await supabase.auth.signInWithPassword({ email, password });
    if (signIn.error) {
      return fail("auErrExistsWrongPw");
    }
    const profile = await getProfile(supabase, signIn.data.user.id);
    redirect(postAuthPath(profile));
  }

  if (error) return fail(error.message);

  // "Confirm email" off in Supabase → session is returned immediately → straight in.
  if (data.session) redirect("/onboarding");
  return { ok: true, status: "confirm-email" };
}

export async function signInWithEmail(input: LoginInput, next?: string | null): Promise<AuthResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "auErrInvalidData");

  const supabase = await getSupabase();
  if (!supabase) return fail("auErrSupabaseMissing");
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) return fail(error.message);

  const profile = await getProfile(supabase, data.user.id);
  redirect(postAuthPath(profile, next));
}

export async function signInWithOAuth(provider: OAuthProvider, next?: string | null): Promise<AuthResult> {
  const supabase = await getSupabase();
  if (!supabase) return fail("auErrSupabaseMissing");
  const safeNext = isSafeNextPath(next) ? next : "/onboarding";
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${await siteUrl()}/auth/callback?next=${encodeURIComponent(safeNext)}`,
      queryParams: provider === "google" ? { access_type: "offline", prompt: "select_account" } : undefined,
    },
  });
  if (error) return fail(error.message);
  if (data.url) redirect(data.url);
  return fail("auErrOAuthUrl");
}

export async function requestPasswordReset(email: string): Promise<AuthResult> {
  const parsed = resetSchema.safeParse({ email });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "auErrInvalidEmail");
  const supabase = await getSupabase();
  if (!supabase) return fail("auErrSupabaseMissing");
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${await siteUrl()}/auth/callback?next=/app`,
  });
  if (error) return fail(error.message);
  return { ok: true, status: "reset-sent" };
}

export async function signOut(): Promise<void> {
  const supabase = await getSupabase();
  if (supabase) await supabase.auth.signOut();
  redirect("/");
}
