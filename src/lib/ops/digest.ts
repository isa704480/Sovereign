/**
 * Ops hisobotlari (soatlik / kunlik / haftalik) — PURE kompozitsiya: DigestData → HTML matn.
 * Ma'lumot yig'ish — digest-data.server.ts; handler — digest-handler.ts. Test: ops.test.ts.
 * Matnda faqat yig'ma raqamlar, niqoblangan email, id'lar (maxfiylik qoidasi format.ts'da).
 */
import { translate, type Lang } from "@/lib/i18n";
import {
  bold,
  compact,
  countryCode,
  duration,
  escapeHtml,
  money,
  pct,
  providerLabel,
  safeModel,
  tashkentDate,
  tashkentTime,
  tt,
} from "./format";
import { parseFailoverField } from "./recorder";
import type { OpsEvent, OpsEventType } from "./store";

export type DigestKind = "hourly" | "daily" | "weekly";

export const DIGEST_WINDOW_MS: Record<DigestKind, number> = {
  hourly: 3_600_000,
  daily: 24 * 3_600_000,
  weekly: 7 * 24 * 3_600_000,
};

export interface FailoverRoute {
  from: string;
  reason: string;
  to: string;
  model: string;
  n: number;
}

export interface BreakerDowntime {
  provider: string;
  scope: string;
  downMs: number;
  trips: number;
}

export interface DigestData {
  kind: DigestKind;
  now: number;
  /** Bazadagi kunlik (UTC) jadvallar nechta kunni qamradi. */
  utcDays: number;
  users: {
    newCount: number;
    newList: { email: string; country: string; method: string }[];
    dau: number | null;
    wau: number | null;
    mau: number | null;
    total: number | null;
    paying: number | null;
  } | null;
  activity: { messages: number | null; msgWeb: number; msgCli: number; tokens: number | null; tokWeb: number; tokCli: number } | null;
  models: { key: string; answers: number }[];
  providers: { key: string; answers: number }[];
  failovers: FailoverRoute[];
  /** O'xshash oyna uchun odatdagi failover soni (anomaliya). */
  failoverBaseline: number | null;
  /** Javobsiz qolgan so'rovlar: sinf → soni. */
  exhausted: Record<string, number>;
  exhaustedBaseline: number | null;
  breakers: BreakerDowntime[];
  judge: { clean: number; issues: number; none: number } | null;
  inquiry: { total: number; ask: number; skip: number } | null;
  media: { image: number; video: number; transcribe: number } | null;
  revenue: { usd: number; rub: number; count: number } | null;
  budget: { revenueMonthUsd: number; spendMonthUsd: number; ratio: number | null; cap: number; restricted: boolean } | null;
  spendWindowUsd: number | null;
  spendAvg7Usd: number | null;
  openrouter: { balance: number | null; min: number } | null;
  releases: string[];
  deploys: { subject: string; sha: string }[];
  devices: { active: number; cli: number; cowork: number; logins: number; revokes: number } | null;
  signupsLast3d: number | null;
  /** Oynadagi hodisalar soni (turi bo'yicha) — soatlik "jim" qarori uchun. */
  eventCounts: Partial<Record<OpsEventType, number>>;
}

/* ------------------------------------------------------------------ */
/* Hisob-kitob yordamchilari                                             */
/* ------------------------------------------------------------------ */

/** Bir nechta hisoblagich HASH'ini qo'shish. */
export function sumCounters(hashes: Record<string, number>[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const h of hashes) for (const [k, v] of Object.entries(h)) out[k] = (out[k] ?? 0) + (Number(v) || 0);
  return out;
}

export function failoverRoutes(counters: Record<string, number>): FailoverRoute[] {
  const out: FailoverRoute[] = [];
  for (const [k, n] of Object.entries(counters)) {
    const p = parseFailoverField(k);
    if (p && n > 0) out.push({ ...p, n });
  }
  return out.sort((a, b) => b.n - a.n);
}

export function exhaustedByReason(counters: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, n] of Object.entries(counters)) {
    if (!k.startsWith("ex|") || !(n > 0)) continue;
    const reason = k.split("|")[1] || "other";
    out[reason] = (out[reason] ?? 0) + n;
  }
  return out;
}

const total = (r: Record<string, number>) => Object.values(r).reduce((s, n) => s + n, 0);

/**
 * Breaker hodisalaridan [from, to] oynasidagi ishlamay qolgan vaqt: open → (closed | until | to).
 * Oynadan oldin ochilgan va hali yopilmagan kalit ham hisoblanadi (oyna boshidan).
 */
