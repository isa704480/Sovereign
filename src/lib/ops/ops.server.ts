import "server-only";
import { createHash } from "node:crypto";
import { after } from "next/server";
import { isLang, type Lang } from "@/lib/i18n";
import { budgetConfig } from "@/lib/econ/budget";
import { fetchOpenRouterBalance } from "@/lib/econ/alerts";
import { createServiceClient } from "@/lib/supabase/service";
import {
  breakerDowntime,
  composeDigest,
  DIGEST_WINDOW_MS,
  exhaustedByReason,
  failoverRoutes,
  providersSection,
  sumCounters,
  usersSection,
  type DigestData,
  type DigestKind,
} from "./digest";
import type { DeviceRow, FeedDeps, PaymentRow, SignupRow } from "./feed";
import { bold, countryCode, deviceKind, maskEmail, providerLabel, safeId, tashkentTime, tt, utcDayKey, utcHourKey } from "./format";
import { fetchCommits, fetchReleases } from "./github";
import type { BotCommand, BotDeps, DigestDeps } from "./handlers";
import { opsRecorder, opsStore } from "./record";
import { dayKey, hourKey, type OpsEvent, type OpsEventType } from "./store";
import { sendTelegramText, telegramConfig } from "./telegram";

/**
 * Ops bot'ning server tomoni: manbalar (Supabase service role — FAQAT O'QISH, GitHub read-only),
 * ombor (Upstash), yuboruvchi (Telegram). Route'lar faqat shu fayldagi *Deps() ni chaqiradi.
 * Hech bir funksiya chat/xabar matni, fayl nomi, IP yoki token o'qimaydi.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export function opsLang(): Lang {
  const v = (process.env.ALERT_LANG ?? "").trim();
  return isLang(v) ? v : "uz";
}

function sb() {
  return createServiceClient();
}

function sendHtml(html: string): Promise<boolean> {
  return sendTelegramText(html, { config: telegramConfig(), html: true, tag: "ops-bot" });
}

const iso = (t: number) => new Date(t).toISOString();
const utcDate = (t: number) => iso(t).slice(0, 10);

/** user_id → email (faqat niqoblash uchun; chiqishda to'liq email yo'q). */
async function emailsOf(ids: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const uniq = [...new Set(ids.filter(Boolean))].slice(0, 200);
  if (!uniq.length) return out;
  const { data, error } = await sb().from("profiles").select("id,email").in("id", uniq);
  if (error) throw new Error(`profiles: ${error.message}`);
  for (const r of (data ?? []) as { id: string; email: string | null }[]) out.set(r.id, r.email);
  return out;
}

/* ------------------------------------------------------------------ */
/* Lenta manbalari                                                      */
/* ------------------------------------------------------------------ */

async function signupsSince(since: number): Promise<SignupRow[]> {
  const client = sb();
  const { data, error } = await client
    .from("profiles")
    .select("id,email,onboarding,created_at")
    .gt("created_at", iso(since))
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) throw new Error(`profiles: ${error.message}`);
  const rows = (data ?? []) as { id: string; email: string | null; onboarding: Record<string, unknown> | null; created_at: string }[];
  // Ro'yxatdan o'tish usuli (auth provayderi) — faqat birinchi 20 ta uchun (Admin API chaqiruvi).
  const methods = await Promise.all(
    rows.slice(0, 20).map(async (r) => {
      try {
        const { data: u } = await client.auth.admin.getUserById(r.id);
        const p = u?.user?.app_metadata?.provider;
        return typeof p === "string" ? p : null;
      } catch {
        return null;
      }
    }),
  );
  return rows.map((r, i) => ({
    id: r.id,
    email: r.email,
    createdAt: Date.parse(r.created_at),
    country: r.onboarding?.country,
    purposes: r.onboarding?.purposes,
    method: methods[i] ?? null,
  }));
}

type OrderDb = {
  id: string;
  user_id: string;
  plan: string;
  amount: string | number;
  currency: string | null;
  provider: string | null;
  billing_period?: string | null;
  paid_at: string | null;
};

