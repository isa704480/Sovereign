/**
 * Lokal test (tarmoqsiz, deterministik):
 *   npx tsx --conditions=react-server src/lib/cli/device.test.ts
 * CLI device-login yordamchilari: token kaliti, tarmoq solishtirish (phishing ogohlantirishi),
 * hakam navbatining tekin qismi va verify kunlik chegarasi.
 */
import assert from "node:assert/strict";
import {
  approxIp,
  bearerToken,
  describeDevice,
  countryOf,
  freeJudgePool,
  ipFromHeaders,
  isDeviceCode,
  needsExplicitConfirm,
  networkKey,
  networkMatch,
  sessionId,
  tokenKey,
  verifyDailyCap,
  estimateTokens,
} from "./device";

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

const req = (h: Record<string, string>) => new Request("https://api.test/x", { headers: h });

test("bearerToken: oddiy, bo'sh va juda uzun", () => {
  assert.equal(bearerToken(req({ authorization: "Bearer abc123" })), "abc123");
  assert.equal(bearerToken(req({ authorization: "bearer   xyz  " })), "xyz");
  assert.equal(bearerToken(req({})), null);
  assert.equal(bearerToken(req({ authorization: "Basic abc" })), null);
  assert.equal(bearerToken(req({ authorization: `Bearer ${"a".repeat(513)}` })), null);
});

test("tokenKey: sha256, token prefiksini oshkor qilmaydi", () => {
  const token = "a".repeat(64);
  const k = tokenKey(token);
  assert.match(k, /^[0-9a-f]{32}$/);
  assert.ok(!k.startsWith(token.slice(0, 8)));
  assert.equal(k, tokenKey(token));
  assert.notEqual(k, tokenKey("b".repeat(64)));
});

test("sessionId: barqaror, kodni oshkor qilmaydi", () => {
  const code = "0123456789abcdef".repeat(3);
  assert.match(sessionId(code), /^[0-9a-f]{24}$/);
  assert.equal(sessionId(code), sessionId(code));
  assert.ok(!code.includes(sessionId(code)));
});

test("isDeviceCode", () => {
  assert.ok(isDeviceCode("ab".repeat(24)));
  assert.ok(!isDeviceCode(""));
  assert.ok(!isDeviceCode("abc"));
  assert.ok(!isDeviceCode("zz".repeat(24)));
  assert.ok(!isDeviceCode("ab".repeat(24) + "'--"));
  assert.ok(!isDeviceCode(null));
});

test("countryOf / ipFromHeaders", () => {
  assert.equal(countryOf(new Headers({ "x-vercel-ip-country": "uz" })), "UZ");
  assert.equal(countryOf(new Headers({ "x-vercel-ip-country": "XX" })), null);
  assert.equal(countryOf(new Headers({ "x-vercel-ip-country": "USA" })), null);
  assert.equal(countryOf(new Headers()), null);
  assert.equal(ipFromHeaders(new Headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" })), "1.2.3.4");
  assert.equal(ipFromHeaders(new Headers({ "x-real-ip": "5.6.7.8" })), "5.6.7.8");
  assert.equal(ipFromHeaders(new Headers()), null);
});

test("networkKey: IPv6 /64 prefiks", () => {
  assert.equal(networkKey("1.2.3.4"), "1.2.3.4");
  assert.equal(networkKey("2001:db8:1:2:aaaa::1"), networkKey("2001:0db8:1:2:bbbb:cccc:dddd:eeee"));
  assert.notEqual(networkKey("2001:db8:1:2::1"), networkKey("2001:db8:1:3::1"));
  assert.equal(networkKey("unknown"), null);
  assert.equal(networkKey(""), null);
});

test("networkMatch: bir kompyuter → same", () => {
  assert.equal(networkMatch({ ip: "1.2.3.4", country: "UZ" }, { ip: "1.2.3.4", country: "UZ" }), "same");
  assert.equal(networkMatch({ ip: "2001:db8:1:2::1", country: "UZ" }, { ip: "2001:db8:1:2::9", country: "UZ" }), "same");
});

test("networkMatch: boshqa mamlakat → other-country (qat'iy tasdiq)", () => {
  const m = networkMatch({ ip: "9.9.9.9", country: "NL" }, { ip: "1.2.3.4", country: "UZ" });
  assert.equal(m, "other-country");
  assert.ok(needsExplicitConfirm(m));
});

test("networkMatch: shu mamlakat, boshqa IP (SSH/VPN/IPv6) → other-ip, tasdiqsiz", () => {
  const m = networkMatch({ ip: "9.9.9.9", country: "UZ" }, { ip: "1.2.3.4", country: "UZ" });
  assert.equal(m, "other-ip");
  assert.ok(!needsExplicitConfirm(m));
  assert.equal(networkMatch({ ip: "9.9.9.9", country: null }, { ip: "1.2.3.4", country: "UZ" }), "other-ip");
});

test("networkMatch: ma'lumot yo'q → unknown (eski qator / migratsiyasiz)", () => {
  assert.equal(networkMatch({}, { ip: "1.2.3.4", country: "UZ" }), "unknown");
  assert.equal(networkMatch({ ip: "1.2.3.4" }, { ip: null, country: null }), "unknown");
  assert.equal(networkMatch({ ip: null, country: "UZ" }, { ip: "1.2.3.4", country: "UZ" }), "unknown");
});

test("freeJudgePool: pullik yo'llar (mistral, openrouter) chiqariladi", () => {
  const pool = [
    { id: "a", route: "groq" },
    { id: "b", route: "cloudflare" },
    { id: "c", route: "omniroute" },
    { id: "d", route: "mistral" },
    { id: "e", route: "openrouter" },
  ];
  assert.deepEqual(
    freeJudgePool(pool).map((c) => c.id),
    ["a", "b", "c"],
  );
});

test("verifyDailyCap: pastki/yuqori chegara", () => {
  assert.equal(verifyDailyCap(30), 100);
  assert.equal(verifyDailyCap(150), 300);
  assert.equal(verifyDailyCap(1000), 2000);
  assert.equal(verifyDailyCap(1_000_000), 2000);
  assert.equal(verifyDailyCap(Number.NaN), 100);
});

test("estimateTokens", () => {
  assert.equal(estimateTokens(400), 100);
  assert.equal(estimateTokens(-5), 0);
  assert.equal(estimateTokens(Number.NaN), 0);
});

test("describeDevice: host / OS / ilova", () => {
  assert.deepEqual(describeDevice("DESKTOP-1 (win32)"), { host: "DESKTOP-1", os: "Windows", app: "CLI" });
  assert.deepEqual(describeDevice("mac.local (darwin) · Cowork"), { host: "mac.local", os: "macOS", app: "Cowork" });
  assert.deepEqual(describeDevice("box (linux)"), { host: "box", os: "Linux", app: "CLI" });
  assert.deepEqual(describeDevice("weird-name"), { host: "weird-name", os: null, app: "CLI" });
  assert.deepEqual(describeDevice(""), { host: "", os: null, app: null });
  assert.equal(describeDevice("a\u0007b (linux)").host, "a b");
});

test("approxIp: IPv4 /24, IPv6 /48, to'liq manzil ko'rsatilmaydi", () => {
  assert.equal(approxIp("203.0.113.77"), "203.0.113.x");
  assert.equal(approxIp("2001:db8:1:2::1"), "2001:db8:1::/48");
  assert.equal(approxIp("unknown"), null);
  assert.equal(approxIp(null), null);
  assert.equal(approxIp("1.2.3"), null);
});

console.log(`\ncli/device: ${passed} o'tdi, ${failed} xato`);
if (failed) process.exit(1);
