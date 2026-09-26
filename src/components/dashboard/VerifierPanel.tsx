"use client";

import { AlertTriangle, ChevronDown, ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import { useState } from "react";
import { useLang, useT, type VerifierIssue } from "@/store/chat";
import { plural } from "@/lib/plural";
import { fmt, type TKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** Server `basis` qo'shadi (verifier.ts); eski saqlangan xabarlarda bo'lmasligi mumkin. */
type Issue = VerifierIssue;

interface VerifierPanelProps {
  issues: Issue[];
}

const REASON_KEY: Record<NonNullable<VerifierIssue["reason"]>, TKey> = {
  no_calls: "clmReasonNoCalls",
  failed: "clmReasonFailed",
  partial: "clmReasonPartial",
  not_performed: "clmReasonNotPerformed",
};

const WARN = "var(--warning, #F59E0B)";

/** Fakt bahosi (eski xabarlarda `kind` yo'q). */
export const isFactIssue = (i: Issue) => !i.kind || i.kind === "fact";

/**
 * Javobdan keyingi deterministik tekshiruv natijasi (server: claims.ts):
 *  - javob tashqi amalni bajarganini aytadi, lekin connector jurnalida u yo'q;
 *  - research javobidagi [n] qidiruv manbalari ro'yxatida yo'q.
 * Doim ochiq (yig'ilmaydi) — bu foydalanuvchi bilishi shart bo'lgan ogohlantirish.
 */
export function ClaimsWarning({ issues }: { issues: Issue[] }) {
  const t = useT();
  const actions = issues.filter((i) => i.kind === "action");
  const markers = [...new Set(issues.flatMap((i) => (i.kind === "citation" ? (i.markers ?? []) : [])))].sort((a, b) => a - b);
  if (!actions.length && !markers.length) return null;

  return (
    <div
      role="status"
      className="tt mt-3 space-y-2 rounded-xl border px-3 py-2 text-xs"
      style={{ borderColor: `color-mix(in srgb, ${WARN} 45%, transparent)`, background: `color-mix(in srgb, ${WARN} 7%, transparent)` }}
    >
      {actions.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 font-semibold" style={{ color: WARN }}>
            <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
            {t("clmTitle")}
          </div>
          <p className="mt-1" style={{ color: "var(--t-text-muted)" }}>
            {t("clmIntro")}
          </p>
          <ul className="mt-1 list-disc space-y-1 pl-4">
            {actions.map((a, i) => (
              <li key={i}>
                <q style={{ color: "var(--t-text)" }}>{a.fact}</q>
                <span style={{ color: "var(--t-text-muted)" }}> — {t(REASON_KEY[a.reason ?? "not_performed"])}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {markers.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 font-semibold" style={{ color: WARN }}>
            <ShieldQuestion className="size-3.5 shrink-0" aria-hidden />
            {t("clmUnsourcedTitle")}
          </div>
          <p className="mt-1" style={{ color: "var(--t-text-muted)" }}>
            {fmt(t("clmUnsourcedBody"), { list: markers.map((n) => `[${n}]`).join(", ") })}
          </p>
        </div>
      )}
    </div>
  );
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
export function VerifierPanel({ issues: all }: VerifierPanelProps) {
  const t = useT();
  const lang = useLang();
  // Amal/iqtibos yozuvlari ClaimsWarning'da — bu panel faqat fakt baholarini ko'rsatadi.
  const issues = all.filter(isFactIssue);
  const suspicious = issues.filter((i) => i.verdict === "suspicious");
  const unconfirmed = issues.filter((i) => i.verdict === "unverifiable");
  const [open, setOpen] = useState(suspicious.length > 0);
  // Manbasiz baho — boshqa LLM fikri; "yashil = tasdiqlandi" deb ko'rsatmaymiz.
  const grounded = issues.length > 0 && issues.every((i) => i.basis === "sources");
  // Research, lekin faqat sarlavha/URL — mazmun emas, atributsiya baholangan.
  const attribution = !grounded && issues.some((i) => i.basis === "attribution");
  const allConfirmed = !suspicious.length && !unconfirmed.length;

  const summary = suspicious.length
    ? plural(lang, suspicious.length, { one: "p8bSuspiciousOne", few: "p8bSuspiciousFew", many: "p8bSuspiciousMany" })
    : `${plural(lang, issues.length, { one: "p8bClaimsOne", few: "p8bClaimsFew", many: "p8bClaimsMany" })}${unconfirmed.length ? ` · ${unconfirmed.length} ${t("vfUnconfirmed")}` : ""}`;

  // Yashil faqat hamma da'vo MANBAGA nisbatan tasdiqlanganda.
  const badgeColor = suspicious.length ? "#f59e0b" : allConfirmed && grounded ? "#22c55e" : "#94a3b8";
  const HeaderIcon = suspicious.length ? ShieldAlert : allConfirmed && grounded ? ShieldCheck : ShieldQuestion;

  return (
    <div
      className="tt mt-3 overflow-hidden rounded-xl border text-xs"
      style={{ borderColor: `${badgeColor}44`, background: `color-mix(in srgb, ${badgeColor} 6%, transparent)` }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-3 py-2"
      >
        <span className="flex items-center gap-1.5 font-medium" style={{ color: badgeColor }}>
          <HeaderIcon className="size-3.5" />
          {t("factCheck")} · {summary}
        </span>
        <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} style={{ color: "var(--t-text-muted)" }} />
      </button>
      {open && (
        <ul className="border-t px-3 py-2" style={{ borderColor: `${badgeColor}22` }}>
          <li className="pb-1.5" style={{ color: "var(--t-text-muted)" }}>
            {t(grounded ? "vfBasisSources" : attribution ? "vfBasisAttribution" : "vfBasisModel")}
          </li>
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
