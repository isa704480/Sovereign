import "server-only";
import { Redis } from "@upstash/redis";
import type { BreakerTransition } from "@/lib/ops/recorder";
import { keyFingerprint } from "./fingerprint";
import {
  MESH_TUNING,
  PROVIDER_IDS,
  type Attempt,
  type ClassifiedError,
  type ErrorKind,
  type HealthSnapshot,
  type HealthState,
  type ProviderAdapter,
  type ProviderId,
} from "./types";

/**
 * Provider Mesh — sog'liq holati (circuit breaker) va kunlik kvota hisobi. docs/MESH.md §6, §9.
 *
 * - `nextState` — PURE holat mashinasi (closed → open → half_open → closed), soat tashqaridan.
 * - Saqlash: Upstash Redis (rate-limit.ts dagi env: UPSTASH_REDIS_REST_URL + _TOKEN) — holat
 *   BARCHA instansiyalar uchun umumiy. Sozlanmagan / xato / 1 s dan sekin → instansiya ichidagi
 *   xotira (har yozuv xotiraga ham yoziladi, shuning uchun zaxira doim "iliq").
 * - Hech bir eksport qilingan async funksiya so'rov yo'liga xato OTMAYDI (eng yomoni — standart holat).
 * - Testda: `createHealthMesh({ store: memoryStore(clock), now: clock })` — tarmoqsiz, soat qo'lda.
 *
 * Kalitlar (§9):
 *   mesh:health:<provider>[:<wire>]            HealthState JSON, TTL max(until − now + 1h, 24h)
 *   mesh:usage:<provider>[:<wire>]:<YYYYMMDD>  integer (UTC kun), TTL 48 h
 *   mesh:probe:<provider>[:<wire>]             half_open sinov lock'i, PX 15 s
 *   mesh:health:<provider>:$paid | :$free      hisob "hovuzi": pullik kredit / tekin kvota (ClassifiedError.pool)
 *   mesh:index                                 SET "<provider>:<wire>" — model-scope kalitlar ro'yxati.
 *                                              FAQAT statik offers'dagi wire'lar (Attempt.ephemeral=false);
 *                                              dinamik (resolve) wire'lar — faqat instansiya xotirasida.
 *                                              maxIndexSize bilan cheklangan, muddati o'tganlari tozalanadi.
 */

/* ------------------------------------------------------------------ */
/* Kalitlar                                                            */
/* ------------------------------------------------------------------ */

const HEALTH_PREFIX = "mesh:health:";
const USAGE_PREFIX = "mesh:usage:";
const PROBE_PREFIX = "mesh:probe:";
const INDEX_KEY = "mesh:index";

const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;
/** Health yozuvining minimal TTL (§9). */
const HEALTH_MIN_TTL_MS = DAY;
/** Usage hisoblagichi TTL (§6, §9). */
const USAGE_TTL_MS = 2 * DAY;
/** mesh:index TTL — har model-scope yozuvida yangilanadi. */
const INDEX_TTL_MS = 7 * DAY;
/** Redis yiqilgach shuncha vaqt faqat xotira ishlatiladi (har so'rovga 1 s taymaut qo'shilmasin). */
const REDIS_BACKOFF_MS = 30_000;

/** "mesh:health:groq" | "mesh:health:groq:openai/gpt-oss-120b" */
export function healthKey(provider: ProviderId, wire?: string): string {
  return wire ? `${HEALTH_PREFIX}${provider}:${wire}` : `${HEALTH_PREFIX}${provider}`;
}

