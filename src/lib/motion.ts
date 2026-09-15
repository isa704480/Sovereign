import type { Transition, Variants } from "motion/react";

/** cubic-bezier(0.4, 0, 0.2, 1) — DESIGN.md default easing. */
export const EASE: [number, number, number, number] = [0.4, 0, 0.2, 1];
export const EASE_OUT_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1];

export const DURATION = {
  fast: 0.2,
  base: 0.25,
  slow: 0.4,
  page: 0.35,
} as const;

export const spring = {
  soft: { type: "spring", stiffness: 260, damping: 26, mass: 0.8 },
  snappy: { type: "spring", stiffness: 420, damping: 30, mass: 0.6 },
  bouncy: { type: "spring", stiffness: 380, damping: 18, mass: 0.7 },
} satisfies Record<string, Transition>;

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16, filter: "blur(4px)" },
  show: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.6, ease: EASE_OUT_EXPO },
  },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: DURATION.slow, ease: EASE } },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.92 },
  show: { opacity: 1, scale: 1, transition: spring.soft },
};

export const staggerContainer = (stagger = 0.08, delay = 0): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: stagger, delayChildren: delay } },
});

/** Slide used between onboarding steps. `dir` is +1 forward, -1 back. */
export const slideStep: Variants = {
  enter: (dir: number) => ({ x: dir * 48, opacity: 0, filter: "blur(6px)" }),
  center: {
    x: 0,
    opacity: 1,
    filter: "blur(0px)",
    transition: { duration: 0.4, ease: EASE_OUT_EXPO },
  },
  exit: (dir: number) => ({
    x: dir * -48,
    opacity: 0,
    filter: "blur(6px)",
    transition: { duration: 0.25, ease: EASE },
  }),
};
