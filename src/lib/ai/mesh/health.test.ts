/**
 * Lokal test (tarmoqsiz): npx tsx --conditions=react-server src/lib/ai/mesh/health.test.ts
 * Sog'liq holat mashinasi (docs/MESH.md §6), saqlash (§9) va Upstash zaxirasi.
 */
import assert from "node:assert/strict";
import { keyFingerprint } from "./fingerprint";
import {
  authCooldownMs,
  breakerCooldownMs,
  createHealthMesh,
  defaultHealth,
  effectiveState,
  fallbackStore,
  failureScope,
  healthKey,
  memoryStore,
  nextState,
  parseHealth,
  parseHealthKey,
  probeKey,
  usageKey,
  utcDay,
  type HealthStore,
} from "./health";
import { MESH_TUNING, type ClassifiedError, type ErrorKind, type HealthState } from "./types";

let passed = 0;
let failed = 0;
const queue: { name: string; fn: () => void | Promise<void> }[] = [];
function test(name: string, fn: () => void | Promise<void>) {
  queue.push({ name, fn });
}

const T0 = Date.UTC(2026, 8, 27, 12, 0, 0);
const err = (kind: ErrorKind, extra: Partial<ClassifiedError> = {}): ClassifiedError => ({ kind, message: kind, ...extra });
const fail = (h: HealthState, kind: ErrorKind, now: number, extra: Partial<ClassifiedError> = {}) =>
  nextState(h, { ok: false, error: err(kind, extra) }, now);

function clock(start = T0) {
  let t = start;
  const now = () => t;
  return { now, advance: (ms: number) => (t += ms), set: (v: number) => (t = v) };
}
const silent = () => {};

/* ---------------- PURE: nextState ---------------- */

test("3 ketma-ket transient → open 30 s", () => {
  let h = defaultHealth();
  h = fail(h, "transient", T0);
  h = fail(h, "transient", T0);
  assert.equal(h.state, "closed");
  assert.equal(h.fails, 2);
  h = fail(h, "transient", T0);
  assert.equal(h.state, "open");
  assert.equal(h.until, T0 + 30_000);
  assert.equal(h.trips, 1);
  assert.equal(effectiveState(h, T0 + 29_999), "open");
  assert.equal(effectiveState(h, T0 + 30_000), "half_open");
});

test("half_open'da xato → open, cooldown ikki barobar (60 s), keyin 120 s, max 5 daqiqa", () => {
  let h = defaultHealth();
  for (let i = 0; i < 3; i++) h = fail(h, "transient", T0);
  const t1 = T0 + 30_000;
  h = fail(h, "transient", t1);
  assert.equal(h.state, "open");
  assert.equal(h.trips, 2);
  assert.equal(h.until, t1 + 60_000);
  const t2 = t1 + 60_000;
  h = fail(h, "transient", t2);
  assert.equal(h.until, t2 + 120_000);
  assert.equal(breakerCooldownMs(10), MESH_TUNING.maxCooldownMs);
});

test("open (muddati bor) holatda kechikkan transient — until/trips o'zgarmaydi", () => {
  let h = defaultHealth();
  for (let i = 0; i < 3; i++) h = fail(h, "transient", T0);
  const h2 = fail(h, "transient", T0 + 1000);
  assert.equal(h2.until, h.until);
  assert.equal(h2.trips, h.trips);
  assert.equal(h2.fails, 4);
});

test("half_open muvaffaqiyat → closed, fails=0, trips=0", () => {
  let h = defaultHealth();
  for (let i = 0; i < 3; i++) h = fail(h, "transient", T0);
  h = nextState(h, { ok: true, ttfbMs: 500 }, T0 + 31_000);
  assert.equal(h.state, "closed");
  assert.equal(h.fails, 0);
  assert.equal(h.trips, 0);
  assert.equal(h.until, undefined);
  assert.equal(h.lastError, undefined);
});

test("rate_limited → Retry-After gacha; yo'q bo'lsa 60 s", () => {
  const a = fail(defaultHealth(), "rate_limited", T0, { retryAfterMs: 7_000 });
  assert.equal(a.state, "open");
  assert.equal(a.until, T0 + 7_000);
  assert.equal(a.trips ?? 0, 0, "rate limit breaker trip emas");
  const b = fail(defaultHealth(), "rate_limited", T0);
  assert.equal(b.until, T0 + 60_000);
});

