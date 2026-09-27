/**
 * Ops hodisalari va hisoblagichlari ombori. Interfeys + ikki amalga oshirish:
 *  - upstashOpsStore(redis) — barcha instansiyalar uchun umumiy (asosiy yo'l);
 *  - memoryOpsStore() — Upstash yo'q bo'lsa / testlar (instansiya ichida, hajmi CHEKLANGAN).
 * Supabase ops_events jadvali (0043, ixtiyoriy) — faqat hodisalar ro'yxatining zaxirasi
 * (ops.server.ts ulaydi). Hech bir funksiya chaqiruvchiga shaxsiy ma'lumot qaytarmaydi —
 * omborga faqat niqoblangan/yig'ma qiymatlar yoziladi.
 *
 * Kalitlar:
 *   ops:events                 LIST (eng yangisi boshida) JSON OpsEvent, LTRIM 0..MAX-1, TTL 35 kun
 *   ops:m:h:<YYYYMMDDHH>       HASH hisoblagichlar (soatlik, UTC), TTL 9 kun
 *   ops:m:d:<YYYYMMDD>         HASH hisoblagichlar (kunlik, UTC), TTL 40 kun
 *   ops:fo:5m:<bucketStartMs>  HASH failover "from|reason|to|model" → soni, TTL 2 kun
 *   ops:sent:<eventId>         dedupe (SET NX), TTL 8 kun
 *   ops:cursor:<source>        oxirgi muvaffaqiyatli lenta ishga tushishi (ms)
 *   ops:rl:<windowStart>       rate limit hisoblagichi (10 daqiqa oynasi)
 */

export type OpsEventType =
  | "signup"
  | "payment"
  | "renewal"
  | "refund"
  | "chargeback"
  | "breaker"
  | "failover"
  | "budget"
  | "release"
  | "deploy"
  | "device_login"
  | "device_revoke";

export const OPS_EVENT_TYPES: readonly OpsEventType[] = [
  "signup",
  "payment",
  "renewal",
  "refund",
  "chargeback",
  "breaker",
  "failover",
  "budget",
  "release",
  "deploy",
  "device_login",
  "device_revoke",
];

export type OpsValue = string | number | boolean | null;

export interface OpsEvent {
  /** Barqaror id (dedupe): "signup:<uuid>", "breaker:groq::open:<min>" ... */
  id: string;
  /** Vaqt (epoch ms). */
  t: number;
  type: OpsEventType;
  /** Faqat ruxsat etilgan, niqoblangan maydonlar. */
  d: Record<string, OpsValue>;
}

export const EVENTS_KEY = "ops:events";
export const EVENTS_MAX = 2000;
export const EVENTS_TTL_MS = 35 * 86_400_000;
export const HOUR_TTL_MS = 9 * 86_400_000;
export const DAY_TTL_MS = 40 * 86_400_000;
export const FO_BUCKET_MS = 5 * 60_000;
export const FO_TTL_MS = 2 * 86_400_000;
export const SENT_TTL_MS = 8 * 86_400_000;

export const hourKey = (h: string) => `ops:m:h:${h}`;
export const dayKey = (d: string) => `ops:m:d:${d}`;
export const foBucketKey = (bucketStart: number) => `ops:fo:5m:${bucketStart}`;

export interface OpsStore {
  /** Hodisa qo'shish (ro'yxat boshiga), hajm va TTL cheklangan. */
  push(ev: OpsEvent): Promise<void>;
  /** Eng yangi `limit` ta hodisa (yangisi birinchi). */
  recent(limit: number): Promise<OpsEvent[]>;
  /** HINCRBY (bir nechta maydon) + PEXPIRE. */
  hincr(key: string, fields: Record<string, number>, ttlMs: number): Promise<void>;
  /** Bir nechta HASH (bitta pipeline). Yo'q kalit → {}. */
  hgetall(keys: string[]): Promise<Record<string, number>[]>;
  /** SET NX PX — true: yangi (kalit olindi). */
  setNx(key: string, ttlMs: number): Promise<boolean>;
  exists(key: string): Promise<boolean>;
  del(key: string): Promise<void>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlMs: number): Promise<void>;
  /** INCR + PEXPIRE (birinchi marta). */
  incr(key: string, ttlMs: number): Promise<number>;
  /** "upstash" | "memory" (+ "table" — hodisalar Supabase'da). */
  readonly kind: string;
}

