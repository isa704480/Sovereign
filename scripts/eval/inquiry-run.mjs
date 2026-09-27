#!/usr/bin/env node
/**
 * Chuqur so'rash (Deep Inquiry) eval — docs/INQUIRY.md §A.11.
 *
 *   npm run eval:inquiry                          # = --fixtures: saqlangan triage JSON → pre-gate + siyosat (API'siz, CI)
 *   npm run eval:inquiry -- --live                # haqiqiy provider mesh (triageDetailed), .env.local kalitlari bilan
 *   npm run eval:inquiry -- --live --record       # + natijani out/inquiry-<runId>.fixtures.jsonl ga yozadi
 *                                                 #   (ko'rib chiqib, qo'lda inquiry/fixtures.jsonl o'rniga qo'yish mumkin)
 *   npm run eval:inquiry -- --only=legal-fired-ru,fin-crypto-en --verbose
 *   npm run eval:inquiry -- --live --tier=pro --country=UZ --timeout=1200
 *   npm run eval:inquiry -- --no-write            # out/ ga natija yozilmaydi
 *
 * TS modullar tsx orqali yuklanadi: skript `tsx --conditions=react-server` bilan ishga tushadi
 * (package.json → "eval:inquiry"). `--live` da triage.ts "server-only" import qiladi — react-server sharti shart.
 *
 * Har holat uchun zanjir (route/CLI endpoint bilan bir xil):
 *   preGateDetail → (skip bo'lsa triage yo'q) → triage (fixture yoki mesh) → decide(ctx)
 * CLI/Cowork full-auto (§A.9): pre-gate `full_auto` → faqat blocking triage (gate="blocking", fullAuto=true).
 *
 * Metrikalar va maqsadlar (§A.11 jadvali) — oxirida jadval; biror o'lchanadigan maqsad bajarilmasa exit 1.
 * Latency faqat --live da (yoki fixture'da yozib olingan `latencyMs` bo'lsa) o'lchanadi — qo'lda yozilgan
 * fixture'larda raqam O'YLAB TOPILMAYDI ("n/a").
 *
 * Natija: scripts/eval/out/inquiry-<runId>.json (gitignored).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIR = join(ROOT, "scripts", "eval", "inquiry");
const OUT_DIR = join(ROOT, "scripts", "eval", "out");
const INQ = join(ROOT, "src", "lib", "ai", "inquiry");

// ── Argumentlar ───────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
};
const LIVE = flag("live");
if (LIVE && flag("fixtures")) {
  console.error("--live va --fixtures birga ishlatilmaydi.");
  process.exit(2);
}
const RECORD = flag("record");
const VERBOSE = flag("verbose") || flag("v");
const NO_WRITE = flag("no-write");
const ONLY = (opt("only") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const TIER = opt("tier") ?? "free";
const COUNTRY = opt("country") ?? "UZ";
const TIMEOUT = opt("timeout") ? Number(opt("timeout")) : undefined;
if (!["free", "starter", "pro", "ultra"].includes(TIER)) {
  console.error(`--tier noto'g'ri: ${TIER}`);
  process.exit(2);
}
if (TIMEOUT !== undefined && !(Number.isFinite(TIMEOUT) && TIMEOUT > 0)) {
  console.error("--timeout musbat son (ms) bo'lishi kerak.");
  process.exit(2);
}
if (RECORD && !LIVE) {
  console.error("--record faqat --live bilan ishlaydi.");
  process.exit(2);
}

// ── TS modullarni yuklash (tsx) ────────────────────────────────────────────

async function load(file) {
  try {
    return await import(pathToFileURL(join(INQ, file)).href);
  } catch (err) {
    console.error(
      `"${file}" yuklanmadi. Skriptni tsx bilan ishga tushiring: npm run eval:inquiry\n` +
        `(yoki: npx tsx --conditions=react-server scripts/eval/inquiry-run.mjs)\n` +
        String(err?.message ?? err).slice(0, 300),
    );
    process.exit(2);
  }
}

const { preGateDetail, decide } = await load("policy.ts");
const { parseTriage } = await load("sanitize.ts");
const { INQUIRY_TUNING, INQUIRY_DECISIONS } = await load("types.ts");
const { scriptDrift } = await import(pathToFileURL(join(ROOT, "src", "lib", "ai", "script-check.ts")).href);

// ── Ma'lumotlar ────────────────────────────────────────────────────────────

const LANGS = ["uz", "uz-cyrl", "ru", "en"];
const SURFACES = ["web", "cli", "cowork"];
const MODES = ["auto", "always", "off"];

function readJsonl(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .map((line, i) => ({ line: line.trim(), n: i + 1 }))
    .filter((x) => x.line)
    .map(({ line, n }) => {
      try {
        return JSON.parse(line);
      } catch (err) {
        throw new Error(`${path}:${n}: JSON xato — ${err.message}`);
      }
    });
}

/** cases.jsonl sxemasini tekshiradi; xatolar ro'yxatini qaytaradi. */
function validateCase(c) {
  const errs = [];
  if (!c.id || typeof c.id !== "string") errs.push("id yo'q");
  if (!LANGS.includes(c.lang)) errs.push(`lang: ${c.lang}`);
  if (!MODES.includes(c.mode)) errs.push(`mode: ${c.mode}`);
  if (!SURFACES.includes(c.surface)) errs.push(`surface: ${c.surface}`);
  if (!INQUIRY_DECISIONS.includes(c.expect)) errs.push(`expect: ${c.expect}`);
  if (!Array.isArray(c.messages) || c.messages.length === 0) errs.push("messages bo'sh");
  else {
    const last = c.messages[c.messages.length - 1];
    if (last?.role !== "user") errs.push("oxirgi xabar user emas");
    for (const m of c.messages) {
      if (!["user", "assistant"].includes(m?.role) || typeof m?.content !== "string") errs.push("xabar formati");
    }
  }
  for (const k of ["mustNotAskSlots", "mustAskSlots", "files", "askedSlots"]) {
    if (c[k] !== undefined && !(Array.isArray(c[k]) && c[k].every((s) => typeof s === "string"))) errs.push(`${k}: string[] emas`);
  }
  if (c.expectGate !== undefined && !["skip", "parallel", "blocking"].includes(c.expectGate)) errs.push(`expectGate: ${c.expectGate}`);
  return errs;
}

