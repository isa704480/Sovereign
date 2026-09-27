// Full auto buyruqlari uchun OS darajasidagi sandbox (CLI va Cowork uchun umumiy, electron'siz).
//
// Darajalar (halol nomlar — UI/doctor aynan shularni ko'rsatadi):
//   "full"      — OS sandbox: Linux'da bubblewrap (bwrap), macOS'da sandbox-exec (Seatbelt).
//                 Fayl tizimi faqat o'qish uchun, yozish — faqat ish papkasi va xususiy tmp;
//                 uy papkasi (~/.ssh, ~/.aws, ~/.sovereign, brauzer profillari) ko'rinmaydi; tarmoq o'chiq.
//   "container" — Docker/Podman: faqat ish papkasi /workspace ga ulanadi, --network none,
//                 barcha capability'lar olib tashlanadi. Buyruq Linux konteynerida (sh) bajariladi.
//   "limited"   — haqiqiy sandbox YO'Q (odatda Windows Docker'siz): muhit (env) allowlist bilan
//                 tozalanadi, HOME/USERPROFILE/APPDATA vaqtinchalik papkaga yo'naltiriladi, proxy
//                 o'lik portga. Fayl tizimi va to'g'ridan-to'g'ri tarmoq TO'SILMAYDI — bu faqat to'siq.
//
// Paket o'rnatish (npm/pnpm/yarn/bun install, pip install, uv, poetry) — tarmoq kerak: faqat
// aniq tanilgan, zanjirsiz (`&&`, `;`, `|`, `$(` yo'q) va begona registry/URL'siz o'rnatish buyrug'iga
// sandbox ICHIDA tarmoq ochiladi; HOME baribir yo'naltirilgan/yashirin qoladi.
//
// Sof funksiyalar (argument quruvchilar, env, aniqlash) testlanadi: cli/scripts/test-sandbox.mjs.

import { execFile } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rm, rmSync, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, posix, win32 } from "node:path";
import { randomBytes } from "node:crypto";

export const SANDBOX_MODES = ["auto", "off", "required"];
export const SANDBOX_LEVELS = ["full", "container", "limited"];
export const DEFAULT_SANDBOX_IMAGE = "node:22-bookworm-slim";
/** Hech narsa tinglamaydigan port — proxy'ni hurmat qiladigan vositalar tarmoqqa chiqa olmaydi. */
export const DEAD_PROXY = "http://127.0.0.1:9";
const PROXY_VARS = ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"];

export function normalizeSandboxMode(v) {
  return SANDBOX_MODES.includes(v) ? v : "auto";
}

/** Docker/Podman image nomi (registry/nom:teg@digest) — argument sifatida xavfsiz. */
export function isValidImageName(v) {
  return typeof v === "string" && /^[a-z0-9][a-z0-9._/:@-]{0,199}$/i.test(v) && !v.includes("..");
}

/** Haqiqiy (OS yoki konteyner) sandbox darajasimi. */
export function isRealLevel(level) {
  return level === "full" || level === "container";
}

// ---- Paket o'rnatish buyrug'i (tarmoq faqat shunga) ---------------------------------------

