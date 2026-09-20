"use client";

import { Check, ChevronDown, Lock } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { AUTO_MODEL, AUTO_MODEL_ID, MODELS, MODEL_GROUPS, isModelVisible, resolveModel, type SovereignModel } from "@/config/models";
import { planAllowsTier, type Plan } from "@/config/plans";
import { EASE } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { useTheme } from "./theme-context";

interface ModelSwitcherProps {
  value: string;
  onChange: (id: string) => void;
  plan: Plan;
  compact?: boolean;
}

function Bars({ model }: { model: SovereignModel }) {
  return (
    <div className="mt-1.5 flex gap-3">
      {model.capabilities.map((c) => (
        <div key={c.label} className="flex items-center gap-1.5 text-[10px]" style={{ color: "var(--t-text-muted)" }}>
          <span className="flex gap-[2px]">
            {[0, 1, 2, 3, 4].map((i) => (
              <span
                key={i}
                className="block h-[6px] w-[7px] rounded-[2px]"
                style={{ background: i < c.score ? model.primary : "color-mix(in srgb, var(--t-text) 12%, transparent)" }}
              />
            ))}
          </span>
          {c.label}
        </div>
      ))}
    </div>
  );
}

export function ModelSwitcher({ value, onChange, plan, compact }: ModelSwitcherProps) {
  const { model: themeModel } = useTheme();
  const model = value === AUTO_MODEL_ID ? AUTO_MODEL : resolveModel(value) ?? themeModel;
  const [open, setOpen] = useState(false);

  // Ctrl+K (Dashboard) shu hodisani yuboradi — menyu ochiladi.
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("sovereign:open-model", onOpen);
    return () => window.removeEventListener("sovereign:open-model", onOpen);
  }, []);
  const ref = useRef<HTMLDivElement>(null);

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
        className="tt flex items-center gap-2.5 border px-2.5 py-1.5 text-left transition-colors hover:bg-white/5"
        style={{ borderColor: "var(--t-border)", borderRadius: "var(--t-radius)", background: "var(--t-surface)" }}
      >
        <span
          className="flex size-7 items-center justify-center rounded-lg text-sm"
          style={{ background: `color-mix(in srgb, ${model.primary} 20%, transparent)`, color: model.primary }}
        >
          {model.glyph}
        </span>
        {!compact && (
          <span className="leading-tight">
            <span className="block text-sm font-semibold" style={{ color: "var(--t-text)" }}>{model.name}</span>
            <span className="block text-[11px]" style={{ color: "var(--t-text-muted)" }}>
              {model.provider} · {model.price}
            </span>
          </span>
        )}
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} style={{ color: "var(--t-text-muted)" }} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.18, ease: EASE }}
            className="tt absolute left-0 z-40 mt-2 max-h-[480px] w-[340px] overflow-y-auto border p-2 shadow-lg"
            style={{ background: "var(--t-surface)", borderColor: "var(--t-border)", borderRadius: 16 }}
            role="listbox"
          >
            <div className="px-2 pb-2 pt-1 text-xs font-semibold" style={{ color: "var(--t-text)" }}>Model tanlang</div>

            {/* Auto — smart routing */}
            <button
              type="button"
              onClick={() => {
                onChange(AUTO_MODEL_ID);
                setOpen(false);
              }}
              className="tt mb-1 flex w-full items-start gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-white/5"
              style={value === AUTO_MODEL_ID ? { background: "color-mix(in srgb, var(--t-primary) 14%, transparent)" } : undefined}
            >
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg text-base" style={{ background: "color-mix(in srgb, #5B50F0 22%, transparent)", color: "#7C6FF7" }}>
                ✦
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-sm font-medium" style={{ color: "var(--t-text)" }}>SOVEREIGN Auto</span>
                  <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "rgba(91,80,240,0.2)", color: "#7C6FF7" }}>Aqlli</span>
                </span>
                <span className="block text-xs" style={{ color: "var(--t-text-muted)" }}>Savolga mos modelni o&apos;zi tanlaydi</span>
              </span>
              {value === AUTO_MODEL_ID && <Check className="mt-1 size-4 shrink-0" style={{ color: "#7C6FF7" }} />}
            </button>

            {MODEL_GROUPS.map((g) => {
              const items = MODELS.filter((m) => m.tier === g.tier && isModelVisible(m));
              if (!items.length) return null;
              const unlocked = planAllowsTier(plan, g.tier);
              return (
                <div key={g.tier} className="mb-1.5">
                  <div
                    className="flex items-center gap-1.5 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em]"
                    style={{ color: "var(--t-text-muted)", borderTop: "1px solid var(--t-border)" }}
                  >
                    {g.label} {g.badge && <span>{g.badge}</span>}
                    {!unlocked && (
                      <span className="ml-auto inline-flex items-center gap-1 normal-case tracking-normal" style={{ color: "#F59E0B" }}>
                        <Lock className="size-3" /> Upgrade
                      </span>
                    )}
                  </div>
                  {items.map((m) => {
                    const active = m.id === value;
                    const locked = !planAllowsTier(plan, m.tier);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        role="option"
                        aria-selected={active}
                        onClick={() => {
                          onChange(m.id);
                          setOpen(false);
                        }}
                        className={cn(
                          "tt flex w-full items-start gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-white/5",
                          locked && "opacity-55",
                        )}
                        style={active ? { background: `color-mix(in srgb, ${m.primary} 14%, transparent)` } : undefined}
                        title={locked ? "Bu model yuqoriroq tarifda ochiladi" : undefined}
                      >
                        <span
                          className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg text-base"
                          style={{ background: `color-mix(in srgb, ${m.primary} 20%, transparent)`, color: m.primary }}
                        >
                          {m.glyph}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium" style={{ color: "var(--t-text)" }}>{m.name}</span>
                            <span
                              className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                              style={{
                                background: m.cost === "free" ? "rgba(16,212,160,0.15)" : "color-mix(in srgb, var(--t-text) 8%, transparent)",
                                color: m.cost === "free" ? "#10D4A0" : "var(--t-text-muted)",
                              }}
                            >
                              {m.price}
                            </span>
                          </span>
                          <span className="block truncate text-xs" style={{ color: "var(--t-text-muted)" }}>{m.tagline}</span>
                          <Bars model={m} />
                        </span>
                        {locked ? (
                          <Lock className="mt-1 size-3.5 shrink-0" style={{ color: "#F59E0B" }} />
                        ) : (
                          active && <Check className="mt-1 size-4 shrink-0" style={{ color: m.primary }} />
                        )}
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
