"use client";

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
import type { GenUiSpec } from "./GenerativeUI";

/**
 * Generative UI grafigi — recharts (redux-toolkit, d3 bilan) og'ir, grafik esa kam
 * uchraydi: shu fayl GenerativeUI'dan next/dynamic orqali faqat kerak bo'lganda yuklanadi.
 */
const PALETTE = ["#5B50F0", "#10D4A0", "#F5AA3C", "#E0554E", "#7C6FF7", "#3CC7F5"];
const AXIS = { stroke: "var(--t-text-muted)", fontSize: 12 };

type ChartSpec = Extract<GenUiSpec, { type: "chart" }>;

function formatters(locale: string) {
  let full: Intl.NumberFormat | null = null;
  let compact: Intl.NumberFormat | null = null;
  try {
    full = new Intl.NumberFormat(locale);
    compact = new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 });
  } catch {
    /* eski brauzer — xom qiymat */
  }
  return {
    // O'q yorliqlari: 1 250 000 → "1,3 млн" / "1.3M" (Y o'qi kengligidan chiqmasin).
    tick: (v: unknown) => (typeof v === "number" && compact ? compact.format(v) : String(v)),
    // Tooltip: to'liq, lokal ajratgichlar bilan.
    value: (v: unknown) => (typeof v === "number" && full ? full.format(v) : String(v)),
  };
}

function ChartBody({ spec, locale }: { spec: ChartSpec; locale: string }) {
  const f = formatters(locale);
  const tooltip = (
    <Tooltip
      formatter={(v) => f.value(v)}
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
        <Pie data={spec.data} dataKey={key} nameKey={spec.xKey} outerRadius="78%" label={({ value }) => f.tick(value)}>
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
        <XAxis dataKey={spec.xKey} {...AXIS} tickFormatter={f.tick} />
        <YAxis {...AXIS} tickFormatter={f.tick} />
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
        <XAxis dataKey={spec.xKey} {...AXIS} tickFormatter={f.tick} />
        <YAxis {...AXIS} tickFormatter={f.tick} />
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
      <XAxis dataKey={spec.xKey} {...AXIS} tickFormatter={f.tick} />
      <YAxis {...AXIS} tickFormatter={f.tick} />
      {tooltip}
      {spec.series.length > 1 && <Legend />}
      {spec.series.map((s, i) => (
        <Bar key={s.key} dataKey={s.key} name={s.label ?? s.key} fill={color(i, s.color)} radius={[6, 6, 0, 0]} />
      ))}
    </BarChart>
  );
}

export default function GenUiChart({ spec, locale }: { spec: ChartSpec; locale: string }) {
  return (
    <ResponsiveContainer>
      <ChartBody spec={spec} locale={locale} />
    </ResponsiveContainer>
  );
}
