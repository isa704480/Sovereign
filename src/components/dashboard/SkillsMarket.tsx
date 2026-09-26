"use client";

import { Check, Plus, Search, Sparkles, Trash2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { SKILLS, SKILL_CATEGORY_LABEL, type SkillCategory } from "@/config/skills";
import { skillCategoryLabel, skillText } from "@/lib/locales/panels-data";
import { EASE_OUT_EXPO } from "@/lib/motion";
import { CUSTOM_SKILL_PREFIX, useChat, useLang, useT, type CustomSkill } from "@/store/chat";
import { useDialogA11y } from "./use-dialog-a11y";

interface SkillsMarketProps {
  open: boolean;
  onClose: () => void;
  enabled: string[];
  onToggle: (id: string) => void;
}

const CATEGORIES: (SkillCategory | "all" | "mine")[] = ["all", "design", "code", "security", "writing", "data", "mine"];

/** First lines of the skill prompt — enough to judge what it will do. */
function summarize(prompt: string): string[] {
  return prompt
    .split("\n")
    .slice(1, 5)
    .map((l) => l.replace(/^[•\d)\s.-]+/, "").trim())
    .filter(Boolean);
}

function Toggle({ on }: { on: boolean }) {
  return (
    <span
      className="tt relative h-6 w-11 shrink-0 rounded-full"
      style={{ background: on ? "var(--t-primary)" : "color-mix(in srgb, var(--t-text) 18%, transparent)" }}
    >
      <span
        className="absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow-sm transition-transform duration-200"
        style={{ transform: on ? "translateX(20px)" : "translateX(0)" }}
      />
    </span>
  );
}

