/**
 * Model yozgan kodni alohida child process'da, timeout bilan ishga tushiradi.
 *
 * DIQQAT: `node:vm` va Python monkeypatch'lari XAVFSIZLIK CHEGARASI EMAS (Node hujjati ham
 * shunday deydi). Model javobi — ishonchsiz kod (buzilgan gateway yoki prompt-injection),
 * shuning uchun ikki rejim bor (`SOV_EVAL_SANDBOX`):
 *
 *  docker — HAQIQIY chegara: `docker run --rm --network none --read-only --cap-drop ALL
 *           --memory 256m --pids-limit 64 --user 65534`, hech qanday mount/env yo'q.
 *           Docker daemon ishlayotgan bo'lsa standart shu.
 *  local  — Docker yo'q bo'lsa (yoki aniq tanlansa) — himoya qatlamlari, lekin to'liq
 *           izolyatsiya EMAS:
 *             JS     — `node --permission` (fs o'qish/yozish, child_process, worker, addon
 *                      YO'Q) + host obyektlarisiz `vm` konteksti. Tarmoq Node 22 da
 *                      cheklanmaydi, lekin fs va env yo'q — chiqarib yuboradigan sir yo'q.
 *             Python — `python -I` + audit hook: stdlib'dan tashqari fayl ochish, socket,
 *                      subprocess, ctypes, os.system/exec/spawn va h.k. taqiqlanadi.
 *           Faqat ishonchli provayderlar bilan ishlating; ishonchsiz gateway uchun — docker.
 *
 * Natija: har bir test uchun {ok, v (JSON)} — solishtirish parent'da (kanonik JSON).
 */

import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

const HARD_TIMEOUT_MS = 10_000;
/** Docker'da konteyner ishga tushishi ham vaqt oladi. */
const DOCKER_TIMEOUT_MS = 30_000;
export const NODE_IMAGE = process.env.SOV_EVAL_NODE_IMAGE || "node:22-alpine";
export const PY_IMAGE = process.env.SOV_EVAL_PY_IMAGE || "python:3.12-alpine";

// module/exports/console KONTEKST ichida yaratiladi: host-realm obyekti berilmaydi, shuning uchun
// `module.constructor.constructor("return process")()` host `process`ga yetmaydi.
// (Baribir chegara emas — asosiy himoya --permission / docker.)
const JS_RUNNER = `
const vm = require("node:vm");
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (d) => (input += d));
process.stdin.on("end", () => {
  const { code, fn, cases } = JSON.parse(input);
  const ctx = vm.createContext(Object.create(null));
  let out;
  try {
    vm.runInContext("var module = { exports: {} }; var exports = module.exports; var console = { log: function () {}, error: function () {}, warn: function () {} };", ctx);
    const cleaned = code.replace(/^\\s*export\\s+default\\s+/gm, "").replace(/^\\s*export\\s+/gm, "");
    vm.runInContext(cleaned + "\\n;globalThis.__fn = (typeof " + fn + " !== 'undefined') ? " + fn + " : (module.exports && (module.exports." + fn + " || module.exports));", ctx, { timeout: 3000 });
    ctx.__cases = JSON.stringify(cases);
    vm.runInContext(
      "globalThis.__out = JSON.stringify(JSON.parse(__cases).map(function (c) { try { var v = __fn.apply(null, c[0]); return { ok: true, v: JSON.stringify(v === undefined ? null : v) }; } catch (e) { return { ok: false, e: String(e) }; } }));",
      ctx,
      { timeout: 3000 },
    );
    const raw = Object.getOwnPropertyDescriptor(ctx, "__out");
    out = raw && typeof raw.value === "string" ? raw.value : JSON.stringify({ fatal: "no output" });
  } catch (e) {
    out = JSON.stringify({ fatal: String(e && e.message || e) });
  }
  process.stdout.write(out);
});
`;

