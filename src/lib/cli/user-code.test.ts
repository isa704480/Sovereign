/**
 * Lokal test (tarmoqsiz, deterministik):
 *   npx tsx --conditions=react-server src/lib/cli/user-code.test.ts
 * Device-login user code: generatsiya, normalizatsiya (katta/kichik harf, chiziqcha, chalkash
 * belgilar, kirill klaviaturasi), eski mijoz kodi, URL handle, muddat va sessiya holati.
 */
import assert from "node:assert/strict";
import {
  LEGACY_CODE_LENGTH,
  USER_CODE_ALPHABET,
  USER_CODE_LENGTH,
  formatUserCode,
  normalizeLegacyCode,
  normalizeUserCode,
  prettifyTyping,
} from "./user-code-format";
import {
  USER_CODE_TTL_MS,
  checkTypedCode,
  cliCodeSecret,
  deriveUserCode,
  legacyLoginEnabled,
  openDeviceCode,
  resolveLoginRef,
  sealDeviceCode,
  sessionState,
  type CliSessionRow,
} from "./user-code";

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

const SECRET = cliCodeSecret({ CLI_USER_CODE_SECRET: "x".repeat(40) })!;
const OTHER_SECRET = cliCodeSecret({ CLI_USER_CODE_SECRET: "y".repeat(40) })!;
const DEV = "3fa9c1d2" + "0123456789abcdef".repeat(2) + "00112233aabbccdd"; // 48 hex
const DEV2 = "b".repeat(48);

// ── Alifbo va generatsiya ────────────────────────────────────────────────────

test("alifbo: 32 ta noyob belgi, chalkash I/L/O/U yo'q", () => {
  assert.equal(USER_CODE_ALPHABET.length, 32);
  assert.equal(new Set(USER_CODE_ALPHABET).size, 32);
  for (const ch of "ILOU") assert.ok(!USER_CODE_ALPHABET.includes(ch), ch);
});

test("deriveUserCode: 8 belgi, faqat alifbodan, deterministik", () => {
  const c = deriveUserCode(DEV, SECRET);
  assert.equal(c.length, USER_CODE_LENGTH);
  for (const ch of c) assert.ok(USER_CODE_ALPHABET.includes(ch), ch);
  assert.equal(deriveUserCode(DEV, SECRET), c);
  assert.equal(deriveUserCode(DEV.toUpperCase(), SECRET), c, "device kodi registri ta'sir qilmaydi");
});

test("deriveUserCode: boshqa device kodi / boshqa sir → boshqa kod", () => {
  assert.notEqual(deriveUserCode(DEV, SECRET), deriveUserCode(DEV2, SECRET));
  assert.notEqual(deriveUserCode(DEV, SECRET), deriveUserCode(DEV, OTHER_SECRET));
});

test("deriveUserCode: taqsimot taxminan tekis (bias yo'q)", () => {
  const counts = new Map<string, number>();
  const N = 4000;
  for (let i = 0; i < N; i++) {
    for (const ch of deriveUserCode(i.toString(16).padStart(48, "0"), SECRET)) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  }
  const expected = (N * USER_CODE_LENGTH) / 32; // 1000
  assert.equal(counts.size, 32, "hamma belgi uchraydi");
  for (const [ch, n] of counts) assert.ok(n > expected * 0.8 && n < expected * 1.2, `${ch}: ${n}`);
});

test("deriveUserCode: device kodining boshini oshkor qilmaydi", () => {
  const c = deriveUserCode(DEV, SECRET).toLowerCase();
  assert.notEqual(c, DEV.slice(0, 8));
});

// ── Normalizatsiya ───────────────────────────────────────────────────────────

test("normalizeUserCode: katta/kichik harf, chiziqcha, bo'sh joy", () => {
  assert.equal(normalizeUserCode("ABCD-1234"), "ABCD1234");
  assert.equal(normalizeUserCode("abcd-1234"), "ABCD1234");
  assert.equal(normalizeUserCode("  ab cd 12 34 "), "ABCD1234");
  assert.equal(normalizeUserCode("ABCD—1234"), "ABCD1234"); // em-dash
  assert.equal(normalizeUserCode("ABCD_12.34"), "ABCD1234");
  assert.equal(formatUserCode("abcd1234"), "ABCD-1234");
});

