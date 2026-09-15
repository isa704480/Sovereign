"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SUPABASE_MISSING_MESSAGE } from "@/lib/supabase/env";
import { getProfile, postAuthPath } from "@/lib/auth/profile";
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

function translate(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "Email yoki parol noto'g'ri.";
  if (m.includes("email not confirmed")) return "Email hali tasdiqlanmagan. Pochtangizdagi havolani bosing.";
  if (m.includes("already registered") || m.includes("already been registered"))
    return "Bu email allaqachon ro'yxatdan o'tgan. Kirishga harakat qiling.";
  if (m.includes("password should be")) return "Parol talablarga javob bermaydi.";
  if (m.includes("rate limit") || m.includes("too many")) return "Juda ko'p urinish. Birozdan keyin qayta urinib ko'ring.";
  if (m.includes("provider is not enabled")) return "Bu kirish usuli hali yoqilmagan (Supabase → Auth → Providers).";
  if (m.includes("fetch failed") || m.includes("network")) return "Serverga ulanib bo'lmadi. Internetni tekshiring.";
  return message;
}

export async function signUpWithEmail(input: RegisterInput): Promise<AuthResult> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Noto'g'ri ma'lumot" };

  const supabase = await getSupabase();
  if (!supabase) return { ok: false, error: SUPABASE_MISSING_MESSAGE };
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
      return {
        ok: false,
        error: "Bu email allaqachon ro'yxatdan o'tgan, lekin parol mos kelmadi. Kirish sahifasidan urinib ko'ring.",
      };
    }
    const profile = await getProfile(supabase, signIn.data.user.id);
    redirect(postAuthPath(profile));
  }

  if (error) return { ok: false, error: translate(error.message) };

  // "Confirm email" off in Supabase → session is returned immediately → straight in.
  if (data.session) redirect("/onboarding");
  return { ok: true, status: "confirm-email" };
}

export async function signInWithEmail(input: LoginInput, next?: string | null): Promise<AuthResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Noto'g'ri ma'lumot" };

  const supabase = await getSupabase();
  if (!supabase) return { ok: false, error: SUPABASE_MISSING_MESSAGE };
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) return { ok: false, error: translate(error.message) };

  const profile = await getProfile(supabase, data.user.id);
  redirect(postAuthPath(profile, next));
}

export async function signInWithOAuth(provider: OAuthProvider, next?: string | null): Promise<AuthResult> {
  const supabase = await getSupabase();
  if (!supabase) return { ok: false, error: SUPABASE_MISSING_MESSAGE };
  const safeNext = next && next.startsWith("/") ? next : "/onboarding";
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${await siteUrl()}/auth/callback?next=${encodeURIComponent(safeNext)}`,
      queryParams: provider === "google" ? { access_type: "offline", prompt: "select_account" } : undefined,
    },
  });
  if (error) return { ok: false, error: translate(error.message) };
  if (data.url) redirect(data.url);
  return { ok: false, error: "OAuth havolasi olinmadi." };
}

export async function requestPasswordReset(email: string): Promise<AuthResult> {
  const parsed = resetSchema.safeParse({ email });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Noto'g'ri email" };
  const supabase = await getSupabase();
  if (!supabase) return { ok: false, error: SUPABASE_MISSING_MESSAGE };
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${await siteUrl()}/auth/callback?next=/app`,
  });
  if (error) return { ok: false, error: translate(error.message) };
  return { ok: true, status: "reset-sent" };
}

export async function signOut(): Promise<void> {
  const supabase = await getSupabase();
  if (supabase) await supabase.auth.signOut();
  redirect("/");
}