const PY_RUNNER = `
import sys, os, json
_ROOTS = tuple(sorted({os.path.normcase(os.path.realpath(p)).rstrip(os.sep) + os.sep for p in (sys.prefix, sys.base_prefix, sys.exec_prefix, sys.base_exec_prefix)}))
_BAD_MODS = {"ctypes", "_ctypes", "socket", "_socket", "ssl", "_ssl", "select", "selectors", "subprocess", "_posixsubprocess",
             "multiprocessing", "_multiprocessing", "_winapi", "winreg", "_winreg", "_overlapped", "asyncio", "mmap",
             "urllib", "http", "ftplib", "smtplib", "poplib", "imaplib", "telnetlib", "webbrowser", "pty", "fcntl",
             "shutil", "tempfile", "glob", "importlib", "zipimport", "pickle", "_pickle", "marshal", "gc", "sqlite3", "msvcrt"}
_BAD_EVENTS = ("socket.", "subprocess.", "os.system", "os.exec", "os.spawn", "os.posix_spawn", "os.fork", "os.startfile",
               "os.kill", "os.remove", "os.unlink", "os.rename", "os.rmdir", "os.mkdir", "os.chmod", "os.chown", "os.link",
               "os.symlink", "os.truncate", "os.listdir", "os.scandir", "os.walk", "os.chdir", "os.putenv", "os.unsetenv",
               "shutil.", "ctypes.", "_winapi.", "winreg.", "urllib.", "http.", "ftplib.", "smtplib.", "webbrowser.",
               "gc.", "sys.settrace", "sys.setprofile", "msvcrt.", "mmap.", "pty.", "fcntl.", "resource.")
def _deny(ev):
    raise PermissionError("eval sandbox: " + ev + " taqiqlangan")
def _hook(ev, args):
    if ev == "open":
        path = args[0]
        mode = args[1] if len(args) > 1 else None
        if isinstance(mode, str) and any(c in mode for c in "wax+"):
            _deny(ev)
        if isinstance(path, int):
            _deny(ev)
        try:
            p = os.path.normcase(os.path.realpath(os.fsdecode(path)))
        except Exception:
            _deny(ev)
        if not p.startswith(_ROOTS):
            _deny(ev)
        return
    if ev == "import":
        if str(args[0]).split(".")[0] in _BAD_MODS:
            _deny(ev + " " + str(args[0]))
        return
    if ev.startswith(_BAD_EVENTS):
        _deny(ev)
data = json.loads(sys.stdin.buffer.read().decode("utf-8"))
_out = sys.stdout
sys.addaudithook(_hook)
g = {"__name__": "__solution__"}
try:
    exec(data["code"], g)
    fn = g[data["fn"]]
except Exception as e:
    _out.write(json.dumps({"fatal": repr(e)}))
    _out.flush()
    os._exit(0)
res = []
for args, _exp in data["cases"]:
    try:
        v = fn(*args)
        res.append({"ok": True, "v": json.dumps(v)})
    except Exception as e:
        res.append({"ok": False, "e": repr(e)})
_out.write(json.dumps(res))
_out.flush()
`;

function runChild(cmd, args, stdin, { cwd, env, timeoutMs = HARD_TIMEOUT_MS, onTimeout } = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: env ?? { PATH: process.env.PATH, SYSTEMROOT: process.env.SYSTEMROOT ?? "", PYTHONIOENCODING: "utf-8", PYTHONDONTWRITEBYTECODE: "1" },
      windowsHide: true,
    });
    let out = "";
    let err = "";
    let settled = false;
    const finish = (v) => {
      if (settled) return;
      settled = true;
      resolve(v);
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      onTimeout?.();
      finish({ timeout: true, out, err });
    }, timeoutMs);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => {
      clearTimeout(timer);
      finish({ timeout: false, out, err: err + String(e?.message ?? e) });
    });
    child.on("close", () => {
      clearTimeout(timer);
      finish({ timeout: false, out, err });
    });
    child.stdin.on("error", () => {});
    child.stdin.end(stdin);
  });
}

/* ------------------------------------------------------------------ */
/* Rejim tanlash                                                        */
/* ------------------------------------------------------------------ */

let dockerOk; // undefined = hali tekshirilmagan
function dockerAvailable() {
  if (dockerOk === undefined) {
    const r = spawnSync("docker", ["version", "--format", "{{.Server.Version}}"], { encoding: "utf8", windowsHide: true, timeout: 15_000 });
    dockerOk = r.status === 0 && Boolean(r.stdout?.trim());
  }
  return dockerOk;
}

