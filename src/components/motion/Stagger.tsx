"use client";

import { motion, type HTMLMotionProps, type Variants } from "motion/react";
import { EASE_OUT_EXPO, staggerContainer } from "@/lib/motion";

/** SSR'da ko'rinadi: faqat 8px siljish, opacity/blur yo'q (FadeIn bilan bir xil). */
export const reveal: Variants = {
  hidden: { y: 8 },
  show: { y: 0, transition: { duration: 0.5, ease: EASE_OUT_EXPO } },
};

interface StaggerProps extends HTMLMotionProps<"div"> {
  stagger?: number;
  delay?: number;
  inView?: boolean;
  once?: boolean;
}

/** Parent that staggers its `<StaggerItem>` children. */
export function Stagger({
  stagger = 0.08,
  delay = 0,
  inView = false,
  once = true,
  children,
  ...rest
}: StaggerProps) {
  const variants = staggerContainer(stagger, delay);
  if (inView) {
    return (
      <motion.div
        variants={variants}
        initial="hidden"
        whileInView="show"
        viewport={{ once, margin: "-80px" }}
        {...rest}
      >
        {children}
      </motion.div>
    );
  }
  return (
    <motion.div variants={variants} initial="hidden" animate="show" {...rest}>
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, ...rest }: HTMLMotionProps<"div">) {
  return (
    <motion.div variants={reveal} {...rest}>
      {children}
    </motion.div>
  );
}
