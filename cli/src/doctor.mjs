// `sov doctor` — o'rnatish va ulanishni tekshiradi, har muammo uchun aniq yechim beradi.

import { existsSync, readFileSync, statSync, accessSync, constants as FS } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { loadConfig, CONFIG_PATH } from "./config.mjs";
import { VERSION, IS_BINARY } from "./version.mjs";
import { isProtected } from "./tools.mjs";
import { c, colorEnabled } from "./ui.mjs";

const PKG = "@islombekrrr/sov-cli";

async function getJson(url, { headers = {}, timeoutMs = 5000 } = {}) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* JSON emas */
  }
  return { status: res.status, ok: res.ok, body };
}

function cmpVersion(a, b) {
  const pa = String(a).split(/[.-]/).map((x) => Number.parseInt(x, 10) || 0);
  const pb = String(b).split(/[.-]/).map((x) => Number.parseInt(x, 10) || 0);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
}

function findOnPath() {
  const names = process.platform === "win32" ? ["sov.exe", "sov.cmd", "sov.ps1", "sov"] : ["sov"];
  for (const dir of String(process.env.PATH ?? "").split(delimiter)) {
    if (!dir) continue;
    for (const n of names) {
      const p = join(dir, n);
      try {
        if (statSync(p).isFile()) return p;
      } catch {
        /* yo'q */
      }
    }
  }
  return null;
}

const updateHint = () =>
  IS_BINARY
    ? process.platform === "win32"
      ? "irm https://soveregn.xyz/install.ps1 | iex"
      : "curl -fsSL https://soveregn.xyz/install.sh | sh"
    : `npm install -g ${PKG}@latest`;

/**
 * Barcha tekshiruvlar. Tarmoq so'rovlari qisqa timeout bilan; hech biri throw qilmaydi.
 * @returns {Promise<{id: string, label: string, status: "ok"|"warn"|"fail"|"info", detail: string, hint?: string}[]>}
 */
