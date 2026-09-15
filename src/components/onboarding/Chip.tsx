"use client";

import { motion } from "motion/react";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface ChipProps {
  emoji?: string;
  label: string;
  selected: boolean;
  onToggle: () => void;
}

export function Chip({ emoji, label, selected, onToggle }: ChipProps) {
  return (
    <motion.button
      type="button"
      role="checkbox"
      aria-checked={selected}
      onClick={onToggle}
      whileTap={{ scale: 0.96 }}
      transition={spring.snappy}
      className={cn(
        "inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors",
        selected
          ? "border-primary bg-primary text-white shadow-glow"
          : "border-border bg-transparent text-text-secondary hover:border-[var(--border-strong)] hover:text-text-primary",
      )}
    >
      {emoji && <span aria-hidden>{emoji}</span>}
      {label}
    </motion.button>
  );
}