const allCases = readJsonl(join(DIR, "cases.jsonl"));
const fixtureList = readJsonl(join(DIR, "fixtures.jsonl"));
const fixtures = new Map(fixtureList.map((x) => [x.id, x]));

const problems = [];
const seen = new Set();
for (const c of allCases) {
  const e = validateCase(c);
  if (seen.has(c.id)) e.push("id takrorlangan");
  seen.add(c.id);
  if (e.length) problems.push(`${c.id ?? "?"}: ${e.join(", ")}`);
}
if (problems.length) {
  console.error("cases.jsonl yaroqsiz:\n  " + problems.join("\n  "));
  process.exit(2);
}
const cases = ONLY.length ? allCases.filter((c) => ONLY.includes(c.id)) : allCases;
if (ONLY.length && cases.length !== ONLY.length) {
  const missing = ONLY.filter((id) => !cases.some((c) => c.id === id));
  console.error(`--only: topilmadi: ${missing.join(", ")}`);
  process.exit(2);
}

// ── Yozuv (script) mosligi ─────────────────────────────────────────────────

const UZ_CYR = /[ўқғҳЎҚҒҲ]/u;
/** Inglizcha kartada o'zbekcha (lotin) drift belgisi: tez-tez uchraydigan o'zbek so'zlari. */
const UZ_LATN_MARK = /(?<![A-Za-z])(?:qanday|qaysi|necha|nima|bormi|qancha|uchun|bilan|yoki|kerak|sizning|qachon)(?![A-Za-z])/iu;

function letterCounts(text) {
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  const cyr = (text.match(/[Ѐ-ӿ]/gu) ?? []).length;
  return { latin, cyr };
}

