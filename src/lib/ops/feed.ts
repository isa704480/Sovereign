/**
 * GET /api/cron/ops-events mantiqi — tezkor lenta (har 5 daqiqa, GitHub Actions). Bog'liqliklar
 * tashqaridan (testda soxta): manbalar (Supabase / GitHub), ombor (Upstash), yuboruvchi (Telegram).
 *
 *   Himoya: Authorization: Bearer $CRON_SECRET (timing-safe, bearerMatches)
 *   ?dry=1 — matnni qaytaradi, YUBORMAYDI, dedupe/cursor/hodisalar ro'yxatiga YOZMAYDI.
 *
 * Oqim: cursor (oxirgi ishga tushish) − 10 daqiqa ustma-ustlik → manbalardan yangi hodisalar →
 * har biri barqaror id bilan dedupe (SET NX, 8 kun) → bloklar → xabarlarga joylash (≤4096) →
 * rate limit (standart 20 xabar / 10 daqiqa; oshsa bitta qisqa xulosa, qolganlari hisobotlarda) →
 * yuborilmasa dedupe bo'shatiladi (keyingi cron qayta urinadi) → cursor yangilanadi.
 */
import { bearerMatches } from "@/lib/email/token";
import { translate, type Lang } from "@/lib/i18n";
import { eventLine, TYPE_LABEL } from "./describe";
import {
  bold,
  countryCode,
  deviceKind,
  escapeHtml,
  maskEmail,
  packBlocks,
  providerLabel,
  safeId,
  safeModel,
  safePurposes,
  tashkentTime,
  tt,
} from "./format";
import { parseFailoverField } from "./recorder";
import { FO_BUCKET_MS, SENT_TTL_MS, foBucketKey, type OpsEvent, type OpsEventType, type OpsStore } from "./store";

/* ------------------------------------------------------------------ */
/* Manba qatorlari (server qatlami beradi; niqoblash shu faylda)         */
/* ------------------------------------------------------------------ */

export interface SignupRow {
  id: string;
  email: string | null;
  createdAt: number;
  country?: unknown;
  purposes?: unknown;
  /** Supabase auth provayderi: email | google | ... */
  method?: string | null;
}

export interface PaymentRow {
  id: string;
  email: string | null;
  plan: string;
  period: string | null;
  amount: number;
  currency: string;
  provider: string;
  paidAt: number;
}

export interface DeviceRow {
  /** Barqaror, MAXFIY BO'LMAGAN id (device kodining hash'i — kodning o'zi emas). */
  key: string;
  device: string | null;
  email: string | null;
  country: string | null;
  at: number;
}

export interface ReleaseRow {
  tag: string;
  name: string | null;
  publishedAt: number;
  url?: string | null;
}

export interface CommitRow {
  sha: string;
  subject: string;
  at: number;
}

export interface FeedLimits {
  /** Oynadagi maksimal xabar soni (standart 20). */
  perWindow: number;
  /** Oyna (standart 10 daqiqa). */
  windowMs: number;
  /** 5 daqiqalik yo'nalish (from→to) shundan kam bo'lsa lentaga chiqmaydi (hisobotda bor). */
  failoverMin: number;
}

export const DEFAULT_LIMITS: FeedLimits = { perWindow: 20, windowMs: 10 * 60_000, failoverMin: 3 };
export const FEED_CURSOR_KEY = "ops:cursor:feed";
const OVERLAP_MS = 10 * 60_000;
const FIRST_RUN_LOOKBACK_MS = 15 * 60_000;
const SIGNUP_CAP = 20;
const DEPLOY_CAP = 10;
const DEVICE_CAP = 15;

export interface FeedDeps {
  cronSecret: string | undefined;
  now(): number;
  lang: Lang;
  store: OpsStore;
  /** Telegram sozlanganmi. */
  telegram: boolean;
  /** HTML matnni yuboradi (bo'lish — yuboruvchida). */
  send(html: string): Promise<boolean>;
  signups(since: number): Promise<SignupRow[]>;
  payments(since: number): Promise<PaymentRow[]>;
  devices(since: number): Promise<{ logins: DeviceRow[]; revokes: DeviceRow[] }>;
  releases(since: number): Promise<ReleaseRow[]>;
  commits(since: number): Promise<CommitRow[]>;
  limits?: Partial<FeedLimits>;
  log?(m: string): void;
}