test("quota_exhausted / no_credit → resetAt yoki +1 soat", () => {
  const reset = Date.UTC(2026, 8, 28);
  assert.equal(fail(defaultHealth(), "quota_exhausted", T0, { resetAt: reset }).until, reset);
  assert.equal(fail(defaultHealth(), "quota_exhausted", T0).until, T0 + 3_600_000);
  assert.equal(fail(defaultHealth(), "no_credit", T0).until, T0 + 3_600_000);
  // resetAt o'tmishda (soat farqi) — 1 soat
  assert.equal(fail(defaultHealth(), "no_credit", T0, { resetAt: T0 - 1 }).until, T0 + 3_600_000);
});

test("auth: 5 daqiqa → ×3 → maksimal 1 soat (regress #6: 24 soat emas); unavailable 6 soat", () => {
  const a1 = fail(defaultHealth(), "auth", T0);
  assert.equal(a1.until, T0 + 5 * 60_000);
  assert.equal(a1.authStrikes, 1);
  const a2 = fail(a1, "auth", T0 + 1);
  assert.equal(a2.authStrikes, 2);
  assert.equal(a2.until, T0 + 1 + 15 * 60_000);
  assert.equal(authCooldownMs(3), 45 * 60_000);
  assert.equal(authCooldownMs(9), 60 * 60_000);
  // Muvaffaqiyat — strikes va barmoq izi tozalanadi.
  const ok = nextState({ ...a2, authFp: "abcd1234" }, { ok: true, ttfbMs: 100 }, T0 + 2);
  assert.equal(ok.authStrikes, undefined);
  assert.equal(ok.authFp, undefined);
  assert.equal(fail(defaultHealth(), "unavailable", T0).until, T0 + 6 * 3_600_000);
});

test("failureScope: pool ($paid/$free) — provayder/modeldan ustun", () => {
  assert.equal(failureScope(err("no_credit", { pool: "paid" }), "anthropic/x"), "pool");
  assert.equal(failureScope(err("quota_exhausted", { pool: "free", scope: "model" }), "x:free"), "pool");
  assert.equal(failureScope(err("no_credit"), "m"), "provider");
});

test("bad_request / context_length — holat o'zgarmaydi (xuddi o'sha obyekt)", () => {
  const h = defaultHealth();
  assert.equal(fail(h, "bad_request", T0), h);
  assert.equal(fail(h, "context_length", T0), h);
});

test("open holatda rate_limited — until faqat uzayadi", () => {
  const a = fail(defaultHealth(), "rate_limited", T0, { retryAfterMs: 60_000 });
  const b = fail(a, "rate_limited", T0 + 1000, { retryAfterMs: 5_000 });
  assert.equal(b.until, T0 + 60_000);
  const c = fail(a, "quota_exhausted", T0 + 1000);
  assert.equal(c.until, T0 + 1000 + 3_600_000);
});

test("EWMA: success 1→0.8 xatoda; latency 0.8·old + 0.2·ttfb; bad_request hisoblanmaydi", () => {
  let h = defaultHealth();
  h = fail(h, "transient", T0);
  assert.ok(Math.abs(h.successEwma - 0.8) < 1e-9);
  h = nextState(h, { ok: true, ttfbMs: 1000 }, T0);
  assert.ok(Math.abs(h.successEwma - 0.84) < 1e-9);
  assert.ok(Math.abs(h.latencyEwmaMs - (0.8 * 2000 + 0.2 * 1000)) < 1e-9);
  const same = fail(h, "bad_request", T0);
  assert.equal(same.successEwma, h.successEwma);
});

test("failureScope: auth/no_credit — provider; unavailable — model; scope:model hurmat qilinadi", () => {
  assert.equal(failureScope(err("auth", { scope: "model" }), "m"), "provider");
  assert.equal(failureScope(err("no_credit"), "m"), "provider");
  assert.equal(failureScope(err("unavailable"), "m"), "model");
  assert.equal(failureScope(err("unavailable")), "provider");
  assert.equal(failureScope(err("rate_limited", { scope: "model" }), "m"), "model");
  assert.equal(failureScope(err("rate_limited"), "m"), "provider");
});

