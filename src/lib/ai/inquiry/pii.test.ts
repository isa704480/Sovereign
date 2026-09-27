/**
 * Inquiry xotirasi uchun PII filtri — pure, tarmoqsiz:
 *   npx tsx --conditions=react-server src/lib/ai/inquiry/pii.test.ts
 */
import assert from "node:assert/strict";
import { containsPii, detectPii } from "./pii";

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

test("email", () => {
  assert.equal(detectPii("Email: ali.valiyev+work@example.uz"), "email");
  assert.equal(detectPii("Почта: иван@почта.рф"), "email");
});

test("telefon: xalqaro va mahalliy formatlar", () => {
  for (const t of ["+998 90 123 45 67", "+998901234567", "90 123-45-67", "8 (912) 345-67-89", "Тел: 901234567", "123-45-67"]) {
    assert.equal(detectPii(t), "phone", t);
  }
});

test("bank karta (Luhn) va 16 raqam", () => {
  assert.equal(detectPii("Karta: 4111 1111 1111 1111"), "card");
  assert.equal(detectPii("8600-1234-5678-9012"), "card");
  assert.equal(detectPii("5555555555554444"), "card");
});

test("JShShIR / PINFL — 14 raqam", () => {
  assert.equal(detectPii("JShShIR 31234567890123"), "secret"); // kalit so'z birinchi ushlanadi
  assert.equal(detectPii("Raqamim 31234567890123"), "pinfl");
});

test("pasport seriya-raqami", () => {
  assert.equal(detectPii("AA1234567"), "passport");
  assert.equal(detectPii("hujjat: AD 7654321"), "passport");
});

test("IBAN", () => {
  assert.equal(detectPii("DE89 3704 0044 0532 0130 00"), "iban");
  assert.equal(detectPii("GB29NWBK60161331926819"), "iban");
});

test("API kalit / token / private key", () => {
  for (const t of [
    "sk-or-v1-0123456789abcdef0123456789abcdef",
    "sk-ant-api03-AbCdEfGhIjKlMnOpQrStUv",
    "AKIAIOSFODNN7EXAMPLE",
    "ghp_0123456789abcdefghijABCDEFGHIJ",
    "xoxb-1234567890-abcdefghij",
    "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U",
    "token: a8f5f167f44f4964e6c998dee827110c",
    "Q2hhbmdlTWUxMjM0NTY3ODkwYWJjZGVmZ2hpams",
  ]) {
    assert.equal(detectPii(t), "api_key", t);
  }
});

test("PEM private key — tashlanadi (kalit so'z yoki format)", () => {
  assert.equal(containsPii("-----BEGIN RSA PRIVATE KEY-----"), true);
  assert.equal(containsPii("-----BEGIN OPENSSH PRIVATE KEY-----"), true);
});

test("sirlar (4 tilda): parol, PIN, CVV, SMS kod", () => {
  for (const t of ["Parolim: qwerty", "Пароль 1234", "PIN 1234", "CVV 123", "SMS kod 4455", "пин-код 0000"]) {
    assert.equal(detectPii(t), "secret", t);
  }
});

test("PII emas: summalar, sanalar, yillar, oddiy faktlar", () => {
  for (const t of [
    "Mamlakat: O'zbekiston",
    "Summa: 12 000 000 so'm",
    "Сумма: 120 000 000 сум",
    "Zarar 120000000 so'm",
    "Budjet $5,000 - $10,000",
    "5 000 000 - 10 000 000 so'm",
    "Sana: 2026-09-03",
    "03.09.2026 - 10.09.2026",
    "Ish staji: 7 yil",
    "Yosh: 34",
    "Jurisdiction: Uzbekistan, Tashkent",
    "Срок: 3 месяца",
    "Node.js 22, Next.js 16",
    "Оклад 15 000 000 сум в месяц",
    "Toshkentda, 2026-yil 3-sentabrda qo'shnim 12 mln so'mlik zarar yetkazdi, dalolatnoma bor",
  ]) {
    assert.equal(detectPii(t), null, t);
  }
});

test("containsPii / yaroqsiz kirish", () => {
  assert.equal(containsPii(""), false);
  assert.equal(containsPii(undefined as unknown as string), false);
  assert.equal(containsPii("Telefon +998 71 200 00 00"), true);
});

test("ko'rinmas/kenglikdagi raqamlar NFKC bilan normallashadi", () => {
  // to'liq kenglikdagi raqamlar (fullwidth)
  assert.equal(detectPii("＋９９８９０１２３４５６７"), "phone");
});

console.log(`\npii: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
