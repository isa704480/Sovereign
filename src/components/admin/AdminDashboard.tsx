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
import { countryFlag, countryName } from "@/config/countries";
import { AUTO_MODEL, AUTO_MODEL_ID, MODEL_BY_ID } from "@/config/models";
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

/** admin_onboarding_stats() natijasi — davlatlar va yosh guruhlari. */
export interface OnboardingStats {
  total_users: number;
  with_country: number;
  with_age: number;
  avg_age: number | null;
  by_country: { country: string; users: number }[];
  by_age: { age_group: string; users: number }[];
  signups_30d: number;
}

/** admin_model_stats() natijasi — model bo'yicha ishlatilish va sifat. */
export interface ModelStats {
  total_messages: number;
  total_tokens: number;
  active_models: number;
  by_model: {
    model_id: string;
    messages: number;
    users: number;
    in_tokens: number;
    out_tokens: number;
    total_tokens: number;
    avg_out: number;
    last_used: string | null;
  }[];
}

interface AdminDashboardProps {
  admin: { name: string; email: string };
  summary: Summary | null;
  daily: DailyStat[];
  plans: PlanRow[];
  recentOrders: OrderRow[];
  onboarding?: OnboardingStats | null;
  models?: ModelStats | null;
}

const AGE_LABEL: Record<string, string> = {
  u18: "18 gacha",
  "18-24": "18–24",
  "25-34": "25–34",
  "35-44": "35–44",
  "45-54": "45–54",
  "55+": "55+",
};

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

