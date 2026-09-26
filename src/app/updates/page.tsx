import type { Metadata } from "next";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";
import { UpdatesList } from "./UpdatesList";

/**
 * Ommaviy "Mahsulot yangiliklari" sahifasi (soveregn.xyz/updates). Statik:
 * matn src/content/updates.ts dan; til klientda (LegalDoc kabi) almashadi.
 */
export const metadata: Metadata = {
  title: "Product updates",
  description: "What's new in SOVEREIGN AI — new features, improvements and fixes.",
  alternates: { canonical: "/updates" },
  openGraph: {
    title: "SOVEREIGN — Product updates",
    description: "What's new in SOVEREIGN AI — new features, improvements and fixes.",
  },
};

export default function UpdatesPage() {
  return (
    <main className="flex-1">
      <Navbar signedIn={false} />
      <UpdatesList />
      <Footer />
    </main>
  );
}
