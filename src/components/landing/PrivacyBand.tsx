"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { motion } from "motion/react";
import { FadeIn } from "@/components/motion/FadeIn";
import { MagneticButton } from "@/components/motion/MagneticButton";

const STEPS = [
  { from: "Asilbek Yusupov, FayzInc, $50 000 byudjet", to: "[PERSON_A], [ORG_A], [VAL_1] byudjet" },
];

export function PrivacyBand() {
  return (
    <section id="privacy" className="relative mx-auto max-w-6xl px-5 pb-28 md:px-8">
      <FadeIn inView>
        <div className="border-gradient-brand relative overflow-hidden rounded-3xl bg-bg-elevated/80 p-8 md:p-12">
          <div className="noise absolute inset-0" />
          <div className="relative grid grid-cols-1 gap-10 lg:grid-cols-[1.1fr_1fr] lg:items-center">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary-soft">Blind Prompting</p>
              <h2 className="font-display mt-3 text-3xl font-extrabold text-text-primary md:text-4xl">
                AI sizning so&apos;rovingizni ko&apos;radi.
                <br />
                Sizni — hech qachon.
              </h2>
              <p className="mt-4 max-w-lg text-text-secondary">
                Shaxsiy ma&apos;lumotlar brauzeringizdan chiqishidan oldin tokenlarga almashtiriladi. Javob qaytgach,
                tokenlar faqat sizning qurilmangizda qayta tiklanadi.
              </p>
              <MagneticButton className="mt-8 inline-block">
                <Link
                  href="/register"
                  className="group inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-white shadow-glow transition-colors hover:bg-primary-dark"
                >
                  Hisob yaratish
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </MagneticButton>
            </div>

            <div className="space-y-3 font-mono text-[13px]">
              {STEPS.map((s) => (
                <div key={s.from} className="space-y-3">
                  <div className="rounded-xl border border-border bg-bg-base/70 p-4">
                    <div className="mb-1.5 text-[10px] uppercase tracking-wider text-text-muted">Siz yozdingiz</div>
                    <div className="text-text-primary">{s.from}</div>
                  </div>
                  <div className="flex items-center justify-center">
                    <motion.div
                      animate={{ y: [0, 4, 0] }}
                      transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
                      className="rounded-full border border-[var(--border-accent)] bg-primary/10 px-3 py-1 text-[11px] text-primary-soft"
                    >
                      ↓ tokenizatsiya · &lt; 50ms
                    </motion.div>
                  </div>
                  <div className="rounded-xl border border-[var(--border-accent)] bg-primary/5 p-4">
                    <div className="mb-1.5 text-[10px] uppercase tracking-wider text-primary-soft">AI ko&apos;radi</div>
                    <div className="text-text-primary">{s.to}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </FadeIn>
    </section>
  );
}
