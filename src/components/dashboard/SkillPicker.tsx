"use client";

import { Check, Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { SKILLS, SKILL_CATEGORY_LABEL, type SkillCategory } from "@/config/skills";
import { skillCategoryLabel, skillText } from "@/lib/locales/panels-data";
import { EASE } from "@/lib/motion";
import { useLang, useT } from "@/store/chat";
import { cn } from "@/lib/utils";

interface SkillPickerProps {
  enabled: string[];
  onToggle: (id: string) => void;
}

const ORDER: SkillCategory[] = ["design", "code", "security", "writing", "data"];

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
        className={cn(
          "tt inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
        )}
        style={{
          borderColor: count ? "var(--t-primary)" : "var(--t-border)",
          background: count ? "color-mix(in srgb, var(--t-primary) 16%, transparent)" : "transparent",
          color: count ? "var(--t-accent)" : "var(--t-text-muted)",
        }}
        title={t("pnSkillsTooltip")}
      >
        <Sparkles className="size-3.5" />
        {t("skills")}
        {count > 0 && (
          <span
            className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white"
            style={{ background: "var(--t-primary)" }}
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
            className="tt absolute bottom-full left-0 z-40 mb-2 max-h-[420px] w-[340px] overflow-y-auto border p-2 shadow-lg"
            style={{ background: "var(--t-surface)", borderColor: "var(--t-border)", borderRadius: 16 }}
          >
            <div className="px-2 pb-1 pt-1">
              <div className="text-xs font-semibold" style={{ color: "var(--t-text)" }}>{t("pnSovSkills")}</div>
              <p className="mt-0.5 text-[11px]" style={{ color: "var(--t-text-muted)" }}>
                {t("skillPickerSubtitle")}
              </p>
            </div>

            {ORDER.map((cat) => {
              const items = SKILLS.filter((s) => s.category === cat);
              if (!items.length) return null;
              return (
                <div key={cat} className="mb-1">
                  <div
                    className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em]"
                    style={{ color: "var(--t-text-muted)", borderTop: "1px solid var(--t-border)" }}
                  >
                    {skillCategoryLabel(lang, cat, SKILL_CATEGORY_LABEL[cat])}
                  </div>
                  {items.map((s) => {
                    const on = enabled.includes(s.id);
                    const tx = skillText(lang, s);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => onToggle(s.id)}
                        className="tt flex w-full items-start gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-white/5"
                      >
                        <span
                          className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg text-sm"
                          style={{ background: `color-mix(in srgb, ${s.color} 20%, transparent)`, color: s.color }}
                        >
                          {s.glyph || tx.name[0]}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium" style={{ color: "var(--t-text)" }}>{tx.name}</span>
                          <span className="block text-xs" style={{ color: "var(--t-text-muted)" }}>{tx.description}</span>
                        </span>
                        <span
                          className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors"
                          style={{
                            borderColor: on ? s.color : "var(--t-border)",
                            background: on ? s.color : "transparent",
                            color: on ? "#fff" : "transparent",
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