async function ordersQuery(build: (cols: string) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<OrderDb[]> {
  let res = await build("id,user_id,plan,amount,currency,provider,billing_period,paid_at");
  // 0025 migratsiyasisiz (billing_period yo'q) — hammasi oylik.
  if (res.error && /billing_period|column/i.test(res.error.message)) res = await build("id,user_id,plan,amount,currency,provider,paid_at");
  if (res.error) throw new Error(`orders: ${res.error.message}`);
  return (res.data ?? []) as OrderDb[];
}

async function toPaymentRows(orders: OrderDb[]): Promise<PaymentRow[]> {
  const emails = await emailsOf(orders.map((o) => o.user_id)).catch(() => new Map<string, string | null>());
  return orders.map((o) => ({
    id: o.id,
    email: emails.get(o.user_id) ?? null,
    plan: o.plan,
    period: o.billing_period ?? "month",
    amount: Number(o.amount),
    currency: (o.currency ?? "USD").toUpperCase(),
    provider: o.provider ?? "—",
    paidAt: o.paid_at ? Date.parse(o.paid_at) : Date.now(),
  }));
}

async function paymentsSince(since: number): Promise<PaymentRow[]> {
  const orders = await ordersQuery((cols) =>
    sb()
      .from("orders")
      .select(cols)
      .in("status", ["paid", "refunded"])
      .gt("paid_at", iso(since))
      .order("paid_at", { ascending: true })
      .limit(100),
  );
  return toPaymentRows(orders);
}

const codeKey = (code: string) => createHash("sha256").update(`ops:${code}`).digest("hex").slice(0, 16);

async function devicesSince(since: number): Promise<{ logins: DeviceRow[]; revokes: DeviceRow[] }> {
  const client = sb();
  // approved_at (0039), delivered_at (0027), start_country (0040) bo'lmasa — soddaroq so'rov.
  let full = true;
  const loginQuery = (cols: string, at: string) =>
    client.from("cli_sessions").select(cols).eq("approved", true).gt(at, iso(since)).order(at, { ascending: true }).limit(100);
  let logins = await loginQuery("code,user_id,device_name,start_country,approved_at", "approved_at");
  if (logins.error && /column/i.test(logins.error.message)) {
    full = false;
    logins = await loginQuery("code,user_id,device_name,created_at", "created_at");
  }
  if (logins.error) throw new Error(`cli_sessions: ${logins.error.message}`);
  let revokes = await client
    .from("cli_sessions")
    .select("code,user_id,device_name,revoked_at")
    .gt("revoked_at", iso(since))
    .not("delivered_at", "is", null)
    .order("revoked_at", { ascending: true })
    .limit(100);
  if (revokes.error && /column/i.test(revokes.error.message)) {
    revokes = await client
      .from("cli_sessions")
      .select("code,user_id,device_name,revoked_at")
      .gt("revoked_at", iso(since))
      .order("revoked_at", { ascending: true })
      .limit(100);
  }
  type Row = { code: string; user_id: string | null; device_name: string | null; start_country?: string | null; approved_at?: string; created_at?: string; revoked_at?: string };
  const lr = (logins.data ?? []) as unknown as Row[];
  const rr = revokes.error ? [] : ((revokes.data ?? []) as unknown as Row[]);
  const emails = await emailsOf([...lr, ...rr].map((r) => r.user_id ?? "")).catch(() => new Map<string, string | null>());
  const row = (r: Row, at: string | undefined): DeviceRow => ({
    key: codeKey(r.code),
    device: r.device_name,
    email: r.user_id ? (emails.get(r.user_id) ?? null) : null,
    country: full ? (r.start_country ?? null) : null,
    at: at ? Date.parse(at) : Date.now(),
  });
  return { logins: lr.map((r) => row(r, r.approved_at ?? r.created_at)), revokes: rr.map((r) => row(r, r.revoked_at)) };
}

export function opsFeedDeps(): FeedDeps {
  const tg = telegramConfig();
  const limit = Number(process.env.OPS_FEED_MAX_PER_10MIN);
  const foMin = Number(process.env.OPS_FAILOVER_MIN);
  return {
    cronSecret: process.env.CRON_SECRET,
    now: () => Date.now(),
    lang: opsLang(),
    store: opsStore(),
    telegram: tg !== null,
    send: sendHtml,
    signups: signupsSince,
    payments: paymentsSince,
    devices: devicesSince,
    releases: (since) => fetchReleases(fetch, since),
    commits: (since) => fetchCommits(fetch, since),
    limits: {
      ...(Number.isFinite(limit) && limit > 0 ? { perWindow: Math.min(limit, 100) } : {}),
      ...(Number.isFinite(foMin) && foMin > 0 ? { failoverMin: foMin } : {}),
    },
  };
}

/* ------------------------------------------------------------------ */
/* Webhook'lardan: refund / chargeback / renewal (niqoblangan hodisa)    */
/* ------------------------------------------------------------------ */

/**
 * To'lov webhook'i muvaffaqiyatli bajarilgandan KEYIN (after()) chaqiriladi: buyurtmani o'qib,
 * niqoblangan hodisani ro'yxatga yozadi (lenta 5 daqiqada Telegram'ga yuboradi). Hech qachon otmaydi.
 */
export async function recordOrderEvent(type: Extract<OpsEventType, "refund" | "chargeback" | "renewal">, orderId: string): Promise<void> {
  try {
    const orders = await ordersQuery((cols) => sb().from("orders").select(cols).eq("id", orderId).limit(1));
    const o = orders[0];
    if (!o) return;
    const [row] = await toPaymentRows([o]);
    const t = Date.now();
    opsRecorder().event({
      id: `${type}:${o.id}:${type === "renewal" ? utcDate(t) : "1"}`,
      t,
      type,
      d: {
        plan: safeId(row.plan, 12),
        period: row.period === "year" ? "year" : "month",
        amount: Number.isFinite(row.amount) ? Math.round(row.amount * 100) / 100 : null,
        currency: safeId(row.currency, 6).toUpperCase(),
        provider: safeId(row.provider, 16),
        email: maskEmail(row.email),
      },
    });
    await opsRecorder().flush();
  } catch (e) {
    console.error("[ops] order event:", e instanceof Error ? e.message.slice(0, 200) : "error");
  }
}

/** Webhook route'lar uchun: javobni kutdirmasdan (after) hodisa yozish. */
export function deferOrderEvent(type: Extract<OpsEventType, "refund" | "chargeback" | "renewal">, orderId: string): void {
  const job = () => recordOrderEvent(type, orderId);
  try {
    after(job);
  } catch {
    void job();
  }
}

/* ------------------------------------------------------------------ */
/* Hisobot ma'lumoti                                                    */
/* ------------------------------------------------------------------ */

async function settle<T>(name: string, p: () => Promise<T>): Promise<T | null> {
  try {
    return await p();
  } catch (e) {
    console.warn(`[ops-digest] ${name}: ${e instanceof Error ? e.message.slice(0, 200) : "error"}`);
    return null;
  }
}

async function countRows(build: () => PromiseLike<{ count: number | null; error: { message: string } | null }>): Promise<number> {
  const { count, error } = await build();
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** usage_daily (web + CLI xabarlari) — DAU/WAU/MAU va kunlik xabarlar. */
async function usageStats(end: number, days: number) {
  const today = utcDate(end);
  const from30 = utcDate(end - 29 * DAY);
  const fromWin = utcDate(end - (days - 1) * DAY);
  const d7 = utcDate(end - 6 * DAY);
  const rows: { user_id: string; day: string; messages: number }[] = [];
  for (let off = 0; off < 100_000; off += 1000) {
    const { data, error } = await sb()
      .from("usage_daily")
      .select("user_id,day,messages")
      .gte("day", from30)
      .lte("day", today)
      .range(off, off + 999);
    if (error) throw new Error(`usage_daily: ${error.message}`);
    rows.push(...((data ?? []) as typeof rows));
    if (!data || data.length < 1000) break;
  }
  const users = (min: string) => new Set(rows.filter((r) => r.day >= min && r.messages > 0).map((r) => r.user_id)).size;
  return {
    dau: users(today),
    wau: users(d7),
    mau: users(from30),
    messages: rows.filter((r) => r.day >= fromWin).reduce((s, r) => s + (Number(r.messages) || 0), 0),
  };
}

async function inquiryStats(from: number, end: number) {
  const { data, error } = await sb()
    .from("inquiry_events")
    .select("gate,decision_final")
    .gte("created_at", iso(from))
    .lt("created_at", iso(end))
    .limit(20_000);
  if (error) throw new Error(`inquiry_events: ${error.message}`);
  const rows = (data ?? []) as { gate: string; decision_final: string }[];
  return {
    total: rows.length,
    ask: rows.filter((r) => r.decision_final === "ask" || r.decision_final === "answer_then_ask").length,
    skip: rows.filter((r) => r.gate === "skip").length,
  };
}

async function mediaStats(end: number, days: number) {
  const { data, error } = await sb()
    .from("media_usage_daily")
    .select("kind,count")
    .gte("day", utcDate(end - (days - 1) * DAY))
    .lte("day", utcDate(end))
    .limit(50_000);
  if (error) throw new Error(`media_usage_daily: ${error.message}`);
  const out = { image: 0, video: 0, transcribe: 0 };
  for (const r of (data ?? []) as { kind: keyof typeof out; count: number }[]) if (r.kind in out) out[r.kind] += Number(r.count) || 0;
  return out;
}

async function revenueStats(from: number, end: number) {
  const orders = await ordersQuery((cols) =>
    sb().from("orders").select(cols).eq("status", "paid").gte("paid_at", iso(from)).lt("paid_at", iso(end)).limit(5000),
  );
  const out = { usd: 0, rub: 0, count: orders.length };
  for (const o of orders) {
    const a = Number(o.amount) || 0;
    if ((o.currency ?? "USD").toUpperCase() === "RUB") out.rub += a;
    else out.usd += a;
  }
  return out;
}

async function activeDevices(from: number) {
  const { data, error } = await sb()
    .from("cli_sessions")
    .select("device_name")
    .eq("approved", true)
    .is("revoked_at", null)
    .gte("last_used_at", iso(from))
    .limit(10_000);
  if (error) throw new Error(`cli_sessions: ${error.message}`);
  let cli = 0;
  let cowork = 0;
  for (const r of (data ?? []) as { device_name: string | null }[]) {
    if (deviceKind(r.device_name).app === "Cowork") cowork++;
    else cli++;
  }
  return { active: cli + cowork, cli, cowork };
}

async function userStats(from: number, end: number, events: OpsEvent[]) {
  const client = sb();
  const [newCount, total, paying, fresh] = await Promise.all([
    countRows(() => client.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", iso(from)).lt("created_at", iso(end))),
    countRows(() => client.from("profiles").select("id", { count: "exact", head: true })),
    countRows(() =>
      client
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .neq("plan", "free")
        .or(`plan_expires_at.is.null,plan_expires_at.gt.${iso(end)}`),
    ),
    // Ro'yxat: lenta hodisalari (usul bilan) bo'lmasa — profiles'dan (usul noma'lum).
    (async () => {
      const ev = events.filter((e) => e.type === "signup" && e.t >= from && e.t < end);
      if (ev.length) {
        return ev.slice(0, 20).map((e) => ({ email: String(e.d.email ?? "***"), country: countryCode(e.d.country), method: String(e.d.method ?? "—") }));
      }
      const { data } = await client
        .from("profiles")
        .select("email,onboarding")
        .gte("created_at", iso(from))
        .lt("created_at", iso(end))
        .order("created_at", { ascending: false })
        .limit(20);
      return ((data ?? []) as { email: string | null; onboarding: Record<string, unknown> | null }[]).map((r) => ({
        email: maskEmail(r.email),
        country: countryCode(r.onboarding?.country),
        method: "—",
      }));
    })(),
  ]);
  return { newCount, total, paying, newList: fresh };
}

export async function gatherDigest(kind: DigestKind, end: number): Promise<DigestData> {
  const windowMs = DIGEST_WINDOW_MS[kind];
  const from = end - windowMs;
  const store = opsStore();
  const utcDays = kind === "weekly" ? 7 : 1;

  const hours: string[] = [];
  for (let t = Math.floor(from / HOUR) * HOUR; t < end; t += HOUR) hours.push(hourKey(utcHourKey(t)));
  const baseDays = [1, 2, 3, 4, 5, 6, 7].map((i) => dayKey(utcDayKey(end - i * DAY)));

  const econ = kind === "hourly" ? null : await import("@/lib/econ/unit-economics.server");
  const budget = kind === "hourly" ? null : await import("@/lib/econ/budget.server");

  const events = await settle("events", () => store.recent(2000));
  const [hourHashes, dayHashes, users, usage, spendWin, spendPrev, inquiry, media, revenue, state, balance, devices, last3d] =
    await Promise.all([
      settle("hour counters", () => store.hgetall(hours)),
      settle("day counters", () => store.hgetall(baseDays)),
      settle("users", () => userStats(from, end, events ?? [])),
      settle("usage_daily", () => usageStats(end, utcDays)),
      econ ? settle("econ", () => econ.getUnitEconomicsBetween(utcDate(end - (utcDays - 1) * DAY), utcDate(end), { plans: false })) : null,
      econ ? settle("econ7", () => econ.getUnitEconomicsBetween(utcDate(end - 7 * DAY), utcDate(end - DAY), { plans: false })) : null,
      kind === "hourly" ? null : settle("inquiry", () => inquiryStats(from, end)),
      kind === "hourly" ? null : settle("media", () => mediaStats(end, utcDays)),
      settle("revenue", () => revenueStats(from, end)),
      budget ? settle("budget", () => budget.budgetGuard().state({ wait: true })) : null,
      kind === "hourly" ? null : settle("openrouter", () => fetchOpenRouterBalance(fetch)),
      settle("devices", () => activeDevices(from)),
      kind === "hourly" ? null : settle("signups3d", () => countRows(() => sb().from("profiles").select("id", { count: "exact", head: true }).gte("created_at", iso(end - 3 * DAY)))),
    ]);

  const counters = sumCounters(hourHashes ?? []);
  const base = dayHashes && dayHashes.some((h) => Object.keys(h).length) ? sumCounters(dayHashes) : null;
  const factor = windowMs / DAY / 7; // 7 kunlik yig'indi → shu oyna uzunligidagi o'rtacha
  const foTotal = (c: Record<string, number>) => failoverRoutes(c).reduce((s, r) => s + r.n, 0);
  const exTotal = (c: Record<string, number>) => Object.values(exhaustedByReason(c)).reduce((s, n) => s + n, 0);

  const evs = events ?? [];
  const inWin = evs.filter((e) => e.t >= from && e.t < end);
  const eventCounts: Partial<Record<OpsEventType, number>> = {};
  for (const e of inWin) if (e.type !== "failover") eventCounts[e.type] = (eventCounts[e.type] ?? 0) + 1;

  const msgWeb = counters["msg:web"] ?? 0;
  const msgCli = counters["msg:cli"] ?? 0;
  const tokWeb = counters["tok:web"] ?? 0;
  const tokCli = counters["tok:cli"] ?? 0;
  const cfg = budgetConfig();

  return {
    kind,
    now: end,
    utcDays,
    users: users
      ? { ...users, dau: usage?.dau ?? null, wau: usage?.wau ?? null, mau: usage?.mau ?? null }
      : null,
    activity: {
      messages: msgWeb + msgCli > 0 ? msgWeb + msgCli : kind === "hourly" ? 0 : (usage?.messages ?? null),
      msgWeb,
      msgCli,
      tokens: tokWeb + tokCli > 0 ? tokWeb + tokCli : spendWin ? spendWin.totals.tokensIn + spendWin.totals.tokensOut : null,
      tokWeb,
      tokCli,
    },
    models: (spendWin?.byModel ?? []).map((b) => ({ key: b.key, answers: b.answers })).sort((a, b) => b.answers - a.answers),
    providers: (spendWin?.byProvider ?? []).map((b) => ({ key: b.key, answers: b.answers })).sort((a, b) => b.answers - a.answers),
    failovers: failoverRoutes(counters),
    failoverBaseline: base ? foTotal(base) * factor : null,
    exhausted: exhaustedByReason(counters),
    exhaustedBaseline: base ? exTotal(base) * factor : null,
    breakers: breakerDowntime(evs.filter((e) => e.t >= from - DAY), from, end),
    judge:
      kind === "hourly"
        ? null
        : { clean: counters["judge:clean"] ?? 0, issues: counters["judge:issues"] ?? 0, none: counters["judge:none"] ?? 0 },
    inquiry: inquiry ?? null,
    media: media ?? null,
    revenue: revenue ?? null,
    budget: state
      ? { revenueMonthUsd: state.revenueUsd, spendMonthUsd: state.spendUsd, ratio: state.ratio, cap: state.cfg.capRatio, restricted: state.paidRestricted }
      : null,
    spendWindowUsd: spendWin ? spendWin.priced.costUsd : null,
    spendAvg7Usd: spendPrev ? spendPrev.priced.costUsd / 7 : null,
    openrouter: balance ? { balance: balance.balanceUsd, min: cfg.openrouterAlertUsd } : null,
    releases: inWin.filter((e) => e.type === "release").map((e) => String(e.d.name ?? e.d.tag ?? "—")),
    deploys: inWin.filter((e) => e.type === "deploy").map((e) => ({ subject: String(e.d.subject ?? ""), sha: String(e.d.sha ?? "") })),
    devices: devices
      ? { ...devices, logins: eventCounts.device_login ?? 0, revokes: eventCounts.device_revoke ?? 0 }
      : null,
    signupsLast3d: last3d ?? null,
    eventCounts,
  };
}

export function opsDigestDeps(): DigestDeps {
  return {
    cronSecret: process.env.CRON_SECRET,
    now: () => Date.now(),
    lang: opsLang(),
    store: opsStore(),
    telegram: telegramConfig() !== null,
    gather: gatherDigest,
    send: sendHtml,
  };
}

/* ------------------------------------------------------------------ */
/* Bot buyruqlari                                                       */
/* ------------------------------------------------------------------ */

/** Hozirgi breaker holati (provayder va hovuz kalitlari) — /providers uchun. */
async function breakerStates(lang: Lang): Promise<string[]> {
  const health = await import("@/lib/ai/mesh/health");
  const snap = await health.snapshot();
  const now = Date.now();
  const lines: string[] = [];
  for (const [key, h] of snap) {
    const p = health.parseHealthKey(key);
    if (!p || (p.wire && p.wire !== "$paid" && p.wire !== "$free")) continue;
    const st = health.effectiveState(h, now);
    const scope = p.wire === "$paid" ? tt(lang, "p22oScopePaid") : p.wire === "$free" ? tt(lang, "p22oScopeFree") : "";
    if (st === "open") {
      lines.push(
        tt(lang, "p22oStateOpen", { provider: providerLabel(p.provider), scope: "\u0000", reason: h.lastError ?? "other", until: h.until ? tashkentTime(h.until) : "—" }).replace(
          "\u0000",
          scope,
        ),
      );
    } else if (st === "half_open") {
      lines.push(tt(lang, "p22oStateHalf", { provider: providerLabel(p.provider), scope: "\u0000" }).replace("\u0000", scope));
    }
  }
  return lines.length ? lines : [tt(lang, "p22oStateAllClosed")];
}

export async function runBotCommand(cmd: BotCommand): Promise<string | null> {
  const lang = opsLang();
  if (cmd === "help") return tt(lang, "p22oBotHelp");
  const now = Date.now();
  if (cmd === "today") return composeDigest(await gatherDigest("daily", now), lang);
  if (cmd === "week") return composeDigest(await gatherDigest("weekly", now), lang);
  const data = await gatherDigest("daily", now);
  if (cmd === "users") return [bold(tt(lang, "p22oBotUsersTitle")), ...usersSection(data, lang, 20).slice(1)].join("\n");
  const states = await breakerStates(lang).catch(() => [] as string[]);
  return [bold(tt(lang, "p22oBotProvidersTitle")), bold(tt(lang, "p22oStatesTitle")), ...states, "", ...providersSection(data, lang, { exhausted: true })].join("\n");
}

export function opsBotDeps(): BotDeps {
  return {
    secret: process.env.TELEGRAM_WEBHOOK_SECRET,
    chatId: telegramConfig()?.chatId,
    store: opsStore(),
    defer: (fn) => {
      try {
        after(fn);
      } catch {
        void fn();
      }
    },
    run: runBotCommand,
    send: sendHtml,
  };
}

/* ------------------------------------------------------------------ */
/* Admin kartasi                                                        */
/* ------------------------------------------------------------------ */

/** Oxirgi `limit` ta hodisa (CHAQIRUVCHI admin ekanini tekshiradi). Faqat niqoblangan maydonlar. Hech qachon otmaydi. */
export async function getOpsFeed(limit = 50): Promise<OpsEvent[]> {
  try {
    return await opsStore().recent(Math.min(Math.max(limit, 1), 200));
  } catch {
    return [];
  }
}
