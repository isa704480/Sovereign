"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { useMemo } from "react";
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
import { PLAN_BY_ID, type PlanId } from "@/config/plans";
import { EASE } from "@/lib/motion";

interface DailyStat {
  day: string;
  new_users: number;
  active_users: number;
  messages_count: number;
  tokens_used: number;
  revenue_usd: number;
}

interface PlanRow {
  plan: string;
  users_count: number;
  active_users: number;
}

interface OrderRow {
  id: string;
  user_email: string | null;
  plan: string;
  amount: string;
  currency: string;
  status: string;
  paid_at: string | null;
  created_at: string;
}

interface Summary {
  total_users: number;
  new_today: number;
  dau: number;
  wau: number;
  mau: number;
  paying_users: number;
}

interface AdminDashboardProps {
  admin: { name: string; email: string };
  summary: Summary | null;
  daily: DailyStat[];
  plans: PlanRow[];
  recentOrders: OrderRow[];
}

const PLAN_COLORS: Record<string, string> = {
  free: "#9BA3CC",
  starter: "#10D4A0",
  pro: "#5B50F0",
  ultra: "#FF7000",
};

function fmt(n: number | null | undefined) {
  if (n == null) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(n);
}

function fmtMoney(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function KPI({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="text-[11px] uppercase tracking-wider text-white/50">{label}</div>
      <div className="mt-2 text-3xl font-semibold tracking-tight tabular-nums" style={{ color: color ?? "#EBEEFA" }}>
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-white/50">{sub}</div>}
    </div>
  );
}

export function AdminDashboard({ admin, summary, daily, plans, recentOrders }: AdminDashboardProps) {
  const daily30 = useMemo(() => {
    return [...daily].reverse().map((d) => ({
      ...d,
      day: new Date(d.day).toLocaleDateString("uz-UZ", { month: "short", day: "numeric" }),
      revenue_usd: Number(d.revenue_usd || 0),
      tokens_k: Math.round((d.tokens_used || 0) / 1000),
    }));
  }, [daily]);

  const totalRevenue = daily.reduce((acc, d) => acc + Number(d.revenue_usd || 0), 0);
  const totalTokens = daily.reduce((acc, d) => acc + Number(d.tokens_used || 0), 0);

  const planPie = plans.map((p) => ({
    name: PLAN_BY_ID[p.plan as PlanId]?.name ?? p.plan,
    value: Number(p.users_count),
    color: PLAN_COLORS[p.plan] ?? "#5B50F0",
  }));

  return (
    <div className="min-h-svh bg-[#060812] text-white/90">
      {/* Header */}
      <header className="border-b border-white/5 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="text-lg font-semibold tracking-tight">SOVEREIGN Admin</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-white/60">{admin.email}</span>
            <Link
              href="/app"
              className="rounded-full border border-white/10 px-3 py-1.5 text-sm text-white/70 hover:bg-white/5"
            >
              ← Dashboard
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        {/* KPI grid */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE }}
          className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6"
        >
          <KPI label="Jami foydalanuvchi" value={fmt(summary?.total_users)} />
          <KPI label="Bugun yangi" value={fmt(summary?.new_today)} color="#10D4A0" />
          <KPI label="Kunlik faol (DAU)" value={fmt(summary?.dau)} />
          <KPI label="Haftalik (WAU)" value={fmt(summary?.wau)} />
          <KPI label="Oylik (MAU)" value={fmt(summary?.mau)} />
          <KPI label="To'lovchi" value={fmt(summary?.paying_users)} color="#FF7000" />
        </motion.div>

        {/* Revenue + Tokens (30 kun) */}
        <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
            <div className="mb-1 flex items-center justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-white/50">Daromad · 30 kun</div>
                <div className="mt-1 text-2xl font-semibold tabular-nums" style={{ color: "#10D4A0" }}>
                  {fmtMoney(totalRevenue)}
                </div>
              </div>
            </div>
            <div className="mt-4 h-56">
              <ResponsiveContainer>
                <AreaChart data={daily30}>
                  <defs>
                    <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10D4A0" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#10D4A0" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="day" stroke="#78798E" fontSize={11} />
                  <YAxis stroke="#78798E" fontSize={11} tickFormatter={(v) => `$${v}`} />
                  <CartesianGrid strokeDasharray="3 3" stroke="#22243A" />
                  <Tooltip
                    contentStyle={{ background: "#0A0B12", border: "1px solid #22243A", borderRadius: 12, fontSize: 12 }}
                    formatter={(v) => [fmtMoney(Number(v)), "Daromad"] as [string, string]}
                  />
                  <Area type="monotone" dataKey="revenue_usd" stroke="#10D4A0" fill="url(#rev)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
            <div className="mb-1 flex items-center justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-white/50">Tokenlar · 30 kun</div>
                <div className="mt-1 text-2xl font-semibold tabular-nums" style={{ color: "#5B50F0" }}>
                  {fmt(totalTokens)}
                </div>
              </div>
            </div>
            <div className="mt-4 h-56">
              <ResponsiveContainer>
                <AreaChart data={daily30}>
                  <defs>
                    <linearGradient id="tok" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#5B50F0" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#5B50F0" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="day" stroke="#78798E" fontSize={11} />
                  <YAxis stroke="#78798E" fontSize={11} tickFormatter={(v) => `${v}k`} />
                  <CartesianGrid strokeDasharray="3 3" stroke="#22243A" />
                  <Tooltip
                    contentStyle={{ background: "#0A0B12", border: "1px solid #22243A", borderRadius: 12, fontSize: 12 }}
                    formatter={(v) => [`${v}k`, "Tokenlar"] as [string, string]}
                  />
                  <Area type="monotone" dataKey="tokens_k" stroke="#5B50F0" fill="url(#tok)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>
        </div>

        {/* Faol foydalanuvchilar (line) + Plan taqsimoti (pie) */}
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 lg:col-span-2">
            <div className="text-[11px] uppercase tracking-wider text-white/50">Faollik · 30 kun</div>
            <div className="mt-4 h-56">
              <ResponsiveContainer>
                <LineChart data={daily30}>
                  <XAxis dataKey="day" stroke="#78798E" fontSize={11} />
                  <YAxis stroke="#78798E" fontSize={11} />
                  <CartesianGrid strokeDasharray="3 3" stroke="#22243A" />
                  <Tooltip
                    contentStyle={{ background: "#0A0B12", border: "1px solid #22243A", borderRadius: 12, fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, color: "#78798E" }} />
                  <Line type="monotone" dataKey="active_users" name="Faol" stroke="#5B50F0" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="new_users" name="Yangi" stroke="#10D4A0" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="messages_count" name="Xabar" stroke="#F5AA3C" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
            <div className="text-[11px] uppercase tracking-wider text-white/50">Tarif taqsimoti</div>
            <div className="mt-4 h-56">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={planPie} dataKey="value" innerRadius={44} outerRadius={80} paddingAngle={2}>
                    {planPie.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "#0A0B12", border: "1px solid #22243A", borderRadius: 12, fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 space-y-1.5 text-xs">
              {planPie.map((p) => (
                <div key={p.name} className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className="size-2.5 rounded-full" style={{ background: p.color }} />
                    {p.name}
                  </span>
                  <span className="tabular-nums text-white/60">{p.value}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Oxirgi to'lovlar jadvali */}
        <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <div className="mb-4 flex items-center justify-between">
            <div className="text-[11px] uppercase tracking-wider text-white/50">Oxirgi to'lovlar</div>
            <div className="text-xs text-white/50 tabular-nums">{recentOrders.length} yozuv</div>
          </div>
          <div className="overflow-hidden rounded-xl border border-white/5">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.02] text-[11px] uppercase tracking-wider text-white/50">
                <tr>
                  <th className="p-3 text-left font-normal">Sana</th>
                  <th className="p-3 text-left font-normal">Foydalanuvchi</th>
                  <th className="p-3 text-left font-normal">Tarif</th>
                  <th className="p-3 text-right font-normal">Miqdor</th>
                  <th className="p-3 text-right font-normal">Holat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {recentOrders.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-white/40">
                      Hozircha to'lovlar yo'q
                    </td>
                  </tr>
                )}
                {recentOrders.map((o) => (
                  <tr key={o.id} className="hover:bg-white/[0.02]">
                    <td className="p-3 text-white/70 tabular-nums">
                      {new Date(o.created_at).toLocaleDateString("uz-UZ")}
                    </td>
                    <td className="p-3 text-white/70">{o.user_email ?? "—"}</td>
                    <td className="p-3">
                      <span
                        className="rounded-full px-2 py-0.5 text-xs"
                        style={{
                          background: `${PLAN_COLORS[o.plan] ?? "#5B50F0"}22`,
                          color: PLAN_COLORS[o.plan] ?? "#5B50F0",
                        }}
                      >
                        {PLAN_BY_ID[o.plan as PlanId]?.name ?? o.plan}
                      </span>
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      ${o.amount} <span className="text-white/40">{o.currency}</span>
                    </td>
                    <td className="p-3 text-right">
                      <span
                        className="rounded-full px-2 py-0.5 text-xs"
                        style={{
                          background:
                            o.status === "paid" ? "#10D4A022" : o.status === "expired" ? "#EB5A6422" : "#F5AA3C22",
                          color: o.status === "paid" ? "#10D4A0" : o.status === "expired" ? "#EB5A64" : "#F5AA3C",
                        }}
                      >
                        {o.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
