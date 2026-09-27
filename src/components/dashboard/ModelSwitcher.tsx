"use client";

import { Boxes, Brain, Check, ChevronDown, ChevronLeft, ChevronRight, Eye, Globe2, Lock, Search, Wrench } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { AUTO_MODEL, AUTO_MODEL_ID, MODEL_BY_ID, resolveModel } from "@/config/models";
import { planAllowsTier, type Plan } from "@/config/plans";
import { countryName } from "@/config/countries";
import { EASE } from "@/lib/motion";
import { fmt } from "@/lib/i18n";
import { modelAllowedIn } from "@/lib/ai/region";
import { useRegion } from "@/hooks/use-region";
import { cn } from "@/lib/utils";
import { useLang, useT } from "@/store/chat";
import { featuredLabel, featuredNote, modelPrice, modelProvider } from "@/lib/locales/chat-data";
import { useTheme } from "./theme-context";
import { LogoMark } from "@/components/brand/Logo";
import { ModelAvatar, ProviderMark } from "./ModelAvatar";
import { LoadError } from "./LoadState";

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

/** Ro'yxat qatoridagi kichik belgi katakchasi (provayder belgisi, bir rangli). */
function MarkCell({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="flex size-6 shrink-0 items-center justify-center rounded-md"
      style={{ background: "color-mix(in srgb, var(--t-text) 6%, transparent)", color: "var(--t-text)" }}
      aria-hidden
    >
      {children}
    </span>
  );
}

