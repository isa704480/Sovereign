"use client";

import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { motion } from "motion/react";
import { useId, type ReactNode } from "react";
import { slideStep } from "@/lib/motion";
import { useT } from "@/store/chat";
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
  const t = useT();
  const hintId = useId();
  // "Keyingi" o'chiq bo'lsa — sababi ko'rinib tursin (va tugmaga bog'langan).
  const blocked = !canNext && !pending;
  return (
    <motion.div
      custom={direction}
      variants={slideStep}
      initial="enter"
      animate="center"
      exit="exit"
      className="w-full max-w-[600px] rounded-2xl border border-[var(--border-subtle)] bg-bg-elevated p-6 shadow-lg sm:p-12"
    >
      <span className="font-mono text-xs tracking-[0.2em] text-primary-soft" aria-hidden>[{number}]</span>
      <h1 className="font-display mt-3 text-balance text-2xl font-extrabold tracking-[-0.02em] text-text-primary sm:text-3xl">{title}</h1>
      {subtitle && <p className="mt-2 text-sm text-text-secondary">{subtitle}</p>}

      <div className="mt-8">{children}</div>

      {blocked && (
        <p id={hintId} className="mt-6 text-sm text-text-secondary">
          {t("p21OnbPickOne")}
        </p>
      )}

      <div className={cn("flex items-center justify-between gap-3", blocked ? "mt-4" : "mt-10")}>
        <button
          type="button"
          onClick={onBack}
          disabled={!canBack || pending}
          className="inline-flex h-11 items-center gap-2 rounded-lg px-3 text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary disabled:invisible"
        >
          <ArrowLeft className="size-4" aria-hidden /> {t("onbBack")}
        </button>
        <motion.button
          type="button"
          onClick={onNext}
          disabled={!canNext || pending}
          aria-describedby={blocked ? hintId : undefined}
          aria-busy={pending || undefined}
          whileTap={{ scale: 0.985 }}
          className={cn(
            "inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-white transition-colors",
            "hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-40",
          )}
        >
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {isLast ? t("onbFinish") : t("onbNext")}
          {!pending && <ArrowRight className="size-4" aria-hidden />}
        </motion.button>
      </div>
    </motion.div>
  );
}
