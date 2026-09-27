/** npx tsx --conditions=react-server src/lib/cli/sanitize-history.test.ts */
import assert from "node:assert/strict";
import { sanitizeHistory } from "./sanitize-history";

let ok = 0;
let fail = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    ok++;
  } catch (e) {
    fail++;
    console.log("✕", name, "\n ", (e as Error).message);
  }
}
type M = Parameters<typeof sanitizeHistory>[0][number];
const call = (id: unknown, name = "write_file", args: unknown = '{"path":"a"}') => ({ id, type: "function", function: { name, arguments: args } });

test("toza tarix o'zgarmaydi", () => {
  const h: M[] = [
    { role: "system", content: "s" },
    { role: "user", content: "u" },
    { role: "assistant", content: null, tool_calls: [call("c1")] },
    { role: "tool", tool_call_id: "c1", content: "ok" },
    { role: "assistant", content: "done" },
  ];
  assert.deepEqual(sanitizeHistory(h), h);
});

test("id'siz chaqiruv — id yaratiladi va tool natijasi unga bog'lanadi", () => {
  const r = sanitizeHistory([
    { role: "user", content: "u" },
    { role: "assistant", content: null, tool_calls: [call("")] },
    { role: "tool", tool_call_id: "", content: "ok" },
  ] as M[]);
  const id = (r[1].tool_calls![0] as { id: string }).id;
  assert.ok(id.length > 0);
  assert.equal(r[2].tool_call_id, id);
});

test("argumentlar obyekt bo'lsa — JSON satr; yo'q bo'lsa {}", () => {
  const r = sanitizeHistory([
    { role: "user", content: "u" },
    { role: "assistant", content: null, tool_calls: [call("a", "x", { p: 1 }), call("b", "y", null)] },
    { role: "tool", tool_call_id: "a", content: "1" },
    { role: "tool", tool_call_id: "b", content: "2" },
  ] as M[]);
  const calls = r[1].tool_calls as { function: { arguments: string } }[];
  assert.equal(calls[0].function.arguments, '{"p":1}');
  assert.equal(calls[1].function.arguments, "{}");
});

test("null / bo'sh tool_calls va bo'sh content — assistant xabari tashlanadi", () => {
  const r = sanitizeHistory([
    { role: "user", content: "u" },
    { role: "assistant", content: null, tool_calls: null as unknown as unknown[] },
    { role: "assistant", content: "", tool_calls: [] },
    { role: "user", content: "davom et" },
  ] as M[]);
  assert.deepEqual(r.map((m) => m.role), ["user", "user"]);
});

test("matnli assistant, bo'sh tool_calls — faqat maydon olib tashlanadi", () => {
  const r = sanitizeHistory([{ role: "user", content: "u" }, { role: "assistant", content: "salom", tool_calls: [] }] as M[]);
  assert.equal(r[1].content, "salom");
  assert.equal("tool_calls" in r[1], false);
});

test("natijasi yo'q chaqiruvga joy to'ldiruvchi tool xabari qo'shiladi", () => {
  const r = sanitizeHistory([
    { role: "user", content: "u" },
    { role: "assistant", content: null, tool_calls: [call("c1"), call("c2")] },
    { role: "tool", tool_call_id: "c1", content: "ok" },
    { role: "user", content: "yana" },
  ] as M[]);
  assert.deepEqual(r.map((m) => m.role), ["user", "assistant", "tool", "tool", "user"]);
  assert.equal(r[3].tool_call_id, "c2");
});

test("oxirida javobsiz chaqiruv — joy to'ldiruvchi", () => {
  const r = sanitizeHistory([{ role: "user", content: "u" }, { role: "assistant", content: null, tool_calls: [call("z")] }] as M[]);
  assert.equal(r.at(-1)!.role, "tool");
  assert.equal(r.at(-1)!.tool_call_id, "z");
});

test("egasiz tool xabari tashlanadi", () => {
  const r = sanitizeHistory([{ role: "user", content: "u" }, { role: "tool", tool_call_id: "x", content: "?" }] as M[]);
  assert.deepEqual(r.map((m) => m.role), ["user"]);
});

test("nomsiz chaqiruv tashlanadi; takror id'lar ajratiladi", () => {
  const r = sanitizeHistory([
    { role: "user", content: "u" },
    { role: "assistant", content: "x", tool_calls: [call("d", ""), call("d"), call("d")] },
    { role: "tool", tool_call_id: "d", content: "1" },
    { role: "tool", tool_call_id: "d", content: "2" },
  ] as M[]);
  const ids = (r[1].tool_calls as { id: string }[]).map((c) => c.id);
  assert.equal(ids.length, 2);
  assert.equal(new Set(ids).size, 2);
  assert.deepEqual([r[2].tool_call_id, r[3].tool_call_id].sort(), [...ids].sort());
});

console.log(`sanitize-history: ${ok} o'tdi, ${fail} yiqildi`);
if (fail) process.exit(1);

import { compactHistory } from "./sanitize-history";
{
  let ok2 = 0;
  const long = "x".repeat(10_000);
  const h: M[] = [{ role: "system", content: "rules" }, { role: "user", content: "TASK" }];
  for (let i = 0; i < 20; i++) {
    h.push({ role: "assistant", content: null, tool_calls: [call(`c${i}`)] });
    h.push({ role: "tool", tool_call_id: `c${i}`, content: long });
  }
  const r = compactHistory(h, 0.25, 2000);
  assert.equal(r[0].content, "rules"); ok2++;
  assert.equal(r[1].content, "TASK"); ok2++;
  assert.ok(String(r[2].content).includes("olib tashlandi")); ok2++;
  assert.ok(r.length < h.length); ok2++;
  assert.ok(r.filter((m) => m.role === "tool").every((m) => String(m.content).length < 2100)); ok2++;
  assert.notEqual(r[3].role, "tool"); ok2++;
  const ids = new Set(r.filter((m) => m.role === "assistant").flatMap((m) => (m.tool_calls as { id: string }[]).map((c) => c.id)));
  assert.ok(r.filter((m) => m.role === "tool").every((m) => ids.has(m.tool_call_id!))); ok2++;
  console.log(`compactHistory: ${ok2} o'tdi`);
}
