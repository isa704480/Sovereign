"use client";

import { Check, ChevronDown, ChevronLeft, ChevronRight, Lock, Search } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { AUTO_MODEL, AUTO_MODEL_ID, MODEL_BY_ID, resolveModel } from "@/config/models";
import { planAllowsTier, type Plan } from "@/config/plans";
import { EASE } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { useLang, useT } from "@/store/chat";
import { featuredLabel, featuredNote, modelPrice, modelProvider } from "@/lib/locales/chat-data";
import { useTheme } from "./theme-context";

interface ModelSwitcherProps {
  value: string;
  onChange: (id: string) => void;
  plan: Plan;
  compact?: boolean;
}

type OmniModel = { id: string; label: string; owner: string; context: number; tools: boolean; vision: boolean; reasoning: boolean };
type ModelFamily = { key: string; label: string; count: number; auto?: string };

/**
 * Katalog id → o'qiladigan nom: "cfp/deepseek-ai/deepseek-v4-flash" → "Deepseek V4 Flash".
 * Provayder prefikslari (cfp/, groq/ ...) foydalanuvchiga ko'rsatilmaydi.
 */
function prettyModelId(id: string): string {
  const tail = id.split("/").pop() || id;
  return tail
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase())
    .trim();
}

/** Ichki marshrutlovchi nomini foydalanuvchidan yashiramiz. */
function publicOwner(owner: string): string {
  return /omni\s*-?route/i.test(owner) ? "" : owner;
}

