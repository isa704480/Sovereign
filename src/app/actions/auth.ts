"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getProfile, postAuthPath } from "@/lib/auth/profile";
import { getServerT } from "@/lib/i18n-server";
import { authErrorKey } from "@/lib/locales/auth";
import { rateLimit } from "@/lib/rate-limit";
import { isAuthMsgKey } from "@/components/auth/messages";
import { safeNextPath } from "@/components/auth/next-path";
import { RECOVERY_COOKIE, RESET_PASSWORD_PATH } from "@/components/auth/recovery";
import {
  loginSchema,
  passwordSchema,
  registerSchema,
  resetSchema,
  type LoginInput,
  type OAuthProvider,
  type RegisterInput,
} from "@/lib/validations/auth";

/** Yangi parol + tasdiq (validations/auth ga tegmaslik uchun shu yerda). */
const newPasswordSchema = z
  .object({ password: passwordSchema, confirmPassword: z.string() })
  .refine((d) => d.password === d.confirmPassword, { message: "auErrPwMismatch", path: ["confirmPassword"] });

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
  if (isAuthMsgKey(message)) return t(message);
  const key = authErrorKey(message);
  return key ? t(key) : message;
}

async function fail(message: string): Promise<AuthResult> {
  return { ok: false, error: await translate(message) };
}

/** Server action ichida mijoz IP'si (Vercel / proxy sarlavhalaridan). */
async function actionIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

/**
 * Auth action'lari uchun ilova darajasidagi chegara: Supabase so'rovni server IP'sidan
 * ko'radi, shuning uchun mijoz IP'si (va kerak bo'lsa email) bo'yicha shu yerda cheklaymiz.
 * Hammasi o'tsa true.
 */
async function withinLimits(checks: [key: string, limit: number, windowMs: number][]): Promise<boolean> {
  for (const [key, limit, windowMs] of checks) {
    if (!(await rateLimit(key, limit, windowMs)).ok) return false;
  }
  return true;
}

const MIN = 60_000;

export async function signUpWithEmail(input: RegisterInput): Promise<AuthResult> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "auErrInvalidData");

  const { email, password } = parsed.data;
  const ip = await actionIp();
  if (!(await withinLimits([[`auth:signup:${ip}`, 5, 10 * MIN], [`auth:signup-email:${email}`, 3, 10 * MIN]]))) {
    return fail("auErrRateLimit");
  }

  const supabase = await getSupabase();
  if (!supabase) return fail("auErrSupabaseMissing");
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
      // Email ro'yxatda bor-yo'qligini oshkor qilmaymiz (enumeration): yangi hisobdagi
      // kabi neytral "pochtangizni tekshiring" javobi.
      return { ok: true, status: "confirm-email" };
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

  // Parol terish (brute-force / credential stuffing): IP va email bo'yicha.
  const ip = await actionIp();
  if (
    !(await withinLimits([
      [`auth:login:${ip}`, 20, 5 * MIN],
      [`auth:login-email:${parsed.data.email}`, 10, 5 * MIN],
    ]))
  ) {
    return fail("auErrRateLimit");
  }

  const supabase = await getSupabase();
  if (!supabase) return fail("auErrSupabaseMissing");
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) return fail(error.message);

  const profile = await getProfile(supabase, data.user.id);
  redirect(postAuthPath(profile, safeNextPath(next)));
}

export async function signInWithOAuth(provider: OAuthProvider, next?: string | null): Promise<AuthResult> {
  if (!(await withinLimits([[`auth:oauth:${await actionIp()}`, 30, 5 * MIN]]))) return fail("auErrRateLimit");
  const supabase = await getSupabase();
  if (!supabase) return fail("auErrSupabaseMissing");
  const safeNext = safeNextPath(next) ?? "/onboarding";
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
  // Email kvotasini tugatish (umumiy Supabase SMTP) va spam: IP va manzil bo'yicha.
  if (
    !(await withinLimits([
      [`auth:reset:${await actionIp()}`, 5, 10 * MIN],
      [`auth:reset-email:${parsed.data.email}`, 3, 30 * MIN],
    ]))
  ) {
    return fail("auErrRateLimit");
  }
  const supabase = await getSupabase();
  if (!supabase) return fail("auErrSupabaseMissing");
  // Havola callback orqali /reset-password ga olib boradi (flow=recovery → tiklash cookie'si).
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${await siteUrl()}/auth/callback?flow=recovery&next=${encodeURIComponent(RESET_PASSWORD_PATH)}`,
  });
  if (error) return fail(error.message);
  return { ok: true, status: "reset-sent" };
}

/**
 * Tiklash havolasi orqali kirgan foydalanuvchi uchun yangi parolni saqlaydi.
 * Faqat callback qo'ygan tiklash cookie'si bo'lsa ishlaydi.
 */
export async function updatePassword(input: { password: string; confirmPassword: string }): Promise<AuthResult> {
  const parsed = newPasswordSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "auErrInvalidData");
  if (!(await withinLimits([[`auth:update-pw:${await actionIp()}`, 10, 10 * MIN]]))) return fail("auErrRateLimit");

  const jar = await cookies();
  if (jar.get(RECOVERY_COOKIE)?.value !== "1") return fail("auErrResetExpired");

  const supabase = await getSupabase();
  if (!supabase) return fail("auErrSupabaseMissing");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("auErrResetExpired");

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (/should be different|same_password/i.test(error.message)) return fail("auErrSamePassword");
    return fail(error.message);
  }
  jar.delete(RECOVERY_COOKIE);
  const profile = await getProfile(supabase, user.id);
  redirect(postAuthPath(profile));
}

export async function signOut(): Promise<void> {
  const supabase = await getSupabase();
  if (supabase) await supabase.auth.signOut();
  redirect("/");
}