export function parseEvent(raw: unknown): OpsEvent | null {
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
  if (typeof o.id !== "string" || typeof o.t !== "number" || typeof o.type !== "string") return null;
  if (!(OPS_EVENT_TYPES as readonly string[]).includes(o.type)) return null;
  const d: Record<string, OpsValue> = {};
  if (o.d && typeof o.d === "object") {
    for (const [k, x] of Object.entries(o.d as Record<string, unknown>)) {
      if (x === null || typeof x === "string" || typeof x === "number" || typeof x === "boolean") d[k] = typeof x === "string" ? x.slice(0, 300) : x;
    }
  }
  return { id: o.id.slice(0, 200), t: o.t, type: o.type as OpsEventType, d };
}

const toNumMap = (raw: unknown): Record<string, number> => {
  const out: Record<string, number> = {};
  if (!raw) return out;
  if (Array.isArray(raw)) {
    // Ba'zi REST javoblari [k1, v1, k2, v2] ko'rinishida.
    for (let i = 0; i + 1 < raw.length; i += 2) out[String(raw[i])] = Number(raw[i + 1]) || 0;
    return out;
  }
  if (typeof raw === "object") for (const [k, v] of Object.entries(raw as Record<string, unknown>)) out[k] = Number(v) || 0;
  return out;
};

/* ------------------------------------------------------------------ */
/* Xotira (zaxira / testlar) — hajmi cheklangan                          */
/* ------------------------------------------------------------------ */

export function memoryOpsStore(now: () => number = Date.now, caps = { events: 500, keys: 2000, fields: 300 }): OpsStore {
  const events: OpsEvent[] = [];
  const kv = new Map<string, { v: string; exp: number }>();
  const hashes = new Map<string, { m: Map<string, number>; exp: number }>();
  const live = <T extends { exp: number }>(m: Map<string, T>, k: string) => {
    const e = m.get(k);
    if (e && e.exp <= now()) {
      m.delete(k);
      return undefined;
    }
    return e;
  };
  const trim = <T>(m: Map<string, T>) => {
    while (m.size > caps.keys) {
      const first = m.keys().next().value;
      if (first === undefined) break;
      m.delete(first);
    }
  };
  return {
    kind: "memory",
    async push(ev) {
      events.unshift(ev);
      if (events.length > caps.events) events.length = caps.events;
    },
    async recent(limit) {
      return events.slice(0, Math.max(0, limit));
    },
    async hincr(key, fields, ttlMs) {
      const h = live(hashes, key) ?? { m: new Map<string, number>(), exp: 0 };
      for (const [f, n] of Object.entries(fields)) {
        if (!h.m.has(f) && h.m.size >= caps.fields) continue; // hajm chegarasi
        h.m.set(f, (h.m.get(f) ?? 0) + n);
      }
      h.exp = now() + ttlMs;
      hashes.set(key, h);
      trim(hashes);
    },
    async hgetall(keys) {
      return keys.map((k) => Object.fromEntries(live(hashes, k)?.m ?? []));
    },
    async setNx(key, ttlMs) {
      if (live(kv, key)) return false;
      kv.set(key, { v: "1", exp: now() + ttlMs });
      trim(kv);
      return true;
    },
    async exists(key) {
      return !!live(kv, key);
    },
    async del(key) {
      kv.delete(key);
    },
    async get(key) {
      return live(kv, key)?.v ?? null;
    },
    async set(key, value, ttlMs) {
      kv.set(key, { v: value, exp: now() + ttlMs });
      trim(kv);
    },
    async incr(key, ttlMs) {
      const e = live(kv, key);
      const n = (Number(e?.v) || 0) + 1;
      kv.set(key, { v: String(n), exp: e?.exp ?? now() + ttlMs });
      trim(kv);
      return n;
    },
  };
}

