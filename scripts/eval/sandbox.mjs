/**
 * Model yozgan kodni alohida child process'da, timeout bilan ishga tushiradi.
 *
 *  JS     — `node` child ichida `vm` konteksti: require/process/fetch/fs YO'Q (tarmoq va
 *           disk mavjud emas), kod + testlar 3s vm-timeout ostida.
 *  Python — `python -I` (izolyatsiya rejimi), socket moduli bloklangan, vaqtinchalik
 *           bo'sh cwd; child 10s dan keyin o'ldiriladi.
 *
 * Natija: har bir test uchun {ok, v (JSON)} — solishtirish parent'da (kanonik JSON).
 */

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HARD_TIMEOUT_MS = 10_000;

const JS_RUNNER = `
const vm = require("node:vm");
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (d) => (input += d));
process.stdin.on("end", () => {
  const { code, fn, cases } = JSON.parse(input);
  const module = { exports: {} };
  const ctx = vm.createContext({ module, exports: module.exports, console: { log() {}, error() {}, warn() {} } });
  let out;
  try {
    const cleaned = code.replace(/^\\s*export\\s+default\\s+/gm, "").replace(/^\\s*export\\s+/gm, "");
    vm.runInContext(cleaned + "\\n;globalThis.__fn = (typeof " + fn + " !== 'undefined') ? " + fn + " : (module.exports && (module.exports." + fn + " || module.exports));", ctx, { timeout: 3000 });
    ctx.__cases = JSON.stringify(cases);
    vm.runInContext(
      "globalThis.__out = JSON.stringify(JSON.parse(__cases).map(function (c) { try { var v = __fn.apply(null, c[0]); return { ok: true, v: JSON.stringify(v === undefined ? null : v) }; } catch (e) { return { ok: false, e: String(e) }; } }));",
      ctx,
      { timeout: 3000 },
    );
    out = ctx.__out;
  } catch (e) {
    out = JSON.stringify({ fatal: String(e && e.message || e) });
  }
  process.stdout.write(out);
});
`;

const PY_RUNNER = `
import sys, json, socket
def _blocked(*a, **k):
    raise OSError("network disabled in eval sandbox")
socket.socket = _blocked
socket.create_connection = _blocked
socket.getaddrinfo = _blocked
data = json.loads(sys.stdin.buffer.read().decode("utf-8"))
g = {"__name__": "__solution__"}
try:
    exec(data["code"], g)
    fn = g[data["fn"]]
except Exception as e:
    sys.stdout.write(json.dumps({"fatal": repr(e)}))
    sys.exit(0)
res = []
for args, _exp in data["cases"]:
    try:
        v = fn(*args)
        res.append({"ok": True, "v": json.dumps(v)})
    except Exception as e:
        res.append({"ok": False, "e": repr(e)})
sys.stdout.write(json.dumps(res))
`;

function runChild(cmd, args, stdin, cwd) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: { PATH: process.env.PATH, SYSTEMROOT: process.env.SYSTEMROOT ?? "", PYTHONIOENCODING: "utf-8", PYTHONDONTWRITEBYTECODE: "1" },
      windowsHide: true,
    });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve({ timeout: true, out, err });
    }, HARD_TIMEOUT_MS);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("close", () => {
      clearTimeout(timer);
      resolve({ timeout: false, out, err });
    });
    child.stdin.end(stdin);
  });
}

/** Tartibdan qat'i nazar kalitlari saralangan JSON (obyekt solishtirish uchun). */
export function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}

/** Markdown javobdan kod blokini ajratadi (avval mos tildagi ```lang, keyin eng uzun blok). */
export function extractCode(text, runtime) {
  const blocks = [...text.matchAll(/```([\w+-]*)[^\n]*\n([\s\S]*?)```/g)].map((m) => ({ lang: m[1].toLowerCase(), body: m[2] }));
  const want = runtime === "py" ? ["python", "py", "python3"] : ["javascript", "js", "ts", "typescript", "jsx"];
  const tagged = blocks.filter((b) => want.includes(b.lang));
  const pool = tagged.length ? tagged : blocks;
  if (pool.length) return pool.sort((a, b) => b.body.length - a.body.length)[0].body;
  return text;
}

/**
 * Kodni testlaydi. Qaytaradi: { pass, passed, total, reason }.
 * `pass` — HAMMA testlar o'tsa.
 */
export async function runTests(task, code) {
  const payload = JSON.stringify({ code, fn: task.fn, cases: task.cases });
  const dir = mkdtempSync(join(tmpdir(), "sov-eval-"));
  try {
    const r =
      task.runtime === "py"
        ? await runChild(process.platform === "win32" ? "python" : "python3", ["-I", "-c", PY_RUNNER], payload, dir)
        : await runChild(process.execPath, ["-e", JS_RUNNER], payload, dir);
    if (r.timeout) return { pass: false, passed: 0, total: task.cases.length, reason: "timeout" };
    let res;
    try {
      res = JSON.parse(r.out);
    } catch {
      return { pass: false, passed: 0, total: task.cases.length, reason: `runner: ${(r.err || r.out).slice(0, 200)}` };
    }
    if (!Array.isArray(res)) return { pass: false, passed: 0, total: task.cases.length, reason: `fatal: ${String(res.fatal).slice(0, 200)}` };
    let passed = 0;
    const fails = [];
    task.cases.forEach(([args, expected], i) => {
      const got = res[i];
      if (got?.ok) {
        try {
          if (canonical(JSON.parse(got.v)) === canonical(expected)) {
            passed++;
            return;
          }
        } catch {
          /* fallthrough */
        }
      }
      if (fails.length < 2) fails.push(`#${i} args=${JSON.stringify(args).slice(0, 60)} got=${got?.ok ? got.v.slice(0, 60) : got?.e?.slice(0, 80)}`);
    });
    const total = task.cases.length;
    return { pass: passed === total, passed, total, reason: passed === total ? "ok" : fails.join(" | ") };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
