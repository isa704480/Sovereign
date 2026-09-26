import { Navbar } from "@/components/landing/Navbar";
import { Hero } from "@/components/landing/Hero";
import { ModelCompare } from "@/components/landing/ModelCompare";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Features } from "@/components/landing/Features";
import { Audience } from "@/components/landing/Audience";
import { ModelShowcase } from "@/components/landing/ModelShowcase";
import { PrivacyBand } from "@/components/landing/PrivacyBand";
import { Pricing } from "@/components/landing/Pricing";
import { Roadmap } from "@/components/landing/Roadmap";
import { About } from "@/components/landing/About";
import { Contact } from "@/components/landing/Contact";
import { Footer } from "@/components/landing/Footer";
import {
  APP_URL,
  CONTACT_EMAIL,
  FOUNDER_NAME,
  LEGAL_ENTITY,
  LOCATION_SCHEMA,
} from "@/components/landing/company";
import { PLANS, formatPrice } from "@/config/plans";
import { translate } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://soveregn.xyz").replace(/\/$/, "");

/** Organization + SoftwareApplication (narxlar config/plans.ts dan). */
function jsonLd() {
  const orgId = `${SITE_URL}/#organization`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": orgId,
        name: "SOVEREIGN AI",
        ...(LEGAL_ENTITY ? { legalName: LEGAL_ENTITY } : {}),
        url: SITE_URL,
        logo: `${SITE_URL}/logo.svg`,
        email: CONTACT_EMAIL,
        founder: { "@type": "Person", name: FOUNDER_NAME },
        address: {
          "@type": "PostalAddress",
          addressLocality: LOCATION_SCHEMA.city,
          addressCountry: LOCATION_SCHEMA.countryCode,
        },
        contactPoint: {
          "@type": "ContactPoint",
          email: CONTACT_EMAIL,
          contactType: "customer support",
          availableLanguage: ["Uzbek", "Russian", "English"],
        },
      },
      {
        "@type": "SoftwareApplication",
        name: "SOVEREIGN AI",
        url: APP_URL,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web, Windows, macOS, Linux",
        description: translate("en", "uxMetaDescription"),
        inLanguage: ["uz", "ru", "en"],
        publisher: { "@id": orgId },
        offers: PLANS.map((p) => ({
          "@type": "Offer",
          name: `${p.name} (monthly)`,
          price: formatPrice(p.price),
          priceCurrency: "USD",
          category: p.price === 0 ? "free" : "subscription",
          url: `${SITE_URL}/#pricing`,
        })),
      },
    ],
  };
}

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
    <main className="flex-1 overflow-x-clip">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd()).replace(/</g, "\\u003c") }}
      />
      <Navbar signedIn={signedIn} />
      <Hero signedIn={signedIn} />
      <ModelCompare />
      <HowItWorks />
      <Features />
      <Audience />
      <ModelShowcase />
      <PrivacyBand />
      <Pricing />
      <Roadmap />
      <About />
      <Contact />
      <Footer />
    </main>
  );
}