/** UTC kun: "20260927". Kvota (Cloudflare) 00:00 UTC da tiklanadi — kalit ham shu kun bilan almashadi. */
export function utcDay(now: number): string {
  const d = new Date(now);
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${d.getUTCFullYear()}${mm}${dd}`;
}

/** "mesh:usage:<provider>[:<wire>]:<YYYYMMDD>" */
export function usageKey(provider: ProviderId, wire: string | undefined, now: number): string {
  return `${USAGE_PREFIX}${provider}${wire ? `:${wire}` : ""}:${utcDay(now)}`;
}

/** Health kalitidan probe kaliti: mesh:health:groq:x → mesh:probe:groq:x. */
export function probeKey(key: string): string {
  return PROBE_PREFIX + (key.startsWith(HEALTH_PREFIX) ? key.slice(HEALTH_PREFIX.length) : key);
}

/** Hisob hovuzi wire'lari (ClassifiedError.pool → "$paid" / "$free"). */
export const POOL_WIRES = ["$free", "$paid"] as const;

export function poolWire(pool: "free" | "paid"): string {
  return pool === "free" ? "$free" : "$paid";
}

/** Health kalitini ajratish (provider id'larida ":" yo'q; wire'da bo'lishi mumkin — "…:free"). */
export function parseHealthKey(key: string): { provider: ProviderId; wire?: string } | null {
  if (!key.startsWith(HEALTH_PREFIX)) return null;
  const rest = key.slice(HEALTH_PREFIX.length);
  const i = rest.indexOf(":");
  const provider = (i < 0 ? rest : rest.slice(0, i)) as ProviderId;
  if (!(PROVIDER_IDS as readonly string[]).includes(provider)) return null;
  return i < 0 ? { provider } : { provider, wire: rest.slice(i + 1) };
}

/* ------------------------------------------------------------------ */
/* PURE holat mashinasi (§6)                                           */
/* ------------------------------------------------------------------ */

export function defaultHealth(): HealthState {
  return { state: "closed", fails: 0, successEwma: 1, latencyEwmaMs: MESH_TUNING.defaultLatencyMs, trips: 0 };
}

export type HealthEvent = { ok: true; ttfbMs: number } | { ok: false; error: ClassifiedError };

/** So'rovning o'z aybi yoki imkoniyat mos kelmasligi — sog'liqqa ta'sir qilmaydi. */
const REQUEST_FAULT: ReadonlySet<ErrorKind> = new Set<ErrorKind>(["bad_request", "context_length", "unsupported"]);

/** open + until o'tgan → half_open (bitta probe'ga ruxsat). */
export function effectiveState(h: HealthState, now: number): HealthState["state"] {
  if (h.state === "open" && (h.until === undefined || now >= h.until)) return "half_open";
  return h.state;
}

/** Tanlash mumkinmi: closed yoki half_open (half_open'da scheduler skorni ×0.5 qiladi). */
export function isAvailableState(h: HealthState | undefined, now: number): boolean {
  return !h || effectiveState(h, now) !== "open";
}

/** Breaker cooldown: 30 s · 2^(trips−1), maksimal 5 daqiqa. */
export function breakerCooldownMs(trips: number): number {
  const t = Math.max(1, trips);
  return Math.min(MESH_TUNING.baseCooldownMs * 2 ** (t - 1), MESH_TUNING.maxCooldownMs);
}

function ewma(prev: number, sample: number): number {
  const a = MESH_TUNING.ewmaAlpha;
  return (1 - a) * prev + a * sample;
}

/** Xato turi bo'yicha "qachongacha yopiq" (transient bundan mustasno — u breaker bilan). */
function kindUntil(err: ClassifiedError, now: number): number | undefined {
  switch (err.kind) {
    case "rate_limited":
      return now + positive(err.retryAfterMs, MESH_TUNING.defaultRetryAfterMs);
    case "quota_exhausted":
    case "no_credit":
      // resetAt o'tmishda bo'lsa (soat farqi) — baribir kamida retryAfter yoki 1 soat.
      return err.resetAt && err.resetAt > now ? err.resetAt : now + positive(err.retryAfterMs, MESH_TUNING.quotaCooldownMs);
    case "unavailable":
      return now + MESH_TUNING.unavailableCooldownMs;
    default:
      return undefined;
  }
}

/** auth cooldown: 5 daqiqa · 3^(strikes−1), maksimal 1 soat. */
export function authCooldownMs(strikes: number): number {
  const n = Math.max(1, strikes);
  return Math.min(MESH_TUNING.authCooldownMs * 3 ** (n - 1), MESH_TUNING.authMaxCooldownMs);
}

function positive(v: number | undefined, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : fallback;
}

/**
 * PURE o'tish (§6 jadvali). `usedToday` bu yerda o'zgarmaydi (u alohida hisoblagichda).
 *  - muvaffaqiyat → closed, fails=0, trips=0, EWMA yangilanadi;
 *  - transient → fails++; closed'da fails ≥ 3 → open (trips++, cooldown);
 *  - rate_limited / quota_exhausted / no_credit / unavailable → darhol open (until xato turidan);
 *  - auth → open, cooldown authCooldownMs(authStrikes) (5 daqiqa → 1 soat), muvaffaqiyatda strikes=0;
 *  - half_open'da istalgan (hisoblanadigan) xato → open, trips++, cooldown kamida breakerCooldown(trips);
 *  - open (hali muddati bor) holatda kelgan kechikkan xato → until faqat uzayadi, trips o'zgarmaydi;
 *  - bad_request / context_length / unsupported → holat o'zgarmaydi.
 */
export function nextState(prev: HealthState, ev: HealthEvent, now: number): HealthState {
  if (ev.ok) {
    const ttfb = Number.isFinite(ev.ttfbMs) && ev.ttfbMs >= 0 ? ev.ttfbMs : prev.latencyEwmaMs;
    return {
      state: "closed",
      fails: 0,
      trips: 0,
      successEwma: ewma(prev.successEwma, 1),
      latencyEwmaMs: ewma(prev.latencyEwmaMs, ttfb),
      updatedAt: now,
    };
  }

  const err = ev.error;
  if (REQUEST_FAULT.has(err.kind)) return prev;

  const eff = effectiveState(prev, now);
  const trips = prev.trips ?? 0;
  const base: HealthState = {
    ...prev,
    fails: prev.fails + (err.kind === "transient" ? 1 : 0),
    successEwma: ewma(prev.successEwma, 0),
    lastError: err.kind,
    updatedAt: now,
  };
  delete base.usedToday;
  let authUntil: number | undefined;
  if (err.kind === "auth") {
    base.authStrikes = (prev.authStrikes ?? 0) + 1;
    authUntil = now + authCooldownMs(base.authStrikes);
  }
  const untilOf = (e: ClassifiedError) => (e.kind === "auth" ? authUntil : kindUntil(e, now));

  if (eff === "half_open") {
    // Probe yiqildi — qayta open, cooldown ikki barobar (kamida).
    const nt = trips + 1;
    const until = Math.max(untilOf(err) ?? 0, now + breakerCooldownMs(nt));
    return { ...base, state: "open", until, trips: nt };
  }

  if (err.kind === "transient") {
    if (eff === "open") return base; // allaqachon yopiq — faqat hisoblagich
    if (base.fails >= MESH_TUNING.failThreshold) {
      const nt = trips + 1;
      return { ...base, state: "open", until: now + breakerCooldownMs(nt), trips: nt };
    }
    return base;
  }

  const until = untilOf(err) as number;
  if (eff === "open") return { ...base, state: "open", until: Math.max(prev.until ?? 0, until) };
  return { ...base, state: "open", until };
}

/**
 * Xato qaysi kalitga yoziladi (§6 "scope"): `pool` bor — hisob hovuzi ($paid / $free, masalan
 * OpenRouter kredit tugadi — :free modellar ishlayveradi); auth / no_credit — butun provayder;
 * unavailable — doim model (wire bo'lsa); qolganlari — `error.scope === "model"` bo'lsa model.
 */
export function failureScope(err: ClassifiedError, wire?: string): "provider" | "model" | "pool" {
  if (err.pool && err.kind !== "auth") return "pool";
  if (!wire) return "provider";
  if (err.kind === "auth" || err.kind === "no_credit") return "provider";
  if (err.kind === "unavailable") return "model";
  return err.scope === "model" ? "model" : "provider";
}

/** Health TTL: max(until − now + 1h, 24h) (§9). */
export function healthTtlMs(h: HealthState, now: number): number {
  return Math.max((h.until ?? now) - now + HOUR, HEALTH_MIN_TTL_MS);
}

/** Saqlangan JSON'ni ehtiyotkor o'qish — buzilgan yozuv standart holatga aylanadi. */
export function parseHealth(raw: unknown): HealthState | null {
  if (raw == null) return null;
  let v: unknown = raw;
  if (typeof raw === "string") {
    try {
      v = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const num = (x: unknown, d: number) => (typeof x === "number" && Number.isFinite(x) ? x : d);
  const d = defaultHealth();
  const state = o.state === "open" || o.state === "half_open" || o.state === "closed" ? o.state : "closed";
  const h: HealthState = {
    state,
    fails: Math.max(0, num(o.fails, 0)),
    successEwma: Math.min(1, Math.max(0, num(o.successEwma, d.successEwma))),
    latencyEwmaMs: Math.max(0, num(o.latencyEwmaMs, d.latencyEwmaMs)),
    trips: Math.max(0, num(o.trips, 0)),
  };
  if (typeof o.until === "number" && Number.isFinite(o.until)) h.until = o.until;
  if (typeof o.updatedAt === "number" && Number.isFinite(o.updatedAt)) h.updatedAt = o.updatedAt;
  if (typeof o.lastError === "string") h.lastError = o.lastError as ErrorKind;
  if (typeof o.authFp === "string" && /^[0-9a-f]{1,16}$/.test(o.authFp)) h.authFp = o.authFp;
  if (typeof o.authStrikes === "number" && Number.isFinite(o.authStrikes) && o.authStrikes > 0) h.authStrikes = o.authStrikes;
  // half_open saqlanmaydi (u hisoblanadi) — eski yozuv bo'lsa open sifatida o'qiymiz.
  if (h.state === "half_open") h.state = "open";
  return h;
}

function serialize(h: HealthState): string {
  const { usedToday: _u, ...rest } = h;
  void _u;
  return JSON.stringify(rest);
}

/* ------------------------------------------------------------------ */
/* Saqlash qatlami                                                     */
/* ------------------------------------------------------------------ */

/** Minimal key-value interfeys: Upstash va xotira bir xil ko'rinishda. Xato otishi mumkin (FallbackStore ushlaydi). */
export interface HealthStore {
  mget(keys: string[]): Promise<(string | null)[]>;
  set(key: string, value: string, ttlMs: number): Promise<void>;
  /** SET NX PX — true: lock olindi. */
  setNX(key: string, value: string, ttlMs: number): Promise<boolean>;
  /** INCRBY + PEXPIRE; yangi qiymat. */
  incrBy(key: string, by: number, ttlMs: number): Promise<number>;
  /** SADD + PEXPIRE. */
  sadd(key: string, member: string, ttlMs: number): Promise<void>;
  smembers(key: string): Promise<string[]>;
  /** DEL (admin reset). Ixtiyoriy — yo'q bo'lsa standart holat yoziladi. */
  del?(keys: string[]): Promise<void>;
  /** SREM (mesh:index tozalash). Ixtiyoriy. */
  srem?(key: string, members: string[]): Promise<void>;
  /** Asosiy (Upstash) ombor holati — status sahifasi "noma'lum"ni "ishlayapti" deb ko'rsatmasin. */
  status?(): StoreStatus;
}

/**
 * Umumiy (barcha instansiyalar) sog'liq ombori holati:
 *  - persistent: Upstash sozlangan;
 *  - reachable: oxirgi murojaat muvaffaqiyatlimi (null — hali murojaat yo'q);
 *  - lastOkAt / lastFailAt — epoch ms.
 */
export interface StoreStatus {
  persistent: boolean;
  reachable: boolean | null;
  lastOkAt?: number;
  lastFailAt?: number;
}

/** Instansiya ichidagi saqlash (TTL `now()` bo'yicha). Testlarda va Upstash zaxirasi sifatida. */
export function memoryStore(now: () => number = Date.now): HealthStore {
  const kv = new Map<string, { v: string; exp: number }>();
  const sets = new Map<string, { m: Set<string>; exp: number }>();
  const live = <T extends { exp: number }>(m: Map<string, T>, k: string): T | undefined => {
    const e = m.get(k);
    if (!e) return undefined;
    if (e.exp <= now()) {
      m.delete(k);
      return undefined;
    }
    return e;
  };
  return {
    async mget(keys) {
      return keys.map((k) => live(kv, k)?.v ?? null);
    },
    async set(key, value, ttlMs) {
      kv.set(key, { v: value, exp: now() + ttlMs });
    },
    async setNX(key, value, ttlMs) {
      if (live(kv, key)) return false;
      kv.set(key, { v: value, exp: now() + ttlMs });
      return true;
    },
    async incrBy(key, by, ttlMs) {
      const cur = Number(live(kv, key)?.v ?? 0) || 0;
      const next = cur + by;
      kv.set(key, { v: String(next), exp: now() + ttlMs });
      return next;
    },
    async sadd(key, member, ttlMs) {
      const e = live(sets, key) ?? { m: new Set<string>(), exp: 0 };
      e.m.add(member);
      e.exp = now() + ttlMs;
      sets.set(key, e);
    },
    async smembers(key) {
      return [...(live(sets, key)?.m ?? [])];
    },
    async del(keys) {
      for (const k of keys) {
        kv.delete(k);
        sets.delete(k);
      }
    },
    async srem(key, members) {
      const e = live(sets, key);
      if (e) for (const m of members) e.m.delete(m);
    },
  };
}

/** Upstash REST klienti (javoblar xom satr — o'zimiz parse qilamiz). Qayta urinish yo'q: taymaut bizda. */
export function upstashStore(redis: Redis): HealthStore {
  return {
    async mget(keys) {
      if (keys.length === 0) return [];
      const r = await redis.mget<(string | null)[]>(...keys);
      return r.map((x) => (x == null ? null : typeof x === "string" ? x : JSON.stringify(x)));
    },
    async set(key, value, ttlMs) {
      await redis.set(key, value, { px: Math.max(1, Math.round(ttlMs)) });
    },
    async setNX(key, value, ttlMs) {
      const r = await redis.set(key, value, { px: Math.max(1, Math.round(ttlMs)), nx: true });
      return r === "OK";
    },
    async incrBy(key, by, ttlMs) {
      const p = redis.pipeline();
      p.incrby(key, Math.round(by));
      p.pexpire(key, Math.max(1, Math.round(ttlMs)));
      const [n] = await p.exec<[number, number]>();
      return Number(n) || 0;
    },
    async sadd(key, member, ttlMs) {
      const p = redis.pipeline();
      p.sadd(key, member);
      p.pexpire(key, Math.max(1, Math.round(ttlMs)));
      await p.exec();
    },
    async smembers(key) {
      return (await redis.smembers(key)).map(String);
    },
    async del(keys) {
      if (keys.length) await redis.del(...keys);
    },
    async srem(key, members) {
      if (members.length) await redis.srem(key, ...members);
    },
  };
}

class TimeoutError extends Error {}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const t = new Promise<never>((_, rej) => {
    // unref QILINMAYDI: aks holda osilgan so'rov bilan jarayon kutmasdan chiqib ketadi; finally baribir tozalaydi.
    timer = setTimeout(() => rej(new TimeoutError(`redis timeout ${ms}ms`)), ms);
  });
  return Promise.race([p, t]).finally(() => clearTimeout(timer));
}

/**
 * Asosiy (Upstash) + zaxira (xotira). Yozuvlar ikkalasiga; o'qish asosiydan, xato/taymautda —
 * zaxiradan va asosiy REDIS_BACKOFF_MS davomida chetlab o'tiladi. HECH QACHON otmaydi.
 */
export function fallbackStore(
  primary: HealthStore | null,
  secondary: HealthStore,
  opts: { timeoutMs?: number; now?: () => number; log?: (msg: string) => void } = {},
): HealthStore {
  const timeoutMs = opts.timeoutMs ?? MESH_TUNING.redisTimeoutMs;
  const now = opts.now ?? Date.now;
  const log = opts.log ?? ((m: string) => console.error(m));
  let downUntil = 0;
  let lastOkAt: number | undefined;
  let lastFailAt: number | undefined;

  async function run<T>(op: string, fn: (s: HealthStore) => Promise<T>): Promise<T> {
    // Zaxiraga har doim yozamiz/o'qiymiz — asosiy ishlamasa ham holat yo'qolmaydi.
    const local = await fn(secondary);
    if (!primary || now() < downUntil) return local;
    try {
      const r = await withTimeout(fn(primary), timeoutMs);
      lastOkAt = now();
      return r;
    } catch (e) {
      if (now() >= downUntil) log(`[mesh] Upstash ${op} xato, xotiraga o'tildi: ${e instanceof Error ? e.message : String(e)}`);
      downUntil = now() + REDIS_BACKOFF_MS;
      lastFailAt = now();
      return local;
    }
  }

  const safe = <A extends unknown[], T>(op: string, fb: T, fn: (s: HealthStore, ...a: A) => Promise<T>) =>
    async (...a: A): Promise<T> => {
      try {
        return await run(op, (s) => fn(s, ...a));
      } catch {
        return fb;
      }
    };

  return {
    mget: async (keys) => {
      try {
        return await run("mget", (s) => s.mget(keys));
      } catch {
        return keys.map(() => null);
      }
    },
    set: safe("set", undefined, (s, k: string, v: string, t: number) => s.set(k, v, t)),
    setNX: safe("setNX", false, (s, k: string, v: string, t: number) => s.setNX(k, v, t)),
    incrBy: safe("incrBy", 0, (s, k: string, b: number, t: number) => s.incrBy(k, b, t)),
    sadd: safe("sadd", undefined, (s, k: string, m: string, t: number) => s.sadd(k, m, t)),
    smembers: safe("smembers", [] as string[], (s, k: string) => s.smembers(k)),
    del: safe("del", undefined, async (s, keys: string[]) => {
      await s.del?.(keys);
    }),
    srem: safe("srem", undefined, async (s, k: string, members: string[]) => {
      await s.srem?.(k, members);
    }),
    status(): StoreStatus {
      if (!primary) return { persistent: false, reachable: null };
      const down = now() < downUntil || (lastFailAt !== undefined && (lastOkAt === undefined || lastFailAt > lastOkAt));
      return {
        persistent: true,
        reachable: lastOkAt === undefined && lastFailAt === undefined ? null : !down,
        ...(lastOkAt !== undefined ? { lastOkAt } : {}),
        ...(lastFailAt !== undefined ? { lastFailAt } : {}),
      };
    },
  };
}

