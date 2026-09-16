import { Navbar } from "@/components/landing/Navbar";
import { Hero } from "@/components/landing/Hero";
import { Features } from "@/components/landing/Features";
import { ModelShowcase } from "@/components/landing/ModelShowcase";
import { PrivacyBand } from "@/components/landing/PrivacyBand";
import { Pricing } from "@/components/landing/Pricing";
import { Footer } from "@/components/landing/Footer";

export default function HomePage() {
  return (
    <main className="flex-1">
      <Navbar />
      <Hero />
      <Features />
      <ModelShowcase />
      <PrivacyBand />
      <Pricing />
      <Footer />
    </main>
  );
}
