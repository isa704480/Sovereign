"use client";

import { Check, Globe, Menu, PanelRight, Share2 } from "lucide-react";
import { HERO_DEMO_MODELS, RESEARCH_MODEL_ID } from "@/config/models";
import { modelAllowedIn } from "@/lib/ai/region";
import { useRegion } from "@/hooks/use-region";
import type { Plan } from "@/config/plans";
import { useT } from "@/store/chat";
import { CreditIndicator } from "./CreditIndicator";
import { LangSwitcher } from "@/components/LangSwitcher";
import { ModelSwitcher } from "./ModelSwitcher";
import { ProviderMark } from "./ModelAvatar";

interface ChatHeaderProps {
  title: string;
  modelId: string;
  onModelChange: (id: string) => void;
  plan: Plan;
  onOpenSidebar: () => void;
  /** Mobil drawer ochiqmi (menyu tugmasining aria-expanded holati). */
  sidebarOpen?: boolean;
  hasSources: boolean;
  sourcesOpen: boolean;
  onToggleSources: () => void;
  onUpgrade: () => void;
  /** Suhbatni havola bilan ulashish; suhbat bo'sh bo'lsa berilmaydi. */
  onShare?: () => void;
  shareState?: "idle" | "busy" | "done";
}

export function ChatHeader({
  title,
  modelId,
  onModelChange,
  plan,
  onOpenSidebar,
  sidebarOpen = false,
  hasSources,
  sourcesOpen,
  onToggleSources,
  onUpgrade,
  onShare,
  shareState = "idle",
}: ChatHeaderProps) {
  const t = useT();
  const quick = [...HERO_DEMO_MODELS.slice(0, 3)];
  // Mintaqa siyosati: yopiq modellarning tezkor tugmalari o'chiq (sababi — title'da).
  const region = useRegion();
  const blocked = (id: string) => region.restricted && !modelAllowedIn(id, region.country);

  return (
    <header
      className="tt flex min-w-0 flex-nowrap items-center gap-1.5 border-b px-2 py-2 sm:gap-2 sm:px-3 sm:py-2.5 md:px-5"
      style={{ borderColor: "var(--t-border)", background: "var(--t-bg)" }}
    >
      <button
        type="button"
        onClick={onOpenSidebar}
        data-sidebar-menu
        className="flex size-11 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-[var(--surface-hover)] md:hidden"
        style={{ color: "var(--t-text-muted)" }}
        aria-label={t("menu")}
        aria-expanded={sidebarOpen}
      >
        <Menu className="size-5" aria-hidden />
      </button>

      <ModelSwitcher value={modelId} onChange={onModelChange} plan={plan} />

      <div className="hidden items-center gap-1 lg:flex">
        {quick.map((m) => {
          const active = m.id === modelId;
          const off = blocked(m.id);
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onModelChange(m.id)}
              aria-pressed={active}
              disabled={off}
              title={off ? t("p10RegionUnavailable") : undefined}
              className="tt inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
              style={{
                borderColor: active ? `color-mix(in srgb, ${m.primary} 60%, transparent)` : "var(--t-border)",
                color: active ? "var(--t-text)" : "var(--t-text-muted)",
                background: active ? "var(--surface-active)" : "transparent",
              }}
            >
              <ProviderMark model={m} px={14} />
              {m.shortName}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => onModelChange(RESEARCH_MODEL_ID)}
          aria-pressed={modelId === RESEARCH_MODEL_ID}
          disabled={blocked(RESEARCH_MODEL_ID)}
          title={blocked(RESEARCH_MODEL_ID) ? t("p10RegionUnavailable") : undefined}
          className="tt inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
          style={{
            borderColor: modelId === RESEARCH_MODEL_ID ? "var(--t-primary)" : "var(--t-border)",
            color: modelId === RESEARCH_MODEL_ID ? "var(--t-text)" : "var(--t-text-muted)",
            background: modelId === RESEARCH_MODEL_ID ? "var(--surface-active)" : "transparent",
          }}
        >
          <Globe className="size-3.5" aria-hidden /> {t("uxResearch")}
        </button>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
        <CreditIndicator plan={plan} onUpgrade={onUpgrade} />
        <span className="mr-2 hidden max-w-[220px] truncate text-sm md:inline" style={{ color: "var(--t-text-muted)" }} title={title}>
          {title}
        </span>
        {hasSources && (
          <button
            type="button"
            onClick={onToggleSources}
            className="hidden rounded-lg p-2 transition-colors hover:bg-[var(--surface-hover)] lg:block"
            style={{ color: sourcesOpen ? "var(--t-accent-text)" : "var(--t-text-muted)" }}
            title={t("sourcesPanel")}
            aria-label={t("sourcesPanel")}
            aria-pressed={sourcesOpen}
          >
            <PanelRight className="size-4" aria-hidden />
          </button>
        )}
        {/* Til — har doim ko'rinadigan joyda (Sozlamalarga kirmasdan). */}
        <LangSwitcher className="hidden h-8 border-[var(--t-border)] text-xs text-[var(--t-text-muted)] sm:inline-block" />
        <button
          type="button"
          onClick={onShare}
          disabled={!onShare || shareState === "busy"}
          className="inline-flex min-h-9 min-w-9 items-center justify-center gap-1.5 rounded-lg p-2 text-xs transition-colors hover:bg-[var(--surface-hover)] disabled:opacity-50 [@media(pointer:coarse)]:size-11"
          style={{ color: shareState === "done" ? "var(--t-success)" : "var(--t-text-muted)" }}
          title={t("share")}
          aria-label={t("share")}
        >
          {shareState === "done" ? <Check className="size-4" aria-hidden /> : <Share2 className="size-4" aria-hidden />}
          {shareState === "done" && <span className="hidden sm:inline">{t("linkCopied")}</span>}
        </button>
      </div>
    </header>
  );
}