/**
 * Karta matni (savol + nega + variantlar + taxminlar) foydalanuvchi tili/yozuvidami.
 * Qoidalar: uz/en — lotin, uz-cyrl/ru — kirill (begona yozuv ulushi ≤ 20% — brend nomlari uchun joy);
 * uz-cyrl kartasida ≥ 60 kirill harf bo'lsa ў/қ/ғ/ҳ bo'lishi shart (ruscha drift);
 * ru kartasida ў/қ/ғ/ҳ bo'lmasligi; en kartasida o'zbekcha o'/g' bo'lmasligi;
 * qo'shimcha: src/lib/ai/script-check.ts → scriptDrift(userText, cardText) null bo'lishi.
 */
function scriptCheck(lang, userText, parts) {
  const text = parts.filter(Boolean).join("\n");
  if (!text.trim()) return { ok: true };
  const { latin, cyr } = letterCounts(text);
  const total = latin + cyr;
  const wantCyr = lang === "uz-cyrl" || lang === "ru";
  const foreign = wantCyr ? latin : cyr;
  if (total >= 3 && foreign / total > 0.2) return { ok: false, why: `yozuv: ${wantCyr ? "lotin" : "kirill"} ${Math.round((foreign / total) * 100)}%` };
  if (lang === "uz-cyrl" && cyr >= 60 && !UZ_CYR.test(text)) return { ok: false, why: "uz-cyrl o'rniga ruscha" };
  if (lang === "ru" && UZ_CYR.test(text)) return { ok: false, why: "ru kartasida o'zbek kirill harflari" };
  if (lang === "en" && UZ_LATN_MARK.test(text)) return { ok: false, why: "en kartasida o'zbekcha" };
  const drift = scriptDrift(userText, text);
  if (drift) return { ok: false, why: `scriptDrift: ${drift.kind}` };
  return { ok: true };
}

// ── Triage manbalari ───────────────────────────────────────────────────────

let triageDetailed = null;
if (LIVE) {
  const envFile = join(ROOT, ".env.local");
  if (existsSync(envFile)) {
    try {
      process.loadEnvFile(envFile); // qiymatlar hech qachon chop etilmaydi
    } catch (err) {
      console.warn(".env.local o'qilmadi:", String(err?.message ?? err).slice(0, 120));
    }
  }
  ({ triageDetailed } = await load("triage.ts"));
}

/** Fixture → {result, error?, model, latencyMs} (mesh natijasi bilan bir xil shakl). */
function fromFixture(c) {
  const fx = fixtures.get(c.id);
  if (!fx) return { result: null, error: "missing_fixture", model: null, latencyMs: null, responded: false };
  if (fx.raw === null || fx.raw === undefined) {
    // yozib olingan live muvaffaqiyatsizlik (timeout/mesh) — javob kelmagan
    return { result: null, error: fx.error ?? "no_response", model: fx.model ?? null, latencyMs: fx.latencyMs ?? null, responded: false };
  }
  const result = parseTriage(fx.raw);
  return {
    result,
    error: result ? undefined : "parse",
    model: fx.model ?? null,
    latencyMs: typeof fx.latencyMs === "number" ? fx.latencyMs : null,
    responded: true,
  };
}

async function fromLive(c, gate, history, text) {
  const out = await triageDetailed({
    text,
    history,
    lang: c.lang,
    gate,
    planTier: TIER,
    country: COUNTRY,
    memoryText: c.memory,
    fileNames: c.files,
    askedSlots: c.askedSlots,
    surface: c.surface,
    agentMode: c.agentMode ?? (c.surface === "web" ? undefined : "chat"),
    fullAuto: !!c.fullAuto,
    context: c.context,
    ...(TIMEOUT ? { timeoutMs: TIMEOUT } : {}),
  });
  // responded: model javob berdi (JSON yaroqliligi shu to'plamda o'lchanadi)
  const responded = !!out.result || out.error === "parse";
  return { result: out.result, error: out.error, model: out.model, provider: out.provider, latencyMs: out.latencyMs, usage: out.usage, responded };
}

// ── Bitta holat ────────────────────────────────────────────────────────────

