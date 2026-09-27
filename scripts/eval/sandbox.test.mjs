/**
 * Eval sandbox regressiya testi (API chaqiruvsiz):
 *   node scripts/eval/sandbox.test.mjs
 * Mahalliy (local) rejimda ma'lum qochish yo'llari ishlamasligini va oddiy yechimlar
 * hali ham o'tishini tekshiradi. Docker rejimi uchun — faqat argumentlar tekshiriladi.
 */

import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

process.env.SOV_EVAL_SANDBOX = "local";
const { runTests, dockerArgs, sandboxMode } = await import("./sandbox.mjs");

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SECRET_FILE = resolve(ROOT, "package.json").replace(/\\/g, "/"); // mavjud fayl — sir o'rnida

let failed = 0;
async function check(name, fn) {
  try {
    await fn();
    console.log(`OK   ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${name}: ${e?.message ?? e}`);
  }
}

const one = (fn, runtime, expected) => ({ fn, runtime, cases: [[[], expected]] });

await check("rejim: SOV_EVAL_SANDBOX=local", () => assert.equal(sandboxMode(), "local"));
await check("rejim: noma'lum qiymat rad etiladi", () => assert.throws(() => sandboxMode({ SOV_EVAL_SANDBOX: "yolo" })));

await check("JS: oddiy yechim o'tadi", async () => {
  const r = await runTests({ fn: "add", runtime: "js", cases: [[[1, 2], 3], [[5, 5], 10]] }, "function add(a,b){return a+b}");
  assert.equal(r.pass, true, r.reason);
});

await check("JS: module.constructor.constructor host process'ga yetmaydi", async () => {
  const code = `function solve(){ try { return typeof module.constructor.constructor("return process")(); } catch (e) { return "blocked"; } }`;
  const r = await runTests(one("solve", "js", "blocked"), code);
  assert.equal(r.pass, true, r.reason);
});

await check("JS: this.constructor.constructor host process'ga yetmaydi", async () => {
  const code = `function solve(){ try { return typeof this.constructor.constructor("return process")(); } catch (e) { return "blocked"; } }`;
  const r = await runTests(one("solve", "js", "blocked"), code);
  assert.equal(r.pass, true, r.reason);
});

await check("JS: require/fetch/process kontekstda yo'q", async () => {
  const code = `function solve(){ return [typeof require, typeof fetch, typeof process].join(","); }`;
  const r = await runTests(one("solve", "js", "undefined,undefined,undefined"), code);
  assert.equal(r.pass, true, r.reason);
});

await check("Python: oddiy yechim (stdlib import) o'tadi", async () => {
  const code = "import re\nfrom collections import Counter\nimport heapq, math\ndef f(s):\n    return max(Counter(re.findall(r'[a-z]+', s)).values())";
  const r = await runTests({ fn: "f", runtime: "py", cases: [[["a b a"], 2]] }, code);
  assert.equal(r.pass, true, r.reason);
});

await check("Python: repo fayllarini o'qib bo'lmaydi", async () => {
  const code = `def f():\n    try:\n        open(${JSON.stringify(SECRET_FILE)}).read()\n        return "OPEN"\n    except Exception:\n        return "blocked"`;
  const r = await runTests(one("f", "py", "blocked"), code);
  assert.equal(r.pass, true, r.reason);
});

await check("Python: _socket orqali tarmoq yo'q", async () => {
  const code = `def f():\n    try:\n        import _socket\n        _socket.socket()\n        return "OPEN"\n    except Exception:\n        return "blocked"`;
  const r = await runTests(one("f", "py", "blocked"), code);
  assert.equal(r.pass, true, r.reason);
});

await check("Python: os.system / subprocess yo'q", async () => {
  const code = `import os\ndef f():\n    out = []\n    try:\n        os.system("echo x")\n        out.append("OPEN")\n    except Exception:\n        out.append("blocked")\n    try:\n        import subprocess\n        out.append("OPEN")\n    except Exception:\n        out.append("blocked")\n    return ",".join(out)`;
  const r = await runTests(one("f", "py", "blocked,blocked"), code);
  assert.equal(r.pass, true, r.reason);
});

await check("Python: ctypes yo'q", async () => {
  const code = `def f():\n    try:\n        import ctypes\n        return "OPEN"\n    except Exception:\n        return "blocked"`;
  const r = await runTests(one("f", "py", "blocked"), code);
  assert.equal(r.pass, true, r.reason);
});

await check("Docker argumentlari: tarmoq yo'q, read-only, mount/env yo'q", () => {
  for (const rt of ["js", "py"]) {
    const a = dockerArgs(rt, "sov-eval-test");
    const s = a.join(" ");
    assert.ok(s.includes("--network none"), "network none");
    assert.ok(a.includes("--read-only"), "read-only");
    assert.ok(s.includes("--cap-drop ALL"), "cap-drop");
    assert.ok(s.includes("--pids-limit"), "pids-limit");
    assert.ok(!a.includes("-v") && !a.includes("--volume") && !a.includes("--mount"), "no mounts");
    assert.ok(!a.includes("--env-file"), "no env-file");
  }
});

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exit(failed ? 1 : 0);