test("kalitlar va parse", () => {
  assert.equal(healthKey("groq"), "mesh:health:groq");
  assert.equal(healthKey("groq", "openai/gpt-oss-120b"), "mesh:health:groq:openai/gpt-oss-120b");
  assert.deepEqual(parseHealthKey("mesh:health:openrouter:meta-llama/x:free"), { provider: "openrouter", wire: "meta-llama/x:free" });
  assert.equal(parseHealthKey("mesh:health:nope"), null);
  assert.equal(probeKey(healthKey("groq", "w")), "mesh:probe:groq:w");
  assert.equal(utcDay(Date.UTC(2026, 0, 5, 23, 59)), "20260105");
  assert.equal(usageKey("cloudflare", undefined, T0), "mesh:usage:cloudflare:20260927");
  assert.equal(usageKey("groq", "w", T0), "mesh:usage:groq:w:20260927");
});

test("parseHealth: buzilgan JSON → null, noto'g'ri maydonlar tozalanadi", () => {
  assert.equal(parseHealth("{bad"), null);
  assert.equal(parseHealth(null), null);
  const h = parseHealth(JSON.stringify({ state: "weird", fails: "x", successEwma: 5, until: T0 }))!;
  assert.equal(h.state, "closed");
  assert.equal(h.fails, 0);
  assert.equal(h.successEwma, 1);
  assert.equal(h.until, T0);
  assert.equal(parseHealth({ state: "half_open", fails: 0, successEwma: 1, latencyEwmaMs: 1 })!.state, "open");
});

/* ---------------- Saqlash + xizmat ---------------- */

test("recordFailure → isAvailable false; cooldown o'tgach half_open → true; success → closed", async () => {
  const c = clock();
  const m = createHealthMesh({ store: memoryStore(c.now), now: c.now, log: silent });
  for (let i = 0; i < 3; i++) await m.recordFailure("groq", err("transient"));
  assert.equal(await m.isAvailable("groq"), false);
  c.advance(30_000);
  assert.equal(await m.isAvailable("groq", c.now()), true, "half_open — ruxsat");
  assert.equal(effectiveState(await m.getHealth("groq"), c.now()), "half_open");
  await m.recordSuccess("groq", 400);
  const h = await m.getHealth("groq");
  assert.equal(h.state, "closed");
  assert.equal(h.fails, 0);
});

test("model-scope xato faqat shu modelni yopadi", async () => {
  const c = clock();
  const m = createHealthMesh({ store: memoryStore(c.now), now: c.now, log: silent });
  await m.recordFailure("groq", err("rate_limited", { scope: "model", retryAfterMs: 10_000 }), { wire: "a" });
  assert.equal(await m.isAvailable("groq"), true);
  assert.equal(await m.isAvailable("groq", undefined, "a"), false);
  assert.equal(await m.isAvailable("groq", undefined, "b"), true);
  // muvaffaqiyat model kalitini ham yopadi (probe)
  c.advance(10_000);
  await m.recordSuccess("groq", 300, { wire: "a" });
  assert.equal(await m.isAvailable("groq", undefined, "a"), true);
  assert.equal((await m.getHealth("groq", "a")).state, "closed");
});

test("unavailable (404) — model scope, boshqa model ishlayveradi", async () => {
  const c = clock();
  const m = createHealthMesh({ store: memoryStore(c.now), now: c.now, log: silent });
  await m.record({ provider: "openrouter", wire: "x/y", ok: false, error: err("unavailable") });
  assert.equal(await m.isAvailable("openrouter"), true);
  assert.equal(await m.isAvailable("openrouter", undefined, "x/y"), false);
});

test("auth — provider 5 daqiqa + log (kalitsiz)", async () => {
  const c = clock();
  const logs: string[] = [];
  const m = createHealthMesh({ store: memoryStore(c.now), now: c.now, log: (s) => logs.push(s) });
  await m.recordFailure("mistral", err("auth"), { wire: "w" });
  assert.equal(await m.isAvailable("mistral"), false);
  assert.ok(logs.some((l) => l === "[mesh] auth mistral"));
  assert.ok(!logs.some((l) => /Bearer|sk-/.test(l)), "kalit logga chiqmaydi");
  c.advance(5 * 60_000);
  assert.equal(await m.isAvailable("mistral", c.now()), true);
});