let permFlag; // undefined = hali tekshirilmagan; null = qo'llab-quvvatlanmaydi
/** Node permission model bayrog'i (22.13+ `--permission`, eskisi `--experimental-permission`). */
function nodePermissionFlag() {
  if (permFlag === undefined) {
    permFlag = null;
    for (const f of ["--permission", "--experimental-permission"]) {
      const r = spawnSync(
        process.execPath,
        [f, "-e", "try{require('fs').readdirSync('.');process.exit(3)}catch(e){process.exit(e&&e.code==='ERR_ACCESS_DENIED'?0:4)}"],
        { stdio: "ignore", windowsHide: true, timeout: 15_000 },
      );
      if (r.status === 0) {
        permFlag = f;
        break;
      }
    }
  }
  return permFlag;
}

/** `SOV_EVAL_SANDBOX` = docker | local; bo'sh bo'lsa — Docker ishlasa docker, aks holda local. */
export function sandboxMode(env = process.env) {
  const want = String(env.SOV_EVAL_SANDBOX ?? "").trim().toLowerCase();
  if (want === "docker") {
    if (!dockerAvailable()) throw new Error("SOV_EVAL_SANDBOX=docker, lekin Docker daemon ishlamayapti");
    return "docker";
  }
  if (want === "local") return "local";
  if (want) throw new Error(`SOV_EVAL_SANDBOX noma'lum qiymat: ${want} (docker | local)`);
  return dockerAvailable() ? "docker" : "local";
}

const pulled = new Set();
function ensureImage(image) {
  if (pulled.has(image)) return;
  const has = spawnSync("docker", ["image", "inspect", image], { stdio: "ignore", windowsHide: true, timeout: 30_000 }).status === 0;
  if (!has) {
    const r = spawnSync("docker", ["pull", image], { stdio: ["ignore", "ignore", "inherit"], windowsHide: true, timeout: 600_000 });
    if (r.status !== 0) throw new Error(`docker pull ${image} muvaffaqiyatsiz`);
  }
  pulled.add(image);
}

/** Konteyner argumentlari: tarmoq yo'q, faqat-o'qish FS, imtiyozlarsiz, resurs chegaralari, mount/env yo'q. */
export function dockerArgs(runtime, name) {
  const base = [
    "run", "--rm", "-i", "--name", name,
    "--network", "none",
    "--read-only",
    "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges",
    "--user", "65534:65534",
    "--memory", "256m", "--memory-swap", "256m",
    "--pids-limit", "64",
    "--cpus", "1",
    "--tmpfs", "/tmp:rw,noexec,nosuid,size=16m",
    "--workdir", "/tmp",
  ];
  return runtime === "py"
    ? [...base, "-e", "PYTHONIOENCODING=utf-8", "-e", "PYTHONDONTWRITEBYTECODE=1", PY_IMAGE, "python", "-I", "-c", PY_RUNNER]
    : [...base, NODE_IMAGE, "node", "--permission", "-e", JS_RUNNER];
}

let warned = false;
async function execute(runtime, payload) {
  const mode = sandboxMode();
  if (mode === "docker") {
    ensureImage(runtime === "py" ? PY_IMAGE : NODE_IMAGE);
    const name = `sov-eval-${randomBytes(6).toString("hex")}`;
    return runChild("docker", dockerArgs(runtime, name), payload, {
      env: process.env, // docker CLI uchun (konteynerga env O'TMAYDI)
      timeoutMs: DOCKER_TIMEOUT_MS,
      onTimeout: () => spawn("docker", ["rm", "-f", name], { stdio: "ignore", windowsHide: true }).on("error", () => {}),
    });
  }
  if (!warned) {
    warned = true;
    console.warn(
      "[eval] OGOHLANTIRISH: Docker yo'q — model kodi mahalliy himoya qatlamlarida ishlaydi (to'liq izolyatsiya emas). " +
        "Ishonchsiz provayder/gateway bilan Docker'ni yoqing (SOV_EVAL_SANDBOX=docker).",
    );
  }
  const dir = mkdtempSync(join(tmpdir(), "sov-eval-"));
  try {
    if (runtime === "py") {
      return await runChild(process.platform === "win32" ? "python" : "python3", ["-I", "-c", PY_RUNNER], payload, { cwd: dir });
    }
    const flag = nodePermissionFlag();
    if (!flag) throw new Error("Node permission model yo'q (Node 22.13+ kerak) — SOV_EVAL_SANDBOX=docker ishlating");
    return await runChild(process.execPath, [flag, "-e", JS_RUNNER], payload, { cwd: dir });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
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
  const r = await execute(task.runtime === "py" ? "py" : "js", payload);
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
}
