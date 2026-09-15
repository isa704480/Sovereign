"use client";

import { motion, type HTMLMotionProps } from "motion/react";
import { fadeUp, staggerContainer } from "@/lib/motion";

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
    <motion.div variants={fadeUp} {...rest}>
      {children}
    </motion.div>
  );
}
