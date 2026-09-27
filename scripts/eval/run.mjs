#!/usr/bin/env node
/**
 * SOVEREIGN model-compare eval harness.
 *
 *   node scripts/eval/run.mjs                 # hamma modellar, 40 vazifa, 1 run
 *   node scripts/eval/run.mjs --self-test     # coding testlarini referens yechimlar bilan tekshirish (API chaqiruvsiz)
 *   node scripts/eval/run.mjs --models=claude-opus-4-8,qwen3-8-27b --only=js-roman,math-dice
 *   node scripts/eval/run.mjs --budget=5      # USD (OpenRouter list narxida), oshsa to'xtaydi (standart 5)
 *   node scripts/eval/run.mjs --no-write      # src/data/model-compare.json yozilmaydi
 *   node scripts/eval/run.mjs --regrade=<runId>  # API'siz: out/<runId> javoblarini joriy baholovchi bilan qayta baholash
 *
 * Modellar ilova ishlatadigan YO'LLAR orqali chaqiriladi (src/lib/ai/providers.ts):
 *   openrouter — streamOpenRouter: https://openrouter.ai/api/v1, OPENROUTER_API_KEY, providerModel id,
 *                xuddi shu HTTP-Referer / X-Title sarlavhalari
 *   rsi        — rsiRoute(): RSI_BASE_URL + RSI_API_KEY (ilova Opus 5/4.8, Fable'ni shu orqali yuboradi)
 *   groq       — DIRECT_ROUTES provayderi: api.groq.com, GROQ_API_KEY
 *   omniroute  — omniCatalogRoute(): OMNIROUTE_BASE_URL + OMNIROUTE_API_KEY, katalog id
 * Har model uchun yo'llar tartib bilan "probe" qilinadi (to'liq max_tokens bilan kichik so'rov);
 * birinchi haqiqiy javob bergan yo'l ishlatiladi. Hech biri ishlamasa — model "o'lchanmagan"
 * deb yoziladi (raqam O'YLAB TOPILMAYDI).
 *
 * Xom javoblar: scripts/eval/out/<runId>/*.jsonl (gitignored).
 * Xulosa: src/data/model-compare.json (`public` bo'limi saqlanadi — qo'lda to'ldiriladi).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { TASKS, CATEGORIES } from "./tasks.mjs";
import { runTests, extractCode } from "./sandbox.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT_JSON = join(ROOT, "src", "data", "model-compare.json");
const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

/**
 * O'lchanadigan modellar — src/config/models.ts katalogidagi `providerModel` id'lari.
 * `id` — narx uchun OpenRouter katalog id'si; `routes` — tartib bilan sinaladigan yo'llar.
 * Reference (solishtirish asosi) — ro'yxatdagi birinchi O'LCHANGAN Claude.
 */
export const MODELS = [
  { key: "claude-opus-5", id: "anthropic/claude-opus-5", label: "Claude Opus 5", family: "claude",
    routes: [{ via: "openrouter", model: "anthropic/claude-opus-5" }, { via: "rsi", model: "claude-opus-5" }] },
  { key: "claude-sonnet-5", id: "anthropic/claude-sonnet-5", label: "Claude Sonnet 5", family: "claude",
    routes: [{ via: "openrouter", model: "anthropic/claude-sonnet-5" }] },
  { key: "claude-opus-4-8", id: "anthropic/claude-opus-4.8", label: "Claude Opus 4.8", family: "claude",
    routes: [{ via: "openrouter", model: "anthropic/claude-opus-4.8" }, { via: "rsi", model: "claude-opus-4-8" }] },
  { key: "deepseek-v4-pro", id: "deepseek/deepseek-v4-pro-0813", label: "DeepSeek V4 Pro", family: "deepseek",
    routes: [
      { via: "openrouter", model: "deepseek/deepseek-v4-pro-0813" },
      { via: "omniroute", model: "openrouter/deepseek/deepseek-v4-pro-0813" },
      { via: "omniroute", model: "cfp/deepseek-ai/deepseek-v4-pro-0813" },
    ] },
  { key: "deepseek-v4-1-flash", id: "deepseek/deepseek-v4.1-flash", label: "DeepSeek V4.1 Flash", family: "deepseek",
    routes: [{ via: "openrouter", model: "deepseek/deepseek-v4.1-flash" }, { via: "omniroute", model: "openrouter/deepseek/deepseek-v4.1-flash" }] },
  { key: "qwen3-8-max", id: "qwen/qwen3.8-max-0902", label: "Qwen 3.8 Max", family: "qwen",
    routes: [{ via: "openrouter", model: "qwen/qwen3.8-max-0902" }, { via: "omniroute", model: "openrouter/qwen/qwen3.8-max-0902" }] },
  { key: "qwen3-8-27b", id: "qwen/qwen3.8-27b", label: "Qwen 3.8 27B", family: "qwen",
    routes: [{ via: "openrouter", model: "qwen/qwen3.8-27b" }, { via: "groq", model: "qwen/qwen3.8-27b" }] },
];

