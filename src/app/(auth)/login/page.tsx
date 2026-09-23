import type { Metadata } from "next";
import { AuthCard, AuthFooterLink } from "@/components/auth/AuthCard";
import { LoginForm } from "@/components/auth/LoginForm";
import { TrustBadges } from "@/components/auth/TrustBadges";
import { getServerT } from "@/lib/i18n-server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return { title: t("login") };
}

export default async function LoginPage(props: PageProps<"/login">) {
  const sp = await props.searchParams;
  const next = typeof sp.next === "string" ? sp.next : null;
  const error = typeof sp.error === "string" ? sp.error : null;

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
