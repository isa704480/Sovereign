"use client";

import { motion } from "motion/react";
import { useTheme } from "./theme-context";

/** Model-specific "thinking" indicator (DESIGN.md Ekran 5/6). */
export function TypingIndicator() {
  const { theme, model } = useTheme();

  if (theme.id === "chatgpt") {
    return (
      <motion.span
        className="inline-block size-3 rounded-full"
        style={{ background: "var(--t-text)" }}
        animate={{ opacity: [1, 0.2, 1] }}
        transition={{ duration: 1, repeat: Infinity }}
        aria-label="Yozmoqda"
      />
    );
  }

  if (theme.id === "perplexity") {
    return (
      <span className="inline-flex items-center gap-2.5 text-sm" style={{ color: "var(--t-text-muted)" }}>
        <motion.span
          className="size-4 rounded-full border-2 border-transparent"
          style={{ borderTopColor: "var(--t-primary)", borderRightColor: "var(--t-primary)" }}
          animate={{ rotate: 360 }}
          transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
        />
        🌐 Internetdan qidirmoqda...
      </span>
    );
  }

  if (theme.id === "claude") {
    return (
      <motion.span
        className="inline-block text-lg"
        style={{ color: model.primary }}
        animate={{ opacity: [0.4, 1, 0.4], scale: [0.9, 1.05, 0.9] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
        aria-label="Yozmoqda"
      >
        ✦
      </motion.span>
    );
  }

  const colors =
    theme.id === "gemini" ? ["#4285F4", "#9B72CB", "#D96570"] : [model.primary, model.primary, model.primary];

  return (
    <span className="inline-flex items-center gap-1.5" aria-label="Yozmoqda">
      {colors.map((c, i) => (
        <motion.span
          key={i}
          className="block size-2 rounded-full"
          style={{ background: c }}
          animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
        />
      ))}
    </span>
  );
}