test("normalizeUserCode: chalkash belgilar O→0, I/L→1", () => {
  assert.equal(normalizeUserCode("OOOO-IIII"), "00001111");
  assert.equal(normalizeUserCode("oooo-llll"), "00001111");
  assert.equal(normalizeUserCode("A0B1-C0D1"), normalizeUserCode("AOBI-CODL"));
});

test("normalizeUserCode: kirill klaviaturasi va to'liq kenglik", () => {
  // А В Е К М Н Р С Т Х (kirill) → lotin; О → 0
  assert.equal(normalizeUserCode("АВЕК-МНРС"), "ABEKMHPC");
  assert.equal(normalizeUserCode("тхо3-аbcd"), "TX03ABCD");
  assert.equal(normalizeUserCode("ＡＢＣＤ－１２３４"), "ABCD1234"); // full-width
});

test("normalizeUserCode: noto'g'ri → null", () => {
  assert.equal(normalizeUserCode(""), null);
  assert.equal(normalizeUserCode("ABCD-123"), null); // 7
  assert.equal(normalizeUserCode("ABCD-12345"), null); // 9
  assert.equal(normalizeUserCode("ABCU-1234"), null); // U alifboda yo'q
  assert.equal(normalizeUserCode("ABC!-1234"), null);
  assert.equal(normalizeUserCode("ЖЖЖЖ-1234"), null);
  assert.equal(normalizeUserCode(null), null);
  assert.equal(normalizeUserCode(12345678), null);
  assert.equal(normalizeUserCode("A".repeat(100)), null);
  assert.equal(formatUserCode("nope"), "");
});

test("derive → format → normalize aylanishi", () => {
  for (const d of [DEV, DEV2, "c".repeat(48)]) {
    const c = deriveUserCode(d, SECRET);
    assert.equal(normalizeUserCode(formatUserCode(c)), c);
    assert.equal(normalizeUserCode(formatUserCode(c).toLowerCase()), c);
  }
});

test("normalizeLegacyCode: hex, 8 belgi, O/I/L kechiriladi", () => {
  assert.equal(LEGACY_CODE_LENGTH, 8);
  assert.equal(normalizeLegacyCode("3FA9C1D2"), "3fa9c1d2");
  assert.equal(normalizeLegacyCode("3fa9 c1d2"), "3fa9c1d2");
  assert.equal(normalizeLegacyCode("3fa9-cld2"), "3fa9c1d2"); // l → 1
  assert.equal(normalizeLegacyCode("0O00-1I1l"), "00001111");
  assert.equal(normalizeLegacyCode("3fa9c1d"), null);
  assert.equal(normalizeLegacyCode("3fa9c1dz"), null);
});

test("prettifyTyping: terish paytida formatlash", () => {
  assert.equal(prettifyTyping("abcd", "code"), "ABCD");
  assert.equal(prettifyTyping("abcd1", "code"), "ABCD-1");
  assert.equal(prettifyTyping("ab cd-12 34 99", "code"), "ABCD-1234");
  assert.equal(prettifyTyping("3FA9C1D2FFFF", "legacy"), "3fa9c1d2");
});

// ── Tekshiruv ────────────────────────────────────────────────────────────────

test("checkTypedCode: to'g'ri kod (har xil yozilishda) → ok", () => {
  const code = formatUserCode(deriveUserCode(DEV, SECRET));
  for (const typed of [code, code.toLowerCase(), code.replace("-", ""), ` ${code.replace("-", " ")} `]) {
    assert.equal(checkTypedCode({ deviceCode: DEV, typed, secret: SECRET, allowLegacy: false }), "ok", typed);
  }
});