const MAX_TOKENS = 8000;
const REQUEST_TIMEOUT_MS = 180_000;
/** Groq bepul tarifida TPM cheklovi bor — ketma-ket. */
const CONCURRENCY = { openrouter: 3, rsi: 3, omniroute: 2, groq: 1 };

/* ------------------------------------------------------------------ */
/* CLI / env                                                            */
/* ------------------------------------------------------------------ */

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name) => argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");

function loadEnv() {
  for (const f of [".env.local", ".env"]) {
    const p = join(ROOT, f);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

function endpoint(via) {
  const trim = (s) => (s ?? "").replace(/\/$/, "");
  if (via === "openrouter") return process.env.OPENROUTER_API_KEY ? { base: OPENROUTER_BASE, key: process.env.OPENROUTER_API_KEY } : null;
  if (via === "rsi") return process.env.RSI_BASE_URL && process.env.RSI_API_KEY ? { base: trim(process.env.RSI_BASE_URL), key: process.env.RSI_API_KEY } : null;
  if (via === "groq") return process.env.GROQ_API_KEY ? { base: "https://api.groq.com/openai/v1", key: process.env.GROQ_API_KEY } : null;
  if (via === "omniroute") return process.env.OMNIROUTE_BASE_URL && process.env.OMNIROUTE_API_KEY ? { base: trim(process.env.OMNIROUTE_BASE_URL), key: process.env.OMNIROUTE_API_KEY } : null;
  return null;
}

/* ------------------------------------------------------------------ */
/* Self-test                                                            */
/* ------------------------------------------------------------------ */

async function selfTest() {
  let bad = 0;
  for (const t of TASKS.filter((x) => x.category === "coding")) {
    const r = await runTests(t, t.reference);
    console.log(`${r.pass ? "OK  " : "FAIL"} ${t.id} ${r.passed}/${r.total} ${r.pass ? "" : r.reason}`);
    if (!r.pass) bad++;
    // Salbiy nazorat: bo'sh funksiya o'tmasligi kerak.
    const stub = t.runtime === "py" ? `def ${t.fn}(*a):\n    return None` : `function ${t.fn}(){ return null; }`;
    const s = await runTests(t, stub);
    if (s.pass) {
      console.log(`FAIL ${t.id}: stub passed — testlar juda zaif`);
      bad++;
    }
  }
  const counts = Object.fromEntries(CATEGORIES.map((c) => [c, TASKS.filter((t) => t.category === c).length]));
  console.log(`\nVazifalar: ${TASKS.length}`, counts);
  process.exit(bad ? 1 : 0);
}

/* ------------------------------------------------------------------ */
/* API                                                                  */
/* ------------------------------------------------------------------ */

async function fetchCatalog() {
  const r = await fetch(`${OPENROUTER_BASE}/models`);
  if (!r.ok) throw new Error(`models ${r.status}`);
  const j = await r.json();
  return new Map(j.data.map((m) => [m.id, m]));
}

/** Ilova bilan bir xil so'rov shakli (streamOpenRouter): OpenAI chat-completions, stream. */
async function callModel(route, prompt, { temperature, maxTokens = MAX_TOKENS }) {
  const ep = endpoint(route.via);
  const body = {
    model: route.model,
    messages: [{ role: "user", content: prompt }],
    max_tokens: maxTokens,
    stream: true,
  };
  if (route.via === "openrouter") body.usage = { include: true };
  else body.stream_options = { include_usage: true };
  if (temperature != null) body.temperature = temperature;
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${ep.key}` };
  if (route.via === "openrouter") {
    headers["HTTP-Referer"] = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    headers["X-Title"] = "SOVEREIGN AI";
  }
  const t0 = performance.now();
  const res = await fetch(`${ep.base}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok || !res.body) {
    const txt = await res.text().catch(() => "");
    const e = new Error(`HTTP ${res.status}: ${txt.slice(0, 200)}`);
    e.status = res.status;
    e.retryAfter = Number(res.headers.get("retry-after")) || null;
    throw e;
  }
  let text = "";
  let ttft = null;
  let usage = null;
  let provider = null;
  let served = null;
  let finish = null;
  let buf = "";
  const dec = new TextDecoder();
  for await (const chunk of res.body) {
    buf += dec.decode(chunk, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") continue;
      let c;
      try {
        c = JSON.parse(data);
      } catch {
        continue;
      }
      if (c.error) throw new Error(`stream error: ${JSON.stringify(c.error).slice(0, 200)}`);
      provider ??= c.provider ?? null;
      served ??= c.model ?? null;
      const d = c.choices?.[0]?.delta?.content;
      if (d) {
        if (ttft == null) ttft = performance.now() - t0;
        text += d;
      }
      if (c.choices?.[0]?.finish_reason) finish = c.choices[0].finish_reason;
      if (c.usage) usage = c.usage;
      if (c.x_groq?.usage) usage = c.x_groq.usage;
    }
  }
  return { text, latencyMs: Math.round(performance.now() - t0), ttftMs: ttft == null ? null : Math.round(ttft), usage, provider: provider ?? route.via, served, finish };
}

async function callWithRetry(route, prompt, opts) {
  let last;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await callModel(route, prompt, opts);
    } catch (e) {
      last = e;
      if (e.status && e.status < 500 && e.status !== 429) break; // 4xx — qayta urinish befoyda
      const wait = e.status === 429 ? Math.max((e.retryAfter ?? 0) * 1000, 8000 * (attempt + 1)) : 2000 * (attempt + 1);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw last;
}

/** Yo'lni sinaydi: to'liq max_tokens bilan (kredit yetishini ham tekshiradi), javob bo'sh bo'lmasligi shart. */
async function probe(route) {
  if (!endpoint(route.via)) return { ok: false, reason: `${route.via}: env key missing` };
  try {
    const r = await callWithRetry(route, "Reply with exactly one word: ready", { temperature: 0 });
    if (!r.text.trim()) return { ok: false, reason: `${route.via}: empty response (0 output tokens)` };
    return { ok: true, served: r.served };
  } catch (e) {
    return { ok: false, reason: `${route.via}: ${String(e.message).replace(/\s+/g, " ").slice(0, 140)}` };
  }
}

/* ------------------------------------------------------------------ */
/* Grading                                                              */
/* ------------------------------------------------------------------ */

async function grade(task, text) {
  if (task.category === "coding") return runTests(task, extractCode(text, task.runtime));
  try {
    return task.grade(text);
  } catch (e) {
    return { pass: false, reason: `grader: ${e.message}` };
  }
}

/* ------------------------------------------------------------------ */
/* Main                                                                 */
/* ------------------------------------------------------------------ */

const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};
const round = (x, d = 4) => (x == null || Number.isNaN(x) ? null : Math.round(x * 10 ** d) / 10 ** d);

