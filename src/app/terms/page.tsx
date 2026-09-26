import type { Metadata } from "next";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";
import { LegalDoc } from "@/components/legal/LegalDoc";
import { LEGAL } from "@/lib/locales/legal";

// Statik (en — <html lang="en"> bilan bir manba, CDN keshi saqlanadi); matn klientda
// tanlangan tilga o'tadi (LegalDoc). og:title/og:url ildiz layout'dan shu sahifaga moslanadi.
export const metadata: Metadata = {
  title: LEGAL.terms.en.title,
  description: LEGAL.terms.en.metaDescription,
};

export default function TermsPage() {
  return (
    <main className="flex-1">
      <Navbar />
      <LegalDoc doc="terms" />
      <Footer />
    </main>
  );
}
