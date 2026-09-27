"use client";

import { motion } from "motion/react";
import { Layers, MonitorSmartphone, UserPlus } from "lucide-react";
import { fmt, type TKey } from "@/lib/i18n";
import { staggerContainer } from "@/lib/motion";
import { reveal } from "@/components/motion/Stagger";
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

      {/* Uch bosqich — bitta panel, hairline bilan bo'lingan. */}
      <div className="relative mt-14">
        <motion.ol
          variants={staggerContainer(0.08)}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
          className="relative grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-3"
        >
          {STEPS.map((s, i) => (
            <motion.li
              key={s.title}
              variants={reveal}
              className="flex h-full flex-col items-start bg-bg-base p-6 md:items-center md:p-8 md:text-center"
            >
              <div className="flex size-12 items-center justify-center rounded-lg border border-border bg-bg-elevated">
                <s.icon className="size-5 text-text-secondary" strokeWidth={1.7} aria-hidden="true" />
              </div>
              <span className="mt-5 font-mono text-xs uppercase tracking-wider text-text-muted">
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