async function runCase(c) {
  const text = c.messages[c.messages.length - 1].content;
  const history = c.messages.slice(0, -1);
  const userTexts = c.messages.filter((m) => m.role === "user").map((m) => m.content);
  const fullAuto = !!c.fullAuto && c.surface !== "web";
  const pg = preGateDetail({
    text,
    mode: c.mode,
    skip: !!c.skip,
    recentSkips: c.recentSkips ?? 0,
    round: c.round ?? 0,
    isFirstMessage: userTexts.length === 1,
    surface: c.surface,
    fullAuto,
  });
  // §A.9: full-auto'da pre-gate "skip" (odatiy savol yo'q), lekin CLI endpoint faqat `blocking` ni tekshiradi.
  const gate = pg.reason === "full_auto" ? "blocking" : pg.gate;
  const triageCalled = gate !== "skip";

  let tri = { result: null, error: undefined, model: null, latencyMs: null, responded: false };
  if (triageCalled) tri = LIVE ? await fromLive(c, gate, history, text) : fromFixture(c);

  const knownText = [...userTexts, c.memory ?? "", c.context ?? ""].filter(Boolean).join("\n");
  const fd = decide(tri.result, {
    mode: c.mode,
    gate,
    round: c.round ?? 0,
    knownText,
    fileNames: c.files,
    askedSlots: c.askedSlots,
    emergency: pg.emergency,
    fullAuto,
  });

  const slots = fd.questions.map((q) => q.slot);
  const redundant = (c.mustNotAskSlots ?? []).filter((s) => slots.includes(s));
  const missingMust = (c.mustAskSlots ?? []).filter((s) => !slots.includes(s));
  const cardParts = [...fd.questions.flatMap((q) => [q.text, q.why, ...q.options]), ...(fd.decision === "ask" ? fd.assumptions : [])];
  const script = fd.questions.length ? scriptCheck(c.lang, text, cardParts) : { ok: true, na: true };

  const failures = [];
  if (fd.decision !== c.expect) failures.push(`qaror ${fd.decision} ≠ ${c.expect}`);
  if (c.expectGate && pg.gate !== c.expectGate) failures.push(`gate ${pg.gate} ≠ ${c.expectGate}`);
  if (c.expectBlocking !== undefined && fd.blocking !== c.expectBlocking) failures.push(`blocking ${fd.blocking} ≠ ${c.expectBlocking}`);
  if (c.expectEmergency && (!fd.emergency || fd.questions.length)) failures.push("emergency: savolsiz EMERGENCY_FIRST kutilgan");
  if (redundant.length) failures.push(`qayta so'raldi: ${redundant.join(",")}`);
  if (fd.decision === "ask" && missingMust.length) failures.push(`so'ralmadi: ${missingMust.join(",")}`);
  if (!script.ok) failures.push(script.why);
  if (triageCalled && !LIVE && tri.error === "missing_fixture") failures.push("fixture yo'q");

  return {
    id: c.id,
    lang: c.lang,
    domain: c.domain ?? tri.result?.domain ?? "?",
    surface: c.surface,
    mode: c.mode,
    expect: c.expect,
    got: fd.decision,
    gate: pg.gate,
    gateReason: pg.reason,
    triageGate: gate,
    triageCalled,
    triageError: tri.error ?? null,
    responded: tri.responded,
    parsed: !!tri.result,
    model: tri.model ?? null,
    provider: tri.provider ?? null,
    latencyMs: tri.latencyMs,
    usage: tri.usage ?? null,
    reason: fd.reason,
    stakes: fd.stakes,
    clarity: fd.clarity,
    emergency: fd.emergency,
    expectEmergency: !!c.expectEmergency,
    blocking: fd.blocking,
    questions: fd.questions.map((q) => ({ slot: q.slot, text: q.text, critical: q.critical, kind: q.kind, options: q.options })),
    nDedupDropped: fd.nDedupDropped,
    nSafetyDropped: fd.nSafetyDropped,
    mustNotAskSlots: c.mustNotAskSlots ?? [],
    mustAskSlots: c.mustAskSlots ?? [],
    redundant,
    missingMust,
    script: script.na ? "n/a" : script.ok ? "ok" : script.why,
    pass: failures.length === 0,
    failures,
    // --record uchun (fixture qatori)
    _raw: tri.result,
  };
}

