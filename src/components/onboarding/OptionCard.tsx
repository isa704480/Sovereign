"use client";

import { Briefcase, Check, Lock, MessageCircle, Microscope, Palette, Target, Wallet, Zap, type LucideIcon } from "lucide-react";
import { motion } from "motion/react";
import type { OnboardingIconName } from "@/config/onboarding";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";

const ICONS: Record<OnboardingIconName, LucideIcon> = {
  briefcase: Briefcase,
  microscope: Microscope,
  palette: Palette,
  message: MessageCircle,
  zap: Zap,
  target: Target,
  lock: Lock,
  wallet: Wallet,
};

interface OptionCardProps {
  icon?: OnboardingIconName;
  label: string;
  description?: string;
  selected: boolean;
  onToggle: () => void;
  /** "radio" — bitta tanlov (yosh guruhi), aks holda ko'p tanlov. */
  mode?: "checkbox" | "radio";
}

/** Tanlanadigan karta (maqsad / ustuvorlik / yosh). */
export function OptionCard({ icon, label, description, selected, onToggle, mode = "checkbox" }: OptionCardProps) {
  const Icon = icon ? ICONS[icon] : null;
  return (
    <motion.button
      type="button"
      role={mode}
      aria-checked={selected}
      onClick={onToggle}
      whileTap={{ scale: 0.98 }}
      transition={spring.snappy}
      className={cn(
        "relative flex h-full min-h-11 flex-col items-start rounded-xl border p-4 text-left transition-colors sm:p-5",
        selected
          ? "border-[var(--border-accent)] bg-primary/10"
          : "border-border bg-bg-base/40 hover:border-[var(--border-strong)] hover:bg-bg-hover/60",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute right-3 top-3 flex size-5 items-center justify-center rounded-full border transition-colors",
          selected ? "border-primary bg-primary text-white" : "border-[var(--border-strong)] text-transparent",
        )}
      >
        <Check className="size-3" strokeWidth={3} />
      </span>
      {Icon && <Icon className="size-5 text-text-secondary" aria-hidden />}
      <span className={cn("text-[15px] font-semibold text-text-primary", Icon && "mt-3")}>{label}</span>
      {description && <span className="mt-1 text-sm text-text-secondary">{description}</span>}
    </motion.button>
  );
}