/* ------------------------------------------------------------------ */
/* Birliklar va bloklar                                                  */
/* ------------------------------------------------------------------ */

/** Dedupe birligi: bitta id; `event` — muvaffaqiyatdan keyin hodisalar ro'yxatiga qo'shiladi (so'rov manbalari). */
interface Unit {
  id: string;
  type: OpsEventType;
  event?: OpsEvent;
  /** Breaker lenta holati (flapping himoyasi) — muvaffaqiyatdan keyin yoziladi. */
  marker?: BreakerMarker;
}

/** openAt null — tiklandi (marker o'chiriladi). */
interface BreakerMarker {
  key: string;
  openAt: number | null;
  until: number;
  /** Hodisa vaqti (yozish tartibi). */
  t: number;
}

/** Bir yoki bir nechta birlikdan iborat blok (bitta xabar ichida yaxlit). */
interface Block {
  prio: number;
  units: Unit[];
  /** Da'vo qilingan birliklardan matn (HTML, escape qilingan). null — ko'rsatilmaydi (jim da'vo). */
  render(claimed: Unit[]): string | null;
}

const sentKey = (id: string) => `ops:sent:${id}`;

export function signupEvent(r: SignupRow): OpsEvent {
  const method = safeId(r.method ?? "email", 20);
  return {
    id: `signup:${r.id}`,
    t: r.createdAt,
    type: "signup",
    d: {
      email: maskEmail(r.email),
      country: countryCode(r.country),
      method: method === "—" ? "email" : method,
      purposes: safePurposes(r.purposes).join(", ") || null,
    },
  };
}

export function paymentEvent(r: PaymentRow, type: OpsEventType = "payment"): OpsEvent {
  return {
    id: `pay:${r.id}`,
    t: r.paidAt,
    type,
    d: {
      plan: safeId(r.plan, 12),
      period: r.period === "year" ? "year" : "month",
      amount: Number.isFinite(r.amount) ? Math.round(r.amount * 100) / 100 : null,
      currency: safeId(r.currency, 6).toUpperCase(),
      provider: safeId(r.provider, 16),
      email: maskEmail(r.email),
    },
  };
}

export function deviceEvent(r: DeviceRow, type: "device_login" | "device_revoke"): OpsEvent {
  const k = deviceKind(r.device);
  return {
    id: `dev:${safeId(r.key, 24)}:${type === "device_login" ? "login" : "revoke"}`,
    t: r.at,
    type,
    d: { app: k.app, os: k.os, country: countryCode(r.country), email: maskEmail(r.email) },
  };
}

/** GitHub teg → mahsulot nomi: desktop-v0.8.0 → "Cowork 0.8.0", cli-v0.12.1 → "CLI 0.12.1". */
export function releaseName(tag: string, name: string | null): string {
  const clean = (s: string) => s.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 80);
  const m = /^(desktop|cli)-v(\d[\w.-]*)$/i.exec(tag.trim());
  const product = m ? `${m[1].toLowerCase() === "desktop" ? "Cowork" : "CLI"} ${m[2]}` : clean(tag);
  const n = name ? clean(name.split("\n")[0]) : "";
  return n && n !== product && !n.includes(product) ? `${product} — ${n}` : n || product;
}

export function releaseEvent(r: ReleaseRow): OpsEvent {
  return { id: `release:${r.tag.slice(0, 80)}`, t: r.publishedAt, type: "release", d: { name: releaseName(r.tag, r.name), tag: r.tag.slice(0, 80) } };
}

export function commitEvent(r: CommitRow): OpsEvent {
  const subject = r.subject.split("\n")[0].replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 140);
  return { id: `deploy:${r.sha.slice(0, 40)}`, t: r.at, type: "deploy", d: { sha: r.sha.slice(0, 7), subject } };
}

