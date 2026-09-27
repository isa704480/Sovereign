/**
 * Lokal test (tarmoqsiz, deterministik — baza va Redis soxta):
 *   npx tsx --conditions=react-server src/lib/cli/approve-flow.test.ts
 * Device-login tasdig'i: to'g'ri kod, noto'g'ri kod chegaralari (kod / foydalanuvchi / IP),
 * muddat, bir martalik ishlatish, boshqa foydalanuvchi, legacy yo'l va downgrade.
 */
import assert from "node:assert/strict";
import {
  CODE_MAX_FAILS,
  FAIL_WINDOW_MS,
  IP_MAX_FAILS,
  USER_MAX_FAILS,
  approveWithTypedCode,
  failureKeys,
  type ApproveDeps,
  type ApproveInput,
} from "./approve-flow";
import { cliCodeSecret, deriveUserCode, type CliSessionRow } from "./user-code";
import { formatUserCode } from "./user-code-format";

let passed = 0;
let failed = 0;
const queue: Array<[string, () => Promise<void>]> = [];
const test = (name: string, fn: () => Promise<void>) => queue.push([name, fn]);

const SECRET = cliCodeSecret({ CLI_USER_CODE_SECRET: "z".repeat(40) })!;
const T0 = Date.parse("2026-09-27T10:00:00Z");

