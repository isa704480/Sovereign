/**
 * Lokal test (tarmoqsiz): npx tsx --conditions=react-server src/lib/connectors/secret.test.ts
 * Connector tokenlarini shifrlash: aylanma, AAD bog'liqligi, eski ochiq qiymatlar,
 * kalitsiz rejim (orqaga moslik) va rotatsiya.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  hasPlaintextSecret,
  isSealed,
  sealConnectorConfig,
  sealField,
  tokenCryptoEnabled,
  unsealConnectorConfig,
  unsealField,
} from "./secret";

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

const K1 = randomBytes(32).toString("base64");
const K2 = randomBytes(32).toString("hex");
const U = "11111111-1111-1111-1111-111111111111";
const V = "22222222-2222-2222-2222-222222222222";

function withKeys(cur: string | undefined, prev: string | undefined, fn: () => void) {
  const a = process.env.CONNECTOR_TOKEN_KEY;
  const b = process.env.CONNECTOR_TOKEN_KEY_PREV;
  if (cur === undefined) delete process.env.CONNECTOR_TOKEN_KEY;
  else process.env.CONNECTOR_TOKEN_KEY = cur;
  if (prev === undefined) delete process.env.CONNECTOR_TOKEN_KEY_PREV;
  else process.env.CONNECTOR_TOKEN_KEY_PREV = prev;
  try {
    fn();
  } finally {
    if (a === undefined) delete process.env.CONNECTOR_TOKEN_KEY;
    else process.env.CONNECTOR_TOKEN_KEY = a;
    if (b === undefined) delete process.env.CONNECTOR_TOKEN_KEY_PREV;
    else process.env.CONNECTOR_TOKEN_KEY_PREV = b;
  }
}

test("kalitsiz: sealField o'zgartirmaydi, unsealField ochiqni qaytaradi", () =>
  withKeys(undefined, undefined, () => {
    assert.equal(tokenCryptoEnabled(), false);
    assert.equal(sealField("ghp_abc", U, "github", "token"), "ghp_abc");
    assert.equal(unsealField("ghp_abc", U, "github", "token"), "ghp_abc");
  }));

test("aylanma: seal → unseal (base64 va hex kalit)", () => {
  for (const k of [K1, K2]) {
    withKeys(k, undefined, () => {
      const s = sealField("ya29.secret-token", U, "gmail", "token");
      assert.ok(isSealed(s));
      assert.ok(!s.includes("ya29"));
      assert.equal(unsealField(s, U, "gmail", "token"), "ya29.secret-token");
      // Qayta shifrlanmaydi
      assert.equal(sealField(s, U, "gmail", "token"), s);
    });
  }
});

test("AAD: boshqa foydalanuvchi/connector/maydon — ochilmaydi", () =>
  withKeys(K1, undefined, () => {
    const s = sealField("tok", U, "gmail", "token");
    assert.equal(unsealField(s, V, "gmail", "token"), null);
    assert.equal(unsealField(s, U, "gsheets", "token"), null);
    assert.equal(unsealField(s, U, "gmail", "refresh"), null);
  }));

test("buzilgan shifr va noma'lum kalit — null", () =>
  withKeys(K1, undefined, () => {
    const s = sealField("tok", U, "gmail", "token");
    const parts = s.split(":");
    const ct = Buffer.from(parts[5], "base64url");
    ct[0] ^= 0xff;
    parts[5] = ct.toString("base64url");
    assert.equal(unsealField(parts.join(":"), U, "gmail", "token"), null);
    assert.equal(unsealField("enc:v1:deadbeef:x:y:z", U, "gmail", "token"), null);
    assert.equal(unsealField("enc:v1:garbage", U, "gmail", "token"), null);
  }));

test("rotatsiya: eski kalit PREV'da bo'lsa ochiladi, bo'lmasa null", () => {
  let s = "";
  withKeys(K1, undefined, () => {
    s = sealField("tok", U, "github", "token");
  });
  withKeys(K2, K1, () => assert.equal(unsealField(s, U, "github", "token"), "tok"));
  withKeys(K2, undefined, () => assert.equal(unsealField(s, U, "github", "token"), null));
});

test("noto'g'ri kalit uzunligi — shifrlash o'chiq", () =>
  withKeys("short", undefined, () => {
    const err = console.error;
    console.error = () => {};
    try {
      assert.equal(tokenCryptoEnabled(), false);
    } finally {
      console.error = err;
    }
  }));

test("config: token/refresh shifrlanadi, meta/oauth/url o'zgarmaydi; ochib bo'lmagani olib tashlanadi", () =>
  withKeys(K1, undefined, () => {
    const cfg = { oauth: true, token: "at", refresh: "rt", meta: "a@b.c", url: "https://x" };
    assert.equal(hasPlaintextSecret(cfg), true);
    const sealed = sealConnectorConfig(U, "gmail", cfg);
    assert.equal(hasPlaintextSecret(sealed), false);
    assert.equal(sealed.meta, "a@b.c");
    assert.equal(sealed.url, "https://x");
    assert.equal(sealed.oauth, true);
    assert.ok(isSealed(sealed.token) && isSealed(sealed.refresh));
    assert.deepEqual(unsealConnectorConfig(U, "gmail", sealed), cfg);
    const other = unsealConnectorConfig(V, "gmail", sealed);
    assert.equal("token" in other, false);
    assert.equal("refresh" in other, false);
    // refresh: null o'zgarishsiz qoladi
    const n = sealConnectorConfig(U, "gmail", { token: "at", refresh: null });
    assert.equal(n.refresh, null);
  }));

console.log(`${passed} o'tdi, ${failed} yiqildi`);
if (failed) process.exit(1);
