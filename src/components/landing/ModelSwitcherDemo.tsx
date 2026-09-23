"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { HERO_DEMO_MODELS, type SovereignModel } from "@/config/models";
import { EASE, EASE_OUT_EXPO } from "@/lib/motion";
import { pick } from "@/lib/i18n";
import { LD_MODEL_TEXT } from "@/lib/locales/landing";
import { useLang, useT } from "@/store/chat";

interface Props {
  model: SovereignModel;
}

const TYPING_MS = 900;

/** True for a short window after the model changes, then the answer appears. */
function useTyping(key: string): boolean {
  const [typingFor, setTypingFor] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setTypingFor(key), TYPING_MS);
    return () => clearTimeout(t);
  }, [key]);
  return typingFor !== key;
}

function TypingDots({ color }: { color: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="block size-1.5 rounded-full"
          style={{ background: color }}
          animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15, ease: EASE }}
        />
      ))}
    </span>
  );
}

/** Animated "one interface, many models" card shown in the hero. */
export function ModelSwitcherDemo({ model }: Props) {
  const typing = useTyping(model.id);
  const t = useT();
  const lang = useLang();
  const tx = LD_MODEL_TEXT[model.id];
  const demoUser = tx?.demoUser ? pick(lang, tx.demoUser) : model.demo.user;
  const demoAi = tx?.demoAi ? pick(lang, tx.demoAi) : model.demo.ai;
  return (
    <motion.div
      layout
      className="relative w-[92%] max-w-[420px] overflow-hidden rounded-3xl border bg-[rgba(13,16,51,0.88)] p-4 shadow-lg backdrop-blur-xl transition-[border-color] duration-500"
      style={{ borderColor: `${model.primary}55` }}
    >
      {/* header */}
      <div className="flex items-center justify-between">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={model.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6, transition: { duration: 0.12 } }}
            transition={{ duration: 0.3, ease: EASE }}
            className="flex items-center gap-3"
          >
            <span
              className="flex size-9 items-center justify-center rounded-xl text-lg font-bold text-white"
              style={{ background: `${model.primary}26`, color: model.primary, boxShadow: `0 0 18px ${model.primary}40` }}
            >
              {model.glyph}
            </span>
            <div className="leading-tight">
              <div className="text-sm font-semibold text-text-primary">{model.name}</div>
              <div className="text-xs text-text-muted">
                {model.provider} · {model.cost === "free" ? t("ldFree") : model.cost === "$" ? t("ldPerRequest") : "$0.003/1K"}
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-bg-base/60 px-2 py-1 text-[11px] text-text-secondary">
          <motion.span
            className="size-1.5 rounded-full"
            style={{ background: model.primary }}
            animate={{ opacity: [1, 0.4, 1] }}
            transition={{ duration: 1.6, repeat: Infinity }}
          />
          {t("ldActive")}
        </span>
      </div>

      {/* chat */}
      <div className="mt-4 space-y-3">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${model.id}-u`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            transition={{ duration: 0.25, ease: EASE }}
            className="ml-auto max-w-[80%] rounded-[18px_18px_4px_18px] bg-[#1C1F42] px-3.5 py-2.5 text-[13px] text-text-primary"
          >
            {demoUser}
          </motion.div>
        </AnimatePresence>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${model.id}-a`}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            transition={{ duration: 0.3, ease: EASE, delay: 0.15 }}
            className="max-w-[92%] rounded-[4px_18px_18px_18px] bg-bg-elevated px-3.5 py-2.5 text-[13px] text-text-secondary"
            style={{ borderLeft: `3px solid ${model.primary}` }}
          >
            {typing ? (
              <TypingDots color={model.primary} />
            ) : (
              <motion.span
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: EASE_OUT_EXPO }}
                className="block whitespace-pre-wrap"
              >
                {demoAi}
              </motion.span>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* switcher chips */}
      <div className="mt-4 flex flex-wrap gap-1.5 border-t border-border pt-3">
        {HERO_DEMO_MODELS.map((m) => {
          const isActive = m.id === model.id;
          return (
            <span
              key={m.id}
              className="relative inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors"
              style={{
                color: isActive ? "#fff" : "var(--text-muted)",
              }}
            >
              {isActive && (
                <motion.span
                  layoutId="demo-chip"
                  className="absolute inset-0 rounded-full"
                  style={{ background: m.primary }}
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                />
              )}
              <span className="relative">{m.glyph}</span>
              <span className="relative">{m.shortName}</span>
            </span>
          );
        })}
      </div>

      {/* progress line */}
      <motion.div
        key={model.id}
        className="absolute inset-x-0 bottom-0 h-[2px] origin-left"
        style={{ background: model.primary }}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 3.6, ease: "linear" }}
      />
    </motion.div>
  );
}
