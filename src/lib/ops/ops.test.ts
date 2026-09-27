/**
 * Ops bot testlari (tarmoqsiz, HAQIQIY Telegram xabari yuborilmaydi — fetch/send soxta):
 *   npx tsx --conditions=react-server src/lib/ops/ops.test.ts
 * Niqoblash, HTML escape, 4096 bo'lish, dedupe va rate limit, failover yig'indisi, breaker o'tishlari
 * (health.ts), mesh failover/exhausted hook'lari (execute.ts), hisobot kompozitsiyasi, cron auth,
 * dry rejim, Telegram webhook himoyasi.
 */
import assert from "node:assert/strict";
import { createHealthMesh, memoryStore } from "@/lib/ai/mesh/health";
import { meshComplete } from "@/lib/ai/mesh/execute";
import type { Candidate, ClassifiedError, ModelOffer, ProviderAdapter } from "@/lib/ai/mesh/types";
import { eventLine } from "./describe";
import { breakerDowntime, composeDigest, detectAnomalies, failoverRoutes, isQuiet, type DigestData } from "./digest";
import { aggregateFailovers, releaseName, runFeed, type FeedDeps, type PaymentRow, type SignupRow } from "./feed";
import {
  countryCode,
  deviceKind,
  escapeHtml,
  maskEmail,
  packBlocks,
  reasonClass,
  safePurposes,
  splitMessage,
  TELEGRAM_LIMIT,
  tt,
} from "./format";
import { fetchCommits, fetchReleases } from "./github";
import { digestPeriodKey, handleOpsDigest, handleTelegramWebhook, parseBotCommand, type BotDeps, type DigestDeps } from "./handlers";
import { createOpsRecorder, failoverField, type BreakerTransition } from "./recorder";
import { FO_BUCKET_MS, foBucketKey, memoryOpsStore, type OpsEvent, type OpsStore } from "./store";
import { sendTelegramText, telegramConfig } from "./telegram";

let passed = 0;
let failed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ✗ ${name}\n    ${e instanceof Error ? (e.stack ?? e.message) : e}`);
  }
}

const T0 = Date.parse("2026-09-27T12:00:00Z");
const SECRET = "cron-secret-for-tests-0123456789";
const req = (path: string, auth = `Bearer ${SECRET}`) => new Request(`https://x.test${path}`, { headers: { authorization: auth } });

