import { Navbar } from "@/components/landing/Navbar";
import { Hero } from "@/components/landing/Hero";
import { ModelCompare } from "@/components/landing/ModelCompare";
import { Features } from "@/components/landing/Features";
import { ModelShowcase } from "@/components/landing/ModelShowcase";
import { PrivacyBand } from "@/components/landing/PrivacyBand";
import { Pricing } from "@/components/landing/Pricing";
import { Footer } from "@/components/landing/Footer";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

async function isSignedIn() {
  if (!isSupabaseConfigured()) return false;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return !!user;
  } catch {
    return false;
  }
}

export default async function HomePage() {
  const signedIn = await isSignedIn();
  return (
    <main className="flex-1">
      <Navbar signedIn={signedIn} />
      <Hero signedIn={signedIn} />
      <ModelCompare />
      <Features />
      <ModelShowcase />
      <PrivacyBand />
      <Pricing />
      <Footer />
    </main>
  );
}