// ── Metrikalar ─────────────────────────────────────────────────────────────

function percentile(values, p) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1));
  return s[idx];
}
const ratio = (num, den) => (den > 0 ? num / den : null);

function metrics(rows) {
  const predAsk = rows.filter((r) => r.got === "ask");
  const expAsk = rows.filter((r) => r.expect === "ask");
  const tp = predAsk.filter((r) => r.expect === "ask").length;
  const shouldAnswer = rows.filter((r) => r.expect === "answer");
  const greetings = rows.filter((r) => r.domain === "trivial");
  const withMustNot = rows.filter((r) => r.mustNotAskSlots.length > 0);
  const emergencies = rows.filter((r) => r.expectEmergency || r.emergency);
  const withQuestions = rows.filter((r) => r.questions.length > 0);
  const responded = rows.filter((r) => r.triageCalled && r.responded);
  const lat = rows.filter((r) => r.triageCalled && typeof r.latencyMs === "number").map((r) => r.latencyMs);
  const mustAskTotal = expAsk.reduce((n, r) => n + r.mustAskSlots.length, 0);
  const mustAskHit = expAsk.reduce((n, r) => n + r.mustAskSlots.filter((s) => r.questions.some((q) => q.slot === s)).length, 0);
  const questionsShown = withMustNot.reduce((n, r) => n + r.questions.length, 0);
  const redundantQs = withMustNot.reduce((n, r) => n + r.redundant.length, 0);

  const confusion = {};
  for (const e of INQUIRY_DECISIONS) {
    confusion[e] = {};
    for (const g of INQUIRY_DECISIONS) confusion[e][g] = rows.filter((r) => r.expect === e && r.got === g).length;
  }
  const byDomain = {};
  for (const r of rows) {
    byDomain[r.domain] ??= { n: 0, ok: 0 };
    byDomain[r.domain].n++;
    if (r.got === r.expect) byDomain[r.domain].ok++;
  }

  return {
    n: rows.length,
    passed: rows.filter((r) => r.pass).length,
    decisionAccuracy: ratio(rows.filter((r) => r.got === r.expect).length, rows.length),
    askPrecision: ratio(tp, predAsk.length),
    askRecall: ratio(tp, expAsk.length),
    askCounts: { predicted: predAsk.length, expected: expAsk.length, truePositive: tp },
    falseAskRate: ratio(shouldAnswer.filter((r) => r.got === "ask").length, shouldAnswer.length),
    greetingAsk: greetings.filter((r) => r.got === "ask" || r.questions.length > 0).length,
    greetingTriageCalls: greetings.filter((r) => r.triageCalled).length,
    redundantCaseRate: ratio(withMustNot.filter((r) => r.redundant.length > 0).length, withMustNot.length),
    redundantQuestionRate: ratio(redundantQs, questionsShown),
    mustNotCases: withMustNot.length,
    emergencyQuestions: emergencies.filter((r) => r.questions.length > 0).length,
    emergencyCases: emergencies.length,
    jsonValidity: ratio(responded.filter((r) => r.parsed).length, responded.length),
    triageCalls: rows.filter((r) => r.triageCalled).length,
    triageResponded: responded.length,
    triageFailOpen: rows.filter((r) => r.triageCalled && !r.parsed).length,
    scriptOk: ratio(withQuestions.filter((r) => r.script === "ok").length, withQuestions.length),
    casesWithQuestions: withQuestions.length,
    mustAskCoverage: ratio(mustAskHit, mustAskTotal),
    latencyP50: percentile(lat, 50),
    latencyP95: percentile(lat, 95),
    latencySamples: lat.length,
    dedupDropped: rows.reduce((n, r) => n + r.nDedupDropped, 0),
    safetyDropped: rows.reduce((n, r) => n + r.nSafetyDropped, 0),
    gates: rows.reduce((m, r) => ((m[r.gate] = (m[r.gate] ?? 0) + 1), m), {}),
    confusion,
    byDomain,
  };
}

