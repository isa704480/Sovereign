"use client";

import Link from "next/link";
import { useId } from "react";
import { PRICES_CHECKED } from "@/config/model-prices";
import { PLAN_BY_ID, type PlanId } from "@/config/plans";
import { ECON_RANGES, type Breakdown, type EconRange, type UnitEconomics } from "@/lib/econ/unit-economics";
import { fmt as fmtT } from "@/lib/i18n";
import { useT } from "@/store/chat";

/** Kichik summalar ham ko'rinsin: $0.00042 kabi (4 ta ahamiyatli raqam). */
function usd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n === 0) return "$0";
  if (Math.abs(n) < 0.01) return "$" + n.toPrecision(3);
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function count(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(n);
}

const pct = (n: number | null) => (n == null ? "—" : `${n.toFixed(1)}%`);

function Stat({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
      <div className="text-[11px] uppercase tracking-wider text-white/50">{label}</div>
      <div className="mt-1.5 text-2xl font-semibold tabular-nums" style={{ color: color ?? "#EBEEFA" }}>
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-white/50">{sub}</div>}
    </div>
  );
}

function BreakdownTable({ title, rows, label }: { title: string; rows: Breakdown[]; label: (key: string) => string }) {
  const t = useT();
  return (
    <div>
      <div className="mb-2 text-sm text-white/70">{title}</div>
      <div className="max-h-64 overflow-y-auto rounded-xl border border-white/5">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-[#0A0B12] text-[11px] uppercase tracking-wider text-white/40">
            <tr>
              <th className="px-3 py-2 text-left font-normal">{t("p13eColName")}</th>
              <th className="px-3 py-2 text-right font-normal">{t("p13eColAnswers")}</th>
              <th className="px-3 py-2 text-right font-normal">{t("p13eColCost")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rows.map((r) => (
              <tr key={r.key}>
                <td className="max-w-[14rem] truncate px-3 py-2 text-white/80" title={r.key}>
                  {label(r.key)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-white/60">{count(r.answers)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-white/60">{usd(r.costUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function UnitEconomicsCard({ data, days }: { data: UnitEconomics | null; days: EconRange }) {
  const t = useT();
  const tipId = useId();
  const unknown = (k: string) => (k === "unknown" ? t("p13eUnknown") : k);
  const planName = (k: string) => (k === "unknown" ? t("p13eUnknown") : (PLAN_BY_ID[k as PlanId]?.name ?? k));
  const main = data?.baselines[0] ?? null;

  return (
    <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="text-[11px] uppercase tracking-wider text-white/50">{t("p13eTitle")}</div>
          <span className="group relative inline-flex">
            <button
              type="button"
              aria-label={t("p13eMethodAria")}
              aria-describedby={tipId}
              className="inline-flex size-5 items-center justify-center rounded-full border border-white/15 text-[11px] text-white/60 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#8B7DFF]"
            >
              i
            </button>
            <span
              id={tipId}
              role="tooltip"
              className="pointer-events-none invisible absolute left-0 top-7 z-20 w-80 max-w-[80vw] rounded-xl border border-white/10 bg-[#0A0B12] p-3 text-xs leading-relaxed text-white/70 opacity-0 shadow-xl transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100"
            >
              {t("p13eMethod")}
            </span>
          </span>
        </div>
        <nav aria-label={t("p13eRangeAria")} className="flex gap-1">
          {ECON_RANGES.map((n) => (
            <Link
              key={n}
              href={`/admin?econ=${n}`}
              scroll={false}
              aria-current={n === days ? "page" : undefined}
              className={`rounded-full px-3 py-1 text-xs tabular-nums ${
                n === days ? "bg-white/10 text-white" : "text-white/50 hover:bg-white/5"
              }`}
            >
              {fmtT(t("p13eRangeDays"), { n })}
            </Link>
          ))}
        </nav>
      </div>

      {!data ? (
        <p className="text-sm text-white/50">{t("p13eUnavailable")}</p>
      ) : data.totals.answers === 0 ? (
        <p className="text-sm text-white/50">
          {t("p13eNoData")} <span className="text-white/30">{fmtT(t("p13ePeriod"), { from: data.from, to: data.to })}</span>
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label={t("p13eOurPerAnswer")} value={usd(data.perAnswerUsd)} color="#10D4A0" />
            {data.baselines.map((b) => (
              <Stat
                key={b.key}
                label={fmtT(t("p13eBaselinePerAnswer"), { model: b.label })}
                value={usd(b.perAnswerUsd)}
                sub={`${fmtT(t("p13eSavingsVs"), { model: b.label })}: ${pct(b.savingsPct)}`}
              />
            ))}
            <Stat
              label={t("p13eFreeShare")}
              value={pct(data.freeTier.sharePct)}
              sub={fmtT(t("p13eFreeShareSub"), { n: count(data.freeTier.answers), cost: usd(data.freeTier.costAtListUsd) })}
              color="#8B7DFF"
            />
          </div>

          <div className="mt-4 space-y-1 text-xs text-white/50 tabular-nums">
            <div>{fmtT(t("p13ePeriod"), { from: data.from, to: data.to })}</div>
            {main && (
              <div>
                {fmtT(t("p13eTotals"), { ours: usd(data.priced.costUsd), model: main.label, base: usd(main.costUsd) })}
              </div>
            )}
            <div>
              {fmtT(t("p13eCoverage"), {
                priced: count(data.priced.answers),
                total: count(data.totals.answers),
                tokens: count(data.priced.tokensIn + data.priced.tokensOut),
                verified: count(data.priced.verifiedAnswers),
              })}
            </div>
            {data.excluded.answers > 0 && (
              <div>
                {fmtT(t("p13eExcluded"), {
                  noModel: count(data.excluded.noModelAnswers),
                  unpriced: count(data.excluded.unpricedAnswers),
                  models: data.excluded.unpriced.length
                    ? `(${data.excluded.unpriced.slice(0, 4).map((u) => u.model).join(", ")})`
                    : "",
                })}
              </div>
            )}
            {!data.servedColumns && <div className="text-[#F5AA3C]">{t("p13eNoServedCols")}</div>}
            <div className="text-white/30">{fmtT(t("p13ePricesAsOf"), { date: PRICES_CHECKED })}</div>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <BreakdownTable title={t("p13eByProvider")} rows={data.byProvider} label={unknown} />
            <BreakdownTable title={t("p13eByModel")} rows={data.byModel} label={unknown} />
            <BreakdownTable title={t("p13eByPlan")} rows={data.byPlan} label={planName} />
          </div>
        </>
      )}
    </section>
  );
}
