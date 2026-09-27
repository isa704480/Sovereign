/**
 * Inquiry telemetriyasi — qator quruvchi (pure qism) va fail-silent yozuvchi:
 *   npx tsx --conditions=react-server src/lib/ai/inquiry/telemetry.test.ts
 * Tekshiriladi: xom matn / user_id bazaga tushmaydi, whitelist, chegaralar, AC-6 (triage null → answer),
 * Supabase sozlanmagan bo'lsa recordInquiry/setInquiryOutcome tashlamaydi.
 */
import assert from "node:assert/strict";
import { decide } from "./policy";
import { buildInquiryRow, recordInquiry, setInquiryOutcome, type InquiryTelemetryInput } from "./telemetry";

let passed = 0;
let failed = 0;
const pending: Promise<void>[] = [];
function test(name: string, fn: () => void | Promise<void>) {
  const run = async () => {
    try {
      await fn();
      passed++;
    } catch (e) {
      failed++;
      console.error(`✕ ${name}\n  ${(e as Error).message.split("\n").join("\n  ")}`);
    }
  };
  pending.push(run());
}

const ID = "3f1c2a9e-8b7d-4c6e-9a5b-1d2e3f4a5b6c";
const base: InquiryTelemetryInput = {
  id: ID,
  surface: "web",
  mode: "auto",
  gate: "blocking",
  decision: {
    decision: "ask",
    decisionLlm: "ask",
    domain: "legal",
    stakes: "high",
    clarity: 0.3456,
    round: 1,
    nQuestions: 3,
    nCritical: 2,
    nDedupDropped: 1,
    nSafetyDropped: 0,
  },
  lang: "uz-cyrl",
  triageModel: "groq/llama-3.1-8b-instant",
  latencyMs: 412.7,
};

const COLUMNS = [
  "id",
  "surface",
  "mode",
  "gate",
  "domain",
  "stakes",
  "clarity",
  "decision_llm",
  "decision_final",
  "n_questions",
  "n_critical",
  "n_dedup_dropped",
  "n_safety_dropped",
  "round",
  "lang",
  "triage_model",
  "latency_ms",
].sort();

test("to'g'ri kirish → aniq ustunlar, matn yo'q, user_id yo'q", () => {
  const row = buildInquiryRow(base);
  assert.ok(row);
  assert.deepEqual(Object.keys(row).sort(), COLUMNS);
  assert.equal(row.clarity, 0.346);
  assert.equal(row.latency_ms, 413);
  assert.equal(row.lang, "uz-cyrl");
  assert.equal(row.triage_model, "groq/llama-3.1-8b-instant");
  assert.ok(!("user_id" in row));
});

test("FinalDecision'dagi matn maydonlari (goal, questions, assumptions) qatorga tushmaydi", () => {
  const d = decide(
    {
      domain: "legal",
      stakes: "high",
      clarity: 0.2,
      goal: "MAXFIY-GOAL ishdan bo'shatildim",
      missing_facts: [{ slot: "jurisdiction", critical: true, question: "MAXFIY-Q Qaysi mamlakatda?", why: "Qonun farq qiladi" }],
      hidden_assumptions: ["MAXFIY-A"],
      risks: ["MAXFIY-R"],
      decision: "ask",
    },
    { mode: "auto", gate: "blocking", round: 0 },
  );
  const row = buildInquiryRow({ ...base, decision: d as InquiryTelemetryInput["decision"] });
  assert.ok(row);
  assert.deepEqual(Object.keys(row).sort(), COLUMNS);
  assert.ok(!JSON.stringify(row).includes("MAXFIY"));
});

test("AC-6: triage null → decision_final=answer, decision_llm=null", () => {
  const d = decide(null, { mode: "auto", gate: "blocking" });
  const row = buildInquiryRow({ ...base, decision: d, triageModel: null, latencyMs: 1200 });
  assert.ok(row);
  assert.equal(row.decision_final, "answer");
  assert.equal(row.decision_llm, null);
  assert.equal(row.triage_model, null);
});

test("yaroqsiz id / surface / mode / gate / decision → null (yozilmaydi)", () => {
  assert.equal(buildInquiryRow({ ...base, id: "not-a-uuid" }), null);
  assert.equal(buildInquiryRow({ ...base, surface: "email" as never }), null);
  assert.equal(buildInquiryRow({ ...base, mode: "loud" as never }), null);
  assert.equal(buildInquiryRow({ ...base, gate: "maybe" as never }), null);
  assert.equal(buildInquiryRow({ ...base, decision: { ...base.decision, decision: "refuse" as never } }), null);
  assert.equal(buildInquiryRow(null as never), null);
});

test("matn o'tkazib yuborilsa — whitelist uni null qiladi", () => {
  const row = buildInquiryRow({
    ...base,
    lang: "Mening ismim Ali, telefonim +998901234567",
    triageModel: "model with spaces and secrets sk-123",
    decision: { ...base.decision, domain: "ishdan bo'shatildim" as never, stakes: "juda" as never, decisionLlm: "ha" as never },
  });
  assert.ok(row);
  assert.equal(row.lang, null);
  assert.equal(row.triage_model, null);
  assert.equal(row.domain, null);
  assert.equal(row.stakes, null);
  assert.equal(row.decision_llm, null);
});

test("sonlar chegaralanadi (clarity 0..1, n 0..20, round 1..5, latency 0..600000)", () => {
  const row = buildInquiryRow({
    ...base,
    latencyMs: -5,
    decision: { ...base.decision, clarity: 7, nQuestions: 999, nCritical: -3, nDedupDropped: Number.NaN, round: 0 },
  });
  assert.ok(row);
  assert.equal(row.clarity, 1);
  assert.equal(row.n_questions, 20);
  assert.equal(row.n_critical, 0);
  assert.equal(row.n_dedup_dropped, 0);
  assert.equal(row.round, 1);
  assert.equal(row.latency_ms, 0);
  const row2 = buildInquiryRow({ ...base, latencyMs: Infinity, decision: { ...base.decision, clarity: Number.NaN, round: 9 } });
  assert.equal(row2?.latency_ms, null);
  assert.equal(row2?.clarity, null);
  assert.equal(row2?.round, 5);
});

test("id kichik harfga keltiriladi; Cloudflare model id'si qabul qilinadi", () => {
  const row = buildInquiryRow({ ...base, id: ID.toUpperCase(), triageModel: "@cf/meta/llama-3.1-8b-instruct" });
  assert.equal(row?.id, ID);
  assert.equal(row?.triage_model, "@cf/meta/llama-3.1-8b-instruct");
});

test("fail-silent: Supabase sozlanmagan bo'lsa false, tashlamaydi", async () => {
  const saved = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    assert.equal(await recordInquiry(base), false);
    assert.equal(await setInquiryOutcome(ID, "answered"), false);
    assert.equal(await setInquiryOutcome("bad", "answered"), false);
    assert.equal(await setInquiryOutcome(ID, "exploded" as never), false);
  } finally {
    if (saved.key !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = saved.key;
  }
});

test("INQUIRY_TELEMETRY=off — hech narsa yozilmaydi", async () => {
  process.env.INQUIRY_TELEMETRY = "off";
  try {
    assert.equal(await recordInquiry(base), false);
  } finally {
    delete process.env.INQUIRY_TELEMETRY;
  }
});

void Promise.all(pending).then(() => {
  console.log(`\ntelemetry: ${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
});
