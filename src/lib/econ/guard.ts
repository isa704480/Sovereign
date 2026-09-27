/**
 * Byudjet guard'i — "paidRestricted" bayrog'i keshi. PURE (store/compute tashqaridan beriladi):
 * standart nusxa budget.server.ts da (Upstash + xotira). Test: npx tsx src/lib/econ/budget.test.ts
 *
 * Kesh: instansiya xotirasi (ttl) → umumiy store (Upstash, ttl) → compute (Supabase). So'rov
 * yo'lida (mesh) compute KUTILMAYDI: kesh bo'sh/eskirgan bo'lsa fonda bitta (singleflight)
 * yangilash boshlanadi va oxirgi ma'lum qiymat (yo'q bo'lsa false — so'rovni buzmaslik uchun)
 * qaytariladi. Cron va admin `refresh()` / `state({ wait: true })` bilan kutadi.
 *
 * Hisoblash xatosi: bitta xato — fail-open (oxirgi ma'lum qiymat yoki false). Lekin ketma-ket
 * `failClosedAfter` (3) xato `failWindowMs` (30 daqiqa) ichida bo'lsa — FAIL-CLOSED: pullik
 * yo'llar cheklanadi (paidRestricted = true), tekin yo'llar baribir ishlaydi. Bitta muvaffaqiyatli
 * hisob holatni tiklaydi. Xatodan keyin qayta urinish `retryBackoffMs` dan tez emas (bo'ronsiz).
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
  /** Shuncha ketma-ket hisoblash xatosidan keyin pullik yo'llar yopiladi. Standart 3. */
  failClosedAfter?: number;
  /** Xatolar shu oynada sanaladi. Standart 30 daqiqa. */
  failWindowMs?: number;
  /** Xatodan keyin fon qayta urinishi oralig'i. Standart 60 s. */
  retryBackoffMs?: number;
}

export interface BudgetGuard {
  /** So'rov yo'li uchun: hech qachon kutmaydi va otmaydi. */
  paidRestricted(): Promise<boolean>;
  /** Keshlangan holat; `wait` — bo'lmasa/eskirgan bo'lsa hisoblab kutadi. */
  state(opts?: { wait?: boolean }): Promise<BudgetState | null>;
  /** Majburiy qayta hisoblash (cron). Xato bo'lsa — null (oxirgi qiymat saqlanadi). */
  refresh(): Promise<BudgetState | null>;
  /** Ketma-ket xatolar tufayli fail-closed holatdami (pullik yo'llar yopiq). */
  failingClosed(): boolean;
}

export const GUARD_KEY = "budget:guard:v1";
export const GUARD_TTL_MS = 5 * 60_000;
export const GUARD_FAIL_CLOSED_AFTER = 3;
export const GUARD_FAIL_WINDOW_MS = 30 * 60_000;
export const GUARD_RETRY_BACKOFF_MS = 60_000;

export function createBudgetGuard(opts: BudgetGuardOptions): BudgetGuard {
  const now = opts.now ?? Date.now;
  const ttl = opts.ttlMs ?? GUARD_TTL_MS;
  const key = opts.key ?? GUARD_KEY;
  const log = opts.log ?? ((m: string) => console.warn(m));
  const failAfter = Math.max(1, opts.failClosedAfter ?? GUARD_FAIL_CLOSED_AFTER);
  const failWindow = opts.failWindowMs ?? GUARD_FAIL_WINDOW_MS;
  const backoff = opts.retryBackoffMs ?? GUARD_RETRY_BACKOFF_MS;
  let mem: BudgetState | null = null;
  let inflight: Promise<BudgetState | null> | null = null;
  /** Ketma-ket hisoblash xatolari vaqtlari (muvaffaqiyat tozalaydi). */
  let failures: number[] = [];
  let closedLogged = false;

  const fresh = (s: BudgetState | null): s is BudgetState => !!s && now() - s.at < ttl;
  const recentFailures = () => failures.filter((t) => now() - t < failWindow);
  const failingClosed = () => recentFailures().length >= failAfter;
  /** Oxirgi xatodan keyin backoff o'tdimi (fon yangilash uchun). */
  const mayRetry = () => !failures.length || now() - failures[failures.length - 1] >= backoff;

  function refresh(): Promise<BudgetState | null> {
    inflight ??= (async () => {
      try {
        const s = await opts.compute();
        mem = s;
        if (failures.length && closedLogged) log("[budget] guard compute recovered — fail-closed lifted");
        failures = [];
        closedLogged = false;
        try {
          await opts.store.set(key, JSON.stringify(s), ttl);
        } catch (e) {
          log(`[budget] guard store write failed: ${e instanceof Error ? e.message : String(e)}`);
        }
        return s;
      } catch (e) {
        log(`[budget] guard compute failed: ${e instanceof Error ? e.message : String(e)}`);
        failures = [...recentFailures(), now()];
        if (failingClosed() && !closedLogged) {
          closedLogged = true;
          log(`[budget] guard: ${failures.length} consecutive compute failures — paid routes restricted (fail-closed), free routes allowed`);
        }
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
        if (mayRetry()) void refresh();
        // Ketma-ket xatolar: pullik yo'llar yopiladi (tekin yo'llar bu bayroqdan ta'sirlanmaydi).
        if (failingClosed()) return true;
        return mem?.paidRestricted ?? false;
      } catch {
        return failingClosed();
      }
    },
    async state(o) {
      const s = await cached();
      if (s) return s;
      if (o?.wait) return (await refresh()) ?? mem;
      if (mayRetry()) void refresh();
      return mem;
    },
    refresh,
    failingClosed,
  };
}