/** Failover 5 daqiqalik chelaklari → yo'nalishlar bo'yicha yig'indi (kamayish tartibida). */
export function aggregateFailovers(buckets: Record<string, number>[]): { from: string; reason: string; to: string; model: string; n: number }[] {
  const m = new Map<string, number>();
  for (const b of buckets) for (const [f, n] of Object.entries(b)) if (f.startsWith("fo|") && n > 0) m.set(f, (m.get(f) ?? 0) + n);
  return [...m.entries()]
    .map(([f, n]) => ({ ...parseFailoverField(f)!, n }))
    .filter((x) => x.from)
    .sort((a, b) => b.n - a.n);
}

/* ------------------------------------------------------------------ */
/* Handler                                                              */
/* ------------------------------------------------------------------ */

export interface FeedResult {
  ok: true;
  dry: boolean;
  since: number;
  units: number;
  sent: number;
  deduped: number;
  failed: number;
  dropped: number;
  messages?: string[];
  telegram: boolean;
  store: string;
}

export async function handleOpsEvents(req: Request, deps: FeedDeps): Promise<Response> {
  if (!bearerMatches(req.headers.get("authorization"), deps.cronSecret)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const dry = new URL(req.url).searchParams.get("dry") === "1";
  const result = await runFeed(deps, { dry });
  return Response.json(result);
}

export async function runFeed(deps: FeedDeps, opts: { dry: boolean }): Promise<FeedResult> {
  const log = deps.log ?? ((m: string) => console.log(m));
  const lim: FeedLimits = { ...DEFAULT_LIMITS, ...(deps.limits ?? {}) };
  const { lang, store } = deps;
  const dry = opts.dry;
  const now = deps.now();

  const cursorRaw = await store.get(FEED_CURSOR_KEY).catch(() => null);
  const cursor = Number(cursorRaw);
  const since = Number.isFinite(cursor) && cursor > 0 ? Math.max(cursor - OVERLAP_MS, now - 24 * 3_600_000) : now - FIRST_RUN_LOOKBACK_MS;

  const safe = async <T>(name: string, p: () => Promise<T>, fb: T): Promise<T> => {
    try {
      return await p();
    } catch (e) {
      log(`[ops-events] ${name}: ${e instanceof Error ? e.message.slice(0, 200) : "error"}`);
      return fb;
    }
  };

  // Tugagan 5 daqiqalik failover chelaklari (joriy chelak hali to'lmoqda — keyingi cron).
  const lastComplete = Math.floor(now / FO_BUCKET_MS) * FO_BUCKET_MS - FO_BUCKET_MS;
  const bucketStarts: number[] = [];
  for (let b = Math.floor(since / FO_BUCKET_MS) * FO_BUCKET_MS; b <= lastComplete && bucketStarts.length < 300; b += FO_BUCKET_MS) bucketStarts.push(b);

  const [signups, payments, devices, releases, commits, recent, foBuckets] = await Promise.all([
    safe("signups", () => deps.signups(since), [] as SignupRow[]),
    safe("payments", () => deps.payments(since), [] as PaymentRow[]),
    safe("devices", () => deps.devices(since), { logins: [] as DeviceRow[], revokes: [] as DeviceRow[] }),
    safe("releases", () => deps.releases(since), [] as ReleaseRow[]),
    safe("commits", () => deps.commits(since), [] as CommitRow[]),
    safe("events", () => store.recent(500), [] as OpsEvent[]),
    safe("failovers", () => store.hgetall(bucketStarts.map(foBucketKey)), [] as Record<string, number>[]),
  ]);

  const blocks: Block[] = [];
  const single = (prio: number, u: Unit, line: (u: Unit) => string) =>
    blocks.push({ prio, units: [u], render: (c) => (c.length ? line(c[0]) : null) });

  // 1) Pul: to'lov (so'rov), obuna yangilanishi / refund / chargeback (webhook hodisalari).
  for (const p of payments) {
    const ev = paymentEvent(p);
    single(1, { id: ev.id, type: "payment", event: ev }, () => eventLine(ev, lang, true));
  }
  const hooked = recent.filter((e) => e.t > since && e.t <= now + 60_000);
  for (const ev of hooked) {
    if (ev.type === "renewal" || ev.type === "refund" || ev.type === "chargeback") {
      single(1, { id: ev.id, type: ev.type }, () => eventLine(ev, lang, true));
    }
  }

  // 2) Relizlar va deploy (commitlar).
  for (const r of releases) {
    const ev = releaseEvent(r);
    single(2, { id: ev.id, type: "release", event: ev }, () => eventLine(ev, lang, true));
  }
  if (commits.length) {
    const units = commits.map((c) => {
      // Vaqt — ko'rilgan payt (fast-forward commit sanasi eski bo'lishi mumkin; hisobot oynasiga tushsin).
      const ev = { ...commitEvent(c), t: now };
      return { id: ev.id, type: "deploy" as const, event: ev };
    });
    blocks.push({
      prio: 2,
      units,
      render: (c) => {
        if (!c.length) return null;
        const lines = c.slice(0, DEPLOY_CAP).map((u) => `• ${escapeHtml(String(u.event!.d.subject))} (${escapeHtml(String(u.event!.d.sha))})`);
        if (c.length > DEPLOY_CAP) lines.push(tt(lang, "p22oFeedMore", { n: c.length - DEPLOY_CAP }));
        return [bold(tt(lang, "p22oFeedDeployTitle", { n: c.length })), ...lines].join("\n");
      },
    });
  }

  // 3) Circuit breaker o'tishlari — provayder/hovuz bo'yicha bitta blok (vaqt tartibida).
  const breakerGroups = new Map<string, OpsEvent[]>();
  for (const ev of hooked) {
    if (ev.type !== "breaker") continue;
    const k = `${ev.d.provider}:${ev.d.scope ?? ""}`;
    breakerGroups.set(k, [...(breakerGroups.get(k) ?? []), ev]);
  }
  // Flapping himoyasi: o'lik provayder har cooldown'da open → half_open → open aylanadi. Lentaga faqat
  // birinchi "OCHIQ" va "YOPIQ" (tiklanish, ishlamay qolgan vaqt bilan) chiqadi; half_open va takroriy
  // open — jim (ro'yxatda qoladi: admin karta, hisobotdagi downtime). Holat: ops:brk:<kalit> = ochilgan vaqt,
  // TTL = until + 30 daqiqa (hovuz kalitlari "closed" yozmaydi — marker o'zi eskiradi).
  const brkMarkers = new Map<string, number | null>();
  await Promise.all(
    [...breakerGroups.keys()].map(async (k) => {
      const v = Number(await store.get(`ops:brk:${k}`).catch(() => null));
      brkMarkers.set(k, Number.isFinite(v) && v > 0 ? v : null);
    }),
  );
  for (const [k, evs] of breakerGroups) {
    const sorted = [...evs].sort((a, b) => a.t - b.t);
    let openAt = brkMarkers.get(k) ?? null;
    for (const e of sorted) {
      let show = false;
      let ev = e;
      let marker: BreakerMarker | undefined;
      if (e.d.to === "open") {
        const until = typeof e.d.until === "number" ? e.d.until : e.t + 30 * 60_000;
        if (openAt === null) {
          openAt = e.t;
          show = true;
        }
        marker = { key: k, openAt, until, t: e.t };
      } else if (e.d.to === "closed") {
        show = true;
        if (openAt !== null) ev = { ...e, d: { ...e.d, downMs: Math.max(0, e.t - openAt) } };
        openAt = null;
        marker = { key: k, openAt: null, until: 0, t: e.t };
      }
      const line = `${escapeHtml(tashkentTime(ev.t))} ${eventLine(ev, lang, true)}`;
      const unit: Unit = { id: e.id, type: "breaker", ...(marker ? { marker } : {}) };
      blocks.push({ prio: 3, units: [unit], render: (c) => (c.length && show ? line : null) });
    }
  }

  // 4) Failover — tugagan 5 daqiqalik chelaklar (bitta blok, kichik yo'nalishlar lentaga chiqmaydi).
  const foUnits: { unit: Unit; bucket: Record<string, number>; start: number }[] = [];
  bucketStarts.forEach((b, i) => {
    const bucket = foBuckets[i] ?? {};
    if (Object.keys(bucket).length) foUnits.push({ unit: { id: `fo:${b}`, type: "failover" }, bucket, start: b });
  });
  if (foUnits.length) {
    const byId = new Map(foUnits.map((x) => [x.unit.id, x]));
    blocks.push({
      prio: 4,
      units: foUnits.map((x) => x.unit),
      render: (c) => {
        const parts = c.map((u) => byId.get(u.id)!).filter(Boolean);
        const routes = aggregateFailovers(parts.map((p) => p.bucket)).filter((r) => r.n >= lim.failoverMin);
        if (!routes.length) return null;
        const from = Math.min(...parts.map((p) => p.start));
        const to = Math.max(...parts.map((p) => p.start)) + FO_BUCKET_MS;
        const title = bold(tt(lang, "p22oFeedFailoverTitle", { from: tashkentTime(from), to: tashkentTime(to) }));
        const lines = routes.slice(0, 10).map((r) =>
          tt(lang, "p22oFeedFailoverLine", {
            from: providerLabel(r.from),
            reason: r.reason,
            to: providerLabel(r.to),
            model: safeModel(r.model),
            n: r.n,
          }),
        );
        return [title, ...lines].join("\n");
      },
    });
  }

  // 5) Yangi foydalanuvchilar (ko'p bo'lsa — birinchi 20 ta + "va yana N").
  if (signups.length) {
    const units = signups.map((s) => {
      const ev = signupEvent(s);
      return { id: ev.id, type: "signup" as const, event: ev };
    });
    blocks.push({
      prio: 5,
      units,
      render: (c) => {
        if (!c.length) return null;
        const lines = c.slice(0, SIGNUP_CAP).map((u) => eventLine(u.event!, lang, true));
        if (c.length > SIGNUP_CAP) lines.push(tt(lang, "p22oFeedSignupMore", { n: c.length - SIGNUP_CAP }));
        return lines.join("\n");
      },
    });
  }

  // 6) CLI/Cowork qurilma kirishlari va bekor qilishlar.
  if (devices.logins.length) {
    const units = devices.logins.map((d) => {
      const ev = deviceEvent(d, "device_login");
      return { id: ev.id, type: "device_login" as const, event: ev };
    });
    blocks.push({
      prio: 6,
      units,
      render: (c) => {
        if (!c.length) return null;
        const lines = c.slice(0, DEVICE_CAP).map((u) => `• ${eventLine(u.event!, lang, true)}`);
        if (c.length > DEVICE_CAP) lines.push(tt(lang, "p22oFeedMore", { n: c.length - DEVICE_CAP }));
        return [bold(tt(lang, "p22oFeedDevicesTitle", { n: c.length })), ...lines].join("\n");
      },
    });
  }
  if (devices.revokes.length) {
    const units = devices.revokes.map((d) => {
      const ev = deviceEvent(d, "device_revoke");
      return { id: ev.id, type: "device_revoke" as const, event: ev };
    });
    blocks.push({
      prio: 6,
      units,
      render: (c) => {
        if (!c.length) return null;
        const list = c
          .slice(0, DEVICE_CAP)
          .map((u) => `${u.event!.d.app} · ${u.event!.d.os} · ${u.event!.d.email}`)
          .join("; ");
        return tt(lang, "p22oFeedRevokes", { n: c.length, list });
      },
    });
  }

  blocks.sort((a, b) => a.prio - b.prio);

  // Dedupe: har birlik — SET NX (dry: faqat tekshirish).
  let deduped = 0;
  const claimedBlocks: { text: string; units: Unit[] }[] = [];
  const silent: Unit[] = [];
  for (const b of blocks) {
    const claimed: Unit[] = [];
    for (const u of b.units) {
      let fresh: boolean;
      try {
        fresh = dry ? !(await store.exists(sentKey(u.id))) : await store.setNx(sentKey(u.id), SENT_TTL_MS);
      } catch {
        fresh = false; // ombor ishlamasa — takror yubormaslik afzal (hisobotlarda baribir bor)
      }
      if (fresh) claimed.push(u);
      else deduped++;
    }
    const text = b.render(claimed);
    if (text) claimedBlocks.push({ text, units: claimed });
    else silent.push(...claimed);
  }

  // Xabarlarga joylash (bloklar yaxlit) va rate limit.
  const messages = packBlocks(claimedBlocks.map((b) => b.text));
  let cursorIdx = 0;
  const msgUnits = messages.map((m) => {
    const us = claimedBlocks.slice(cursorIdx, cursorIdx + m.length).flatMap((b) => b.units);
    cursorIdx += m.length;
    return us;
  });

  const handled: Unit[] = [...silent];
  const overflow: Unit[] = [];
  const texts: string[] = [];
  let sent = 0;
  let failed = 0;
  const win = Math.floor(now / lim.windowMs) * lim.windowMs;
  const rlKey = `ops:rl:${win}`;
  const canSend = deps.telegram;

  for (let i = 0; i < messages.length; i++) {
    const text = messages[i].join("\n\n");
    const units = msgUnits[i];
    if (dry) {
      texts.push(text);
      continue;
    }
    if (!canSend) {
      // Telegram sozlanmagan — hodisalar baribir ro'yxatga yoziladi (admin kartasi, hisobotlar).
      handled.push(...units);
      continue;
    }
    let n = 0;
    try {
      n = await store.incr(rlKey, lim.windowMs + 60_000);
    } catch {
      n = 0;
    }
    if (n > lim.perWindow) {
      overflow.push(...units);
      continue;
    }
    const ok = await deps.send(text).catch(() => false);
    if (ok) {
      sent++;
      handled.push(...units);
    } else {
      failed += units.length;
      await Promise.all(units.map((u) => store.del(sentKey(u.id)).catch(() => undefined)));
    }
  }

  if (overflow.length && !dry) {
    handled.push(...overflow);
    let first = false;
    try {
      first = await store.setNx(`ops:rl:sum:${win}`, lim.windowMs + 60_000);
    } catch {
      first = false;
    }
    if (first) {
      const counts = new Map<OpsEventType, number>();
      for (const u of overflow) counts.set(u.type, (counts.get(u.type) ?? 0) + 1);
      const types = [...counts.entries()].map(([t, n]) => `${translate(lang, TYPE_LABEL[t])} ${n}`).join(", ");
      await deps.send(tt(lang, "p22oFeedOverflow", { n: overflow.length, types })).catch(() => false);
    }
  }

  if (!dry) {
    // So'rov manbalaridan kelgan hodisalar ro'yxatga (admin kartasi, hisobotlar). Webhook/mesh hodisalari
    // allaqachon ro'yxatda.
    for (const u of handled) if (u.event) await store.push(u.event).catch(() => undefined);
    // Breaker lenta holati (vaqt tartibida): ochilish — marker (until + 30 daq), tiklanish — o'chirish.
    const markers = handled.map((u) => u.marker).filter((m): m is BreakerMarker => !!m).sort((a, b) => a.t - b.t);
    for (const m of markers) {
      const key = `ops:brk:${m.key}`;
      if (m.openAt === null) await store.del(key).catch(() => undefined);
      else await store.set(key, String(m.openAt), Math.max(m.until - now, 0) + 30 * 60_000).catch(() => undefined);
    }
    // Lentaga chiqqan failover xulosasi ham ro'yxatga (hisobotlar esa hisoblagichlardan o'qiydi).
    const foHandled = handled.filter((u) => u.type === "failover");
    if (foHandled.length) {
      const parts = foUnits.filter((x) => foHandled.some((u) => u.id === x.unit.id));
      const top = aggregateFailovers(parts.map((p) => p.bucket))[0];
      if (top && top.n >= lim.failoverMin) {
        await store
          .push({ id: `fo-sum:${parts[0].start}`, t: now, type: "failover", d: { from: top.from, reason: top.reason, to: top.to, model: top.model, n: top.n } })
          .catch(() => undefined);
      }
    }
    await store.set(FEED_CURSOR_KEY, String(now), 30 * 86_400_000).catch(() => undefined);
  }

  const units = blocks.reduce((s, b) => s + b.units.length, 0);
  log(`[ops-events] since=${new Date(since).toISOString()} units=${units} sent=${sent} deduped=${deduped} failed=${failed} dropped=${overflow.length} dry=${dry}`);
  return {
    ok: true,
    dry,
    since,
    units,
    sent,
    deduped,
    failed,
    dropped: overflow.length,
    ...(dry ? { messages: texts } : {}),
    telegram: deps.telegram,
    store: store.kind,
  };
}
