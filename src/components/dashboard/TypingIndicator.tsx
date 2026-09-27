"use client";

import { motion, useReducedMotionConfig } from "motion/react";
import { useT } from "@/store/chat";

/** Neytral "javob yozilmoqda" belgisi — uch nuqta, bir rangli, har model uchun bir xil. */
export function TypingIndicator() {
  const t = useT();
  const still = useReducedMotionConfig() === true;

  return (
    <span className="inline-flex items-center gap-1.5" role="status" aria-live="polite" aria-label={t("typing")}>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          aria-hidden
          className="block size-1.5 rounded-full"
          style={{ background: "var(--t-text-muted)", opacity: still ? 0.7 : undefined }}
          animate={still ? undefined : { opacity: [0.3, 1, 0.3] }}
          transition={still ? undefined : { duration: 1.2, repeat: Infinity, delay: i * 0.18, ease: "easeInOut" }}
        />
      ))}
    </span>
  );
}