/** §A.11 maqsadlari. `value === null` → o'lchanmadi (n/a) — muvaffaqiyatsizlik hisoblanmaydi. */
function targets(m) {
  return [
    { name: "ask precision", value: m.askPrecision, target: "≥ 0.85", ok: (v) => v >= 0.85 },
    { name: "ask recall (should-ask)", value: m.askRecall, target: "≥ 0.80", ok: (v) => v >= 0.8 },
    { name: "should-answer'da noto'g'ri ask", value: m.falseAskRate, target: "≤ 5%", ok: (v) => v <= 0.05, pct: true },
    { name: "salomlashishda ask", value: m.greetingAsk, target: "0", ok: (v) => v === 0, int: true },
    { name: "salomlashishda triage chaqiruvi", value: m.greetingTriageCalls, target: "0", ok: (v) => v === 0, int: true },
    { name: "redundant savol (mustNotAskSlots)", value: m.redundantCaseRate, target: "≤ 3%", ok: (v) => v <= 0.03, pct: true },
    { name: "emergency holatda savol", value: m.emergencyQuestions, target: "0", ok: (v) => v === 0, int: true },
    { name: "JSON/zod yaroqliligi", value: m.jsonValidity, target: "≥ 98%", ok: (v) => v >= 0.98, pct: true },
    { name: "savol tili/yozuvi (scriptDrift)", value: m.scriptOk, target: "100%", ok: (v) => v === 1, pct: true },
    { name: "triage latency p50", value: m.latencyP50, target: "≤ 400 ms", ok: (v) => v <= 400, ms: true },
    {
      name: "triage latency p95",
      value: m.latencyP95,
      target: `≤ ${INQUIRY_TUNING.triageTimeoutMs.blocking} ms`,
      ok: (v) => v <= INQUIRY_TUNING.triageTimeoutMs.blocking,
      ms: true,
    },
  ].map((t) => ({ ...t, status: t.value === null ? "n/a" : t.ok(t.value) ? "PASS" : "FAIL" }));
}

function fmt(t) {
  if (t.value === null) return "n/a";
  if (t.int) return String(t.value);
  if (t.ms) return `${Math.round(t.value)} ms`;
  if (t.pct) return `${(t.value * 100).toFixed(1)}%`;
  return t.value.toFixed(3);
}

// ── Asosiy ─────────────────────────────────────────────────────────────────

const runId = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
console.log(
  `Inquiry eval · ${LIVE ? `LIVE (mesh, tier=${TIER}, country=${COUNTRY})` : "FIXTURES (API'siz)"} · ${cases.length} holat · run ${runId}`,
);
if (!LIVE) {
  const missing = cases.filter((c) => !fixtures.has(c.id)).map((c) => c.id);
  if (missing.length && VERBOSE) console.log(`fixture'siz holatlar (triage chaqirilmasligi kutiladi): ${missing.join(", ")}`);
}

const rows = [];
for (const c of cases) {
  const r = await runCase(c);
  rows.push(r);
  const mark = r.pass ? "ok  " : "FAIL";
  const lat = LIVE && r.triageCalled ? ` ${r.latencyMs ?? "?"}ms${r.model ? ` ${r.model}` : ""}${r.triageError ? ` [${r.triageError}]` : ""}` : "";
  const qs = r.questions.length ? ` q=[${r.questions.map((q) => q.slot).join(",")}]` : "";
  console.log(
    `${mark} ${r.id.padEnd(28)} ${r.lang.padEnd(7)} gate=${r.gate.padEnd(8)} ${r.expect.padEnd(15)} → ${r.got.padEnd(15)}${qs}${lat}` +
      (r.pass ? "" : `  ← ${r.failures.join("; ")}`),
  );
  if (VERBOSE) {
    console.log(`       reason=${r.reason} stakes=${r.stakes} clarity=${r.clarity} dedup=${r.nDedupDropped} safety=${r.nSafetyDropped} script=${r.script}`);
    for (const q of r.questions) console.log(`       - [${q.slot}${q.critical ? "*" : ""}] ${q.text}`);
  }
}

const m = metrics(rows);
const ts = targets(m);

