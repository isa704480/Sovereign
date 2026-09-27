/**
 * Limit kodlari (T14) — pure:
 *   npx tsx --conditions=react-server src/lib/ai/inquiry/limit-codes.test.ts
 */
import assert from "node:assert/strict";
import {
  LIMIT_CODE_HEADER,
  LIMIT_MARK,
  hasLimitMark,
  isLimitCode,
  limitErrorResponse,
  markLimit,
  splitErrorMarkers,
} from "./limit-codes";

let passed = 0;
let failed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
  } catch (e) {
    failed++;
    console.error(`✕ ${name}\n  ${(e as Error).message.split("\n").join("\n  ")}`);
  }
}

async function main() {
  await test("isLimitCode", () => {
    assert.ok(isLimitCode("user_limit"));
    assert.ok(isLimitCode("rate_limited"));
    assert.ok(isLimitCode("region"));
    assert.ok(!isLimitCode("server"));
    assert.ok(!isLimitCode(undefined));
    assert.ok(!isLimitCode(429));
  });

  await test("limitErrorResponse: user_limit — Retry-After yo'q, matn o'zgarmaydi", async () => {
    const r = limitErrorResponse("Oylik token limiti tugadi", "user_limit", 429);
    assert.equal(r.status, 429);
    assert.equal(r.headers.get(LIMIT_CODE_HEADER), "user_limit");
    assert.equal(r.headers.get("retry-after"), null);
    assert.deepEqual(await r.json(), { error: "Oylik token limiti tugadi", code: "user_limit" });
  });

  await test("limitErrorResponse: rate_limited — Retry-After butun, >=1", async () => {
    const r = limitErrorResponse("Juda ko'p so'rov", "rate_limited", 429, 0.2);
    assert.equal(r.headers.get("retry-after"), "1");
    const r2 = limitErrorResponse("x", "rate_limited", 429, 12.3);
    assert.equal(r2.headers.get("retry-after"), "13");
    assert.equal((await r2.json()).code, "rate_limited");
  });

  await test("limitErrorResponse: region 451", async () => {
    const r = limitErrorResponse("Mintaqa", "region", 451);
    assert.equal(r.status, 451);
    assert.equal((await r.json()).code, "region");
  });

  await test("limitErrorResponse: NaN retryAfter — sarlavha qo'yilmaydi", () => {
    const r = limitErrorResponse("x", "rate_limited", 429, Number.NaN);
    assert.equal(r.headers.get("retry-after"), null);
  });

  await test("markLimit: [upgrade] dan oldin, idempotent", () => {
    const m = markLimit("[upgrade] Kunlik limit tugadi");
    assert.equal(m, "[limit][upgrade] Kunlik limit tugadi");
    assert.equal(markLimit(m), m);
    assert.ok(markLimit("oddiy").startsWith(LIMIT_MARK));
  });

  await test("splitErrorMarkers: kanonik tartib", () => {
    assert.deepEqual(splitErrorMarkers("[limit][upgrade] Limit tugadi"), {
      limit: true,
      upgrade: true,
      text: "Limit tugadi",
    });
  });

  await test("splitErrorMarkers: teskari tartib va bo'sh joylar", () => {
    const s = splitErrorMarkers("[upgrade:ultra] [limit]  Oylik limit ");
    assert.equal(s.limit, true);
    assert.equal(s.upgrade, true);
    assert.equal(s.plan, "ultra");
    assert.equal(s.text, "Oylik limit");
  });

  await test("splitErrorMarkers: eski [upgrade] (limit emas) — orqaga moslik", () => {
    const s = splitErrorMarkers("[upgrade] Tadqiqot faqat Pro'da");
    assert.equal(s.limit, false);
    assert.equal(s.upgrade, true);
    assert.equal(s.plan, undefined);
    assert.equal(s.text, "Tadqiqot faqat Pro'da");
  });

  await test("splitErrorMarkers: markersiz matn o'zgarmaydi", () => {
    assert.deepEqual(splitErrorMarkers("Server xatosi"), { limit: false, upgrade: false, text: "Server xatosi" });
  });

  await test("splitErrorMarkers: matn ichidagi [limit] — marker emas", () => {
    const s = splitErrorMarkers("Xato: [limit] so'zi");
    assert.equal(s.limit, false);
    assert.equal(s.text, "Xato: [limit] so'zi");
    assert.ok(!hasLimitMark("Xato: [limit] so'zi"));
  });

  await test("splitErrorMarkers: [limit:x] — marker emas", () => {
    const s = splitErrorMarkers("[limit:x] matn");
    assert.equal(s.limit, false);
    assert.equal(s.text, "[limit:x] matn");
  });

  await test("splitErrorMarkers: patologik kirish — 4 tadan ortiq marker o'qilmaydi", () => {
    const s = splitErrorMarkers("[limit]".repeat(10) + "x");
    assert.equal(s.limit, true);
    assert.ok(s.text.startsWith("[limit]"));
  });

  await test("splitErrorMarkers: string bo'lmagan kirish", () => {
    assert.deepEqual(splitErrorMarkers(undefined as unknown as string), { limit: false, upgrade: false, text: "" });
  });

  console.log(`limit-codes: ${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}

void main();