test("auth barmoq izi (regress #6): kalit almashtirilsa eski blok e'tiborsiz; admin reset", async () => {
  const c = clock();
  const store = memoryStore(c.now);
  const m = createHealthMesh({ store, now: c.now, log: silent });
  const oldHeaders = { Authorization: "Bearer old-key" };
  const oldFp = keyFingerprint(oldHeaders)!;
  assert.match(oldFp, /^[0-9a-f]{8}$/);
  assert.notEqual(keyFingerprint({ Authorization: "Bearer new-key" }), oldFp);
  await m.record({ provider: "groq", wire: "w", ok: false, error: err("auth"), keyFp: oldFp });
  const raw = (await store.mget([healthKey("groq")]))[0]!;
  assert.ok(!raw.includes("old-key"), "kalitning o'zi saqlanmaydi");
  assert.equal(JSON.parse(raw).authFp, oldFp);
  // Eski kalit hali ishlatilmoqda — blok amal qiladi.
  let snap = await m.snapshot([{ id: "groq", endpoint: () => ({ url: "u", headers: oldHeaders }) }]);
  assert.equal(snap.get(healthKey("groq"))!.state, "open");
  // Kalit almashtirildi — blok e'tiborsiz (closed).
  snap = await m.snapshot([{ id: "groq", endpoint: () => ({ url: "u", headers: { Authorization: "Bearer new-key" } }) }]);
  assert.equal(snap.get(healthKey("groq"))!.state, "closed");
  // Admin reset — kalit o'chiriladi.
  await m.recordFailure("openrouter", err("no_credit", { pool: "paid" }));
  assert.ok((await m.reset("openrouter")) > 0);
  assert.deepEqual(await store.mget([healthKey("openrouter", "$paid")]), [null]);
  assert.equal((await m.snapshot()).get(healthKey("groq"))!.state, "open", "boshqa provayderga tegmaydi");
  await m.reset();
  assert.equal((await m.snapshot()).get(healthKey("groq"))!.state, "closed");
});

test("pool (regress #5): OpenRouter kredit tugadi — faqat $paid kaliti, provayder kaliti yopilmaydi", async () => {
  const c = clock();
  const m = createHealthMesh({ store: memoryStore(c.now), now: c.now, log: silent });
  await m.record({ provider: "openrouter", wire: "anthropic/claude-x", ok: false, error: err("no_credit", { scope: "provider", pool: "paid" }) });
  assert.equal(await m.isAvailable("openrouter"), true, "butun provayder ochiq (:free ishlaydi)");
  const snap = await m.snapshot();
  assert.equal(snap.get(healthKey("openrouter", "$paid"))!.state, "open");
  await m.record({ provider: "openrouter", wire: "a:free", ok: false, error: err("quota_exhausted", { scope: "model", pool: "free", resetAt: T0 + 7_200_000 }) });
  const s2 = await m.snapshot();
  assert.equal(s2.get(healthKey("openrouter", "$free"))!.until, T0 + 7_200_000);
  assert.equal(s2.get(healthKey("openrouter", "a:free")), undefined, "per-model emas — umumiy $free");
});

test("index (regress #7): dinamik wire Upstash'ga yozilmaydi; index chegaralangan; muddati o'tganlar tozalanadi", async () => {
  const c = clock();
  const store = memoryStore(c.now);
  const m = createHealthMesh({ store, now: c.now, log: silent, maxIndexSize: 3 });
  // Foydalanuvchi id'si (resolve) — ephemeral: faqat xotirada.
  await m.record({ provider: "openrouter", wire: "evil/model-1", ok: false, error: err("unavailable"), ephemeral: true });
  assert.deepEqual(await store.smembers("mesh:index"), []);
  assert.deepEqual(await store.mget([healthKey("openrouter", "evil/model-1")]), [null]);
  assert.equal(await m.isAvailable("openrouter", undefined, "evil/model-1"), false, "lekin shu instansiyada ishlaydi");
  // Statik wire'lar — index'ga, lekin maxIndexSize dan oshmaydi.
  for (let i = 0; i < 6; i++) await m.recordFailure("groq", err("rate_limited", { scope: "model" }), { wire: `static-${i}` });
  assert.equal((await store.smembers("mesh:index")).length, 3);
  assert.equal(await m.isAvailable("groq", undefined, "static-5"), false, "ortiqchasi xotirada ishlaydi");
  // Muddati o'tgan a'zolar keyingi o'qishda index'dan olib tashlanadi.
  c.advance(25 * 3_600_000);
  m.invalidate();
  await m.snapshot();
  await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(await store.smembers("mesh:index"), []);
});

