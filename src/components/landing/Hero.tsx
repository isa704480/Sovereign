"use client";

import Link from "next/link";
import { ArrowRight, Lock, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { HERO_DEMO_MODELS } from "@/config/models";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { MagneticButton } from "@/components/motion/MagneticButton";
import { CoreScene, StarFieldScene } from "@/components/three/scenes";
import { ModelSwitcherDemo } from "./ModelSwitcherDemo";
import { EASE_OUT_EXPO } from "@/lib/motion";
import { useT } from "@/store/chat";

const CYCLE_MS = 3600;

// Apple: har raqamga alohida rang emas — barcha yagona oq/ochiq rangda.
// Faqat "0" (asosiy va'da) accent rang bilan ta'kidlangan.
const STATS = [
  { value: "7+", label: "AI model, bitta interfeys", emphasize: false },
  { value: "256-bit", label: "AES-GCM shifrlash", emphasize: false },
  { value: "0", label: "Ma'lumot uchinchi tomonga", emphasize: true },
  { value: "< 50ms", label: "Blind Prompting kechikish", emphasize: false },
];

export function Hero({ signedIn = false }: { signedIn?: boolean }) {
  const t = useT();
  const [active, setActive] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setActive((a) => (a + 1) % HERO_DEMO_MODELS.length), CYCLE_MS);
    return () => clearInterval(id);
  }, []);

  const model = HERO_DEMO_MODELS[active];

  return (
    <section className="relative isolate min-h-svh overflow-hidden">
      {/* background layers */}
      <div className="absolute inset-0 -z-30 bg-bg-base" />
      <div
        className="absolute inset-0 -z-20 opacity-70"
        style={{
          background:
            "radial-gradient(60% 50% at 30% 30%, rgba(91,80,240,0.22) 0%, transparent 70%), radial-gradient(40% 40% at 80% 70%, rgba(32,212,232,0.12) 0%, transparent 70%)",
        }}
      />
      <StarFieldScene className="absolute inset-0 -z-10" />
      <div className="grid-fade absolute inset-0 -z-10" />

      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-5 pb-8 pt-32 md:px-8 lg:grid-cols-[1.15fr_1fr] lg:pb-10 lg:pt-40">
        {/* left */}
        <Stagger stagger={0.09} delay={0.15} className="relative">
          <StaggerItem>
            <span className="inline-flex items-center gap-2 rounded-full border border-[var(--border-accent)] bg-primary/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-primary-soft">
              <span className="size-1.5 rounded-full bg-primary shadow-glow" />
              Yangi avlod AI platformasi
            </span>
          </StaggerItem>

          <StaggerItem>
            <h1 className="font-display mt-6 text-4xl font-extrabold leading-[1.02] text-text-primary md:text-5xl">
              Barcha AI&apos;lar
              <br />
              Bitta Joyda.
              <br />
              <span className="text-gradient-brand">Faqat Sizniki.</span>
            </h1>
          </StaggerItem>

          <StaggerItem>
            <p className="mt-6 max-w-xl text-lg text-text-secondary">
              GPT-4o, Claude, Gemini, Mistral — hamma bitta interfeys orqali. Suhbatlaringiz shifrlangan.
              Xotirangiz sizda.
            </p>
          </StaggerItem>

          <StaggerItem>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <MagneticButton>
                <Link
                  href={signedIn ? "/app" : "/register"}
                  className="group inline-flex h-12 items-center gap-2 rounded-2xl bg-primary px-6 text-base font-semibold text-white shadow-glow transition-colors hover:bg-primary-dark"
                >
                  {signedIn ? t("backToChat") : t("startFree")}
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </MagneticButton>
              <a
                href="#features"
                className="inline-flex h-12 items-center gap-1.5 px-2 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary"
              >
                Arxitektura haqida
                <ArrowRight className="size-3.5" />
              </a>
            </div>
          </StaggerItem>

          <StaggerItem>
            <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-text-muted">
              <span>Google, GitHub yoki email bilan</span>
              <span className="inline-flex items-center gap-1.5">
                <Lock className="size-3.5 text-success" /> Maxfiy
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Zap className="size-3.5 text-warning" /> Tez
              </span>
            </div>
          </StaggerItem>
        </Stagger>

        {/* right */}
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.9, ease: EASE_OUT_EXPO, delay: 0.35 }}
          className="relative mx-auto flex aspect-square w-full max-w-[520px] items-center justify-center"
        >
          <CoreScene active={active} className="absolute inset-[-12%]" />
          <div
            className="absolute inset-0 -z-10 rounded-full blur-3xl transition-colors duration-700"
            style={{ background: `radial-gradient(circle, ${model.primary}33 0%, transparent 65%)` }}
          />
          <ModelSwitcherDemo model={model} />
        </motion.div>
      </div>

      {/* stats strip */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: EASE_OUT_EXPO, delay: 0.9 }}
        className="mx-auto max-w-6xl px-5 pb-16 md:px-8"
      >
        {/* Apple: unified panel + hairline dividers, ranglar birxil. Faqat asosiy raqam ta'kidlanadi. */}
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.label} className="bg-bg-base px-5 py-4">
              <div className="font-display nums text-2xl font-extrabold tabular-nums" style={{ color: s.emphasize ? "#8B7DFF" : "var(--text-primary)" }}>
                {s.value}
              </div>
              <div className="mt-0.5 text-xs text-text-muted">{s.label}</div>
            </div>
          ))}
        </div>
      </motion.div>
    </section>
  );
}