export async function runDoctor({ checkUpdates = true } = {}) {
  const out = [];
  const add = (id, label, status, detail, hint) => out.push({ id, label, status, detail, ...(hint ? { hint } : {}) });

  // 1. Ishga tushish muhiti
  const major = Number(process.versions.node.split(".")[0]);
  if (IS_BINARY) {
    add("runtime", "Muhit", "ok", `mustaqil binary (ichki Node v${process.versions.node}) — ${process.execPath}`);
  } else if (major >= 20) {
    add("runtime", "Node.js", "ok", `v${process.versions.node} (${process.platform}-${process.arch})`);
  } else {
    add("runtime", "Node.js", "fail", `v${process.versions.node} — 20+ kerak`, "https://nodejs.org dan Node 20+ o'rnating yoki Node'siz binary: curl -fsSL https://soveregn.xyz/install.sh | sh");
  }

  // 2. Versiya / yangilanish
  if (checkUpdates && !process.env.SOV_NO_UPDATE_CHECK) {
    try {
      const r = await getJson(`https://registry.npmjs.org/${PKG.replace("/", "%2f")}/latest`, { timeoutMs: 3000 });
      const latest = r.body?.version;
      if (latest && cmpVersion(latest, VERSION) > 0) add("version", "Versiya", "warn", `${VERSION} — yangisi bor: ${latest}`, updateHint());
      else if (latest) add("version", "Versiya", "ok", `${VERSION} (eng so'nggi)`);
      else add("version", "Versiya", "info", `${VERSION} (yangilanishni tekshirib bo'lmadi)`);
    } catch {
      add("version", "Versiya", "info", `${VERSION} (yangilanishni tekshirib bo'lmadi — offline?)`);
    }
  } else {
    add("version", "Versiya", "info", VERSION);
  }

  // 3. Konfiguratsiya fayli
  if (!existsSync(CONFIG_PATH)) {
    add("config", "Sozlamalar", "warn", `${CONFIG_PATH} hali yo'q`, "sov login  (yoki: sov key sk-or-...)");
  } else {
    try {
      JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
      const mode = statSync(CONFIG_PATH).mode & 0o777;
      if (process.platform !== "win32" && mode & 0o077) {
        add("config", "Sozlamalar", "warn", `${CONFIG_PATH} — boshqalar o'qiy oladi (${mode.toString(8)})`, `chmod 600 "${CONFIG_PATH}"`);
      } else {
        add("config", "Sozlamalar", "ok", CONFIG_PATH);
      }
    } catch (err) {
      add("config", "Sozlamalar", "fail", `${CONFIG_PATH} buzilgan: ${err.message}`, `Faylni o'chiring va qayta kiring: sov login`);
    }
  }

  // 4. Ulanish turi
  const cfg = loadConfig();
  if (cfg.token) {
    add("auth", "Ulanish", "ok", `SOVEREIGN akkaunt${process.env.SOVEREIGN_TOKEN ? " (SOVEREIGN_TOKEN env)" : ""}`);
  } else if (cfg.openrouterKey) {
    add("auth", "Ulanish", "ok", `o'z OpenRouter kaliti${process.env.OPENROUTER_API_KEY ? " (OPENROUTER_API_KEY env)" : ""} · model ${cfg.model}`);
  } else {
    add("auth", "Ulanish", "fail", "tizimga kirilmagan", "sov login   (yoki o'z kalitingiz: sov key sk-or-v1-...)");
  }

  // 5. Server
  const base = cfg.baseUrl.replace(/\/$/, "");
  let reachable = false;
  try {
    const r = await getJson(`${base}/api/health`, { timeoutMs: 5000 });
    reachable = true;
    if (r.status >= 500) add("server", "Server", "warn", `${base} javob berdi, lekin holati ${r.status}`, "https://status.soveregn.xyz — biroz kutib qayta urining");
    else add("server", "Server", "ok", `${base} (HTTP ${r.status})`);
  } catch (err) {
    const why = err?.name === "TimeoutError" ? "5 s ichida javob yo'q" : String(err?.cause?.code ?? err?.cause?.errors?.[0]?.code ?? err?.cause?.message ?? err?.message ?? err);
    add("server", "Server", "fail", `${base} — ulanib bo'lmadi (${why})`, "Internet/proxy/VPN'ni tekshiring; boshqa manzil uchun: SOVEREIGN_URL=https://...");
  }

  // 6. Token haqiqiyligi
  if (cfg.token && reachable) {
    try {
      const r = await getJson(`${base}/api/cli/me`, { headers: { Authorization: `Bearer ${cfg.token}` }, timeoutMs: 5000 });
      if (r.ok) {
        const plan = r.body?.plan ? ` · tarif: ${r.body.plan}${r.body.plan_state === "expired" ? " (muddati tugagan)" : ""}` : "";
        add("login", "Login", "ok", `${r.body?.email || "akkaunt"}${plan}`);
      } else if (r.status === 401) {
        add("login", "Login", "fail", "token yaroqsiz yoki bekor qilingan", "sov logout, keyin sov login");
      } else {
        add("login", "Login", "warn", `tekshirib bo'lmadi (HTTP ${r.status})`, r.status === 429 ? "Bir daqiqadan keyin qayta urining" : undefined);
      }
    } catch {
      add("login", "Login", "warn", "tekshirib bo'lmadi (tarmoq)");
    }
  }

  // 7. Ish papkasi
  const cwd = process.cwd();
  const home = resolve(homedir());
  let writable = true;
  try {
    accessSync(cwd, FS.W_OK);
  } catch {
    writable = false;
  }
  if (isProtected(cwd, { write: true })) {
    add("cwd", "Ish papkasi", "fail", `${cwd} — himoyalangan joy`, "Loyiha papkasiga o'ting: cd <loyiha>");
  } else if (resolve(cwd).toLowerCase() === home.toLowerCase()) {
    add("cwd", "Ish papkasi", "warn", `${cwd} — uy papkasi (kontekst katta, fayllar shu yerga yoziladi)`, "Loyiha papkasiga o'ting: cd <loyiha> && sov");
  } else if (!writable) {
    add("cwd", "Ish papkasi", "warn", `${cwd} — yozish huquqi yo'q`, "Yozish mumkin bo'lgan papkada ishga tushiring");
  } else {
    add("cwd", "Ish papkasi", "ok", cwd);
  }

  // 8. PATH
  const onPath = findOnPath();
  if (onPath) add("path", "PATH", "ok", `sov → ${onPath}`);
  else
    add(
      "path",
      "PATH",
      "warn",
      "`sov` buyrug'i PATH'da topilmadi",
      process.platform === "win32"
        ? "Yangi terminal oching; bo'lmasa: %LOCALAPPDATA%\\Programs\\sov ni foydalanuvchi PATH'iga qo'shing"
        : "Yangi terminal oching; bo'lmasa: export PATH=\"$HOME/.local/bin:$PATH\" ni ~/.bashrc yoki ~/.zshrc ga qo'shing",
    );

  // 9. PDF (ixtiyoriy)
  if (IS_BINARY) {
    add("pdf", "PDF matni", "info", "binary versiyada yo'q (rasm/matn fayllar ishlaydi)", `PDF uchun npm versiyasi: npm i -g ${PKG} pdf-parse@2`);
  } else {
    try {
      await import("pdf-parse");
      add("pdf", "PDF matni", "ok", "pdf-parse o'rnatilgan");
    } catch {
      add("pdf", "PDF matni", "info", "pdf-parse o'rnatilmagan (ixtiyoriy)", "npm i -g pdf-parse@2");
    }
  }

  // 10. Terminal
  const term = [
    process.stdout.isTTY ? "TTY" : "quvur (non-TTY)",
    colorEnabled() ? "rangli" : "rangsiz",
    process.env.NO_COLOR ? "NO_COLOR" : "",
  ].filter(Boolean);
  add("terminal", "Terminal", "info", term.join(" · "));

  return out;
}

export function printDoctor(results) {
  const icon = { ok: c.green("✓"), warn: c.amber("!"), fail: c.red("✕"), info: c.dim("·") };
  console.log(`\n  ${c.bold(c.white("sov doctor"))}  ${c.dim(`v${VERSION}`)}\n`);
  for (const r of results) {
    console.log(`  ${icon[r.status] ?? "•"} ${c.white(r.label.padEnd(13))} ${r.status === "fail" ? c.red(r.detail) : c.dim(r.detail)}`);
    if (r.hint && r.status !== "ok") console.log(`    ${" ".repeat(13)} ${c.accent("→")} ${r.hint}`);
  }
  const fails = results.filter((r) => r.status === "fail").length;
  const warns = results.filter((r) => r.status === "warn").length;
  console.log(
    "\n  " +
      (fails
        ? c.red(`${fails} ta muammo`) + (warns ? c.dim(`, ${warns} ta ogohlantirish`) : "") + c.dim(" — yuqoridagi → ko'rsatmalarga amal qiling.")
        : warns
          ? c.amber(`${warns} ta ogohlantirish`) + c.dim(" — ishlaydi, lekin e'tibor bering.")
          : c.green("Hammasi joyida.")) +
      "\n",
  );
  return fails;
}