test("storeStatus (regress #9): Upstash javob bermasa reachable=false; sozlanmagan — persistent=false", async () => {
  const c = clock();
  const down = fallbackStore(brokenStore("throw"), memoryStore(c.now), { now: c.now, log: silent });
  const m = createHealthMesh({ store: down, now: c.now, log: silent });
  await m.snapshot();
  assert.deepEqual([m.storeStatus().persistent, m.storeStatus().reachable], [true, false]);
  const none = createHealthMesh({ store: fallbackStore(null, memoryStore(c.now), { now: c.now }), now: c.now, log: silent });
  await none.snapshot();
  assert.deepEqual([none.storeStatus().persistent, none.storeStatus().reachable], [false, null]);
  const ok = createHealthMesh({ store: fallbackStore(memoryStore(c.now), memoryStore(c.now), { now: c.now }), now: c.now, log: silent });
  await ok.snapshot();
  assert.equal(ok.storeStatus().reachable, true);
});

test("unsupported — hech narsa yozilmaydi (imkoniyat, hamma uchun blok emas)", async () => {
  const c = clock();
  const store = memoryStore(c.now);
  const m = createHealthMesh({ store, now: c.now, log: silent });
  await m.recordFailure("omniroute", err("unsupported", { scope: "model", capability: "tools" }), { wire: "groq/x" });
  assert.deepEqual(await store.mget([healthKey("omniroute"), healthKey("omniroute", "groq/x")]), [null, null]);
});

test("bad_request — hech narsa yozilmaydi", async () => {
  const c = clock();
  const store = memoryStore(c.now);
  const m = createHealthMesh({ store, now: c.now, log: silent });
  await m.recordFailure("groq", err("bad_request"));
  const [raw] = await store.mget([healthKey("groq")]);
  assert.equal(raw, null);
});

test("usedToday: kunlik hisoblagich (provider va perModel), UTC yarim tunda tiklanadi", async () => {
  const c = clock(Date.UTC(2026, 8, 27, 23, 0));
  const m = createHealthMesh({ store: memoryStore(c.now), now: c.now, log: silent });
  await m.recordSuccess("cloudflare", 500, { wire: "@cf/x", units: 120 });
  await m.recordSuccess("cloudflare", 500, { wire: "@cf/y", units: 80 });
  assert.equal((await m.getHealth("cloudflare")).usedToday, 200);
  await m.record({ provider: "groq", wire: "llama", ok: true, ttfbMs: 200 }, 1, { perModel: true });
  await m.record({ provider: "groq", wire: "llama", ok: true, ttfbMs: 200 }, 1, { perModel: true });
  assert.equal((await m.getHealth("groq", "llama")).usedToday, 2);
  assert.equal((await m.getHealth("groq")).usedToday, undefined);

  // Boshqa instansiya (kesh yo'q) ham xuddi shuni ko'radi — index orqali model kalitlari
  c.advance(6_000);
  m.invalidate();
  const snap = await m.snapshot();
  assert.equal(snap.get(healthKey("cloudflare"))?.usedToday, 200);
  assert.equal(snap.get(healthKey("groq", "llama"))?.usedToday, 2);

  c.set(Date.UTC(2026, 8, 28, 0, 0, 1));
  m.invalidate();
  assert.equal((await m.getHealth("cloudflare")).usedToday, undefined, "yangi UTC kun — 0");
});

test("snapshot: hamma provayder kaliti bor, adapters filtri, 5 s kesh", async () => {
  const c = clock();
  const store = memoryStore(c.now);
  const m = createHealthMesh({ store, now: c.now, log: silent });
  const s1 = await m.snapshot();
  assert.ok(s1.has(healthKey("llm7")) && s1.has(healthKey("omniroute")));
  assert.equal(s1.get(healthKey("llm7"))!.state, "closed");
  const s2 = await m.snapshot([{ id: "groq" }, { id: "llm7" }]);
  assert.deepEqual([...s2.keys()].sort(), [healthKey("groq"), healthKey("llm7")]);

  // Boshqa instansiya yozdi — bu instansiya 5 s kesh ichida eskisini ko'radi, keyin yangisini
  const other = createHealthMesh({ store, now: c.now, log: silent });
  await other.recordFailure("llm7", err("rate_limited"));
  assert.equal((await m.snapshot()).get(healthKey("llm7"))!.state, "closed");
  c.advance(MESH_TUNING.healthCacheMs);
  assert.equal((await m.snapshot()).get(healthKey("llm7"))!.state, "open");

  // O'z yozuvi kesh ichida darhol ko'rinadi
  await m.recordFailure("omniroute", err("no_credit"));
  assert.equal((await m.snapshot()).get(healthKey("omniroute"))!.state, "open");
});

