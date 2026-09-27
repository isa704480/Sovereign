"use client";

import { motion, type HTMLMotionProps } from "motion/react";
import { EASE_OUT_EXPO } from "@/lib/motion";

interface FadeInProps extends HTMLMotionProps<"div"> {
  delay?: number;
  y?: number;
  duration?: number;
  /** Animate when scrolled into view instead of on mount. */
  inView?: boolean;
  once?: boolean;
}

/**
 * Kontent SSR'da darhol KO'RINADI (opacity/blur yo'q): JS yuklanmasa yoki kechiksa ham
 * matn o'qiladi. Faqat 8px siljish animatsiya qilinadi; "harakatni kamaytirish"da
 * MotionConfig uni o'chiradi.
 */
export function FadeIn({
  delay = 0,
  y = 8,
  duration = 0.5,
  inView = false,
  once = true,
  children,
  ...rest
}: FadeInProps) {
  const hidden = { y };
  const shown = { y: 0 };
  const transition = { duration, delay, ease: EASE_OUT_EXPO };

  if (inView) {
    return (
      <motion.div
        initial={hidden}
        whileInView={shown}
        viewport={{ once, margin: "-80px" }}
        transition={transition}
        {...rest}
      >
        {children}
      </motion.div>
    );
  }

  return (
    <motion.div initial={hidden} animate={shown} transition={transition} {...rest}>
      {children}
    </motion.div>
  );
}