async function main() {
/* ------------------------------------------------------------------ */
console.log("niqoblash va format");

await test("maskEmail: 2 belgi + *** + @domen; yaroqsiz → ***", () => {
  assert.equal(maskEmail("Abdulla.Karimov@Gmail.com"), "ab***@gmail.com");
  assert.equal(maskEmail("a@mail.ru"), "a***@mail.ru");
  assert.equal(maskEmail("<b>x</b>@evil.com"), "*b***@evil.com");
  assert.equal(maskEmail(""), "***");
  assert.equal(maskEmail(null), "***");
  assert.equal(maskEmail("no-at-sign"), "***");
  assert.equal(maskEmail("x@"), "***");
});

await test("countryCode / safePurposes / deviceKind — xost nomi tashlanadi", () => {
  assert.equal(countryCode("uz"), "UZ");
  assert.equal(countryCode("Uzbekistan"), "—");
  assert.deepEqual(safePurposes(["work", "hack<script>", "research", 5]), ["work", "research"]);
  const d = deviceKind("Islombeks-MacBook.local (darwin) · Cowork");
  assert.deepEqual(d, { app: "Cowork", os: "macOS" });
  assert.equal(JSON.stringify(deviceKind("DESKTOP-JOHN (win32)")).includes("JOHN"), false);
  assert.deepEqual(deviceKind("DESKTOP-JOHN (win32)"), { app: "CLI", os: "Windows" });
});

await test("reasonClass: xato turi → qisqa sinf (xom matn yo'q)", () => {
  assert.equal(reasonClass({ kind: "no_credit" }), "402");
  assert.equal(reasonClass({ kind: "rate_limited" }), "429");
  assert.equal(reasonClass({ kind: "transient" }), "5xx");
  assert.equal(reasonClass({ kind: "transient", timeout: true }), "timeout");
  assert.equal(reasonClass(null), "other");
});

await test("escapeHtml va tt(): shablon va qiymat escape qilinadi", () => {
  assert.equal(escapeHtml(`<a href="x">&</a>`), "&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;");
  const s = tt("en", "p22oFeedRelease", { name: "<script>alert(1)</script> & co" });
  assert.ok(s.includes("&lt;script&gt;"));
  assert.ok(!s.includes("<script>"));
  assert.ok(s.includes("&amp; co"));
});

await test("splitMessage: har bo'lak ≤ 4096, qator chegarasida; uzun qator entity o'rtasida kesilmaydi", () => {
  const lines = Array.from({ length: 400 }, (_, i) => `line ${i} ${"x".repeat(30)}`);
  const parts = splitMessage(lines.join("\n"));
  assert.ok(parts.length > 1);
  for (const p of parts) assert.ok(p.length <= TELEGRAM_LIMIT);
  assert.equal(parts.join("\n"), lines.join("\n"));
  const long = "&amp;".repeat(2000); // 10000 belgi, bitta qator
  const lp = splitMessage(long);
  for (const p of lp) {
    assert.ok(p.length <= TELEGRAM_LIMIT);
    assert.ok(/^(&amp;)+$/.test(p), "entity butun qoladi");
  }
  assert.equal(lp.join(""), long);
  const packed = packBlocks(["a".repeat(3000), "b".repeat(3000), "c".repeat(10)]);
  assert.equal(packed.length, 2);
});

/* ------------------------------------------------------------------ */
console.log("Telegram yuboruvchi (soxta fetch)");

await test("sendTelegramText: faqat TELEGRAM_ALERT_CHAT_ID, HTML, bo'laklar; token logda yo'q", async () => {
  const cfg = telegramConfig({ TELEGRAM_ALERT_BOT_TOKEN: "123:abc", TELEGRAM_ALERT_CHAT_ID: "42" });
  assert.ok(cfg);
  assert.equal(telegramConfig({ TELEGRAM_ALERT_BOT_TOKEN: "123:abc", TELEGRAM_ALERT_CHAT_ID: "42; drop" }), null);
  const bodies: Record<string, unknown>[] = [];
  const fake = (async (_url: string | URL | Request, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  const ok = await sendTelegramText("y\n".repeat(3000), { config: cfg, fetchImpl: fake, html: true });
  assert.equal(ok, true);
  assert.ok(bodies.length >= 2);
  for (const b of bodies) {
    assert.equal(b.chat_id, "42");
    assert.equal(b.parse_mode, "HTML");
    assert.ok(String(b.text).length <= TELEGRAM_LIMIT);
  }
  const bad = (async () => new Response("", { status: 400 })) as unknown as typeof fetch;
  assert.equal(await sendTelegramText("x", { config: cfg, fetchImpl: bad }), false);
  assert.equal(await sendTelegramText("x", { config: null, fetchImpl: fake }), false);
});

/* ------------------------------------------------------------------ */
console.log("yozuvchi (recorder)");

await test("failover: soatlik/kunlik hisoblagich va 5 daqiqalik chelak; bitta flush", async () => {
  const store = memoryOpsStore(() => T0);
  const calls: string[] = [];
  const spy: OpsStore = { ...store, hincr: (k, f, t) => (calls.push(k), store.hincr(k, f, t)) };
  const rec = createOpsRecorder({ store: spy, now: () => T0, flushDelayMs: 10_000 });
  for (let i = 0; i < 14; i++) rec.failover({ from: "openrouter", error: { kind: "no_credit" }, to: "groq", model: "qwen/qwen3-32b", surface: "web" });
  rec.exhausted({ kind: "transient", timeout: true }, "cli");
  rec.metric({ "msg:web": 2 });
  assert.equal(calls.length, 0, "hali yozilmagan (yig'ilmoqda)");
  await rec.flush();
  assert.equal(calls.length, 3, "hour + day + 5m chelak — bittadan");
  const bucket = Math.floor(T0 / FO_BUCKET_MS) * FO_BUCKET_MS;
  const [b] = await store.hgetall([foBucketKey(bucket)]);
  assert.equal(b[failoverField("openrouter", "402", "groq", "qwen/qwen3-32b")], 14);
  const [h] = await store.hgetall(["ops:m:h:2026092712"]);
  assert.equal(h["ex|timeout|cli"], 1);
  assert.equal(h["msg:web"], 2);
  assert.equal(h["fo:web"], 14);
});

await test("breaker: bir xil o'tish 60 s ichida takrorlanmaydi; model kaliti yozilmaydi", async () => {
  const store = memoryOpsStore(() => T0);
  const rec = createOpsRecorder({ store, now: () => T0 });
  const tr = (to: BreakerTransition["to"], at: number, wire?: string): BreakerTransition => ({ provider: "groq", from: "closed", to, at, reason: "rate_limited", ...(wire ? { wire } : {}) });
  rec.breaker(tr("open", T0));
  rec.breaker(tr("open", T0 + 5_000));
  rec.breaker(tr("open", T0, "llama-3.3-70b"));
  rec.breaker(tr("closed", T0 + 120_000));
  rec.breaker(tr("open", T0, "$paid"));
  await new Promise((r) => setTimeout(r, 5));
  const evs = await store.recent(10);
  assert.equal(evs.length, 3);
  assert.deepEqual(evs.map((e) => e.d.to).sort(), ["closed", "open", "open"]);
  assert.ok(evs.some((e) => e.d.scope === "$paid"));
  assert.ok(evs.every((e) => e.type === "breaker"));
});

/* ------------------------------------------------------------------ */
console.log("health.ts → breaker o'tishlari");

await test("createHealthMesh onTransition: closed→open, half_open (probe), →closed; model scope yo'q", async () => {
  let now = T0;
  const seen: BreakerTransition[] = [];
  const mesh = createHealthMesh({ store: memoryStore(() => now), now: () => now, onTransition: (t) => seen.push(t), log: () => {} });
  const rl: ClassifiedError = { kind: "rate_limited", retryAfterMs: 60_000, message: "429" };
  await mesh.recordFailure("groq", rl);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].to, "open");
  assert.equal(seen[0].from, "closed");
  assert.equal(seen[0].reason, "rate_limited");
  await mesh.recordFailure("groq", rl); // allaqachon ochiq — yangi o'tish yo'q
  assert.equal(seen.length, 1);
  await mesh.recordFailure("cerebras", { kind: "unavailable", scope: "model", message: "404" }, { wire: "m1" });
  assert.equal(seen.length, 1, "model scope lentaga chiqmaydi");
  now += 120_000;
  assert.equal(await mesh.acquireProbe("mesh:health:groq"), true);
  assert.equal(seen.at(-1)?.to, "half_open");
  await mesh.recordSuccess("groq", 300);
  assert.equal(seen.at(-1)?.to, "closed");
  assert.equal(seen.at(-1)?.from, "half_open");
  await mesh.recordFailure("openrouter", { kind: "no_credit", pool: "paid", message: "402" });
  assert.equal(seen.at(-1)?.wire, "$paid");
});

/* ------------------------------------------------------------------ */
console.log("execute.ts → failover / exhausted hook'lari");

function offer(wire: string): ModelOffer {
  return { sovereignIds: ["x"], wire, class: "fast", cost: "free", caps: { stream: true, tools: true, vision: false, json: true } };
}
function adapter(id: ProviderAdapter["id"], wire: string): ProviderAdapter {
  return {
    id,
    host: id,
    enabled: () => true,
    endpoint: () => ({ url: `https://${id}.test/v1/chat/completions`, headers: { Authorization: "Bearer test" } }),
    offers: [offer(wire)],
    limits: { unit: "requests", dailyUnits: 1000, source: "test" },
    classifyError: (status, body) =>
      status === 402 ? { kind: "no_credit", message: body } : status >= 500 ? { kind: "transient", message: body } : { kind: "bad_request", message: body },
  };
}

await test("meshComplete: 402 → keyingi provayder = failover (from, reason, to, model); hammasi yiqilsa exhausted", async () => {
  const a1 = adapter("openrouter", "or/model");
  const a2 = adapter("groq", "qwen/qwen3-32b");
  const fo: unknown[] = [];
  const ex: unknown[] = [];
  let replies: Response[] = [];
  const deps = {
    adapters: () => [a1, a2],
    snapshot: async () => new Map(),
    plan: (): Candidate[] => [
      { provider: "openrouter", offer: a1.offers[0], sameModel: true, score: 1 },
      { provider: "groq", offer: a2.offers[0], sameModel: false, score: 1 },
    ],
    record: () => {},
    fetch: (async () => replies.shift() ?? new Response("", { status: 500 })) as typeof fetch,
    sleep: async () => {},
    rng: () => 0.5,
    now: () => Date.now(),
    onFailover: (e: unknown) => fo.push(e),
    onExhausted: (e: unknown, s: unknown) => ex.push([e, s]),
  };
  const okJson = (m: string) =>
    new Response(JSON.stringify({ model: m, choices: [{ message: { role: "assistant", content: "hi" }, finish_reason: "stop" }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  replies = [new Response('{"error":"credits"}', { status: 402 }), okJson("qwen/qwen3-32b")];
  const r = await meshComplete({ req: { needs: {}, planTier: "free", country: null }, body: { messages: [] }, deps });
  assert.equal(r.ok, true);
  assert.equal(fo.length, 1);
  assert.deepEqual(fo[0], { from: "openrouter", error: { kind: "no_credit" }, to: "groq", model: "qwen/qwen3-32b", surface: "cli" });
  assert.equal(ex.length, 0);
  replies = [okJson("or/model")];
  await meshComplete({ req: { needs: {}, planTier: "free", country: null }, body: { messages: [] }, deps });
  assert.equal(fo.length, 1, "birinchi nomzod javob berdi — failover emas");
  replies = [new Response("", { status: 503 }), new Response("", { status: 503 }), new Response("", { status: 503 }), new Response("", { status: 503 })];
  const bad = await meshComplete({ req: { needs: {}, planTier: "free", country: null }, body: { messages: [] }, deps });
  assert.equal(bad.ok, false);
  assert.equal(ex.length, 1);
  assert.deepEqual(ex[0], [{ kind: "transient" }, "cli"]);
});

/* ------------------------------------------------------------------ */
console.log("lenta (ops-events)");

function fakeFeed(store: OpsStore, over: Partial<FeedDeps> = {}) {
  const sent: string[] = [];
  let sendOk = true;
  const signups: SignupRow[] = [
    { id: "u1", email: "alisher.navoiy@gmail.com", createdAt: T0 - 60_000, country: "uz", purposes: ["work", "<b>x</b>"], method: "google" },
    { id: "u2", email: "ivan@mail.ru", createdAt: T0 - 30_000, country: "RU", purposes: [], method: "email" },
  ];
  const payments: PaymentRow[] = [
    { id: "o1", email: "payer.person@yandex.ru", plan: "pro", period: "year", amount: 190, currency: "USD", provider: "dodo", paidAt: T0 - 20_000 },
  ];
  const deps: FeedDeps = {
    cronSecret: SECRET,
    now: () => T0,
    lang: "uz",
    store,
    telegram: true,
    send: async (t) => {
      sent.push(t);
      return sendOk;
    },
    signups: async () => signups,
    payments: async () => payments,
    devices: async () => ({
      logins: [{ key: "k1", device: "JOHNS-LAPTOP (win32) · Cowork", email: "john.smith@corp.com", country: "US", at: T0 - 10_000 }],
      revokes: [],
    }),
    releases: async () => [{ tag: "desktop-v0.8.0", name: "Cowork 0.8.0", publishedAt: T0 - 5_000 }],
    commits: async () => [{ sha: "abcdef1234567890", subject: "Ops bot <b>& co</b>\n\nCo-Authored-By: x", at: T0 - 5_000 }],
    log: () => {},
    ...over,
  };
  return { deps, sent, setOk: (v: boolean) => (sendOk = v) };
}

await test("birinchi ishga tushish: bloklar yuboriladi, email niqoblangan, xost nomi yo'q, HTML escape", async () => {
  const store = memoryOpsStore(() => T0);
  // Mesh va webhook hodisalari (omborda) + failover chelagi.
  await store.push({ id: "breaker:groq::open:1", t: T0 - 200_000, type: "breaker", d: { provider: "groq", label: "Groq", scope: "", to: "open", reason: "429", until: T0 + 60_000 } });
  await store.push({ id: "breaker:groq::closed:2", t: T0 - 80_000, type: "breaker", d: { provider: "groq", label: "Groq", scope: "", to: "closed" } });
  await store.push({ id: "refund:o9:1", t: T0 - 100_000, type: "refund", d: { plan: "starter", period: "month", amount: 9, currency: "USD", provider: "rollypay", email: "ab***@x.com" } });
  const bucket = Math.floor(T0 / FO_BUCKET_MS) * FO_BUCKET_MS - FO_BUCKET_MS;
  await store.hincr(foBucketKey(bucket), { [failoverField("openrouter", "402", "groq", "qwen/qwen3-32b")]: 14, [failoverField("groq", "429", "cerebras", "llama")]: 1 }, 60_000);
  const { deps, sent } = fakeFeed(store);
  const r = await runFeed(deps, { dry: false });
  assert.equal(r.sent >= 1, true);
  const all = sent.join("\n");
  assert.ok(all.includes("al***@gmail.com"));
  assert.ok(!all.includes("alisher.navoiy"));
  assert.ok(!all.includes("payer.person"));
  assert.ok(all.includes("pa***@yandex.ru"));
  assert.ok(!all.includes("JOHNS-LAPTOP"), "xost nomi chiqmaydi");
  assert.ok(all.includes("Cowork · Windows"));
  assert.ok(all.includes("Cowork 0.8.0"));
  assert.ok(all.includes("Ops bot &lt;b&gt;&amp; co&lt;/b&gt;"), "commit sarlavhasi escape qilingan");
  assert.ok(!all.includes("Co-Authored-By"), "faqat birinchi qator");
  assert.ok(all.includes("OpenRouter 402 → Groq qwen/qwen3-32b: 14 marta"));
  assert.ok(!all.includes("Cerebras"), "1 martalik yo'nalish (< failoverMin) lentaga chiqmaydi");
  assert.ok(all.includes("Pul qaytarildi"));
  assert.ok(all.includes("YOPIQ") && all.includes("ishlamadi"), "tiklanish + ishlamay qolgan vaqt");
  assert.ok(!all.includes("<script"));
  for (const m of sent) assert.ok(m.length <= TELEGRAM_LIMIT);
  // Ro'yxatga polled hodisalar qo'shildi (admin karta).
  const evs = await store.recent(50);
  assert.ok(evs.some((e) => e.type === "signup" && e.d.email === "al***@gmail.com"));
  assert.ok(evs.some((e) => e.type === "deploy"));
  assert.ok(!JSON.stringify(evs).includes("alisher.navoiy"));
});

await test("breaker flapping: open → half_open → open — lentada bitta OCHIQ; keyin YOPIQ ishlamay qolgan vaqt bilan", async () => {
  const store = memoryOpsStore(() => T0);
  const b = (id: string, t: number, to: string, extra: Record<string, number | string> = {}): OpsEvent => ({
    id,
    t,
    type: "breaker",
    d: { provider: "cerebras", label: "Cerebras", scope: "", to, ...extra },
  });
  await store.push(b("b1", T0 - 300_000, "open", { reason: "5xx", until: T0 - 270_000 }));
  await store.push(b("b2", T0 - 260_000, "half_open"));
  await store.push(b("b3", T0 - 255_000, "open", { reason: "5xx", until: T0 - 195_000 }));
  const f = fakeFeed(store, { signups: async () => [], payments: async () => [], devices: async () => ({ logins: [], revokes: [] }), releases: async () => [], commits: async () => [] });
  await runFeed(f.deps, { dry: false });
  const first = f.sent.join("\n");
  assert.equal((first.match(/Cerebras: OCHIQ/g) ?? []).length, 1, "takroriy ochilish jim");
  assert.ok(!first.includes("YARIM OCHIQ"), "half_open lentaga chiqmaydi");
  await store.push(b("b4", T0 - 60_000, "closed"));
  f.sent.length = 0;
  await runFeed(f.deps, { dry: false });
  const second = f.sent.join("\n");
  assert.ok(second.includes("Cerebras: YOPIQ"));
  assert.ok(second.includes("4 daq ishlamadi"), second);
  assert.ok(!second.includes("OCHIQ —"));
});

await test("dedupe: ikkinchi ishga tushishda hech narsa qayta yuborilmaydi", async () => {
  const store = memoryOpsStore(() => T0);
  const { deps, sent } = fakeFeed(store);
  await runFeed(deps, { dry: false });
  const n = sent.length;
  const r2 = await runFeed(deps, { dry: false });
  assert.equal(sent.length, n);
  assert.equal(r2.sent, 0);
  assert.ok(r2.deduped > 0);
});

await test("yuborilmasa dedupe bo'shatiladi — keyingi cron qayta urinadi", async () => {
  const store = memoryOpsStore(() => T0);
  const f = fakeFeed(store);
  f.setOk(false);
  const r = await runFeed(f.deps, { dry: false });
  assert.ok(r.failed > 0);
  f.setOk(true);
  const r2 = await runFeed(f.deps, { dry: false });
  assert.ok(r2.sent >= 1);
});

await test("rate limit: oynada N xabardan keyin — bitta xulosa, qolganlari yuborilmaydi", async () => {
  const store = memoryOpsStore(() => T0);
  const many: SignupRow[] = Array.from({ length: 30 }, (_, i) => ({ id: `s${i}`, email: `user${i}@x.com`, createdAt: T0 - 1000, country: "UZ", method: "email" }));
  const big: PaymentRow[] = Array.from({ length: 60 }, (_, i) => ({
    id: `p${i}`,
    email: `payer${i}@x.com`,
    plan: "pro",
    period: "month",
    amount: 19,
    currency: "USD",
    provider: "dodo",
    paidAt: T0 - 1000,
  }));
  const f = fakeFeed(store, { signups: async () => many, payments: async () => big, limits: { perWindow: 1 } });
  // Har blok ~4000 belgi bo'lsin — har biri alohida xabar.
  const orig = f.deps.payments;
  f.deps.payments = async (s) => (await orig(s)).map((p) => ({ ...p, plan: "p".repeat(12) }));
  await runFeed(f.deps, { dry: false });
  const summaries = f.sent.filter((m) => m.includes("Xabarlar ko'payib ketdi"));
  assert.equal(f.sent.length - summaries.length, 1, "faqat 1 ta oddiy xabar");
  assert.equal(summaries.length <= 1, true);
  // Yana ishga tushirish — xulosa takrorlanmaydi.
  const before = f.sent.length;
  await runFeed(f.deps, { dry: false });
  assert.equal(f.sent.length, before);
});

await test("dry=1: matn qaytadi, hech narsa yuborilmaydi va yozilmaydi", async () => {
  const store = memoryOpsStore(() => T0);
  const { deps, sent } = fakeFeed(store);
  const res = await (await import("./feed")).handleOpsEvents(req("/api/cron/ops-events?dry=1"), deps);
  const body = (await res.json()) as { dry: boolean; messages: string[] };
  assert.equal(body.dry, true);
  assert.ok(body.messages.join("").includes("al***@gmail.com"));
  assert.equal(sent.length, 0);
  assert.equal((await store.recent(10)).length, 0);
  assert.equal(await store.get("ops:cursor:feed"), null);
});

await test("cron auth: noto'g'ri / yo'q bearer → 401 (lenta va hisobot)", async () => {
  const store = memoryOpsStore(() => T0);
  const { deps } = fakeFeed(store);
  const { handleOpsEvents } = await import("./feed");
  assert.equal((await handleOpsEvents(req("/api/cron/ops-events", "Bearer wrong"), deps)).status, 401);
  assert.equal((await handleOpsEvents(new Request("https://x.test/api/cron/ops-events"), deps)).status, 401);
  assert.equal((await handleOpsEvents(req("/api/cron/ops-events"), { ...deps, cronSecret: undefined })).status, 401);
  const dd = digestDeps(store, sampleDigest("daily"));
  assert.equal((await handleOpsDigest(req("/api/cron/ops-digest?kind=daily", "Bearer nope"), dd.deps)).status, 401);
  assert.equal((await handleOpsDigest(req("/api/cron/ops-digest?kind=monthly"), dd.deps)).status, 400);
});

await test("aggregateFailovers va releaseName", () => {
  const agg = aggregateFailovers([{ [failoverField("openrouter", "402", "groq", "m")]: 3 }, { [failoverField("openrouter", "402", "groq", "m")]: 4, other: 9 }]);
  assert.deepEqual(agg, [{ from: "openrouter", reason: "402", to: "groq", model: "m", n: 7 }]);
  assert.equal(releaseName("desktop-v0.8.0", "Cowork 0.8.0"), "Cowork 0.8.0");
  assert.equal(releaseName("cli-v0.12.1", null), "CLI 0.12.1");
  assert.equal(releaseName("cli-v0.13.0", "Deep inquiry"), "CLI 0.13.0 — Deep inquiry");
});

await test("GitHub: faqat desktop-v*/cli-v* relizlari, qoralama emas; commit — birinchi qator (soxta fetch)", async () => {
  const fake = (async (url: string | URL | Request) => {
    const u = String(url);
    if (u.includes("/releases")) {
      return Response.json([
        { tag_name: "desktop-v0.8.0", name: "Cowork 0.8.0", published_at: new Date(T0).toISOString(), draft: false },
        { tag_name: "desktop-v0.9.0", name: "draft", published_at: new Date(T0).toISOString(), draft: true },
        { tag_name: "v1.0.0", name: "other", published_at: new Date(T0).toISOString(), draft: false },
        { tag_name: "cli-v0.1.0", name: "old", published_at: new Date(T0 - 86_400_000).toISOString(), draft: false },
      ]);
    }
    return Response.json([{ sha: "abc", commit: { message: "Subject\n\nbody", committer: { date: new Date(T0).toISOString() } } }]);
  }) as typeof fetch;
  const rel = await fetchReleases(fake, T0 - 60_000, {});
  assert.deepEqual(rel.map((r) => r.tag), ["desktop-v0.8.0"]);
  const cm = await fetchCommits(fake, T0 - 60_000, {});
  assert.deepEqual(cm.map((c) => c.subject), ["Subject"]);
});

/* ------------------------------------------------------------------ */
console.log("hisobotlar");

function sampleDigest(kind: DigestData["kind"], over: Partial<DigestData> = {}): DigestData {
  return {
    kind,
    now: T0,
    utcDays: kind === "weekly" ? 7 : 1,
    users: {
      newCount: 23,
      newList: Array.from({ length: 23 }, (_, i) => ({ email: `u${i}***@gmail.com`, country: "UZ", method: i % 2 ? "google" : "email" })),
      dau: 140,
      wau: 610,
      mau: 1900,
      total: 5230,
      paying: 87,
    },
    activity: { messages: 2410, msgWeb: 1900, msgCli: 510, tokens: 3_400_000, tokWeb: 2_000_000, tokCli: 1_400_000 },
    models: [
      { key: "llama-3.3-70b", answers: 900 },
      { key: "qwen/qwen3-32b", answers: 600 },
    ],
    providers: [
      { key: "groq", answers: 1200 },
      { key: "openrouter", answers: 800 },
      { key: "cloudflare", answers: 400 },
    ],
    failovers: [
      { from: "openrouter", reason: "402", to: "groq", model: "qwen/qwen3-32b", n: 64 },
      { from: "groq", reason: "429", to: "cerebras", model: "llama-3.3-70b", n: 12 },
    ],
    failoverBaseline: 10,
    exhausted: { "5xx": 3, timeout: 2 },
    exhaustedBaseline: 4,
    breakers: [{ provider: "openrouter", scope: "$paid", downMs: 47 * 60_000, trips: 3 }],
    judge: { clean: 310, issues: 42, none: 5 },
    inquiry: { total: 200, ask: 36, skip: 120 },
    media: { image: 55, video: 4, transcribe: 12 },
    revenue: { usd: 209, rub: 1490, count: 4 },
    budget: { revenueMonthUsd: 1840, spendMonthUsd: 402.5, ratio: 0.2188, cap: 0.5, restricted: false },
    spendWindowUsd: 31.2,
    spendAvg7Usd: 12.4,
    openrouter: { balance: 2.1, min: 3 },
    releases: ["Cowork 0.8.0"],
    deploys: [{ subject: "Ops bot: Telegram lenta", sha: "7817ed6" }],
    devices: { active: 96, cli: 41, cowork: 55, logins: 7, revokes: 1 },
    signupsLast3d: 51,
    eventCounts: { signup: 23, payment: 4 },
    ...over,
  };
}

await test("composeDigest (kunlik): barcha bo'limlar, Diqqat, ro'yxat 20 bilan cheklangan", () => {
  const text = composeDigest(sampleDigest("daily"), "uz");
  for (const s of [
    "kunlik hisobot",
    "Diqqat",
    "Foydalanuvchilar",
    "DAU 140",
    "Xabarlar: 2410",
    "Top modellar",
    "Provayderlar",
    "Provayder almashuvi: 76 marta",
    "OpenRouter 402: 64",
    "Circuit breaker",
    "47 daq",
    "Hakam: toza 310",
    "Deep Inquiry: 200",
    "Media: rasm 55",
    "Daromad: $209.00 + 1,490 ₽ (4 ta to'lov)",
    "API sarfi",
    "OpenRouter balansi: $2.10",
    "Reliz: Cowork 0.8.0",
    "Deploy: Ops bot",
    "Faol qurilmalar: 96",
  ]) {
    assert.ok(text.includes(s), `yo'q: ${s}`);
  }
  assert.ok(text.includes("u19***@gmail.com"));
  assert.ok(!text.includes("u20***@gmail.com"), "ro'yxat 20 ta bilan cheklangan");
  assert.ok(text.includes("… va yana 3 ta"));
  assert.ok(text.includes("API sarfi keskin oshdi"), "sarf 31.2 > 2×12.4");
  assert.ok(text.includes("Provayder almashuvi ko'paydi"), "76 > 3×10");
  assert.ok(text.includes("OpenRouter balansi past"));
  assert.ok(text.includes("ishlamadi"), "breaker ≥30 daq");
  const parts = splitMessage(text);
  for (const p of parts) assert.ok(p.length <= TELEGRAM_LIMIT);
  // Barcha 4 tilda tuziladi.
  for (const lang of ["uz-cyrl", "ru", "en"] as const) assert.ok(composeDigest(sampleDigest("weekly"), lang).length > 200);
});

await test("anomaliyalar: 3 kun sign-up yo'q; tinch kun — 'Anomaliya yo'q'", () => {
  const calm = sampleDigest("daily", {
    spendWindowUsd: 5,
    failovers: [],
    exhausted: {},
    breakers: [],
    openrouter: { balance: 50, min: 3 },
    signupsLast3d: 0,
  });
  const a = detectAnomalies(calm, "en");
  assert.equal(a.length, 1);
  assert.ok(a[0].includes("No new sign-ups for 3 days"));
  const none = detectAnomalies({ ...calm, signupsLast3d: 4 }, "en");
  assert.equal(none.length, 0);
  assert.ok(composeDigest({ ...calm, signupsLast3d: 4 }, "en").includes("No anomalies"));
});

await test("breakerDowntime: open→closed, until bilan cheklangan, oynadan oldin ochilgan", () => {
  const ev = (t: number, to: string, extra: Record<string, number | string> = {}): OpsEvent => ({ id: `${t}${to}`, t, type: "breaker", d: { provider: "groq", scope: "", to, ...extra } });
  const from = T0 - 3_600_000;
  const r = breakerDowntime([ev(from - 600_000, "open"), ev(from + 600_000, "closed"), ev(from + 1_200_000, "open", { until: from + 1_500_000 }), ev(from + 1_300_000, "half_open")], from, T0);
  assert.equal(r.length, 1);
  assert.equal(r[0].downMs, 600_000 + 300_000);
  assert.equal(r[0].trips, 1, "oyna ichida bitta ochilish");
});

await test("isQuiet: hodisa yo'q (faqat xabarlar) — soatlik jim", () => {
  const quiet = sampleDigest("hourly", { users: { ...sampleDigest("hourly").users!, newCount: 0, newList: [] }, failovers: [], exhausted: {}, revenue: { usd: 0, rub: 0, count: 0 }, eventCounts: {} });
  assert.equal(isQuiet(quiet), true);
  assert.equal(isQuiet(sampleDigest("hourly")), false);
  assert.deepEqual(failoverRoutes({ [failoverField("a", "5xx", "b", "m")]: 2, "msg:web": 5 }), [{ from: "a", reason: "5xx", to: "b", model: "m", n: 2 }]);
});

function digestDeps(store: OpsStore, data: DigestData, telegram = true) {
  const sent: string[] = [];
  const deps: DigestDeps = {
    cronSecret: SECRET,
    now: () => T0 + 5 * 60_000,
    lang: "uz",
    store,
    telegram,
    gather: async (kind) => ({ ...data, kind }),
    send: async (t) => (sent.push(t), true),
    log: () => {},
  };
  return { deps, sent };
}

await test("ops-digest: dry matn qaytaradi; yuborish bir marta (dedupe); soatlik jim", async () => {
  const store = memoryOpsStore(() => T0);
  const { deps, sent } = digestDeps(store, sampleDigest("daily"));
  const dry = (await (await handleOpsDigest(req("/api/cron/ops-digest?kind=daily&dry=1"), deps)).json()) as { text: string };
  assert.ok(dry.text.includes("kunlik hisobot"));
  assert.equal(sent.length, 0);
  const r1 = (await (await handleOpsDigest(req("/api/cron/ops-digest?kind=daily"), deps)).json()) as { sent: boolean };
  assert.equal(r1.sent, true);
  const r2 = (await (await handleOpsDigest(req("/api/cron/ops-digest?kind=daily"), deps)).json()) as { deduped: boolean };
  assert.equal(r2.deduped, true);
  assert.equal(sent.length, 1);
  const quiet = digestDeps(store, sampleDigest("hourly", { users: null, failovers: [], exhausted: {}, revenue: null, eventCounts: {} }));
  const q = (await (await handleOpsDigest(req("/api/cron/ops-digest?kind=hourly"), quiet.deps)).json()) as { quiet: boolean };
  assert.equal(q.quiet, true);
  assert.equal(quiet.sent.length, 0);
  assert.equal(digestPeriodKey("hourly", Date.parse("2026-09-27T13:00:00Z")), "ops:digest:hourly:2026092712");
  assert.equal(digestPeriodKey("daily", Date.parse("2026-09-27T16:00:00Z")), "ops:digest:daily:2026-09-27");
});

/* ------------------------------------------------------------------ */
console.log("Telegram webhook (bot buyruqlari)");

function botDeps(over: Partial<BotDeps> = {}) {
  const ran: string[] = [];
  const sent: string[] = [];
  const deferred: Promise<void>[] = [];
  const deps: BotDeps = {
    secret: "tg-webhook-secret-0123456789abcdef",
    chatId: "42",
    store: memoryOpsStore(() => T0),
    defer: (fn) => void deferred.push(fn()),
    run: async (c) => (ran.push(c), `<b>${c}</b>`),
    send: async (t) => (sent.push(t), true),
    log: () => {},
    ...over,
  };
  return { deps, ran, sent, deferred };
}
const update = (chat: number, text: string, secret = "tg-webhook-secret-0123456789abcdef") =>
  new Request("https://x.test/api/telegram/ops", {
    method: "POST",
    headers: { "x-telegram-bot-api-secret-token": secret, "content-type": "application/json" },
    body: JSON.stringify({ update_id: 1, message: { chat: { id: chat }, text } }),
  });

await test("webhook: sozlanmagan → 404; noto'g'ri secret → 401; begona chat — jim", async () => {
  const off = botDeps({ secret: undefined });
  assert.equal((await handleTelegramWebhook(update(42, "/today"), off.deps)).status, 404);
  const b = botDeps();
  assert.equal((await handleTelegramWebhook(update(42, "/today", "wrong-secret-xxxxxxxxxxxxxxx"), b.deps)).status, 401);
  const res = await handleTelegramWebhook(update(999, "/today"), b.deps);
  assert.equal(res.status, 200);
  await Promise.all(b.deferred);
  assert.deepEqual(b.ran, []);
  assert.deepEqual(b.sent, []);
});

await test("webhook: founder chati — buyruq bajariladi, 10 s ichida takror — e'tiborsiz", async () => {
  const b = botDeps();
  assert.equal((await handleTelegramWebhook(update(42, "/providers@SovOpsBot"), b.deps)).status, 200);
  assert.equal((await handleTelegramWebhook(update(42, "/providers"), b.deps)).status, 200);
  await Promise.all(b.deferred);
  assert.deepEqual(b.ran, ["providers"]);
  assert.equal(b.sent.length, 1);
  assert.equal(parseBotCommand("/start"), "help");
  assert.equal(parseBotCommand("/users extra"), "users");
  assert.equal(parseBotCommand("hello /today"), null);
  assert.equal(parseBotCommand("/todayx"), null);
});

/* ------------------------------------------------------------------ */
console.log("admin karta qatori");

await test("eventLine: oddiy matn (HTML emas), faqat niqoblangan maydonlar", () => {
  const line = eventLine({ id: "signup:1", t: T0, type: "signup", d: { email: "al***@gmail.com", country: "UZ", method: "google", purposes: "work" } }, "en");
  assert.equal(line, "👤 New user: al***@gmail.com · UZ · google · purpose: work");
  const pay = eventLine({ id: "pay:1", t: T0, type: "payment", d: { plan: "pro", period: "year", amount: 190, currency: "USD", provider: "dodo", email: "pa***@x.com" } }, "ru");
  assert.ok(pay.includes("Pro · год · $190.00 · Dodo · pa***@x.com"));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
}

void main();
