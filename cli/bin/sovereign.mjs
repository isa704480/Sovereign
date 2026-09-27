#!/usr/bin/env node
import readline from "node:readline";
import { format } from "node:util";
import { readFileSync, statSync } from "node:fs";
import { dirname as pathDirname, resolve as pathResolve, sep as pathSep } from "node:path";
import { loadConfig, saveConfig, clearAuth, revokeStoredToken, isAccountMode, normalizeSetting, CONFIG_PATH } from "../src/config.mjs";
import { agentTurn, initialMessages, swarm } from "../src/agent.mjs";
import { loadMemory, addMemory, removeMemory, clearMemory, syncMemory } from "../src/memory.mjs";
import { addProjectNote, createProjectFile, projectInfo, readProjectMemory, refreshProjectMessage, PROJECT_MAX_BYTES } from "../src/project-memory.mjs";
import { login } from "../src/login.mjs";
import { printModels, printLocalModels, resolveModelId, isOmniId, fetchCatalog, printCatalog, fetchFamilies, matchFamily, fetchLocalModels, parseLocalModelId, CLI_MODELS, LOCAL_PREFIX } from "../src/models.mjs";
import { selectMenu } from "../src/menu.mjs";
import { collectMentions, completeMention, readAttachment } from "../src/files.mjs";
import { banner, c, clearScreen, configureUi, gutter, hintBar, logo, skillsList, slashMenu, spinner, stopSpinner, stripAnsi } from "../src/ui.mjs";
import { SKILLS, SKILL_IDS, SLASH_COMMANDS, SLASH_NAMES, openBrowser } from "../src/commands.mjs";
import { contextSummary, fullAutoDenyReason, isTrustableDir, resolvePath as resolveWs, visible } from "../src/tools.mjs";
import { fullAutoMustAsk } from "../src/full-auto.mjs";
import { confirmFullAutoTrust } from "../src/trust.mjs";
import { cliSnapshotStore, describeCounts } from "../src/snapshot.mjs";
import { fetchMe, pushSettings, startBackgroundSync } from "../src/sync.mjs";
import { countTurns, listSessions, loadSession, rewind, saveSession } from "../src/sessions.mjs";
import { EXIT, SUBCOMMANDS, parseArgs } from "../src/args.mjs";
import { VERSION, IS_BINARY } from "../src/version.mjs";
import { runDoctor, printDoctor } from "../src/doctor.mjs";
import { runAudit, formatAudit, auditPrompt } from "../src/audit.mjs";
import { renderDiff } from "../src/diff.mjs";
import { loadHistory, saveHistory, HISTORY_SIZE } from "../src/history.mjs";
import {
  buildContext,
  confirmFullAutoLocal,
  createInquiryState,
  createLimitHandler,
  inquiryPlan,
  insertAddendum,
  installHint,
  localModels,
  removeMessage,
  renderFollowups,
  resolveLocalModel,
  runInquiry,
  splitUserContent,
} from "../src/inquiry.mjs";
import { invokedName } from "../src/invoked.mjs";

const parsed = parseArgs(process.argv.slice(2));
const flags = parsed.flags;
if (flags.noColor) configureUi({ color: false });
const AUTO_YES = Boolean(flags.yes);

/**
 * VIBE rejim — `sov` deb chaqirilganda (yoki --vibe bilan) yoqiladi: kodni
 * faqat AI yozadi, ish papkasi ICHIDA fayl yaratish/o'zgartirish va faqat-o'qish
 * (safe) buyruqlar har safar so'ralmaydi. Xavfli buyruqlar (interpretator, paket
 * menejeri, tarmoq, fayl o'zgartiruvchi...) va ish papkasidan tashqaridagi yo'llar
 * baribir tasdiq so'raydi — bu chegara hech qachon ochilmaydi. --no-vibe o'chiradi.
 */
// Windows npm shim (sov.cmd) argv[1]'ga skript faylini beradi — `sov` bin/sov.mjs orqali belgilanadi.
const invokedAs = invokedName();
const vibe = { on: !flags.noVibe && (invokedAs === "sov" || Boolean(flags.vibe)) };

/**
 * FULL AUTO — `--full-auto` yoki `/auto` (foydalanuvchi o'zi yoqadi): HECH NARSA
 * so'ralmaydi. Ish papkasi ichidagi yozish va barcha buyruqlar (paket o'rnatish,
 * test, build) tasdiqsiz bajariladi. So'ralmasdan RAD ETILADI: tashqi yo'llar,
 * himoyalangan/bloklangan narsalar (tools.mjs), push/publish/deploy/sudo, git config
 * va sessiyadan keyin o'zi ishga tushadigan fayllar (CI/hook/.vscode/SOVEREIGN.md).
 * DIQQAT: bu rad etish faqat buyruq MATNI filtri, sandbox EMAS — agent yozgan skript
 * foydalanuvchi huquqlari bilan ishlaydi. Shuning uchun har papkada bir martalik
 * ogohlantirishli tasdiq (src/trust.mjs), flag orqali yoqilganda ham.
 */
const fullAuto = { on: Boolean(flags.fullAuto) };

/**
 * `sov init --ai`: foydalanuvchi aynan SOVEREIGN.md ni to'ldirishni so'ragan — shu bitta
 * fayl uchun avtomatik-fayl cheklovi (forcePrompt / full auto rad) qo'llanmaydi.
 */
const initTarget = { path: "" };
function isInitTarget(meta) {
  if (!initTarget.path || meta?.tool !== "write_file" || meta.outside || !meta.path) return false;
  const a = pathResolve(String(meta.path));
  return process.platform === "win32" ? a.toLowerCase() === initTarget.path.toLowerCase() : a === initTarget.path;
}

/**
 * Full auto'da ham ODDIY tasdiq kerakmi (Cowork bilan bir xil qoidalar, cli/src/full-auto.mjs):
 * CI/IDE/hook fayli, ko'rinmas bidi/nol-kenglik belgisi, `node -e` / `python -c` kabi satr-ichi kod.
 * Rad etiladigan holatlar (tashqi yo'l, autorun fayl, push/deploy) — null: ularni fullAutoDecision rad etadi.
 */
function fullAutoAskReason(meta) {
  if (!meta || meta.outside) return null;
  if (meta.fullAutoDeny && !isInitTarget(meta)) return null;
  if (meta.tool === "run_command" && fullAutoDenyReason(meta.command)) return null;
  let rel = "";
  if ((meta.tool === "write_file" || meta.tool === "make_dir") && typeof meta.path === "string") {
    try {
      const r = resolveWs(meta.path);
      rel = r.outside ? "" : String(r.rel ?? "");
    } catch {
      /* yo'l aniqlanmadi — meta.path bilan tekshiriladi */
    }
  }
  return fullAutoMustAsk(meta, rel);
}

