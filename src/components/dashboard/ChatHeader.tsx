"use client";

import { Check, Globe, Menu, PanelRight, Share2 } from "lucide-react";
import { HERO_DEMO_MODELS, RESEARCH_MODEL_ID } from "@/config/models";
import type { Plan } from "@/config/plans";
import { CreditIndicator } from "./CreditIndicator";
import { ModelSwitcher } from "./ModelSwitcher";
import { useTheme } from "./theme-context";

interface ChatHeaderProps {
  title: string;
  modelId: string;
  onModelChange: (id: string) => void;
  plan: Plan;
  onOpenSidebar: () => void;
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
  hasSources,
  sourcesOpen,
  onToggleSources,
  onUpgrade,
  onShare,
  shareState = "idle",
}: ChatHeaderProps) {
  const { model } = useTheme();
  const quick = [...HERO_DEMO_MODELS.slice(0, 3)];

  return (
    <header
      className="tt flex flex-wrap items-center gap-2 border-b px-3 py-2.5 md:px-5"
      style={{ borderColor: "var(--t-border)", background: "color-mix(in srgb, var(--t-bg) 85%, transparent)", backdropFilter: "blur(12px)" }}
    >
      <button
        type="button"
        onClick={onOpenSidebar}
        className="rounded-lg p-2 transition-colors hover:bg-white/10 md:hidden"
        style={{ color: "var(--t-text-muted)" }}
        aria-label="Menyu"
      >
        <Menu className="size-5" />
      </button>

      <ModelSwitcher value={modelId} onChange={onModelChange} plan={plan} />

      <div className="hidden items-center gap-1 lg:flex">
        {quick.map((m) => {
          const active = m.id === modelId;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onModelChange(m.id)}
              className="tt inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors hover:bg-white/5"
              style={{
                borderColor: active ? m.primary : "var(--t-border)",
                color: active ? m.primary : "var(--t-text-muted)",
                background: active ? `color-mix(in srgb, ${m.primary} 14%, transparent)` : "transparent",
              }}
            >
              <span>{m.glyph}</span>
              {m.shortName}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => onModelChange(RESEARCH_MODEL_ID)}
          className="tt inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors hover:bg-white/5"
          style={{
            borderColor: modelId === RESEARCH_MODEL_ID ? "#20808D" : "var(--t-border)",
            color: modelId === RESEARCH_MODEL_ID ? "#29A0AD" : "var(--t-text-muted)",
            background: modelId === RESEARCH_MODEL_ID ? "rgba(32,128,141,0.14)" : "transparent",
          }}
        >
          <Globe className="size-3.5" /> Research
        </button>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <CreditIndicator plan={plan} onUpgrade={onUpgrade} />
        <span className="mr-2 hidden max-w-[220px] truncate text-sm md:inline" style={{ color: "var(--t-text-muted)" }} title={title}>
          {title}
        </span>
        {hasSources && (
          <button
            type="button"
            onClick={onToggleSources}
            className="hidden rounded-lg p-2 transition-colors hover:bg-white/10 lg:block"
            style={{ color: sourcesOpen ? model.primary : "var(--t-text-muted)" }}
            title="Manbalar paneli"
            aria-pressed={sourcesOpen}
          >
            <PanelRight className="size-4" />
          </button>
        )}
        <button
          type="button"
          onClick={onShare}
          disabled={!onShare || shareState === "busy"}
          className="inline-flex items-center gap-1.5 rounded-lg p-2 text-xs transition-colors hover:bg-white/10 disabled:opacity-50"
          style={{ color: shareState === "done" ? "var(--t-accent)" : "var(--t-text-muted)" }}
          title="Suhbatni havola bilan ulashish"
          aria-label="Ulashish"
        >
          {shareState === "done" ? <Check className="size-4" /> : <Share2 className="size-4" />}
          {shareState === "done" && <span className="hidden sm:inline">Havola nusxalandi</span>}
        </button>
      </div>
    </header>
  );
}