test("acquireProbe: SET NX PX 15 s — bitta instansiya oladi", async () => {
  const c = clock();
  const store = memoryStore(c.now);
  const a = createHealthMesh({ store, now: c.now, log: silent });
  const b = createHealthMesh({ store, now: c.now, log: silent });
  const k = healthKey("groq", "w");
  assert.equal(await a.acquireProbe(k), true);
  assert.equal(await b.acquireProbe(k), false);
  c.advance(MESH_TUNING.probeLockMs);
  assert.equal(await b.acquireProbe(k), true);
});

test("health TTL: kalit muddati o'tgach yozuv yo'qoladi (24 soat)", async () => {
  const c = clock();
  const m = createHealthMesh({ store: memoryStore(c.now), now: c.now, log: silent });
  await m.recordFailure("sambanova", err("transient"));
  c.advance(24 * 3_600_000 + 1);
  m.invalidate();
  assert.equal((await m.getHealth("sambanova")).fails, 0);
});

/* ---------------- Upstash zaxirasi ---------------- */

function brokenStore(mode: "throw" | "hang"): HealthStore {
  const f = () => (mode === "throw" ? Promise.reject(new Error("ECONNRESET")) : new Promise<never>(() => {}));
  return { mget: f, set: f, setNX: f, incrBy: f, sadd: f, smembers: f };
}

test("Upstash xato beradi → xotira ishlaydi, hech narsa otilmaydi, log bir marta", async () => {
  const c = clock();
  const logs: string[] = [];
  const store = fallbackStore(brokenStore("throw"), memoryStore(c.now), { now: c.now, log: (s) => logs.push(s) });
  const m = createHealthMesh({ store, now: c.now, log: silent });
  for (let i = 0; i < 3; i++) await m.recordFailure("nvidia", err("transient"));
  assert.equal(await m.isAvailable("nvidia"), false);
  assert.equal(logs.length, 1, "backoff davomida qayta log yo'q");
});

test("Upstash osilib qoladi → taymaut, xotiraga o'tiladi", async () => {
  const c = clock();
  const store = fallbackStore(brokenStore("hang"), memoryStore(c.now), { now: c.now, timeoutMs: 20, log: silent });
  const m = createHealthMesh({ store, now: c.now, log: silent });
  const t = Date.now();
  await m.recordFailure("cerebras", err("rate_limited"));
  assert.equal(await m.isAvailable("cerebras"), false);
  assert.ok(Date.now() - t < 1000, "taymaut ishladi");
  assert.equal(await m.acquireProbe(healthKey("cerebras")), true);
});

test("Upstash sozlanmagan (primary=null) → faqat xotira", async () => {
  const c = clock();
  const store = fallbackStore(null, memoryStore(c.now), { now: c.now });
  const m = createHealthMesh({ store, now: c.now, log: silent });
  await m.recordSuccess("llm7", 900, { units: 1 });
  assert.equal((await m.getHealth("llm7")).usedToday, 1);
});

test("xizmat hatto store to'g'ridan otsa ham otmaydi", async () => {
  const m = createHealthMesh({ store: brokenStore("throw"), log: silent });
  await m.recordSuccess("groq", 1);
  await m.recordFailure("groq", err("transient"));
  assert.equal(await m.isAvailable("groq"), true);
  assert.deepEqual(await m.getHealth("groq"), defaultHealth());
  assert.equal((await m.snapshot()).size, 0);
  assert.equal(await m.acquireProbe(healthKey("groq")), true);
});

(async () => {
  for (const { name, fn } of queue) {
    try {
      await fn();
      passed++;
    } catch (e) {
      failed++;
      console.error(`✕ ${name}\n  ${(e as Error).message.split("\n").join("\n  ")}`);
    }
  }
  console.log(`health.test: ${passed} o'tdi, ${failed} yiqildi`);
  if (failed) process.exit(1);
})();
