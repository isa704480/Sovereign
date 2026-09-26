#!/usr/bin/env node
import readline from "node:readline";
import { format } from "node:util";
import { readFileSync } from "node:fs";
import { dirname as pathDirname, resolve as pathResolve, sep as pathSep } from "node:path";
import { loadConfig, saveConfig, clearAuth, isAccountMode, CONFIG_PATH } from "../src/config.mjs";
import { agentTurn, initialMessages, swarm } from "../src/agent.mjs";
import { loadMemory, addMemory, removeMemory, clearMemory, syncMemory } from "../src/memory.mjs";
import { addProjectNote, createProjectFile, projectInfo, refreshProjectMessage, PROJECT_MAX_BYTES } from "../src/project-memory.mjs";
import { login } from "../src/login.mjs";
import { printModels, resolveModelId, isOmniId, fetchCatalog, printCatalog, fetchFamilies, matchFamily, CLI_MODELS } from "../src/models.mjs";
import { selectMenu } from "../src/menu.mjs";
import { collectMentions, completeMention, readAttachment } from "../src/files.mjs";
import { banner, c, clearScreen, configureUi, gutter, hintBar, logo, skillsList, slashMenu, spinner, stopSpinner, stripAnsi } from "../src/ui.mjs";
import { SKILLS, SKILL_IDS, SLASH_COMMANDS, SLASH_NAMES, openBrowser } from "../src/commands.mjs";
import { fullAutoDenyReason, isTrustableDir, resolvePath as resolveWs, visible } from "../src/tools.mjs";
import { cliSnapshotStore, describeCounts } from "../src/snapshot.mjs";
import { fetchMe, pushSettings, startBackgroundSync } from "../src/sync.mjs";
import { countTurns, listSessions, loadSession, rewind, saveSession } from "../src/sessions.mjs";
import { EXIT, SUBCOMMANDS, parseArgs } from "../src/args.mjs";
import { VERSION, IS_BINARY } from "../src/version.mjs";
import { runDoctor, printDoctor } from "../src/doctor.mjs";
import { renderDiff } from "../src/diff.mjs";
import { loadHistory, saveHistory, HISTORY_SIZE } from "../src/history.mjs";

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
const invokedAs = (process.argv[1] ?? "").split(/[\\/]/).pop()?.replace(/\.(mjs|js|exe|cmd)$/i, "").toLowerCase() ?? "";
const vibe = { on: !flags.noVibe && (invokedAs === "sov" || Boolean(flags.vibe)) };

/**
 * FULL AUTO — `--full-auto` yoki `/auto` (foydalanuvchi o'zi yoqadi): HECH NARSA
 * so'ralmaydi. Ish papkasi ichidagi yozish va barcha buyruqlar (paket o'rnatish,
 * test, build) tasdiqsiz bajariladi. So'ralmasdan RAD ETILADI: tashqi yo'llar,
 * himoyalangan/bloklangan narsalar (tools.mjs) va push/publish/deploy/sudo.
 */
const fullAuto = { on: Boolean(flags.fullAuto) };

