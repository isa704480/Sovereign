/**
 * Byudjet guard'i — "paidRestricted" bayrog'i keshi. PURE (store/compute tashqaridan beriladi):
 * standart nusxa budget.server.ts da (Upstash + xotira). Test: npx tsx src/lib/econ/budget.test.ts
 *
 * Kesh: instansiya xotirasi (ttl) → umumiy store (Upstash, ttl) → compute (Supabase). So'rov
 * yo'lida (mesh) compute KUTILMAYDI: kesh bo'sh/eskirgan bo'lsa fonda bitta (singleflight)
 * yangilash boshlanadi va oxirgi ma'lum qiymat (yo'q bo'lsa false — so'rovni buzmaslik uchun)
 * qaytariladi. Cron va admin `refresh()` / `state({ wait: true })` bilan kutadi.
 */
import { parseBudgetState, type BudgetState } from "./budget";

export interface GuardStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlMs: number): Promise<void>;
}

export interface BudgetGuardOptions {
  store: GuardStore;
  compute(): Promise<BudgetState>;
  now?: () => number;
  /** Standart 5 daqiqa. */
  ttlMs?: number;
  key?: string;
  log?: (msg: string) => void;
}

export interface BudgetGuard {
  /** So'rov yo'li uchun: hech qachon kutmaydi va otmaydi. */
  paidRestricted(): Promise<boolean>;
  /** Keshlangan holat; `wait` — bo'lmasa/eskirgan bo'lsa hisoblab kutadi. */
  state(opts?: { wait?: boolean }): Promise<BudgetState | null>;
  /** Majburiy qayta hisoblash (cron). Xato bo'lsa — null (oxirgi qiymat saqlanadi). */
  refresh(): Promise<BudgetState | null>;
}

export const GUARD_KEY = "budget:guard:v1";
export const GUARD_TTL_MS = 5 * 60_000;

export function createBudgetGuard(opts: BudgetGuardOptions): BudgetGuard {
  const now = opts.now ?? Date.now;
  const ttl = opts.ttlMs ?? GUARD_TTL_MS;
  const key = opts.key ?? GUARD_KEY;
  const log = opts.log ?? ((m: string) => console.warn(m));
  let mem: BudgetState | null = null;
  let inflight: Promise<BudgetState | null> | null = null;

  const fresh = (s: BudgetState | null): s is BudgetState => !!s && now() - s.at < ttl;

  function refresh(): Promise<BudgetState | null> {
    inflight ??= (async () => {
      try {
        const s = await opts.compute();
        mem = s;
        try {
          await opts.store.set(key, JSON.stringify(s), ttl);
        } catch (e) {
          log(`[budget] guard store write failed: ${e instanceof Error ? e.message : String(e)}`);
        }
        return s;
      } catch (e) {
        log(`[budget] guard compute failed: ${e instanceof Error ? e.message : String(e)}`);
        return null;
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  }

  async function cached(): Promise<BudgetState | null> {
    if (fresh(mem)) return mem;
    try {
      const s = parseBudgetState(await opts.store.get(key));
      if (fresh(s)) {
        mem = s;
        return s;
      }
    } catch (e) {
      log(`[budget] guard store read failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    return null;
  }

  return {
    async paidRestricted() {
      try {
        const s = await cached();
        if (s) return s.paidRestricted;
        void refresh();
        return mem?.paidRestricted ?? false;
      } catch {
        return false;
      }
    },
    async state(o) {
      const s = await cached();
      if (s) return s;
      if (o?.wait) return (await refresh()) ?? mem;
      void refresh();
      return mem;
    },
    refresh,
  };
}
