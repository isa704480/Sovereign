"use client";

import { ShieldCheck, BrainCircuit, BadgeCheck, Zap, Layers, Lock } from "lucide-react";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { FadeIn } from "@/components/motion/FadeIn";

const FEATURES = [
  { icon: ShieldCheck, tag: "Blind Prompting", title: "Zero-Trust maxfiylik", body: "AI kompaniyalari haqiqiy ma'lumotingizni ko'rmaydi — ism, raqam, kompaniya so'rovdan oldin maskalanadi." },
  { icon: BrainCircuit, tag: "Memory Graph", title: "Umrbod xotira", body: "AI sizni yillar davomida o'rganadi. Bilim faqat sizda — shifrlangan, eksport qilinadigan, o'chiriladigan." },
  { icon: BadgeCheck, tag: "Verified", title: "Tekshirilgan javoblar", body: "Har javob faktlar bazasi va internet manbalariga solishtiriladi. Xato belgilanadi, to'g'ri tasdiqlanadi." },
  { icon: Layers, tag: "1700+ model", title: "Barchasi bitta oynada", body: "Claude, GPT, Gemini, DeepSeek — modelni bir zumda almashtiring, suhbat davom etadi." },
  { icon: Zap, tag: "Auto", title: "O'zi eng yaxshisini tanlaydi", body: "SOVEREIGN Auto vazifaga qarab eng mos va tejamkor modelni o'zi yo'naltiradi." },
  { icon: Lock, tag: "AES-256-GCM", title: "Faqat sizning qurilmangizda", body: "Xotira kaliti qurilmangizda ochiladi. Serverda ham shifrlangan holda turadi." },
];

export function Features() {
  return (
    <section id="features" className="relative mx-auto max-w-6xl px-5 py-24 md:px-8 md:py-28">
      <FadeIn inView>
        <p className="text-center text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Nima uchun SOVEREIGN</p>
        <h2 className="font-display mx-auto mt-3 max-w-2xl text-center text-3xl font-extrabold tracking-tight text-text-primary md:text-5xl">
          AI kuchi. <span className="text-gradient-brand">Sizning nazoratingiz.</span>
        </h2>
      </FadeIn>

      <Stagger inView stagger={0.07} className="mt-14 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <StaggerItem key={f.title}>
            <article className="group h-full rounded-2xl border border-border bg-white/[0.015] p-6 transition-colors duration-300 hover:border-white/15">
              <div className="flex size-10 items-center justify-center rounded-xl border border-border bg-white/[0.03] text-text-secondary transition-colors group-hover:text-primary-soft">
                <f.icon className="size-[18px]" strokeWidth={1.6} />
              </div>
              <span className="mt-5 inline-block font-mono text-[11px] uppercase tracking-wider text-text-muted">{f.tag}</span>
              <h3 className="font-display mt-1 text-lg font-bold text-text-primary">{f.title}</h3>
              <p className="mt-2.5 text-sm leading-relaxed text-text-secondary">{f.body}</p>
            </article>
          </StaggerItem>
        ))}
      </Stagger>
    </section>
  );
}
