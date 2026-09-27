/**
 * Lokal test (tarmoqsiz): npx tsx --conditions=react-server src/lib/payments/dodo-activation.test.ts
 * Dodo webhook: metadata'ga ishonmaslik — tarif/davr/foydalanuvchi faqat buyurtmadan,
 * mahsulot va muddat faqat Dodo obunasidan; buyurtma bitta obunaga bog'lanadi.
 */
import assert from "node:assert/strict";
import { decideDodoActivation, revokeOrderMatches, type DodoOrderRow, type DodoPaidPlan, type DodoPeriod } from "./dodo-activation";

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ✗ ${name}\n    ${e instanceof Error ? e.message : e}`);
  }
}

const PRODUCTS: Record<DodoPeriod, Record<DodoPaidPlan, string>> = {
  month: { starter: "pdt_starter_m", pro: "pdt_pro_m", ultra: "pdt_ultra_m" },
  year: { starter: "pdt_starter_y", pro: "pdt_pro_y", ultra: "pdt_ultra_y" },
};
const expectedProductId = (plan: DodoPaidPlan, period: DodoPeriod) => PRODUCTS[period][plan];
const NOW = Date.parse("2026-09-27T00:00:00Z");
const DAY = 24 * 3600 * 1000;
const in30 = new Date(NOW + 30 * DAY).toISOString();

const order = (o: Partial<DodoOrderRow> = {}): DodoOrderRow => ({
  id: "sov_1",
  user_id: "user-a",
  plan: "starter",
  billing_period: "month",
  status: "pending",
  provider: "dodo",
  checkout_id: "cks_session",
  ...o,
});
const base = {
  metaUserId: "user-a",
  subscriptionId: "sub_1",
  paidProductId: "pdt_starter_m",
  nextBillingDate: in30,
  expectedProductId,
  now: NOW,
};

console.log("dodo-activation");

test("oddiy birinchi faollashuv: buyurtmadagi tarif, obunaga bog'lanadi", () => {
  const d = decideDodoActivation({ ...base, order: order() });
  assert.equal(d.ok, true);
  if (!d.ok) return;
  assert.equal(d.userId, "user-a");
  assert.equal(d.plan, "starter");
  assert.equal(d.bind, true);
  assert.equal(d.untilIso, new Date(NOW + 31 * DAY).toISOString());
});

test("buyurtmasiz (static link, metadata_plan=ultra) — rad", () => {
  const d = decideDodoActivation({ ...base, order: null, paidProductId: "pdt_starter_m" });
  assert.deepEqual(d, { ok: false, reason: "order_not_found" });
});

test("arzon mahsulot to'lanib, qimmat buyurtmaga ulansa — product_mismatch", () => {
  const d = decideDodoActivation({ ...base, order: order({ plan: "ultra", billing_period: "year" }), paidProductId: "pdt_starter_m" });
  assert.deepEqual(d, { ok: false, reason: "product_mismatch" });
});

test("oylik mahsulot, yillik buyurtma — product_mismatch", () => {
  const d = decideDodoActivation({ ...base, order: order({ billing_period: "year" }), paidProductId: "pdt_starter_m" });
  assert.deepEqual(d, { ok: false, reason: "product_mismatch" });
});

test("mahsulot noma'lum (payment.* obunasiz) — rad", () => {
  const d = decideDodoActivation({ ...base, order: order(), paidProductId: undefined });
  assert.equal(d.ok, false);
});

test("metadata user_id boshqa — user_mismatch", () => {
  const d = decideDodoActivation({ ...base, order: order(), metaUserId: "victim" });
  assert.deepEqual(d, { ok: false, reason: "user_mismatch" });
});

test("metadata user_id yo'q — buyurtma egasi olinadi", () => {
  const d = decideDodoActivation({ ...base, order: order(), metaUserId: null });
  assert.equal(d.ok && d.userId, "user-a");
});

test("boshqa provayder buyurtmasi — rad", () => {
  const d = decideDodoActivation({ ...base, order: order({ provider: "zenobank" }) });
  assert.deepEqual(d, { ok: false, reason: "wrong_provider" });
});

test("refunded / cancelled / review buyurtma — rad", () => {
  for (const status of ["refunded", "cancelled", "review", "expired"]) {
    const d = decideDodoActivation({ ...base, order: order({ status }) });
    assert.equal(d.ok, false, status);
  }
});

test("to'langan buyurtma boshqa obunadan — subscription_mismatch", () => {
  const d = decideDodoActivation({ ...base, order: order({ status: "paid", checkout_id: "sub_other" }) });
  assert.deepEqual(d, { ok: false, reason: "subscription_mismatch" });
});

test("to'langan buyurtma o'z obunasidan (renewal) — ok, bog'lash shart emas", () => {
  const d = decideDodoActivation({ ...base, order: order({ status: "paid", checkout_id: "sub_1" }) });
  assert.equal(d.ok, true);
  assert.equal(d.ok && d.bind, false);
});

test("obuna id'siz — rad", () => {
  const d = decideDodoActivation({ ...base, order: order(), subscriptionId: undefined });
  assert.deepEqual(d, { ok: false, reason: "no_subscription" });
});

test("next_billing_date yo'q — metadata period=year 366 kun bermaydi", () => {
  const d = decideDodoActivation({ ...base, order: order(), nextBillingDate: undefined });
  assert.deepEqual(d, { ok: false, reason: "no_next_billing_date" });
});

test("haddan uzoq next_billing_date — davr chegarasiga qisqaradi", () => {
  const far = new Date(NOW + 400 * DAY).toISOString();
  const m = decideDodoActivation({ ...base, order: order(), nextBillingDate: far });
  assert.equal(m.ok && m.untilIso, new Date(NOW + 33 * DAY).toISOString());
  const y = decideDodoActivation({ ...base, order: order({ billing_period: "year" }), paidProductId: "pdt_starter_y", nextBillingDate: far });
  assert.equal(y.ok && y.untilIso, new Date(NOW + 368 * DAY).toISOString());
});

test("yillik buyurtma to'g'ri mahsulot bilan — ok", () => {
  const d = decideDodoActivation({
    ...base,
    order: order({ plan: "ultra", billing_period: "year" }),
    paidProductId: "pdt_ultra_y",
    nextBillingDate: new Date(NOW + 365 * DAY).toISOString(),
  });
  assert.equal(d.ok && d.plan, "ultra");
  assert.equal(d.ok && d.period, "year");
});

test("o'tib ketgan sana — period_over", () => {
  const d = decideDodoActivation({ ...base, order: order(), nextBillingDate: new Date(NOW - 3 * DAY).toISOString() });
  assert.deepEqual(d, { ok: false, reason: "period_over" });
});

test("revokeOrderMatches: faqat Dodo va shu obunaga bog'langan buyurtma", () => {
  assert.equal(revokeOrderMatches({ provider: "dodo", checkout_id: "sub_1" }, "sub_1"), true);
  assert.equal(revokeOrderMatches({ provider: "dodo", checkout_id: "sub_2" }, "sub_1"), false);
  assert.equal(revokeOrderMatches({ provider: "zenobank", checkout_id: "sub_1" }, "sub_1"), false);
  assert.equal(revokeOrderMatches({ provider: "dodo", checkout_id: "cks_x" }, undefined), true);
  assert.equal(revokeOrderMatches(null, "sub_1"), false);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
