/**
 * Lokal test (tarmoqsiz, bazasiz): npx tsx --conditions=react-server db/security-hardening.test.ts
 * 0038_security_hardening.sql'ning ilova bilan bog'liq doimiylari:
 *  - plan_month_tokens (SQL) === PLANS[].limits.tokensPerMonth (src/config/plans.ts);
 *  - "~over-quota" qatori unit economics'da narxlanmaydi (soxta sarf byudjetga kirmaydi),
 *    lekin "unpriced" sifatida ko'rinadi (admin uchun signal);
 *  - record_token_usage bitta chaqiruvda (kirish+chiqish) ilova bo'laklaridan (usage-chunks.ts) kam yozmaydi;
 *  - answer_cache_write chegaralari ilova chegaralaridan tor emas (halol yozuv tashlanmasin).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PLANS } from "../src/config/plans";
import { USAGE_RECORD_MAX } from "../src/lib/chat/usage-chunks";
import { computeUnitEconomics, lookupPrice, resolveServed, type UsageRow } from "../src/lib/econ/unit-economics";

const sql = readFileSync(join(process.cwd(), "supabase", "migrations", "0038_security_hardening.sql"), "utf8");

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (e) {
    failed++;
    console.error(`  FAIL ${name}\n       ${e instanceof Error ? e.message : e}`);
  }
}

/** plan_month_tokens funksiyasidagi `when 'x' then N` va `else N` qiymatlari. */
function sqlPlanTokens(): { byPlan: Record<string, number>; fallback: number } {
  const m = /function public\.plan_month_tokens[\s\S]*?\$\$([\s\S]*?)\$\$/.exec(sql);
  assert.ok(m, "plan_month_tokens topilmadi");
  const body = m[1];
  const byPlan: Record<string, number> = {};
  for (const w of body.matchAll(/when\s+'(\w+)'\s+then\s+(\d+)/g)) byPlan[w[1]] = Number(w[2]);
  const e = /else\s+(\d+)/.exec(body);
  assert.ok(e, "else qiymati topilmadi");
  return { byPlan, fallback: Number(e[1]) };
}

test("plan_month_tokens tariflar bilan bir xil", () => {
  const { byPlan, fallback } = sqlPlanTokens();
  for (const p of PLANS) {
    const got = p.id === "free" ? (byPlan.free ?? fallback) : byPlan[p.id];
    assert.equal(got, p.limits.tokensPerMonth, `${p.id}: SQL ${got} ≠ plans.ts ${p.limits.tokensPerMonth}`);
  }
  // Noma'lum tarif → free limiti (eng kichik).
  const free = PLANS.find((p) => p.id === "free");
  assert.equal(fallback, free?.limits.tokensPerMonth);
});

test("~over-quota narxlanmaydi, lekin unpriced'da ko'rinadi", () => {
  const served = resolveServed({ model: "~over-quota", provider: "", upstream_model: "" });
  assert.ok(served, "resolveServed null qaytardi — noModel'ga tushadi, signal yo'qoladi");
  assert.equal(lookupPrice(served.model, served.provider), null);
  for (const prov of ["", "openrouter", "groq", "anthropic", "cloudflare"]) {
    assert.equal(lookupPrice("~over-quota", prov), null, `provayder ${prov} bilan narx topildi`);
  }
  const rows: UsageRow[] = [
    { day: "2026-09-01", user_id: "u1", model: "~over-quota", provider: "", upstream_model: "", input_tokens: 100_000, output_tokens: 100_000, calls: 50 },
  ];
  const ue = computeUnitEconomics(rows, { from: "2026-09-01", to: "2026-09-30", servedColumns: true });
  assert.equal(ue.priced.costUsd, 0);
  assert.equal(ue.excluded.unpricedAnswers, 50);
});

test("record_token_usage sentinel SQL va test bir xil", () => {
  assert.match(sql, /v_model := '~over-quota';/);
});

test("record_token_usage bitta chaqiruv chegarasi ilova bo'laklari bilan bir xil (halol sarf kesilmaydi)", () => {
  const body = /function public\.record_token_usage\([\s\S]*?\$\$([\s\S]*?)\$\$/.exec(sql)?.[1] ?? "";
  const m = /if v_in \+ v_out > (\d+) then/.exec(body);
  assert.ok(m, "kirish+chiqish chegarasi topilmadi");
  assert.ok(Number(m[1]) >= USAGE_RECORD_MAX, `SQL ${m[1]} < usage-chunks ${USAGE_RECORD_MAX}`);
});

test("answer_cache_write chegaralari ilovadan (8000 / 500) tor emas", () => {
  const body = /function public\.answer_cache_write[\s\S]*?\$\$([\s\S]*?)\$\$/.exec(sql)?.[1] ?? "";
  const ans = /length\(p_answer\)\s*>\s*(\d+)/.exec(body);
  const q = /length\(p_query\)\s*>\s*(\d+)/.exec(body);
  assert.ok(ans && q, "uzunlik tekshiruvlari topilmadi");
  assert.ok(Number(ans[1]) >= 8000, "javob chegarasi src/lib/ai/cache.ts (8000) dan kichik");
  assert.ok(Number(q[1]) >= 500, "so'rov chegarasi src/lib/ai/cache.ts (500) dan kichik");
});

test("cli_gen_user_code alifbosi aniq 32 belgi (bias yo'q), chalkash belgilarsiz", () => {
  const a = /alphabet constant text := '([A-Z0-9]+)'/.exec(sql)?.[1] ?? "";
  assert.equal(a.length, 32);
  assert.equal(new Set(a).size, 32);
  for (const bad of ["0", "O", "1", "I"]) assert.ok(!a.includes(bad), `${bad} alifboda bor`);
});

console.log(`\n${passed} ok, ${failed} xato`);
if (failed) process.exitCode = 1;