async function main() {
  loadEnv();
  if (flag("self-test")) return selfTest();
  if (opt("regrade")) return regrade(opt("regrade"));

  const budget = Number(opt("budget") ?? 5);
  const onlyModels = opt("models")?.split(",");
  const onlyTasks = opt("only")?.split(",");
  const models = MODELS.filter((m) => !onlyModels || onlyModels.includes(m.key)).map((m) => ({ ...m }));
  const tasks = TASKS.filter((t) => !onlyTasks || onlyTasks.includes(t.id));

  const catalog = await fetchCatalog();
  const runId = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outDir = join(ROOT, "scripts", "eval", "out", runId);
  mkdirSync(outDir, { recursive: true });

  /* ---- route probing ---- */
  await Promise.all(
    models.map(async (m) => {
      const info = catalog.get(m.id);
      const priceIn = Number(info?.pricing?.prompt ?? NaN);
      const priceOut = Number(info?.pricing?.completion ?? NaN);
      m.pricing = info ? { inputPerM: round(priceIn * 1e6, 3), outputPerM: round(priceOut * 1e6, 3), source: "OpenRouter list price" } : null;
      m.priceIn = priceIn;
      m.priceOut = priceOut;
      m.probeLog = [];
      for (const route of m.routes) {
        const p = await probe(route);
        m.probeLog.push(p.ok ? `${route.via}: ok` : p.reason);
        if (p.ok) {
          m.route = route;
          m.servedAs = p.served;
          break;
        }
      }
      const supportsTemp = route0SupportsTemp(m, info);
      m.temperature = supportsTemp ? 0 : null;
      console.log(`[probe] ${m.key}: ${m.route ? `${m.route.via} (${m.route.model}) served=${m.servedAs}` : "NOT MEASURED"} — ${m.probeLog.join(" | ")}`);
    }),
  );

  function route0SupportsTemp(m, info) {
    // OpenRouter katalogi temperature'ni qo'llamasa yubormaymiz; boshqa yo'llarda 0 yuboriladi.
    if (m.route?.via === "openrouter") return (info?.supported_parameters ?? []).includes("temperature");
    return true;
  }

  let spent = 0;
  let stopped = null;
  const results = new Map(models.map((m) => [m.key, []]));

  async function runModel(model) {
    if (!model.route) return;
    const queue = [...tasks];
    async function worker() {
      while (queue.length) {
        if (spent > budget) {
          stopped ??= `budget $${budget} exceeded`;
          return;
        }
        const task = queue.shift();
        let row;
        try {
          const r = await callWithRetry(model.route, task.prompt, { temperature: model.temperature });
          const u = r.usage ?? {};
          const pt = u.prompt_tokens ?? u.input_tokens ?? 0;
          const ct = u.completion_tokens ?? u.output_tokens ?? 0;
          const listCost = pt * model.priceIn + ct * model.priceOut;
          const cost = Number.isFinite(listCost) ? listCost : 0;
          spent += cost;
          const g = await grade(task, r.text);
          row = {
            task: task.id, category: task.category, lang: task.lang, pass: g.pass, reason: g.reason,
            passed: g.passed, total: g.total,
            latencyMs: r.latencyMs, ttftMs: r.ttftMs, finish: r.finish, provider: r.provider, served: r.served,
            promptTokens: pt, completionTokens: ct,
            reasoningTokens: u.completion_tokens_details?.reasoning_tokens ?? null,
            costUsd: cost,
            billedUsd: typeof u.cost === "number" ? u.cost : null,
            response: r.text,
          };
        } catch (e) {
          row = { task: task.id, category: task.category, lang: task.lang, pass: false, error: String(e.message ?? e).slice(0, 300) };
        }
        results.get(model.key).push(row);
        appendFileSync(join(outDir, `${model.key}.jsonl`), JSON.stringify(row) + "\n");
        console.log(`[${model.key}] ${row.pass ? "PASS" : "fail"} ${task.id} ${row.latencyMs ?? "-"}ms $${(row.costUsd ?? 0).toFixed(5)} ${row.pass ? "" : row.error ?? row.reason ?? ""} | total $${spent.toFixed(3)}`);
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY[model.route.via] ?? 2 }, worker));
  }

  await Promise.all(models.map(runModel));
  writeSummary({ models, results, tasks, spent, stopped, runId, outDir });
}

