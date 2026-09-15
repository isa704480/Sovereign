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

export function FadeIn({
  delay = 0,
  y = 16,
  duration = 0.6,
  inView = false,
  once = true,
  children,
  ...rest
}: FadeInProps) {
  const hidden = { opacity: 0, y, filter: "blur(4px)" };
  const shown = { opacity: 1, y: 0, filter: "blur(0px)" };
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
