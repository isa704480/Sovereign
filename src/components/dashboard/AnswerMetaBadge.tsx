"use client";

import { ArrowRight, Cpu } from "lucide-react";
import { MODEL_BY_ID } from "@/config/models";
import { compactTokens, type AnswerMeta } from "@/lib/chat/answer-meta";
import { fmt } from "@/lib/i18n";
import { useT } from "@/store/chat";

/** "cfp/deepseek-ai/deepseek-v4-flash-0731" → "deepseek-v4-flash-0731". */
function shortId(id: string): string {
  return id.split("/").pop() || id;
}

function modelName(id: string): string {
  return MODEL_BY_ID[id]?.name ?? shortId(id);
}

/**
 * Javob ostidagi kichik belgi: haqiqatda qaysi model javob bergani va server shu
 * javob uchun hisoblagan token. Zaxiraga o'tilgan bo'lsa ochiq aytiladi:
 * "so'ralgan: X → javob: Y". Raqamlar faqat server "meta" hodisasidan.
 */
export function AnswerMetaBadge({ meta }: { meta: AnswerMeta }) {
  const t = useT();
  // Upstream darajasidagi almashtirish (katalog id o'sha, lekin boshqa model javob bergan)
  // yoki zaxira shlyuz — upstream nomi ko'rsatiladi; aks holda katalogdagi nom.
  const upstreamSwap = !!meta.upstream && (meta.rescue || (meta.fallback && meta.served === meta.requested));
  const served = upstreamSwap && meta.upstream ? shortId(meta.upstream) : modelName(meta.served);
  const tokens = typeof meta.tokens === "number" && meta.tokens > 0 ? meta.tokens : 0;

  const title = [
    meta.upstream && !meta.upstream.startsWith("mock/") ? fmt(t("p9wUpstreamTitle"), { id: meta.upstream }) : "",
    meta.rescue ? t("p9wRescueTitle") : "",
    meta.cached ? t("p9wCachedTitle") : "",
    tokens ? (meta.billed ? t("p9wTokensBilledTitle") : t("p9wTokensNotBilledTitle")) : "",
    tokens && meta.billed && typeof meta.monthPct === "number" ? fmt(t("p9wMonthPct"), { p: meta.monthPct }) : "",
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <div
      className="mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] leading-5"
      style={{ color: meta.fallback ? "var(--warning, #F59E0B)" : "var(--t-text-muted)" }}
      title={title || undefined}
      data-testid="answer-meta"
    >
      <Cpu className="size-3 shrink-0" aria-hidden />
      {meta.fallback ? (
        <span className="min-w-0 truncate">
          {fmt(t("p9wFallback"), { req: modelName(meta.requested), served })}
          {meta.rescue ? ` · ${t("p9wRescue")}` : ""}
        </span>
      ) : meta.auto ? (
        <span className="inline-flex min-w-0 items-center gap-1 truncate">
          {t("p9wAuto")} <ArrowRight className="size-3 shrink-0" aria-hidden /> {served}
        </span>
      ) : (
        <span className="min-w-0 truncate">{served}</span>
      )}
      {tokens > 0 && (
        <span className="shrink-0 opacity-80">
          · {fmt(t("p9wTokens"), { n: compactTokens(tokens) })}
          {meta.billed && typeof meta.monthPct === "number" && meta.monthPct >= 0.01
            ? ` (${fmt(t("p9wMonthPctShort"), { p: meta.monthPct })})`
            : ""}
        </span>
      )}
    </div>
  );
}
