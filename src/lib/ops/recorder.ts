/**
 * Ops yozuvchisi — so'rov yo'lidan (mesh, chat route'lar, webhooklar) chaqiriladi. Qoidalar:
 *  - hech qachon otmaydi va chaqiruvchini KUTDIRMAYDI (void qaytaradi, ichida fire-and-forget);
 *  - hisoblagichlar instansiya ichida ~250 ms yig'ilib bitta pipeline bilan yoziladi (yuk ostida
 *    har so'rovga alohida Upstash chaqiruvi yo'q), kutilayotgan maydonlar soni cheklangan;
 *  - faqat yig'ma / niqoblangan qiymatlar: provayder/model id, xato sinfi, sonlar.
 * Test: src/lib/ops/ops.test.ts (soxta ombor va soat).
 */
import { providerLabel, reasonClass, safeId, safeModel, utcDayKey, utcHourKey } from "./format";
import {
  DAY_TTL_MS,
  FO_BUCKET_MS,
  FO_TTL_MS,
  HOUR_TTL_MS,
  dayKey,
  foBucketKey,
  hourKey,
  type OpsEvent,
  type OpsStore,
} from "./store";

export type BreakerState = "closed" | "open" | "half_open";

export interface BreakerTransition {
  provider: string;
  /** undefined — butun provayder; "$paid" / "$free" — hisob hovuzi. Model kalitlari yuborilmaydi. */
  wire?: string;
  from: BreakerState;
  to: BreakerState;
  /** Xato turi (ErrorKind) — faqat open'da. */
  reason?: string;
  timeout?: boolean;
  until?: number;
  trips?: number;
  at: number;
}

export interface FailoverInfo {
  /** Birinchi yiqilgan nomzod provayderi. */
  from: string;
  /** Birinchi yiqilishning xato turi (ErrorKind) va taymaut belgisi. */
  error?: { kind?: string; timeout?: boolean } | null;
  /** Javob bergan provayder va halol served model. */
  to: string;
  model: string;
  surface: "web" | "cli";
}

export interface OpsRecorder {
  metric(fields: Record<string, number>): void;
  failover(f: FailoverInfo): void;
  /** Barcha nomzodlar yiqildi — so'rov javobsiz. */
  exhausted(error: { kind?: string; timeout?: boolean } | null | undefined, surface: "web" | "cli"): void;
  breaker(t: BreakerTransition): void;
  event(ev: OpsEvent): void;
  /** Kutilayotganlarni darhol yozish (test / cron oxiri). */
  flush(): Promise<void>;
}

/** Failover maydoni: "fo|<from>|<reason>|<to>|<model>". */
export function failoverField(from: string, reason: string, to: string, model: string): string {
  return `fo|${safeId(from)}|${safeId(reason, 16)}|${safeId(to)}|${safeModel(model)}`;
}

export function parseFailoverField(f: string): { from: string; reason: string; to: string; model: string } | null {
  if (!f.startsWith("fo|")) return null;
  const [, from, reason, to, ...model] = f.split("|");
  if (!from || !reason || !to) return null;
  return { from, reason, to, model: model.join("|") || "—" };
}

