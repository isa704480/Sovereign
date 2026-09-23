import type { Metadata } from "next";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";
import { LegalDoc } from "@/components/legal/LegalDoc";
import { getServerLang } from "@/lib/i18n-server";
import { LEGAL } from "@/lib/locales/legal";

export async function generateMetadata(): Promise<Metadata> {
  const c = LEGAL.privacy[await getServerLang()];
  return {
    title: c.title,
    description: c.metaDescription,
  };
}

export default function PrivacyPage() {
  return (
    <main className="flex-1">
      <Navbar signedIn={false} />
      <LegalDoc doc="privacy" />
      <Footer />
    </main>
  );
}
