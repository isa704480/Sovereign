"use client";

import { motion } from "motion/react";
import { EASE } from "@/lib/motion";

/** Page-enter transition applied on every navigation. */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE }}
      className="flex min-h-full flex-1 flex-col"
    >
      {children}
    </motion.div>
  );
}
