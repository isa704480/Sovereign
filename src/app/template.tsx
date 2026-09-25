"use client";

import { motion } from "motion/react";
import { EASE } from "@/lib/motion";

/**
 * Page-enter transition. initial={false}: birinchi render (SSR) darhol ko'rinadi —
 * JS yuklanmaguncha sahifa shaffof bo'lib qolmaydi; faqat navigatsiyada yengil siljish.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE }}
      className="flex min-h-full flex-1 flex-col"
    >
      {children}
    </motion.div>
  );
}
