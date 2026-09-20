"use client";

import { ChevronDown, ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import { useState } from "react";
import { useT, type VerifierIssue } from "@/store/chat";
import type { TKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface VerifierPanelProps {
  issues: VerifierIssue[];
}

const VERDICT_META = {
  correct: {
    labelKey: "verdictCorrect" as TKey,
    color: "#22c55e",
    Icon: ShieldCheck,
  },
  suspicious: {
    labelKey: "verdictSuspicious" as TKey,
    color: "#f59e0b",
    Icon: ShieldAlert,
  },
  unverifiable: {
    labelKey: "verdictUnverifiable" as TKey,
    color: "#94a3b8",
    Icon: ShieldQuestion,
  },
} as const;

/**
 * Verifier natijalari: modelning javobidan chiqarilgan asosiy da'volar va
 * ularning holati. Foydalanuvchi ⚠️ ko'rsa, "Shubhali" faktlarni tekshirishi
 * mumkin — bu gallyusinatsiyani ochiq qilib qo'yadi.
 */
export function VerifierPanel({ issues }: VerifierPanelProps) {
  const t = useT();
  const suspicious = issues.filter((i) => i.verdict === "suspicious");
  const [open, setOpen] = useState(suspicious.length > 0);

  const summary = suspicious.length
    ? `${suspicious.length} ${t("suspiciousFacts")}`
    : `${issues.length} ${t("claimsChecked")}`;

  const badgeColor = suspicious.length ? "#f59e0b" : "#22c55e";

  return (
    <div
      className="tt mt-3 overflow-hidden rounded-xl border text-xs"
      style={{ borderColor: `${badgeColor}44`, background: `color-mix(in srgb, ${badgeColor} 6%, transparent)` }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2"
      >
        <span className="flex items-center gap-1.5 font-medium" style={{ color: badgeColor }}>
          {suspicious.length ? <ShieldAlert className="size-3.5" /> : <ShieldCheck className="size-3.5" />}
          {t("factCheck")} · {summary}
        </span>
        <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} style={{ color: "var(--t-text-muted)" }} />
      </button>
      {open && (
        <ul className="border-t px-3 py-2" style={{ borderColor: `${badgeColor}22` }}>
          {issues.map((issue, i) => {
            const meta = VERDICT_META[issue.verdict];
            const Icon = meta.Icon;
            return (
              <li key={i} className="flex items-start gap-2 py-1.5">
                <Icon className="mt-0.5 size-3.5 shrink-0" style={{ color: meta.color }} />
                <div className="min-w-0 flex-1">
                  <div style={{ color: "var(--t-text)" }}>{issue.fact}</div>
                  {issue.note && (
                    <div className="mt-0.5" style={{ color: "var(--t-text-muted)" }}>
                      {t(meta.labelKey)} — {issue.note}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
