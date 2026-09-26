import type { Metadata } from "next";
import { AuthCard, AuthFooterLink } from "@/components/auth/AuthCard";
import { LoginForm } from "@/components/auth/LoginForm";
import { TrustBadges } from "@/components/auth/TrustBadges";
import { isAuthMsgKey } from "@/components/auth/messages";
import { safeNextPath } from "@/components/auth/next-path";
import { getServerT } from "@/lib/i18n-server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return { title: t("login") };
}

export default async function LoginPage(props: PageProps<"/login">) {
  const sp = await props.searchParams;
  // Open-redirect: faqat xavfsiz ichki yo'l keyingi bosqichga uzatiladi.
  const next = safeNextPath(sp.next);
  // Content spoofing: ?error= faqat ma'lum lug'at kaliti bo'lsa ko'rsatiladi,
  // ixtiyoriy matn umumiy "sessiya yaratilmadi" xabariga almashtiriladi.
  const rawError = typeof sp.error === "string" ? sp.error : null;
  const error = rawError ? (isAuthMsgKey(rawError) ? rawError : "auErrNoSession") : null;

  return (
    <>
      <AuthCard
        title="auWelcome"
        subtitle="auLoginSubtitle"
        footer={<AuthFooterLink prompt="auNoAccount" link="auSignUpLink" href="/register" />}
      >
        <LoginForm next={next} initialError={error} />
      </AuthCard>
      <TrustBadges />
    </>
  );
}