/**
 * --regrade=<runId>: API chaqirmasdan, saqlangan xom javoblarni joriy baholovchilar bilan
 * qayta baholaydi (baholovchidagi xato tuzatilganda). Model/yo'l ma'lumoti o'sha run'ning summary.json dan.
 */
async function regrade(runId) {
  const outDir = join(ROOT, "scripts", "eval", "out", runId);
  const prevSummary = JSON.parse(readFileSync(join(outDir, "summary.json"), "utf8"));
  const tasks = TASKS.filter((t) => prevSummary.tasks.some((x) => x.id === t.id));
  const models = prevSummary.models.map((m) => ({
    key: m.key, id: m.id, label: m.label, family: m.family,
    route: m.route ? { via: m.route.via, model: m.route.model } : null, servedAs: m.route?.servedAs ?? null,
    pricing: m.pricing, temperature: m.temperature === "provider default" ? null : m.temperature,
    probeLog: m.notMeasuredReason ? [m.notMeasuredReason] : [],
  }));
  const results = new Map();
  for (const m of models) {
    const f = join(outDir, `${m.key}.jsonl`);
    const rows = existsSync(f) ? readFileSync(f, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
    for (const row of rows) {
      if (row.error) continue;
      const task = tasks.find((t) => t.id === row.task);
      const g = await grade(task, row.response);
      if (g.pass !== row.pass) console.log(`[regrade] ${m.key} ${row.task}: ${row.pass} -> ${g.pass} (${g.reason})`);
      Object.assign(row, { pass: g.pass, reason: g.reason, passed: g.passed, total: g.total });
    }
    writeFileSync(f, rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : ""));
    results.set(m.key, rows);
  }
  writeSummary({
    models, results, tasks, spent: prevSummary.estimatedCostUsd ?? 0, stopped: prevSummary.stoppedEarly ?? null,
    runId, outDir, runDate: prevSummary.runDate,
  });
}

