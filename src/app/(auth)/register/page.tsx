import type { Metadata } from "next";
import { AuthCard, AuthFooterLink } from "@/components/auth/AuthCard";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { TrustBadges } from "@/components/auth/TrustBadges";
import { getServerT } from "@/lib/i18n-server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return { title: t("auRegisterMetaTitle") };
}

export default function RegisterPage() {
  return (
    <>
      <AuthCard
        title="auRegisterTitle"
        subtitle="auRegisterSubtitle"
        footer={<AuthFooterLink prompt="auHaveAccount" link="auSignInLink" href="/login" />}
      >
        <RegisterForm />
      </AuthCard>
      <TrustBadges />
    </>
  );
}
