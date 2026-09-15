"use client";

import { BrainCircuit, ShieldCheck, BadgeCheck } from "lucide-react";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { FadeIn } from "@/components/motion/FadeIn";

const FEATURES = [
  {
    icon: ShieldCheck,
    color: "#5B50F0",
    title: "Zero-Trust Maxfiylik",
    body: "Blind Prompting — AI kompaniyalari sizning haqiqiy ma'lumotingizni ko'rmaydi. Ismlar, raqamlar, kompaniyalar so'rov chiqishidan oldin maskalanadi.",
    tag: "Blind Prompting",
  },
  {
    icon: BrainCircuit,
    color: "#20D4E8",
    title: "Umrbod Xotira",
    body: "AI sizni yillar davomida o'rganadi. Bu bilim faqat sizga tegishli — shifrlangan, eksport qilinadigan, istalgan vaqtda o'chiriladigan.",
    tag: "Memory Graph",
  },
  {
    icon: BadgeCheck,
    color: "#34D399",
    title: "Tekshirilgan Javoblar",
    body: "Neural-Symbolic Engine har bir javobni faktlar bazasi va internet manbalariga solishtiradi. Xato — belgilanadi, to'g'ri — tasdiqlanadi.",
    tag: "Verified",
  },
];

export function Features() {
  return (
    <section id="features" className="relative mx-auto max-w-6xl px-5 pb-24 pt-12 md:px-8 md:pb-32 md:pt-16">
      <FadeIn inView>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary-soft">Nima uchun SOVEREIGN</p>
        <h2 className="font-display mt-3 max-w-2xl text-3xl font-extrabold text-text-primary md:text-4xl">
          AI kuchi. Sizning nazoratingiz.
        </h2>
      </FadeIn>

      <Stagger inView stagger={0.12} className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-3">
        {FEATURES.map((f) => (
          <StaggerItem key={f.title}>
            <article className="group relative h-full overflow-hidden rounded-2xl border border-border bg-bg-elevated/70 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-[var(--border-accent)] hover:shadow-lg">
              <div
                className="pointer-events-none absolute -right-16 -top-16 size-40 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-40"
                style={{ background: f.color }}
              />
              <div
                className="flex size-11 items-center justify-center rounded-xl"
                style={{ background: `${f.color}1f`, color: f.color }}
              >
                <f.icon className="size-5" />
              </div>
              <span className="mt-5 inline-block font-mono text-[11px] uppercase tracking-wider text-text-muted">
                {f.tag}
              </span>
              <h3 className="font-display mt-1.5 text-xl font-bold text-text-primary">{f.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-text-secondary">{f.body}</p>
            </article>
          </StaggerItem>
        ))}
      </Stagger>
    </section>
  );
}
