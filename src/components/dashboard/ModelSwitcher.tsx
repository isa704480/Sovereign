"use client";

import { Check, ChevronDown, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { AUTO_MODEL, AUTO_MODEL_ID, MODEL_BY_ID, resolveModel } from "@/config/models";
import { type Plan } from "@/config/plans";
import { EASE } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { useT } from "@/store/chat";
import { useTheme } from "./theme-context";

interface ModelSwitcherProps {
  value: string;
  onChange: (id: string) => void;
  plan: Plan;
  compact?: boolean;
}

type OmniModel = { id: string; label: string; owner: string; context: number; tools: boolean; vision: boolean; reasoning: boolean };
type ModelFamily = { key: string; label: string; count: number; auto?: string };

export function ModelSwitcher({ value, onChange, compact }: ModelSwitcherProps) {
  const t = useT();
  const { model: themeModel } = useTheme();
  const isOmniValue = value !== AUTO_MODEL_ID && value.includes("/") && !MODEL_BY_ID[value];
  const model = value === AUTO_MODEL_ID ? AUTO_MODEL : isOmniValue ? themeModel : resolveModel(value);
  const [open, setOpen] = useState(false);

  // OmniRoute katalog (1700+ model) — Cursor uslubi: oila → ichida modellar.
  const [q, setQ] = useState("");
  const [families, setFamilies] = useState<ModelFamily[] | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [activeFamily, setActiveFamily] = useState<ModelFamily | null>(null);
  const [catalog, setCatalog] = useState<{ total: number; models: OmniModel[] } | null>(null);
  const [loading, setLoading] = useState(false);

  // Oilalar ro'yxatini menyu ochilganda bir marta yuklaymiz.
  useEffect(() => {
    if (!open || families) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/models?families=1");
        const data = await res.json();
        if (alive) {
          setFamilies(data.families ?? []);
          setConfigured(data.configured !== false);
        }
      } catch {
        if (alive) setConfigured(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [open, families]);

  // Oila tanlanganda yoki qidiruvda — modellarni yuklaymiz.
  useEffect(() => {
    if (!open) return;
    const query = q.trim();
    if (!query && !activeFamily) return; // oilalar ko'rinishi — model ro'yxati ko'rsatilmaydi
    let alive = true;
    const id = setTimeout(async () => {
      if (alive) setLoading(true);
      try {
        const params = new URLSearchParams({ limit: "50" });
        if (query) params.set("q", query);
        if (activeFamily && !query) params.set("family", activeFamily.key);
        const res = await fetch(`/api/models?${params.toString()}`);
        const data = await res.json();
        if (alive) setCatalog(data);
      } catch {
        if (alive) setCatalog({ total: 0, models: [] });
      } finally {
        if (alive) setLoading(false);
      }
    }, query ? 280 : 0);
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [q, open, activeFamily]);

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
            <span className="block text-sm font-semibold" style={{ color: "var(--t-text)" }}>
              {isOmniValue ? (value.split("/").pop() ?? value) : model.name}
            </span>
            <span className="block text-[11px]" style={{ color: "var(--t-text-muted)" }}>
              {isOmniValue ? "OmniRoute · TEKIN" : `${model.provider} · ${model.price}`}
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
            <div className="px-2 pb-2 pt-1 text-xs font-semibold" style={{ color: "var(--t-text)" }}>{t("selectModel")}</div>

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
                  <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "rgba(91,80,240,0.2)", color: "#7C6FF7" }}>{t("autoSmart")}</span>
                </span>
                <span className="block text-xs" style={{ color: "var(--t-text-muted)" }}>{t("autoModelDesc")}</span>
              </span>
              {value === AUTO_MODEL_ID && <Check className="mt-1 size-4 shrink-0" style={{ color: "#7C6FF7" }} />}
            </button>

            {/* OmniRoute katalog — Cursor uslubi: oila → ichida modellar */}
            {configured !== false && (
              <div className="mt-1.5">
                <div
                  className="flex items-center gap-1.5 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em]"
                  style={{ color: "var(--t-text-muted)", borderTop: "1px solid var(--t-border)" }}
                >
                  {activeFamily && !q ? (
                    <button type="button" onClick={() => setActiveFamily(null)} className="flex items-center gap-1 hover:opacity-80">
                      <ChevronLeft className="size-3.5" /> {activeFamily.label}
                    </button>
                  ) : (
                    <>Barcha modellar</>
                  )}
                  <span className="ml-auto rounded-full px-1.5 py-0.5 text-[9px] font-semibold normal-case tracking-normal" style={{ background: "rgba(16,212,160,0.15)", color: "#10D4A0" }}>
                    TEKIN
                  </span>
                </div>

                {/* Qidiruv — istalgan bosqichda hamma bo'yicha qidiradi */}
                <div className="relative mb-1 px-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2" style={{ color: "var(--t-text-muted)" }} />
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="qidirish: claude, gemini, deepseek…"
                    className="w-full rounded-lg border bg-transparent py-1.5 pl-8 pr-2 text-xs outline-none"
                    style={{ borderColor: "var(--t-border)", color: "var(--t-text)" }}
                  />
                </div>

                {/* 1-bosqich: oilalar ro'yxati (qidiruvsiz, oila tanlanmagan) */}
                {!q && !activeFamily && (
                  <>
                    {!families && <div className="px-3 py-2 text-xs" style={{ color: "var(--t-text-muted)" }}>Yuklanyapti…</div>}
                    {families?.map((f) => (
                      <button
                        key={f.key}
                        type="button"
                        onClick={() => {
                          setCatalog(null);
                          setActiveFamily(f);
                        }}
                        className="tt flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-white/5"
                      >
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-md text-xs" style={{ background: "color-mix(in srgb, #7C6FF7 20%, transparent)", color: "#7C6FF7" }}>✦</span>
                        <span className="flex-1 truncate text-xs font-medium" style={{ color: "var(--t-text)" }}>{f.label}</span>
                        <span className="text-[10px]" style={{ color: "var(--t-text-muted)" }}>{f.count}</span>
                        <ChevronRight className="size-3.5" style={{ color: "var(--t-text-muted)" }} />
                      </button>
                    ))}
                  </>
                )}

                {/* 2-bosqich: oila ichidagi modellar (yoki qidiruv natijalari) */}
                {(q || activeFamily) && (
                  <>
                    {/* Oila "auto" — eng yaxshisini AI/OmniRoute tanlaydi */}
                    {!q && activeFamily?.auto && (
                      <button
                        type="button"
                        onClick={() => {
                          onChange(activeFamily.auto!);
                          setOpen(false);
                        }}
                        className="tt mb-0.5 flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-white/5"
                        style={value === activeFamily.auto ? { background: "color-mix(in srgb, #7C6FF7 14%, transparent)" } : undefined}
                      >
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-md text-xs" style={{ background: "rgba(91,80,240,0.22)", color: "#7C6FF7" }}>✦</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-medium" style={{ color: "var(--t-text)" }}>{activeFamily.label} — Auto</span>
                          <span className="block text-[10px]" style={{ color: "var(--t-text-muted)" }}>eng yaxshisini avtomatik tanlaydi</span>
                        </span>
                        {value === activeFamily.auto && <Check className="size-4 shrink-0" style={{ color: "#7C6FF7" }} />}
                      </button>
                    )}
                    {loading && <div className="px-3 py-2 text-xs" style={{ color: "var(--t-text-muted)" }}>Qidirilyapti…</div>}
                    {!loading && catalog?.models?.length === 0 && (
                      <div className="px-3 py-2 text-xs" style={{ color: "var(--t-text-muted)" }}>Hech narsa topilmadi.</div>
                    )}
                    {!loading &&
                      catalog?.models?.map((m) => {
                        const active = m.id === value;
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
                            className="tt flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-white/5"
                            style={active ? { background: "color-mix(in srgb, #7C6FF7 14%, transparent)" } : undefined}
                          >
                            <span className="flex size-6 shrink-0 items-center justify-center rounded-md text-xs" style={{ background: "color-mix(in srgb, #7C6FF7 20%, transparent)", color: "#7C6FF7" }}>✦</span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-xs font-medium" style={{ color: "var(--t-text)" }}>{m.id}</span>
                              <span className="block truncate text-[10px]" style={{ color: "var(--t-text-muted)" }}>
                                {m.owner}
                                {m.context ? ` · ${Math.round(m.context / 1000)}k` : ""}
                                {m.tools ? " · 🔧" : ""}
                                {m.vision ? " · 👁" : ""}
                                {m.reasoning ? " · 🧠" : ""}
                              </span>
                            </span>
                            {active && <Check className="size-4 shrink-0" style={{ color: "#7C6FF7" }} />}
                          </button>
                        );
                      })}
                  </>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
