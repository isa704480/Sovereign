/**
 * Lokal test (tarmoqsiz): npx tsx src/lib/econ/budget.test.ts
 * Byudjet matematikasi (RUB konvertatsiya, yillik 1/12, floor, chegaralar), guard keshi,
 * alert qarori va kunlik dedupe, OpenRouter balansi, budget-watch cron himoyasi.
 */
import assert from "node:assert/strict";
import { alertKey, decideAlerts, fetchOpenRouterBalance, formatAlert, memoryDedupeStore, sendDeduped, type AlertId } from "./alerts";
import {
  budgetConfig,
  computeRevenue,
  evaluateBudget,
  monthWindow,
  spendFromEconomics,
  BUDGET_DEFAULTS,
  type BudgetState,
  type OrderRow,
} from "./budget";
import { handleBudgetWatch, type BudgetWatchDeps } from "./budget-watch";
import { createBudgetGuard, type GuardStore } from "./guard";
import type { UnitEconomics } from "./unit-economics";

let passed = 0;
let failed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ✗ ${name}\n    ${e instanceof Error ? e.message : e}`);
  }
}
const close = (a: number | null, b: number, eps = 1e-9) => assert.ok(a !== null && Math.abs(a - b) < eps, `${a} ≈ ${b}`);

const NOW = new Date("2026-09-27T12:00:00Z");
const cfg = BUDGET_DEFAULTS;

function state(p: Partial<BudgetState> & { revenueUsd: number; spendUsd: number }, at = NOW.getTime()): BudgetState {
  const ev = evaluateBudget(p.revenueUsd, p.spendUsd, cfg);
  return {
    ...ev,
    at,
    month: "2026-09",
    revenue: { usd: p.revenueUsd, orders: 1, yearlyAmortized: 0, rubOrders: 0, unconverted: 0, skipped: 0, rubPerUsd: null, rubRateSource: "none" },
    spend: { usd: p.spendUsd, freeTierAtListUsd: 0, pricedAnswers: 1, excludedAnswers: 0 },
    cfg,
    ...p,
  };
}

async function main() {
  console.log("budget math");

  await test("config: standart va env qiymatlari; yaroqsiz — standart; warn ≤ cap", () => {
    assert.deepEqual(budgetConfig({}), BUDGET_DEFAULTS);
    const c = budgetConfig({ BUDGET_WARN_RATIO: "0.3", BUDGET_CAP_RATIO: "0.6", BUDGET_MIN_MONTHLY_USD: "10", OPENROUTER_ALERT_USD: "7" });
    assert.deepEqual(c, { warnRatio: 0.3, capRatio: 0.6, minMonthlyUsd: 10, openrouterAlertUsd: 7 });
    assert.equal(budgetConfig({ BUDGET_CAP_RATIO: "abc" }).capRatio, 0.5);
    assert.equal(budgetConfig({ BUDGET_CAP_RATIO: "5" }).capRatio, 0.5);
    assert.equal(budgetConfig({ BUDGET_WARN_RATIO: "0.9", BUDGET_CAP_RATIO: "0.5" }).warnRatio, 0.5);
  });

  await test("monthWindow: UTC oy boshi va 11 oy orqaga", () => {
    const w = monthWindow(NOW);
    assert.equal(w.from, "2026-09-01");
    assert.equal(w.to, "2026-09-27");
    assert.equal(w.lookbackStart.toISOString(), "2025-10-01T00:00:00.000Z");
  });

  await test("daromad: USD + RUB (kurs bo'yicha) + yillik 1/12; o'tgan oy va kelajak hisoblanmaydi", () => {
    const orders: OrderRow[] = [
      { amount: "9.99", currency: "USD", paid_at: "2026-09-03T10:00:00Z" },
      { amount: "990.00", currency: "RUB", paid_at: "2026-09-10T10:00:00Z" },
      { amount: "120", currency: "USD", paid_at: "2026-03-15T10:00:00Z", billing_period: "year" },
      { amount: "5", currency: "USDT", paid_at: "2026-09-20T00:00:00Z" },
      { amount: "50", currency: "USD", paid_at: "2026-08-31T23:59:59Z" }, // o'tgan oy
      { amount: "240", currency: "USD", paid_at: "2025-09-15T00:00:00Z", billing_period: "year" }, // 12 oydan oldin
      { amount: "7", currency: "USD", paid_at: "2026-09-28T00:00:00Z" }, // kelajak
      { amount: "7", currency: "EUR", paid_at: "2026-09-05T00:00:00Z" }, // noma'lum valyuta
    ];
    const r = computeRevenue(orders, { now: NOW, rubPerUsd: 90, rubRateSource: "rollypay" });
    close(r.usd, 9.99 + 990 / 90 + 120 / 12 + 5);
    assert.equal(r.orders, 4);
    assert.equal(r.yearlyAmortized, 1);
    assert.equal(r.rubOrders, 1);
    assert.equal(r.skipped, 1);
    assert.equal(r.rubRateSource, "rollypay");
  });

  await test("daromad: kurs yo'q — RUB hisoblanmaydi (ehtiyotkor), unconverted'da", () => {
    const r = computeRevenue([{ amount: "990", currency: "RUB", paid_at: "2026-09-10T00:00:00Z" }], { now: NOW, rubPerUsd: null });
    assert.equal(r.usd, 0);
    assert.equal(r.unconverted, 1);
    assert.equal(r.rubRateSource, "none");
  });

  await test("sarf: ro'yxat narxidagi sarf − tekin tarif qismi", () => {
    const e = { priced: { costUsd: 10, answers: 100 }, freeTier: { costAtListUsd: 4 }, excluded: { answers: 3 } } as unknown as UnitEconomics;
    assert.deepEqual(spendFromEconomics(e), { usd: 6, freeTierAtListUsd: 4, pricedAnswers: 100, excludedAnswers: 3 });
    assert.equal(spendFromEconomics(null), null);
  });

  await test("floor: daromadsiz 1-oy — $5 gacha cheklov yo'q", () => {
    const a = evaluateBudget(0, 4.99, cfg);
    assert.equal(a.paidRestricted, false);
    assert.equal(a.ratio, null);
    assert.equal(a.allowanceUsd, 5);
    assert.equal(a.level, "warn"); // 4.99 ≥ 5 × 0.8
    const b = evaluateBudget(0, 5.01, cfg);
    assert.equal(b.paidRestricted, true);
    assert.equal(b.level, "cap");
  });

  await test("chegaralar: 40% — warn, 50% — cap (spend > floor)", () => {
    const ok = evaluateBudget(100, 30, cfg);
    assert.equal(ok.level, "ok");
    close(ok.ratio, 0.3);
    const warn = evaluateBudget(100, 40, cfg);
    assert.equal(warn.level, "warn");
    assert.equal(warn.paidRestricted, false);
    close(warn.warnAtUsd, 40);
    const cap = evaluateBudget(100, 50, cfg);
    assert.equal(cap.level, "cap");
    assert.equal(cap.paidRestricted, true);
    close(cap.allowanceUsd, 50);
    // ratio ≥ cap, lekin sarf floor'dan kichik — cheklov yo'q
    const small = evaluateBudget(4, 3, cfg);
    assert.equal(small.paidRestricted, false);
  });

  console.log("guard cache");

  function memStore(): GuardStore & { data: Map<string, string>; reads: number } {
    const data = new Map<string, string>();
    const s = {
      data,
      reads: 0,
      async get(k: string) {
        s.reads++;
        return data.get(k) ?? null;
      },
      async set(k: string, v: string) {
        data.set(k, v);
      },
    };
    return s;
  }

  await test("guard: birinchi so'rov kutmaydi (false), fonda hisoblaydi; TTL ichida compute qayta chaqirilmaydi", async () => {
    let t = NOW.getTime();
    let computes = 0;
    const store = memStore();
    const g = createBudgetGuard({
      store,
      now: () => t,
      compute: async () => {
        computes++;
        return state({ revenueUsd: 0, spendUsd: 10 }, t);
      },
      log: () => undefined,
    });
    assert.equal(await g.paidRestricted(), false); // hali hisoblanmagan — fail-open
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(computes, 1);
    assert.equal(await g.paidRestricted(), true);
    t += 4 * 60_000;
    assert.equal(await g.paidRestricted(), true);
    assert.equal(computes, 1);
    t += 2 * 60_000; // TTL (5 daqiqa) o'tdi — fonda yangilanadi, oxirgi qiymat qaytadi
    assert.equal(await g.paidRestricted(), true);
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(computes, 2);
  });

  await test("guard: boshqa instansiya store'dagi (Upstash) qiymatni oladi, compute'siz", async () => {
    const store = memStore();
    const a = createBudgetGuard({ store, compute: async () => state({ revenueUsd: 10, spendUsd: 9 }), now: () => NOW.getTime() });
    await a.refresh();
    let computes = 0;
    const b = createBudgetGuard({
      store,
      now: () => NOW.getTime() + 1000,
      compute: async () => {
        computes++;
        return state({ revenueUsd: 1000, spendUsd: 0 });
      },
    });
    assert.equal(await b.paidRestricted(), true);
    assert.equal(computes, 0);
  });

  await test("guard: compute xatosi — false (so'rov buzilmaydi), state({wait}) null", async () => {
    const g = createBudgetGuard({
      store: memStore(),
      compute: async () => {
        throw new Error("no supabase");
      },
      log: () => undefined,
    });
    assert.equal(await g.state({ wait: true }), null);
    assert.equal(await g.paidRestricted(), false);
  });

  await test("guard: store o'qish xatosi — xotira keshi ishlaydi", async () => {
    const g = createBudgetGuard({
      store: {
        get: async () => {
          throw new Error("redis down");
        },
        set: async () => {
          throw new Error("redis down");
        },
      },
      compute: async () => state({ revenueUsd: 0, spendUsd: 100 }),
      now: () => NOW.getTime(),
      log: () => undefined,
    });
    assert.ok(await g.refresh());
    assert.equal(await g.paidRestricted(), true);
  });

  console.log("alerts");

  await test("decideAlerts: past balans, warn, cap + guard_on/off o'tishlari", () => {
    const low = { balanceUsd: 2, source: "credits" as const };
    assert.deepEqual(decideAlerts({ state: state({ revenueUsd: 100, spendUsd: 10 }), prevRestricted: false, openrouter: low, openrouterAlertUsd: 3 }), ["openrouter_low"]);
    assert.deepEqual(decideAlerts({ state: state({ revenueUsd: 100, spendUsd: 45 }), prevRestricted: false, openrouter: null, openrouterAlertUsd: 3 }), ["warn"]);
    assert.deepEqual(decideAlerts({ state: state({ revenueUsd: 100, spendUsd: 60 }), prevRestricted: false, openrouter: null, openrouterAlertUsd: 3 }), ["guard_on", "cap"]);
    assert.deepEqual(decideAlerts({ state: state({ revenueUsd: 100, spendUsd: 60 }), prevRestricted: true, openrouter: null, openrouterAlertUsd: 3 }), ["cap"]);
    assert.deepEqual(decideAlerts({ state: state({ revenueUsd: 100, spendUsd: 10 }), prevRestricted: true, openrouter: null, openrouterAlertUsd: 3 }), ["guard_off"]);
    assert.deepEqual(decideAlerts({ state: null, prevRestricted: null, openrouter: { balanceUsd: null, source: "none" }, openrouterAlertUsd: 3 }), []);
  });

  await test("dedupe: har alert kuniga bir marta; yuborilmasa kalit bo'shatiladi", async () => {
    let t = NOW.getTime();
    const store = memoryDedupeStore(() => t);
    const sent: AlertId[] = [];
    let ok = true;
    const send = async (id: AlertId) => {
      sent.push(id);
      return ok;
    };
    let r = await sendDeduped(["cap", "openrouter_low"], { store, send, now: NOW });
    assert.deepEqual(r.map((x) => x.status), ["sent", "sent"]);
    r = await sendDeduped(["cap"], { store, send, now: NOW });
    assert.deepEqual(r.map((x) => x.status), ["deduped"]);
    ok = false;
    r = await sendDeduped(["warn"], { store, send, now: NOW });
    assert.deepEqual(r.map((x) => x.status), ["failed"]);
    ok = true;
    r = await sendDeduped(["warn"], { store, send, now: NOW });
    assert.deepEqual(r.map((x) => x.status), ["sent"]);
    // Ertasi kun — yangi kalit
    t += 26 * 3_600_000;
    const tomorrow = new Date(NOW.getTime() + 86_400_000);
    assert.notEqual(alertKey("cap", tomorrow), alertKey("cap", NOW));
    r = await sendDeduped(["cap"], { store, send, now: tomorrow });
    assert.deepEqual(r.map((x) => x.status), ["sent"]);
    assert.deepEqual(sent, ["cap", "openrouter_low", "warn", "warn", "cap"]);
  });

  await test("formatAlert: 4 tilda, raqamlar qo'yilgan", () => {
    const s = state({ revenueUsd: 100, spendUsd: 60 });
    for (const lang of ["uz", "uz-cyrl", "ru", "en"] as const) {
      const txt = formatAlert("cap", { state: s, openrouter: null, openrouterAlertUsd: 3 }, lang);
      assert.match(txt, /\$60\.00/);
      assert.match(txt, /\$50\.00/);
      assert.doesNotMatch(txt, /\{\w+\}/);
    }
  });

  await test("OpenRouter: /credits (total_credits − total_usage); rad etilsa /key limit_remaining", async () => {
    const calls: string[] = [];
    const ok = (async (u: string | URL | Request) => {
      calls.push(String(u));
      return new Response(JSON.stringify({ data: { total_credits: 20, total_usage: 17.5 } }), { status: 200 });
    }) as typeof fetch;
    const a = await fetchOpenRouterBalance(ok, { OPENROUTER_API_KEY: "k" });
    assert.equal(a.balanceUsd, 2.5);
    assert.equal(a.source, "credits");
    assert.match(calls[0], /\/api\/v1\/credits$/);

    const fb = (async (u: string | URL | Request) =>
      String(u).endsWith("/credits")
        ? new Response("{}", { status: 403 })
        : new Response(JSON.stringify({ data: { limit_remaining: 4, usage_monthly: 11 } }), { status: 200 })) as typeof fetch;
    const b = await fetchOpenRouterBalance(fb, { OPENROUTER_API_KEY: "k" });
    assert.equal(b.balanceUsd, 4);
    assert.equal(b.usageMonthlyUsd, 11);
    assert.equal(b.source, "key");

    const none = await fetchOpenRouterBalance(ok, {});
    assert.equal(none.source, "none");
  });

  console.log("cron auth");

  function watchDeps(p: Partial<BudgetWatchDeps> = {}): BudgetWatchDeps & { sent: AlertId[]; saved: boolean[] } {
    const sent: AlertId[] = [];
    const saved: boolean[] = [];
    return {
      sent,
      saved,
      cronSecret: "s3cret-value",
      cfg,
      now: () => NOW,
      refresh: async () => state({ revenueUsd: 100, spendUsd: 60 }),
      openrouter: async () => ({ balanceUsd: 10, source: "credits" }),
      prevRestricted: async () => false,
      savePrevRestricted: async (v) => void saved.push(v),
      dedupe: memoryDedupeStore(),
      channels: () => ({ telegram: true, email: false }),
      send: async (id) => {
        sent.push(id);
        return true;
      },
      log: () => undefined,
      ...p,
    };
  }
  const reqWith = (auth?: string, q = "") =>
    new Request(`https://x.test/api/cron/budget-watch${q}`, auth ? { headers: { authorization: auth } } : {});

  await test("cron: header yo'q / noto'g'ri / CRON_SECRET yo'q — 401, hech narsa hisoblanmaydi", async () => {
    let refreshed = 0;
    const d = watchDeps({
      refresh: async () => {
        refreshed++;
        return null;
      },
    });
    assert.equal((await handleBudgetWatch(reqWith(), d)).status, 401);
    assert.equal((await handleBudgetWatch(reqWith("Bearer wrong"), d)).status, 401);
    assert.equal((await handleBudgetWatch(reqWith("Bearer s3cret-value"), { ...d, cronSecret: undefined })).status, 401);
    assert.equal(refreshed, 0);
  });

  await test("cron: to'g'ri token — alertlar yuboriladi, holat saqlanadi; takror — dedupe", async () => {
    const d = watchDeps();
    const res = await handleBudgetWatch(reqWith("Bearer s3cret-value"), d);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { paidRestricted: boolean; alerts: { id: string; status: string }[] };
    assert.equal(body.paidRestricted, true);
    assert.deepEqual(d.sent, ["guard_on", "cap"]);
    assert.deepEqual(d.saved, [true]);
    const again = (await (await handleBudgetWatch(reqWith("Bearer s3cret-value"), d)).json()) as { alerts: { status: string }[] };
    assert.ok(again.alerts.every((a) => a.status === "deduped"));
  });

  await test("cron: ?dry=1 va kanal yo'q — yubormaydi (no-op)", async () => {
    const d = watchDeps();
    await handleBudgetWatch(reqWith("Bearer s3cret-value", "?dry=1"), d);
    assert.deepEqual(d.sent, []);
    assert.deepEqual(d.saved, []);
    const n = watchDeps({ channels: () => ({ telegram: false, email: false }) });
    const body = (await (await handleBudgetWatch(reqWith("Bearer s3cret-value"), n)).json()) as { alerts: { status: string }[] };
    assert.deepEqual(n.sent, []);
    assert.ok(body.alerts.every((a) => a.status === "skipped"));
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}

void main();