export function breakerDowntime(events: OpsEvent[], from: number, to: number): BreakerDowntime[] {
  const groups = new Map<string, OpsEvent[]>();
  for (const e of events) {
    if (e.type !== "breaker" || e.t > to) continue;
    const k = `${e.d.provider}|${e.d.scope ?? ""}`;
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }
  const out: BreakerDowntime[] = [];
  for (const [k, evs] of groups) {
    const [provider, scope] = k.split("|");
    const sorted = evs.sort((a, b) => a.t - b.t);
    let openAt: number | null = null;
    let openUntil: number | null = null;
    let down = 0;
    let trips = 0;
    const close = (at: number) => {
      if (openAt === null) return;
      const end = Math.min(at, openUntil ?? at, to);
      const start = Math.max(openAt, from);
      if (end > start) down += end - start;
      openAt = null;
      openUntil = null;
    };
    for (const e of sorted) {
      if (e.d.to === "open") {
        if (openAt === null) {
          openAt = e.t;
          if (e.t >= from) trips++;
        }
        const u = typeof e.d.until === "number" ? e.d.until : null;
        // Qayta ochilish muddatni uzaytiradi; until noma'lum — keyingi yopilishgacha.
        openUntil = u === null ? null : Math.max(openUntil ?? 0, u);
      } else if (e.d.to === "closed") {
        close(e.t);
      }
      // half_open — sinov; muddat tugagan, lekin yopilish muvaffaqiyatda aniqlanadi.
    }
    close(to);
    if (down > 0 || trips > 0) out.push({ provider, scope, downMs: down, trips });
  }
  return out.sort((a, b) => b.downMs - a.downMs);
}

/** Soatlik hisobot "jim" bo'ladimi: hech qanday hodisa (xabar faolligi hisoblanmaydi). */
export function isQuiet(d: DigestData): boolean {
  const ev = Object.values(d.eventCounts).reduce((s, n) => s + (n ?? 0), 0);
  const fo = d.failovers.reduce((s, f) => s + f.n, 0);
  return ev === 0 && (d.users?.newCount ?? 0) === 0 && fo === 0 && total(d.exhausted) === 0 && !d.revenue?.count;
}

/* ------------------------------------------------------------------ */
/* Anomaliyalar ("Diqqat")                                               */
/* ------------------------------------------------------------------ */

export function detectAnomalies(d: DigestData, lang: Lang): string[] {
  const out: string[] = [];
  if (d.spendWindowUsd != null && d.spendAvg7Usd != null && d.kind !== "hourly") {
    const avg = d.kind === "weekly" ? d.spendAvg7Usd * 7 : d.spendAvg7Usd;
    if (d.spendWindowUsd > 1 && d.spendWindowUsd > 2 * Math.max(avg, 0.01)) {
      out.push(tt(lang, "p22oAnomSpend", { today: money(d.spendWindowUsd), avg: money(avg) }));
    }
  }
  const fo = d.failovers.reduce((s, f) => s + f.n, 0);
  if (d.failoverBaseline != null && fo >= 20 && fo > 3 * Math.max(d.failoverBaseline, 1)) {
    out.push(tt(lang, "p22oAnomFailover", { n: fo, avg: Math.round(d.failoverBaseline) }));
  }
  const ex = total(d.exhausted);
  if (d.exhaustedBaseline != null && ex >= 10 && ex > 3 * Math.max(d.exhaustedBaseline, 1)) {
    out.push(tt(lang, "p22oAnomErrors", { n: ex, avg: Math.round(d.exhaustedBaseline) }));
  }
  if (d.signupsLast3d === 0 && d.kind !== "hourly") out.push(tt(lang, "p22oAnomNoSignups"));
  for (const b of d.breakers) {
    if (b.downMs >= 30 * 60_000) out.push(tt(lang, "p22oAnomBreaker", { provider: providerLabel(b.provider) + scopeSuffix(b.scope, lang), dur: duration(b.downMs, lang) }));
  }
  if (d.budget?.restricted) out.push(tt(lang, "p22oAnomGuard"));
  if (d.openrouter && d.openrouter.balance != null && d.openrouter.balance < d.openrouter.min) {
    out.push(tt(lang, "p22oAnomBalance", { balance: money(d.openrouter.balance), min: money(d.openrouter.min) }));
  }
  return out;
}

const scopeSuffix = (scope: string, lang: Lang) =>
  scope === "$paid" ? translate(lang, "p22oScopePaid") : scope === "$free" ? translate(lang, "p22oScopeFree") : "";

/* ------------------------------------------------------------------ */
/* Bo'limlar                                                            */
/* ------------------------------------------------------------------ */

const n0 = (v: number | null | undefined) => (v == null ? "—" : compact(v));