/* ------------------------------------------------------------------ */
/* Mesh sog'liq xizmati                                                */
/* ------------------------------------------------------------------ */

export interface RecordOptions {
  /** Model (wire) — model-scope xatolar va perModel kvota uchun. */
  wire?: string;
  /** Kvota birligi soni (Limits.unit bo'yicha: requests → 1, tokens → total_tokens, neurons → cfNeurons). Berilmasa — hisoblanmaydi. */
  units?: number;
  /** Limits.perModel — usage mesh:usage:<provider>:<wire>:<day> ga yoziladi. */
  perModel?: boolean;
  /** Dinamik (resolve) wire — model-scope yozuv faqat instansiya xotirasida (Upstash index o'smaydi). */
  ephemeral?: boolean;
}

export interface FailureOptions {
  wire?: string;
  /** Ishlatilgan kalit barmoq izi (auth blokini kalitga bog'lash). */
  keyFp?: string;
  ephemeral?: boolean;
}

/** snapshot() uchun adapter: id (majburiy) va endpoint (auth barmoq izini solishtirish uchun). */
export type SnapshotAdapter = Pick<ProviderAdapter, "id"> & Partial<Pick<ProviderAdapter, "endpoint">>;

export interface HealthMesh {
  /** Muvaffaqiyat (birinchi baytgacha vaqt). Fire-and-forget — hech qachon otmaydi. */
  recordSuccess(provider: ProviderId, latencyMs: number, opts?: RecordOptions): Promise<void>;
  /** Faqat kunlik birlik (javob oxirida — muvaffaqiyat allaqachon birinchi baytda yozilgan). */
  recordUsage(provider: ProviderId, units: number, opts?: RecordOptions): Promise<void>;
  /** Xato (adapter.classifyError natijasi). bad_request/context_length/unsupported — no-op. */
  recordFailure(provider: ProviderId, error: ClassifiedError, opts?: FailureOptions): Promise<void>;
  /** execute uchun: Attempt'dan (ok → success, aks holda failure). */
  record(a: Attempt, units?: number, opts?: { perModel?: boolean }): Promise<void>;
  /** Bitta kalit holati (usedToday bilan). Yozuv yo'q → defaultHealth(). */
  getHealth(provider: ProviderId, wire?: string): Promise<HealthState>;
  /** Provider (va wire berilsa model) kaliti open emasmi (half_open = ruxsat). */
  isAvailable(provider: ProviderId, now?: number, wire?: string): Promise<boolean>;
  /**
   * Scheduler va status sahifasi uchun: provayder va hovuz kalitlari + yozuvi/sarfi bor model
   * kalitlari. Bitta smembers + bitta MGET, instansiyada 5 s kesh. `adapters[].endpoint` berilsa —
   * boshqa kalit bilan olingan auth bloki (kalit almashtirilgan) e'tiborsiz qoldiriladi.
   */
  snapshot(adapters?: ReadonlyArray<SnapshotAdapter>): Promise<HealthSnapshot>;
  /** half_open sinov lock'i (SET NX PX 15000). `key` — healthKey(...). */
  acquireProbe(key: string): Promise<boolean>;
  /** Kesh'ni tashlash (test / majburiy yangilash). */
  invalidate(): void;
  /**
   * Admin: provayder (yoki hammasi) sog'lig'ini tiklash — provayder, hovuz va model kalitlari
   * o'chiriladi (kalit almashtirilgandan keyin darhol ishlatish uchun). O'chirilgan kalitlar soni.
   */
  reset(provider?: ProviderId): Promise<number>;
  /** Umumiy ombor holati + oxirgi surat vaqti (status sahifasi "noma'lum"ni ajratsin). */
  storeStatus(): StoreStatus & { snapshotAt?: number };
}

