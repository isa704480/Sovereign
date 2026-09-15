"use client";

import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { slideStep } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface StepShellProps {
  number: string;
  title: string;
  subtitle?: string;
  direction: 1 | -1;
  canNext: boolean;
  canBack: boolean;
  isLast: boolean;
  pending?: boolean;
  onNext: () => void;
  onBack: () => void;
  children: ReactNode;
}

export function StepShell({
  number,
  title,
  subtitle,
  direction,
  canNext,
  canBack,
  isLast,
  pending,
  onNext,
  onBack,
  children,
}: StepShellProps) {
  return (
    <motion.div
      custom={direction}
      variants={slideStep}
      initial="enter"
      animate="center"
      exit="exit"
      className="w-full max-w-[600px] rounded-3xl border border-[var(--border-subtle)] bg-bg-elevated p-7 shadow-lg sm:p-12"
    >
      <span className="font-mono text-xs tracking-[0.2em] text-primary-soft">[{number}]</span>
      <h2 className="font-display mt-3 text-2xl font-extrabold text-text-primary sm:text-3xl">{title}</h2>
      {subtitle && <p className="mt-2 text-sm text-text-secondary">{subtitle}</p>}

      <div className="mt-8">{children}</div>

      <div className="mt-10 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          disabled={!canBack || pending}
          className="inline-flex h-11 items-center gap-2 rounded-xl px-3 text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary disabled:invisible"
        >
          <ArrowLeft className="size-4" /> Orqaga
        </button>
        <motion.button
          type="button"
          onClick={onNext}
          disabled={!canNext || pending}
          whileTap={{ scale: 0.985 }}
          className={cn(
            "inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-white transition-all",
            "hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none",
            canNext && "shadow-glow",
          )}
        >
          {pending && <Loader2 className="size-4 animate-spin" />}
          {isLast ? "Yakunlash" : "Keyingisi"}
          {!pending && <ArrowRight className="size-4" />}
        </motion.button>
      </div>
    </motion.div>
  );
}
