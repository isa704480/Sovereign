/**
 * Lokal test (tarmoqsiz): npx tsx --conditions=react-server src/lib/email/token.test.ts
 * Obunani bekor qilish imzosi (kalit tanlash, rotatsiya — _PREV), cron Bearer tekshiruvi.
 */
import assert from "node:assert/strict";
import {
  bearerMatches,
  emailTokenSecret,
  emailTokenVerifySecrets,
  signUnsubscribe,
  unsubscribeUrl,
  verifyUnsubscribe,
} from "./token";

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

const KEYS = ["EMAIL_TOKEN_SECRET", "EMAIL_TOKEN_SECRET_PREV", "CRON_SECRET"] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
function withEnv(env: Partial<Record<(typeof KEYS)[number], string>>, fn: () => void) {
  for (const k of KEYS) {
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
  try {
    fn();
  } finally {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

const UID = "0f8e3c1a-1234-4abc-8def-0123456789ab";
const A = "a".repeat(32);
const B = "b".repeat(32);
const C = "c".repeat(32);

// Ogohlantirish logi test chiqishini ifloslamasin.
const origWarn = console.warn;
console.warn = () => {};

console.log("email token");

test("EMAIL_TOKEN_SECRET ustun", () =>
  withEnv({ EMAIL_TOKEN_SECRET: A, CRON_SECRET: C }, () => assert.equal(emailTokenSecret(), A)));

test("EMAIL_TOKEN_SECRET yo'q → CRON_SECRET (orqaga moslik)", () =>
  withEnv({ CRON_SECRET: C }, () => assert.equal(emailTokenSecret(), C)));

test("qisqa kalit → null (CRON_SECRET'ga tushmaydi)", () =>
  withEnv({ EMAIL_TOKEN_SECRET: "short", CRON_SECRET: C }, () => assert.equal(emailTokenSecret(), null)));

test("hech narsa yo'q → null, verify false", () =>
  withEnv({}, () => {
    assert.equal(emailTokenSecret(), null);
    assert.deepEqual(emailTokenVerifySecrets(), []);
    assert.equal(verifyUnsubscribe(UID, signUnsubscribe(UID, A), emailTokenVerifySecrets()), false);
  }));

test("rotatsiya: eski (PREV) va yangi kalit bilan imzolangan havola ishlaydi", () =>
  withEnv({ EMAIL_TOKEN_SECRET: A, EMAIL_TOKEN_SECRET_PREV: B }, () => {
    const secrets = emailTokenVerifySecrets();
    assert.deepEqual(secrets, [A, B]);
    assert.equal(verifyUnsubscribe(UID, signUnsubscribe(UID, A), secrets), true);
    assert.equal(verifyUnsubscribe(UID, signUnsubscribe(UID, B), secrets), true);
    assert.equal(verifyUnsubscribe(UID, signUnsubscribe(UID, C), secrets), false);
  }));

test("PREV qisqa bo'lsa e'tiborsiz; dublikat bir marta", () =>
  withEnv({ EMAIL_TOKEN_SECRET: A, EMAIL_TOKEN_SECRET_PREV: "x" }, () =>
    assert.deepEqual(emailTokenVerifySecrets(), [A])));
test("PREV = joriy → bitta", () =>
  withEnv({ EMAIL_TOKEN_SECRET: A, EMAIL_TOKEN_SECRET_PREV: A }, () =>
    assert.deepEqual(emailTokenVerifySecrets(), [A])));

test("verifyUnsubscribe: bitta satr kalit (eski API) ham ishlaydi", () => {
  assert.equal(verifyUnsubscribe(UID, signUnsubscribe(UID, A), A), true);
  assert.equal(verifyUnsubscribe(UID, signUnsubscribe(UID, A), B), false);
  assert.equal(verifyUnsubscribe(UID, signUnsubscribe(UID, A), null), false);
});

test("verifyUnsubscribe: yaroqsiz uuid / token", () => {
  assert.equal(verifyUnsubscribe("not-a-uuid", signUnsubscribe(UID, A), A), false);
  assert.equal(verifyUnsubscribe(UID, 123, A), false);
  assert.equal(verifyUnsubscribe(UID, "x".repeat(200), A), false);
  assert.equal(verifyUnsubscribe(UID, "", A), false);
});

test("uuid katta harf bilan ham bir xil imzo", () =>
  assert.equal(verifyUnsubscribe(UID.toUpperCase(), signUnsubscribe(UID, A), A), true));

test("unsubscribeUrl imzosi tekshiruvdan o'tadi", () => {
  const u = new URL(unsubscribeUrl("https://soveregn.xyz", UID, A, "uz"));
  assert.equal(verifyUnsubscribe(u.searchParams.get("u"), u.searchParams.get("t"), [A]), true);
});

test("bearerMatches: to'g'ri / noto'g'ri / uzunligi boshqa / bo'sh", () => {
  assert.equal(bearerMatches(`Bearer ${A}`, A), true);
  assert.equal(bearerMatches(`Bearer ${B}`, A), false);
  assert.equal(bearerMatches(`Bearer ${A}x`, A), false);
  assert.equal(bearerMatches("Bearer", A), false);
  assert.equal(bearerMatches(A, A), false);
  assert.equal(bearerMatches(null, A), false);
  assert.equal(bearerMatches(`Bearer ${A}`, undefined), false);
  assert.equal(bearerMatches("Bearer ", ""), false);
});

console.warn = origWarn;
console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