/** Full auto qarori: true — bajar, false — rad et (hech qachon so'ramaydi). */
function fullAutoDecision(question, meta) {
  const q = stripAnsi(question);
  if (meta?.outside) {
    console.log(`  ${c.red("⊘")} ${c.dim(q)} ${c.red("full auto: ish papkasidan tashqarida — rad etildi")}`);
    return false;
  }
  // Sessiyadan keyin o'zi ishga tushadigan fayl (CI, git hook, .vscode task, install-skript, SOVEREIGN.md).
  if (meta?.fullAutoDeny && !isInitTarget(meta)) {
    console.log(`  ${c.red("⊘")} ${c.dim(q)} ${c.red(`full auto: ${meta.fullAutoDeny} — rad etildi (qo'lda tasdiqlang: /auto o'chirib qayta so'rang)`)}`);
    return false;
  }
  const deny = meta?.tool === "run_command" ? fullAutoDenyReason(meta.command) : null;
  if (deny) {
    console.log(`  ${c.red("⊘")} ${c.dim(q)} ${c.red(`full auto: ${deny} — rad etildi (qo'lda bajaring)`)}`);
    return false;
  }
  console.log(`  ${c.emerald("⚡")} ${c.dim(q)} ${c.emerald("full auto")}`);
  return true;
}

// -f <path> / --file <path> — birinchi xabarga biriktiriladigan fayllar.
const attachFiles = parsed.files;

/** Faqat shu ishga model (saqlanmaydi): -m / --model. */
function withModelOverride(config) {
  if (!flags.model) return config;
  // -m local:<nom> — mahalliy model (applyLocalStartup hal qiladi), server modeli o'zgarmaydi.
  if (parseLocalModelId(flags.model)) return config;
  if (config.token) return { ...config, omniModel: flags.model, model: flags.model };
  return { ...config, model: resolveModelId(flags.model), omniModel: "" };
}

/**
 * Ishga tushishda mahalliy model so'ralganmi: `--ollama[=model]` yoki `-m local:<nom>`.
 * @returns {string|null} null — so'ralmagan; "" — standart (localModel yoki birinchi o'rnatilgan); aks holda nom
 */
function requestedLocal() {
  if (flags.ollama) return typeof flags.ollama === "string" ? flags.ollama : "";
  const m = flags.model ? parseLocalModelId(flags.model) : null;
  return m ?? null;
}

/**
 * `--ollama` / `-m local:` → `config.local` (faqat 127.0.0.1 Ollama). Full auto bilan — alohida tasdiq.
 * @returns {Promise<{ok: true} | {ok: false, error: string, hint: string[]}>}
 */
async function applyLocalStartup(config, { interactive, rl, log }) {
  const want = requestedLocal();
  if (want == null) {
    await applyFullAutoStartup({ interactive, rl, log });
    return { ok: true };
  }
  const r = await resolveLocalModel(want, config, { c });
  if (!r.ok) return { ok: false, error: r.error, hint: r.hint ?? [] };
  config.local = r.model.name;
  if (fullAuto.on && !(await confirmFullAutoLocal({ interactive, ask: (q) => ask(rl, q), log, c }))) fullAuto.on = false;
  await applyFullAutoStartup({ interactive, rl, log });
  return { ok: true };
}

/** --full-auto flag: shu papkada bir martalik ogohlantirishli tasdiq (interaktivsiz — faqat ogohlantirish). */
async function applyFullAutoStartup({ interactive, rl, log }) {
  if (fullAuto.on && !(await confirmFullAutoTrust({ interactive, ask: (q) => ask(rl, q), log, c }))) fullAuto.on = false;
}

/** applyLocalStartup xatosi — terminalga (qizil xabar + ko'rsatma). */
function printLocalError(r, log) {
  log(c.red(r.error));
  for (const h of r.hint) log("  " + h);
}

/** Limit / offline / server xatosida "mahalliy model bilan davom etasizmi?" — agentTurn `config.onLimit` hook'i (T9). */
function limitHook(getConfig, { interactive, rl, log }) {
  return createLimitHandler({
    getConfig,
    interactive,
    log,
    c,
    fullAuto,
    save: saveConfig,
    beforePrompt: stopSpinner,
    // Ctrl+C bilan bekor qilingan savol "yo'q" deb hisoblanadi (bo'sh Enter — "ha" emas).
    ask: async (q) => {
      const s = turnState.ac?.signal;
      const a = await ask(rl, q, s);
      return s?.aborted ? "n" : a;
    },
  });
}

/** Chuqur so'rash konteksti (§A.9): fayl NOMLARI + SOVEREIGN.md boshi + papka tuzilmasi. Fayl mazmuni ketmaydi. */
function inquiryContext(userMsg) {
  const { files } = splitUserContent(userMsg?.content);
  let folder = "";
  try {
    const pm = readProjectMemory();
    folder = (pm ? `SOVEREIGN.md (project notes, head):\n${pm.content.slice(0, 1200)}\n\n` : "") + contextSummary();
  } catch {
    folder = "";
  }
  return buildContext({ files, folder });
}

/**
 * Yangi vazifaning birinchi xabarida chuqur so'rash (docs/INQUIRY.md §A.9). Skip qoidalari — inquiryPlan().
 * @returns {Promise<{cancelled: boolean, addendum: string, followups: object[]}>}
 */
async function inquiryStep({ messages, userMsg, config, firstMessage, interactive, rl, state, log, signal }) {
  const plan = inquiryPlan({ flags, config, interactive, firstMessage });
  if (plan.mode === "none") return { cancelled: false, addendum: "", followups: [] };
  return runInquiry({
    messages,
    userMsg,
    config,
    plan,
    fullAuto: fullAuto.on,
    context: plan.mode === "server" ? inquiryContext(userMsg) : "",
    state,
    ask: (q) => ask(rl, q, signal),
    log,
    c,
    signal,
    spin: () => spinner("vazifa tahlil qilinyapti..."),
  });
}

/** Build a user message: string if no attachments, multimodal array otherwise. */
async function buildUserMessage(text, paths) {
  if (!paths || paths.length === 0) return { role: "user", content: text };
  const parts = [];
  for (const p of paths) {
    try {
      const att = await readAttachment(p);
      parts.push(att.part);
      console.log(`  ${att.label} ${c.dim("biriktirildi")}`);
    } catch (err) {
      console.log(`  ${c.red("✕")} ${p}: ${c.dim(err.message)}`);
    }
  }
  parts.push({ type: "text", text: text || "(fayllarni ko'zdan kechir)" });
  return { role: "user", content: parts };
}

/** Savol; `signal` bekor qilinsa (Ctrl+C) bo'sh javob — ya'ni "yo'q". */
function ask(rl, q, signal) {
  return new Promise((res) => {
    if (signal?.aborted) return res("");
    const onAbort = () => res("");
    signal?.addEventListener("abort", onAbort, { once: true });
    rl.question(q, signal ? { signal } : {}, (a) => {
      signal?.removeEventListener("abort", onAbort);
      res(a);
    });
  });
}

/** Ask until a non-empty answer (tolerates a stray leading newline on Windows cmd). */
async function askRequired(rl, q, tries = 4) {
  for (let i = 0; i < tries; i++) {
    const a = (await ask(rl, q)).trim();
    if (a) return a;
  }
  return "";
}

/**
 * write_file tasdig'idan oldin diff: nima o'zgarishini ko'rib tasdiqlash.
 * `full` — tasdiq so'ralganda (ko'proq qator); avtomatik tasdiqda qisqa.
 */
function previewWrite(meta, full) {
  if (meta?.tool !== "write_file" || typeof meta.content !== "string") return;
  let old = "";
  if (meta.exists) {
    try {
      old = readFileSync(resolveWs(meta.path).real, "utf8");
    } catch {
      old = "";
    }
  }
  if (!meta.exists && !full) return; // avto rejimda yangi fayl — faqat bir qator (tasdiq satrida)
  if (old.length > 1_000_000 || meta.content.length > 1_000_000) {
    console.log(`      ${c.dim("(fayl katta — diff ko'rsatilmaydi)")}`);
    return;
  }
  const d = renderDiff(old, meta.content, { isNew: !meta.exists, maxLines: full ? 40 : 12 });
  console.log(`      ${c.dim(meta.exists ? "o'zgarish" : "yangi fayl")} ${d.stat}`);
  for (const l of d.lines) console.log("      " + l);
}

/** Joriy navbat (Ctrl+C uni bekor qiladi). */
const turnState = { ac: null };

async function confirmer(rl) {
  // "a" (hammasiga ha) — shu sessiya davomida: ish papkasi ICHIDAGI fayl amallari
  // va faqat-o'qish (safe) buyruqlar qayta so'ralmaydi. `forcePrompt` so'rovlar
  // (ish papkasidan TASHQARIDAGI yo'l yoki xavfli buyruq) uchun "a" taklif
  // qilinmaydi va ular --yes / vibe / "a" bilan ham HAR DOIM so'raladi.
  const trust = { all: false, dirs: new Set() };
  const inTrustedDir = (p) => {
    if (!p || resolveWs(p).outside) return false; // /cwd o'zgargan bo'lsa ham qayta tekshiriladi
    const full = pathResolve(p).toLowerCase();
    for (const d of trust.dirs) if (full === d || full.startsWith(d + pathSep)) return true;
    return false;
  };
  return async (question, forcePrompt = false, meta = null) => {
    stopSpinner();
    let fullAutoAsk = null;
    if (fullAuto.on) {
      fullAutoAsk = fullAutoAskReason(meta);
      if (!fullAutoAsk) {
        const ok = fullAutoDecision(question, meta);
        if (ok) previewWrite(meta, false);
        return ok;
      }
      // Full auto'da ham majburiy tasdiq ("a" taklif qilinmaydi).
      console.log(`  ${c.amber("⚡")} ${c.dim("full auto: bu amal qo'lda tasdiqlanadi")} ${c.dim(`(${fullAutoAsk})`)}`);
    }
    const mustAsk = Boolean(fullAutoAsk || forcePrompt || meta?.risky || meta?.outside);
    if (!mustAsk && (trust.all || inTrustedDir(meta?.path))) {
      console.log(`  ${c.dim("✓")} ${c.dim(stripAnsi(question))} ${c.green("auto")}`);
      previewWrite(meta, false);
      return true;
    }
    if ((AUTO_YES || vibe.on) && !mustAsk) {
      console.log(`  ${c.amber("?")} ${question} ${c.green("auto-yes")}`);
      previewWrite(meta, false);
      return true;
    }
    previewWrite(meta, true);
    // `mustAsk` — tashqi yo'l / xavfli buyruq: --yes bo'lsa ham majburiy tasdiq, "a" yo'q.
    const prefix = mustAsk ? c.red("!") : c.amber("?");
    const opts = mustAsk ? "[y/N] " : "[y/N/a] ";
    const a = (await ask(rl, `  ${prefix} ${question} ${c.dim(opts)}`, turnState.ac?.signal)).trim().toLowerCase();
    if (!mustAsk && ["a", "all", "hammasi", "hammasiga", "doim"].includes(a)) {
      trust.all = true;
      if (meta?.path) {
        const full = pathResolve(meta.path);
        const dir = meta.dir ? full : pathDirname(full);
        // Faqat ish papkasi ichidagi papka; uy/disk ildizi/himoyalangan hech qachon.
        if (isTrustableDir(dir)) trust.dirs.add(dir.toLowerCase());
      }
      console.log(`  ${c.green("✓ shu sessiyada ish papkasi ichidagi amallar so'ralmaydi")} ${c.dim("(tashqi yo'llar va xavfli buyruqlardan tashqari)")}`);
      return true;
    }
    return a === "y" || a === "yes" || a === "ha";
  };
}

/**
 * Interaktivsiz (-p / quvur) tasdiqlovchi: hech narsa so'ramaydi. Faqat --yes
 * yoki aniq --vibe bilan ish papkasi ichidagi oddiy amallar bajariladi; tashqi
 * yo'l va xavfli buyruqlar (forcePrompt) HAR DOIM rad etiladi.
 */
function nonInteractiveConfirmer() {
  return async (question, forcePrompt = false, meta = null) => {
    if (fullAuto.on) {
      const why = fullAutoAskReason(meta);
      if (!why) return fullAutoDecision(question, meta);
      console.log(`  ⊘ ${stripAnsi(question)} — rad etildi (full auto: ${why} — interaktiv tasdiq talab qilinadi)`);
      return false;
    }
    const mustAsk = Boolean((forcePrompt && !isInitTarget(meta)) || meta?.risky || meta?.outside);
    const q = stripAnsi(question);
    if (!mustAsk && (AUTO_YES || flags.vibe)) {
      console.log(`  ✓ ${q} (auto-yes)`);
      return true;
    }
    console.log(`  ⊘ ${q} — rad etildi (${mustAsk ? "interaktiv tasdiq talab qilinadi" : "ruxsat uchun --yes"})`);
    return false;
  };
}

async function ensureAuth(rl) {
  let config = loadConfig();
  // Mahalliy model (--ollama) — server kerak emas, login so'ralmaydi.
  if (isAccountMode(config) || config.openrouterKey || requestedLocal() != null) return config;

  console.log(`\n  ${c.amber("Hali ulanmagansiz.")}`);
  console.log(`  ${c.dim("1)")} ${c.white("SOVEREIGN akkaunti")} ${c.dim("(tavsiya) — brauzerda login")}`);
  console.log(`  ${c.dim("2)")} ${c.white("O'z OpenRouter kalitim")}`);
  const choice = (await askRequired(rl, `  ${c.dim("Tanlang [1/2]: ")}`)).trim();

  if (choice === "2") {
    const key = await askRequired(rl, `  ${c.dim("OpenRouter kalit (sk-or-...): ")}`);
    if (!key) process.exit(EXIT.AUTH);
    saveConfig({ openrouterKey: key });
    return loadConfig();
  }

  const ok = await login(config.baseUrl);
  if (!ok) process.exit(EXIT.AUTH);
  return loadConfig();
}

// ---- yordam -----------------------------------------------------------
const COMMAND_HELP = {
  login: ["sov login [--local | --url=URL]", "Brauzer orqali SOVEREIGN akkauntiga ulanish (tasdiq sahifasi ochiladi).", ["sov login", "sov login --local"]],
  logout: ["sov logout", "Akkauntdan chiqish (token serverda ham bekor qilinadi).", []],
  whoami: ["sov whoami [--json]", "Ulanish holati: akkaunt yoki o'z OpenRouter kalitingiz.", ["sov whoami --json"]],
  doctor: ["sov doctor [--json]", "Diagnostika: Node/binary, versiya, config, server, login, ish papkasi, PATH. Muammo bo'lsa chiqish kodi 1.", ["sov doctor", "sov doctor --json"]],
  init: [
    "sov init [--ai]",
    "Loyiha xotirasi: joriy papkada SOVEREIGN.md yaratadi (loyiha haqida, stek, buyruqlar, qoidalar, \"tegma\" ro'yxati, eslatmalar). Agent (CLI va Cowork) uni har suhbat boshida o'qiydi — git'ga commit qiling, jamoa bilan ulashiladi. --ai: agent loyihani o'rganib faylni o'zi to'ldiradi (yozishdan oldin tasdiq so'raladi).",
    ["sov init", "sov init --ai"],
  ],
  audit: [
    "sov audit [papka] [--json]",
    "Deploy'dan oldingi xavfsizlik tekshiruvi (offline): oshkor kalitlar (AWS, Stripe, OpenAI, service_role...), .env va .gitignore, NEXT_PUBLIC_/VITE_ ichidagi sirlar, RLS'siz Supabase jadvallari va `using (true)` siyosatlari, Firebase qoidalari, CORS `*` + credentials, eval, dangerouslySetInnerHTML, http:// API. Sirlar faqat 4 belgi + *** ko'rinishida chiqadi. critical/high topilsa chiqish kodi 1. Interaktiv rejimda /audit — AI bilan tuzatish taklifi bilan.",
    ["sov audit", "sov audit ./my-app", "sov audit --json > audit.json"],
  ],
  models: [
    "sov models",
    "Modellar ro'yxati va kompyuterdagi mahalliy (Ollama) modellar (interaktiv rejimda /model — to'liq katalog, /local — mahalliy model).",
    ["sov models", "sov --ollama=qwen2.5-coder:7b \"bu kodni tushuntir\""],
  ],
  sessions: ["sov sessions [--json]", "Saqlangan suhbatlar. Davom ettirish: interaktiv rejimda /resume <id>.", []],
  key: ["sov key <sk-or-...>", "O'z OpenRouter kalitingizni saqlash (akkauntsiz rejim).", ["sov key sk-or-v1-..."]],
  config: [
    "sov config [kalit=qiymat ...]",
    "Argumentsiz — kalitlar va standart modelni interaktiv sozlash. Argument bilan: inquiry=auto|always|off (chuqur so'rash — vazifa boshida aniqlashtiruvchi savollar), localFallback=off|ask|auto (limit tugasa yoki internet bo'lmasa mahalliy modelga o'tish: o'chiq / so'rash / avtomatik), localModel=<nom> (Ollama modeli, bo'sh — tanlanmagan).",
    ["sov config inquiry=off", "sov config localFallback=auto localModel=qwen2.5-coder:7b"],
  ],
  version: ["sov version", "Versiyani chiqarish (yoki: sov --version).", []],
};

function handleHelp(topic) {
  const t = topic === "who" ? "whoami" : topic;
  if (t && COMMAND_HELP[t]) {
    const [usage, desc, examples] = COMMAND_HELP[t];
    console.log(`\n  ${c.white("Foydalanish:")} ${usage}\n\n  ${desc}\n`);
    if (examples.length) console.log(`  ${c.white("Misollar:")}\n${examples.map((e) => `    ${e}`).join("\n")}\n`);
    return;
  }
  const w = (s) => c.white(s);
  console.log(
    [
      "",
      `  ${logo()} ${c.dim("CLI v" + VERSION)} ${c.dim("— terminaldagi AI koding agenti")}`,
      "",
      `  ${w("Foydalanish:")}`,
      `    sov [flaglar] ["vazifa"]`,
      `    sov <buyruq> [argumentlar]`,
      "",
      `  ${w("Buyruqlar:")}`,
      `    ${w("(buyruqsiz)")}              interaktiv rejim (chat + agent)`,
      `    ${w('"vazifa"')}                 bitta vazifani bajarib chiqish (tasdiqlar so'raladi)`,
      `    ${w("login")} [--local|--url=]   brauzer orqali akkauntga ulanish`,
      `    ${w("logout")}                   akkauntdan chiqish`,
      `    ${w("whoami")}                   ulanish holati`,
      `    ${w("doctor")}                   diagnostika va yechim ko'rsatmalari`,
      `    ${w("init")} [--ai]              SOVEREIGN.md — jamoa uchun loyiha xotirasi (--ai: agent to'ldiradi)`,
      `    ${w("audit")} [papka]            deploy'dan oldin xavfsizlik tekshiruvi (kalitlar, RLS, .env, CORS)`,
      `    ${w("models")}                   modellar ro'yxati`,
      `    ${w("sessions")}                 saqlangan suhbatlar`,
      `    ${w("key")} <sk-or-...>          o'z OpenRouter kalitingiz`,
      `    ${w("config")}                   interaktiv sozlash`,
      `    ${w("version")}                  versiya`,
      `    ${w("help")} [buyruq]            yordam (mas. sov help doctor)`,
      "",
      `  ${w("Flaglar:")}`,
      `    -p, --print              interaktivsiz: javobni stdout'ga chiqarib chiqadi`,
      `        --json               -p / doctor / audit / whoami bilan — JSON natija`,
      `    -f, --file <yo'l>        fayl biriktirish (rasm/PDF/matn; takrorlash mumkin)`,
      `    -m, --model <id>         shu ish uchun model (saqlanmaydi)`,
      `    -y, --yes                ish papkasi ichidagi oddiy amallarni avtomatik tasdiqlash`,
      `        --vibe, --no-vibe    vibe rejimni yoqish / o'chirish (sov nomi bilan yoqiq)`,
      `        --full-auto, --auto  FULL AUTO: hech narsa so'ralmaydi (sandbox emas — faqat ishonchli papkada)`,
      `        --no-verify          AI hakam (halollik tekshiruvi)ni o'chirish`,
      `        --budget <token>     bitta vazifa uchun token byudjeti (mas. 50k) — oshsa navbat to'xtaydi`,
      `        --no-ask             vazifa boshida aniqlashtiruvchi savollar berilmasin (chuqur so'rash)`,
      `        --ollama[=model]     mahalliy model (Ollama, 127.0.0.1) — serverga hech narsa yuborilmaydi`,
      `        --no-color           rangsiz chiqish (yoki NO_COLOR=1)`,
      `    -V, --version            versiya`,
      `    -h, --help               shu yordam`,
      "",
      `  ${w("Misollar:")}`,
      `    sov`,
      `    sov "Express server yarat va test qil"`,
      `    sov -p "bu loyiha nima qiladi?"`,
      `    git diff | sov -p "shu o'zgarishni review qil"`,
      `    sov -p --json "package.json'ni tekshir" > natija.json`,
    `    sov --full-auto "todo API yoz, test qil va xatolarni tuzat"`,
      `    sov "shu dizaynga HTML yoz" -f mockup.png`,
      `    sov --ollama=qwen2.5-coder:7b "bu funksiyani tushuntir"   ${c.dim("# internetsiz, mahalliy model")}`,
      `    sov doctor`,
      `    sov init --ai`,
      `    sov audit                  ${c.dim("# deploy'dan oldin: oshkor kalit, RLS, .env tekshiruvi")}`,
      "",
      `  ${w("Interaktiv rejimda:")} / — buyruqlar menyusi, /help, @fayl — biriktirish, ↑/↓ — tarix,`,
      `    Ctrl+C — joriy ishni bekor qilish, ikki marta — chiqish.`,
      "",
      `  ${w("Chuqur so'rash:")} muhim/noaniq vazifada agent avval 1–3 ta savol beradi (Enter — taxmin bilan davom).`,
      `    O'chirish: --no-ask yoki sov config inquiry=off. -p/--json/--yes va quvurda savol berilmaydi.`,
      "",
      `  ${w("Mahalliy model:")} limit tugasa yoki internet bo'lmasa Ollama modeliga o'tish taklif qilinadi;`,
      `    /local — holat va modellar, sov config localFallback=off|ask|auto. O'rnatish: https://ollama.com/download`,
      "",
      `  ${w("Loyiha xotirasi:")} papkadagi SOVEREIGN.md (yoki .sovereign/PROJECT.md) har suhbatga qo'shiladi;`,
      `    /project — ko'rish, /project-remember <fakt> — jamoa qoidasini qo'shish. Git'ga commit qiling.`,
      "",
      `  ${w("Xavfsizlik:")} ish papkasidan tashqaridagi yo'l va xavfli buyruqlar HAR DOIM so'raladi`,
      `    (--yes/vibe ham o'tkazib yubormaydi); -p rejimida ular avtomatik rad etiladi.`,
      `    --full-auto: hech narsa so'ralmaydi — xavfli buyruqlar ham bajariladi. Tashqi yo'l, git push,`,
      `    publish, deploy, sudo, git config va CI/hook fayllari rad etiladi, LEKIN bu faqat buyruq matni`,
      `    filtri, sandbox emas: repo fayllaridagi yashirin ko'rsatma agentni ixtiyoriy kod bajarishga`,
      `    undashi mumkin. Har papkada bir marta tasdiq so'raladi — faqat ishonchli papkada yoqing.`,
      "",
      `  ${w("Chiqish kodlari:")} 0 muvaffaqiyat · 1 xato · 2 noto'g'ri foydalanish · 3 login kerak · 130 Ctrl+C`,
      `  ${w("Muhit:")} SOVEREIGN_URL, SOVEREIGN_TOKEN, OPENROUTER_API_KEY, SOVEREIGN_MODEL, NO_COLOR, SOV_VERIFY=0`,
      `  ${w("Sozlamalar:")} ${c.dim(CONFIG_PATH)}`,
      "",
    ].join("\n"),
  );
}

// ---- loyiha xotirasi (SOVEREIGN.md) ---------------------------------
const PROJECT_ERR = {
  empty: "Bo'sh fakt — /project-remember <qoida yoki fakt>",
  duplicate: "Bu eslatma SOVEREIGN.md da allaqachon bor.",
  unsafe: "SOVEREIGN.md oddiy fayl emas (symlink yoki papka) — xavfsizlik uchun yozilmadi.",
  io: "SOVEREIGN.md ga yozib bo'lmadi (ruxsat yoki disk xatosi).",
};

/** /project va `sov init` uchun qisqa holat qatorlari. */
function projectLines(info) {
  if (!info.exists) {
    return [
      c.dim("Loyiha xotirasi yo'q:") + " " + c.white(info.path),
      c.faint("Yaratish: /project init (yoki terminalda: sov init, sov init --ai). Keyin git'ga commit qiling."),
    ];
  }
  const kb = (info.bytes / 1024).toFixed(1);
  const out = [
    c.faint("LOYIHA XOTIRASI") + "  " + c.dim(`(${kb} KB · ${info.notes} ta eslatma · jamoa bilan git orqali)`),
    ...info.files.map((f) => c.white(f)),
  ];
  if (info.sections.length) out.push(c.dim("Bo'limlar: ") + info.sections.join(" · "));
  if (info.truncated) out.push(c.warn(`⚠ Fayl ${PROJECT_MAX_BYTES / 1024} KB dan katta — agentga faqat boshi beriladi. Qisqartiring.`));
  out.push(c.faint("/project-remember <fakt> — qo'shish · faylni muharrirda tahrirlang · agent har suhbat boshida o'qiydi"));
  return out;
}

function versionLine() {
  return `sov ${VERSION} (${process.platform}-${process.arch}, ${IS_BINARY ? "binary" : "node"} v${process.versions.node})`;
}

const SKILLS_MARK = "Foydalanuvchi tomonidan yoqilgan SOVEREIGN Skills:";

/** Skillar system xabarini joyiga qo'yadi/yangilaydi (yoqilgan skil yo'q bo'lsa — olib tashlaydi). */
function syncSkillsMessage(messages, enabledSkills) {
  const idx = messages.findIndex((m) => m.role === "system" && typeof m.content === "string" && m.content.startsWith(SKILLS_MARK));
  const activeNames = SKILLS.filter((s) => enabledSkills.has(s.id)).map((s) => `- ${s.name}: ${s.desc}`);
  if (!activeNames.length) {
    if (idx !== -1) messages.splice(idx, 1);
    return;
  }
  const msg = { role: "system", content: `${SKILLS_MARK}\n${activeNames.join("\n")}\nUlarni javob berayotganda qo'llang.` };
  if (idx !== -1) {
    messages[idx] = msg;
    return;
  }
  // Boshlang'ich system blokining oxiriga (SYSTEM, kontekst, xotira'dan keyin).
  const firstNonSystem = messages.findIndex((m) => m.role !== "system");
  messages.splice(firstNonSystem === -1 ? messages.length : firstNonSystem, 0, msg);
}

// ---- subcommands ------------------------------------------------------
/** `sov config kalit=qiymat ...` — faqat tekshiriladigan sozlamalar (inquiry, localFallback, localModel). */
function handleConfigArgs(args) {
  const patch = {};
  const errors = [];
  for (const a of args) {
    const eq = a.indexOf("=");
    if (eq <= 0) {
      errors.push(`"${a}" — kalit=qiymat ko'rinishida yozing`);
      continue;
    }
    const key = a.slice(0, eq).trim();
    const r = normalizeSetting(key, a.slice(eq + 1));
    if (r.ok) patch[key] = r.value;
    else errors.push(r.error);
  }
  if (errors.length) {
    for (const e of errors) process.stderr.write(`sov: ${e}\n`);
    process.stderr.write("Foydalanish: sov config inquiry=auto|always|off localFallback=off|ask|auto localModel=<nom>\n");
    return EXIT.USAGE;
  }
  const path = saveConfig(patch);
  for (const [k, v] of Object.entries(patch)) console.log(`  ${c.green("✓")} ${k} = ${c.white(v || "(bo'sh)")}`);
  console.log(`  ${c.dim("Saqlandi:")} ${c.dim(path)}`);
  return EXIT.OK;
}

async function handleConfig(args = []) {
  if (args.length) return handleConfigArgs(args);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log(`\n  ${logo()} ${c.dim("sozlash")}\n`);
  const key = (await ask(rl, `  OpenRouter kalit (bo'sh = o'zgarmasin): `)).trim();
  const pkey = (await ask(rl, `  Perplexity kalit (ixtiyoriy): `)).trim();
  // Enter — joriy (saqlangan yoki standart) model o'zgarmaydi; aynan o'shani ko'rsatamiz.
  const model = (await ask(rl, `  Model [enter = ${loadConfig().model}]: `)).trim();
  const patch = {};
  if (key) patch.openrouterKey = key;
  if (pkey) patch.perplexityKey = pkey;
  if (model) patch.model = model;
  const path = saveConfig(patch);
  console.log(`\n  ${c.green("Saqlandi:")} ${c.dim(path)}`);
  const cfg = loadConfig();
  console.log(`  ${c.dim(`Chuqur so'rash: inquiry=${cfg.inquiry} · mahalliy zaxira: localFallback=${cfg.localFallback} · localModel=${cfg.localModel || "—"}`)}`);
  console.log(`  ${c.dim("O'zgartirish: sov config inquiry=off  (batafsil: sov help config)")}\n`);
  rl.close();
  return EXIT.OK;
}

/** Format menu rows with proper color per item. */
function renderSlashMenu() {
  const items = SLASH_COMMANDS.map((s) => ({
    glyph: s.glyph,
    cmd: s.cmd,
    desc: s.desc,
    color: c[s.color] || c.indigo,
  }));
  return slashMenu(items);
}

/**
 * /undo [n | list] — shu sessiyada fayllarni o'zgartirgan buyruqlar ro'yxati;
 * argumentsiz oxirgisini, `/undo <n>` — n-chisini (1 = eng yangi) qaytaradi.
 */
async function undoCommand(arg, say) {
  const store = cliSnapshotStore();
  const list = store.list();
  if (!list.length) {
    say(c.dim("Qaytariladigan buyruq yo'q — bu sessiyada fayllarni o'zgartirgan buyruq bajarilmagan."));
    return;
  }
  const listOnly = arg === "list" || arg === "ro'yxat";
  const n = !arg || listOnly ? 1 : Number(arg);
  if (!Number.isInteger(n) || n < 1 || n > list.length) {
    say(c.red(`Noto'g'ri raqam: ${arg} — 1 dan ${list.length} gacha bo'lishi kerak (/undo list).`));
    return;
  }
  say(c.dim("Fayllarni o'zgartirgan buyruqlar (1 — eng oxirgisi):"));
  for (const [i, s] of list.slice(0, 10).entries()) {
    const cmd = visible(s.command).replace(/\s+/g, " ");
    const short = cmd.length > 60 ? `${cmd.slice(0, 59)}…` : cmd;
    const when = new Date(s.createdAt).toTimeString().slice(0, 5);
    const mark = !listOnly && i === n - 1 ? c.amber("›") : " ";
    say(`${mark} ${c.white(String(i + 1))}. ${c.amber(short)}  ${c.dim(`— ${describeCounts(s.counts)}  ${when}`)}${s.partial ? c.dim(" (qisman nusxa)") : ""}`);
  }
  if (list.length > 10) say(c.dim(`  … yana ${list.length - 10} ta`));
  if (listOnly) {
    say(c.dim("Qaytarish: /undo (oxirgisi) yoki /undo <n>"));
    return;
  }
  const target = list[n - 1];
  const res = await store.restore(target.id);
  if (res.error === "no-backup" || res.error === "not-found") {
    say(c.red(res.error === "not-found" ? "Ish papkasi topilmadi — qaytarib bo'lmaydi." : "Nusxa topilmadi — qaytarib bo'lmaydi."));
    return;
  }
  const parts = [];
  if (res.restored) parts.push(`${res.restored} ta fayl tiklandi`);
  if (res.removed) parts.push(`${res.removed} ta yangi fayl o'chirildi`);
  say(`${res.ok ? c.emerald("↩") : c.amber("↩")} ${res.ok ? "Qaytarildi" : "Qisman qaytarildi"}: ${parts.join(", ") || "o'zgarish yo'q"}.`);
  if (res.kept.length) say(c.dim(`  ${res.kept.length} ta yangi fayl keyin o'zgargani uchun qoldirildi: ${res.kept.slice(0, 5).join(", ")}${res.kept.length > 5 ? " …" : ""}`));
  if (res.lost) say(c.dim(`  ${res.lost} ta faylni tiklab bo'lmaydi (juda katta yoki nusxa chegarasidan tashqarida edi).`));
  if (res.failed.length) {
    say(c.red(`  ${res.failed.length} ta faylni tiklab bo'lmadi:`));
    for (const f of res.failed.slice(0, 8)) say(c.dim(`    ${f.path} (${f.reason})`));
    say(c.dim("  Sababini bartaraf etib, /undo ni qayta ishga tushirish mumkin."));
  }
}

// ---- interactive REPL -------------------------------------------------
async function repl() {
  // Tab autocomplete for slash commands. Boshi `/` bo'lsa mos keladiganlarni
  // qaytaradi; bo'sh bo'lsa hamma buyruqni.
  const completer = (line) => {
    // "@" bilan boshlangan oxirgi bo'lak — fayl yo'li to'ldiriladi.
    const token = line.split(/\s+/).pop() ?? "";
    if (token.startsWith("@")) return [completeMention(token), token];
    if (!line.startsWith("/")) return [[], line];
    const names = [...SLASH_NAMES, "/local"];
    const hits = names.filter((n) => n.startsWith(line));
    return [hits.length ? hits.map((h) => h + " ") : names.map((h) => h + " "), line];
  };
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    completer,
    // Buyruqlar tarixi sessiyalar orasida saqlanadi (↑/↓).
    history: loadHistory(),
    historySize: HISTORY_SIZE,
    removeHistoryDuplicates: true,
    // Standart "> " o'rniga o'zimizniki (repl boshlanganda yangilanadi).
    prompt: `${gutter()}${c.accent("❯")} `,
  });
  rl.on("history", (h) => saveHistory(h));

  // ── Ctrl+C: 1-marta — joriy navbatni bekor qiladi; bo'sh promptda 2 marta — chiqish.
  let lastSigint = 0;
  let exiting = false;
  rl.on("SIGINT", () => {
    const now = Date.now();
    if (turnState.ac) {
      if (!turnState.ac.signal.aborted) {
        stopSpinner();
        turnState.ac.abort();
        process.stdout.write("\n" + gutter() + c.amber("⊘ bekor qilinmoqda…") + c.dim("  (chiqish uchun yana Ctrl+C)") + "\n");
        lastSigint = now;
        return;
      }
      // Bekor qilish kutilayotganda yana Ctrl+C — darhol chiqish.
      process.stdout.write("\n");
      process.exit(EXIT.INTERRUPTED);
    }
    if (rl.line) {
      // Yozilayotgan qatorni tozalash (bash/zsh kabi).
      rl.write(null, { ctrl: true, name: "e" });
      rl.write(null, { ctrl: true, name: "u" });
      lastSigint = 0;
      return;
    }
    if (now - lastSigint < 2000) {
      exiting = true;
      rl.close();
      return;
    }
    lastSigint = now;
    process.stdout.write("\n" + gutter() + c.dim("(chiqish uchun yana Ctrl+C bosing yoki /exit yozing)") + "\n");
    rl.prompt();
  });

  let config = withModelOverride(await ensureAuth(rl));
  // --ollama / -m local:<nom> — mahalliy model bilan boshlash (topilmasa — ko'rsatma va chiqish).
  const localStart = await applyLocalStartup(config, { interactive: true, rl, log: (l) => console.log("  " + l) });
  if (!localStart.ok) {
    printLocalError(localStart, (l) => console.log("  " + l));
    rl.close();
    return EXIT.ERROR;
  }
  // Umumiy xotira (web bilan bir xil) — birinchi xabardan oldin keshni yangilaymiz.
  if (config.token) await syncMemory(config).catch(() => {});
  let messages = initialMessages(config);
  // Chuqur so'rash: shu suhbatda allaqachon so'ralgan slotlar (/clear bilan yangilanadi).
  let inquiryState = createInquiryState();
  let sessionId = null; // birinchi javobdan keyin yaratiladi
  const pending = []; // paths queued via /attach for the next user message
  let pendingAudit = null; // /audit hisoboti — keyingi xabarga agent konteksti sifatida qo'shiladi
  const enabledSkills = new Set(config.enabledSkills || ["ui-ux-pro-max", "clean-code"]);

  // Server bilan sinxronlash — akkaunt rejimida
  if (config.token) {
    const me = await fetchMe(config);
    if (me) {
      // Server tomondan kelgan sozlamalar — ustunroq
      if (Array.isArray(me.enabled_skills)) {
        enabledSkills.clear();
        for (const s of me.enabled_skills) enabledSkills.add(s);
      }
      if (me.default_model && !flags.model) config.model = me.default_model;
      if (me.email) config.email = me.email;
      config.planState = me.plan_state;
      config.plan = me.plan;
      config.daysLeft = me.days_left;
      saveConfig({
        email: config.email || "",
        enabledSkills: [...enabledSkills],
        ...(flags.model ? {} : { model: config.model }),
        planState: me.plan_state,
        plan: me.plan,
      });
    }
  }

  clearScreen();
  console.log(banner(config, [...enabledSkills], vibe.on, fullAuto.on));
  console.log(hintBar(config, pending.length, vibe.on, fullAuto.on));

  // Plan expired/expiring notice
  if (config.planState === "expired") {
    console.log();
    console.log(gutter() + c.red("● Tarifingiz muddati tugagan.") + " " + c.dim("Yangilash: ") + c.violet("/upgrade"));
  } else if (config.planState === "expiring_soon" && config.daysLeft != null) {
    console.log();
    console.log(gutter() + c.amber(`● Tarif ${config.daysLeft} kundan keyin tugaydi.`) + " " + c.dim("Yangilash: ") + c.violet("/upgrade"));
  }
  console.log();
  const confirm = await confirmer(rl);

  // Fon rejimidagi sinxronlash — web tarafida qilingan o'zgarishlar CLI ga keladi.
  // Getter: /logout'dan keyin to'xtaydi, /login'dan keyin YANGI akkaunt tokeni bilan ishlaydi.
  const stopSync = startBackgroundSync(() => config, (changed) => {
    if (changed.enabledSkills) {
      enabledSkills.clear();
      for (const s of changed.enabledSkills) enabledSkills.add(s);
      say(c.dim("↻ Skillar web bilan sinxronlandi"));
    }
    if (changed.model && !flags.model) {
      config.model = changed.model;
      say(c.dim(`↻ Model o'zgardi: ${changed.model}`));
    }
    if (changed.planState === "expired") {
      say(c.red("● Tarifingiz muddati tugadi.") + " " + c.dim("Yangilash uchun: /upgrade"));
    } else if (changed.planState === "expiring_soon" && changed.daysLeft != null) {
      say(c.amber(`● Tarif ${changed.daysLeft} kundan keyin tugaydi.`));
    }
  });

  // Apple-style prompt: minimal single chevron, restrained color.
  // MUHIM: promptni readline'ning o'ziga beramiz. Aks holda u har qayta
  // chizishda (Enter, Tab, terminal o'lchami) o'zining standart "> " ini
  // chap chetga yozib, gutter va ❯ belgisini yo'qotadi.
  const G = gutter();
  const promptStr = () =>
    G +
    (pending.length ? `${c.warn("📎 " + pending.length)}  ` : "") +
    (fullAuto.on ? `${c.warn("⚡")} ` : "") +
    (config.local ? `${c.teal("◇")} ` : "") +
    `${c.accent("❯")} `;

  const rewritePrompt = () => {
    rl.setPrompt(promptStr());
    rl.prompt();
  };
  const say = (line) => console.log(G + line);

  // Limit / offline → "mahalliy model bilan davom etasizmi?" (config.localFallback: off | ask | auto).
  const onLimit = limitHook(() => config, { interactive: true, rl, log: say });

  /** Agent navbati — Ctrl+C bilan bekor qilinadi. */
  const runTurn = async () => {
    const ac = new AbortController();
    turnState.ac = ac;
    config.onLimit = onLimit; // /login, /logout dan keyin config qayta yaratiladi — har navbatda ulaymiz
    const wasLocal = Boolean(config.local);
    try {
      const res = await agentTurn({
        messages,
        config,
        confirm,
        signal: ac.signal,
        stream: !config.token, // to'g'ridan-to'g'ri OpenRouter — tokenlar oqim bilan
        verify: flags.verify,
        fullAuto: fullAuto.on,
        budget: flags.budget ?? 0,
        snapshots: true, // shell Undo — /undo
      });
      if (res.error) console.log(G + c.red(`Xato: ${res.error}\n`));
      if (!wasLocal && config.local) say(c.dim("◇ Keyingi xabarlar ham mahalliy modelda. Serverga qaytish: /local off"));
      return res;
    } finally {
      turnState.ac = null;
    }
  };

  // ── Mahalliy model (Ollama) ──
  const localLabel = () => (config.local && typeof config.local === "object" ? config.local.model : typeof config.local === "string" ? config.local : config.localModel);
  const enableLocal = async (name) => {
    config.local = name; // imkoniyatlar (tools/kontekst) keyingi navbatda /api/show dan aniqlanadi
    if (config.localModel !== name) {
      saveConfig({ localModel: name });
      config.localModel = name;
    }
    say(`${c.teal("◇")} ${c.green("Mahalliy model:")} ${c.white(name)} ${c.dim("— serverga hech narsa yuborilmaydi. Qaytish: /local off")}`);
    say(c.dim("  Mahalliy rejimda xotira sinxroni, bilim bazasi va AI hakam ishlamaydi; sifat bulut modellaridan past bo'lishi mumkin."));
    if (fullAuto.on && !(await confirmFullAutoLocal({ interactive: true, ask: (q) => ask(rl, q), log: say, c }))) fullAuto.on = false;
  };
  const disableLocalFor = (what) => {
    if (!config.local) return;
    config.local = null;
    say(c.dim(`◇ Mahalliy model o'chirildi — ${what}.`));
  };
  const localCommand = async (arg) => {
    const [sub, ...rest] = arg.split(/\s+/).filter(Boolean);
    if (sub === "off" || sub === "o'chir") {
      if (config.local) disableLocalFor("javoblar yana SOVEREIGN serveridan");
      else say(c.dim("Mahalliy model yoqilmagan."));
      if (!config.token && !config.openrouterKey) say(c.amber("Serverga ulanmagansiz — /login bilan kiring."));
      return;
    }
    if (sub === "fallback" || sub === "zaxira") {
      const r = normalizeSetting("localFallback", rest[0] ?? "");
      if (!r.ok) {
        say(c.red(r.error) + c.dim("  — off: o'chiq · ask: so'rash · auto: darhol o'tish"));
        return;
      }
      saveConfig({ localFallback: r.value });
      config.localFallback = r.value;
      say(`${c.green("✓")} ${c.dim("Limit/offline'da mahalliy zaxira:")} ${c.white(r.value)}`);
      return;
    }
    if (sub) {
      const want = sub === "on" || sub === "yoq" ? (rest[0] ?? "") : sub;
      const spin = spinner("Ollama tekshirilyapti...");
      const r = await resolveLocalModel(want, config, { c });
      spin.stop();
      if (!r.ok) {
        say(c.red(r.error));
        for (const h of r.hint ?? []) say("  " + h);
        return;
      }
      await enableLocal(r.model.name);
      return;
    }
    // Holat + o'rnatilgan modellar.
    say(
      `${c.dim("Mahalliy model:")} ${config.local ? c.teal("yoqiq · " + localLabel()) : c.white("o'chiq")}  ` +
        c.dim(`· zaxira (localFallback): ${config.localFallback} · localModel: ${config.localModel || "—"}`),
    );
    const spin = spinner("Ollama tekshirilyapti...");
    const local = await localModels();
    spin.stop();
    printLocalModels(local, localLabel() || "");
    say(c.dim("/local on [model] — yoqish · /local off — serverga qaytish · /local fallback off|ask|auto — limit tugasa nima qilish"));
  };
  const pickLocal = async () => {
    const spin = spinner("Ollama tekshirilyapti...");
    const local = await localModels();
    spin.stop();
    if (!local.available || !local.models.length) {
      for (const l of installHint(local, c)) say(l);
      return;
    }
    const current = localLabel();
    const items = local.models.map((m) => ({
      label: m.name === current && config.local ? `${m.name}  ●` : m.name,
      hint: [m.tools ? "🔧" : "", m.vision ? "👁" : "", m.paramSize, m.quant].filter(Boolean).join("  "),
      search: m.family ?? "",
      name: m.name,
    }));
    const chosen = await selectMenu({ title: "Mahalliy (Ollama) — server tokeni sarflanmaydi", items });
    if (chosen) await enableLocal(chosen.name);
  };

  // ── Model tanlash — strelka bilan (yozmasdan) ──
  const setAutoModel = () => {
    disableLocalFor("server modeli tanlandi");
    saveConfig({ omniModel: "", model: "" });
    config = { ...config, omniModel: "", model: loadConfig().model };
    say(`${c.green("Model:")} ${c.indigo("SOVEREIGN Auto")} ${c.dim("(tarifingizga qarab server o'zi tanlaydi)")}`);
  };
  const setOmniModel = (id) => {
    disableLocalFor("server modeli tanlandi");
    config = { ...config, omniModel: id, model: id };
    saveConfig({ omniModel: id, model: id });
    say(`${c.green("Model:")} ${c.indigo(id)} ${c.dim("(OmniRoute)")}`);
  };
  const caps = (m) =>
    [m.tools ? "🔧" : "", m.vision ? "👁" : "", m.reasoning ? "🧠" : "", m.context ? `${Math.round(m.context / 1000)}k` : ""]
      .filter(Boolean)
      .join(" ");
  const pickModel = async () => {
    const spin = spinner("oilalar yuklanyapti...");
    const fams = await fetchFamilies(config);
    spin.stop();
    const current = config.omniModel || "";
    for (;;) {
      const top = [
        { label: "★ SOVEREIGN Auto", hint: "tarifga qarab eng mos modelni server tanlaydi", pick: { kind: "auto" } },
        { label: "◇ Mahalliy (Ollama)", hint: "kompyuteringizdagi modellar — server tokeni sarflanmaydi", search: "local ollama", pick: { kind: "local" } },
      ];
      if (fams.configured) {
        if (fams.featured?.length) {
          top.push({ label: "✦ Tekin — tavsiya", hint: `${fams.featured.length} ta · tool-calling`, pick: { kind: "featured" } });
        }
        for (const f of fams.families ?? []) {
          top.push({
            label: f.label,
            hint: `${f.count} model${f.auto ? " · auto: " + f.auto : ""}`,
            search: f.key,
            pick: { kind: "family", key: f.key, label: f.label },
          });
        }
      } else {
        // Katalog ulanmagan — mahalliy ro'yxat.
        for (const m of CLI_MODELS) top.push({ label: m.label, hint: m.note, search: m.id, pick: { kind: "static", id: m.id } });
      }
      const fam = await selectMenu({ title: "Model oilasi", items: top });
      if (!fam) return;
      const v = fam.pick;
      if (v.kind === "auto") return setAutoModel();
      if (v.kind === "local") return pickLocal();
      if (v.kind === "static") {
        disableLocalFor("server modeli tanlandi");
        config = { ...config, model: v.id, omniModel: "" };
        saveConfig({ model: v.id, omniModel: "" });
        return say(`${c.green("Model:")} ${c.indigo(v.id)}`);
      }
      let models;
      if (v.kind === "featured") {
        models = fams.featured.map((m) => ({ ...m, hintText: m.note }));
      } else {
        const sp = spinner(`${v.label} modellari yuklanyapti...`);
        const data = await fetchCatalog(config, "", 500, v.key);
        sp.stop();
        models = data.models ?? [];
      }
      const items = [
        { label: "← Orqaga", hint: "oilalar ro'yxatiga", back: true },
        ...models.map((m) => ({
          label: m.id === current ? `${m.id}  ●` : m.id,
          hint: [m.hintText ?? m.label ?? "", caps(m)].filter(Boolean).join("  "),
          search: `${m.label ?? ""} ${m.owner ?? ""}`,
          id: m.id,
        })),
      ];
      const at = items.findIndex((it) => it.id === current);
      const chosen = await selectMenu({ title: v.label ?? "Tekin — tavsiya", items, initial: at > 0 ? at : 1 });
      if (!chosen || chosen.back) continue; // oilalarga qaytish
      return setOmniModel(chosen.id);
    }
  };

  rewritePrompt();

  for await (const raw of rl) {
    let input = raw.trim();
    if (!input) {
      rewritePrompt();
      continue;
    }

    // ── SLASH MENU ── faqat "/" yozilsa hamma buyruqni jadval bo'lib chiqar.
    if (input === "/") {
      console.log(renderSlashMenu());
      rewritePrompt();
      continue;
    }

    // ── Exit ──
    if (input === "/exit" || input === "/quit") break;

    // ── Suhbatni tozalash ──
    if (input === "/clear") {
      messages = initialMessages(config);
      sessionId = null; // yangi suhbat — yangi sessiya fayli
      pendingAudit = null;
      inquiryState = createInquiryState(); // yangi vazifa — birinchi xabarda yana aniqlashtirish mumkin
      say(c.dim("Suhbat tozalandi."));
      rewritePrompt();
      continue;
    }

    // ── Versiya / diagnostika ──
    if (input === "/version") {
      say(c.dim(versionLine()));
      rewritePrompt();
      continue;
    }
    if (input === "/doctor") {
      const spin = spinner("tekshirilyapti...");
      const results = await runDoctor();
      spin.stop();
      printDoctor(results);
      rewritePrompt();
      continue;
    }

    // ── Xavfsizlik tekshiruvi (deploy'dan oldin) ──
    if (input === "/audit") {
      const spin = spinner("xavfsizlik tekshirilyapti...");
      const res = await runAudit(process.cwd());
      spin.stop();
      console.log(formatAudit(res, c).replace(/^ {2}/gm, G));
      if (res.findings.length) {
        pendingAudit = auditPrompt(res, "uz");
        say(`${c.accent("◆")} Tuzatish uchun: ${c.white("'audit natijasidagi muammolarni tuzat'")} deb yozing ${c.dim("(yoki qisqa: tuzat)")}`);
        say(c.dim("  Hisobot keyingi xabaringizga agent konteksti sifatida qo'shiladi."));
      } else {
        pendingAudit = null;
      }
      console.log("");
      rewritePrompt();
      continue;
    }

    // ── Sessiyalar ro'yxati ──
    if (input === "/sessions") {
      const list = listSessions();
      if (!list.length) {
        say(c.dim("Saqlangan sessiya yo'q."));
      } else {
        for (const s of list.slice(0, 15)) {
          const when = String(s.updatedAt).slice(0, 16).replace("T", " ");
          const here = s.id === sessionId ? c.emerald(" ●") : "  ";
          say(`${here} ${c.white(s.id)}  ${c.dim(when)}  ${c.dim(`${s.turns} savol`)}  ${s.title}`);
        }
        say(c.dim("Davom ettirish: /resume <id>"));
      }
      rewritePrompt();
      continue;
    }

    // ── Sessiyani davom ettirish ──
    if (input.startsWith("/resume")) {
      const id = input.slice(7).trim();
      const data = id ? loadSession(id) : null;
      if (!id) {
        say(c.dim("Foydalanish: /resume <id>  (/sessions bilan ro'yxatni ko'ring)"));
      } else if (!data) {
        say(c.red(`Sessiya topilmadi: ${id}`));
      } else {
        messages = data.messages;
        sessionId = data.id;
        say(`${c.emerald("●")} ${c.dim("Davom etyapmiz:")} ${data.title} ${c.dim(`(${countTurns(messages)} savol)`)}`);
      }
      rewritePrompt();
      continue;
    }

    // ── Orqaga qaytish (oxirgi savol(lar)ni olib tashlash) ──
    if (input.startsWith("/rewind")) {
      const n = Math.max(1, Number(input.slice(7).trim()) || 1);
      const before = countTurns(messages);
      messages = rewind(messages, n);
      const after = countTurns(messages);
      say(c.dim(`↶ ${before - after} ta savol olib tashlandi (${after} qoldi).`));
      if (sessionId) sessionId = saveSession({ id: sessionId, messages, model: config.model });
      rewritePrompt();
      continue;
    }

    // ── Shell Undo: buyruq o'zgartirgan/o'chirgan fayllarni qaytarish ──
    if (input === "/undo" || input.startsWith("/undo ")) {
      await undoCommand(input.slice(5).trim(), say);
      rewritePrompt();
      continue;
    }

    // ── Shoxlash: joriy holatdan yangi sessiya ──
    if (input === "/fork") {
      sessionId = saveSession({ messages, model: config.model });
      say(`${c.emerald("⑂")} ${c.dim("Yangi sessiya:")} ${c.white(sessionId)} ${c.dim("— eski suhbat o'zgarishsiz qoldi.")}`);
      rewritePrompt();
      continue;
    }

    // ── Parallel rejim: bir vazifa, bir nechta ishchi ──
    if (input.startsWith("/swarm")) {
      const rest = input.slice(6).trim();
      const m = /^(\d+)\s+([\s\S]+)$/.exec(rest);
      const count = m ? Number(m[1]) : 3;
      const task = m ? m[2] : rest;
      if (!task) {
        say(c.dim("Foydalanish: /swarm 4 <vazifa>  — 2-8 ishchi reja tuzadi, keyin agent uni bajaradi (fayl yozadi)"));
        rewritePrompt();
        continue;
      }
      const spin = spinner(`${Math.min(8, Math.max(2, count))} ta ishchi ishlayapti...`);
      const res = await swarm({
        task,
        count,
        config,
        onProgress: (i, ok, err) => {
          spin.stop();
          say(ok ? `  ${c.emerald("●")} ishchi #${i + 1} ${c.dim("tayyor")}` : `  ${c.red("✕")} ishchi #${i + 1} ${c.dim(err ?? "")}`);
        },
      });
      spin.stop();
      if (res.error) {
        say(c.red(`Xato: ${res.error}`));
      } else {
        say("");
        say(c.accent("◆ REJA") + c.dim("  (ko'p agent birlashmasi)"));
        console.log(res.merged.replace(/^/gm, G + "  "));
        say("");
        // Bosqich 5 — Cowork oqimiga ulanish: rejani AGENT bajaradi (fayl yozadi,
        // buyruq ishga tushiradi). Vibe rejimda avtomatik, aks holda tasdiq bilan.
        say(c.dim("Rejani bajaraman — fayllarni yozaman va sinab ko'raman…"));
        messages.push({
          role: "user",
          content:
            `Quyidagi REJA bo'yicha loyihani AMALGA OSHIR — kerakli fayllarni yoz (write_file), ` +
            `papkalarni yarat (make_dir), zarur bo'lsa buyruq ishga tushir (run_command) va natijani sina. ` +
            `Har qadamni qisqa tushuntirib bor.\n\nASL VAZIFA: ${task}\n\nREJA:\n${res.merged}`,
        });
        await runTurn();
        sessionId = saveSession({ id: sessionId, messages, model: config.model });
      }
      rewritePrompt();
      continue;
    }

    // ── Full auto ──
    if (input === "/auto" || input === "/full-auto") {
      fullAuto.on = !fullAuto.on;
      // Full auto + mahalliy model — alohida tasdiq (§B.1).
      if (fullAuto.on && config.local && !(await confirmFullAutoLocal({ interactive: true, ask: (q) => ask(rl, q), log: say, c }))) {
        fullAuto.on = false;
        rewritePrompt();
        continue;
      }
      // Papka bo'yicha bir martalik ogohlantirishli tasdiq (flag bilan yoqilganda ham shu).
      if (fullAuto.on && !(await confirmFullAutoTrust({ interactive: true, ask: (q) => ask(rl, q), log: say, c }))) {
        fullAuto.on = false;
        rewritePrompt();
        continue;
      }
      say(
        fullAuto.on
          ? `${c.emerald("⚡ FULL AUTO")} ${c.dim("yoqildi — hech narsa so'ralmaydi: fayl yozish, paket o'rnatish, test va build darhol bajariladi.")}
` +
              G + c.amber("  ⚠ Faqat ishonchli papkada ishlating. ") + c.dim("Push/publish/deploy/sudo rad etish ro'yxati faqat matn filtri — sandbox emas. /auto — o'chirish.")
          : `${c.amber("○ FULL AUTO")} ${c.dim("o'chirildi — amallar yana tasdiqlanadi.")}`,
      );
      rewritePrompt();
      continue;
    }

    // ── Vibe rejim ──
    if (input === "/vibe") {
      vibe.on = !vibe.on;
      say(
        vibe.on
          ? `${c.emerald("◆ VIBE")} ${c.dim("yoqildi — kodni AI yozadi, ish papkasidagi fayllar uchun tasdiq so'ralmaydi (xavfli buyruqlar baribir so'raladi).")}`
          : `${c.amber("○ VIBE")} ${c.dim("o'chirildi — har bir o'zgarish tasdiqlanadi.")}`,
      );
      rewritePrompt();
      continue;
    }

    // ── Xotira ──
    if (input === "/memory") {
      const list = loadMemory(config);
      console.log("");
      if (!list.length) {
        console.log("  " + c.dim("Xotira bo'sh.") + " " + c.faint("/remember <fakt> bilan qo'shing."));
      } else {
        console.log("  " + c.faint("XOTIRA") + "  " + c.dim("(" + list.length + " ta · individual)"));
        list.forEach((m, i) => console.log("  " + c.accent(String(i + 1).padStart(2)) + "  " + c.text(m.text)));
        console.log("  " + c.faint("/forget <n> · /forget hammasini · /remember qo'shish"));
      }
      console.log("");
      rl.prompt();
      continue;
    }
    if (input.startsWith("/remember")) {
      const text = input.slice("/remember".length).trim();
      console.log("");
      if (!text) console.log("  " + c.warn("Foydalanish:") + " /remember <eslab qolinadigan fakt>");
      else console.log(addMemory(config, text) ? "  " + c.ok("✓") + " " + c.dim("eslab qoldim.") : "  " + c.dim("Allaqachon bor yoki bo'sh."));
      console.log("");
      rl.prompt();
      continue;
    }
    if (input.startsWith("/forget")) {
      const arg = input.slice("/forget".length).trim();
      console.log("");
      if (!arg) { clearMemory(config); console.log("  " + c.ok("✓") + " " + c.dim("xotira tozalandi.")); }
      else { const n = parseInt(arg, 10); console.log(removeMemory(config, n) ? "  " + c.ok("✓") + " " + c.dim(n + "-fakt o'chirildi.") : "  " + c.warn("Bunday raqam yo'q.")); }
      console.log("");
      rl.prompt();
      continue;
    }

    // ── Loyiha xotirasi (SOVEREIGN.md, jamoa bilan git orqali) ──
    if (input === "/project-remember" || input.startsWith("/project-remember ")) {
      const r = addProjectNote(input.slice("/project-remember".length));
      console.log("");
      if (r.ok) {
        refreshProjectMessage(messages); // suhbat saqlanadi — agent yangi qoidani darhol ko'radi
        console.log("  " + c.ok("✓") + " " + c.dim(r.created ? "SOVEREIGN.md yaratildi va eslatma qo'shildi:" : "SOVEREIGN.md ga qo'shildi:") + " " + c.white(r.path));
        if (r.overLimit) console.log("  " + c.warn(`⚠ Fayl ${PROJECT_MAX_BYTES / 1024} KB dan oshdi — qisqartiring.`));
        console.log("  " + c.faint("Jamoa ko'rishi uchun faylni git'ga commit qiling."));
      } else {
        console.log("  " + c.warn(PROJECT_ERR[r.error] ?? PROJECT_ERR.io));
      }
      console.log("");
      rl.prompt();
      continue;
    }
    if (input === "/project" || input.startsWith("/project ")) {
      const arg = input.slice("/project".length).trim();
      console.log("");
      if (arg === "init") {
        const r = createProjectFile();
        if (r.ok) {
          refreshProjectMessage(messages);
          console.log("  " + c.ok("✓") + " " + c.dim(r.created ? "Shablon yaratildi:" : "Allaqachon bor:") + " " + c.white(r.path));
          if (r.created) console.log("  " + c.faint("To'ldiring (yoki agentga: \"loyihani o'rganib SOVEREIGN.md ni to'ldir\") va git'ga commit qiling."));
        } else {
          console.log("  " + c.warn(PROJECT_ERR[r.error] ?? PROJECT_ERR.io));
        }
      } else if (arg) {
        console.log("  " + c.warn("Foydalanish:") + " /project · /project init · /project-remember <fakt>");
      } else {
        for (const l of projectLines(projectInfo())) console.log("  " + l);
      }
      console.log("");
      rl.prompt();
      continue;
    }

    // ── Yordam ──
    if (input === "/help" || input === "/?") {
      console.log(renderSlashMenu());
      say(c.dim("@fayl — biriktirish · Tab — to'ldirish · ↑/↓ — tarix · Ctrl+C — bekor qilish (2× — chiqish)"));
      say(c.dim("/local — mahalliy model (Ollama): /local on [model] · /local off · /local fallback off|ask|auto"));
      say(c.dim(`Chuqur so'rash: ${config.inquiry} — o'zgartirish: sov config inquiry=auto|always|off (yoki --no-ask)`));
      say(c.dim("Terminal buyruqlari: sov --help · sov doctor · sov -p \"savol\""));
      console.log("");
      rewritePrompt();
      continue;
    }

    // ── SOVEREIGN Skills ──
    if (input === "/skills") {
      console.log(skillsList(SKILLS, [...enabledSkills]));
      rewritePrompt();
      continue;
    }
    if (input.startsWith("/skill ") || input === "/skill") {
      const id = input.slice(6).trim();
      if (!id) {
        say(c.dim("Foydalanish: /skill <id> (masalan /skill cybersecurity)"));
      } else if (!SKILL_IDS.includes(id)) {
        say(c.red(`Noma'lum skil: ${id}`) + c.dim("  /skills bilan ro'yxatni ko'ring."));
      } else {
        if (enabledSkills.has(id)) {
          enabledSkills.delete(id);
          say(c.amber(`○ ${id}`) + c.dim("  o'chirildi"));
        } else {
          enabledSkills.add(id);
          say(c.emerald(`● ${id}`) + c.dim("  yoqildi"));
        }
        const arr = [...enabledSkills];
        saveConfig({ enabledSkills: arr });
        // Server bilan sinxron — akkaunt rejimida webga darhol ko'chadi
        if (config.token) {
          pushSettings(config, { enabled_skills: arr }).then((ok) => {
            if (ok) say(c.dim("  ↻ web bilan sinxronlandi"));
          });
        }
      }
      rewritePrompt();
      continue;
    }

    // ── Modellar (Cursor uslubi: oila → ichida modellar) ──
    // /models          — oilalar ro'yxati (Claude, Gemini, GPT...)
    // /models claude   — o'sha oiladagi modellar
    // /models <so'z>   — hamma bo'yicha qidiruv
    if (input === "/models" || input.startsWith("/models ")) {
      const arg = input.slice(7).trim();
      const cur = config.omniModel || config.model;
      if (!arg) {
        await pickModel();
      } else {
        const spin = spinner("qidirilyapti...");
        const fams = await fetchFamilies(config);
        const famKey = matchFamily(fams.families ?? [], arg);
        const data = famKey ? await fetchCatalog(config, "", 50, famKey) : await fetchCatalog(config, arg, 40);
        spin.stop();
        printCatalog(data, famKey ? "" : arg, cur);
      }
      rewritePrompt();
      continue;
    }
    // ── Mahalliy model (Ollama, faqat 127.0.0.1) ──
    if (input === "/local" || input.startsWith("/local ")) {
      await localCommand(input.slice(6).trim());
      rewritePrompt();
      continue;
    }

    if (input === "/model" || input.startsWith("/model ")) {
      const arg = input.slice(6).trim();
      if (arg && parseLocalModelId(arg)) {
        // /model local:<nom> — mahalliy model.
        await localCommand(`on ${parseLocalModelId(arg)}`);
      } else if (arg && /^(?:local|ollama):/i.test(arg)) {
        say(c.red(`Noto'g'ri mahalliy model nomi: ${visible(arg)}`) + c.dim(`  Misol: /model ${LOCAL_PREFIX}qwen2.5-coder:7b`));
      } else if (arg && /^(auto|avto|sovereign)$/i.test(arg)) {
        // SOVEREIGN Auto — server tarif va mavjud provayderlarga qarab o'zi tanlaydi.
        setAutoModel();
      } else if (arg) {
        disableLocalFor("server modeli tanlandi");
        if (isOmniId(arg)) {
          // OmniRoute katalog modeli — har so'rovda serverga yuboriladi (OmniRoute orqali).
          config = { ...config, omniModel: arg, model: arg };
          saveConfig({ omniModel: arg, model: arg });
          say(`${c.green("Model:")} ${c.indigo(arg)} ${c.dim("(OmniRoute)")}`);
        } else {
          const m = resolveModelId(arg);
          config = { ...config, model: m, omniModel: "" };
          saveConfig({ model: m, omniModel: "" });
          say(`${c.green("Model:")} ${c.indigo(m)}${config.token ? c.dim("  (server tarifga qarab tanlaydi)") : ""}`);
          if (config.token) pushSettings(config, { default_model: m });
        }
      } else if (process.stdin.isTTY) {
        await pickModel();
      } else {
        printModels(config.omniModel || (config.token ? "" : config.model), await fetchLocalModels(), config.local ? localLabel() : "");
      }
      rewritePrompt();
      continue;
    }

    // ── Ish papkasi ──
    if (input === "/cwd" || input.startsWith("/cwd ")) {
      const p = input.slice(4).trim();
      if (p) {
        try {
          process.chdir(p);
          messages = initialMessages(config);
          inquiryState = createInquiryState();
          say(`${c.green("Ish papkasi:")} ${c.white(process.cwd())} ${c.dim("(kontekst yangilandi)")}`);
          // Full auto faqat yoqilgan papkada — yangi papka ishonchsiz bo'lishi mumkin.
          if (fullAuto.on) {
            fullAuto.on = false;
            say(`${c.amber("○ FULL AUTO")} ${c.dim("papka almashgani uchun o'chirildi — ishonsangiz /auto bilan qayta yoqing.")}`);
          }
        } catch (err) {
          say(c.red(`Xato: ${err.message}`));
        }
      } else {
        say(c.dim(process.cwd()));
      }
      rewritePrompt();
      continue;
    }

    // ── Fayl biriktirish ──
    if (input === "/attach" || input.startsWith("/attach ")) {
      const p = input.slice(7).trim().replace(/^["']|["']$/g, "");
      if (!p) {
        say(c.dim("Foydalanish: /attach <fayl-yo'li>"));
      } else {
        try {
          const att = await readAttachment(p);
          pending.push({ path: p, part: att.part, label: att.label });
          say(`${att.label} ${c.dim("navbatda — keyingi xabarga qo'shiladi")}`);
        } catch (err) {
          say(c.red(`Xato: ${err.message}`));
        }
      }
      rewritePrompt();
      continue;
    }
    if (input === "/detach") {
      pending.length = 0;
      say(c.dim("Biriktirilgan fayllar tozalandi."));
      rewritePrompt();
      continue;
    }

    // ── Akkaunt: login / logout / register / upgrade / whoami ──
    if (input === "/whoami") {
      if (config.token) say(`${c.green("Ulangan:")} SOVEREIGN akkaunt ${c.dim("(" + config.baseUrl + ")")}`);
      else if (config.openrouterKey) say(`${c.green("Ulangan:")} O'z OpenRouter kaliti ${c.dim("(" + config.model + ")")}`);
      else say(c.amber("Ulanmagan."));
      rewritePrompt();
      continue;
    }
    if (input === "/login") {
      say(c.dim("Brauzerda tasdiqlash oynasi ochiladi..."));
      const ok = await login(config.baseUrl);
      if (ok) {
        config = withModelOverride(loadConfig());
        say(c.emerald("Muvaffaqiyatli kirdingiz."));
      } else {
        say(c.red("Kirish bekor qilindi."));
      }
      rewritePrompt();
      continue;
    }
    if (input === "/logout") {
      const revoked = await revokeStoredToken(); // token serverda ham bekor qilinadi (~3s)
      const base = clearAuth();
      config = loadConfig();
      say(`${c.amber("Chiqdingiz.")} ${base ? c.dim(base) : ""}`);
      if (revoked === false) say(c.amber(REVOKE_FAILED_MSG));
      rewritePrompt();
      continue;
    }
    if (input === "/register") {
      const url = `${config.baseUrl.replace(/\/$/, "")}/register`;
      openBrowser(url);
      say(`${c.emerald("→")} Ro'yxatdan o'tish sahifasi ochildi: ${c.dim(url)}`);
      rewritePrompt();
      continue;
    }
    if (input === "/upgrade") {
      const url = `${config.baseUrl.replace(/\/$/, "")}/app?upgrade=1`;
      openBrowser(url);
      say(`${c.pink("💎")} Tariflar sahifasi ochildi: ${c.dim(url)}`);
      rewritePrompt();
      continue;
    }

    // ── Skil nomini to'g'ridan-to'g'ri yoqish: /ui-ux-pro-max [matn] ──
    // Agar orqasidan matn kelsa — skilni yoqib, o'sha matnni xabar sifatida davom ettiramiz.
    if (input.startsWith("/")) {
      const sp = input.indexOf(" ");
      const cmdName = (sp === -1 ? input : input.slice(0, sp)).slice(1);
      const rest = sp === -1 ? "" : input.slice(sp + 1).trim();
      if (SKILL_IDS.includes(cmdName)) {
        if (!enabledSkills.has(cmdName)) {
          enabledSkills.add(cmdName);
          const arr = [...enabledSkills];
          saveConfig({ enabledSkills: arr });
          if (config.token) pushSettings(config, { enabled_skills: arr });
          say(c.emerald(`● ${cmdName}`) + c.dim("  yoqildi"));
        } else {
          say(c.dim(`● ${cmdName} allaqachon yoqilgan`));
        }
        if (!rest) {
          rewritePrompt();
          continue;
        }
        input = rest; // skilni yoqib, qolgan matnni oddiy xabar sifatida davom ettiramiz
      }
    }

    // ── Noma'lum slash-buyruq ──
    if (input.startsWith("/")) {
      const name = input.split(/\s+/)[0];
      const near = SLASH_NAMES.filter((n) => n.startsWith(name.slice(0, 3))).slice(0, 3);
      say(c.red(`Noma'lum buyruq: ${name}`) + c.dim(near.length ? `  Balki: ${near.join(", ")}?` : "  /help — ro'yxat."));
      rewritePrompt();
      continue;
    }

    // ── Ulanish sharti — token yoki OpenRouter kaliti bo'lmasa yozib bo'lmaydi.
    // (Mas. seans o'rtasida /logout qilingan bo'lsa.) Login talab qilamiz.
    if (!config.token && !config.openrouterKey && !config.local) {
      say(`${c.amber("Tizimga kirmagansiz.")} ${c.white("/login")} ${c.dim("bilan akkauntga kiring")} ${c.dim("yoki")} ${c.white("/register")}${c.dim(".")}`);
      rewritePrompt();
      continue;
    }

    // Chuqur so'rash faqat yangi vazifaning birinchi xabarida (§A.9); /audit tuzatish so'rovi — aniq vazifa.
    const firstMessage = countTurns(messages) === 0 && !pendingAudit;

    // ── /audit hisoboti — keyingi xabarga kontekst sifatida (bir marta) ──
    if (pendingAudit) {
      if (/^(tuzat|tuzating|fix)[.!]*$/i.test(input)) input = "Audit natijasidagi muammolarni tuzat.";
      input = `${input}\n\n[XAVFSIZLIK TEKSHIRUVI — /audit natijasi]\n${pendingAudit}\n[/XAVFSIZLIK TEKSHIRUVI]`;
      pendingAudit = null;
    }

    // ── Oddiy xabar → agentga uzatish ──
    // "@fayl" eslatmalari — matndagi mavjud yo'llar avtomatik biriktiriladi.
    const mentions = collectMentions(input);
    for (const p of mentions) {
      try {
        // Eslatmalar qisqaroq kesiladi — bir nechta fayl kontekstni to'ldirmasin.
        const att = await readAttachment(p, { maxChars: 12_000 });
        pending.push({ path: p, part: att.part });
        say(`  ${att.label} ${c.dim("biriktirildi")}`);
      } catch (err) {
        say(`  ${c.red("✕")} ${p}: ${c.dim(err.message)}`);
      }
    }
    let userMsg;
    if (pending.length) {
      const parts = pending.map((x) => x.part);
      parts.push({ type: "text", text: input });
      userMsg = { role: "user", content: parts };
      pending.length = 0;
    } else {
      userMsg = { role: "user", content: input };
    }
    messages.push(userMsg);
    // Yoqilgan skillar system-prompt sifatida agentga uzatiladi. Xabar belgisi (SKILLS_MARK)
    // orqali topiladi va har navbatda yangilanadi — system xabarlar soniga (xotira xabari
    // qo'shilganda 3 ta bo'ladi) tayanilmaydi; /skill bilan o'chirish/yoqish ham darhol ta'sir qiladi.
    syncSkillsMessage(messages, enabledSkills);

    // ── Chuqur so'rash (rejalashtirish bosqichi) — Ctrl+C savollarni va xabarni bekor qiladi ──
    const inqAc = new AbortController();
    turnState.ac = inqAc;
    let inq;
    try {
      inq = await inquiryStep({ messages, userMsg, config, firstMessage, interactive: true, rl, state: inquiryState, log: say, signal: inqAc.signal });
    } finally {
      turnState.ac = null;
    }
    if (inq.cancelled) {
      removeMessage(messages, userMsg);
      say(c.dim("Xabar yuborilmadi."));
      rewritePrompt();
      continue;
    }
    // Addendum (taxminlar, javob tuzilmasi, favqulodda holat) — faqat shu navbat uchun system xabar.
    const addendumMsg = insertAddendum(messages, inq.addendum);
    try {
      await runTurn();
    } finally {
      removeMessage(messages, addendumMsg);
    }
    for (const l of renderFollowups(inq.followups, c)) say(l);
    sessionId = saveSession({ id: sessionId, messages, model: config.model });
    rewritePrompt();
  }

  stopSync();
  rl.close();
  console.log(G + c.dim((exiting ? "" : "\n") + "Xayr! ⬡\n"));
  return EXIT.OK;
}

// ---- one-shot (interaktiv tasdiqlar bilan) -----------------------------
async function oneShot(task, { inquiry = true } = {}) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ac = new AbortController();
  turnState.ac = ac;
  let sigints = 0;
  rl.on("SIGINT", () => {
    if (++sigints > 1) process.exit(EXIT.INTERRUPTED);
    stopSpinner();
    ac.abort();
    process.stdout.write("\n  " + c.amber("⊘ bekor qilinmoqda…") + c.dim("  (chiqish uchun yana Ctrl+C)") + "\n");
  });
  const config = withModelOverride(await ensureAuth(rl));
  const log = (l) => console.log("  " + l);
  const localStart = await applyLocalStartup(config, { interactive: true, rl, log });
  if (!localStart.ok) {
    printLocalError(localStart, log);
    rl.close();
    return EXIT.ERROR;
  }
  if (config.token) await syncMemory(config).catch(() => {});
  config.onLimit = limitHook(() => config, { interactive: true, rl, log });
  const confirm = await confirmer(rl);
  const messages = initialMessages(config);
  const userMsg = await buildUserMessage(task, attachFiles);
  messages.push(userMsg);
  // Chuqur so'rash (§A.9): vazifa boshida aniqlashtiruvchi savollar (Ctrl+C — bekor qilish).
  const inq = await inquiryStep({ messages, userMsg, config, firstMessage: inquiry, interactive: true, rl, log, signal: ac.signal });
  if (inq.cancelled) {
    rl.close();
    return EXIT.INTERRUPTED;
  }
  insertAddendum(messages, inq.addendum);
  const res = await agentTurn({ messages, config, confirm, signal: ac.signal, stream: !config.token, verify: flags.verify, fullAuto: fullAuto.on, budget: flags.budget ?? 0 });
  turnState.ac = null;
  if (res.error) console.log(c.red(`  Xato: ${res.error}`));
  for (const l of renderFollowups(inq.followups, c)) log(l);
  rl.close();
  if (res.aborted) return EXIT.INTERRUPTED;
  return res.error ? EXIT.ERROR : EXIT.OK;
}

// ---- interaktivsiz: sov -p "..." [--json] ------------------------------
/** stdin quvuridan matn (TTY bo'lsa yoki ma'lumot kelmasa — bo'sh). */
function readStdin({ firstByteMs = 3000, maxBytes = 2_000_000 } = {}) {
  return new Promise((resolveIn) => {
    const input = process.stdin;
    if (input.isTTY) return resolveIn("");
    let data = "";
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      input.pause();
      input.removeAllListeners("data");
      resolveIn(data);
    };
    // Ba'zi muhitlarda stdin ochiq qoladi, lekin hech narsa kelmaydi — osilib qolmaymiz.
    const timer = setTimeout(() => {
      if (!data) finish();
    }, firstByteMs);
    input.setEncoding("utf8");
    input.on("data", (chunk) => {
      data += chunk;
      if (data.length > maxBytes) {
        data = data.slice(0, maxBytes);
        finish();
      }
    });
    input.once("end", finish);
    input.once("error", finish);
  });
}

async function printMode(promptArg) {
  const json = Boolean(flags.json);
  const errColor = !json && !flags.noColor && Boolean(process.stderr.isTTY) && !process.env.NO_COLOR;
  // Progress/jurnal — stderr'ga (json: umuman yo'q); stdout'da faqat javob.
  configureUi({ spinner: false, color: errColor });
  const origLog = console.log;
  console.log = json ? () => {} : (...a) => process.stderr.write(format(...a) + "\n");

  const stdinText = promptArg === "-" || !process.stdin.isTTY ? await readStdin() : "";
  let prompt = promptArg === "-" ? "" : promptArg;
  if (stdinText.trim()) prompt = prompt ? `${prompt}\n\n[STDIN]\n${stdinText}\n[/STDIN]` : stdinText;

  const emit = (obj, code) => {
    console.log = origLog;
    return new Promise((res) => process.stdout.write(JSON.stringify(obj) + "\n", () => res(code)));
  };
  const fail = async (code, error) => {
    if (json) return emit({ ok: false, error, exit_code: code, version: VERSION }, code);
    console.log = origLog;
    process.stderr.write(`sov: ${error}\n`);
    return code;
  };

  if (!prompt.trim() && !attachFiles.length) return fail(EXIT.USAGE, "vazifa berilmagan. Foydalanish: sov -p \"savol\"  yoki  echo \"savol\" | sov -p");
  const config = withModelOverride(loadConfig());
  const log = (l) => console.log("  " + l);
  // --ollama / -m local: — mahalliy model (server va login kerak emas).
  const localStart = await applyLocalStartup(config, { interactive: false, log });
  if (!localStart.ok) return fail(EXIT.ERROR, [localStart.error, ...localStart.hint].map((l) => stripAnsi(l)).join(" · "));
  if (!config.token && !config.openrouterKey && !config.local) {
    return fail(EXIT.AUTH, "tizimga kirilmagan. Avval: sov login  (yoki SOVEREIGN_TOKEN / OPENROUTER_API_KEY, yoki --ollama)");
  }
  if (config.token) await syncMemory(config).catch(() => {});
  // Interaktivsiz: limit/offline'da so'ralmaydi — localFallback=auto bo'lsa o'tadi, aks holda ko'rsatma (stderr).
  config.onLimit = limitHook(() => config, { interactive: false, log });
  const messages = initialMessages(config);
  const userMsg = await buildUserMessage(prompt, attachFiles);
  messages.push(userMsg);
  // Chuqur so'rash: -p/--json/quvurda savol berilmaydi — faqat deterministik favqulodda tekshiruv (§A.9).
  const inq = await inquiryStep({ messages, userMsg, config, firstMessage: true, interactive: false, log });
  insertAddendum(messages, inq.addendum);

  const ac = new AbortController();
  turnState.ac = ac;
  let sigints = 0;
  process.on("SIGINT", () => {
    if (++sigints > 1) process.exit(EXIT.INTERRUPTED);
    ac.abort();
  });
  const res = await agentTurn({
    messages,
    config,
    confirm: nonInteractiveConfirmer(),
    signal: ac.signal,
    print: false,
    verify: flags.verify,
    fullAuto: fullAuto.on,
    budget: flags.budget ?? 0,
  });
  turnState.ac = null;
  const code = res.aborted ? EXIT.INTERRUPTED : res.error ? EXIT.ERROR : EXIT.OK;

  if (json) {
    return emit(
      {
        ok: code === EXIT.OK,
        result: res.final ?? "",
        ...(res.error ? { error: res.error } : {}),
        aborted: Boolean(res.aborted),
        truncated: Boolean(res.truncated),
        ...(res.loop ? { loop: res.loop } : {}),
        ...(res.budgetExceeded ? { budget_exceeded: true } : {}),
        usage: res.usage ?? null,
        ledger: res.ledger ?? [],
        honesty: res.honesty ?? null,
        exit_code: code,
        version: VERSION,
      },
      code,
    );
  }
  console.log = origLog;
  if (res.error) process.stderr.write(`sov: xato: ${res.error}\n`);
  const text = String(res.final ?? "").trimEnd();
  if (!text) return code;
  return new Promise((r) => process.stdout.write(text + "\n", () => r(code)));
}

// ---- oddiy buyruqlar ---------------------------------------------------
function handleKey(key) {
  if (!key || !key.startsWith("sk-")) {
    console.error(c.red("  Kalit 'sk-or-...' bilan boshlanishi kerak."));
    console.error(c.dim("  Foydalanish: sov key sk-or-v1-..."));
    return EXIT.USAGE;
  }
  const path = saveConfig({ openrouterKey: key });
  console.log(`\n  ${c.green("Kalit saqlandi:")} ${c.dim(path)}`);
  console.log(`  ${c.dim("Endi shunchaki")} ${c.white("sov")} ${c.dim("deb yozing.")}\n`);
  return EXIT.OK;
}

async function handleLogin() {
  const cfg = loadConfig();
  const urlFlag = flags.local ? "http://localhost:3000" : (flags.url ?? cfg.baseUrl);
  const ok = await login(urlFlag);
  return ok ? EXIT.OK : EXIT.ERROR;
}

/** Server tokenni bekor qila olmadi (tarmoq/HTTP xato) — mahalliy chiqish baribir bajarildi. */
const REVOKE_FAILED_MSG =
  "Mahalliy chiqish bajarildi, lekin serverdagi tokenni bekor qilib bo'lmadi — uni soveregn.xyz/cli/sessions sahifasida bekor qiling.";

async function handleLogout() {
  const revoked = await revokeStoredToken(); // token serverda ham bekor qilinadi (~3s)
  const base = clearAuth();
  console.log(`\n  ${c.green("Chiqdingiz.")} ${base ? c.dim(base) : ""}`);
  if (revoked === false) console.log(`  ${c.amber(REVOKE_FAILED_MSG)}`);
  console.log("");
  return EXIT.OK;
}

function handleWhoami() {
  const cfg = loadConfig();
  if (flags.json) {
    const mode = cfg.token ? "account" : cfg.openrouterKey ? "openrouter" : "none";
    console.log(JSON.stringify({ mode, baseUrl: cfg.baseUrl, email: cfg.email || null, model: cfg.omniModel || cfg.model }));
    return mode === "none" ? EXIT.AUTH : EXIT.OK;
  }
  if (cfg.token) console.log(`\n  ${c.green("Ulangan:")} SOVEREIGN akkaunt${cfg.email ? " " + c.white(cfg.email) : ""} ${c.dim("(" + cfg.baseUrl + ")")}\n`);
  else if (cfg.openrouterKey) console.log(`\n  ${c.green("Ulangan:")} O'z OpenRouter kaliti ${c.dim("(" + cfg.model + ")")}\n`);
  else {
    console.log(`\n  ${c.amber("Ulanmagan.")} ${c.dim("sov login")}\n`);
    return EXIT.AUTH;
  }
  return EXIT.OK;
}

async function handleDoctor() {
  const spin = flags.json ? null : spinner("tekshirilyapti...");
  const results = await runDoctor();
  spin?.stop();
  const fails = results.filter((r) => r.status === "fail").length;
  if (flags.json) console.log(JSON.stringify({ ok: fails === 0, version: VERSION, binary: IS_BINARY, checks: results }, null, 2));
  else printDoctor(results);
  return fails ? EXIT.ERROR : EXIT.OK;
}

/** sov audit [papka] [--json] — critical/high topilsa chiqish kodi 1. */
async function handleAudit(dir) {
  const root = pathResolve(dir || process.cwd());
  let st = null;
  try {
    st = statSync(root);
  } catch {
    st = null;
  }
  if (!st?.isDirectory()) {
    process.stderr.write(`sov: papka topilmadi: ${root}\n`);
    return EXIT.USAGE;
  }
  const spin = flags.json ? null : spinner("xavfsizlik tekshirilyapti...");
  const res = await runAudit(root);
  spin?.stop();
  if (flags.json) {
    const { findings, counts, ok, scanned, files, truncated, durationMs } = res;
    console.log(JSON.stringify({ ok, version: VERSION, root, counts, scanned, files, truncated, durationMs, findings }, null, 2));
  } else {
    console.log(formatAudit(res, c));
    if (res.findings.length) console.log(`  ${c.dim("AI bilan tuzatish: sov, keyin /audit va")} ${c.white("tuzat")}\n`);
  }
  return res.ok ? EXIT.OK : EXIT.ERROR;
}

function handleSessions() {
  const list = listSessions();
  if (flags.json) {
    console.log(JSON.stringify(list));
    return EXIT.OK;
  }
  if (!list.length) console.log(`\n  ${c.dim("Saqlangan sessiya yo'q.")}\n`);
  else {
    console.log("");
    for (const s of list.slice(0, 30)) {
      const when = String(s.updatedAt).slice(0, 16).replace("T", " ");
      console.log(`  ${c.white(s.id)}  ${c.dim(when)}  ${c.dim(`${String(s.turns).padStart(3)} savol`)}  ${s.title}`);
    }
    console.log(`\n  ${c.dim("Davom ettirish: sov, keyin /resume <id>")}\n`);
  }
  return EXIT.OK;
}

/** sov init [--ai] — SOVEREIGN.md shabloni; --ai bilan agent loyihani o'rganib to'ldiradi. */
async function handleInit() {
  const r = createProjectFile();
  if (!r.ok) {
    console.error(`\n  ${c.red("✕")} ${PROJECT_ERR[r.error] ?? PROJECT_ERR.io} ${c.dim(r.path)}\n`);
    return EXIT.ERROR;
  }
  console.log(`\n  ${c.green(r.created ? "Yaratildi:" : "Allaqachon bor:")} ${c.white(r.path)}`);
  if (!flags.ai) {
    console.log(`  ${c.dim("To'ldiring va git'ga commit qiling — jamoadagi har bir AI sessiya shu qoidalardan boshlaydi.")}`);
    console.log(`  ${c.dim("Agent to'ldirsin:")} ${c.white("sov init --ai")}\n`);
    return EXIT.OK;
  }
  console.log("");
  const task =
    `Loyihani o'rganib SOVEREIGN.md ni to'ldir (fayl: ${r.path}). Avval list_dir va read_file bilan README, package.json (yoki pyproject/go.mod/Cargo.toml), ` +
    "asosiy papkalar va konfiglarni ko'r. Keyin SOVEREIGN.md dagi '…' joylarni HAQIQIY ma'lumot bilan almashtir: loyiha nima qiladi, " +
    "asosiy papkalar, stek, buyruqlar (o'rnatish/ishga tushirish/test/build/lint — faqat loyihada haqiqatan bor buyruqlar), " +
    "kod uslubi va qoidalar, \"Tegma\" ro'yxati (generatsiya qilingan kod, lock fayllar va h.k.). Mavjud qoidalar va '## Eslatmalar' " +
    `bo'limini SAQLAB QOL. Qisqa yoz (${PROJECT_MAX_BYTES / 1024} KB dan oshmasin), kalit/parol/token yozma. Faqat SOVEREIGN.md ni o'zgartir, buyruq ishga tushirma.`;
  initTarget.path = pathResolve(r.path);
  if (!process.stdin.isTTY) return printMode(task);
  return oneShot(task, { inquiry: false });
}

// ---- dispatch ---------------------------------------------------------
async function main() {
  if (parsed.errors.length) {
    for (const e of parsed.errors) process.stderr.write(`sov: ${e}\n`);
    process.stderr.write("Yordam: sov --help\n");
    return EXIT.USAGE;
  }
  if (flags.version) {
    console.log(versionLine());
    return EXIT.OK;
  }
  const [first, ...restArgs] = parsed.positional;
  const cmd = first && SUBCOMMANDS.includes(first) && !flags.print ? first : null;
  if (flags.help) {
    handleHelp(cmd ?? undefined);
    return EXIT.OK;
  }
  switch (cmd) {
    case "help":
      handleHelp(restArgs[0]);
      return EXIT.OK;
    case "version":
      console.log(versionLine());
      return EXIT.OK;
    case "models": {
      const cfg = loadConfig();
      printModels(cfg.model, await fetchLocalModels(), cfg.localModel);
      return EXIT.OK;
    }
    case "login":
      return handleLogin();
    case "logout":
      return handleLogout();
    case "whoami":
    case "who":
      return handleWhoami();
    case "config":
      return handleConfig(restArgs);
    case "key":
      return handleKey(restArgs[0]);
    case "doctor":
      return handleDoctor();
    case "init":
      return handleInit();
    case "audit":
      return handleAudit(restArgs[0]);
    case "sessions":
      return handleSessions();
    default:
      break;
  }

  const prompt = parsed.positional.join(" ");
  // -p / --json — yoki stdin terminal bo'lmasa (quvur: git diff | sov "review",
  // CI, skript) — interaktivsiz rejim: hech narsa so'ralmaydi, javob stdout'ga.
  if (flags.print || flags.json || !process.stdin.isTTY) return printMode(prompt || "-");
  if (prompt) return oneShot(prompt);
  return repl();
}

main().then(
  (code) => {
    process.exitCode = typeof code === "number" ? code : EXIT.OK;
    // Fon taymerlari (sinxronlash, keep-alive soketlar) jarayonni ushlab turmasin.
    setTimeout(() => process.exit(process.exitCode), 200).unref();
  },
  (err) => {
    stopSpinner();
    process.stderr.write(`sov: kutilmagan xato: ${err?.stack || err}\n`);
    process.exit(EXIT.ERROR);
  },
);