/* ------------------------------------------------------------------ */
/* Upstash                                                              */
/* ------------------------------------------------------------------ */

/** @upstash/redis Redis'ining bizga kerak qismi (testda soxta). */
export interface RedisLike {
  pipeline(): {
    lpush(key: string, ...v: string[]): unknown;
    ltrim(key: string, start: number, stop: number): unknown;
    pexpire(key: string, ms: number): unknown;
    hincrby(key: string, field: string, by: number): unknown;
    hgetall(key: string): unknown;
    incr(key: string): unknown;
    exec<T extends unknown[] = unknown[]>(): Promise<T>;
  };
  lrange(key: string, start: number, stop: number): Promise<unknown[]>;
  set(key: string, value: string, opts: { px: number; nx?: boolean }): Promise<unknown>;
  get(key: string): Promise<unknown>;
  exists(...keys: string[]): Promise<number>;
  del(...keys: string[]): Promise<number>;
}

export function upstashOpsStore(redis: RedisLike, opts: { timeoutMs?: number } = {}): OpsStore {
  const timeoutMs = opts.timeoutMs ?? 2_000;
  const withTimeout = <T>(p: Promise<T>): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    return Promise.race([
      p,
      new Promise<T>((_, rej) => {
        timer = setTimeout(() => rej(new Error(`upstash timeout ${timeoutMs}ms`)), timeoutMs);
      }),
    ]).finally(() => clearTimeout(timer));
  };
  const px = (ms: number) => Math.max(1, Math.round(ms));
  return {
    kind: "upstash",
    async push(ev) {
      const p = redis.pipeline();
      p.lpush(EVENTS_KEY, JSON.stringify(ev));
      p.ltrim(EVENTS_KEY, 0, EVENTS_MAX - 1);
      p.pexpire(EVENTS_KEY, px(EVENTS_TTL_MS));
      await withTimeout(p.exec());
    },
    async recent(limit) {
      const raw = await withTimeout(redis.lrange(EVENTS_KEY, 0, Math.max(0, Math.min(limit, EVENTS_MAX) - 1)));
      return raw.map(parseEvent).filter((e): e is OpsEvent => !!e);
    },
    async hincr(key, fields, ttlMs) {
      const entries = Object.entries(fields).filter(([, n]) => Number.isFinite(n) && n !== 0);
      if (!entries.length) return;
      const p = redis.pipeline();
      for (const [f, n] of entries) p.hincrby(key, f, Math.round(n));
      p.pexpire(key, px(ttlMs));
      await withTimeout(p.exec());
    },
    async hgetall(keys) {
      if (!keys.length) return [];
      const p = redis.pipeline();
      for (const k of keys) p.hgetall(k);
      const res = await withTimeout(p.exec());
      return res.map(toNumMap);
    },
    async setNx(key, ttlMs) {
      return (await withTimeout(redis.set(key, "1", { px: px(ttlMs), nx: true }))) === "OK";
    },
    async exists(key) {
      return (await withTimeout(redis.exists(key))) > 0;
    },
    async del(key) {
      await withTimeout(redis.del(key));
    },
    async get(key) {
      const v = await withTimeout(redis.get(key));
      return v == null ? null : String(v);
    },
    async set(key, value, ttlMs) {
      await withTimeout(redis.set(key, value, { px: px(ttlMs) }));
    },
    async incr(key, ttlMs) {
      const p = redis.pipeline();
      p.incr(key);
      p.pexpire(key, px(ttlMs));
      const [n] = await withTimeout(p.exec<[number, number]>());
      return Number(n) || 0;
    },
  };
}
