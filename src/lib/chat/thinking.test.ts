/**
 * Lokal test (tarmoqsiz, deterministik):
 *   npx tsx --conditions=react-server src/lib/chat/thinking.test.ts
 *
 * "O'ylab javob": tarif jadvali (Free rad etiladi, Basic/Pro/Ultra ruxsat), mijozdagi
 * bayroq ruxsat EMAS (server tarifni qayta tekshiradi), Free'da reasoning kesiladi,
 * davomiylik formati va mijoz tomonidagi hodisa yig'uvchisi.
 */
import assert from "node:assert/strict";
import { PLANS, PLAN_BY_ID, type PlanId } from "@/config/plans";
import {
  emptyThinking,
  finishThinking,
  forwardReasoning,
  planAllowsThinking,
  pushReasoning,
  resolveThinking,
  thinkingSeconds,
} from "./thinking";

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (e) {
    failed++;
    console.error(`✕ ${name}\n  ${(e as Error).message.split("\n").join("\n  ")}`);
  }
}

/* ------------------------------------------------------------------ */
/* Tarif jadvali                                                       */
/* ------------------------------------------------------------------ */

const EXPECTED: Record<PlanId, boolean> = { free: false, starter: true, pro: true, ultra: true };

test("tarif jadvali: free — yo'q, starter/pro/ultra — bor", () => {
  for (const [id, allowed] of Object.entries(EXPECTED) as [PlanId, boolean][]) {
    assert.equal(PLAN_BY_ID[id].limits.thinking, allowed, id);
    assert.equal(planAllowsThinking(PLAN_BY_ID[id]), allowed, id);
  }
});

test("har bir tarifda `thinking` bayrog'i aniq belgilangan (yangi tarif unutilmasin)", () => {
  for (const p of PLANS) assert.equal(typeof p.limits.thinking, "boolean", p.id);
  assert.equal(PLANS.length, Object.keys(EXPECTED).length);
});

test("o'ylash — pullik: free'dan boshqa hamma tarifda bor", () => {
  const paid = PLANS.filter((p) => p.price > 0);
  assert.ok(paid.length > 0);
  assert.ok(paid.every((p) => p.limits.thinking === true));
  assert.equal(PLAN_BY_ID.free.limits.thinking, false);
});

/* ------------------------------------------------------------------ */
/* Server: bayroq — so'rov, ruxsat emas                                */
/* ------------------------------------------------------------------ */

test("free: mijoz thinking=true yuborsa ham e'tiborsiz qoladi", () => {
  const d = resolveThinking(true, PLAN_BY_ID.free);
  assert.equal(d.enabled, false);
  assert.equal(d.allowed, false);
  // Marshrut ataylab tez (flash) modelga suriladi.
  assert.equal(d.preference, false);
});

test("free: so'ralmasa ham natija bir xil (har doim tez model)", () => {
  assert.deepEqual(resolveThinking(false, PLAN_BY_ID.free), resolveThinking(true, PLAN_BY_ID.free));
});

test("starter/pro/ultra: so'ralsa yoqiladi, so'ralmasa afzallik yo'q", () => {
  for (const id of ["starter", "pro", "ultra"] as const) {
    const on = resolveThinking(true, PLAN_BY_ID[id]);
    assert.deepEqual(on, { enabled: true, allowed: true, preference: true }, id);
    const off = resolveThinking(false, PLAN_BY_ID[id]);
    assert.deepEqual(off, { enabled: false, allowed: true, preference: undefined }, id);
  }
});

test("free uchun reasoning HECH QACHON uzatilmaydi (provayder o'zicha yuborsa ham)", () => {
  assert.equal(forwardReasoning(resolveThinking(false, PLAN_BY_ID.free)), false);
  assert.equal(forwardReasoning(resolveThinking(true, PLAN_BY_ID.free)), false);
});

test("pullik tarifda reasoning uzatiladi — chip o'chiq bo'lsa ham (model o'zi fikr yuborsa)", () => {
  assert.equal(forwardReasoning(resolveThinking(false, PLAN_BY_ID.starter)), true);
  assert.equal(forwardReasoning(resolveThinking(true, PLAN_BY_ID.pro)), true);
});

