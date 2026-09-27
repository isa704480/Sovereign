import type { Metadata } from "next";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";
import { CompareView } from "./CompareView";

/**
 * Ommaviy taqqoslash sahifasi (soveregn.xyz/compare): DeepSeek / Qwen va Claude.
 * STATIK — raqamlar build vaqtida src/data/model-compare.json dan
 * (scripts/eval/run.mjs o'lchaydi, `public` bo'limi manbali qo'lda to'ldiriladi);
 * til klientda (UpdatesList kabi) almashadi.
 */
export const metadata: Metadata = {
  title: "DeepSeek & Qwen vs Claude — measured comparison",
  description:
    "How close DeepSeek and Qwen are to Claude: our own auto-graded eval on 40 tasks (mostly Russian) plus cited public benchmarks, with methodology and limitations.",
  alternates: { canonical: "/compare" },
  openGraph: {
    title: "SOVEREIGN — DeepSeek & Qwen vs Claude",
    description: "Measured results on 40 auto-graded tasks and cited public benchmarks — including where Claude is stronger.",
    url: "/compare",
    siteName: "SOVEREIGN",
    type: "website",
  },
};

export default function ComparePage() {
  return (
    <main className="flex-1">
      <Navbar />
      <CompareView />
      <Footer />
    </main>
  );
}
