#!/usr/bin/env node
import readline from "node:readline";
import { format } from "node:util";
import { readFileSync } from "node:fs";
import { dirname as pathDirname, resolve as pathResolve, sep as pathSep } from "node:path";
import { loadConfig, saveConfig, clearAuth, isAccountMode, CONFIG_PATH } from "../src/config.mjs";
import { agentTurn, initialMessages, swarm } from "../src/agent.mjs";
import { loadMemory, addMemory, removeMemory, clearMemory, syncMemory } from "../src/memory.mjs";
import { login } from "../src/login.mjs";
import { printModels, resolveModelId, isOmniId, fetchCatalog, printCatalog, fetchFamilies, matchFamily, CLI_MODELS } from "../src/models.mjs";
import { selectMenu } from "../src/menu.mjs";
import { collectMentions, completeMention, readAttachment } from "../src/files.mjs";
import { banner, c, clearScreen, configureUi, gutter, hintBar, logo, skillsList, slashMenu, spinner, stopSpinner, stripAnsi } from "../src/ui.mjs";
import { SKILLS, SKILL_IDS, SLASH_COMMANDS, SLASH_NAMES, openBrowser } from "../src/commands.mjs";
import { isTrustableDir, resolvePath as resolveWs } from "../src/tools.mjs";
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
      `        --no-verify          AI hakam (halollik tekshiruvi)ni o'chirish`,
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
      `    sov "shu dizaynga HTML yoz" -f mockup.png`,
      `    sov doctor`,
      "",
      `  ${w("Interaktiv rejimda:")} / — buyruqlar menyusi, /help, @fayl — biriktirish, ↑/↓ — tarix,`,
      `    Ctrl+C — joriy ishni bekor qilish, ikki marta — chiqish.`,
      "",
      `  ${w("Xavfsizlik:")} ish papkasidan tashqaridagi yo'l va xavfli buyruqlar HAR DOIM so'raladi`,
      `    (--yes/vibe ham o'tkazib yubormaydi); -p rejimida ular avtomatik rad etiladi.`,
      "",
      `  ${w("Chiqish kodlari:")} 0 muvaffaqiyat · 1 xato · 2 noto'g'ri foydalanish · 3 login kerak · 130 Ctrl+C`,
      `  ${w("Muhit:")} SOVEREIGN_URL, SOVEREIGN_TOKEN, OPENROUTER_API_KEY, SOVEREIGN_MODEL, NO_COLOR, SOV_VERIFY=0`,
      `  ${w("Sozlamalar:")} ${c.dim(CONFIG_PATH)}`,
      "",
    ].join("\n"),
  );
}

function versionLine() {
  return `sov ${VERSION} (${process.platform}-${process.arch}, ${IS_BINARY ? "binary" : "node"} v${process.versions.node})`;
}

// ---- subcommands ------------------------------------------------------
async function handleConfig() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log(`\n  ${logo()} ${c.dim("sozlash")}\n`);
  const key = (await ask(rl, `  OpenRouter kalit (bo'sh = o'zgarmasin): `)).trim();
  const pkey = (await ask(rl, `  Perplexity kalit (ixtiyoriy): `)).trim();
  const model = (await ask(rl, `  Model [enter = gpt-4o-mini]: `)).trim();
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
  console.log(banner(config, [...enabledSkills], vibe.on));
  console.log(hintBar(config, pending.length, vibe.on));

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

  // Fon rejimidagi sinxronlash — web tarafida qilingan o'zgarishlar CLI ga keladi
  const stopSync = config.token
    ? startBackgroundSync(config, (changed) => {
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
      })
    : () => {};

  // Apple-style prompt: minimal single chevron, restrained color.
  // MUHIM: promptni readline'ning o'ziga beramiz. Aks holda u har qayta
  // chizishda (Enter, Tab, terminal o'lchami) o'zining standart "> " ini
  // chap chetga yozib, gutter va ❯ belgisini yo'qotadi.
  const G = gutter();
  const promptStr = () =>
    G +
    (pending.length ? `${c.warn("📎 " + pending.length)}  ` : "") +
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
    // Yoqilgan skillar system-prompt sifatida agentga uzatiladi (birinchi turda).
    if (enabledSkills.size && messages.filter((m) => m.role === "system").length < 3) {
      const activeNames = SKILLS.filter((s) => enabledSkills.has(s.id)).map((s) => `- ${s.name}: ${s.desc}`);
      messages.splice(2, 0, {
        role: "system",
        content: `Foydalanuvchi tomonidan yoqilgan SOVEREIGN Skills:\n${activeNames.join("\n")}\nUlarni javob berayotganda qo'llang.`,
      });
    }
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
  const res = await agentTurn({ messages, config, confirm, signal: ac.signal, stream: !config.token, verify: flags.verify });
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