/** Full auto qarori: true — bajar, false — rad et (hech qachon so'ramaydi). */
function fullAutoDecision(question, meta) {
  const q = stripAnsi(question);
  if (meta?.outside) {
    console.log(`  ${c.red("⊘")} ${c.dim(q)} ${c.red("full auto: ish papkasidan tashqarida — rad etildi")}`);
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
  if (config.token) return { ...config, omniModel: flags.model, model: flags.model };
  return { ...config, model: resolveModelId(flags.model), omniModel: "" };
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
    if (fullAuto.on) {
      const ok = fullAutoDecision(question, meta);
      if (ok) previewWrite(meta, false);
      return ok;
    }
    const mustAsk = Boolean(forcePrompt || meta?.risky || meta?.outside);
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
    if (fullAuto.on) return fullAutoDecision(question, meta);
    const mustAsk = Boolean(forcePrompt || meta?.risky || meta?.outside);
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
  if (isAccountMode(config) || config.openrouterKey) return config;

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
  logout: ["sov logout", "Akkauntdan chiqish (lokal token o'chiriladi).", []],
  whoami: ["sov whoami [--json]", "Ulanish holati: akkaunt yoki o'z OpenRouter kalitingiz.", ["sov whoami --json"]],
  doctor: ["sov doctor [--json]", "Diagnostika: Node/binary, versiya, config, server, login, ish papkasi, PATH. Muammo bo'lsa chiqish kodi 1.", ["sov doctor", "sov doctor --json"]],
  init: [
    "sov init [--ai]",
    "Loyiha xotirasi: joriy papkada SOVEREIGN.md yaratadi (loyiha haqida, stek, buyruqlar, qoidalar, \"tegma\" ro'yxati, eslatmalar). Agent (CLI va Cowork) uni har suhbat boshida o'qiydi — git'ga commit qiling, jamoa bilan ulashiladi. --ai: agent loyihani o'rganib faylni o'zi to'ldiradi (yozishdan oldin tasdiq so'raladi).",
    ["sov init", "sov init --ai"],
  ],
  models: ["sov models", "Mahalliy model ro'yxati (interaktiv rejimda /model — to'liq katalog).", []],
  sessions: ["sov sessions [--json]", "Saqlangan suhbatlar. Davom ettirish: interaktiv rejimda /resume <id>.", []],
  key: ["sov key <sk-or-...>", "O'z OpenRouter kalitingizni saqlash (akkauntsiz rejim).", ["sov key sk-or-v1-..."]],
  config: ["sov config", "Kalitlar va standart modelni interaktiv sozlash.", []],
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
      `    ${w("models")}                   modellar ro'yxati`,
      `    ${w("sessions")}                 saqlangan suhbatlar`,
      `    ${w("key")} <sk-or-...>          o'z OpenRouter kalitingiz`,
      `    ${w("config")}                   interaktiv sozlash`,
      `    ${w("version")}                  versiya`,
      `    ${w("help")} [buyruq]            yordam (mas. sov help doctor)`,
      "",
      `  ${w("Flaglar:")}`,
      `    -p, --print              interaktivsiz: javobni stdout'ga chiqarib chiqadi`,
      `        --json               -p / doctor / whoami bilan — JSON natija`,
      `    -f, --file <yo'l>        fayl biriktirish (rasm/PDF/matn; takrorlash mumkin)`,
      `    -m, --model <id>         shu ish uchun model (saqlanmaydi)`,
      `    -y, --yes                ish papkasi ichidagi oddiy amallarni avtomatik tasdiqlash`,
      `        --vibe, --no-vibe    vibe rejimni yoqish / o'chirish (sov nomi bilan yoqiq)`,
      `        --full-auto, --auto  FULL AUTO: hech narsa so'ralmaydi (tashqi yo'l, push/publish/deploy rad etiladi)`,
      `        --no-verify          AI hakam (halollik tekshiruvi)ni o'chirish`,
      `        --budget <token>     bitta vazifa uchun token byudjeti (mas. 50k) — oshsa navbat to'xtaydi`,
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
      `    sov doctor`,
      `    sov init --ai`,
      "",
      `  ${w("Interaktiv rejimda:")} / — buyruqlar menyusi, /help, @fayl — biriktirish, ↑/↓ — tarix,`,
      `    Ctrl+C — joriy ishni bekor qilish, ikki marta — chiqish.`,
      "",
      `  ${w("Loyiha xotirasi:")} papkadagi SOVEREIGN.md (yoki .sovereign/PROJECT.md) har suhbatga qo'shiladi;`,
      `    /project — ko'rish, /project-remember <fakt> — jamoa qoidasini qo'shish. Git'ga commit qiling.`,
      "",
      `  ${w("Xavfsizlik:")} ish papkasidan tashqaridagi yo'l va xavfli buyruqlar HAR DOIM so'raladi`,
      `    (--yes/vibe ham o'tkazib yubormaydi); -p rejimida ular avtomatik rad etiladi.`,
      `    --full-auto: hech narsa so'ralmaydi — xavfli buyruqlar ham bajariladi; tashqi yo'l,`,
      `    git push, publish, deploy, sudo va bloklangan buyruqlar esa so'ralmasdan rad etiladi.`,
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
async function handleConfig() {
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
  console.log(`\n  ${c.green("Saqlandi:")} ${c.dim(path)}\n`);
  rl.close();
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
    const hits = SLASH_NAMES.filter((n) => n.startsWith(line));
    return [hits.length ? hits.map((h) => h + " ") : SLASH_NAMES.map((h) => h + " "), line];
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
  // Umumiy xotira (web bilan bir xil) — birinchi xabardan oldin keshni yangilaymiz.
  if (config.token) await syncMemory(config).catch(() => {});
  let messages = initialMessages(config);
  let sessionId = null; // birinchi javobdan keyin yaratiladi
  const pending = []; // paths queued via /attach for the next user message
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
    `${c.accent("❯")} `;

  const rewritePrompt = () => {
    rl.setPrompt(promptStr());
    rl.prompt();
  };
  const say = (line) => console.log(G + line);

  /** Agent navbati — Ctrl+C bilan bekor qilinadi. */
  const runTurn = async () => {
    const ac = new AbortController();
    turnState.ac = ac;
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
      return res;
    } finally {
      turnState.ac = null;
    }
  };

  // ── Model tanlash — strelka bilan (yozmasdan) ──
  const setAutoModel = () => {
    saveConfig({ omniModel: "", model: "" });
    config = { ...config, omniModel: "", model: loadConfig().model };
    say(`${c.green("Model:")} ${c.indigo("SOVEREIGN Auto")} ${c.dim("(tarifingizga qarab server o'zi tanlaydi)")}`);
  };
  const setOmniModel = (id) => {
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
      if (v.kind === "static") {
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
      say(
        fullAuto.on
          ? `${c.emerald("⚡ FULL AUTO")} ${c.dim("yoqildi — hech narsa so'ralmaydi: fayl yozish, paket o'rnatish, test va build darhol bajariladi.")}
` +
              G + c.amber("  ⚠ Faqat ishonchli papkada ishlating. ") + c.dim("Tashqi yo'llar, git push, publish, deploy va sudo avtomatik rad etiladi. /auto — o'chirish.")
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
    if (input === "/model" || input.startsWith("/model ")) {
      const arg = input.slice(6).trim();
      if (arg && /^(auto|avto|sovereign)$/i.test(arg)) {
        // SOVEREIGN Auto — server tarif va mavjud provayderlarga qarab o'zi tanlaydi.
        setAutoModel();
      } else if (arg) {
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
        printModels(config.omniModel || (config.token ? "" : config.model));
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
      const base = clearAuth();
      config = loadConfig();
      say(`${c.amber("Chiqdingiz.")} ${base ? c.dim(base) : ""}`);
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
    if (!config.token && !config.openrouterKey) {
      say(`${c.amber("Tizimga kirmagansiz.")} ${c.white("/login")} ${c.dim("bilan akkauntga kiring")} ${c.dim("yoki")} ${c.white("/register")}${c.dim(".")}`);
      rewritePrompt();
      continue;
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
    if (pending.length) {
      const parts = pending.map((x) => x.part);
      parts.push({ type: "text", text: input });
      messages.push({ role: "user", content: parts });
      pending.length = 0;
    } else {
      messages.push({ role: "user", content: input });
    }
    // Yoqilgan skillar system-prompt sifatida agentga uzatiladi. Xabar belgisi (SKILLS_MARK)
    // orqali topiladi va har navbatda yangilanadi — system xabarlar soniga (xotira xabari
    // qo'shilganda 3 ta bo'ladi) tayanilmaydi; /skill bilan o'chirish/yoqish ham darhol ta'sir qiladi.
    syncSkillsMessage(messages, enabledSkills);
    await runTurn();
    sessionId = saveSession({ id: sessionId, messages, model: config.model });
    rewritePrompt();
  }

  stopSync();
  rl.close();
  console.log(G + c.dim((exiting ? "" : "\n") + "Xayr! ⬡\n"));
  return EXIT.OK;
}

// ---- one-shot (interaktiv tasdiqlar bilan) -----------------------------
async function oneShot(task) {
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
  if (config.token) await syncMemory(config).catch(() => {});
  const confirm = await confirmer(rl);
  const messages = initialMessages(config);
  messages.push(await buildUserMessage(task, attachFiles));
  const res = await agentTurn({ messages, config, confirm, signal: ac.signal, stream: !config.token, verify: flags.verify, fullAuto: fullAuto.on, budget: flags.budget ?? 0 });
  turnState.ac = null;
  if (res.error) console.log(c.red(`  Xato: ${res.error}`));
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
  if (!config.token && !config.openrouterKey) {
    return fail(EXIT.AUTH, "tizimga kirilmagan. Avval: sov login  (yoki SOVEREIGN_TOKEN / OPENROUTER_API_KEY)");
  }
  if (config.token) await syncMemory(config).catch(() => {});
  const messages = initialMessages(config);
  messages.push(await buildUserMessage(prompt, attachFiles));

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

function handleLogout() {
  const base = clearAuth();
  console.log(`\n  ${c.green("Chiqdingiz.")} ${base ? c.dim(base) : ""}\n`);
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
  if (!process.stdin.isTTY) return printMode(task);
  return oneShot(task);
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
    case "models":
      printModels(loadConfig().model);
      return EXIT.OK;
    case "login":
      return handleLogin();
    case "logout":
      return handleLogout();
    case "whoami":
    case "who":
      return handleWhoami();
    case "config":
      await handleConfig();
      return EXIT.OK;
    case "key":
      return handleKey(restArgs[0]);
    case "doctor":
      return handleDoctor();
    case "init":
      return handleInit();
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
