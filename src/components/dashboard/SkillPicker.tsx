"use client";

import { Check, Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { SKILLS, SKILL_CATEGORIES } from "@/config/skills";
import { skillCategoryLabel, skillText } from "@/lib/locales/panels-data";
import { EASE } from "@/lib/motion";
import { SkillIcon } from "./SkillIcon";
import { useLang, useT } from "@/store/chat";
import { cn } from "@/lib/utils";

interface SkillPickerProps {
  enabled: string[];
  onToggle: (id: string) => void;
}


export function SkillPicker({ enabled, onToggle }: SkillPickerProps) {
  const t = useT();
  const lang = useLang();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const count = enabled.length;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={cn(
          "tt inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors [@media(pointer:coarse)]:h-11",
          !count && "hover:bg-[var(--surface-hover)]",
        )}
        style={{
          borderColor: count ? "var(--t-primary)" : "var(--t-border)",
          background: count ? "color-mix(in srgb, var(--t-primary) 16%, transparent)" : "transparent",
          color: count ? "var(--t-accent-text)" : "var(--t-text-muted)",
        }}
        title={t("pnSkillsTooltip")}
      >
        <Sparkles className="size-3.5" aria-hidden />
        {t("skills")}
        {count > 0 && (
          <span
            className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[11px] font-bold tabular-nums"
            style={{ background: "var(--t-primary-fill)", color: "var(--t-on-primary)" }}
          >
            {count}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: EASE }}
            role="dialog"
            aria-label={t("pnSovSkills")}
            // Telefonda ekran chetlariga yopishgan (inset-x-3), kattaroq ekranda chip ustida.
            className="tt fixed inset-x-3 bottom-28 z-40 max-h-[min(420px,calc(100svh-200px))] overflow-y-auto rounded-xl border p-2 sm:absolute sm:inset-x-auto sm:bottom-full sm:left-0 sm:mb-2 sm:w-[340px] sm:max-h-[420px]"
            style={{
              background: "var(--t-surface)",
              borderColor: "var(--t-border)",
              boxShadow: "0 2px 8px rgba(0,0,0,0.3), 0 20px 50px rgba(0,0,0,0.45)",
            }}
          >
            <div className="px-2 pb-1 pt-1">
              <div className="text-xs font-semibold" style={{ color: "var(--t-text)" }}>{t("pnSovSkills")}</div>
              <p className="mt-0.5 text-xs" style={{ color: "var(--t-text-muted)" }}>
                {t("skillPickerSubtitle")}
              </p>
            </div>

            {SKILL_CATEGORIES.map((cat) => {
              const items = SKILLS.filter((s) => s.category === cat);
              if (!items.length) return null;
              return (
                <div key={cat} className="mb-1">
                  <div
                    className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em]"
                    style={{ color: "var(--t-text-muted)", borderTop: "1px solid var(--t-border)" }}
                  >
                    {skillCategoryLabel(lang, cat)}
                  </div>
                  {items.map((s) => {
                    const on = enabled.includes(s.id);
                    const tx = skillText(lang, s);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => onToggle(s.id)}
                        aria-pressed={on}
                        className="tt flex min-h-11 w-full items-start gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-[var(--surface-hover)]"
                      >
                        <span
                          aria-hidden
                          className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg text-sm"
                          style={{ background: "color-mix(in srgb, var(--t-text) 6%, transparent)", color: "var(--t-text)" }}
                        >
                          <SkillIcon name={s.icon} className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium" style={{ color: "var(--t-text)" }}>{tx.name}</span>
                          <span className="block text-xs" style={{ color: "var(--t-text-muted)" }}>{tx.description}</span>
                        </span>
                        <span
                          aria-hidden
                          className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors"
                          style={{
                            borderColor: on ? "var(--t-primary-fill)" : "var(--t-border)",
                            background: on ? "var(--t-primary-fill)" : "transparent",
                            color: on ? "var(--t-on-primary)" : "transparent",
                          }}
                        >
                          <Check className="size-3" strokeWidth={3} />
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
