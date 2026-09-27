/**
 * Blind Prompting (blind-prompting.ts) — tarmoqsiz:
 *   npx tsx --conditions=react-server src/lib/ai/blind-prompting.test.ts
 * Tekshiriladi: mask/unmask aylanmasi, server konteksti uchun alohida [CTX_…] tokenlari
 * (mijoz tokenlari bilan to'qnashmaydi), xotiraga token yozilmasligi uchun hasMaskToken,
 * mijoz server xaritasini qabul qilishdan oldingi isMaskToken tekshiruvi.
 */
import assert from "node:assert/strict";
import { createMaskSession, createServerMaskSession, hasMaskToken, isMaskToken, mask, unmask } from "./blind-prompting";

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ✕ ${name}\n    ${e instanceof Error ? e.message : String(e)}`);
  }
}

test("mask → unmask aylanmasi (email, telefon, ism)", () => {
  const src = "Menga Ali Valiyev yozdi: ali@example.com, +998 90 123 45 67";
  const { masked, tokenMap } = mask(src);
  assert.ok(!masked.includes("ali@example.com"));
  assert.ok(!masked.includes("Ali Valiyev"));
  assert.ok(!masked.includes("123 45 67"));
  assert.equal(unmask(masked, tokenMap), src);
});

test("server konteksti: [CTX_…] tokenlari, mijoz tokenlari bilan to'qnashmaydi", () => {
  const client = createMaskSession();
  const server = createServerMaskSession();
  const c = mask("Aziz Karimov bilan gaplashdim", client);
  const s = mask("Xotira: foydalanuvchi hamkori Bobur Rahimov, pochta bobur@firma.uz", server);
  assert.match(c.masked, /\[PERSON_A\]/);
  assert.match(s.masked, /\[CTX_PERSON_A\]/);
  assert.match(s.masked, /\[CTX_EMAIL_A\]/);
  assert.ok(!s.masked.includes("Bobur Rahimov") && !s.masked.includes("bobur@firma.uz"));
  // Ikkala xarita birlashtirilsa ham har token o'z qiymatiga qaytadi.
  const merged = { ...c.tokenMap, ...s.tokenMap };
  const answer = "[PERSON_A] va [CTX_PERSON_A] uchrashadi";
  assert.equal(unmask(answer, merged), "Aziz Karimov va Bobur Rahimov uchrashadi");
});

test("server sessiyasi bir xil qiymatga bir xil token beradi (xotira + bilim bazasi)", () => {
  const server = createServerMaskSession();
  const a = mask("Loyiha egasi Dilshod Tursunov", server).masked;
  const b = mask("Hujjat muallifi: Dilshod Tursunov", server).masked;
  const tok = a.match(/\[CTX_PERSON_[A-Z]\]/)?.[0];
  assert.ok(tok);
  assert.ok(b.includes(tok));
});

test("hasMaskToken: maskalangan fakt xotiraga yozilmasligi uchun aniqlanadi", () => {
  for (const s of ["User's colleague is [PERSON_A]", "Email: [EMAIL_B]", "[CTX_ORG_A] loyihasi", "Ismi [NAME_1]", "Karta [CARD_12]"]) {
    assert.equal(hasMaskToken(s), true, s);
  }
  for (const s of ["User is a Python developer", "Loyiha: SOVEREIGN", "[1] manba", "array[i_0]", "[API_KEY]", "", null]) {
    assert.equal(hasMaskToken(s as string), false, String(s));
  }
  // mask() natijasi har doim aniqlanadi.
  assert.equal(hasMaskToken(mask("Mening ismim Sardor Aliyev").masked), true);
});

test("isMaskToken: mijoz faqat to'g'ri shakldagi tokenlarni qabul qiladi", () => {
  assert.equal(isMaskToken("[CTX_PERSON_A]"), true);
  assert.equal(isMaskToken("[PERSON_B]"), true);
  assert.equal(isMaskToken("<script>"), false);
  assert.equal(isMaskToken("[CTX_PERSON_A] extra"), false);
  assert.equal(isMaskToken(42), false);
  assert.equal(isMaskToken("a"), false);
});

test("bo'sh va PII'siz matn o'zgarmaydi", () => {
  const server = createServerMaskSession();
  assert.equal(mask("", server).masked, "");
  assert.equal(mask("foydalanuvchi TypeScript'ni afzal ko'radi", server).masked, "foydalanuvchi TypeScript'ni afzal ko'radi");
  assert.deepEqual(server.tokenMap, {});
});

console.log(`\n${passed} o'tdi, ${failed} yiqildi`);
if (failed) process.exit(1);
