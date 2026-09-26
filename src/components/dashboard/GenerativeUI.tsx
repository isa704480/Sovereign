"use client";

import { Check } from "lucide-react";
import dynamic from "next/dynamic";
import { catchError } from "next/error";
import { useState } from "react";
import { localeOf } from "@/lib/locales/chat-data";
import { useLang, useT } from "@/store/chat";

/** recharts faqat grafik bloki kelganda yuklanadi (asosiy /app bundle'dan chiqarilgan). */
const GenUiChart = dynamic(() => import("./GenUiChart"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full animate-pulse rounded-xl" style={{ background: "color-mix(in srgb, var(--t-text) 6%, transparent)" }} />
  ),
});

/** Sonlarni interfeys tili lokalida ko'rsatadi (1250000 → "1 250 000" / "1,250,000"). */
function useNum() {
  const locale = localeOf(useLang());
  let nf: Intl.NumberFormat | null = null;
  try {
    nf = new Intl.NumberFormat(locale);
  } catch {
    nf = null;
  }
  return { locale, num: (v: string | number) => (typeof v === "number" && nf ? nf.format(v) : v) };
}

/**
 * "Generative UI": the model may answer with a ```sovereign-ui JSON block that
 * we render as a real component. Rendering is declarative only — no code from
 * the model is executed — so a malformed or hostile block can at worst draw a
 * chart with odd labels.
 */
export type GenUiSpec =
  | { type: "kpi"; title?: string; items: { label: string; value: string | number; hint?: string }[] }
  | {
      type: "chart";
      chart: "bar" | "line" | "area" | "pie";
      title?: string;
      xKey: string;
      series: { key: string; label?: string; color?: string }[];
      data: Record<string, string | number>[];
    }
  | { type: "table"; title?: string; columns: string[]; rows: (string | number)[][] }
  | { type: "steps"; title?: string; items: { title: string; detail?: string }[] }
  | { type: "checklist"; title?: string; items: string[] };

const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isPrim = (v: unknown): v is string | number => typeof v === "string" || typeof v === "number";

/** Structural validation — anything unexpected falls back to the raw code block. */
export function parseGenUi(raw: string): GenUiSpec | null {
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRec(v)) return null;

  // Ixtiyoriy maydonlar ham faqat matn bo'lib qoladi: obyekt React child sifatida
  // chizilsa ("Objects are not valid as a React child") butun ilova yiqilardi.
  if (v.type === "kpi" && Array.isArray(v.items)) {
    const items = v.items
      .filter((i): i is Record<string, unknown> & { label: string; value: string | number } =>
        isRec(i) && typeof i.label === "string" && isPrim(i.value),
      )
      .map((i) => ({ label: i.label, value: i.value, hint: strOrUndef(i.hint) }));
    return items.length ? { type: "kpi", title: strOrUndef(v.title), items: items.slice(0, 6) } : null;
  }

  if (v.type === "chart" && Array.isArray(v.data) && Array.isArray(v.series) && typeof v.xKey === "string") {
    const chart = v.chart === "line" || v.chart === "area" || v.chart === "pie" ? v.chart : "bar";
    const series = v.series
      .filter((s): s is Record<string, unknown> & { key: string } => isRec(s) && typeof s.key === "string")
      .map((s) => ({ key: s.key, label: strOrUndef(s.label), color: strOrUndef(s.color) }))
      .slice(0, 6);
    // Nuqtalarda faqat son/matn qiymatlar qoladi (obyekt o'q yorlig'ida chizilib yiqilmasin).
    const data = v.data
      .filter(isRec)
      .slice(0, 60)
      .map((row) => Object.fromEntries(Object.entries(row).filter(([, val]) => isPrim(val))) as Record<string, string | number>);
    return series.length && data.length
      ? { type: "chart", chart, title: strOrUndef(v.title), xKey: v.xKey, series, data }
      : null;
  }

  if (v.type === "table" && Array.isArray(v.columns) && Array.isArray(v.rows)) {
    const columns = v.columns.filter((c): c is string => typeof c === "string").slice(0, 8);
    const rows = v.rows
      .filter(Array.isArray)
      .map((r) => r.filter(isPrim).slice(0, columns.length))
      .slice(0, 50);
    return columns.length && rows.length ? { type: "table", title: strOrUndef(v.title), columns, rows } : null;
  }

  if (v.type === "steps" && Array.isArray(v.items)) {
    const items = v.items
      .filter((i): i is Record<string, unknown> & { title: string } => isRec(i) && typeof i.title === "string")
      .map((i) => ({ title: i.title, detail: strOrUndef(i.detail) }))
      .slice(0, 12);
    return items.length ? { type: "steps", title: strOrUndef(v.title), items } : null;
  }

  if (v.type === "checklist" && Array.isArray(v.items)) {
    const items = v.items.filter((i): i is string => typeof i === "string").slice(0, 20);
    return items.length ? { type: "checklist", title: strOrUndef(v.title), items } : null;
  }

  return null;
}

