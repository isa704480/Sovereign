"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { EASE_OUT_EXPO } from "@/lib/motion";
import { LogoMark } from "@/components/brand/Logo";
import { cn } from "@/lib/utils";
import { useTheme } from "./theme-context";
import { useLang, useT } from "@/store/chat";
import { themeSuggestions } from "@/lib/locales/chat-data";

interface WelcomeProps {
  userName: string;
  onSuggestion: (text: string) => void;
  /** Rendered in the middle for themes with a centered empty-state input. */
  input?: ReactNode;
}

function Suggestions({
  items,
  onPick,
  variant,
}: {
  items: string[];
  onPick: (t: string) => void;
  variant: "cards" | "chips" | "list";
}) {
  if (variant === "chips") {
    return (
      <div className="flex flex-wrap justify-center gap-2">
        {items.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            className="tt rounded-full border px-3.5 py-2 text-sm transition-colors hover:bg-white/5"
            style={{ borderColor: "var(--t-border)", color: "var(--t-text-muted)" }}
          >
            {s}
          </button>
        ))}
      </div>
    );
  }
  if (variant === "list") {
    return (
      <div className="w-full max-w-xl divide-y" style={{ borderColor: "var(--t-border)" }}>
        {items.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            className="flex w-full items-center justify-between py-3 text-left text-sm transition-colors hover:opacity-100"
            style={{ color: "var(--t-text-muted)", borderColor: "var(--t-border)" }}
          >
            {s}
            <span style={{ color: "var(--t-primary)" }}>→</span>
          </button>
        ))}
      </div>
    );
  }
  return (
    <div className="grid w-full max-w-2xl grid-cols-1 gap-2 sm:grid-cols-2">
      {items.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onPick(s)}
          className="tt border p-3.5 text-left text-sm transition-colors hover:bg-white/5"
          style={{ borderColor: "var(--t-border)", borderRadius: "var(--t-radius)", color: "var(--t-text-muted)" }}
        >
          {s}
        </button>
      ))}
    </div>
  );
}

/** Empty-state screen, one layout per provider (DESIGN.md Ekran 5). */
export function Welcome({ userName, onSuggestion, input }: WelcomeProps) {
  const { theme, model } = useTheme();
  const t = theme.id;
  const tr = useT();
  const lang = useLang();
  const suggestions = themeSuggestions(lang, theme);

  const wrap = (children: ReactNode, className?: string) => (
    <motion.div
      key={t}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE_OUT_EXPO }}
      className={cn("mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-8 px-4 py-10", className)}
    >
      {children}
    </motion.div>
  );

  if (t === "claude") {
    return wrap(
      <>
        <div className="text-center">
          <div className="flex items-center justify-center gap-3">
            <span className="text-4xl" style={{ color: model.primary }}>✦</span>
            <h1 className="t-display text-3xl font-medium md:text-4xl" style={{ color: "var(--t-text)" }}>
              {tr("hello")}, {userName}
            </h1>
          </div>
          <p className="mt-3 text-sm" style={{ color: "var(--t-text-muted)" }}>
            {tr("subGreeting")}
          </p>
        </div>
        {input}
        <Suggestions items={suggestions} onPick={onSuggestion} variant="chips" />
        <span className="text-[11px]" style={{ color: "var(--t-text-muted)" }}>Made by Anthropic · via SOVEREIGN</span>
      </>,
    );
  }

  if (t === "chatgpt") {
    return wrap(
      <>
        <div className="flex flex-col items-center">
          <div
            className="flex size-12 items-center justify-center rounded-full border text-xl"
            style={{ borderColor: "var(--t-border)", color: "var(--t-text)" }}
          >
            ⬡
          </div>
          <h1 className="mt-5 text-2xl font-semibold md:text-3xl" style={{ color: "var(--t-text)" }}>
            {tr("greeting")}
          </h1>
        </div>
        {input}
        <Suggestions items={suggestions} onPick={onSuggestion} variant="cards" />
      </>,
    );
  }

  if (t === "gemini") {
    return wrap(
      <>
        <div className="w-full max-w-2xl">
          <h1 className="t-display t-gradient-text text-4xl font-medium md:text-5xl">
            {tr("greeting")} {userName}
          </h1>
          <p className="t-display mt-1 text-3xl md:text-4xl" style={{ color: "var(--t-text-muted)" }}>
            {tr("subGreeting")}
          </p>
        </div>
        {input}
        <div className="grid w-full max-w-2xl grid-cols-2 gap-3 md:grid-cols-4">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onSuggestion(s)}
              className="tt flex min-h-[120px] flex-col justify-between rounded-3xl p-4 text-left text-sm transition-colors hover:bg-white/5"
              style={{ background: "var(--t-surface)", color: "var(--t-text)" }}
            >
              {s}
              <span className="self-end text-base" style={{ color: model.primary }}>✦</span>
            </button>
          ))}
        </div>
      </>,
    );
  }

  if (t === "perplexity") {
    return wrap(
      <>
        <div className="flex items-center gap-3">
          <span className="text-4xl" style={{ color: model.primary }}>⊕</span>
          <span className="t-display text-4xl font-light tracking-tight" style={{ color: "var(--t-text)" }}>
            {theme.wordmark}
          </span>
        </div>
        <p className="-mt-4 text-sm" style={{ color: "var(--t-text-muted)" }}>{tr("greeting")}</p>
        {input}
        <Suggestions items={suggestions} onPick={onSuggestion} variant="list" />
      </>,
      "max-w-2xl",
    );
  }

  if (t === "mistral") {
    return wrap(
      <>
        <div className="text-center">
          <div className="mx-auto flex gap-0.5">
            {["#FFD800", "#FFAF00", "#FF8205", "#FA500F", "#E10500"].map((c) => (
              <span key={c} className="block h-6 w-3" style={{ background: c }} />
            ))}
          </div>
          <h1 className="t-display mt-5 text-3xl font-semibold md:text-4xl" style={{ color: "var(--t-text)" }}>
            {tr("greeting")}
          </h1>
          <p className="mt-2 text-sm" style={{ color: "var(--t-text-muted)" }}>{tr("subGreeting")}</p>
        </div>
        {input}
        <Suggestions items={suggestions} onPick={onSuggestion} variant="cards" />
      </>,
    );
  }

  if (t === "llama") {
    return wrap(
      <>
        <div className="text-center">
          <div className="text-5xl">🦙</div>
          <h1 className="t-display mt-4 text-3xl font-semibold md:text-4xl" style={{ color: "var(--t-text)" }}>
            {tr("greeting")}
          </h1>
          <p className="mt-2 text-sm" style={{ color: "var(--t-text-muted)" }}>{tr("subGreeting")}</p>
          <span
            className="mt-3 inline-block rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wider"
            style={{ background: "color-mix(in srgb, var(--t-primary) 22%, transparent)", color: "var(--t-accent)" }}
          >
            {theme.badge}
          </span>
        </div>
        {input}
        <Suggestions items={suggestions} onPick={onSuggestion} variant="cards" />
      </>,
    );
  }

  // sovereign (default)
  return wrap(
    <>
      <div className="text-center">
        <LogoMark size={56} className="mx-auto" />
        <h1 className="t-display mt-5 text-3xl font-extrabold md:text-4xl" style={{ color: "var(--t-text)" }}>
          {tr("greeting")}
        </h1>
        <p className="mt-2 text-sm" style={{ color: "var(--t-text-muted)" }}>{tr("subGreeting")}</p>
      </div>
      {input}
      <Suggestions items={suggestions} onPick={onSuggestion} variant="cards" />
    </>,
  );
}
