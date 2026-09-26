"use client";

import {
  ArrowUp,
  BookOpen,
  BrainCircuit,
  ChevronDown,
  Copy,
  Globe,
  Lock,
  Paperclip,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  ThumbsUp,
} from "lucide-react";
import { LogoMark } from "@/components/brand/Logo";
import { cn } from "@/lib/utils";
import { useT } from "@/store/chat";
import type { TKey } from "@/lib/i18n";

const CHATS: TKey[] = ["p4dPvChat1", "p4dPvChat2", "p4dPvChat3"];
const TOOLS: { key: TKey; icon: typeof BrainCircuit }[] = [
  { key: "memory", icon: BrainCircuit },
  { key: "knowledgeBase", icon: BookOpen },
  { key: "skills", icon: Sparkles },
];

/**
 * Haqiqiy chat interfeysining soddalashtirilgan HTML/CSS maketi (tashqi rasm yo'q).
 * Bezak qismi ekran o'quvchidan yashirin; ma'nosi figcaption'da.
 */
export function ProductPreview() {
  const t = useT();
  return (
    <figure aria-labelledby="product-preview-caption" className="relative mx-auto w-full max-w-5xl">
      {/* orqa nur */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-[8%] top-[12%] -z-10 h-3/4 rounded-full opacity-70 blur-3xl"
        style={{ background: "radial-gradient(closest-side, rgba(91,80,240,0.35), transparent)" }}
      />

      <div
        aria-hidden="true"
        className="relative overflow-hidden rounded-2xl border border-white/10 bg-[rgba(10,13,40,0.78)] text-left shadow-[0_40px_120px_-24px_rgba(0,0,0,0.75)] ring-1 ring-inset ring-white/[0.04] backdrop-blur-xl md:rounded-3xl"
      >
        {/* shisha yaltirog'i */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />

        {/* brauzer paneli */}
        <div className="flex items-center gap-3 border-b border-white/[0.06] px-3 py-2.5 md:px-4">
          <div className="flex shrink-0 gap-1.5">
            <span className="size-2.5 rounded-full bg-[#ff5f57]/80" />
            <span className="size-2.5 rounded-full bg-[#febc2e]/80" />
            <span className="size-2.5 rounded-full bg-[#28c840]/80" />
          </div>
          <div className="mx-auto flex min-w-0 items-center gap-1.5 rounded-lg bg-white/[0.04] px-3 py-1 font-mono text-[11px] text-text-secondary">
            <Lock className="size-3 shrink-0 text-success" />
            <span className="truncate">app.soveregn.xyz</span>
          </div>
          <div className="hidden w-[46px] sm:block" />
        </div>

        <div className="grid md:grid-cols-[216px_minmax(0,1fr)]">
          {/* sidebar */}
          <div className="hidden flex-col gap-1 border-r border-white/[0.06] bg-white/[0.012] p-3 md:flex">
            <div className="flex items-center gap-2 px-1.5 py-1">
              <LogoMark size={20} />
              <span className="font-display text-[13px] font-bold tracking-wide text-text-primary">SOVEREIGN</span>
            </div>
            <div className="mt-2 flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[12px] font-medium text-text-primary">
              <Plus className="size-3.5" /> {t("newChat")}
            </div>
            <div className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12px] text-text-muted">
              <Search className="size-3.5" /> {t("searchChats")}
            </div>
            <div className="mt-3 px-2.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              {t("p4dPvRecent")}
            </div>
            {CHATS.map((k, i) => (
              <div
                key={k}
                className={cn(
                  "truncate rounded-lg px-2.5 py-1.5 text-[12px]",
                  i === 0 ? "bg-primary/15 text-text-primary" : "text-text-secondary",
                )}
              >
                {t(k)}
              </div>
            ))}
            <div className="mt-auto space-y-0.5 border-t border-white/[0.06] pt-2">
              {TOOLS.map(({ key, icon: Icon }) => (
                <div key={key} className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12px] text-text-secondary">
                  <Icon className="size-3.5 text-text-muted" /> {t(key)}
                </div>
              ))}
              <div className="mt-1 flex items-center gap-2 px-2.5 py-1.5">
                <span className="grid size-6 place-items-center rounded-full bg-gradient-brand text-[10px] font-bold text-white">
                  S
                </span>
                <span className="text-[12px] text-text-secondary">Pro</span>
              </div>
            </div>
          </div>

          {/* chat */}
          <div className="flex min-w-0 flex-col">
            <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] px-3 py-2.5 md:px-5">
              <div className="flex min-w-0 items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] py-1 pl-1 pr-2.5">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#cc785c]/20 text-[11px] font-bold text-[#e0a58c]">
                  C
                </span>
                <span className="truncate text-[12px] font-semibold text-text-primary">Claude Sonnet 4.5</span>
                <ChevronDown className="size-3.5 shrink-0 text-text-muted" />
              </div>
              <div className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/[0.03] px-2.5 py-1 text-[11px] text-text-secondary">
                <span className="size-1.5 rounded-full bg-success" />
                AES-256
              </div>
            </div>

            <div className="flex-1 space-y-4 px-3 py-5 md:px-8 md:py-7">
              {/* foydalanuvchi */}
              <div className="flex flex-col items-end gap-1.5">
                <div className="max-w-[88%] rounded-[18px_18px_4px_18px] bg-[#1C1F42] px-3.5 py-2.5 text-[12.5px] leading-relaxed text-text-primary md:max-w-[75%] md:text-[13.5px]">
                  {t("p4dPvUser")}
                </div>
                <div className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-[var(--border-accent)] bg-primary/10 px-2.5 py-0.5 text-[10.5px] text-primary-soft md:text-[11px]">
                  <ShieldCheck className="size-3 shrink-0" />
                  <span className="truncate">{t("p4dPvMasked")}</span>
                </div>
              </div>

              {/* AI javobi */}
              <div className="flex gap-2.5 md:gap-3">
                <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-[#cc785c]/20 text-[12px] font-bold text-[#e0a58c]">
                  C
                </span>
                <div className="min-w-0 flex-1 text-[12.5px] leading-relaxed text-text-secondary md:text-[13.5px]">
                  <p className="text-text-primary">{t("p4dPvAiIntro")}</p>
                  <div className="mt-2 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3 md:p-4">
                    <p className="font-semibold text-text-primary">{t("p4dPvAiSubject")}</p>
                    <p className="mt-1.5">{t("p4dPvAiBody")}</p>
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-text-muted">
                    <Copy className="size-3.5" />
                    <ThumbsUp className="size-3.5" />
                  </div>
                </div>
              </div>
            </div>

            {/* kiritish maydoni */}
            <div className="px-3 pb-3 md:px-8 md:pb-6">
              <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.035] py-2 pl-3 pr-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <Paperclip className="size-4 shrink-0 text-text-muted" />
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-text-muted md:text-[13.5px]">
                  {t("p4dPvComposer")}
                </span>
                <Globe className="hidden size-4 shrink-0 text-text-muted sm:block" />
                <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-primary text-white shadow-glow">
                  <ArrowUp className="size-4" />
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <figcaption id="product-preview-caption" className="mt-4 text-center text-xs text-text-muted">
        {t("p4dPvLabel")}
      </figcaption>
    </figure>
  );
}
