import "server-only";
import { Redis } from "@upstash/redis";
import { createOpsRecorder, type BreakerTransition, type FailoverInfo, type OpsRecorder } from "./recorder";
import { EVENTS_MAX, memoryOpsStore, parseEvent, upstashOpsStore, type OpsEvent, type OpsStore, type RedisLike } from "./store";

/**
 * Ops yozuvchisi va omborining jarayon bo'yicha yagona instansiyasi (lazily — import paytida
 * env o'qilmaydi, tarmoq ochilmaydi). Mesh (health.ts, execute.ts) bu modulni DINAMIK import qiladi.
 *
 * Ombor tanlovi:
 *   1) UPSTASH_REDIS_REST_URL + _TOKEN → Upstash (asosiy, barcha instansiyalar uchun umumiy);
 *      OPS_EVENTS_TABLE=1 bo'lsa hodisalar Supabase ops_events jadvaliga ham (0043) nusxalanadi;
 *   2) Upstash yo'q, SUPABASE_SERVICE_ROLE_KEY bor → hodisalar ops_events jadvalida (0043),
 *      hisoblagichlar/dedupe instansiya xotirasida;
 *   3) hech biri yo'q → faqat xotira + log (yo'qolishi mumkin).
 */

let store: OpsStore | null = null;
let recorder: OpsRecorder | null = null;
let warnedTable = false;

function tableEvents(): Pick<OpsStore, "push" | "recent"> {
  const sb = async () => (await import("@/lib/supabase/service")).createServiceClient();
  const warn = (m: string) => {
    if (warnedTable) return;
    warnedTable = true;
    console.warn(`[ops] ops_events jadvali: ${m} (0043 migratsiyasi qo'llanmaganmi?)`);
  };
  return {
    async push(ev) {
      try {
        const { error } = await (await sb())
          .from("ops_events")
          .upsert({ id: ev.id, t: new Date(ev.t).toISOString(), type: ev.type, d: ev.d }, { onConflict: "id", ignoreDuplicates: true });
        if (error) warn(error.message);
      } catch (e) {
        warn(e instanceof Error ? e.message : "error");
      }
    },
    async recent(limit) {
      try {
        const { data, error } = await (await sb())
          .from("ops_events")
          .select("id,t,type,d")
          .order("t", { ascending: false })
          .limit(Math.max(1, Math.min(limit, EVENTS_MAX)));
        if (error) {
          warn(error.message);
          return [];
        }
        return (data ?? [])
          .map((r) => parseEvent({ id: r.id, t: Date.parse(String(r.t)), type: r.type, d: r.d }))
          .filter((e): e is OpsEvent => !!e);
      } catch (e) {
        warn(e instanceof Error ? e.message : "error");
        return [];
      }
    },
  };
}

export function opsStore(): OpsStore {
  if (store) return store;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  const hasTable = !!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (url && token) {
    try {
      const up = upstashOpsStore(new Redis({ url, token, automaticDeserialization: false, retry: false }) as unknown as RedisLike);
      if (hasTable && process.env.OPS_EVENTS_TABLE === "1") {
        const table = tableEvents();
        store = {
          ...up,
          kind: "upstash+table",
          async push(ev) {
            await Promise.allSettled([up.push(ev), table.push(ev)]);
          },
        };
      } else {
        store = up;
      }
      return store;
    } catch {
      /* xotiraga tushamiz */
    }
  }
  const mem = memoryOpsStore();
  if (hasTable) {
    const table = tableEvents();
    store = {
      ...mem,
      kind: "memory+table",
      async push(ev) {
        await Promise.allSettled([mem.push(ev), table.push(ev)]);
      },
      recent: (limit) => table.recent(limit),
    };
  } else {
    console.warn("[ops] Upstash va Supabase service key yo'q — ops hodisalari faqat instansiya xotirasida");
    store = mem;
  }
  return store;
}

export function opsRecorder(): OpsRecorder {
  recorder ??= createOpsRecorder({ store: opsStore() });
  return recorder;
}

/* Qisqa, hech qachon otmaydigan kirish nuqtalari (so'rov yo'lida await QILINMAYDI). */
export function recordBreaker(t: BreakerTransition): void {
  opsRecorder().breaker(t);
}
export function recordFailover(f: FailoverInfo): void {
  opsRecorder().failover(f);
}
export function recordExhausted(error: { kind?: string; timeout?: boolean } | null | undefined, surface: "web" | "cli"): void {
  opsRecorder().exhausted(error, surface);
}
export function bumpOps(fields: Record<string, number>): void {
  opsRecorder().metric(fields);
}
export function recordOpsEvent(ev: OpsEvent): void {
  opsRecorder().event(ev);
}