console.log("\nQaror matritsasi (qator = kutilgan, ustun = olingan):");
console.log(`  ${"".padEnd(16)}${INQUIRY_DECISIONS.map((d) => d.padStart(16)).join("")}`);
for (const e of INQUIRY_DECISIONS) {
  console.log(`  ${e.padEnd(16)}${INQUIRY_DECISIONS.map((g) => String(m.confusion[e][g]).padStart(16)).join("")}`);
}
console.log(
  "\nDomen bo'yicha qaror aniqligi: " +
    Object.entries(m.byDomain)
      .map(([d, v]) => `${d} ${v.ok}/${v.n}`)
      .join(" · "),
);
console.log(
  `Pre-gate: ${Object.entries(m.gates).map(([g, n]) => `${g} ${n}`).join(" · ")} · triage chaqiruvi ${m.triageCalls} ` +
    `(javob ${m.triageResponded}, fail-open ${m.triageFailOpen}) · dedup tashladi ${m.dedupDropped} · xavfsizlik filtri tashladi ${m.safetyDropped}`,
);
console.log(
  `Holatlar: ${m.passed}/${m.n} o'tdi · qaror aniqligi ${(m.decisionAccuracy * 100).toFixed(1)}% · ` +
    `ask ${m.askCounts.truePositive}/${m.askCounts.predicted} (kutilgan ${m.askCounts.expected}) · ` +
    `mustAskSlots qamrovi ${m.mustAskCoverage === null ? "n/a" : `${(m.mustAskCoverage * 100).toFixed(1)}%`} · ` +
    `redundant savollar ${m.redundantQuestionRate === null ? "n/a" : `${(m.redundantQuestionRate * 100).toFixed(1)}%`} (${m.mustNotCases} holat)`,
);

console.log("\nMetrika                               Qiymat        Maqsad        Holat");
for (const t of ts) console.log(`  ${t.name.padEnd(36)}${fmt(t).padEnd(14)}${t.target.padEnd(14)}${t.status}`);
if (!LIVE && m.latencySamples === 0) console.log("  (latency: fixture'larda yozib olingan qiymat yo'q — faqat --live o'lchaydi)");
if (!LIVE) {
  console.log(
    "  Eslatma: --fixtures siyosat/dedup/sanitizer/pre-gate zanjirini tekshiradi; model sifati (JSON, til, slot tanlovi) — faqat --live.",
  );
}

if (!NO_WRITE) {
  mkdirSync(OUT_DIR, { recursive: true });
  const file = join(OUT_DIR, `inquiry-${runId}.json`);
  const clean = rows.map((r) => {
    const copy = { ...r };
    delete copy._raw;
    return copy;
  });
  const summary = ts.map((t) => ({ name: t.name, value: t.value, target: t.target, status: t.status }));
  writeFileSync(
    file,
    JSON.stringify(
      { runId, mode: LIVE ? "live" : "fixtures", tier: LIVE ? TIER : null, country: LIVE ? COUNTRY : null, metrics: m, targets: summary, cases: clean },
      null,
      2,
    ),
  );
  console.log(`\nNatija: ${file}`);
  if (RECORD) {
    const fxFile = join(OUT_DIR, `inquiry-${runId}.fixtures.jsonl`);
    const lines = rows
      .filter((r) => r.triageCalled)
      .map((r) =>
        JSON.stringify({
          id: r.id,
          // parse xatosi: model javob berdi, lekin yaroqsiz — JSON yaroqliligi hisobida qolishi uchun belgi
          raw: r._raw ? JSON.stringify(r._raw) : r.triageError === "parse" ? "<unparseable model output>" : null,
          ...(r._raw ? {} : { error: r.triageError ?? "no_response" }),
          model: r.model,
          latencyMs: r.latencyMs,
          source: `live ${runId}`,
        }),
      );
    writeFileSync(fxFile, lines.join("\n") + "\n");
    console.log(`Fixture yozuvi: ${fxFile}`);
  }
}

const failed = ts.filter((t) => t.status === "FAIL");
if (failed.length) {
  console.log(`\nMaqsaddan o'tmadi: ${failed.map((t) => t.name).join(", ")}`);
  process.exit(1);
}
