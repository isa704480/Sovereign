import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { EMAIL_KEY, isPlausibleToken, maskToken, TOKEN_KEY, TokenStore, type SecretStorageLike } from "../src/core/secrets";

/** VS Code SecretStorage o'rniga soxta ombor — testda haqiqiy kalit saqlagich kerak emas. */
class FakeSecrets implements SecretStorageLike {
  readonly map = new Map<string, string>();
  readonly log: string[] = [];

  async get(key: string): Promise<string | undefined> {
    this.log.push(`get:${key}`);
    return this.map.get(key);
  }
  async store(key: string, value: string): Promise<void> {
    this.log.push(`store:${key}`);
    this.map.set(key, value);
  }
  async delete(key: string): Promise<void> {
    this.log.push(`delete:${key}`);
    this.map.delete(key);
  }
}

const GOOD = "sov_" + "a".repeat(40);

describe("isPlausibleToken", () => {
  it("to'g'ri token", () => {
    assert.equal(isPlausibleToken(GOOD), true);
  });
  it("juda qisqa / juda uzun", () => {
    assert.equal(isPlausibleToken("abc"), false);
    assert.equal(isPlausibleToken("a".repeat(513)), false);
  });
  it("bo'shliq va boshqaruv belgisi — sarlavha (header) buzilishining oldi olinadi", () => {
    assert.equal(isPlausibleToken(`${GOOD}\r\nX-Evil: 1`), false);
    assert.equal(isPlausibleToken(`${GOOD} ${GOOD}`), false);
    assert.equal(isPlausibleToken(`${GOOD}\u0000`), false);
  });
  it("matn bo'lmagan qiymatlar", () => {
    for (const v of [null, undefined, 123, {}, []]) assert.equal(isPlausibleToken(v), false);
  });
});

describe("maskToken", () => {
  it("tokenning o'zini chiqarmaydi", () => {
    const masked = maskToken(GOOD);
    assert.ok(!masked.includes(GOOD));
    assert.equal(masked, "…aaaa (44)");
    assert.equal(maskToken(null), "—");
  });
});

describe("TokenStore", () => {
  it("saqlaydi, o'qiydi va o'chiradi", async () => {
    const fake = new FakeSecrets();
    const store = new TokenStore(fake);

    assert.equal(await store.get(), null);
    assert.equal(await store.has(), false);

    assert.equal(await store.set(GOOD, "a@b.com"), true);
    assert.equal(fake.map.get(TOKEN_KEY), GOOD);
    assert.equal(fake.map.get(EMAIL_KEY), "a@b.com");
    assert.equal(await store.get(), GOOD);
    assert.equal(await store.email(), "a@b.com");
    assert.equal(await store.has(), true);

    await store.clear();
    assert.equal(fake.map.size, 0);
    assert.equal(await store.get(), null);
  });

  it("yaroqsiz tokenni saqlamaydi", async () => {
    const fake = new FakeSecrets();
    const store = new TokenStore(fake);
    assert.equal(await store.set("short"), false);
    assert.equal(await store.set(`${GOOD}\nX: y`), false);
    assert.equal(fake.map.size, 0);
    assert.ok(!fake.log.some((l) => l.startsWith("store:")));
  });

  it("omborda buzilgan qiymat bo'lsa null qaytaradi", async () => {
    const fake = new FakeSecrets();
    fake.map.set(TOKEN_KEY, "x");
    assert.equal(await new TokenStore(fake).get(), null);
  });

  it("bo'sh e-pochta yozilmaydi", async () => {
    const fake = new FakeSecrets();
    const store = new TokenStore(fake);
    await store.set(GOOD, "   ");
    assert.equal(fake.map.has(EMAIL_KEY), false);
    assert.equal(await store.email(), null);
  });

  it("token faqat SecretStorage kalitlarida — boshqa kalit yozilmaydi", async () => {
    const fake = new FakeSecrets();
    await new TokenStore(fake).set(GOOD, "a@b.com");
    assert.deepEqual([...fake.map.keys()].sort(), [EMAIL_KEY, TOKEN_KEY].sort());
  });
});
