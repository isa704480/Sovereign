"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

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

const PALETTE = ["#5B50F0", "#10D4A0", "#F5AA3C", "#E0554E", "#7C6FF7", "#3CC7F5"];

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

  if (v.type === "kpi" && Array.isArray(v.items)) {
    const items = v.items.filter((i): i is { label: string; value: string | number; hint?: string } =>
      isRec(i) && typeof i.label === "string" && isPrim(i.value),
    );
    return items.length ? { type: "kpi", title: strOrUndef(v.title), items: items.slice(0, 6) } : null;
  }

  if (v.type === "chart" && Array.isArray(v.data) && Array.isArray(v.series) && typeof v.xKey === "string") {
    const chart = v.chart === "line" || v.chart === "area" || v.chart === "pie" ? v.chart : "bar";
    const series = v.series
      .filter((s): s is { key: string; label?: string; color?: string } => isRec(s) && typeof s.key === "string")
      .slice(0, 6);
    const data = v.data.filter(isRec).slice(0, 60) as Record<string, string | number>[];
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
      .filter((i): i is { title: string; detail?: string } => isRec(i) && typeof i.title === "string")
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

const AXIS = { stroke: "var(--t-text-muted)", fontSize: 12 };

function ChartBody({ spec }: { spec: Extract<GenUiSpec, { type: "chart" }> }) {
  const tooltip = (
    <Tooltip
      contentStyle={{
        background: "var(--t-surface)",
        border: "1px solid var(--t-border)",
        borderRadius: 10,
        color: "var(--t-text)",
      }}
    />
  );
  const color = (i: number, given?: string) => given ?? PALETTE[i % PALETTE.length];

  if (spec.chart === "pie") {
    const key = spec.series[0].key;
    return (
      <PieChart>
        <Pie data={spec.data} dataKey={key} nameKey={spec.xKey} outerRadius="78%" label>
          {spec.data.map((_, i) => (
            <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
          ))}
        </Pie>
        {tooltip}
        <Legend />
      </PieChart>
    );
  }
  if (spec.chart === "line") {
    return (
      <LineChart data={spec.data}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--t-border)" />
        <XAxis dataKey={spec.xKey} {...AXIS} />
        <YAxis {...AXIS} />
        {tooltip}
        {spec.series.length > 1 && <Legend />}
        {spec.series.map((s, i) => (
          <Line key={s.key} type="monotone" dataKey={s.key} name={s.label ?? s.key} stroke={color(i, s.color)} strokeWidth={2} dot={false} />
        ))}
      </LineChart>
    );
  }
  if (spec.chart === "area") {
    return (
      <AreaChart data={spec.data}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--t-border)" />
        <XAxis dataKey={spec.xKey} {...AXIS} />
        <YAxis {...AXIS} />
        {tooltip}
        {spec.series.length > 1 && <Legend />}
        {spec.series.map((s, i) => (
          <Area key={s.key} type="monotone" dataKey={s.key} name={s.label ?? s.key} stroke={color(i, s.color)} fill={color(i, s.color)} fillOpacity={0.18} />
        ))}
      </AreaChart>
    );
  }
  return (
    <BarChart data={spec.data}>
      <CartesianGrid strokeDasharray="3 3" stroke="var(--t-border)" />
      <XAxis dataKey={spec.xKey} {...AXIS} />
      <YAxis {...AXIS} />
      {tooltip}
      {spec.series.length > 1 && <Legend />}
      {spec.series.map((s, i) => (
        <Bar key={s.key} dataKey={s.key} name={s.label ?? s.key} fill={color(i, s.color)} radius={[6, 6, 0, 0]} />
      ))}
    </BarChart>
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

export function GenerativeUI({ spec }: { spec: GenUiSpec }) {
  if (spec.type === "kpi") {
    return (
      <Frame title={spec.title}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {spec.items.map((it) => (
            <div key={it.label} className="rounded-xl border p-3" style={{ borderColor: "var(--t-border)" }}>
              <div className="text-xs" style={{ color: "var(--t-text-muted)" }}>{it.label}</div>
              <div className="nums mt-1 text-xl font-extrabold tracking-[-0.02em]" style={{ color: "var(--t-text)" }}>{it.value}</div>
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
          <ResponsiveContainer>
            <ChartBody spec={spec} />
          </ResponsiveContainer>
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
                    <td key={j} className="nums px-2 py-1.5" style={{ color: "var(--t-text)" }}>{cell}</td>
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