export function SkillsMarket({ open, onClose, enabled, onToggle }: SkillsMarketProps) {
  const t = useT();
  const lang = useLang();
  const catLabel = (k: (typeof CATEGORIES)[number]) =>
    k === "all" ? t("catAll") : k === "mine" ? t("catMine") : skillCategoryLabel(lang, k, SKILL_CATEGORY_LABEL[k]);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<(typeof CATEGORIES)[number]>("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ name: "", instructions: "" });

  const customSkills = useChat((s) => s.customSkills);
  const addCustomSkill = useChat((s) => s.addCustomSkill);
  const removeCustomSkill = useChat((s) => s.removeCustomSkill);

  const { panelRef, titleId, dialogProps } = useDialogA11y(open, onClose);

  const items = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const built = SKILLS.map((s) => {
      const tx = skillText(lang, s);
      return {
        id: s.id,
        name: tx.name,
        description: tx.description,
        glyph: s.glyph,
        color: s.color,
        category: s.category as string,
        details: tx.details ?? summarize(s.prompt),
        custom: false as const,
      };
    });
    const mine = customSkills.map((s: CustomSkill) => ({
      id: `${CUSTOM_SKILL_PREFIX}${s.id}`,
      name: s.name,
      description: t("skillCustomDesc"),
      glyph: "✻",
      color: "#10D4A0",
      category: "mine",
      details: [s.instructions.slice(0, 220)],
      custom: true as const,
    }));
    return [...built, ...mine]
      .filter((s) => cat === "all" || s.category === cat)
      .filter((s) => !needle || `${s.name} ${s.description}`.toLowerCase().includes(needle));
  }, [q, cat, customSkills, t, lang]);

  function saveDraft() {
    const name = draft.name.trim().slice(0, 40);
    const instructions = draft.instructions.trim().slice(0, 2000);
    if (!name || instructions.length < 10) return;
    const id = addCustomSkill({ name, instructions });
    onToggle(`${CUSTOM_SKILL_PREFIX}${id}`);
    setDraft({ name: "", instructions: "" });
    setCreating(false);
    setCat("mine");
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
          onClick={onClose}
        >
          <motion.div
            ref={panelRef}
            {...dialogProps}
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.32, ease: EASE_OUT_EXPO }}
            onClick={(e) => e.stopPropagation()}
            className="tt flex max-h-[88vh] w-full max-w-2xl flex-col rounded-[22px] border outline-none"
            style={{
              background: "var(--t-surface, #0D1033)",
              borderColor: "var(--t-border)",
              color: "var(--t-text)",
              // Overlay depth: two layers, never one hard shadow.
              boxShadow: "0 2px 8px rgba(0,0,0,0.35), 0 30px 80px rgba(0,0,0,0.55)",
            }}
          >
            <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "var(--t-border)" }}>
              <div className="flex items-center gap-2">
                <Sparkles className="size-5" style={{ color: "var(--t-accent)" }} />
                <h2 id={titleId} className="font-display text-lg font-bold">{t("skills")}</h2>
                <span className="text-xs" style={{ color: "var(--t-text-muted)" }}>{enabled.length} {t("skillsEnabled")}</span>
              </div>
              <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-white/10" aria-label={t("close")} style={{ color: "var(--t-text-muted)" }}>
                <X className="size-5" />
              </button>
            </div>

            <div className="border-b px-5 py-3" style={{ borderColor: "var(--t-border)" }}>
              <label className="flex items-center gap-2 rounded-xl border px-3 py-2" style={{ borderColor: "var(--t-border)" }}>
                <Search className="size-4 shrink-0" style={{ color: "var(--t-text-muted)" }} />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={t("skillsSearch")}
                  aria-label={t("skillsSearch")}
                  className="w-full bg-transparent text-base outline-none placeholder:opacity-60 sm:text-sm"
                />
              </label>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {CATEGORIES.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setCat(k)}
                    className="rounded-full border px-3 py-1 text-xs font-medium transition-colors"
                    style={{
                      borderColor: cat === k ? "var(--t-primary)" : "var(--t-border)",
                      background: cat === k ? "color-mix(in srgb, var(--t-primary) 16%, transparent)" : "transparent",
                      color: cat === k ? "var(--t-accent)" : "var(--t-text-muted)",
                    }}
                  >
                    {catLabel(k)}
                  </button>
                ))}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {items.length === 0 && (
                <p className="py-8 text-center text-sm" style={{ color: "var(--t-text-muted)" }}>{t("nothingFound")}</p>
              )}

              {/* One panel, hairline rows — not a pile of bordered cards. */}
              <div
                className="tt overflow-hidden"
                style={{
                  border: items.length ? "1px solid var(--t-border)" : "none",
                  borderRadius: 18,
                  background: "color-mix(in srgb, var(--t-text) 3%, transparent)",
                }}
              >
              {items.map((s, idx) => {
                const on = enabled.includes(s.id);
                const isOpen = expanded === s.id;
                return (
                  <div
                    key={s.id}
                    className="tt"
                    style={{ borderTop: idx === 0 ? "none" : "1px solid var(--border-subtle)" }}
                  >
                    <div className="flex items-center gap-3 p-3">
                      <span
                        className="grid size-9 shrink-0 place-items-center rounded-xl text-base"
                        style={{ background: `color-mix(in srgb, ${s.color} 18%, transparent)`, color: s.color }}
                      >
                        {s.glyph}
                      </span>
                      <button type="button" onClick={() => setExpanded(isOpen ? null : s.id)} className="min-w-0 flex-1 text-left">
                        <span className="block text-sm font-semibold">{s.name}</span>
                        <span className="block truncate text-xs" style={{ color: "var(--t-text-muted)" }}>{s.description}</span>
                      </button>
                      {s.custom && (
                        <button
                          type="button"
                          onClick={() => removeCustomSkill(s.id.slice(CUSTOM_SKILL_PREFIX.length))}
                          className="rounded-lg p-1.5 transition-colors hover:bg-white/10"
                          style={{ color: "var(--t-text-muted)" }}
                          aria-label={t("delete")}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      )}
                      <button type="button" onClick={() => onToggle(s.id)} role="switch" aria-checked={on} aria-label={s.name}>
                        <Toggle on={on} />
                      </button>
                    </div>
                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.ul
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="space-y-1.5 overflow-hidden px-4 pb-3 text-xs"
                          style={{ color: "var(--t-text-muted)" }}
                        >
                          {s.details.map((d, i) => (
                            <li key={i} className="flex gap-2">
                              <Check className="mt-0.5 size-3 shrink-0" style={{ color: s.color }} />
                              <span>{d}</span>
                            </li>
                          ))}
                        </motion.ul>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
              </div>

              {creating ? (
                <div className="tt mt-3 rounded-[18px] border p-3" style={{ borderColor: "var(--t-border)" }}>
                  <input
                    value={draft.name}
                    onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                    placeholder={t("skillNamePlaceholder")}
                    maxLength={40}
                    aria-label={t("skillNamePlaceholder")}
                    className="w-full rounded-lg border bg-transparent px-3 py-2 text-base outline-none sm:text-sm"
                    style={{ borderColor: "var(--t-border)" }}
                  />
                  <textarea
                    value={draft.instructions}
                    onChange={(e) => setDraft((d) => ({ ...d, instructions: e.target.value }))}
                    placeholder={t("skillInstrPlaceholder")}
                    maxLength={2000}
                    rows={5}
                    aria-label={t("skillInstrPlaceholder")}
                    className="mt-2 w-full resize-none rounded-lg border bg-transparent px-3 py-2 text-base outline-none sm:text-sm"
                    style={{ borderColor: "var(--t-border)" }}
                  />
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-[11px]" style={{ color: "var(--t-text-muted)" }}>{draft.instructions.length}/2000</span>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setCreating(false)} className="rounded-lg border px-3 py-1.5 text-xs" style={{ borderColor: "var(--t-border)", color: "var(--t-text-muted)" }}>
                        {t("cancel")}
                      </button>
                      <button
                        type="button"
                        onClick={saveDraft}
                        disabled={!draft.name.trim() || draft.instructions.trim().length < 10}
                        className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                        style={{ background: "var(--t-primary)" }}
                      >
                        {t("save")}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setCreating(true)}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-[18px] border border-dashed py-3 text-sm transition-colors hover:bg-white/5"
                  style={{ borderColor: "var(--t-border)", color: "var(--t-text-muted)" }}
                >
                  <Plus className="size-4" /> {t("createSkill")}
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