function strOrUndef(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function Frame({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div
      className="tt my-3 overflow-hidden rounded-2xl border"
      style={{ borderColor: "var(--t-border)", background: "color-mix(in srgb, var(--t-text) 3%, transparent)" }}
    >
      {title && (
        <div
          className="px-4 py-2.5 text-sm font-semibold"
          style={{ borderBottom: "1px solid var(--t-border)", color: "var(--t-text)" }}
        >
          {title}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}

function Checklist({ items }: { items: string[] }) {
  const [done, setDone] = useState<Set<number>>(new Set());
  return (
    <ul className="space-y-1.5">
      {items.map((it, i) => {
        const on = done.has(i);
        return (
          <li key={i}>
            <button
              type="button"
              onClick={() =>
                setDone((prev) => {
                  const next = new Set(prev);
                  if (!next.delete(i)) next.add(i);
                  return next;
                })
              }
              aria-pressed={on}
              className="flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-white/5"
            >
              <span
                className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-[5px] border"
                style={{
                  borderColor: on ? "var(--t-primary)" : "var(--t-border)",
                  background: on ? "var(--t-primary)" : "transparent",
                }}
              >
                {on && <Check className="size-3 text-white" />}
              </span>
              <span style={{ color: on ? "var(--t-text-muted)" : "var(--t-text)", textDecoration: on ? "line-through" : undefined }}>
                {it}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Chizib bo'lmagan blok — xom ma'lumot (JSON) ko'rsatiladi, butun sahifa yiqilmaydi. */
function GenUiRaw({ spec }: { spec: GenUiSpec }) {
  const t = useT();
  let raw: string;
  try {
    raw = JSON.stringify(spec, null, 2);
  } catch {
    raw = String(spec);
  }
  return (
    <Frame title={typeof spec.title === "string" ? spec.title : undefined}>
      <p className="mb-2 text-xs" style={{ color: "var(--t-text-muted)" }}>{t("p3bGenUiBroken")}</p>
      <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words text-xs" style={{ color: "var(--t-text)" }}>
        {raw}
      </pre>
    </Frame>
  );
}

const GenUiBoundary = catchError(function GenUiFallback(props: { spec: GenUiSpec }) {
  return <GenUiRaw spec={props.spec} />;
});

/** Xato chegarasi bilan: bitta buzilgan blok butun chat/ulashish sahifasini oq ekranga aylantirmaydi. */
export function GenerativeUI({ spec }: { spec: GenUiSpec }) {
  return (
    <GenUiBoundary spec={spec}>
      <GenUiView spec={spec} />
    </GenUiBoundary>
  );
}

function GenUiView({ spec }: { spec: GenUiSpec }) {
  const { locale, num } = useNum();
  if (spec.type === "kpi") {
    return (
      <Frame title={spec.title}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {spec.items.map((it) => (
            <div key={it.label} className="rounded-xl border p-3" style={{ borderColor: "var(--t-border)" }}>
              <div className="text-xs" style={{ color: "var(--t-text-muted)" }}>{it.label}</div>
              <div className="nums mt-1 text-xl font-extrabold tracking-[-0.02em]" style={{ color: "var(--t-text)" }}>{num(it.value)}</div>
              {it.hint && <div className="mt-0.5 text-[11px]" style={{ color: "var(--t-text-muted)" }}>{it.hint}</div>}
            </div>
          ))}
        </div>
      </Frame>
    );
  }

  if (spec.type === "chart") {
    return (
      <Frame title={spec.title}>
        <div className="h-[260px] w-full">
          <GenUiChart spec={spec} locale={locale} />
        </div>
      </Frame>
    );
  }

  if (spec.type === "table") {
    return (
      <Frame title={spec.title}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                {spec.columns.map((c) => (
                  <th key={c} className="px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--t-text-muted)" }}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {spec.rows.map((r, i) => (
                <tr key={i} style={{ borderTop: "1px solid var(--t-border)" }}>
                  {r.map((cell, j) => (
                    <td key={j} className="nums px-2 py-1.5" style={{ color: "var(--t-text)" }}>{num(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Frame>
    );
  }

  if (spec.type === "steps") {
    return (
      <Frame title={spec.title}>
        <ol className="space-y-3">
          {spec.items.map((it, i) => (
            <li key={i} className="flex gap-3">
              <span
                className="grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold text-white"
                style={{ background: "var(--t-primary)" }}
              >
                {i + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium" style={{ color: "var(--t-text)" }}>{it.title}</span>
                {it.detail && <span className="block text-xs" style={{ color: "var(--t-text-muted)" }}>{it.detail}</span>}
              </span>
            </li>
          ))}
        </ol>
      </Frame>
    );
  }

  return (
    <Frame title={spec.title}>
      <Checklist items={spec.items} />
    </Frame>
  );
}
