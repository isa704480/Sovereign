"use client";

import { ShieldCheck, BrainCircuit, BadgeCheck, Zap, Layers, Lock } from "lucide-react";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { FadeIn } from "@/components/motion/FadeIn";
import type { TKey } from "@/lib/i18n";
import { useT } from "@/store/chat";

/** tag — texnik atama (tarjima qilinmaydi) yoki tarjima kaliti. */
const FEATURES: { icon: typeof ShieldCheck; tag: string; tagKey?: TKey; title: TKey; body: TKey }[] = [
  { icon: ShieldCheck, tag: "Blind Prompting", title: "ldFeat1Title", body: "ldFeat1Body" },
  { icon: BrainCircuit, tag: "Memory Graph", title: "ldFeat2Title", body: "ldFeat2Body" },
  { icon: BadgeCheck, tag: "Verified", title: "ldFeat3Title", body: "ldFeat3Body" },
  { icon: Layers, tag: "1700+ model", tagKey: "ldFeat4Tag", title: "ldFeat4Title", body: "ldFeat4Body" },
  { icon: Zap, tag: "Auto", title: "ldFeat5Title", body: "ldFeat5Body" },
  { icon: Lock, tag: "Blind Prompting", title: "ldFeat6Title", body: "ldFeat6Body" },
];

export function Features() {
  const t = useT();
  return (
    <section
      id="features"
      aria-labelledby="features-title"
      className="relative mx-auto max-w-6xl scroll-mt-24 px-5 py-24 md:px-8 md:py-28"
    >
      <FadeIn inView>
        <p className="text-center text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">{t("ldFeatEyebrow")}</p>
        <h2 id="features-title" className="font-display mx-auto mt-3 max-w-2xl text-balance text-center text-[1.85rem] font-extrabold [overflow-wrap:anywhere] sm:text-3xl tracking-tight text-text-primary md:text-5xl">
          {t("ldFeatTitle1")} <span className="text-gradient-brand">{t("ldFeatTitle2")}</span>
        </h2>
      </FadeIn>

      <Stagger inView stagger={0.07} className="mt-14 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <StaggerItem key={f.title}>
            <article className="group h-full rounded-2xl border border-border bg-white/[0.015] p-6 transition-colors duration-300 hover:border-white/15">
              <div className="flex size-10 items-center justify-center rounded-xl border border-border bg-white/[0.03] text-text-secondary transition-colors group-hover:text-primary-soft">
                <f.icon className="size-[18px]" strokeWidth={1.6} />
              </div>
              <span className="mt-5 inline-block font-mono text-[11px] uppercase tracking-wider text-text-muted">
                {f.tagKey ? t(f.tagKey) : f.tag}
              </span>
              <h3 className="font-display mt-1 text-lg font-bold text-text-primary">{t(f.title)}</h3>
              <p className="mt-2.5 text-sm leading-relaxed text-text-secondary">{t(f.body)}</p>
            </article>
          </StaggerItem>
        ))}
      </Stagger>
    </section>
  );
}
