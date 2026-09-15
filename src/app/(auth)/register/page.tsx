import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/AuthCard";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { TrustBadges } from "@/components/auth/TrustBadges";

export const metadata: Metadata = { title: "Hisob yaratish" };

export default function RegisterPage() {
  return (
    <>
      <AuthCard
        title="Hisobingizni yarating"
        subtitle="30 soniyada tayyor"
        footer={
          <>
            Hisobingiz bormi?{" "}
            <Link href="/login" className="font-medium text-primary-soft underline-offset-4 hover:underline">
              Kiring →
            </Link>
          </>
        }
      >
        <RegisterForm />
      </AuthCard>
      <TrustBadges />
    </>
  );
}