export function createOpsRecorder(deps: {
  store: OpsStore;
  now?: () => number;
  log?: (m: string) => void;
  flushDelayMs?: number;
  maxPending?: number;
}): OpsRecorder {
  const now = deps.now ?? Date.now;
  const log = deps.log ?? ((m: string) => console.warn(m));
  const delay = deps.flushDelayMs ?? 250;
  const maxPending = deps.maxPending ?? 200;
  let metrics = new Map<string, number>();
  let fo5m = new Map<number, Map<string, number>>();
  let pendingCount = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastErrLogAt = 0;
  /** Bir instansiyada bir xil (kalit, holat) o'tishini qayta-qayta yozmaslik (hajmi — provayderlar soni). */
  const lastBreaker = new Map<string, { to: BreakerState; at: number }>();

  const warn = (m: string) => {
    if (now() - lastErrLogAt < 60_000) return;
    lastErrLogAt = now();
    log(m);
  };

  async function flush(): Promise<void> {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (!metrics.size && !fo5m.size) return;
    const m = metrics;
    const f = fo5m;
    metrics = new Map();
    fo5m = new Map();
    pendingCount = 0;
    const t = now();
    const fields = Object.fromEntries(m);
    const jobs: Promise<void>[] = [];
    if (m.size) {
      jobs.push(deps.store.hincr(hourKey(utcHourKey(t)), fields, HOUR_TTL_MS));
      jobs.push(deps.store.hincr(dayKey(utcDayKey(t)), fields, DAY_TTL_MS));
    }
    for (const [bucket, fm] of f) jobs.push(deps.store.hincr(foBucketKey(bucket), Object.fromEntries(fm), FO_TTL_MS));
    const res = await Promise.allSettled(jobs);
    const bad = res.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
    if (bad) warn(`[ops] metric flush: ${bad.reason instanceof Error ? bad.reason.message : "error"}`);
  }

  function schedule() {
    if (pendingCount >= maxPending) {
      void flush().catch(() => undefined);
      return;
    }
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      void flush().catch(() => undefined);
    }, delay);
  }

  function addMetric(field: string, n: number) {
    if (!Number.isFinite(n) || n === 0) return;
    if (!metrics.has(field)) pendingCount++;
    metrics.set(field, (metrics.get(field) ?? 0) + n);
  }

  function push(ev: OpsEvent) {
    deps.store.push(ev).catch((e) => warn(`[ops] event push: ${e instanceof Error ? e.message : "error"}`));
  }

  return {
    metric(fields) {
      try {
        for (const [k, n] of Object.entries(fields)) addMetric(k.slice(0, 160), n);
        schedule();
      } catch {
        /* hech qachon otmaydi */
      }
    },
    failover(fi) {
      try {
        const field = failoverField(fi.from, reasonClass(fi.error), fi.to, fi.model);
        addMetric(field, 1);
        addMetric(`fo:${fi.surface}`, 1);
        const bucket = Math.floor(now() / FO_BUCKET_MS) * FO_BUCKET_MS;
        const bm = fo5m.get(bucket) ?? new Map<string, number>();
        if (!bm.has(field)) pendingCount++;
        bm.set(field, (bm.get(field) ?? 0) + 1);
        fo5m.set(bucket, bm);
        schedule();
      } catch {
        /* ignore */
      }
    },
    exhausted(error, surface) {
      try {
        addMetric(`ex|${reasonClass(error)}|${surface}`, 1);
        schedule();
      } catch {
        /* ignore */
      }
    },
    breaker(t) {
      try {
        const wire = t.wire && (t.wire === "$paid" || t.wire === "$free") ? t.wire : "";
        if (t.wire && !wire) return; // model kalitlari — shovqin, lentaga emas
        const key = `${safeId(t.provider)}:${wire}`;
        const prev = lastBreaker.get(key);
        if (prev && prev.to === t.to && t.at - prev.at < 60_000) return;
        lastBreaker.set(key, { to: t.to, at: t.at });
        if (lastBreaker.size > 200) lastBreaker.clear();
        push({
          id: `breaker:${key}:${t.to}:${Math.floor(t.at / 60_000)}`,
          t: t.at,
          type: "breaker",
          d: {
            provider: safeId(t.provider),
            label: providerLabel(t.provider),
            scope: wire,
            from: t.from,
            to: t.to,
            reason: t.to === "open" ? reasonClass({ kind: t.reason, timeout: t.timeout }) : null,
            until: typeof t.until === "number" && Number.isFinite(t.until) ? t.until : null,
            trips: typeof t.trips === "number" ? t.trips : null,
          },
        });
      } catch {
        /* ignore */
      }
    },
    event(ev) {
      try {
        push(ev);
      } catch {
        /* ignore */
      }
    },
    flush,
  };
}
