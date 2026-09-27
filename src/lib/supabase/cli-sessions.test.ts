/**
 * Lokal test (tarmoqsiz, deterministik): npx tsx --conditions=react-server src/lib/supabase/cli-sessions.test.ts
 * CLI / Cowork tokenlarini bekor qilish (auth-1) va sessiya cookie parametrlari (auth-3).
 */
import assert from "node:assert/strict";
import { listCliDevices, revokeAllCliSessions, revokeCliDevice, type CliRpcClient } from "./cli-sessions";
import { sessionCookieHttpOnly, sessionCookieOptions } from "./env";

type Call = { fn: string; args?: Record<string, unknown> };

function fake(opts: { rows?: unknown; listError?: string; revokeError?: string; owned?: Set<string> }): CliRpcClient & { calls: Call[] } {
  const calls: Call[] = [];
  return {
    calls,
    rpc(fn, args) {
      calls.push({ fn, args });
      if (fn === "cli_sessions_list") {
        return Promise.resolve(opts.listError ? { data: null, error: { message: opts.listError } } : { data: opts.rows ?? [], error: null });
      }
      if (fn === "cli_revoke") {
        if (opts.revokeError) return Promise.resolve({ data: null, error: { message: opts.revokeError } });
        const code = String(args?.p_code);
        return Promise.resolve({ data: opts.owned ? opts.owned.has(code) : true, error: null });
      }
      return Promise.resolve({ data: null, error: { message: `unknown rpc ${fn}` } });
    },
  };
}

const A = "a".repeat(48);
const B = "b".repeat(48);

async function main() {
  // Ro'yxat: noto'g'ri qatorlar tashlanadi, maydonlar camelCase.
  {
    const c = fake({ rows: [{ code: A, device_name: "laptop", created_at: "2026-01-01", expires_at: "2026-04-01", last_used_at: null }, { code: "" }, null, { device_name: "x" }] });
    const r = await listCliDevices(c);
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.devices.length, 1);
      assert.deepEqual(r.devices[0], { code: A, deviceName: "laptop", createdAt: "2026-01-01", expiresAt: "2026-04-01", lastUsedAt: null });
    }
  }
  // Hammasini bekor qilish: har bir kod uchun cli_revoke.
  {
    const c = fake({ rows: [{ code: A }, { code: B }] });
    const r = await revokeAllCliSessions(c);
    assert.deepEqual(r, { ok: true, revoked: 2 });
    assert.deepEqual(
      c.calls.filter((x) => x.fn === "cli_revoke").map((x) => x.args?.p_code).sort(),
      [A, B],
    );
  }
  // Bo'sh ro'yxat — muvaffaqiyat, 0.
  assert.deepEqual(await revokeAllCliSessions(fake({ rows: [] })), { ok: true, revoked: 0 });
  // Ro'yxat xatosi yoki revoke xatosi — ok:false (chaqiruvchi "o'chirildi" deb aldamaydi).
  assert.deepEqual(await revokeAllCliSessions(fake({ listError: "boom" })), { ok: false, error: "boom" });
  assert.deepEqual(await revokeAllCliSessions(fake({ rows: [{ code: A }], revokeError: "nope" })), { ok: false, error: "nope" });

  // Bitta qurilma: kod formati tekshiriladi; boshqa foydalanuvchining kodi → revoked 0.
  assert.deepEqual(await revokeCliDevice(fake({}), "short"), { ok: false, error: "invalid code" });
  assert.deepEqual(await revokeCliDevice(fake({ owned: new Set([A]) }), A), { ok: true, revoked: 1 });
  assert.deepEqual(await revokeCliDevice(fake({ owned: new Set([A]) }), B), { ok: true, revoked: 0 });

  // Cookie parametrlari: standart holat o'zgarmagan (backward-compatible).
  assert.deepEqual(sessionCookieOptions(undefined, false), { secure: false });
  assert.deepEqual(sessionCookieOptions(".soveregn.xyz", true), { domain: ".soveregn.xyz", secure: true });
  assert.deepEqual(sessionCookieOptions(".soveregn.xyz", true, true), {
    domain: ".soveregn.xyz",
    secure: true,
    httpOnly: true,
    sameSite: "lax",
  });
  const prev = process.env.SESSION_COOKIE_HTTPONLY;
  delete process.env.SESSION_COOKIE_HTTPONLY;
  assert.equal(sessionCookieHttpOnly(), false);
  process.env.SESSION_COOKIE_HTTPONLY = "1";
  assert.equal(sessionCookieHttpOnly(), true);
  if (prev === undefined) delete process.env.SESSION_COOKIE_HTTPONLY;
  else process.env.SESSION_COOKIE_HTTPONLY = prev;

  console.log("cli-sessions.test: OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