/** Route'dagi oqim halqasining aynan mantig'i: hisob har doim, uzatish faqat ruxsat bo'lsa. */
function streamReasoning(planId: PlanId, requested: boolean, chunks: string[]) {
  const think = resolveThinking(requested, PLAN_BY_ID[planId]);
  let billedOutChars = 0;
  const sent: string[] = [];
  for (const text of chunks) {
    billedOutChars += text.length;
    if (!forwardReasoning(think)) continue;
    sent.push(text);
  }
  return { billedOutChars, sent };
}

test("free: reasoning kesiladi, lekin tokenlari baribir hisobga yoziladi", () => {
  const r = streamReasoning("free", true, ["o'ylay", "yapman"]);
  assert.deepEqual(r.sent, []);
  assert.equal(r.billedOutChars, "o'ylayyapman".length);
});

test("pro: reasoning uzatiladi va hisobga yoziladi", () => {
  const r = streamReasoning("pro", true, ["o'ylay", "yapman"]);
  assert.deepEqual(r.sent, ["o'ylay", "yapman"]);
  assert.equal(r.billedOutChars, "o'ylayyapman".length);
});

/* ------------------------------------------------------------------ */
/* Davomiylik formati                                                  */
/* ------------------------------------------------------------------ */

test("thinkingSeconds: yaxlitlash va kamida 1 soniya", () => {
  assert.equal(thinkingSeconds(0), 0);
  assert.equal(thinkingSeconds(1), 1); // "0 soniya o'yladi" deb yozmaymiz
  assert.equal(thinkingSeconds(400), 1);
  assert.equal(thinkingSeconds(1500), 2);
  assert.equal(thinkingSeconds(2499), 2);
  assert.equal(thinkingSeconds(12_000), 12);
});

test("thinkingSeconds: yaroqsiz qiymat — 0 (sarlavha ko'rsatilmaydi)", () => {
  assert.equal(thinkingSeconds(undefined), 0);
  assert.equal(thinkingSeconds(null), 0);
  assert.equal(thinkingSeconds(-5), 0);
  assert.equal(thinkingSeconds(Number.NaN), 0);
  assert.equal(thinkingSeconds(Number.POSITIVE_INFINITY), 0);
});

/* ------------------------------------------------------------------ */
/* Mijoz: hodisalarni yig'ish                                          */
/* ------------------------------------------------------------------ */

test("reasoning hodisalari: matn qo'shiladi, vaqt birinchi bo'lakdan boshlanadi", () => {
  let acc = emptyThinking();
  assert.deepEqual(acc, { reasoning: "", startedAt: null });
  acc = pushReasoning(acc, "Avval ", 1_000);
  assert.equal(acc.startedAt, 1_000);
  assert.equal(acc.durationMs, 0);
  acc = pushReasoning(acc, "o'ylayman.", 4_200);
  assert.equal(acc.reasoning, "Avval o'ylayman.");
  assert.equal(acc.durationMs, 3_200);
  assert.equal(thinkingSeconds(acc.durationMs), 3);
});

test("bo'sh bo'lak holatni o'zgartirmaydi", () => {
  const acc = pushReasoning(emptyThinking(), "", 1_000);
  assert.deepEqual(acc, { reasoning: "", startedAt: null });
});

test("javob yozilgan vaqt o'ylash davomiyligiga qo'shilmaydi", () => {
  let acc = pushReasoning(emptyThinking(), "fikr", 1_000);
  acc = pushReasoning(acc, " davomi", 6_000);
  // Javob yana 30 soniya oqsa ham — "5 soniya o'yladi".
  acc = finishThinking(acc);
  assert.equal(acc.durationMs, 5_000);
  assert.equal(thinkingSeconds(acc.durationMs), 5);
});

test("reasoning umuman kelmasa — davomiylik yo'q (panel ko'rsatilmaydi)", () => {
  const acc = finishThinking(emptyThinking());
  assert.equal(acc.durationMs, undefined);
  assert.equal(acc.reasoning, "");
  assert.equal(thinkingSeconds(acc.durationMs), 0);
});

console.log(`${passed} o'tdi, ${failed} yiqildi`);
if (failed) process.exit(1);