test("checkTypedCode: boshqa sessiya kodi / boshqa sir → mismatch", () => {
  const other = formatUserCode(deriveUserCode(DEV2, SECRET));
  assert.equal(checkTypedCode({ deviceCode: DEV, typed: other, secret: SECRET, allowLegacy: false }), "mismatch");
  const code = formatUserCode(deriveUserCode(DEV, SECRET));
  assert.equal(checkTypedCode({ deviceCode: DEV, typed: code, secret: OTHER_SECRET, allowLegacy: false }), "mismatch");
});

test("checkTypedCode: format xato → malformed", () => {
  assert.equal(checkTypedCode({ deviceCode: DEV, typed: "abc", secret: SECRET, allowLegacy: false }), "malformed");
  assert.equal(checkTypedCode({ deviceCode: DEV, typed: "", secret: SECRET, allowLegacy: true }), "malformed");
});

test("checkTypedCode: eski kod (device boshi) faqat legacy yo'lida", () => {
  const prefix = DEV.slice(0, 8);
  // Yangi yo'l: device kodining boshi QABUL QILINMAYDI (downgrade yo'q).
  assert.equal(checkTypedCode({ deviceCode: DEV, typed: prefix, secret: SECRET, allowLegacy: false }), "mismatch");
  assert.equal(checkTypedCode({ deviceCode: DEV, typed: prefix, secret: SECRET, allowLegacy: true }), "ok");
  assert.equal(checkTypedCode({ deviceCode: DEV, typed: prefix.toUpperCase(), secret: SECRET, allowLegacy: true }), "ok");
  assert.equal(checkTypedCode({ deviceCode: DEV, typed: DEV.slice(8, 16), secret: SECRET, allowLegacy: true }), "mismatch");
  // Legacy yo'lida user code ham ishlaydi.
  const code = formatUserCode(deriveUserCode(DEV, SECRET));
  assert.equal(checkTypedCode({ deviceCode: DEV, typed: code, secret: SECRET, allowLegacy: true }), "ok");
});

// ── Handle (URL'da device kodi o'rniga) ─────────────────────────────────────

test("sealDeviceCode / openDeviceCode: aylanish, device kodi URL'da ko'rinmaydi", () => {
  const h = sealDeviceCode(DEV, SECRET);
  assert.match(h, /^[A-Za-z0-9_-]+$/);
  assert.ok(!h.includes(DEV.slice(0, 8)));
  assert.ok(h.length <= 200);
  assert.equal(openDeviceCode(h, SECRET), DEV);
  assert.notEqual(sealDeviceCode(DEV, SECRET), h, "har safar yangi IV");
});

test("openDeviceCode: boshqa sir / buzilgan / soxta → null", () => {
  const h = sealDeviceCode(DEV, SECRET);
  assert.equal(openDeviceCode(h, OTHER_SECRET), null);
  const flipped = h.slice(0, 20) + (h[20] === "A" ? "B" : "A") + h.slice(21);
  assert.equal(openDeviceCode(flipped, SECRET), null);
  assert.equal(openDeviceCode(DEV, SECRET), null);
  assert.equal(openDeviceCode("", SECRET), null);
  assert.equal(openDeviceCode(h, null), null);
  assert.equal(openDeviceCode("a".repeat(300), SECRET), null);
});

test("resolveLoginRef: h → yangi, code → legacy, o'chirilgan legacy", () => {
  const h = sealDeviceCode(DEV, SECRET);
  assert.deepEqual(resolveLoginRef({ kind: "h", value: h }, SECRET, true), { ok: true, deviceCode: DEV, legacy: false });
  assert.deepEqual(resolveLoginRef({ kind: "code", value: DEV }, SECRET, true), { ok: true, deviceCode: DEV, legacy: true });
  assert.deepEqual(resolveLoginRef({ kind: "code", value: DEV }, SECRET, false), { ok: false, reason: "legacy_disabled" });
  assert.deepEqual(resolveLoginRef({ kind: "code", value: "zz" }, SECRET, true), { ok: false, reason: "invalid" });
  assert.deepEqual(resolveLoginRef({ kind: "h", value: DEV }, SECRET, true), { ok: false, reason: "invalid" });
  assert.deepEqual(resolveLoginRef(null, SECRET, true), { ok: false, reason: "invalid" });
  assert.deepEqual(resolveLoginRef({ kind: "x", value: DEV }, SECRET, true), { ok: false, reason: "invalid" });
});

