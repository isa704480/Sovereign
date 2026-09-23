"use client";

import { motion, useMotionTemplate, useMotionValue, useSpring } from "motion/react";
import type { MouseEvent } from "react";
import { SHOWCASE_MODELS, type SovereignModel } from "@/config/models";
import { FadeIn } from "@/components/motion/FadeIn";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { pick } from "@/lib/i18n";
import { LD_CAPABILITY_LABEL, LD_MODEL_TEXT } from "@/lib/locales/landing";
import { modelProvider } from "@/lib/locales/chat-data";
import { useLang, useT } from "@/store/chat";

function ModelCard({ model }: { model: SovereignModel }) {
  const t = useT();
  const lang = useLang();
  const description = LD_MODEL_TEXT[model.id] ? pick(lang, LD_MODEL_TEXT[model.id].description) : model.description;
  const rx = useMotionValue(0);
  const ry = useMotionValue(0);
  const mx = useMotionValue(50);
  const my = useMotionValue(50);
  const srx = useSpring(rx, { stiffness: 260, damping: 22 });
  const sry = useSpring(ry, { stiffness: 260, damping: 22 });
  const glow = useMotionTemplate`radial-gradient(240px circle at ${mx}% ${my}%, ${model.primary}2e, transparent 60%)`;

  function onMove(e: MouseEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    ry.set((px - 0.5) * 10);
    rx.set((0.5 - py) * 10);
    mx.set(px * 100);
    my.set(py * 100);
  }
  function onLeave() {
    rx.set(0);
    ry.set(0);
  }

  return (
    <motion.div
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      style={{ rotateX: srx, rotateY: sry, transformPerspective: 900 }}
      className="group relative h-full overflow-hidden rounded-2xl border border-border p-5 transition-colors duration-300 hover:border-[color:var(--card-accent)]"
    >
      <div
        className="absolute inset-0 -z-10"
        style={{ background: `linear-gradient(160deg, ${model.bg} 0%, #0D1033 100%)` }}
      />
      <motion.div className="pointer-events-none absolute inset-0 -z-10 opacity-0 transition-opacity duration-300 group-hover:opacity-100" style={{ background: glow }} />
      <style>{`.group:hover{--card-accent:${model.primary}66}`}</style>

      <div className="flex items-start justify-between">
        <span
          className="flex size-11 items-center justify-center rounded-xl text-xl"
          style={{ background: `${model.primary}22`, color: model.primary, boxShadow: `0 0 20px ${model.primary}33` }}
        >
          {model.glyph}
        </span>
        {model.cost === "free" ? (
          <span className="rounded-full bg-success/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-success">
            {t("ldFree")}
          </span>
        ) : (
          <span className="rounded-full bg-bg-hover px-2.5 py-1 font-mono text-[11px] text-text-secondary">{model.cost}</span>
        )}
      </div>

      <h3 className="font-display mt-5 text-lg font-bold text-text-primary">{model.name}</h3>
      <p className="text-xs text-text-muted">{modelProvider(lang, model)}</p>
      <p className="mt-3 text-sm text-text-secondary">{description}</p>

      <div className="mt-5 space-y-2">
        {model.capabilities.map((c) => (
          <div key={c.label} className="flex items-center gap-3 text-xs">
            <span className="w-20 text-text-muted">
              {LD_CAPABILITY_LABEL[c.label] ? pick(lang, LD_CAPABILITY_LABEL[c.label]) : c.label}
            </span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg-hover">
              <motion.div
                className="h-full rounded-full"
                style={{ background: model.primary }}
                initial={{ width: 0 }}
                whileInView={{ width: `${(c.score / 5) * 100}%` }}
                viewport={{ once: true }}
                transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
              />
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

export function ModelShowcase() {
  const t = useT();
  return (
    <section id="models" className="relative mx-auto max-w-6xl px-5 py-24 md:px-8 md:py-32">
      <FadeIn inView>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary-soft">{t("navModels")}</p>
        <h2 className="font-display mt-3 max-w-2xl text-3xl font-extrabold text-text-primary md:text-4xl">
          {t("ldShowcaseTitle")}
        </h2>
        <p className="mt-4 max-w-xl text-text-secondary">{t("ldShowcaseSub")}</p>
      </FadeIn>

      <Stagger inView stagger={0.08} className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SHOWCASE_MODELS.map((m) => (
          <StaggerItem key={m.id} className="h-full">
            <ModelCard model={m} />
          </StaggerItem>
        ))}
      </Stagger>
    </section>
  );
}
