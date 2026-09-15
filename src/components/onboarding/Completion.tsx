"use client";

import { ArrowRight, Check } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { COMPLETION_LINES } from "@/config/onboarding";
import { MODEL_BY_ID } from "@/config/models";
import { BurstScene } from "@/components/three/scenes";
import { MagneticButton } from "@/components/motion/MagneticButton";
import { EASE, EASE_OUT_EXPO, spring } from "@/lib/motion";

interface CompletionProps {
  modelId: string;
  reason: string;
  onEnter?: () => void;
}

export function Completion({ modelId, reason, onEnter }: CompletionProps) {
  const router = useRouter();
  const model = MODEL_BY_ID[modelId] ?? MODEL_BY_ID["claude-sonnet-4-5"];
  const [line, setLine] = useState(0);
  const done = line >= COMPLETION_LINES.length;

  useEffect(() => {
    if (done) return;
    const t = setTimeout(() => setLine((l) => l + 1), line === COMPLETION_LINES.length - 1 ? 700 : 900);
    return () => clearTimeout(t);
  }, [line, done]);

  useEffect(() => {
    router.prefetch("/app");
  }, [router]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: EASE_OUT_EXPO }}
      className="relative w-full max-w-[600px] overflow-hidden rounded-3xl border border-[var(--border-subtle)] bg-bg-elevated p-8 text-center shadow-lg sm:p-12"
    >
      <BurstScene className="pointer-events-none absolute inset-0" />

      <motion.div
        initial={{ scale: 0, rotate: -30 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ ...spring.bouncy, delay: 0.1 }}
        className="relative mx-auto flex size-16 items-center justify-center rounded-full bg-success/15 text-success shadow-[0_0_32px_rgba(16,212,160,0.35)]"
      >
        <Check className="size-8" strokeWidth={3} />
      </motion.div>

      <motion.h2
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE_OUT_EXPO, delay: 0.3 }}
        className="font-display relative mt-6 text-2xl font-extrabold text-text-primary sm:text-3xl"
      >
        Ajoyib! Sozlamalaringiz tayyor
      </motion.h2>

      <div className="relative mt-6 min-h-[28px]">
        <AnimatePresence mode="wait">
          {!done ? (
            <motion.p
              key={line}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25, ease: EASE }}
              className="font-mono text-sm text-text-secondary"
            >
              {COMPLETION_LINES[line]}
            </motion.p>
          ) : (
            <motion.div
              key="rec"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: EASE_OUT_EXPO }}
              className="mx-auto max-w-md rounded-2xl border p-4 text-left"
              style={{ borderColor: `${model.primary}55`, background: `${model.primary}12` }}
            >
              <div className="flex items-center gap-3">
                <span
                  className="flex size-10 items-center justify-center rounded-xl text-lg"
                  style={{ background: `${model.primary}26`, color: model.primary }}
                >
                  {model.glyph}
                </span>
                <div>
                  <div className="text-xs text-text-muted">Siz uchun tavsiya</div>
                  <div className="font-display text-base font-bold text-text-primary">{model.name}</div>
                </div>
              </div>
              <p className="mt-3 text-sm text-text-secondary">{reason}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {done && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: EASE_OUT_EXPO, delay: 0.2 }}
            className="relative mt-8 flex justify-center"
          >
            <MagneticButton>
              <button
                type="button"
                onClick={() => {
                  onEnter?.();
                  router.push("/app");
                }}
                className="group inline-flex h-12 items-center gap-2 rounded-2xl bg-primary px-6 text-base font-semibold text-white shadow-glow transition-colors hover:bg-primary-dark"
              >
                SOVEREIGN&apos;ga kirish
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </button>
            </MagneticButton>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
