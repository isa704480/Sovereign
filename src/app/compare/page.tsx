import type { Metadata } from "next";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";
import { CompareView } from "./CompareView";
import MODEL_COMPARE from "@/data/model-compare.json";

// Sarlavha faqat haqiqatan o'lchangan modellarni aytadi (DeepSeek hali o'lchanmagan).
const measured = MODEL_COMPARE.models.filter((m) => m.measured);
const reference = measured.find((m) => m.reference)?.label ?? "Claude";
const challengers = measured.filter((m) => !m.reference && m.family !== "claude").map((m) => m.label).join(", ") || "—";
const tasks = MODEL_COMPARE.methodology.tasks;
const runs = MODEL_COMPARE.methodology.runsPerTask;

/**
 * Ommaviy taqqoslash sahifasi (soveregn.xyz/compare): o'lchangan modellar (hozircha Qwen) va Claude.
 * STATIK — raqamlar build vaqtida src/data/model-compare.json dan
 * (scripts/eval/run.mjs o'lchaydi, `public` bo'limi manbali qo'lda to'ldiriladi);
 * til klientda (UpdatesList kabi) almashadi.
 */
export const metadata: Metadata = {
  title: `${challengers} vs ${reference} — measured on ${tasks} tasks`,
  description: `Our own auto-graded eval of ${challengers} against ${reference} on ${tasks} tasks (mostly Russian, ${runs} run per task) plus cited public benchmarks, with methodology and limitations. Other models are listed as not measured yet.`,
  alternates: { canonical: "/compare" },
  openGraph: {
    title: `SOVEREIGN — ${challengers} vs ${reference}`,
    description: `Measured on ${tasks} auto-graded tasks (${runs} run per task) and cited public benchmarks — including where Claude is stronger.`,
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
