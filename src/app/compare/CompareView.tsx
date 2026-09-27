"use client";

import { ArrowRight } from "lucide-react";
import raw from "@/data/model-compare.json";
import { ctaPrimarySm } from "@/components/landing/cta";
import { fmt, type TKey } from "@/lib/i18n";
import { LocalizedTitle } from "@/components/LocalizedTitle";
import { localeOf } from "@/lib/locales/chat-data";
import { useLang, useT } from "@/store/chat";

/* ------------------------------------------------------------------ */
/* Ma'lumot shakli (scripts/eval/run.mjs yozadi)                          */
/* ------------------------------------------------------------------ */

type Category = "coding" | "math" | "instruction" | "writing";
type CatScore = { pass: number; total: number; pct: number | null; errors: number } | null;

interface ModelRow {
  key: string;
  label: string;
  family: string;
  measured: boolean;
  reference: boolean;
  route: { via: string; model: string } | null;
  overall: { pass: number; total: number; pct: number } | null;
  categories: Record<Category, CatScore>;
  latency: { medianMs: number | null } | null;
  costUsd: number | null;
  vsReference: { scoreRatio: number | null; costRatio: number | null } | null;
}

interface PublicBenchmark {
  key: string;
  name: string;
  type: "independent" | "vendor";
  urls: string[];
  date: string;
  rows: { model: string; score: string }[];
}

interface CompareData {
  runDate: string;
  /** Cloudflare Workers AI yo'lida sarflangan neuron (usage × pricing jadvali); yo'q bo'lsa null. */
  cloudflareNeurons?: number | null;
  methodology: { tasks: number; runsPerTask?: number; categories: Record<Category, number> };
  models: ModelRow[];
  tasks: { id: string; category: Category; lang: string; results: Record<string, "pass" | "fail" | "error" | "not-run"> }[];
  public: { collectedOn: string; benchmarks: PublicBenchmark[] } | null;
}

const DATA = raw as unknown as CompareData;

const CATS: Category[] = ["coding", "math", "instruction", "writing"];
const CAT_KEY: Record<Category, TKey> = {
  coding: "p11cCatCoding",
  math: "p11cCatMath",
  instruction: "p11cCatInstruction",
  writing: "p11cCatWriting",
};
const BENCH_DESC: Record<string, TKey> = {
  aa: "p11cBenchAa",
  arena: "p11cBenchArena",
  hle: "p11cBenchHle",
  terminal: "p11cBenchTerminal",
  swe: "p11cBenchSwe",
};
const FAMILY_COLOR: Record<string, string> = {
  claude: "#D97757",
  deepseek: "#4D6BFE",
  qwen: "#8B87F5",
  kimi: "#3FB6C9",
  glm: "#5FC8A0",
};
/** Status tokenlari (globals.css) — qorong'i fonda matn sifatida o'qiladi. */
const RESULT_COLOR = {
  pass: "var(--t-success)",
  fail: "var(--t-danger)",
  error: "var(--t-warning)",
  "not-run": "var(--text-muted)",
} as const;

const usd = (x: number) => `$${x < 0.1 ? x.toFixed(3) : x.toFixed(2)}`;
const secs = (ms: number) => (ms / 1000).toFixed(1);

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="font-display mt-16 text-2xl font-extrabold tracking-tight text-text-primary">{children}</h2>;
}