function header(d: DigestData, lang: Lang): string {
  if (d.kind === "hourly") return bold(tt(lang, "p22oDigestHourly", { time: `${tashkentTime(d.now - 3_600_000)}–${tashkentTime(d.now)}` }));
  if (d.kind === "daily") return bold(tt(lang, "p22oDigestDaily", { date: tashkentDate(d.now), time: tashkentTime(d.now) }));
  return bold(tt(lang, "p22oDigestWeekly", { from: tashkentDate(d.now - DIGEST_WINDOW_MS.weekly), to: tashkentDate(d.now) }));
}

export function usersSection(d: DigestData, lang: Lang, listCap = 20): string[] {
  const u = d.users;
  if (!u) return [bold(tt(lang, "p22oSecUsers")), tt(lang, "p22oNoData")];
  const lines = [
    bold(tt(lang, "p22oSecUsers")),
    tt(lang, "p22oUsersLine", { n: u.newCount, dau: n0(u.dau), wau: n0(u.wau), mau: n0(u.mau) }),
    tt(lang, "p22oUsersTotal", { total: n0(u.total), paying: n0(u.paying) }),
  ];
  if (u.newList.length) {
    lines.push(tt(lang, "p22oUsersNewList"));
    for (const x of u.newList.slice(0, listCap)) lines.push(`• ${escapeHtml(`${x.email} · ${countryCode(x.country)} · ${x.method}`)}`);
    if (u.newCount > Math.min(listCap, u.newList.length)) lines.push(tt(lang, "p22oFeedMore", { n: u.newCount - Math.min(listCap, u.newList.length) }));
  }
  return lines;
}

function shareLines(rows: { key: string; answers: number }[], label: (k: string) => string, lang: Lang, cap = 5): string[] {
  const sum = rows.reduce((s, r) => s + r.answers, 0);
  return rows
    .filter((r) => r.answers > 0)
    .slice(0, cap)
    .map((r) => tt(lang, "p22oShareLine", { name: label(r.key), share: pct(r.answers, sum), n: compact(r.answers) }));
}

export function providersSection(d: DigestData, lang: Lang, opts: { exhausted?: boolean } = {}): string[] {
  const out: string[] = [];
  const prov = shareLines(d.providers, providerLabel, lang, 8);
  if (prov.length) out.push(bold(tt(lang, "p22oSecProviders")), ...prov);
  const fo = d.failovers.reduce((s, f) => s + f.n, 0);
  if (fo > 0) {
    out.push(bold(tt(lang, "p22oSecFailover", { n: fo })));
    // Provayder va sabab bo'yicha (qayerdan ketdi).
    const by = new Map<string, number>();
    for (const f of d.failovers) by.set(`${f.from}|${f.reason}`, (by.get(`${f.from}|${f.reason}`) ?? 0) + f.n);
    for (const [k, n] of [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)) {
      const [from, reason] = k.split("|");
      out.push(tt(lang, "p22oFailoverByLine", { from: providerLabel(from), reason, n }));
    }
    for (const f of d.failovers.slice(0, 3)) {
      out.push(
        `↳ ${tt(lang, "p22oFeedFailoverLine", { from: providerLabel(f.from), reason: f.reason, to: providerLabel(f.to), model: safeModel(f.model), n: f.n })}`,
      );
    }
  }
  const ex = total(d.exhausted);
  if (opts.exhausted && ex > 0) out.push(tt(lang, "p22oExhaustedLine", { n: ex }));
  if (d.breakers.length) {
    out.push(bold(tt(lang, "p22oSecBreaker")));
    for (const b of d.breakers.slice(0, 8)) {
      out.push(
        tt(lang, "p22oBreakerLine", {
          provider: providerLabel(b.provider),
          scope: b.scope === "$paid" ? translate(lang, "p22oScopePaid") : b.scope === "$free" ? translate(lang, "p22oScopeFree") : "",
          dur: duration(b.downMs, lang),
          n: b.trips,
        }),
      );
    }
  }
  return out;
}

function activitySection(d: DigestData, lang: Lang): string[] {
  const out: string[] = [bold(tt(lang, "p22oSecActivity"))];
  const a = d.activity;
  if (a) {
    out.push(tt(lang, "p22oActivityMessages", { n: n0(a.messages ?? a.msgWeb + a.msgCli), web: compact(a.msgWeb), cli: compact(a.msgCli) }));
    out.push(tt(lang, "p22oActivityTokens", { n: n0(a.tokens ?? a.tokWeb + a.tokCli), web: compact(a.tokWeb), cli: compact(a.tokCli) }));
  } else out.push(tt(lang, "p22oNoData"));
  return out;
}

