"use client";

import { motion } from "motion/react";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface ChipProps {
  /** Faqat davlat bayrog'i (dekorativ, aria-hidden). */
  emoji?: string;
  label: string;
  /** Ikkinchi darajali izoh (masalan, tilning tarjima qilingan nomi). */
  hint?: string;
  /** label tili (tilning o'z nomi uchun — ekran o'quvchi to'g'ri talaffuz qilsin). */
  labelLang?: string;
  selected: boolean;
  onToggle: () => void;
  /** "radio" — bitta tanlov (davlat), aks holda ko'p tanlov. */
  mode?: "checkbox" | "radio";
}

export function Chip({ emoji, label, hint, labelLang, selected, onToggle, mode = "checkbox" }: ChipProps) {
  return (
    <motion.button
      type="button"
      role={mode}
      aria-checked={selected}
      onClick={onToggle}
      whileTap={{ scale: 0.96 }}
      transition={spring.snappy}
      className={cn(
        "inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors [@media(pointer:coarse)]:h-11",
        selected
          ? "border-primary bg-primary text-white"
          : "border-border bg-transparent text-text-secondary hover:border-[var(--border-strong)] hover:text-text-primary",
      )}
    >
      {emoji && <span aria-hidden>{emoji}</span>}
      <span lang={labelLang}>{label}</span>
      {hint && <span className={cn("text-xs", selected ? "text-white/80" : "text-text-muted")}>{hint}</span>}
    </motion.button>
  );
}
