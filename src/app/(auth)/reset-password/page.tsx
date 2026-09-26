import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/AuthCard";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { RECOVERY_COOKIE } from "@/components/auth/recovery";
import { getServerT } from "@/lib/i18n-server";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return { title: t("auResetMetaTitle"), robots: { index: false } };
}

/**
 * Parolni tiklash havolasidan keyingi sahifa: callback sessiya ochib, tiklash
 * cookie'sini qo'ygan bo'lishi shart. Aks holda — "havola eskirgan" xabari bilan /login.
 */
export default async function ResetPasswordPage() {
  const recovery = (await cookies()).get(RECOVERY_COOKIE)?.value === "1";
  let signedIn = false;
  if (recovery) {
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      signedIn = !!user;
    } catch {
      signedIn = false;
    }
  }
  if (!recovery || !signedIn) redirect("/login?error=auErrResetExpired");

  return (
    <AuthCard title="auResetTitle" subtitle="auResetSubtitle">
      <ResetPasswordForm />
    </AuthCard>
  );
}