test("legacyLoginEnabled: standart yoqilgan, off/0/false — o'chirilgan", () => {
  assert.equal(legacyLoginEnabled({}), true);
  assert.equal(legacyLoginEnabled({ CLI_LEGACY_LOGIN: "on" }), true);
  for (const v of ["off", "0", "false", "OFF", " no "]) assert.equal(legacyLoginEnabled({ CLI_LEGACY_LOGIN: v }), false, v);
});

test("cliCodeSecret: maxsus sir → service role fallback → null", () => {
  const a = cliCodeSecret({ CLI_USER_CODE_SECRET: "s".repeat(32), SUPABASE_SERVICE_ROLE_KEY: "k".repeat(40) });
  const b = cliCodeSecret({ SUPABASE_SERVICE_ROLE_KEY: "k".repeat(40) });
  assert.ok(a && b && !a.equals(b));
  // Juda qisqa maxsus sir e'tiborga olinmaydi (service role'ga qaytadi).
  assert.ok(cliCodeSecret({ CLI_USER_CODE_SECRET: "short", SUPABASE_SERVICE_ROLE_KEY: "k".repeat(40) })!.equals(b!));
  assert.equal(cliCodeSecret({}), null);
  // Hosil qilingan sir kalitning o'zi emas.
  assert.ok(!b!.toString("utf8").includes("kkkk"));
});

// ── Muddat va sessiya holati ────────────────────────────────────────────────

const T0 = Date.parse("2026-09-27T10:00:00Z");
const row = (p: Partial<CliSessionRow> = {}): CliSessionRow => ({
  approved: false,
  revoked_at: null,
  created_at: new Date(T0).toISOString(),
  expires_at: new Date(T0 + 10 * 60_000).toISOString(),
  user_id: null,
  ...p,
});

test("sessionState: muddat — 10 daqiqa (yoki sessiya muddati, qaysi biri oldin)", () => {
  assert.equal(USER_CODE_TTL_MS, 600_000);
  assert.equal(sessionState(row(), "u1", T0 + 9 * 60_000), "pending");
  assert.equal(sessionState(row(), "u1", T0 + 10 * 60_000), "expired");
  // 0040: sessiya 5 daqiqa → kod ham 5 daqiqa.
  const short = row({ expires_at: new Date(T0 + 5 * 60_000).toISOString() });
  assert.equal(sessionState(short, "u1", T0 + 4 * 60_000), "pending");
  assert.equal(sessionState(short, "u1", T0 + 6 * 60_000), "expired");
  // Sessiya uzoqroq bo'lsa ham (masalan, eski default) kod 10 daqiqadan oshmaydi.
  const long = row({ expires_at: new Date(T0 + 60 * 60_000).toISOString() });
  assert.equal(sessionState(long, "u1", T0 + 11 * 60_000), "expired");
});

test("sessionState: bir martalik va boshqa foydalanuvchi", () => {
  assert.equal(sessionState(row({ approved: true, user_id: "u1" }), "u1", T0), "approved_self");
  assert.equal(sessionState(row({ approved: true, user_id: "u1" }), "u2", T0), "used");
  assert.equal(sessionState(row({ approved: true, user_id: null }), "u2", T0), "used");
  assert.equal(sessionState(row({ revoked_at: new Date(T0).toISOString() }), "u1", T0), "expired");
  assert.equal(sessionState(null, "u1", T0), "expired");
  assert.equal(sessionState(row({ created_at: "garbage" }), "u1", T0), "expired");
});

console.log(`\ncli/user-code: ${passed} o'tdi, ${failed} xato`);
if (failed) process.exit(1);