export function ModelSwitcher({ value, onChange, plan, compact }: ModelSwitcherProps) {
  const t = useT();
  const lang = useLang();
  const { model: themeModel } = useTheme();
  const isOmniValue = value !== AUTO_MODEL_ID && value.includes("/") && !MODEL_BY_ID[value];
  const model = value === AUTO_MODEL_ID ? AUTO_MODEL : isOmniValue ? themeModel : resolveModel(value);
  const [open, setOpen] = useState(false);

  // OmniRoute katalog (1700+ model) — Cursor uslubi: oila → ichida modellar.
  const [q, setQ] = useState("");
  const [families, setFamilies] = useState<ModelFamily[] | null>(null);
  const [featured, setFeatured] = useState<{ id: string; label: string; note: string }[]>([]);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [activeFamily, setActiveFamily] = useState<ModelFamily | null>(null);
  const [catalog, setCatalog] = useState<{ total: number; models: OmniModel[] } | null>(null);
  const [loading, setLoading] = useState(false);

  // Katalog (OmniRoute) modellari Pro+ tarifda ochiladi. Free/Starter — qulf.
  // Tekin ✦ tavsiya modellari va Auto barcha tariflarda ochiq.
  const catalogLocked = !planAllowsTier(plan, "pro");
  // Tanlangan katalog modelining nomi (ro'yxatdan kelgan label) — tugmada id o'rniga.
  const [pickedLabel, setPickedLabel] = useState<{ id: string; label: string } | null>(null);
  const valueLabel = pickedLabel?.id === value ? pickedLabel.label : prettyModelId(value);
  const choose = (id: string, label?: string) => {
    if (label) setPickedLabel({ id, label });
    onChange(id);
    setOpen(false);
  };
  const upgrade = () => {
    setOpen(false);
    window.dispatchEvent(new CustomEvent("sovereign:upgrade"));
  };

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
          setFeatured(data.featured ?? []);
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
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Dashboard'ning global Esc (oqimni to'xtatish) ishlamasin — Esc faqat menyuni yopadi.
      e.preventDefault();
      setOpen(false);
    };
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
        aria-label={compact ? t("selectModel") : undefined}
        className="tt flex min-w-0 items-center gap-2.5 border px-2.5 py-1.5 text-left transition-colors hover:bg-white/5"
        style={{ borderColor: "var(--t-border)", borderRadius: "var(--t-radius)", background: "var(--t-surface)" }}
      >
        <span
          className="flex size-7 items-center justify-center rounded-lg text-sm"
          style={{ background: `color-mix(in srgb, ${model.primary} 20%, transparent)`, color: model.primary }}
        >
          {model.glyph}
        </span>
        {!compact && (
          <span className="min-w-0 leading-tight">
            <span className="block max-w-[200px] truncate text-sm font-semibold" style={{ color: "var(--t-text)" }}>
              {isOmniValue ? valueLabel : model.name}
            </span>
            <span className="block text-xs" style={{ color: "var(--t-text-muted)" }}>
              {isOmniValue
                ? catalogLocked
                  ? t("uxFreeModel")
                  : t("uxCatalogModel")
                : `${modelProvider(lang, model)} · ${modelPrice(lang, model)}`}
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
            className="tt absolute left-0 z-40 mt-2 max-h-[min(480px,calc(100svh-96px))] w-[min(340px,calc(100vw-24px))] overflow-y-auto border p-2 shadow-lg"
            style={{ background: "var(--t-surface)", borderColor: "var(--t-border)", borderRadius: 16 }}
            role="dialog"
            aria-label={t("selectModel")}
          >
            <div className="px-2 pb-2 pt-1 text-xs font-semibold" style={{ color: "var(--t-text)" }}>{t("selectModel")}</div>

            {/* Auto — smart routing */}
            <button
              type="button"
              aria-current={value === AUTO_MODEL_ID || undefined}
              onClick={() => choose(AUTO_MODEL_ID)}
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

            {/* Free/Starter: bitta tushuntirish — nima ochiq, nima Pro'da */}
            {catalogLocked && (
              <button
                type="button"
                onClick={upgrade}
                className="mb-1 flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs transition-colors hover:opacity-90"
                style={{ background: "rgba(245,158,11,0.10)", color: "#F5B544" }}
              >
                <Lock className="size-3.5 shrink-0" />
                <span className="flex-1">{t("uxFreePlanBanner")}</span>
                <ChevronRight className="size-3.5 shrink-0" />
              </button>
            )}

            {/* Katalog — Cursor uslubi: oila → ichida modellar */}
            {configured !== false && (
              <div className="mt-1.5">
                <div
                  className="flex items-center gap-1.5 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em]"
                  style={{ color: "var(--t-text-muted)", borderTop: "1px solid var(--t-border)" }}
                >
                  {activeFamily && !q ? (
                    <button type="button" onClick={() => setActiveFamily(null)} className="flex items-center gap-1 hover:opacity-80">
                      <ChevronLeft className="size-3.5" /> {activeFamily.key === "boshqa" ? t("onbOther") : activeFamily.label}
                    </button>
                  ) : (
                    <>{t("chAllModels")}</>
                  )}
                  {/* Belgilar izohi: 🔧 asboblar · 👁 rasm · 🧠 fikrlash */}
                  <span className="ml-auto flex items-center gap-1.5 normal-case tracking-normal" aria-hidden>
                    <span title={t("uxCapTools")}>🔧</span>
                    <span title={t("uxCapVision")}>👁</span>
                    <span title={t("uxCapReasoning")}>🧠</span>
                  </span>
                </div>
                <p className="sr-only">
                  🔧 {t("uxCapTools")} · 👁 {t("uxCapVision")} · 🧠 {t("uxCapReasoning")}
                </p>

                {/* Qidiruv — istalgan bosqichda hamma bo'yicha qidiradi */}
                <div className="relative mb-1 px-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2" style={{ color: "var(--t-text-muted)" }} />
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder={t("chSearchModels")}
                    aria-label={t("chSearchModels")}
                    className="w-full rounded-lg border bg-transparent py-1.5 pl-8 pr-2 text-xs outline-none"
                    style={{ borderColor: "var(--t-border)", color: "var(--t-text)" }}
                  />
                </div>

                {/* Tekin ✦ — tavsiya (saxiy, ≥20M/oy) */}
                {!q && !activeFamily && featured.length > 0 && (
                  <>
                    <div className="flex items-center gap-1.5 px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--t-text-muted)" }}>
                      {t("chFreeRecommended")}
                      <span className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold normal-case tracking-normal" style={{ background: "rgba(16,212,160,0.15)", color: "#10D4A0" }}>{t("chPerMonthTokens")}</span>
                    </div>
                    {featured.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        aria-current={value === m.id || undefined}
                        onClick={() => choose(m.id, featuredLabel(lang, m.id, m.label))}
                        className="tt flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-white/5"
                        style={value === m.id ? { background: "color-mix(in srgb, #10D4A0 12%, transparent)" } : undefined}
                      >
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-md text-xs" style={{ background: "rgba(16,212,160,0.18)", color: "#10D4A0" }}>✦</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-medium" style={{ color: "var(--t-text)" }}>{featuredLabel(lang, m.id, m.label)}</span>
                          <span className="block truncate text-xs" style={{ color: "var(--t-text-muted)" }}>{featuredNote(lang, m.id, m.note)}</span>
                        </span>
                        {value === m.id && <Check className="size-4 shrink-0" style={{ color: "#10D4A0" }} />}
                      </button>
                    ))}
                    <div className="my-1.5 h-px" style={{ background: "var(--t-border)" }} />
                  </>
                )}

                {/* 1-bosqich: oilalar ro'yxati (qidiruvsiz, oila tanlanmagan) */}
                {!q && !activeFamily && (
                  <>
                    {!families && <div className="px-3 py-2 text-xs" style={{ color: "var(--t-text-muted)" }}>{t("chLoading")}</div>}
                    {families?.map((f) => (
                      <button
                        key={f.key}
                        type="button"
                        onClick={() => {
                          if (catalogLocked) { upgrade(); return; }
                          setCatalog(null);
                          setActiveFamily(f);
                        }}
                        className={cn("tt flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-white/5", catalogLocked && "opacity-70")}
                        title={catalogLocked ? t("chProUnlock") : undefined}
                      >
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-md text-xs" style={{ background: "color-mix(in srgb, #7C6FF7 20%, transparent)", color: "#7C6FF7" }}>✦</span>
                        <span className="flex-1 truncate text-xs font-medium" style={{ color: "var(--t-text)" }}>{f.key === "boshqa" ? t("onbOther") : f.label}</span>
                        <span className="text-[10px]" style={{ color: "var(--t-text-muted)" }}>{f.count}</span>
                        {catalogLocked ? <Lock className="size-3.5" style={{ color: "#F59E0B" }} /> : <ChevronRight className="size-3.5" style={{ color: "var(--t-text-muted)" }} />}
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
                          if (catalogLocked) { upgrade(); return; }
                          choose(activeFamily.auto!, `${activeFamily.label} Auto`);
                        }}
                        className="tt mb-0.5 flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-white/5"
                        style={value === activeFamily.auto ? { background: "color-mix(in srgb, #7C6FF7 14%, transparent)" } : undefined}
                      >
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-md text-xs" style={{ background: "rgba(91,80,240,0.22)", color: "#7C6FF7" }}>✦</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-medium" style={{ color: "var(--t-text)" }}>{activeFamily.label} — Auto</span>
                          <span className="block text-xs" style={{ color: "var(--t-text-muted)" }}>{t("chFamilyAutoDesc")}</span>
                        </span>
                        {value === activeFamily.auto && <Check className="size-4 shrink-0" style={{ color: "#7C6FF7" }} />}
                      </button>
                    )}
                    {loading && <div className="px-3 py-2 text-xs" style={{ color: "var(--t-text-muted)" }}>{t("chSearching")}</div>}
                    {!loading && catalog?.models?.length === 0 && (
                      <div className="px-3 py-2 text-xs" style={{ color: "var(--t-text-muted)" }}>{t("nothingFound")}</div>
                    )}
                    {!loading &&
                      catalog?.models?.map((m) => {
                        const active = m.id === value;
                        return (
                          <button
                            key={m.id}
                            type="button"
                            aria-current={active || undefined}
                            onClick={() => {
                              if (catalogLocked) { upgrade(); return; }
                              choose(m.id, prettyModelId(m.id));
                            }}
                            className={cn("tt flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-white/5", catalogLocked && "opacity-70")}
                            style={active ? { background: "color-mix(in srgb, #7C6FF7 14%, transparent)" } : undefined}
                            title={catalogLocked ? t("chProUnlock") : undefined}
                          >
                            <span className="flex size-6 shrink-0 items-center justify-center rounded-md text-xs" style={{ background: "color-mix(in srgb, #7C6FF7 20%, transparent)", color: "#7C6FF7" }}>✦</span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-xs font-medium" style={{ color: "var(--t-text)" }}>{prettyModelId(m.id)}</span>
                              <span className="block truncate text-xs" style={{ color: "var(--t-text-muted)" }}>
                                {[publicOwner(m.owner), m.context ? `${Math.round(m.context / 1000)}k` : ""].filter(Boolean).join(" · ")}
                                {m.tools ? <span title={t("uxCapTools")}> · 🔧</span> : null}
                                {m.vision ? <span title={t("uxCapVision")}> · 👁</span> : null}
                                {m.reasoning ? <span title={t("uxCapReasoning")}> · 🧠</span> : null}
                              </span>
                            </span>
                            {catalogLocked ? <Lock className="size-3.5 shrink-0" style={{ color: "#F59E0B" }} /> : active && <Check className="size-4 shrink-0" style={{ color: "#7C6FF7" }} />}
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