export function CompareView() {
  const t = useT();
  const lang = useLang();
  // O'lchanganlar avval (katalog tartibi saqlanadi), keyin "hali o'lchanmagan"lar.
  const models = [...DATA.models].sort((a, b) => Number(b.measured) - Number(a.measured));
  const ref = models.find((m) => m.reference && m.measured) ?? null;
  const challengers = models.filter((m) => m.measured && m.family !== "claude");
  const notMeasured = models.filter((m) => !m.measured);
  // Sarlavha faqat haqiqatan o'lchangan modellarni aytadi (model-compare.json).
  const headVars = {
    challengers: challengers.map((m) => m.label).join(", ") || "—",
    reference: ref?.label ?? "Claude",
    tasks: DATA.methodology.tasks,
    runs: DATA.methodology.runsPerTask ?? 1,
  };

  /** Claude qaysi toifalarda eng yaxshi o'lchangan raqibdan oldinda (faqat o'lchangan). */
  const aheadCats = ref
    ? CATS.filter((c) => {
        const r = ref.categories[c]?.pass ?? 0;
        return challengers.length > 0 && challengers.every((m) => (m.categories[c]?.pass ?? 0) < r);
      })
    : [];

  const cellPct = (s: CatScore) =>
    s ? (
      <span>
        {s.pct}%<span className="ml-1 text-xs text-text-muted">({s.pass}/{s.total})</span>
      </span>
    ) : (
      <span className="text-text-muted">—</span>
    );

  return (
    <article className="mx-auto max-w-5xl px-5 pb-24 pt-32 md:px-8">
      <LocalizedTitle title={fmt(t("p11cTitle"), headVars)} />
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">{t("p11cEyebrow")}</p>
      <h1 className="font-display mt-3 text-3xl font-extrabold tracking-tight text-text-primary md:text-4xl">{fmt(t("p11cTitle"), headVars)}</h1>
      <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-text-secondary">{fmt(t("p11cLead"), headVars)}</p>
      <p className="mt-3 font-mono text-xs text-text-muted">{fmt(t("p11cRunDate"), { date: DATA.runDate })}</p>
      <a href="/app" className={`mt-6 ${ctaPrimarySm}`}>
        {t("p11cCta")}
        <ArrowRight className="size-4" aria-hidden="true" />
      </a>

      {/* ---------------- Measured headline ---------------- */}
      <section aria-labelledby="headline" className="mt-12 rounded-2xl border border-border bg-bg-elevated/60 p-5 md:p-6">
        <h2 id="headline" className="font-display text-lg font-bold text-text-primary">{t("p11cHeadlineTitle")}</h2>
        <ul className="mt-3 space-y-3 text-[15px] leading-relaxed text-text-secondary">
          {ref &&
            challengers.map((m) => {
              // Bir kasr bilan (92.5 → "92.5", yuqoriga yaxlitlab bo'rttirmaymiz).
              const score = Math.round((m.vsReference?.scoreRatio ?? 0) * 1000) / 10;
              const costRatio = m.vsReference?.costRatio ?? null;
              const cheaper = costRatio != null && costRatio > 0 && costRatio < 1;
              const text = cheaper
                ? fmt(t("p11cHeadlineCheaper"), {
                    model: m.label, ref: ref.label, score,
                    pass: m.overall?.pass ?? 0, refPass: ref.overall?.pass ?? 0,
                    cost: Math.round(1 / costRatio),
                  })
                : fmt(t("p11cHeadlinePricier"), {
                    model: m.label, ref: ref.label, score,
                    pass: m.overall?.pass ?? 0, refPass: ref.overall?.pass ?? 0,
                    cost: costRatio == null ? "?" : costRatio.toFixed(1),
                  });
              const behind = (m.overall?.pass ?? 0) < (ref.overall?.pass ?? 0);
              return (
                <li key={m.key}>
                  <strong className="text-text-primary">{text}</strong>{" "}
                  {fmt(t(behind ? "p11cGapNote" : "p11cParityNote"), { ref: ref.label })}
                </li>
              );
            })}
          {ref && aheadCats.length > 0 && (
            <li>{fmt(t("p11cClaudeAheadIn"), { ref: ref.label, cats: aheadCats.map((c) => t(CAT_KEY[c])).join(", ") })}</li>
          )}
          {notMeasured.length > 0 && (
            <li className="text-text-muted">{fmt(t("p11cNotMeasuredList"), { models: notMeasured.map((m) => m.label).join(", ") })}</li>
          )}
        </ul>
      </section>

      {/* ---------------- Our eval ---------------- */}
      <SectionTitle>{t("p11cEvalTitle")}</SectionTitle>
      <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-text-secondary">{t("p11cEvalLead")}</p>

      <div role="region" aria-label={t("p11cTableAria")} tabIndex={0} className="mt-6 overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[860px] border-collapse text-left text-sm">
          <caption className="sr-only">{t("p11cTableAria")}</caption>
          <thead className="bg-bg-elevated text-xs uppercase tracking-wider text-text-secondary">
            <tr>
              <th scope="col" className="px-3 py-2.5 font-medium">{t("p11cColModel")}</th>
              {CATS.map((c) => (
                <th key={c} scope="col" className="px-3 py-2.5 font-medium">
                  {t(CAT_KEY[c])}
                  <span className="block font-normal normal-case tracking-normal text-text-muted">
                    {fmt(t("p11cTasksN"), { n: DATA.methodology.categories[c] })}
                  </span>
                </th>
              ))}
              <th scope="col" className="px-3 py-2.5 font-semibold">{t("p11cColOverall")}</th>
              <th scope="col" className="px-3 py-2.5 font-medium">{t("p11cColLatency")}</th>
              <th scope="col" className="px-3 py-2.5 font-medium">{t("p11cColCost")}</th>
              <th scope="col" className="px-3 py-2.5 font-medium">{t("p11cColRoute")}</th>
            </tr>
          </thead>
          <tbody className="nums divide-y divide-border">
            {models.map((m) => (
              <tr key={m.key} className={m.measured ? "" : "text-text-muted"}>
                <th scope="row" className={`px-3 py-2.5 font-semibold ${m.measured ? "text-text-primary" : "text-text-secondary"}`}>
                  <span className="mr-2 inline-block h-2 w-2 rounded-full align-middle" style={{ background: FAMILY_COLOR[m.family] ?? "#888" }} aria-hidden />
                  {m.label}
                  {m.reference && (
                    <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
                      {t("p11cReference")}
                    </span>
                  )}
                </th>
                {m.measured ? (
                  <>
                    {CATS.map((c) => (
                      <td key={c} className="px-3 py-2.5 text-text-primary">{cellPct(m.categories[c])}</td>
                    ))}
                    <td className="px-3 py-2.5 font-semibold text-text-primary">{cellPct(m.overall ? { ...m.overall, errors: 0 } : null)}</td>
                    <td className="px-3 py-2.5 text-text-primary">
                      {m.latency?.medianMs != null ? fmt(t("p11cSeconds"), { n: secs(m.latency.medianMs) }) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-text-primary">{m.costUsd != null ? usd(m.costUsd) : "—"}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-text-muted">{m.route?.via}</td>
                  </>
                ) : (
                  <td colSpan={CATS.length + 4} className="px-3 py-2.5 italic text-text-muted">{t("p11cNotMeasured")}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-sm text-text-muted">{t("p11cCostNote")}</p>
      {!!DATA.cloudflareNeurons && models.some((m) => m.measured && m.route?.via === "cloudflare") && (
        <p className="mt-1 text-sm text-text-muted">
          {fmt(t("p11cCfNeurons"), { n: Math.round(DATA.cloudflareNeurons).toLocaleString(localeOf(lang)) })}
        </p>
      )}

      <details className="mt-6 rounded-lg border border-border bg-bg-elevated/40 px-4 py-3">
        <summary className="cursor-pointer text-sm font-semibold text-text-primary">{t("p11cPerTaskTitle")}</summary>
        <div role="region" aria-label={t("p11cPerTaskAria")} tabIndex={0} className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-left text-xs">
            <thead className="text-text-muted">
              <tr>
                <th scope="col" className="py-1.5 pr-3 font-medium">{t("p11cColTask")}</th>
                {models.filter((m) => m.measured).map((m) => (
                  <th key={m.key} scope="col" className="px-2 py-1.5 font-medium">{m.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {DATA.tasks.map((task) => (
                <tr key={task.id}>
                  <th scope="row" className="py-1.5 pr-3 font-mono font-normal text-text-secondary">
                    {task.id} <span className="text-text-muted">· {task.lang}</span>
                  </th>
                  {models.filter((m) => m.measured).map((m) => {
                    const r = task.results[m.key] ?? "not-run";
                    const label = r === "pass" ? t("p11cPass") : r === "error" ? t("p11cError") : r === "fail" ? t("p11cFail") : "—";
                    return (
                      <td key={m.key} className="px-2 py-1.5 font-medium" style={{ color: RESULT_COLOR[r] }}>
                        {label}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      {/* ---------------- Public benchmarks ---------------- */}
      {DATA.public && (
        <>
          <SectionTitle>{t("p11cPublicTitle")}</SectionTitle>
          <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-text-secondary">
            {fmt(t("p11cPublicLead"), { date: DATA.public.collectedOn })}
          </p>
          <div className="mt-6 grid gap-4 md:grid-cols-2" role="region" aria-label={t("p11cPublicAria")}>
            {DATA.public.benchmarks.map((b) => (
              <section key={b.key} className="rounded-lg border border-border bg-bg-elevated/60 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-display text-base font-bold text-text-primary">{b.name}</h3>
                  <span
                    className="rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
                    style={{
                      color: b.type === "independent" ? "var(--t-success)" : "var(--t-warning)",
                      background: `color-mix(in srgb, ${b.type === "independent" ? "var(--t-success)" : "var(--t-warning)"} 14%, transparent)`,
                    }}
                  >
                    {t(b.type === "independent" ? "p11cIndependent" : "p11cVendor")}
                  </span>
                </div>
                {BENCH_DESC[b.key] && <p className="mt-1 text-sm text-text-secondary">{t(BENCH_DESC[b.key])}</p>}
                <table className="mt-3 w-full border-collapse text-sm">
                  <thead className="sr-only">
                    <tr>
                      <th scope="col">{t("p11cColModel")}</th>
                      <th scope="col">{t("p11cColScore")}</th>
                    </tr>
                  </thead>
                  <tbody className="nums divide-y divide-border">
                    {b.rows.map((row) => (
                      <tr key={row.model}>
                        <td className="py-1.5 pr-3 text-text-secondary">{row.model}</td>
                        <td className="py-1.5 text-right font-semibold text-text-primary">{row.score}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-3 text-xs text-text-muted">
                  {t("p11cSource")}:{" "}
                  {b.urls.map((u, i) => (
                    <span key={u}>
                      {i > 0 && ", "}
                      <a href={u} className="underline hover:text-text-primary" rel="noopener noreferrer" target="_blank">
                        {u.replace(/^https:\/\//, "")}
                      </a>
                    </span>
                  ))}{" "}
                  · {b.date}
                </p>
              </section>
            ))}
          </div>
        </>
      )}

      {/* ---------------- Methodology ---------------- */}
      <SectionTitle>{t("p11cMethodTitle")}</SectionTitle>
      <ul className="mt-4 list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-text-secondary">
        <li>{fmt(t("p11cMethod1"), { tasks: DATA.methodology.tasks, date: DATA.runDate })}</li>
        <li>{t("p11cMethod2")}</li>
        <li>{t("p11cMethod3")}</li>
        <li>{t("p11cMethod4")}</li>
        <li>{t("p11cMethod5")}</li>
        <li>{t("p11cMethod6")}</li>
        <li>{t("p11cMethod7")}</li>
      </ul>

      {/* ---------------- FAQ ---------------- */}
      <SectionTitle>{t("p11cFaqTitle")}</SectionTitle>
      <div className="mt-4 space-y-3">
        {(
          [
            ["p11cFaq1Q", "p11cFaq1A"],
            ["p11cFaq2Q", "p11cFaq2A"],
            ["p11cFaq3Q", "p11cFaq3A"],
            ["p11cFaq4Q", "p11cFaq4A"],
          ] as const
        ).map(([q, a]) => (
          <details key={q} className="rounded-lg border border-border bg-bg-elevated/40 px-4 py-3">
            <summary className="cursor-pointer text-[15px] font-semibold text-text-primary">{t(q)}</summary>
            <p className="mt-2 text-[15px] leading-relaxed text-text-secondary">{t(a)}</p>
          </details>
        ))}
      </div>
    </article>
  );
}
