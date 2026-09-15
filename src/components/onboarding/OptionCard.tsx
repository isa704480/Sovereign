"use client";

import { Check } from "lucide-react";
import { motion } from "motion/react";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface OptionCardProps {
  emoji?: string;
  label: string;
  description?: string;
  selected: boolean;
  onToggle: () => void;
}

/** 2x2 selectable card (purpose / priorities). Multi-select. */
export function OptionCard({ emoji, label, description, selected, onToggle }: OptionCardProps) {
  return (
    <motion.button
      type="button"
      role="checkbox"
      aria-checked={selected}
      onClick={onToggle}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={spring.snappy}
      className={cn(
        "relative flex h-full flex-col items-start rounded-2xl border p-4 text-left transition-colors sm:p-5",
        selected
          ? "border-[var(--border-accent)] bg-primary/10 shadow-glow"
          : "border-border bg-bg-base/40 hover:border-[var(--border-strong)] hover:bg-bg-hover/60",
      )}
    >
      <span
        className={cn(
          "absolute right-3 top-3 flex size-5 items-center justify-center rounded-full border transition-all",
          selected ? "border-primary bg-primary text-white" : "border-[var(--border-strong)] text-transparent",
        )}
      >
        <Check className="size-3" strokeWidth={3} />
      </span>
      {emoji && <span className="text-2xl">{emoji}</span>}
      <span className="mt-3 text-[15px] font-semibold text-text-primary">{label}</span>
      {description && <span className="mt-1 text-sm text-text-secondary">{description}</span>}
    </motion.button>
  );
}
