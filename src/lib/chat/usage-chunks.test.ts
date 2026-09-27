/**
 * Lokal test: npx tsx --conditions=react-server src/lib/chat/usage-chunks.test.ts
 * Token sarfini ≤100k bo'laklarga bo'lish (record_token_usage chegarasi).
 */
import assert from "node:assert/strict";
import { billableTotal, splitUsage, USAGE_MAX_CHUNKS, USAGE_RECORD_MAX } from "./usage-chunks";

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

const sum = (cs: { input: number; output: number }[]) => cs.reduce((n, c) => n + c.input + c.output, 0);

test("kichik sarf — bitta bo'lak", () => {
  assert.deepEqual(splitUsage({ input: 1200, output: 300 }), [{ input: 1200, output: 300 }]);
});

test("nol sarf — bo'lak yo'q", () => {
  assert.deepEqual(splitUsage({ input: 0, output: 0 }), []);
});

test("katta sarf — har bo'lak ≤100k, jami saqlanadi", () => {
  const u = { input: 730_000, output: 4_500 };
  const cs = splitUsage(u);
  assert.ok(cs.every((c) => c.input + c.output <= USAGE_RECORD_MAX));
  assert.equal(sum(cs), 734_500);
  assert.equal(cs.length, 8);
});

test("chiqish ham to'liq hisoblanadi", () => {
  const cs = splitUsage({ input: 99_000, output: 5_000 });
  assert.deepEqual(cs, [
    { input: 99_000, output: 1_000 },
    { input: 0, output: 4_000 },
  ]);
});

test("bo'laklar chegarasi — cheksiz tsikl yo'q", () => {
  const cs = splitUsage({ input: 1e12, output: 0 });
  assert.equal(cs.length, USAGE_MAX_CHUNKS);
  assert.equal(billableTotal({ input: 1e12, output: 0 }), USAGE_MAX_CHUNKS * USAGE_RECORD_MAX);
});

test("manfiy / NaN — nol", () => {
  assert.deepEqual(splitUsage({ input: -5, output: Number.NaN }), []);
});

console.log(`usage-chunks: ${passed} o'tdi, ${failed} yiqildi`);
if (failed) process.exit(1);