const isPoolWire = (wire: string) => (POOL_WIRES as readonly string[]).includes(wire);

export function createHealthMesh(deps: {
  store: HealthStore;
  /** Faqat instansiya xotirasi — dinamik (ephemeral) model kalitlari uchun. Standart: yangi memoryStore. */
  local?: HealthStore;
  now?: () => number;
  log?: (msg: string) => void;
  /** mesh:index maksimal a'zolari (standart MESH_TUNING.maxIndexSize). */
  maxIndexSize?: number;
  /**
   * Breaker o'tishi (provayder va hovuz kalitlari; model kalitlari emas): closed/half_open → open,
   * open/half_open → closed (muvaffaqiyat), open → half_open (probe lock olindi). Ops bot uchun —
   * sinxron, hech qachon kutilmaydi; otib yuborsa ham e'tiborsiz.
   */
  onTransition?: (t: BreakerTransition) => void;
}): HealthMesh {
  const store = deps.store;
  const clock = deps.now ?? Date.now;
  const log = deps.log ?? ((m: string) => console.error(m));
  const local = deps.local ?? memoryStore(clock);
  const maxIndex = deps.maxIndexSize ?? MESH_TUNING.maxIndexSize;
  const emit = (t: BreakerTransition) => {
    if (!deps.onTransition) return;
    try {
      deps.onTransition(t);
    } catch {
      /* ops yozuvi hech qachon sog'liq yozuvini buzmaydi */
    }
  };

  /** Instansiya xotirasidagi model-scope a'zolar ("<provider>:<wire>"), o'lchami cheklangan. */
  const localMembers = new Set<string>();
  const LOCAL_MAX = 500;
  /** Upstash index'dagi ma'lum a'zolar (loadAll'dan + o'zimiz qo'shganlar). */
  let indexMembers = new Set<string>();

  /** Instansiya keshi: kalit → holat (usedToday bilan). O'z yozuvlarimiz darhol shu yerga tushadi. */
  let cache: { at: number; map: Map<string, HealthState> } | null = null;

  function patchCache(key: string, fn: (h: HealthState) => HealthState) {
    if (!cache) return;
    cache.map.set(key, fn(cache.map.get(key) ?? defaultHealth()));
  }

  function trackLocal(member: string) {
    if (localMembers.has(member)) return;
    if (localMembers.size >= LOCAL_MAX) {
      const oldest = localMembers.values().next().value;
      if (oldest !== undefined) localMembers.delete(oldest);
    }
    localMembers.add(member);
  }

  /** "<provider>:<wire>" — model-scope kalit (hovuz emas), aks holda null. */
  function memberOf(provider: ProviderId, wire?: string): string | null {
    return wire && !isPoolWire(wire) ? `${provider}:${wire}` : null;
  }

  /**
   * Model-scope kalit qayerga yoziladi: dinamik wire, xotirada allaqachon bor yoki index to'lgan →
   * instansiya xotirasi; aks holda Upstash (index'ga qo'shiladi). Provayder/hovuz kalitlari — doim Upstash.
   */
  async function targetFor(member: string | null, ephemeral: boolean | undefined): Promise<HealthStore> {
    if (!member) return store;
    if (ephemeral || localMembers.has(member) || (!indexMembers.has(member) && indexMembers.size >= maxIndex)) {
      trackLocal(member);
      return local;
    }
    indexMembers.add(member);
    await store.sadd(INDEX_KEY, member, INDEX_TTL_MS);
    return store;
  }

  /** O'qish uchun: xotiradagi a'zo — local, aks holda asosiy ombor. */
  const readerFor = (member: string | null, ephemeral?: boolean) =>
    member && (ephemeral || localMembers.has(member)) ? local : store;

  async function loadAll(): Promise<Map<string, HealthState>> {
    const now = clock();
    if (cache && now - cache.at < MESH_TUNING.healthCacheMs) return cache.map;

    const members = await store.smembers(INDEX_KEY);
    type Scope = { provider: ProviderId; wire?: string; member?: string; usage: boolean };
    const scopes: Scope[] = [];
    for (const provider of PROVIDER_IDS) {
      scopes.push({ provider, usage: true });
      for (const w of POOL_WIRES) scopes.push({ provider, wire: w, usage: false });
    }
    for (const m of members) {
      const parsed = parseHealthKey(HEALTH_PREFIX + m);
      if (parsed?.wire && !isPoolWire(parsed.wire)) scopes.push({ ...parsed, member: m, usage: true });
    }
    const hKeys = scopes.map((s) => healthKey(s.provider, s.wire));
    const uScopes = scopes.filter((s) => s.usage);
    const uKeys = uScopes.map((s) => usageKey(s.provider, s.wire, now));
    const raw = await store.mget([...hKeys, ...uKeys]);
    const usageOf = new Map<Scope, number>();
    uScopes.forEach((s, i) => usageOf.set(s, Number(raw[hKeys.length + i] ?? 0) || 0));

    const map = new Map<string, HealthState>();
    const stale: string[] = [];
    const liveIdx: { member: string; open: boolean }[] = [];
    scopes.forEach((s, i) => {
      const h = parseHealth(raw[i]);
      const used = usageOf.get(s) ?? 0;
      if (!h && used <= 0 && s.wire) {
        if (s.member) stale.push(s.member); // muddati o'tgan index a'zosi — tozalanadi
        return;
      }
      const st = h ?? defaultHealth();
      if (used > 0) st.usedToday = used;
      map.set(hKeys[i], st);
      if (s.member) liveIdx.push({ member: s.member, open: st.state === "open" });
    });
    // Index chegarasi: muddati o'tganlar + (ortiqcha bo'lsa) ochiq bo'lmagan a'zolar olib tashlanadi.
    const overflow = liveIdx.length - maxIndex;
    const drop = overflow > 0 ? liveIdx.filter((x) => !x.open).slice(0, overflow).map((x) => x.member) : [];
    if ((stale.length || drop.length) && store.srem) {
      store.srem(INDEX_KEY, [...stale, ...drop]).catch(() => {});
    }
    const dropped = new Set(drop);
    indexMembers = new Set(liveIdx.map((x) => x.member).filter((m) => !dropped.has(m)));

    // Instansiya xotirasidagi (dinamik) model kalitlari.
    if (localMembers.size) {
      const loc = [...localMembers]
        .map((m) => parseHealthKey(HEALTH_PREFIX + m))
        .filter((p): p is { provider: ProviderId; wire: string } => !!p?.wire);
      const lh = loc.map((p) => healthKey(p.provider, p.wire));
      const lu = loc.map((p) => usageKey(p.provider, p.wire, now));
      const lraw = await local.mget([...lh, ...lu]);
      loc.forEach((p, i) => {
        const h = parseHealth(lraw[i]);
        const used = Number(lraw[lh.length + i] ?? 0) || 0;
        if (!h && used <= 0) {
          localMembers.delete(`${p.provider}:${p.wire}`);
          return;
        }
        const st = h ?? defaultHealth();
        if (used > 0) st.usedToday = used;
        map.set(lh[i], st);
      });
    }
    cache = { at: now, map };
    return map;
  }

  async function readOne(key: string, reader: HealthStore): Promise<HealthState | null> {
    const [raw] = await reader.mget([key]);
    return parseHealth(raw);
  }

  async function write(key: string, h: HealthState, now: number, target: HealthStore) {
    await target.set(key, serialize(h), healthTtlMs(h, now));
    patchCache(key, (old) => ({ ...h, ...(old.usedToday ? { usedToday: old.usedToday } : {}) }));
  }

  async function recordUsage(provider: ProviderId, units: number, opts: RecordOptions = {}) {
    try {
      if (!(units > 0) || !Number.isFinite(units)) return;
      const now = clock();
      const wireScope = opts.perModel && opts.wire ? opts.wire : undefined;
      const target = await targetFor(memberOf(provider, wireScope), opts.ephemeral);
      await target.incrBy(usageKey(provider, wireScope, now), units, USAGE_TTL_MS);
      patchCache(healthKey(provider, wireScope), (h) => ({ ...h, usedToday: (h.usedToday ?? 0) + units }));
    } catch (e) {
      log(`[mesh] recordUsage ${provider}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function recordSuccess(provider: ProviderId, latencyMs: number, opts: RecordOptions = {}) {
    try {
      const now = clock();
      const pKey = healthKey(provider);
      const ev: HealthEvent = { ok: true, ttfbMs: latencyMs };
      const pPrev = await readOne(pKey, store);
      await write(pKey, nextState(pPrev ?? defaultHealth(), ev, now), now, store);
      if (pPrev) {
        const was = effectiveState(pPrev, now);
        if (was !== "closed") emit({ provider, from: was, to: "closed", at: now });
      }
      // Model kaliti faqat mavjud bo'lsa yangilanadi (probe muvaffaqiyati uni yopadi) — keraksiz yozuv yo'q.
      const member = memberOf(provider, opts.wire);
      if (member && opts.wire) {
        const mKey = healthKey(provider, opts.wire);
        const mPrev = await readOne(mKey, readerFor(member, opts.ephemeral));
        if (mPrev) await write(mKey, nextState(mPrev, ev, now), now, await targetFor(member, opts.ephemeral));
      }
      if (opts.units !== undefined) await recordUsage(provider, opts.units, opts);
    } catch (e) {
      log(`[mesh] recordSuccess ${provider}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function recordFailure(provider: ProviderId, error: ClassifiedError, opts: FailureOptions = {}) {
    try {
      if (REQUEST_FAULT.has(error.kind)) return;
      if (error.kind === "auth") log(`[mesh] auth ${provider}`); // kalit qiymati hech qachon yozilmaydi
      const now = clock();
      const scope = failureScope(error, opts.wire);
      const wire = scope === "model" ? opts.wire : scope === "pool" && error.pool ? poolWire(error.pool) : undefined;
      const key = healthKey(provider, wire);
      const member = memberOf(provider, wire);
      let prev = (await readOne(key, readerFor(member, opts.ephemeral))) ?? defaultHealth();
      // Boshqa kalit bilan olingan auth tarixi — yangi kalit uchun cooldown qaytadan (5 daqiqa).
      if (error.kind === "auth" && opts.keyFp && prev.authFp && prev.authFp !== opts.keyFp) prev = { ...prev, authStrikes: 0 };
      const next = nextState(prev, { ok: false, error }, now);
      if (error.kind === "auth" && opts.keyFp) next.authFp = opts.keyFp;
      await write(key, next, now, await targetFor(member, opts.ephemeral));
      if (scope !== "model" && next.state === "open") {
        const was = effectiveState(prev, now);
        if (was !== "open") {
          emit({
            provider,
            ...(wire ? { wire } : {}),
            from: was,
            to: "open",
            reason: error.kind,
            ...(error.timeout ? { timeout: true } : {}),
            ...(next.until !== undefined ? { until: next.until } : {}),
            trips: next.trips ?? 0,
            at: now,
          });
        }
      }
    } catch (e) {
      log(`[mesh] recordFailure ${provider}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function getHealth(provider: ProviderId, wire?: string): Promise<HealthState> {
    try {
      const map = await loadAll();
      const h = map.get(healthKey(provider, wire));
      return h ? { ...h } : defaultHealth();
    } catch {
      return defaultHealth();
    }
  }

  /** auth bloki boshqa kalit bilan olingan (kalit almashtirilgan) — blok e'tiborsiz. */
  function authStale(h: HealthState, a: SnapshotAdapter | undefined): boolean {
    if (!a?.endpoint || !h.authFp || h.lastError !== "auth" || h.state !== "open") return false;
    try {
      const cur = keyFingerprint(a.endpoint().headers);
      return !!cur && cur !== h.authFp;
    } catch {
      return false;
    }
  }

  return {
    recordSuccess,
    recordUsage,
    recordFailure,
    async record(a, units, opts) {
      if (a.ok) {
        return recordSuccess(a.provider, a.ttfbMs ?? MESH_TUNING.defaultLatencyMs, {
          wire: a.wire,
          units,
          perModel: opts?.perModel,
          ephemeral: a.ephemeral,
        });
      }
      if (a.error) return recordFailure(a.provider, a.error, { wire: a.wire, keyFp: a.keyFp, ephemeral: a.ephemeral });
    },
    getHealth,
    async isAvailable(provider, now, wire) {
      try {
        const t = now ?? clock();
        const map = await loadAll();
        if (!isAvailableState(map.get(healthKey(provider)), t)) return false;
        return !wire || isAvailableState(map.get(healthKey(provider, wire)), t);
      } catch {
        return true; // sog'liq noma'lum — tanlashni to'xtatmaymiz
      }
    },
    async snapshot(adapters) {
      try {
        const map = await loadAll();
        if (!adapters) return new Map(map);
        const byId = new Map<string, SnapshotAdapter>(adapters.map((a) => [a.id, a]));
        const out = new Map<string, HealthState>();
        for (const [k, v] of map) {
          const p = parseHealthKey(k);
          if (!p || !byId.has(p.provider)) continue;
          if (!p.wire && authStale(v, byId.get(p.provider))) {
            // Kalit almashtirilgan — eski auth bloki yangi kalitga tegishli emas.
            const rest: HealthState = { ...v, state: "closed" };
            delete rest.until;
            out.set(k, rest);
            continue;
          }
          out.set(k, v);
        }
        return out;
      } catch {
        return new Map();
      }
    },
    async acquireProbe(key) {
      try {
        const got = await store.setNX(probeKey(key), "1", MESH_TUNING.probeLockMs);
        if (got) {
          const p = parseHealthKey(key);
          if (p && (!p.wire || isPoolWire(p.wire))) {
            emit({ provider: p.provider, ...(p.wire ? { wire: p.wire } : {}), from: "open", to: "half_open", at: clock() });
          }
        }
        return got;
      } catch {
        return true; // lock'siz ham bitta ortiqcha urinish — xavfsiz
      }
    },
    invalidate() {
      cache = null;
    },
    async reset(provider) {
      try {
        const providers: ProviderId[] = provider ? [provider] : [...PROVIDER_IDS];
        const wanted = new Set<string>(providers);
        const keys: string[] = [];
        for (const p of providers) {
          keys.push(healthKey(p));
          for (const w of POOL_WIRES) keys.push(healthKey(p, w));
        }
        const indexed = new Set([...(await store.smembers(INDEX_KEY)), ...indexMembers]);
        for (const m of indexed) if (wanted.has(m.split(":")[0])) keys.push(HEALTH_PREFIX + m);
        const locals = [...localMembers].filter((m) => wanted.has(m.split(":")[0]));
        const localKeys = locals.map((m) => HEALTH_PREFIX + m);
        if (store.del) await store.del(keys);
        else for (const k of keys) await store.set(k, serialize(defaultHealth()), 1);
        if (local.del && localKeys.length) await local.del(localKeys);
        locals.forEach((m) => localMembers.delete(m));
        cache = null;
        log(`[mesh] admin reset: ${provider ?? "all"} (${keys.length + localKeys.length} kalit)`);
        return keys.length + localKeys.length;
      } catch (e) {
        log(`[mesh] reset: ${e instanceof Error ? e.message : String(e)}`);
        return 0;
      }
    },
    storeStatus() {
      const st = store.status?.() ?? { persistent: false, reachable: null };
      return { ...st, ...(cache ? { snapshotAt: cache.at } : {}) };
    },
  };
}

/* ------------------------------------------------------------------ */
/* Standart (jarayon bo'yicha yagona) instansiya                       */
/* ------------------------------------------------------------------ */

let defaultMesh: HealthMesh | null = null;

/** Lazily: import paytida env o'qilmaydi va tarmoq ochilmaydi. */
function mesh(): HealthMesh {
  if (defaultMesh) return defaultMesh;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  let primary: HealthStore | null = null;
  if (url && token) {
    try {
      primary = upstashStore(new Redis({ url, token, automaticDeserialization: false, retry: false }));
    } catch {
      primary = null;
    }
  }
  const memory = memoryStore();
  defaultMesh = createHealthMesh({
    store: fallbackStore(primary, memory),
    local: memory,
    // Ops bot (Telegram): breaker o'tishlari — dinamik import, fire-and-forget, so'rov yo'lini kutdirmaydi.
    onTransition: (t) => {
      import("@/lib/ops/record").then((m) => m.recordBreaker(t)).catch(() => undefined);
    },
  });
  return defaultMesh;
}

export const recordSuccess: HealthMesh["recordSuccess"] = (...a) => mesh().recordSuccess(...a);
export const recordUsage: HealthMesh["recordUsage"] = (...a) => mesh().recordUsage(...a);
export const recordFailure: HealthMesh["recordFailure"] = (...a) => mesh().recordFailure(...a);
export const record: HealthMesh["record"] = (...a) => mesh().record(...a);
export const getHealth: HealthMesh["getHealth"] = (...a) => mesh().getHealth(...a);
export const isAvailable: HealthMesh["isAvailable"] = (...a) => mesh().isAvailable(...a);
export const snapshot: HealthMesh["snapshot"] = (...a) => mesh().snapshot(...a);
export const acquireProbe: HealthMesh["acquireProbe"] = (...a) => mesh().acquireProbe(...a);
export const resetHealth: HealthMesh["reset"] = (...a) => mesh().reset(...a);
export const storeStatus: HealthMesh["storeStatus"] = () => mesh().storeStatus();

/**
 * Faqat testlar uchun: jarayon instansiyasini tashlab yuboradi (keyingi chaqiruvda env qayta
 * o'qiladi, xotira toza). Ishlab chiqarishda chaqirilmaydi.
 */
export function __resetHealthForTests(): void {
  defaultMesh = null;
}
