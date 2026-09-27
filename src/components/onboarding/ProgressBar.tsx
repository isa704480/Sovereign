"use client";

import { motion } from "motion/react";
import { TOTAL_STEPS } from "@/config/onboarding";
import { EASE_OUT_EXPO } from "@/lib/motion";
import { useT } from "@/store/chat";

export function ProgressBar({ step }: { step: number }) {
  const t = useT();
  const current = Math.min(step + 1, TOTAL_STEPS);
  const pct = (Math.min(step, TOTAL_STEPS) / TOTAL_STEPS) * 100;
  return (
    <div className="w-full max-w-[600px]">
      <div className="mb-2 flex items-center justify-end text-xs">
        <span className="tabular-nums text-text-secondary" aria-hidden>
          {t("auOnbQuestion")} <span className="font-medium text-text-primary">{current}</span> / {TOTAL_STEPS}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={t("auOnbQuestion")}
        aria-valuemin={1}
        aria-valuemax={TOTAL_STEPS}
        aria-valuenow={current}
        aria-valuetext={`${current} / ${TOTAL_STEPS}`}
        className="h-1.5 overflow-hidden rounded-full bg-bg-hover"
      >
        <motion.div
          className="h-full rounded-full bg-primary"
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: EASE_OUT_EXPO }}
        />
      </div>
    </div>
  );
}