const INSTALL_RE = [
  /^(npm|pnpm|bun)(\.cmd|\.exe)?\s+(install|i|ci|add)(\s|$)/i,
  /^yarn(\.cmd)?(\s+(install|add)(\s|$)|$)/i,
  /^(pip|pip3)(\.exe)?\s+install(\s|$)/i,
  /^(python3?|py)(\.exe)?\s+-m\s+pip\s+install(\s|$)/i,
  /^uv(\.exe)?\s+(pip\s+install|add|sync)(\s|$)/i,
  /^poetry(\.exe)?\s+(install|add)(\s|$)/i,
];
/** Zanjir, quvur, yo'naltirish, o'rniga qo'yish — o'rnatish buyrug'i "toza" bo'lishi shart. */
const SHELL_META = /[;&|`$<>(){}\r\n%!]/;
/** Begona registry/indeks yoki URL/git manba: tarmoq ochilganda ma'lumot tashqariga ketmasin. */
const FOREIGN_SOURCE = /(^|\s)(--registry|--index-url|--extra-index-url|-i|--find-links|-f|--trusted-host|-g|--global|--location(=|\s+)global|--prefix)(\s|=|$)|:\/\/|(^|\s)(git\+|github:|gitlab:|bitbucket:|file:|link:)/i;

/**
 * Tarmoq ochiladigan paket o'rnatish buyrug'imi. Faqat bitta, zanjirsiz buyruq; global o'rnatish,
 * boshqa registry/indeks yoki URL/git manbasi — yo'q (bunday buyruq tarmoqsiz ishlaydi).
 */
export function isInstallCommand(command) {
  const s = String(command ?? "").trim();
  if (!s || s.length > 500 || SHELL_META.test(s) || /["']/.test(s)) return false;
  if (!INSTALL_RE.some((re) => re.test(s))) return false;
  return !FOREIGN_SOURCE.test(s);
}

// ---- Muhit (env) ----------------------------------------------------------------------------

/** Bolaga o'tadigan env nomlari (katta harfda solishtiriladi). Qolgan hammasi tashlanadi. */
const ENV_ALLOW = new Set([
  "PATH", "PATHEXT", "SYSTEMROOT", "SYSTEMDRIVE", "WINDIR", "COMSPEC", "OS", "NUMBER_OF_PROCESSORS",
  "PROCESSOR_ARCHITECTURE", "PROCESSOR_IDENTIFIER", "PROCESSOR_LEVEL", "PROCESSOR_REVISION",
  "PROGRAMFILES", "PROGRAMFILES(X86)", "PROGRAMW6432", "COMMONPROGRAMFILES", "COMMONPROGRAMFILES(X86)",
  "COMMONPROGRAMW6432", "PROGRAMDATA", "ALLUSERSPROFILE", "PUBLIC", "DRIVERDATA", "COMPUTERNAME",
  "TERM", "COLORTERM", "LANG", "LANGUAGE", "TZ", "SHELL", "USER", "LOGNAME", "USERNAME",
  "NO_COLOR", "FORCE_COLOR", "CI",
  "JAVA_HOME", "GOROOT", "GOPATH", "CARGO_HOME", "RUSTUP_HOME", "DOTNET_ROOT",
  "NVM_DIR", "NVM_BIN", "NVM_INC", "NVM_HOME", "NVM_SYMLINK", "VOLTA_HOME", "PNPM_HOME", "FNM_DIR",
  "FNM_MULTISHELL_PATH", "BUN_INSTALL", "DENO_INSTALL", "PYENV_ROOT", "VIRTUAL_ENV", "CONDA_PREFIX",
]);
/** Allowlist'dan o'tgan bo'lsa ham — sir ko'rinishidagi nom yoki qiymat tashlanadi. */
const SECRET_NAME = /(TOKEN|SECRET|PASSW|API_?KEY|ACCESS_?KEY|PRIVATE|CREDENTIAL|SESSION|COOKIE|AUTH)/i;
const SECRET_VALUE = /:\/\/[^/\s:@]+:[^/\s@]+@/; // https://user:pass@host

/**
 * ~/.gitconfig dagi [user] name/email (faqat shu ikkitasi — sir emas). HOME yashirilganda
 * `git commit` "Please tell me who you are" bilan yiqilmasin. Include/boshqa kalitlar o'qilmaydi.
 */
export function gitIdentity(home = homedir()) {
  let text = "";
  try {
    text = readFileSync(join(home, ".gitconfig"), "utf8");
  } catch {
    return {};
  }
  const out = {};
  let inUser = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const sec = /^\[\s*([^\]\s"]+)\s*\]$/.exec(line);
    if (sec) {
      inUser = sec[1].toLowerCase() === "user";
      continue;
    }
    if (!inUser) continue;
    const kv = /^(name|email)\s*=\s*(.*)$/i.exec(line);
    if (kv) {
      const v = kv[2].replace(/^"(.*)"$/, "$1").trim();
      if (v && v.length < 200 && !/[\0\r\n]/.test(v)) out[kv[1].toLowerCase()] = v;
    }
  }
  return out;
}

function identityEnv(id = {}) {
  const e = {};
  if (id.name) e.GIT_AUTHOR_NAME = e.GIT_COMMITTER_NAME = id.name;
  if (id.email) e.GIT_AUTHOR_EMAIL = e.GIT_COMMITTER_EMAIL = id.email;
  return e;
}

/**
 * Sandbox ichidagi buyruq uchun muhit: allowlist + sir filtri, HOME/USERPROFILE/APPDATA/XDG va
 * TMP xususiy papkalarga, tarmoqsiz bo'lsa proxy o'lik portga (faqat localhost to'g'ridan-to'g'ri).
 * @param {{env?: object, platform?: string, home: string, tmp: string, net?: boolean, identity?: object}} p
 */
export function sandboxEnv({ env = process.env, platform = process.platform, home, tmp, net = false, identity = {} }) {
  const out = {};
  for (const [k, v] of Object.entries(env ?? {})) {
    if (typeof v !== "string") continue;
    const K = k.toUpperCase();
    if (!ENV_ALLOW.has(K) && !K.startsWith("LC_")) continue;
    if (SECRET_NAME.test(K) || SECRET_VALUE.test(v)) continue;
    out[k] = v;
  }
  // Windows env registrga befarq (Temp = TEMP) — bir nusxa qoladi; POSIX'da http_proxy ≠ HTTP_PROXY.
  const set = (k, v) => {
    if (platform === "win32") for (const key of Object.keys(out)) if (key.toUpperCase() === k.toUpperCase()) delete out[key];
    out[k] = v;
  };
  const pj = platform === "win32" ? win32.join : posix.join;
  set("HOME", home);
  if (platform === "win32") {
    set("USERPROFILE", home);
    set("APPDATA", pj(home, "AppData", "Roaming"));
    set("LOCALAPPDATA", pj(home, "AppData", "Local"));
    // cmd.exe buyruqni avval JORIY papkadan qidirmasin (ish papkasidagi soxta git.bat).
    set("NoDefaultCurrentDirectoryInExePath", "1");
  } else {
    set("XDG_CONFIG_HOME", pj(home, ".config"));
    set("XDG_CACHE_HOME", pj(home, ".cache"));
    set("XDG_DATA_HOME", pj(home, ".local", "share"));
  }
  set("TMPDIR", tmp);
  set("TMP", tmp);
  set("TEMP", tmp);
  set("GIT_TERMINAL_PROMPT", "0");
  set("npm_config_update_notifier", "false");
  for (const [k, v] of Object.entries(identityEnv(identity))) set(k, v);
  if (net) {
    // O'rnatish: foydalanuvchining (korporativ) proxy'si kerak bo'lishi mumkin — parolsizlari o'tadi.
    for (const k of PROXY_VARS) {
      const v = env?.[k];
      if (typeof v === "string" && v && !SECRET_VALUE.test(v)) set(k, v);
    }
  } else {
    for (const k of PROXY_VARS) set(k, DEAD_PROXY);
    set("NO_PROXY", "localhost,127.0.0.1,::1");
    set("no_proxy", "localhost,127.0.0.1,::1");
  }
  return out;
}

// ---- Ish papkasi -----------------------------------------------------------------------------

/**
 * Ish papkasini sandbox'ga ulash xavfsizmi: disk ildizi yoki uy papkasining o'zi/ajdodi bo'lsa —
 * yo'q (u holda "yashirilgan" uy papkasi qaytadan ochilib qolardi).
 */
export function sandboxableWorkspace(ws, home, platform = process.platform) {
  if (typeof ws !== "string" || !ws || typeof home !== "string" || !home) return false;
  const p = platform === "win32" ? win32 : posix;
  const norm = (s) => {
    const r = p.resolve(s).replace(/[\\/]+$/, "");
    return platform === "win32" || platform === "darwin" ? r.toLowerCase() : r;
  };
  const w = norm(ws);
  const h = norm(home);
  if (!w || w === norm(p.parse(p.resolve(ws)).root)) return false;
  return !(h === w || h.startsWith(w + p.sep));
}

/** Ish papkasi ildizidagi .env fayllari (tarmoqli o'rnatishda yashiriladi). */
export function workspaceEnvFiles(ws, list = (d) => readdirSync(d)) {
  try {
    return list(ws)
      .filter((f) => /^\.env($|\.)/i.test(f) && !/\.(example|sample|template)$/i.test(f))
      .map((f) => posix.join(ws.replace(/\\/g, "/"), f));
  } catch {
    return [];
  }
}

// ---- Linux: bubblewrap ------------------------------------------------------------------------

/** Uy papkasidan faqat-o'qish uchun qaytariladigan vositalar (node/python/rust versiya menejerlari). */
export const TOOLCHAIN_DIRS = [
  ".nvm", ".volta", ".fnm", ".local/share/fnm", ".bun", ".deno", ".cargo", ".rustup", ".pyenv",
  ".rbenv", ".asdf", ".sdkman", ".local/bin", ".local/lib", ".local/share/pnpm", ".npm-global", "go",
  ".nix-profile", "Library/pnpm", "Library/Python",
];

/**
 * bwrap argumentlari (sof funksiya). Tartib muhim: avval hammasi faqat-o'qish, keyin maxfiy
 * joylar tmpfs bilan yopiladi, keyin vositalar (ro) va ish papkasi (rw) qaytariladi.
 * @param {{command: string, workspace: string, home: string, net?: boolean, exists?: (p: string) => boolean, envFiles?: string[], shell?: string}} p
 */
export function buildBwrapArgs({ command, workspace, home, net = false, exists = existsSync, envFiles = [], shell = "/bin/sh" }) {
  const a = ["--die-with-parent", "--new-session", "--unshare-all"];
  if (net) a.push("--share-net");
  a.push("--ro-bind", "/", "/", "--dev", "/dev", "--proc", "/proc", "--tmpfs", "/tmp");
  if (exists("/var/tmp")) a.push("--tmpfs", "/var/tmp");
  // /run: docker.sock, ssh-agent, dbus, Wayland (unix socket ro-mount'da ham ulanadi — yopiladi).
  // /home (yoki HOME), /root, /mnt (WSL: /mnt/c/Users/...), /media — boshqa sirlar.
  const masks = ["/run"];
  if (home.startsWith("/home/")) masks.push("/home");
  else masks.push(home);
  masks.push("/root", "/mnt", "/media");
  for (const m of [...new Set(masks)]) if (m !== "/" && exists(m)) a.push("--tmpfs", m);
  // DNS (faqat o'rnatishda): /etc/resolv.conf ko'pincha /run/systemd/resolve ga symlink.
  if (net) a.push("--ro-bind-try", "/run/systemd/resolve", "/run/systemd/resolve");
  for (const t of TOOLCHAIN_DIRS) {
    const p = posix.join(home, t);
    if (exists(p)) a.push("--ro-bind", p, p);
  }
  a.push("--bind", workspace, workspace);
  // Tarmoq ochiq bo'lganda ish papkasidagi .env sirlari ko'rinmaydi (install-skript ularni yubora olmaydi).
  if (net) for (const f of envFiles) a.push("--ro-bind", "/dev/null", f);
  a.push("--setenv", "HOME", home, "--setenv", "TMPDIR", "/tmp", "--chdir", workspace, "--", shell, "-c", command);
  return a;
}

// ---- macOS: sandbox-exec (Seatbelt) --------------------------------------------------------

/** Uy papkasi yashirilgan bo'lsa ham alohida (ikkinchi qatlam) — aniq rad etiladigan joylar. */
export const MAC_SECRET_DIRS = [
  ".ssh", ".aws", ".sovereign", ".gnupg", ".kube", ".docker", ".azure", ".config/gcloud", ".config/gh",
  ".netrc", ".npmrc", ".pypirc", ".git-credentials", "Library/Keychains", "Library/Cookies",
  "Library/Application Support/Google/Chrome", "Library/Application Support/Firefox",
  "Library/Application Support/BraveSoftware", "Library/Safari", "Library/Mail", "Library/Messages",
  "Library/Application Support/SOVEREIGN Cowork",
];

const sbplString = (s) => `"${String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

/**
 * Seatbelt profili (sof funksiya). Yo'llar `-D` parametrlari orqali beriladi (profil matniga
 * yo'l aralashmaydi). SBPL'da oxirgi mos qoida ustun.
 * @returns {{profile: string, params: Record<string, string>}}
 */
export function buildSeatbeltProfile({ workspace, privateDir, home, net = false, envFiles = [], exists = existsSync }) {
  const params = { WS: workspace, PRIV: privateDir, HOME: home };
  const readable = TOOLCHAIN_DIRS.map((t) => posix.join(home, t)).filter((p) => exists(p));
  readable.forEach((p, i) => (params[`R${i}`] = p));
  MAC_SECRET_DIRS.forEach((d, i) => (params[`S${i}`] = posix.join(home, d)));
  if (net) envFiles.forEach((f, i) => (params[`E${i}`] = f));
  const P = (k) => `(param ${sbplString(k)})`;
  const lines = [
    "(version 1)",
    "(allow default)",
    // Yozish: faqat ish papkasi, xususiy tmp/HOME va terminal qurilmalari.
    "(deny file-write*)",
    `(allow file-write* (subpath ${P("WS")}) (subpath ${P("PRIV")}) (literal "/dev/null") (literal "/dev/zero") (literal "/dev/tty") (literal "/dev/dtracehelper") (regex #"^/dev/fd/") (regex #"^/dev/ttys[0-9]+$"))`,
    // O'qish: haqiqiy uy papkasi yopiq (faqat stat), ish papkasi va vositalar ochiq.
    `(deny file-read* (subpath ${P("HOME")}))`,
    `(allow file-read-metadata (subpath ${P("HOME")}))`,
    `(allow file-read* (subpath ${P("WS")}) (subpath ${P("PRIV")})${readable.map((_, i) => ` (subpath ${P(`R${i}`)})`).join("")})`,
    `(deny file-read* ${MAC_SECRET_DIRS.map((_, i) => `(subpath ${P(`S${i}`)})`).join(" ")})`,
    // Kalitlar zanjiri (keychain) va clipboard — Mach xizmatlari orqali.
    '(deny mach-lookup (global-name "com.apple.SecurityServer") (global-name "com.apple.pasteboard.1"))',
  ];
  if (net && envFiles.length) lines.push(`(deny file-read* ${envFiles.map((_, i) => `(literal ${P(`E${i}`)})`).join(" ")})`);
  if (!net) {
    // Tarmoq yopiq (unix socket'lar ham: ssh-agent, docker.sock); faqat localhost (testlar, dev server).
    lines.push("(deny network*)", '(allow network* (local ip "localhost:*") (remote ip "localhost:*"))');
  }
  return { profile: lines.join("\n"), params };
}

export function buildSandboxExecArgs({ command, profile, params, shell = "/bin/sh" }) {
  const a = ["-p", profile];
  for (const [k, v] of Object.entries(params)) a.push("-D", `${k}=${v}`);
  a.push(shell, "-c", command);
  return a;
}

// ---- Konteyner: Docker / Podman ---------------------------------------------------------------

const csvField = (s) => (/[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/**
 * `docker|podman run` argumentlari (sof funksiya): faqat ish papkasi /workspace ga ulanadi,
 * tarmoq yo'q (o'rnatishdan tashqari), capability'larsiz, host env konteynerga o'tmaydi.
 */
export function buildContainerArgs({ engine = "docker", image = DEFAULT_SANDBOX_IMAGE, command, workspace, net = false, name, platform = process.platform, uid, gid, identity = {} }) {
  const a = ["run", "--rm", "-i", "--init", "--name", name, "--network", net ? "bridge" : "none",
    "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--pids-limit", "1024",
    "--mount", `type=bind,${csvField(`source=${workspace}`)},target=/workspace`, "-w", "/workspace",
    "--tmpfs", "/tmp:rw,exec,nosuid,size=1g"];
  if (platform === "linux") {
    if (engine === "podman") a.push("--userns=keep-id");
    else if (Number.isInteger(uid) && Number.isInteger(gid)) a.push("--user", `${uid}:${gid}`);
  }
  const env = { HOME: "/tmp", TMPDIR: "/tmp", CI: "1", LANG: "C.UTF-8", GIT_TERMINAL_PROMPT: "0", npm_config_update_notifier: "false", ...identityEnv(identity) };
  for (const [k, v] of Object.entries(env)) a.push("-e", `${k}=${v}`);
  a.push(image, "sh", "-c", command);
  return a;
}

// ---- Aniqlash (kesh bilan) --------------------------------------------------------------------

/** PATH'dan ABSOLYUT yo'l (nisbiy/joriy papka yozuvlari e'tiborsiz — ish papkasidagi soxta docker.exe emas). */
export function whichSync(name, { platform = process.platform, env = process.env, isFile = defaultIsFile } = {}) {
  const pathVar = env.PATH ?? env.Path ?? "";
  const sepChar = platform === "win32" ? ";" : ":";
  const pj = platform === "win32" ? win32 : posix;
  const exts = platform === "win32" ? [".exe"] : [""];
  for (const dir of String(pathVar).split(sepChar)) {
    if (!dir || !pj.isAbsolute(dir)) continue;
    for (const ext of exts) {
      const p = pj.join(dir, name + ext);
      if (isFile(p)) return p;
    }
  }
  return null;
}
function defaultIsFile(p) {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

/** Kalitlarsiz muhit (docker/podman mijozi uchun — u o'zi ishonchli; buyruq konteyner ichida). */
function clientEnv(env = process.env) {
  const e = { ...env };
  for (const k of ["SOVEREIGN_TOKEN", "OPENROUTER_API_KEY", "PERPLEXITY_API_KEY"]) delete e[k];
  return e;
}

function defaultRun(file, args, timeoutMs) {
  return new Promise((res) => {
    try {
      execFile(file, args, { timeout: timeoutMs, windowsHide: true, encoding: "utf8", env: clientEnv(), cwd: tmpdir() }, (err, stdout, stderr) => {
        res({ code: err ? (typeof err.code === "number" ? err.code : 1) : 0, stdout: String(stdout ?? ""), stderr: String(stderr ?? "") });
      });
    } catch (e) {
      res({ code: 1, stdout: "", stderr: String(e?.message ?? e) });
    }
  });
}

const detectCache = new Map();

/**
 * Eng kuchli mavjud sandbox'ni aniqlaydi (natija keshlanadi; `force` — qayta tekshirish).
 * @param {{platform?: string, image?: string, force?: boolean, deps?: {which?: Function, run?: Function, exists?: Function}}} [p]
 * @returns {Promise<{level: "full"|"container"|"limited", method: string, path?: string, image?: string, reason?: string, notes: string[]}>}
 */
export function detectSandbox({ platform = process.platform, image, force = false, deps = {} } = {}) {
  image = isValidImageName(image) ? image : isValidImageName(process.env.SOV_SANDBOX_IMAGE) ? process.env.SOV_SANDBOX_IMAGE : DEFAULT_SANDBOX_IMAGE;
  const custom = !!(deps.which || deps.run || deps.exists);
  const key = `${platform}|${image}`;
  if (!custom && !force && detectCache.has(key)) return detectCache.get(key);
  const p = doDetect({ platform, image, deps });
  if (!custom) detectCache.set(key, p);
  return p;
}

async function doDetect({ platform, image, deps }) {
  const which = deps.which ?? ((n) => whichSync(n, { platform }));
  const run = deps.run ?? defaultRun;
  const exists = deps.exists ?? existsSync;
  const notes = [];
  let reason = "";

  if (platform === "linux") {
    const bw = which("bwrap");
    if (bw) {
      const r = await run(bw, ["--die-with-parent", "--unshare-all", "--ro-bind", "/", "/", "--dev", "/dev", "--proc", "/proc", "--tmpfs", "/tmp", "--", "/bin/true"], 5000);
      if (r.code === 0) return { level: "full", method: "bwrap", path: bw, notes };
      reason = "bwrap-failed";
      notes.push(`bwrap ishlamadi (user namespace o'chiq bo'lishi mumkin): ${(r.stderr || "").trim().slice(0, 160)}`);
    } else reason = "no-bwrap";
  } else if (platform === "darwin") {
    const se = exists("/usr/bin/sandbox-exec") ? "/usr/bin/sandbox-exec" : null;
    if (se) {
      const r = await run(se, ["-p", "(version 1)(allow default)(deny network*)", "/usr/bin/true"], 5000);
      if (r.code === 0) return { level: "full", method: "sandbox-exec", path: se, notes };
      reason = "sandbox-exec-failed";
    } else reason = "no-sandbox-exec";
  }

  // Konteyner: dvigatel ishlayapti VA image allaqachon yuklangan (avtomatik pull yo'q — 120 s ichida ulgurmaydi).
  let engineSeen = false;
  let daemonUp = false;
  for (const engine of ["docker", "podman"]) {
    const path = which(engine);
    if (!path) continue;
    engineSeen = true;
    const v = await run(path, ["version", "--format", "{{.Server.Version}}"], 6000);
    if (v.code !== 0 || !v.stdout.trim()) continue;
    daemonUp = true;
    const img = await run(path, ["image", "inspect", "--format", "{{.Id}}", image], 6000);
    if (img.code === 0) return { level: "container", method: engine, path, image, notes, ...(reason ? { fallbackFrom: reason } : {}) };
  }
  const creason = !engineSeen ? "no-engine" : !daemonUp ? "engine-down" : "no-image";
  return { level: "limited", method: "env", image, reason: reason || creason, containerReason: creason, notes };
}

// ---- Reja va ishga tushirish ----------------------------------------------------------------

/**
 * Bu buyruq qaysi darajada bajariladi.
 *  - oddiy rejim: sandbox faqat mode="required" va haqiqiy sandbox bo'lsa (aks holda — odatdagidek);
 *  - Full auto + "off": faqat "limited" (env to'sig'i);
 *  - Full auto + "auto": eng kuchli mavjud daraja;
 *  - Full auto + "required": haqiqiy sandbox bo'lmasa `required` — tasdiq so'raladi (keyin "limited").
 * @returns {{level: "full"|"container"|"limited"|"none", required: boolean, info: object|null, reason?: string}}
 */
export function planSandbox({ mode, fullAuto, info, cwd = process.cwd(), home = homedir(), platform = process.platform }) {
  mode = normalizeSandboxMode(mode);
  if (!fullAuto && mode !== "required") return { level: "none", required: false, info: null };
  if (fullAuto && mode === "off") return { level: "limited", required: false, info: null, reason: "off" };
  let level = info?.level ?? "limited";
  let reason = info?.reason;
  if (isRealLevel(level) && !sandboxableWorkspace(cwd, home, platform)) {
    level = "limited";
    reason = "workspace-home";
  }
  if (!fullAuto) return isRealLevel(level) ? { level, required: false, info } : { level: "none", required: false, info, reason };
  return { level, required: mode === "required" && !isRealLevel(level), info, reason };
}

let throwawayRoot = null;
/** Jarayon bo'yicha bitta vaqtinchalik ildiz; har buyruqqa alohida HOME/tmp (keyin o'chiriladi). */
function makeRunDirs(platform = process.platform) {
  if (!throwawayRoot || !existsSync(throwawayRoot)) {
    throwawayRoot = realpathSync.native(mkdtempSync(join(tmpdir(), "sov-sandbox-")));
    const root = throwawayRoot;
    process.once("exit", () => {
      try {
        rmSync(root, { recursive: true, force: true });
      } catch {
        /* Windows: band fayl — OS tmp tozalaydi */
      }
    });
  }
  const dir = mkdtempSync(join(throwawayRoot, "run-"));
  const home = join(dir, "home");
  const tmp = join(dir, "tmp");
  mkdirSync(tmp, { recursive: true });
  if (platform === "win32") {
    mkdirSync(join(home, "AppData", "Roaming"), { recursive: true });
    mkdirSync(join(home, "AppData", "Local"), { recursive: true });
  } else mkdirSync(home, { recursive: true });
  return { dir, home, tmp, cleanup: () => rm(dir, { recursive: true, force: true, maxRetries: 2 }, () => {}) };
}

/**
 * Buyruqni ishga tushirish spetsifikatsiyasi.
 * @returns {{level: string, net: boolean, file?: string, args?: string[], env: object, cleanup: () => void, onStop: () => void}}
 *   `file` bo'lsa — execFile(file, args); aks holda — odatdagi shell (exec) shu env bilan.
 */
export function prepareSandboxedRun({ command, plan, cwd = process.cwd(), env = process.env, platform = process.platform, home = homedir() }) {
  const noop = () => {};
  const level = plan?.level ?? "none";
  if (level === "none") return { level: "none", net: false, env: null, cleanup: noop, onStop: noop };
  const net = isInstallCommand(command);
  const identity = gitIdentity(home);
  const info = plan?.info;
  let ws = cwd;
  try {
    ws = realpathSync.native(cwd);
  } catch {
    /* mavjud emas — exec o'zi xato beradi */
  }

  if (level === "full" && info?.method === "bwrap") {
    const envFiles = net ? workspaceEnvFiles(ws) : [];
    return {
      level, net,
      file: info.path,
      args: buildBwrapArgs({ command, workspace: ws, home, net, envFiles }),
      env: sandboxEnv({ env, platform, home, tmp: "/tmp", net, identity }),
      cleanup: noop, onStop: noop,
    };
  }
  if (level === "full" && info?.method === "sandbox-exec") {
    const d = makeRunDirs(platform);
    const envFiles = net ? workspaceEnvFiles(ws) : [];
    const { profile, params } = buildSeatbeltProfile({ workspace: ws, privateDir: d.dir, home, net, envFiles });
    return {
      level, net,
      file: info.path,
      args: buildSandboxExecArgs({ command, profile, params }),
      env: sandboxEnv({ env, platform, home: d.home, tmp: d.tmp, net, identity }),
      cleanup: d.cleanup, onStop: noop,
    };
  }
  if (level === "container" && info?.path) {
    const name = `sov-sbx-${process.pid}-${randomBytes(4).toString("hex")}`;
    const uid = typeof process.getuid === "function" ? process.getuid() : undefined;
    const gid = typeof process.getgid === "function" ? process.getgid() : undefined;
    return {
      level, net,
      file: info.path,
      args: buildContainerArgs({ engine: info.method, image: info.image, command, workspace: ws, net, name, platform, uid, gid, identity }),
      env: clientEnv(env),
      cleanup: noop,
      // Mijozni o'ldirish konteynerni to'xtatmaydi — nomi bo'yicha majburan o'chiriladi.
      onStop: () => defaultRun(info.path, ["rm", "-f", name], 15_000),
    };
  }
  if (level === "limited") {
    const d = makeRunDirs(platform);
    return { level, net, env: sandboxEnv({ env, platform, home: d.home, tmp: d.tmp, net, identity }), cleanup: d.cleanup, onStop: noop };
  }
  return { level: "none", net: false, env: null, cleanup: noop, onStop: noop };
}

// ---- Matnlar (CLI o'zbekcha; Cowork UI o'z i18n kalitlarini ishlatadi) -------------------------

const METHOD_LABEL = { bwrap: "bubblewrap", "sandbox-exec": "sandbox-exec (Seatbelt)", docker: "Docker", podman: "Podman", env: "env" };

/**
 * Qisqa o'zbekcha tavsif: "to'liq — bubblewrap: ..." va h.k.
 * @param {{level: string, info?: object|null, reason?: string}} plan  planSandbox({fullAuto: true}) natijasi
 */
export function describeSandbox(plan, mode = "auto") {
  mode = normalizeSandboxMode(mode);
  const info = plan?.info;
  const limited = "faqat env tozalanadi va HOME vaqtinchalik papkaga yo'naltiriladi; fayl tizimi va tarmoq TO'SILMAYDI";
  if (mode === "off") return `o'chiq (sov config sandbox=off) — Full auto'da ${limited}`;
  if (plan?.reason === "workspace-home") return `cheklangan — ish papkasi uy papkasining o'zi yoki ajdodi (sandbox uni yashira olmaydi); ${limited}`;
  if (plan?.level === "full") return `to'liq — ${METHOD_LABEL[info?.method] ?? info?.method}: yozish faqat ish papkasiga, tarmoq o'chiq, uy papkasi (~/.ssh, ~/.sovereign ...) ko'rinmaydi`;
  if (plan?.level === "container") return `konteyner — ${METHOD_LABEL[info?.method] ?? info?.method} (${info?.image}): faqat ish papkasi ulangan, tarmoq o'chiq, buyruqlar Linux sh'da`;
  return `cheklangan — ${limited}`;
}

/** Daraja nomi (CLI): to'liq / konteyner / cheklangan. */
export function levelLabel(level) {
  return level === "full" ? "to'liq" : level === "container" ? "konteyner" : level === "limited" ? "cheklangan" : "yo'q";
}

/** `sov doctor` uchun maslahat (cheklangan darajada). */
export function sandboxHint(info, platform = process.platform) {
  if (!info || info.level !== "limited") return undefined;
  const img = info.image || DEFAULT_SANDBOX_IMAGE;
  if (platform === "linux" && info.reason === "no-bwrap") return "sudo apt install bubblewrap  (yoki dnf/pacman install bubblewrap)";
  if (platform === "linux" && info.reason === "bwrap-failed") return "Unprivileged user namespace o'chiq: sysctl kernel.unprivileged_userns_clone=1 (Ubuntu 24.04+: AppArmor profili) — yoki Docker/Podman";
  if (info.containerReason === "engine-down") return "Docker Desktop / Podman'ni ishga tushiring, keyin: sov doctor";
  if (info.containerReason === "no-image") return `docker pull ${img}   (sov config sandboxImage=<image> — boshqa image)`;
  return `Docker Desktop yoki Podman o'rnating va: docker pull ${img}`;
}

/** Full auto'da modelga qo'shiladigan qoida (sandbox holati — halol). */
export function sandboxRule(plan) {
  const level = plan?.level ?? "limited";
  const install = "Paket o'rnatish (npm/pnpm/yarn/bun install, pip install) — faqat alohida, zanjirsiz buyruq sifatida (&& yoki ; siz) tarmoq oladi.";
  if (level === "full")
    return `SANDBOX: buyruqlar OS sandbox'ida bajariladi — faqat ish papkasiga va /tmp'ga yozish mumkin, uy papkasi ko'rinmaydi, tarmoq O'CHIQ (faqat localhost). ${install} Tarmoq yoki tashqi yo'l kerak bo'lsa — aylanib o'tishga urinma, foydalanuvchiga ayt.`;
  if (level === "container")
    return `SANDBOX: buyruqlar Linux konteynerida (sh, /workspace = ish papkasi) bajariladi — Windows/cmd sintaksisi emas, POSIX sh sintaksisini ishlat; tarmoq O'CHIQ. ${install} Konteynerda yo'q vosita kerak bo'lsa — foydalanuvchiga ayt.`;
  return `SANDBOX: CHEKLANGAN — haqiqiy sandbox yo'q, faqat env tozalanadi va HOME vaqtinchalik papkaga yo'naltiriladi. Tarmoq faqat proxy'ni hurmat qiladigan vositalar uchun yopiq (paket o'rnatishdan tashqari). Cheklovlarni aylanib o'tishga HECH QACHON urinma.`;
}