function writeSummary({ models, results, tasks, spent, stopped, runId, outDir, runDate }) {
  /* ---------------- summary ---------------- */
  const summaryModels = models.map((m) => {
    const rows = results.get(m.key) ?? [];
    const ok = rows.filter((r) => !r.error);
    const measured = ok.length > 0;
    const byCat = {};
    for (const c of CATEGORIES) {
      const cr = rows.filter((r) => r.category === c);
      const total = tasks.filter((t) => t.category === c).length;
      const pass = cr.filter((r) => r.pass).length;
      byCat[c] = measured ? { pass, total, pct: total ? round((pass / total) * 100, 1) : null, errors: cr.filter((r) => r.error).length } : null;
    }
    const pass = rows.filter((r) => r.pass).length;
    const cost = ok.reduce((s, r) => s + (r.costUsd ?? 0), 0);
    const lat = ok.map((r) => r.latencyMs);
    const ttft = ok.map((r) => r.ttftMs).filter((x) => x != null);
    return {
      key: m.key, id: m.id, label: m.label, family: m.family,
      measured,
      notMeasuredReason: measured ? null : m.probeLog.join(" | "),
      route: m.route ? { via: m.route.via, model: m.route.model, servedAs: m.servedAs ?? null } : null,
      completed: rows.length, errors: rows.filter((r) => r.error).length,
      pricing: m.pricing, temperature: m.route ? (m.temperature ?? "provider default") : null,
      overall: measured ? { pass, total: tasks.length, pct: round((pass / tasks.length) * 100, 1) } : null,
      categories: byCat,
      latency: measured
        ? {
            avgMs: Math.round(lat.reduce((a, b) => a + b, 0) / lat.length),
            medianMs: median(lat),
            medianTtftMs: median(ttft),
          }
        : null,
      tokens: measured
        ? {
            prompt: ok.reduce((s, r) => s + (r.promptTokens ?? 0), 0),
            completion: ok.reduce((s, r) => s + (r.completionTokens ?? 0), 0),
          }
        : null,
      costUsd: measured ? round(cost, 4) : null,
      costPerTaskUsd: measured ? round(cost / ok.length, 5) : null,
    };
  });

  const ref = summaryModels.find((m) => m.family === "claude" && m.measured);
  for (const m of summaryModels) {
    m.reference = !!ref && m.key === ref.key;
    m.vsReference = ref && m.measured
      ? {
          scoreRatio: ref.overall.pct ? round(m.overall.pct / ref.overall.pct, 3) : null,
          costRatio: ref.costUsd ? round(m.costUsd / ref.costUsd, 4) : null,
          latencyRatio: ref.latency.medianMs ? round(m.latency.medianMs / ref.latency.medianMs, 3) : null,
        }
      : null;
  }

  const perTask = tasks.map((t) => ({
    id: t.id, category: t.category, lang: t.lang,
    results: Object.fromEntries(models.map((m) => {
      const r = (results.get(m.key) ?? []).find((x) => x.task === t.id);
      return [m.key, r ? (r.error ? "error" : r.pass ? "pass" : "fail") : "not-run"];
    })),
  }));

  const prev = existsSync(OUT_JSON) ? JSON.parse(readFileSync(OUT_JSON, "utf8")) : {};
  const summary = {
    version: 1,
    runDate: runDate ?? new Date().toISOString().slice(0, 10),
    runId,
    referenceModel: ref?.key ?? null,
    stoppedEarly: stopped,
    estimatedCostUsd: round(spent, 4),
    methodology: {
      tasks: tasks.length,
      categories: Object.fromEntries(CATEGORIES.map((c) => [c, tasks.filter((t) => t.category === c).length])),
      languages: Object.fromEntries(["ru", "uz", "en"].map((l) => [l, tasks.filter((t) => t.lang === l).length])),
      runsPerTask: 1,
      routes: "the provider routes the app itself uses (src/lib/ai/providers.ts): OpenRouter, RSI, Groq, OmniRoute; OpenAI chat-completions format, stream=true; first working route per model after a probe",
      temperature: "0 where supported, otherwise provider default",
      maxTokens: MAX_TOKENS,
      reasoning: "each model's default reasoning/thinking setting on its route; no extra effort flags",
      systemPrompt: "none (single user message)",
      grading: {
        coding: "hidden unit tests (all must pass) in a sandboxed child process: JS in node:vm (no require/process/fetch), Python -I with sockets blocked; 10s timeout",
        math: "exact match of the final 'ОТВЕТ:/ANSWER:/JAVOB:' line",
        instruction: "deterministic checks: JSON parse + schema, sentence/word counts, required keywords, forbidden letter, uppercase, script ratio",
        writing: "deterministic checks only (script/alphabet, length, must-include terms); style and fluency are NOT judged",
      },
      cost: "tokens reported by each route × OpenRouter list price for the same model (reseller/free-tier prices differ)",
      latency: "wall-clock from request to last streamed byte on the machine running the harness; depends on the route's hardware (e.g. Groq LPUs are unusually fast), not only the model",
      apiErrors: "counted as failures and reported separately",
    },
    models: summaryModels,
    tasks: perTask,
    public: prev.public ?? null,
  };

  writeFileSync(join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
  if (!flag("no-write")) {
    mkdirSync(dirname(OUT_JSON), { recursive: true });
    writeFileSync(OUT_JSON, JSON.stringify(summary, null, 2) + "\n");
  }

  console.log(`\n=== ${runId}  est. spend $${spent.toFixed(4)}${stopped ? `  STOPPED: ${stopped}` : ""}`);
  for (const m of summaryModels) {
    if (!m.measured) {
      console.log(`${m.label.padEnd(20)} NOT MEASURED — ${m.notMeasuredReason}`);
      continue;
    }
    const cats = CATEGORIES.map((c) => `${c} ${m.categories[c].pass}/${m.categories[c].total}`).join("  ");
    console.log(`${m.label.padEnd(20)} ${m.overall.pass}/${m.overall.total} (${m.overall.pct}%)  ${cats}  med ${m.latency.medianMs}ms  $${m.costUsd}  err ${m.errors}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