/** Soxta "baza": device kodi → qator; cli_approve / cli_deny semantikasi bilan. */
function world() {
  let now = T0;
  const sessions = new Map<string, CliSessionRow>();
  const fails = new Map<string, { n: number; resetAt: number }>();
  const calls = { approve: 0, deny: 0 };
  let currentUser = "";
  const start = (code: string, minutes = 5) => {
    sessions.set(code, {
      approved: false,
      revoked_at: null,
      created_at: new Date(now).toISOString(),
      expires_at: new Date(now + minutes * 60_000).toISOString(),
      user_id: null,
    });
    return formatUserCode(deriveUserCode(code, SECRET));
  };
  const deps = (): ApproveDeps => ({
    now: () => now,
    secret: SECRET,
    failures: {
      async count(key) {
        const b = fails.get(key);
        return b && b.resetAt > now ? b.n : 0;
      },
      async record(key, windowMs) {
        const b = fails.get(key);
        const next = b && b.resetAt > now ? { n: b.n + 1, resetAt: b.resetAt } : { n: 1, resetAt: now + windowMs };
        fails.set(key, next);
        return next.n;
      },
    },
    async loadSession(code) {
      return sessions.get(code) ?? null;
    },
    async approve(code) {
      calls.approve++;
      const s = sessions.get(code);
      // cli_approve: faqat pending, muddati o'tmagan, bekor qilinmagan.
      if (!s || s.approved || s.revoked_at || Date.parse(s.expires_at) <= now) return false;
      s.approved = true;
      s.user_id = currentUser;
      s.expires_at = new Date(now + 90 * 86_400_000).toISOString();
      return true;
    },
    async deny(code) {
      calls.deny++;
      const s = sessions.get(code);
      if (s && !s.approved) s.revoked_at = new Date(now).toISOString();
    },
  });
  const run = (input: Partial<ApproveInput> & { deviceCode: string; typed: unknown }) => {
    currentUser = input.userId ?? "user-a";
    return approveWithTypedCode(deps(), { userId: "user-a", ip: "1.2.3.4", allowLegacy: false, ...input });
  };
  return {
    start,
    run,
    sessions,
    calls,
    failCount: (key: string) => fails.get(key)?.n ?? 0,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

const code = (seed: string) => seed.repeat(48 / seed.length).slice(0, 48);
const WRONG = "ZZZZ-ZZZZ";

test("to'g'ri kod → tasdiqlanadi va shu foydalanuvchiga bog'lanadi", async () => {
  const w = world();
  const dev = code("a1");
  const uc = w.start(dev);
  assert.deepEqual(await w.run({ deviceCode: dev, typed: uc.toLowerCase().replace("-", " ") }), { ok: true });
  assert.equal(w.sessions.get(dev)!.user_id, "user-a");
});

test("URL'ning o'zi yetmaydi: bo'sh / noto'g'ri formatdagi kod → malformed, tasdiqlanmaydi", async () => {
  const w = world();
  const dev = code("a2");
  w.start(dev);
  for (const typed of ["", "   ", "abc", undefined, null]) {
    const r = await w.run({ deviceCode: dev, typed });
    assert.deepEqual(r, { ok: false, reason: "malformed" });
  }
  assert.equal(w.calls.approve, 0);
  assert.equal(w.sessions.get(dev)!.approved, false);
});

test("noto'g'ri kod: qolgan urinishlar; 5-xatodan keyin sessiya bekor, to'g'ri kod ham o'tmaydi", async () => {
  const w = world();
  const dev = code("a3");
  const uc = w.start(dev);
  for (let i = 1; i < CODE_MAX_FAILS; i++) {
    const r = await w.run({ deviceCode: dev, typed: WRONG });
    assert.deepEqual(r, { ok: false, reason: "mismatch", remaining: CODE_MAX_FAILS - i });
  }
  assert.deepEqual(await w.run({ deviceCode: dev, typed: WRONG }), { ok: false, reason: "locked" });
  assert.equal(w.calls.deny, 1);
  assert.ok(w.sessions.get(dev)!.revoked_at);
  assert.deepEqual(await w.run({ deviceCode: dev, typed: uc }), { ok: false, reason: "locked" });
  assert.equal(w.calls.approve, 0);
});

test("kod qulfi boshqa foydalanuvchiga ham amal qiladi (kod bo'yicha hisob)", async () => {
  const w = world();
  const dev = code("a4");
  const uc = w.start(dev);
  for (let i = 0; i < CODE_MAX_FAILS; i++) await w.run({ deviceCode: dev, typed: WRONG, userId: `u${i}`, ip: `10.0.0.${i}` });
  assert.deepEqual(await w.run({ deviceCode: dev, typed: uc, userId: "fresh", ip: "9.9.9.9" }), { ok: false, reason: "locked" });
});

test("foydalanuvchi bo'yicha chegara: ko'p kodlar bo'ylab 10 xato → rate_limited; boshqa foydalanuvchi ishlaydi", async () => {
  const w = world();
  let n = 0;
  for (let i = 0; i < USER_MAX_FAILS; i++) {
    const dev = code(`b${i}`);
    w.start(dev);
    const r = await w.run({ deviceCode: dev, typed: WRONG, userId: "attacker", ip: `10.1.0.${i}` });
    assert.equal(r.ok, false);
    n++;
  }
  assert.equal(n, USER_MAX_FAILS);
  const dev = code("c9");
  const uc = w.start(dev);
  assert.deepEqual(await w.run({ deviceCode: dev, typed: uc, userId: "attacker", ip: "10.2.0.1" }), { ok: false, reason: "rate_limited" });
  assert.deepEqual(await w.run({ deviceCode: dev, typed: uc, userId: "victim", ip: "10.2.0.2" }), { ok: true });
});

test("IP bo'yicha chegara: bitta IP'dan 20 xato → rate_limited (hisoblar almashsa ham)", async () => {
  const w = world();
  for (let i = 0; i < IP_MAX_FAILS; i++) {
    const dev = code(`d${i.toString(16)}`);
    w.start(dev);
    await w.run({ deviceCode: dev, typed: WRONG, userId: `acct-${i}`, ip: "6.6.6.6" });
  }
  const dev = code("e7");
  const uc = w.start(dev);
  assert.deepEqual(await w.run({ deviceCode: dev, typed: uc, userId: "new-acct", ip: "6.6.6.6" }), { ok: false, reason: "rate_limited" });
  assert.deepEqual(await w.run({ deviceCode: dev, typed: uc, userId: "new-acct", ip: "7.7.7.7" }), { ok: true });
});

test("chegara oynasi o'tgach foydalanuvchi yana urina oladi", async () => {
  const w = world();
  for (let i = 0; i < USER_MAX_FAILS; i++) {
    const dev = code(`f${i}`);
    w.start(dev);
    await w.run({ deviceCode: dev, typed: WRONG, ip: `10.3.0.${i}` });
  }
  w.advance(FAIL_WINDOW_MS + 1);
  const dev = code("f9f");
  const uc = w.start(dev);
  assert.deepEqual(await w.run({ deviceCode: dev, typed: uc, ip: "10.3.1.1" }), { ok: true });
});

test("muddat: kod 10 daqiqadan (yoki sessiyadan) keyin ishlamaydi", async () => {
  const w = world();
  const dev = code("a5");
  const uc = w.start(dev, 60); // sessiya uzun bo'lsa ham
  w.advance(10 * 60_000 + 1);
  assert.deepEqual(await w.run({ deviceCode: dev, typed: uc }), { ok: false, reason: "expired" });
  const dev2 = code("a6");
  const uc2 = w.start(dev2, 5); // 0040: 5 daqiqa
  w.advance(5 * 60_000 + 1);
  assert.deepEqual(await w.run({ deviceCode: dev2, typed: uc2 }), { ok: false, reason: "expired" });
  assert.equal(w.calls.approve, 0);
});

test("muddati o'tgan sessiyada noto'g'ri kod urinish hisoblanmaydi", async () => {
  const w = world();
  const dev = code("a7");
  w.start(dev);
  w.advance(11 * 60_000);
  assert.deepEqual(await w.run({ deviceCode: dev, typed: WRONG }), { ok: false, reason: "expired" });
  const k = failureKeys({ deviceCode: dev, userId: "user-a", ip: "1.2.3.4" });
  assert.ok(k.code.startsWith("cli-uc:c:") && !k.code.includes(dev), "device kodi kalitda yo'q");
  assert.equal(w.failCount(k.code) + w.failCount(k.user) + w.failCount(k.ip!), 0);
});

test("bir martalik: tasdiqlangan kodni boshqa foydalanuvchi qayta ishlata olmaydi", async () => {
  const w = world();
  const dev = code("a8");
  const uc = w.start(dev);
  assert.deepEqual(await w.run({ deviceCode: dev, typed: uc, userId: "owner" }), { ok: true });
  assert.deepEqual(await w.run({ deviceCode: dev, typed: uc, userId: "intruder", ip: "5.5.5.5" }), { ok: false, reason: "used" });
  assert.equal(w.sessions.get(dev)!.user_id, "owner");
  // Egasi qayta bossa — idempotent (cli_approve semantikasi), yangi token yaratilmaydi.
  assert.deepEqual(await w.run({ deviceCode: dev, typed: uc, userId: "owner" }), { ok: true });
  assert.equal(w.calls.approve, 1);
});

test("boshqa sessiyaning kodi (to'g'ri formatda) → mismatch", async () => {
  const w = world();
  const devA = code("aa");
  const devB = code("bb");
  w.start(devA);
  const ucB = w.start(devB);
  assert.deepEqual(await w.run({ deviceCode: devA, typed: ucB }), { ok: false, reason: "mismatch", remaining: CODE_MAX_FAILS - 1 });
});

test("legacy: device boshi faqat legacy yo'lida; yangi sessiyada downgrade ishlamaydi", async () => {
  const w = world();
  const dev = "3fa9c1d2" + code("c1").slice(8);
  w.start(dev);
  assert.deepEqual(await w.run({ deviceCode: dev, typed: "3FA9C1D2", allowLegacy: false }), {
    ok: false,
    reason: "mismatch",
    remaining: CODE_MAX_FAILS - 1,
  });
  assert.deepEqual(await w.run({ deviceCode: dev, typed: "3fa9-c1d2", allowLegacy: true }), { ok: true });
});

test("server siri yo'q → unavailable; noto'g'ri device kodi → expired", async () => {
  const w = world();
  const dev = code("a9");
  const uc = w.start(dev);
  const noSecret = await approveWithTypedCode(
    { now: () => T0, secret: null, failures: { count: async () => 0, record: async () => 1 }, loadSession: async () => null, approve: async () => true, deny: async () => undefined },
    { deviceCode: dev, typed: uc, userId: "u", ip: null, allowLegacy: false },
  );
  assert.deepEqual(noSecret, { ok: false, reason: "unavailable" });
  assert.deepEqual(await w.run({ deviceCode: "not-a-code", typed: uc }), { ok: false, reason: "expired" });
});

test("baza xatosi → error (tasdiqlanmaydi)", async () => {
  const dev = code("ab");
  const uc = formatUserCode(deriveUserCode(dev, SECRET));
  const r = await approveWithTypedCode(
    { now: () => T0, secret: SECRET, failures: { count: async () => 0, record: async () => 1 }, loadSession: async () => "error", approve: async () => true, deny: async () => undefined },
    { deviceCode: dev, typed: uc, userId: "u", ip: null, allowLegacy: false },
  );
  assert.deepEqual(r, { ok: false, reason: "error" });
});

(async () => {
  for (const [name, fn] of queue) {
    try {
      await fn();
      passed++;
    } catch (e) {
      failed++;
      console.error(`✕ ${name}\n  ${(e as Error).message.split("\n").join("\n  ")}`);
    }
  }
  console.log(`\ncli/approve-flow: ${passed} o'tdi, ${failed} xato`);
  if (failed) process.exit(1);
})();