function qualitySection(d: DigestData, lang: Lang): string[] {
  const out: string[] = [];
  if (d.judge && d.judge.clean + d.judge.issues + d.judge.none > 0) out.push(tt(lang, "p22oJudgeLine", d.judge));
  if (d.inquiry && d.inquiry.total > 0) {
    out.push(tt(lang, "p22oInquiryLine", { n: d.inquiry.total, ask: pct(d.inquiry.ask, d.inquiry.total), skip: pct(d.inquiry.skip, d.inquiry.total) }));
  }
  if (d.media && d.media.image + d.media.video + d.media.transcribe > 0) out.push(tt(lang, "p22oMediaLine", d.media));
  const ex = total(d.exhausted);
  if (ex > 0) {
    const detail = Object.entries(d.exhausted)
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `${k} ${n}`)
      .join(", ");
    out.push(tt(lang, "p22oErrorsLine", { n: ex, detail: ` (${detail})` }));
  }
  return out.length ? [bold(tt(lang, "p22oSecQuality")), ...out] : [];
}

function moneySection(d: DigestData, lang: Lang): string[] {
  const out: string[] = [bold(tt(lang, "p22oSecMoney"))];
  if (d.revenue) {
    const parts = [d.revenue.usd ? money(d.revenue.usd, "USD") : "", d.revenue.rub ? money(d.revenue.rub, "RUB") : ""].filter(Boolean);
    out.push(tt(lang, "p22oRevenueLine", { amount: parts.join(" + ") || "$0.00", n: d.revenue.count }));
  }
  if (d.budget) out.push(tt(lang, "p22oRevenueMonthLine", { amount: money(d.budget.revenueMonthUsd) }));
  if (d.budget || d.spendWindowUsd != null) {
    out.push(
      tt(lang, "p22oSpendLine", {
        window: tt(lang, d.kind === "weekly" ? "p22oWindowWeek" : "p22oWindowToday"),
        spend: money(d.spendWindowUsd),
        month: money(d.budget?.spendMonthUsd),
        ratio: d.budget?.ratio == null ? "—" : `${(d.budget.ratio * 100).toFixed(1)}%`,
        cap: d.budget ? `${(d.budget.cap * 100).toFixed(0)}%` : "—",
      }),
    );
  }
  if (d.openrouter) out.push(tt(lang, "p22oBalanceLine", { balance: money(d.openrouter.balance) }));
  if (d.budget?.restricted) out.push(tt(lang, "p22oGuardOnLine"));
  return out.length > 1 ? out : [...out, tt(lang, "p22oNoData")];
}

function releasesSection(d: DigestData, lang: Lang): string[] {
  if (!d.releases.length && !d.deploys.length) return [];
  const out = [bold(tt(lang, "p22oSecReleases"))];
  for (const r of d.releases.slice(0, 10)) out.push(tt(lang, "p22oReleaseLine", { name: r }));
  for (const c of d.deploys.slice(0, 10)) out.push(tt(lang, "p22oDeployLine", { subject: c.subject, sha: c.sha }));
  if (d.deploys.length > 10) out.push(tt(lang, "p22oFeedMore", { n: d.deploys.length - 10 }));
  return out;
}

function devicesSection(d: DigestData, lang: Lang): string[] {
  if (!d.devices) return [];
  return [bold(tt(lang, "p22oSecDevices")), tt(lang, "p22oDevicesLine", d.devices)];
}

/** To'liq hisobot matni (HTML). Soatlik — ixcham (modellar/pul/sifat yo'q). */
export function composeDigest(d: DigestData, lang: Lang): string {
  const sections: string[][] = [];
  sections.push([header(d, lang), tt(lang, "p22oDigestWindow", { h: Math.round(DIGEST_WINDOW_MS[d.kind] / 3_600_000), days: d.utcDays })]);
  const anomalies = detectAnomalies(d, lang);
  // "Diqqat" — eng yuqorida (founder birinchi ko'radi).
  sections.push([bold(tt(lang, "p22oSecAttention")), ...(anomalies.length ? anomalies.map((a) => `• ${a}`) : [tt(lang, "p22oAnomNone")])]);
  sections.push(usersSection(d, lang, d.kind === "hourly" ? 10 : 20));
  sections.push(activitySection(d, lang));
  if (d.kind !== "hourly") {
    const models = shareLines(d.models, (k) => safeModel(k), lang, 6);
    if (models.length) sections.push([bold(tt(lang, "p22oSecModels")), ...models]);
  }
  const prov = providersSection(d, lang);
  if (prov.length) sections.push(prov);
  if (d.kind !== "hourly") {
    const q = qualitySection(d, lang);
    if (q.length) sections.push(q);
  }
  if (d.kind !== "hourly" || d.revenue?.count) sections.push(moneySection(d, lang));
  const rel = releasesSection(d, lang);
  if (rel.length) sections.push(rel);
  const dev = devicesSection(d, lang);
  if (dev.length) sections.push(dev);
  return sections.map((s) => s.join("\n")).join("\n\n");
}