/** Model id -> ko'rinadigan nom, belgi va rang (katalogdan). */
function modelMeta(id: string): { name: string; glyph: string; color: string } {
  if (id === AUTO_MODEL_ID) return { name: AUTO_MODEL.name, glyph: AUTO_MODEL.glyph, color: AUTO_MODEL.primary };
  const m = MODEL_BY_ID[id];
  return m ? { name: m.name, glyph: m.glyph, color: m.primary } : { name: id, glyph: "•", color: "#9BA3CC" };
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

export function AdminDashboard({ admin, summary, daily, plans, recentOrders, onboarding, models }: AdminDashboardProps) {
  const ageBars = (onboarding?.by_age ?? []).map((a) => ({ name: AGE_LABEL[a.age_group] ?? a.age_group, users: a.users }));
  const countryRows = onboarding?.by_country ?? [];
  const countryTotal = countryRows.reduce((acc, r) => acc + r.users, 0);
  const modelRows = models?.by_model ?? [];
  const modelTotal = models?.total_messages ?? modelRows.reduce((a, r) => a + r.messages, 0);
  const usageBars = modelRows.slice(0, 8).map((r) => {
    const meta = modelMeta(r.model_id);
    return { name: meta.name, messages: r.messages, fill: meta.color };
  });
  const qualityBars = [...modelRows]
    .filter((r) => r.avg_out > 0)
    .sort((a, b) => b.avg_out - a.avg_out)
    .slice(0, 8)
    .map((r) => {
      const meta = modelMeta(r.model_id);
      return { name: meta.name, avg: r.avg_out, fill: meta.color };
    });
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
          {/* Apple: KPI raqamlari hammasi bir xil rangda. Faqat "To'lovchi" — daromad va'dasi — accent'da. */}
          <KPI label="Jami foydalanuvchi" value={fmt(summary?.total_users)} />
          <KPI label="Bugun yangi" value={fmt(summary?.new_today)} />
          <KPI label="Kunlik faol (DAU)" value={fmt(summary?.dau)} />
          <KPI label="Haftalik (WAU)" value={fmt(summary?.wau)} />
          <KPI label="Oylik (MAU)" value={fmt(summary?.mau)} />
          <KPI label="To'lovchi" value={fmt(summary?.paying_users)} color="#8B7DFF" />
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

        {/* Auditoriya: yosh va davlat (onboarding'dan) */}
        <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
            <div className="text-[11px] uppercase tracking-wider text-white/50">Yosh taqsimoti</div>
            {onboarding ? (
              <>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-3xl font-semibold tabular-nums">{onboarding.avg_age ?? "—"}</span>
                  <span className="text-xs text-white/50">o&apos;rtacha yosh · {onboarding.with_age} ta javob</span>
                </div>
                <div className="mt-4 h-48">
                  <ResponsiveContainer>
                    <BarChart data={ageBars}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#22243A" />
                      <XAxis dataKey="name" stroke="#6E7191" fontSize={11} />
                      <YAxis stroke="#6E7191" fontSize={11} allowDecimals={false} />
                      <Tooltip contentStyle={{ background: "#0A0B12", border: "1px solid #22243A", borderRadius: 12, fontSize: 12 }} />
                      <Bar dataKey="users" name="Foydalanuvchi" fill="#5B50F0" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </>
            ) : (
              <p className="mt-3 text-sm text-white/50">Ma&apos;lumot yo&apos;q — 0020 migratsiyasini ishga tushiring.</p>
            )}
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 lg:col-span-2">
            <div className="mb-4 flex items-center justify-between">
              <div className="text-[11px] uppercase tracking-wider text-white/50">Davlatlar bo&apos;yicha ro&apos;yxatdan o&apos;tganlar</div>
              <div className="text-xs text-white/50 tabular-nums">
                {countryRows.length} davlat · {countryTotal} foydalanuvchi
                {onboarding ? ` · oxirgi 30 kun: ${onboarding.signups_30d}` : ""}
              </div>
            </div>
            {countryRows.length ? (
              <div className="max-h-72 overflow-y-auto rounded-xl border border-white/5">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-[#0A0B12] text-[11px] uppercase tracking-wider text-white/40">
                    <tr>
                      <th className="px-3 py-2 text-left">#</th>
                      <th className="px-3 py-2 text-left">Davlat</th>
                      <th className="px-3 py-2 text-right">Foydalanuvchi</th>
                      <th className="px-3 py-2 text-right">Ulush</th>
                    </tr>
                  </thead>
                  <tbody>
                    {countryRows.map((r, i) => (
                      <tr key={r.country} className="border-t border-white/5">
                        <td className="px-3 py-2 tabular-nums text-white/40">{i + 1}</td>
                        <td className="px-3 py-2">
                          {countryFlag(r.country)} {countryName(r.country, "uz")}{" "}
                          <span className="text-white/40">{r.country}</span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.users}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-white/60">
                          {countryTotal ? Math.round((r.users / countryTotal) * 100) : 0}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-white/50">Hali davlat tanlagan foydalanuvchi yo&apos;q.</p>
            )}
          </section>
        </div>

        {/* Modellar: ishlatilishi va sifati (messages jadvalidan) */}
        <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <div className="text-[11px] uppercase tracking-wider text-white/50">Modellar — ishlatilishi va sifati</div>
            {models && (
              <div className="text-xs text-white/50 tabular-nums">
                {fmt(models.total_messages)} javob · {models.active_models} model · {fmt(models.total_tokens)} token
              </div>
            )}
          </div>

          {modelRows.length > 0 ? (
            <>
              <div className="mt-5 grid gap-6 lg:grid-cols-2">
                <div>
                  <div className="mb-2 text-sm text-white/70">Eng ko&apos;p ishlatilgan (javoblar soni)</div>
                  <ResponsiveContainer width="100%" height={Math.max(180, usageBars.length * 34)}>
                    <BarChart data={usageBars} layout="vertical" margin={{ left: 8, right: 16 }}>
                      <XAxis type="number" hide />
                      <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11, fill: "#9BA3CC" }} axisLine={false} tickLine={false} />
                      <Tooltip
                        cursor={{ fill: "rgba(255,255,255,0.04)" }}
                        contentStyle={{ background: "#0D1033", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12 }}
                        labelStyle={{ color: "#EBEEFA" }}
                        formatter={(v) => [fmt(Number(v)), "Javoblar"] as [string, string]}
                      />
                      <Bar dataKey="messages" radius={[0, 6, 6, 0]}>
                        {usageBars.map((d, i) => (
                          <Cell key={i} fill={d.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div>
                  <div className="mb-2 text-sm text-white/70">Yaxshi ishlayapti — o&apos;rtacha javob (token)</div>
                  {qualityBars.length > 0 ? (
                    <ResponsiveContainer width="100%" height={Math.max(180, qualityBars.length * 34)}>
                      <BarChart data={qualityBars} layout="vertical" margin={{ left: 8, right: 16 }}>
                        <XAxis type="number" hide />
                        <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11, fill: "#9BA3CC" }} axisLine={false} tickLine={false} />
                        <Tooltip
                          cursor={{ fill: "rgba(255,255,255,0.04)" }}
                          contentStyle={{ background: "#0D1033", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12 }}
                          labelStyle={{ color: "#EBEEFA" }}
                          formatter={(v) => [fmt(Number(v)), "O'rt. token"] as [string, string]}
                        />
                        <Bar dataKey="avg" radius={[0, 6, 6, 0]}>
                          {qualityBars.map((d, i) => (
                            <Cell key={i} fill={d.fill} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-sm text-white/40">Token ma&apos;lumoti yetarli emas.</p>
                  )}
                </div>
              </div>

              <div className="mt-6">
                <div className="mb-2 text-sm text-white/70">Barcha modellar — to&apos;liq ro&apos;yxat</div>
                <div className="overflow-x-auto rounded-xl border border-white/5">
                  <table className="w-full text-sm">
                    <thead className="bg-white/[0.02] text-[11px] uppercase tracking-wider text-white/50">
                      <tr>
                        <th className="p-3 text-left font-normal">Model</th>
                        <th className="p-3 text-right font-normal">Javoblar</th>
                        <th className="p-3 text-right font-normal">Ulush</th>
                        <th className="p-3 text-right font-normal">Foydalanuvchi</th>
                        <th className="p-3 text-right font-normal">O&apos;rt. javob</th>
                        <th className="p-3 text-right font-normal">Jami token</th>
                        <th className="p-3 text-right font-normal">Oxirgi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {modelRows.map((r) => {
                        const meta = modelMeta(r.model_id);
                        const share = modelTotal > 0 ? (r.messages / modelTotal) * 100 : 0;
                        return (
                          <tr key={r.model_id} className="hover:bg-white/[0.02]">
                            <td className="p-3">
                              <span className="inline-flex items-center gap-2">
                                <span
                                  className="inline-flex size-5 items-center justify-center rounded-[6px] text-[11px]"
                                  style={{ background: `${meta.color}22`, color: meta.color }}
                                >
                                  {meta.glyph}
                                </span>
                                <span className="text-white/80">{meta.name}</span>
                              </span>
                            </td>
                            <td className="p-3 text-right tabular-nums text-white/70">{fmt(r.messages)}</td>
                            <td className="p-3 text-right tabular-nums">
                              <span className="inline-flex items-center gap-2">
                                <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-white/10 sm:block">
                                  <span className="block h-full rounded-full" style={{ width: `${Math.min(100, share)}%`, background: meta.color }} />
                                </span>
                                <span className="text-white/60">{share.toFixed(1)}%</span>
                              </span>
                            </td>
                            <td className="p-3 text-right tabular-nums text-white/60">{fmt(r.users)}</td>
                            <td className="p-3 text-right tabular-nums text-white/60">{fmt(r.avg_out)}</td>
                            <td className="p-3 text-right tabular-nums text-white/60">{fmt(r.total_tokens)}</td>
                            <td className="p-3 text-right text-white/50 tabular-nums">
                              {r.last_used ? new Date(r.last_used).toLocaleDateString("uz-UZ") : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <p className="mt-4 text-sm text-white/50">
              {models
                ? "Hali model ishlatilmagan — suhbatlar boshlanganda bu yerda ko'rinadi."
                : "Ma'lumot yo'q — 0021_admin_model_stats migratsiyasini ishga tushiring."}
            </p>
          )}
        </section>

        {/* Oxirgi to'lovlar jadvali */}
        <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <div className="mb-4 flex items-center justify-between">
            <div className="text-[11px] uppercase tracking-wider text-white/50">Oxirgi to&apos;lovlar</div>
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
                      Hozircha to&apos;lovlar yo&apos;q
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
