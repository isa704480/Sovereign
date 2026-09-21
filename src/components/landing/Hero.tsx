"use client";

import Link from "next/link";
import { ArrowRight, Lock } from "lucide-react";
import { motion } from "motion/react";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { MagneticButton } from "@/components/motion/MagneticButton";
import { useT } from "@/store/chat";

/* Abstrakt AI belgilari (brend logolari emas) — portail uslubidagi xira "yulduzlar". */
const GLYPHS = [
  <path key="a" d="M12 2v20M2 12h20M5 5l14 14M19 5L5 19" />,
  <g key="b"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3.5" /></g>,
  <path key="c" d="M12 2l2.6 6.9L22 9.3l-5 4.7 1.4 7L12 17.8 5.6 21l1.4-7-5-4.7 7.4-.4z" />,
  <path key="d" d="M12 3c5 0 9 4 9 9s-4 9-9 9M12 3c-3 3-3 15 0 18" />,
  <g key="e"><path d="M3 12h18" /><path d="M7 6l-4 6 4 6M17 6l4 6-4 6" /></g>,
  <path key="f" d="M12 2l9 5v10l-9 5-9-5V7z" />,
  <g key="g"><circle cx="12" cy="12" r="2" /><path d="M12 3v4M12 17v4M3 12h4M17 12h4" /></g>,
  <path key="h" d="M4 16c3-8 13-8 16 0M4 8c3 8 13 8 16 0" />,
];

const MARKS = [
  { x: "10%", y: "22%", s: 30, g: 0, d: 0 }, { x: "22%", y: "58%", s: 40, g: 1, d: 0.6 },
  { x: "8%", y: "78%", s: 26, g: 6, d: 1.1 }, { x: "30%", y: "82%", s: 22, g: 2, d: 0.3 },
  { x: "17%", y: "40%", s: 24, g: 7, d: 0.9 }, { x: "34%", y: "16%", s: 20, g: 3, d: 1.4 },
  { x: "62%", y: "18%", s: 22, g: 2, d: 0.5 }, { x: "78%", y: "28%", s: 34, g: 0, d: 1.0 },
  { x: "88%", y: "52%", s: 42, g: 4, d: 0.2 }, { x: "72%", y: "72%", s: 26, g: 5, d: 1.3 },
  { x: "90%", y: "80%", s: 22, g: 6, d: 0.7 }, { x: "82%", y: "14%", s: 18, g: 7, d: 1.6 },
  { x: "58%", y: "84%", s: 24, g: 1, d: 0.4 }, { x: "45%", y: "10%", s: 18, g: 5, d: 1.2 },
];

export function Hero({ signedIn = false }: { signedIn?: boolean }) {
  const t = useT();

  return (
    <section className="relative isolate flex min-h-svh flex-col items-center justify-center overflow-hidden px-5 py-28 text-center">
      {/* fon */}
      <div className="absolute inset-0 -z-30 bg-bg-base" />
      <div
        className="absolute inset-0 -z-20"
        style={{ background: "radial-gradient(55% 45% at 50% 42%, rgba(91,80,240,0.16) 0%, transparent 70%)" }}
      />
      <div className="grid-fade absolute inset-0 -z-10 opacity-60" />

      {/* suzuvchi AI belgilari */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        {MARKS.map((m, i) => (
          <motion.div
            key={i}
            className="absolute"
            style={{ left: m.x, top: m.y }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, y: [0, -10, 0] }}
            transition={{ opacity: { duration: 1, delay: 0.2 + m.d * 0.2 }, y: { duration: 6 + (i % 4), repeat: Infinity, ease: "easeInOut", delay: m.d } }}
          >
            <svg width={m.s} height={m.s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round" className="text-text-primary/[0.07]">
              {GLYPHS[m.g]}
            </svg>
          </motion.div>
        ))}
      </div>

      <Stagger stagger={0.09} delay={0.1} className="relative flex max-w-3xl flex-col items-center">
        <StaggerItem>
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-white/[0.03] px-3.5 py-1.5 text-xs font-medium tracking-wide text-text-secondary">
            <span className="size-1.5 rounded-full bg-primary shadow-glow" />
            1700+ model · bitta hisob · shifrlangan xotira
          </span>
        </StaggerItem>

        <StaggerItem>
          <h1 className="font-display mt-7 text-5xl font-extrabold leading-[1.03] tracking-tight text-text-primary md:text-7xl">
            Barcha AI.
            <br />
            <span className="text-gradient-brand">Bitta oyna.</span>
          </h1>
        </StaggerItem>

        <StaggerItem>
          <p className="mt-7 max-w-xl text-lg leading-relaxed text-text-secondary">
            Claude, GPT, Gemini, DeepSeek — beshta ilovaga sakramang. Modelni bir zumda
            almashtiring; suhbat hech narsani unutmaydi. Xotira faqat sizda — shifrlangan.
          </p>
        </StaggerItem>

        <StaggerItem>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <MagneticButton>
              <Link
                href={signedIn ? "/app" : "/register"}
                className="group inline-flex h-12 items-center gap-2 rounded-full bg-text-primary px-7 text-base font-semibold text-bg-base transition-transform hover:-translate-y-0.5"
              >
                {signedIn ? t("backToChat") : "Bepul boshlash"}
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </MagneticButton>
            <a
              href="#features"
              className="inline-flex h-12 items-center gap-1.5 rounded-full border border-border px-6 text-base font-medium text-text-secondary transition-colors hover:border-white/20 hover:text-text-primary"
            >
              Nega SOVEREIGN?
            </a>
          </div>
        </StaggerItem>

        <StaggerItem>
          <div className="mt-7 flex items-center gap-2 text-sm text-text-muted">
            <Lock className="size-3.5 text-success" /> Bank kartasi talab qilinmaydi
          </div>
        </StaggerItem>
      </Stagger>
    </section>
  );
}
