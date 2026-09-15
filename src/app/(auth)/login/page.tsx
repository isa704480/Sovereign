import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/AuthCard";
import { LoginForm } from "@/components/auth/LoginForm";
import { TrustBadges } from "@/components/auth/TrustBadges";

export const metadata: Metadata = { title: "Kirish" };

export default async function LoginPage(props: PageProps<"/login">) {
  const sp = await props.searchParams;
  const next = typeof sp.next === "string" ? sp.next : null;
  const error = typeof sp.error === "string" ? sp.error : null;

  return (
    <>
      <AuthCard
        title="Xush kelibsiz"
        subtitle="Hisobingizga kiring va davom eting"
        footer={
          <>
            Hisobingiz yo&apos;qmi?{" "}
            <Link href="/register" className="font-medium text-primary-soft underline-offset-4 hover:underline">
              Ro&apos;yxatdan o&apos;ting →
            </Link>
          </>
        }
      >
        <LoginForm next={next} initialError={error} />
      </AuthCard>
      <TrustBadges />
    </>
  );
}
