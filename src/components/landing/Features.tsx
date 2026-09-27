"use client";

import { BadgeCheck, BrainCircuit, ShieldCheck, Sparkles } from "lucide-react";
import { FadeIn } from "@/components/motion/FadeIn";
import type { TKey } from "@/lib/i18n";
import { useT } from "@/store/chat";
import { SectionHeading } from "./SectionHeading";

/** tag — texnik atama (tarjima qilinmaydi) yoki tarjima kaliti. */
const FEATURES: { icon: typeof ShieldCheck; tag: string; tagKey?: TKey; title: TKey; body: TKey }[] = [
  { icon: ShieldCheck, tag: "Blind Prompting", title: "ldFeat1Title", body: "ldFeat1Body" },
  { icon: BrainCircuit, tag: "Memory", tagKey: "ldFeat2Tag", title: "ldFeat2Title", body: "ldFeat2Body" },
  { icon: BadgeCheck, tag: "Verified", tagKey: "ldFeat3Tag", title: "ldFeat3Title", body: "ldFeat3Body" },
  { icon: Sparkles, tag: "Auto", title: "ldFeat5Title", body: "ldFeat5Body" },
];

/** To'rt imkoniyat — BITTA panel, hairline bilan bo'lingan kataklar (alohida kartalar emas). */
export function Features() {
  const t = useT();
  return (
    <section
      id="features"
      aria-labelledby="features-title"
      className="relative mx-auto max-w-6xl scroll-mt-24 px-5 py-24 md:px-8 md:py-28"
    >
      <SectionHeading
        id="features-title"
        eyebrow={t("ldFeatEyebrow")}
        title={`${t("ldFeatTitle1")} ${t("ldFeatTitle2")}`}
      />

      <FadeIn inView className="mt-14">
        <ul className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2">
          {FEATURES.map((f) => (
            <li key={f.title} className="flex flex-col bg-bg-base p-6 md:p-8">
              <f.icon className="size-5 text-text-secondary" strokeWidth={1.6} aria-hidden="true" />
              <span className="mt-5 font-mono text-xs uppercase tracking-wider text-text-muted">
                {f.tagKey ? t(f.tagKey) : f.tag}
              </span>
              <h3 className="font-display mt-1 text-lg font-bold text-text-primary">{t(f.title)}</h3>
              <p className="mt-2.5 max-w-md text-sm leading-relaxed text-text-secondary">{t(f.body)}</p>
            </li>
          ))}
        </ul>
      </FadeIn>
    </section>
  );
}