/** Imkoniyat belgilari (emoji emas): asboblar · rasm · fikrlash. */
function CapIcons({ tools, vision, reasoning, t }: { tools?: boolean; vision?: boolean; reasoning?: boolean; t: (k: "uxCapTools" | "uxCapVision" | "uxCapReasoning") => string }) {
  return (
    <>
      {tools ? <Wrench className="ml-1 inline size-3 align-[-2px]" aria-label={t("uxCapTools")} /> : null}
      {vision ? <Eye className="ml-1 inline size-3 align-[-2px]" aria-label={t("uxCapVision")} /> : null}
      {reasoning ? <Brain className="ml-1 inline size-3 align-[-2px]" aria-label={t("uxCapReasoning")} /> : null}
    </>
  );
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
  const focusOnOpen = useRef(false);

  // OmniRoute katalog (1750+ model) — Cursor uslubi: oila → ichida modellar.
  const [q, setQ] = useState("");
  const [families, setFamilies] = useState<ModelFamily[] | null>(null);
  const [featured, setFeatured] = useState<{ id: string; label: string; note: string }[]>([]);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [activeFamily, setActiveFamily] = useState<ModelFamily | null>(null);
  const [catalog, setCatalog] = useState<{ total: number; models: OmniModel[] } | null>(null);
  const [loading, setLoading] = useState(false);
  // Yuklash xatolari bo'sh ro'yxat sifatida emas, sabab + "Qayta urinish" bilan ko'rsatiladi.
  const [famError, setFamError] = useState(false);
  const [catError, setCatError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  // Katalog (OmniRoute) modellari Pro+ tarifda ochiladi. Free/Starter — qulf.
  // Tekin ✦ tavsiya modellari va Auto barcha tariflarda ochiq.
  const catalogLocked = !planAllowsTier(plan, "pro");
  // Mintaqa siyosati: provayderi foydalanuvchi mintaqasiga xizmat ko'rsatmaydigan modellar
  // "mavjud emas" deb ko'rsatiladi (tanlab bo'lmaydi). Cheklovning o'zi serverda (/api/chat).
  const region = useRegion();
  const regionCountry = region.restricted ? region.country : null;
  const regionBlocked = (id: string) => !!regionCountry && !modelAllowedIn(id, regionCountry);
  const regionNote = t("p10RegionUnavailable");
  // Tanlangan katalog modelining nomi (ro'yxatdan kelgan label) — tugmada id o'rniga.
  const [pickedLabel, setPickedLabel] = useState<{ id: string; label: string } | null>(null);
  // Tekin ✦ tavsiya nomlari joriy tilda har renderda hisoblanadi (reload/til almashsa ham tarjimali).
  const valueLabel = featuredLabel(lang, value, pickedLabel?.id === value ? pickedLabel.label : prettyModelId(value));
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
    if (!open || families || famError) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/models?families=1");
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        if (alive) {
          setFamilies(data.families ?? []);
          setFeatured(data.featured ?? []);
          setConfigured(data.configured !== false);
        }
      } catch {
        if (alive) setFamError(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [open, families, famError]);

  // Oila tanlanganda yoki qidiruvda — modellarni yuklaymiz.
  useEffect(() => {
    if (!open) return;
    const query = q.trim();
    if (!query && !activeFamily) return; // oilalar ko'rinishi — model ro'yxati ko'rsatilmaydi
    let alive = true;
    const id = setTimeout(async () => {
      if (alive) {
        setLoading(true);
        setCatError(false);
      }
      try {
        const params = new URLSearchParams({ limit: "50" });
        if (query) params.set("q", query);
        if (activeFamily && !query) params.set("family", activeFamily.key);
        const res = await fetch(`/api/models?${params.toString()}`);
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        if (alive) setCatalog(data);
      } catch {
        if (alive) {
          setCatalog(null);
          setCatError(true);
        }
      } finally {
        if (alive) setLoading(false);
      }
    }, query ? 280 : 0);
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [q, open, activeFamily, retryKey]);

  // Ctrl+K (Dashboard) shu hodisani yuboradi — menyu ochiladi.
  useEffect(() => {
    const onOpen = () => {
      focusOnOpen.current = true;
      setOpen(true);
    };
    window.addEventListener("sovereign:open-model", onOpen);
    return () => window.removeEventListener("sovereign:open-model", onOpen);
  }, []);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Ctrl+K bilan ochilganda fokus menyuga o'tadi (yozilgan matn chat maydoniga ketmasin).
  // Sichqoncha/teginish bilan ochilganda mobil klaviatura o'z-o'zidan chiqmasin.
  useEffect(() => {
    if (!open || !focusOnOpen.current) return;
    focusOnOpen.current = false;
    const id = window.setTimeout(() => {
      const target = searchRef.current ?? popRef.current?.querySelector<HTMLElement>("button");
      target?.focus();
    }, 0);
    return () => window.clearTimeout(id);
  }, [open]);

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
      triggerRef.current?.focus();
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
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={compact ? t("selectModel") : undefined}
        className="tt flex min-h-11 min-w-0 items-center gap-2 border px-2 py-1 text-left transition-colors hover:bg-[var(--surface-hover)] sm:gap-2.5 sm:px-2.5 sm:py-1.5"
        style={{ borderColor: "var(--t-border)", borderRadius: "var(--t-radius)", background: "var(--t-surface)" }}
      >
        {isOmniValue ? (
          <ModelAvatar modelId={value} size={28} />
        ) : (
          <ModelAvatar model={model} size={28} />
        )}
        {!compact && (
          <span className="min-w-0 leading-tight">
            <span className="block max-w-[112px] truncate text-sm font-semibold sm:max-w-[200px]" style={{ color: "var(--t-text)" }}>
              {isOmniValue ? valueLabel : model.name}
            </span>
            <span className="hidden max-w-[200px] truncate text-xs sm:block" style={{ color: "var(--t-text-muted)" }}>
              {regionBlocked(value)
                ? regionNote
                : isOmniValue
                  ? catalogLocked
                    ? t("uxFreeModel")
                    : t("uxCatalogModel")
                  : `${modelProvider(lang, model)} · ${modelPrice(lang, model)}`}
            </span>
          </span>
        )}
        <ChevronDown className={cn("size-4 shrink-0 transition-transform motion-reduce:transition-none", open && "rotate-180")} style={{ color: "var(--t-text-muted)" }} aria-hidden />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.18, ease: EASE }}
            // Telefonda ekran chetlariga yopishgan (inset-x-3), kattaroq ekranda tugma ostida.
            className="tt fixed inset-x-3 top-14 z-40 max-h-[min(480px,calc(100svh-72px))] overflow-y-auto rounded-xl border p-2 sm:absolute sm:inset-x-auto sm:left-0 sm:top-auto sm:mt-2 sm:w-[340px] sm:max-h-[min(480px,calc(100svh-96px))]"
            style={{
              background: "var(--t-surface)",
              borderColor: "var(--t-border)",
              boxShadow: "0 2px 8px rgba(0,0,0,0.3), 0 20px 50px rgba(0,0,0,0.45)",
            }}
            ref={popRef}
            role="dialog"
            aria-label={t("selectModel")}
          >
            <div className="px-2 pb-2 pt-1 text-xs font-semibold" style={{ color: "var(--t-text)" }}>{t("selectModel")}</div>

            {/* Auto — smart routing */}
            <button
              type="button"
              aria-current={value === AUTO_MODEL_ID || undefined}
              onClick={() => choose(AUTO_MODEL_ID)}
              className="tt mb-1 flex min-h-11 w-full items-start gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-[var(--surface-hover)]"
              style={value === AUTO_MODEL_ID ? { background: "var(--surface-active)" } : undefined}
            >
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg" style={{ background: "color-mix(in srgb, var(--t-text) 6%, transparent)" }} aria-hidden>
                <LogoMark size={20} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-sm font-medium" style={{ color: "var(--t-text)" }}>SOVEREIGN Auto</span>
                  <span className="rounded-full px-1.5 py-0.5 text-[11px] font-semibold" style={{ background: "color-mix(in srgb, var(--t-primary) 20%, transparent)", color: "var(--t-accent-text)" }}>{t("autoSmart")}</span>
                </span>
                <span className="block text-xs" style={{ color: "var(--t-text-muted)" }}>{t("autoModelDesc")}</span>
              </span>
              {value === AUTO_MODEL_ID && <Check className="mt-1 size-4 shrink-0" style={{ color: "var(--t-accent-text)" }} aria-hidden />}
            </button>

            {/* Mintaqa: qaysi modellar ishlaydi — bitta qator tushuntirish */}
            {regionCountry && (
              <p
                className="mb-1 flex items-start gap-2 rounded-lg px-2.5 py-2 text-xs"
                style={{ background: "color-mix(in srgb, var(--t-info) 10%, transparent)", color: "var(--t-text-muted)" }}
                data-testid="region-banner"
              >
                <Globe2 className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span className="flex-1">{fmt(t("p10RegionBanner"), { country: countryName(regionCountry, lang) })}</span>
              </p>
            )}

            {/* Free/Starter: bitta tushuntirish — nima ochiq, nima Pro'da */}
            {catalogLocked && (
              <button
                type="button"
                onClick={upgrade}
                className="mb-1 flex min-h-11 w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors hover:opacity-90"
                style={{ background: "color-mix(in srgb, var(--t-warning) 10%, transparent)", color: "var(--t-warning)" }}
              >
                <Lock className="size-3.5 shrink-0" aria-hidden />
                <span className="flex-1">{t("uxFreePlanBanner")}</span>
                <ChevronRight className="size-3.5 shrink-0" aria-hidden />
              </button>
            )}

            {/* Katalog — Cursor uslubi: oila → ichida modellar */}
            {famError && (
              <LoadError
                className="py-4"
                onRetry={() => {
                  setFamError(false);
                  setFamilies(null);
                }}
              />
            )}

            {!famError && configured !== false && (
              <div className="mt-1.5">
                <div
                  className="flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em]"
                  style={{ color: "var(--t-text-muted)", borderTop: "1px solid var(--t-border)" }}
                >
                  {activeFamily && !q ? (
                    <button type="button" onClick={() => setActiveFamily(null)} className="flex min-h-8 items-center gap-1 hover:opacity-80 [@media(pointer:coarse)]:min-h-11">
                      <ChevronLeft className="size-3.5" aria-hidden /> {activeFamily.key === "boshqa" ? t("onbOther") : activeFamily.label}
                    </button>
                  ) : (
                    <>{t("chAllModels")}</>
                  )}
                  {/* Belgilar izohi: asboblar · rasm · fikrlash */}
                  <span className="ml-auto flex items-center gap-1.5 normal-case tracking-normal" aria-hidden>
                    <span title={t("uxCapTools")}><Wrench className="size-3" /></span>
                    <span title={t("uxCapVision")}><Eye className="size-3" /></span>
                    <span title={t("uxCapReasoning")}><Brain className="size-3" /></span>
                  </span>
                </div>
                <p className="sr-only">
                  {t("uxCapTools")} · {t("uxCapVision")} · {t("uxCapReasoning")}
                </p>

                {/* Qidiruv — istalgan bosqichda hamma bo'yicha qidiradi */}
                <div className="relative mb-1 px-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2" style={{ color: "var(--t-text-muted)" }} aria-hidden />
                  <input
                    ref={searchRef}
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder={t("chSearchModels")}
                    aria-label={t("chSearchModels")}
                    className="min-h-9 w-full rounded-lg border bg-transparent py-1.5 pl-8 pr-2 text-[16px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--t-primary)] sm:text-xs"
                    style={{ borderColor: "var(--t-border)", color: "var(--t-text)" }}
                  />
                </div>

                {/* Tekin ✦ — tavsiya (saxiy, ≥20M/oy) */}
                {!q && !activeFamily && featured.length > 0 && (
                  <>
                    <div className="flex items-center gap-1.5 px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--t-text-muted)" }}>
                      {t("chFreeRecommended")}
                      <span className="rounded-full px-1.5 py-0.5 text-[11px] font-semibold normal-case tracking-normal" style={{ background: "color-mix(in srgb, var(--t-success) 14%, transparent)", color: "var(--t-success)" }}>{t("chPerMonthTokens")}</span>
                    </div>
                    {featured.map((m) => {
                      const blocked = regionBlocked(m.id);
                      return (
                      <button
                        key={m.id}
                        type="button"
                        aria-current={value === m.id || undefined}
                        disabled={blocked}
                        onClick={() => choose(m.id, featuredLabel(lang, m.id, m.label))}
                        className={cn("tt flex min-h-11 w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-[var(--surface-hover)]", blocked && "cursor-not-allowed opacity-50 hover:bg-transparent")}
                        style={value === m.id ? { background: "var(--surface-active)" } : undefined}
                        title={blocked ? regionNote : undefined}
                      >
                        <MarkCell><ProviderMark modelId={m.id} px={14} /></MarkCell>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-medium" style={{ color: "var(--t-text)" }}>{featuredLabel(lang, m.id, m.label)}</span>
                          <span className="block truncate text-xs" style={{ color: "var(--t-text-muted)" }}>{blocked ? regionNote : featuredNote(lang, m.id, m.note)}</span>
                        </span>
                        {blocked ? <Globe2 className="size-3.5 shrink-0" style={{ color: "var(--t-text-muted)" }} aria-hidden /> : value === m.id && <Check className="size-4 shrink-0" style={{ color: "var(--t-accent-text)" }} aria-hidden />}
                      </button>
                      );
                    })}
                    <div className="my-1.5 h-px" style={{ background: "var(--t-border)" }} />
                  </>
                )}

                {/* 1-bosqich: oilalar ro'yxati (qidiruvsiz, oila tanlanmagan) */}
                {!q && !activeFamily && (
                  <>
                    {!families && (
                      <div className="space-y-1 px-1 py-1" role="status" aria-label={t("chLoading")}>
                        {[0, 1, 2, 3].map((i) => (
                          <div key={i} className="h-9 animate-pulse rounded-lg motion-reduce:animate-none" style={{ background: "color-mix(in srgb, var(--t-text) 6%, transparent)" }} />
                        ))}
                      </div>
                    )}
                    {families?.map((f) => {
                      // Butun oila (Claude, GPT, Gemini ...) mintaqada yopiq — "boshqa" aralash, ichida tekshiriladi.
                      const famBlocked = f.key !== "boshqa" && regionBlocked(f.key);
                      return (
                      <button
                        key={f.key}
                        type="button"
                        disabled={famBlocked}
                        onClick={() => {
                          if (catalogLocked) { upgrade(); return; }
                          setCatalog(null);
                          setActiveFamily(f);
                        }}
                        className={cn("tt flex min-h-11 w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-[var(--surface-hover)]", catalogLocked && "opacity-70", famBlocked && "cursor-not-allowed opacity-50 hover:bg-transparent")}
                        title={famBlocked ? regionNote : catalogLocked ? t("chProUnlock") : undefined}
                      >
                        <MarkCell>{f.key === "boshqa" ? <Boxes className="size-3.5" /> : <ProviderMark modelId={f.key} px={14} />}</MarkCell>
                        <span className="flex-1 truncate text-xs font-medium" style={{ color: "var(--t-text)" }}>{f.key === "boshqa" ? t("onbOther") : f.label}</span>
                        <span className="text-xs tabular-nums" style={{ color: "var(--t-text-muted)" }}>{f.count}</span>
                        {famBlocked ? (
                          <Globe2 className="size-3.5" style={{ color: "var(--t-text-muted)" }} aria-label={regionNote} />
                        ) : catalogLocked ? (
                          <Lock className="size-3.5" style={{ color: "var(--t-warning)" }} aria-hidden />
                        ) : (
                          <ChevronRight className="size-3.5" style={{ color: "var(--t-text-muted)" }} aria-hidden />
                        )}
                      </button>
                      );
                    })}
                  </>
                )}

                {/* 2-bosqich: oila ichidagi modellar (yoki qidiruv natijalari) */}
                {(q || activeFamily) && (
                  <>
                    {/* Oila "auto" — eng yaxshisini AI/OmniRoute tanlaydi */}
                    {!q && activeFamily?.auto && !regionBlocked(activeFamily.auto) && (
                      <button
                        type="button"
                        onClick={() => {
                          if (catalogLocked) { upgrade(); return; }
                          choose(activeFamily.auto!, `${activeFamily.label} Auto`);
                        }}
                        className="tt mb-0.5 flex min-h-11 w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-[var(--surface-hover)]"
                        style={value === activeFamily.auto ? { background: "var(--surface-active)" } : undefined}
                      >
                        <MarkCell><LogoMark size={14} /></MarkCell>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-medium" style={{ color: "var(--t-text)" }}>{activeFamily.label} — Auto</span>
                          <span className="block text-xs" style={{ color: "var(--t-text-muted)" }}>{t("chFamilyAutoDesc")}</span>
                        </span>
                        {value === activeFamily.auto && <Check className="size-4 shrink-0" style={{ color: "var(--t-accent-text)" }} aria-hidden />}
                      </button>
                    )}
                    {loading && <div className="px-3 py-2 text-xs" role="status" style={{ color: "var(--t-text-muted)" }}>{t("chSearching")}</div>}
                    {!loading && catError && <LoadError className="py-4" onRetry={() => setRetryKey((k) => k + 1)} />}
                    {!loading && catalog?.models?.length === 0 && (
                      <div className="px-3 py-2 text-xs" style={{ color: "var(--t-text-muted)" }}>{t("nothingFound")}</div>
                    )}
                    {!loading &&
                      catalog?.models?.map((m) => {
                        const active = m.id === value;
                        const blocked = regionBlocked(m.id);
                        return (
                          <button
                            key={m.id}
                            type="button"
                            aria-current={active || undefined}
                            disabled={blocked}
                            onClick={() => {
                              if (catalogLocked) { upgrade(); return; }
                              choose(m.id, prettyModelId(m.id));
                            }}
                            className={cn("tt flex min-h-11 w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-[var(--surface-hover)]", catalogLocked && "opacity-70", blocked && "cursor-not-allowed opacity-50 hover:bg-transparent")}
                            style={active ? { background: "var(--surface-active)" } : undefined}
                            title={blocked ? regionNote : catalogLocked ? t("chProUnlock") : undefined}
                          >
                            <MarkCell><ProviderMark modelId={m.id} px={14} /></MarkCell>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-xs font-medium" style={{ color: "var(--t-text)" }}>{prettyModelId(m.id)}</span>
                              <span className="block truncate text-xs" style={{ color: "var(--t-text-muted)" }}>
                                {blocked ? `${regionNote} · ` : ""}
                                {[publicOwner(m.owner), m.context ? `${Math.round(m.context / 1000)}k` : ""].filter(Boolean).join(" · ")}
                                <CapIcons tools={m.tools} vision={m.vision} reasoning={m.reasoning} t={t} />
                              </span>
                            </span>
                            {catalogLocked ? <Lock className="size-3.5 shrink-0" style={{ color: "var(--t-warning)" }} aria-hidden /> : active && <Check className="size-4 shrink-0" style={{ color: "var(--t-accent-text)" }} aria-hidden />}
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
