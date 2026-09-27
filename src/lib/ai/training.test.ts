/**
 * Lokal test (bazasiz): npx tsx --conditions=react-server src/lib/ai/training.test.ts
 * Trening namunasi yozilishi: biriktirilgan fayl va sirlar rad etiladi.
 */
import assert from "node:assert/strict";
import { captureVerdict, type CaptureInput } from "./training";

process.env.TRAINING_CAPTURE = "on";

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

const ANSWER = "Bu javob trening uchun yetarlicha uzun bo'lishi kerak. ".repeat(4);
const base = (question: string, answer = ANSWER): CaptureInput => ({ question, answer, model: "m", hasPrivateContext: false, optedIn: true });

test("oddiy savol — yoziladi", () => {
  assert.equal(captureVerdict(base("Fotosintez qanday ishlaydi?")).reason, "ok");
});

test("biriktirilgan fayl — rad", () => {
  const q = "Bu faylda nima bor?\n\n[Fayl: .env]\nDB=1\n[/Fayl]";
  assert.equal(captureVerdict(base(q)).reason, "attachment");
  assert.equal(captureVerdict(base("[TRANSKRIPT: a.ogg]\nsalom dunyo\n[/TRANSKRIPT]")).reason, "attachment");
});

test("sirlar — rad", () => {
  const secrets = [
    "Bu JWT nima: eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.abc",
    "AWS kaliti AKIAABCDEFGHIJKLMNOP ishlamayapti",
    "ulanish: postgres://admin:Sup3rS3cret@10.0.0.5:5432/app",
    "-----BEGIN PRIVATE KEY----- nima qilay",
    "DATABASE_URL=postgresqlxxxxxxxxxxxxxxxx qayerga yoziladi?",
    "token ghp_abcdefghijklmnopqrstuvwxyz0123 ishlamaydi",
  ];
  for (const q of secrets) assert.equal(captureVerdict(base(q)).reason, "secret", q);
});

test("javobdagi sir ham rad", () => {
  assert.equal(captureVerdict(base("Misol ulanish satri ber", `${ANSWER} postgres://u:p4ssword@localhost/db`)).reason, "secret");
});

test("shaxsiy kontekst — rad", () => {
  assert.equal(captureVerdict({ ...base("Fotosintez qanday ishlaydi?"), hasPrivateContext: true }).reason, "private-context");
});

console.log(`training: ${passed} o'tdi, ${failed} yiqildi`);
if (failed) process.exit(1);
