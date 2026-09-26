"use client";

import { motion } from "motion/react";
import { Layers, MonitorSmartphone, UserPlus } from "lucide-react";
import { fmt, type TKey } from "@/lib/i18n";
import { fadeUp, staggerContainer } from "@/lib/motion";
import { useT } from "@/store/chat";
import { SectionHeading } from "./SectionHeading";

const STEPS: { icon: typeof UserPlus; title: TKey; body: TKey }[] = [
  { icon: UserPlus, title: "p4dHowS1Title", body: "p4dHowS1Body" },
  { icon: Layers, title: "p4dHowS2Title", body: "p4dHowS2Body" },
  { icon: MonitorSmartphone, title: "p4dHowS3Title", body: "p4dHowS3Body" },
];

export function HowItWorks() {
  const t = useT();
  return (
    <section
      id="how"
      aria-labelledby="how-title"
      className="relative mx-auto max-w-6xl scroll-mt-24 px-5 py-24 md:px-8 md:py-28"
    >
      <SectionHeading id="how-title" eyebrow={t("p4dNavHow")} title={t("p4dHowTitle")} />

      <div className="relative mt-14">
        {/* bosqichlarni bog'lovchi chiziq (desktop) */}
        <div
          aria-hidden="true"
          className="absolute left-[16.66%] right-[16.66%] top-[3.25rem] hidden h-px bg-gradient-to-r from-transparent via-[var(--border-accent)] to-transparent md:block"
        />
        <motion.ol
          variants={staggerContainer(0.08)}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
          className="relative grid grid-cols-1 gap-3 md:grid-cols-3"
        >
          {STEPS.map((s, i) => (
            <motion.li
              key={s.title}
              variants={fadeUp}
              className="flex h-full flex-col items-start rounded-2xl border border-border bg-white/[0.015] p-6 transition-colors duration-300 hover:border-white/15 md:items-center md:text-center"
            >
              <div className="relative flex size-14 items-center justify-center rounded-2xl border border-white/10 bg-bg-elevated shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                <s.icon className="size-5 text-primary-soft" strokeWidth={1.7} aria-hidden="true" />
                <span
                  aria-hidden="true"
                  className="absolute -right-2 -top-2 grid size-6 place-items-center rounded-full bg-primary text-[11px] font-bold text-white"
                >
                  {i + 1}
                </span>
              </div>
              <span className="mt-5 font-mono text-[11px] uppercase tracking-wider text-text-muted">
                {fmt(t("p4dStep"), { n: i + 1 })}
              </span>
              <h3 className="font-display mt-1 text-lg font-bold text-text-primary">{t(s.title)}</h3>
              <p className="mt-2.5 text-sm leading-relaxed text-text-secondary">{t(s.body)}</p>
            </motion.li>
          ))}
        </motion.ol>
      </div>
    </section>
  );
}
