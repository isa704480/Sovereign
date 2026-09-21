#!/usr/bin/env node
import readline from "node:readline";
import { loadConfig, saveConfig, clearAuth, isAccountMode, CONFIG_PATH } from "../src/config.mjs";
import { agentTurn, initialMessages, swarm } from "../src/agent.mjs";
import { loadMemory, addMemory, removeMemory, clearMemory } from "../src/memory.mjs";
import { login } from "../src/login.mjs";
import { printModels, resolveModelId } from "../src/models.mjs";
import { collectMentions, completeMention, readAttachment } from "../src/files.mjs";
import { banner, c, clearScreen, gutter, hintBar, logo, separator, skillsList, slashMenu, spinner } from "../src/ui.mjs";
import { SKILLS, SKILL_IDS, SLASH_COMMANDS, SLASH_NAMES, openBrowser } from "../src/commands.mjs";
import { fetchMe, pushSettings, startBackgroundSync } from "../src/sync.mjs";
import { countTurns, listSessions, loadSession, rewind, saveSession } from "../src/sessions.mjs";

const rawArgs = process.argv.slice(2);
const AUTO_YES = rawArgs.includes("--yes") || rawArgs.includes("-y");

/**
 * VIBE rejim — `sov` deb chaqirilganda (yoki --vibe bilan) yoqiladi: kodni
 * faqat AI yozadi, fayl yaratish/o'zgartirish har safar so'ralmaydi. Xavfli
 * terminal buyruqlari baribir tasdiq so'raydi — bu chegara hech qachon ochilmaydi.
 */
const invokedAs = (process.argv[1] ?? "").split(/[\\/]/).pop()?.replace(/\.(mjs|js)$/, "") ?? "";
const vibe = { on: invokedAs === "sov" || rawArgs.includes("--vibe") };

// -f <path> / --file <path> collects local files to attach to the first turn.
const attachFiles = [];
const args = [];
for (let i = 0; i < rawArgs.length; i++) {
  const a = rawArgs[i];
  if (a === "--yes" || a === "-y" || a === "--vibe") continue;
  if (a === "-f" || a === "--file") {
    const p = rawArgs[++i];
    if (p) attachFiles.push(p);
    continue;
  }
  if (a.startsWith("--file=")) {
    attachFiles.push(a.slice(7));
    continue;
  }
  args.push(a);
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

function ask(rl, q) {
  return new Promise((res) => rl.question(q, (a) => res(a)));
}

/** Ask until a non-empty answer (tolerates a stray leading newline on Windows cmd). */
async function askRequired(rl, q, tries = 4) {
  for (let i = 0; i < tries; i++) {
    const a = (await ask(rl, q)).trim();
    if (a) return a;
  }
  return "";
}

async function confirmer(rl) {
  return async (question, forcePrompt = false) => {
    if ((AUTO_YES || vibe.on) && !forcePrompt) {
      console.log(`  ${c.amber("?")} ${question} ${c.green("auto-yes")}`);
      return true;
    }
    // `forcePrompt` — xavfli buyruqlar uchun --yes bo'lsa ham majburiy tasdiq.
    const prefix = forcePrompt ? c.red("!") : c.amber("?");
    const a = (await ask(rl, `  ${prefix} ${question} ${c.dim("[y/N] ")}`)).trim().toLowerCase();
    return a === "y" || a === "yes" || a === "ha";
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
    if (!key) process.exit(1);
    saveConfig({ openrouterKey: key });
    return loadConfig();
  }

  const ok = await login(config.baseUrl);
  if (!ok) process.exit(1);
  return loadConfig();
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

function handleHelp() {
  console.log(banner(loadConfig()));
  console.log(
    [
      "  Foydalanish:",
      `    ${c.white("sovereign")}                       interaktiv rejim (chat + agent)`,
      `    ${c.white('sovereign "vazifa"')}              bitta topshiriq va chiq`,
      `    ${c.white('sovereign "..." -f rasm.png')}     faylni biriktirib yuborish`,
      `    ${c.white("sovereign login")}                 brauzer orqali hisobga ulanish`,
      `    ${c.white("sovereign login --local")}         lokal serverga ulanish (test)`,
      `    ${c.white("sovereign logout")}                hisobdan chiqish`,
      `    ${c.white("sovereign whoami")}                holat`,
      `    ${c.white("sovereign key sk-or-...")}         o'z OpenRouter kalitingiz`,
      `    ${c.white("sovereign help")}                  yordam`,
      "",
      "  Interaktiv buyruqlar:",
      `    ${c.white("/models")}          model ro'yxati`,
      `    ${c.white("/model <id>")}      modelni almashtirish (qisqa nom ham bo'ladi)`,
      `    ${c.white("/cwd <path>")}      ish papkasini o'zgartirish`,
      `    ${c.white("/attach <path>")}   keyingi xabarga fayl (rasm/PDF/matn) biriktirish`,
      `    ${c.white("/detach")}          biriktirilgan fayllarni tozalash`,
      `    ${c.white("/clear")}           suhbatni tozalash`,
      `    ${c.white("/exit")}            chiqish`,
      "",
      `  Kalit: ${c.dim("$OPENROUTER_API_KEY yoki")} ${c.dim(CONFIG_PATH)}`,
      "",
    ].join("\n"),
  );
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

/** Bulk console.log with proper left gutter. */
function print(...lines) {
  const g = gutter();
  for (const line of lines) console.log(g + line);
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
    // Standart "> " o'rniga o'zimizniki (repl boshlanganda yangilanadi).
    prompt: `${gutter()}${c.accent("❯")} `,
  });

  let config = await ensureAuth(rl);
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
      if (me.default_model) config.model = me.default_model;
      config.planState = me.plan_state;
      config.plan = me.plan;
      config.daysLeft = me.days_left;
      saveConfig({
        enabledSkills: [...enabledSkills],
        model: config.model,
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
        if (changed.model) {
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

  rewritePrompt();

  for await (const raw of rl) {
    const input = raw.trim();
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
        say(c.dim("Foydalanish: /swarm 4 <vazifa>  — 2 dan 8 gacha ishchi bir vaqtda ishlaydi"));
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
        say(c.accent("◆ YAKUNIY YECHIM"));
        console.log(res.merged.replace(/^/gm, G + "  "));
        say("");
        messages.push({ role: "user", content: task });
        messages.push({ role: "assistant", content: res.merged });
      }
      rewritePrompt();
      continue;
    }

    // ── Vibe rejim ──
    if (input === "/vibe") {
      vibe.on = !vibe.on;
      say(
        vibe.on
          ? `${c.emerald("◆ VIBE")} ${c.dim("yoqildi — kodni AI yozadi, fayllar uchun tasdiq so'ralmaydi.")}`
          : `${c.amber("○ VIBE")} ${c.dim("o'chirildi — har bir o'zgarish tasdiqlanadi.")}`,
      );
      rewritePrompt();
      continue;
    }

    // ── Help / Menyu ──
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
        if (input === "/help") {
      console.log(renderSlashMenu());
      rewritePrompt();
      continue;
    }

    // ── SOVEREIGN Skills ──
    if (input === "/skills") {
      console.log(skillsList(SKILLS, [...enabledSkills]));
      rewritePrompt();
      continue;
    }
    if (input.startsWith("/skill")) {
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

    // ── Modellar ──
    if (input === "/models") {
      printModels(config.model);
      rewritePrompt();
      continue;
    }
    if (input.startsWith("/model")) {
      const arg = input.slice(6).trim();
      if (arg) {
        const m = resolveModelId(arg);
        config = { ...config, model: m };
        saveConfig({ model: m });
        say(`${c.green("Model:")} ${c.indigo(m)}${config.token ? c.dim("  (server tarifga qarab tanlaydi)") : ""}`);
        // Web bilan model tanlovini ham sinxronlaymiz
        if (config.token) pushSettings(config, { default_model: m });
      } else {
        printModels(config.model);
      }
      rewritePrompt();
      continue;
    }

    // ── Ish papkasi ──
    if (input.startsWith("/cwd")) {
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
    if (input.startsWith("/attach")) {
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
        config = loadConfig();
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

    // ── Noma'lum slash-buyruq ──
    if (input.startsWith("/")) {
      say(c.red(`Noma'lum buyruq: ${input}`) + c.dim("  /") + c.dim(" yozib menyuni oching."));
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
    const { error } = await agentTurn({ messages, config, confirm });
    if (error) console.log(G + c.red(`Xato: ${error}\n`));
    sessionId = saveSession({ id: sessionId, messages, model: config.model });
    rewritePrompt();
  }

  stopSync();
  rl.close();
  console.log(G + c.dim("\nXayr! ⬡\n"));
}

// ---- one-shot ---------------------------------------------------------
async function oneShot(task) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const config = await ensureAuth(rl);
  const confirm = await confirmer(rl);
  const messages = initialMessages(config);
  messages.push(await buildUserMessage(task, attachFiles));
  const { error } = await agentTurn({ messages, config, confirm });
  if (error) console.log(c.red(`  Xato: ${error}`));
  rl.close();
}

function handleKey(key) {
  if (!key || !key.startsWith("sk-")) {
    console.log(c.red("  Kalit 'sk-or-...' bilan boshlanishi kerak."));
    console.log(c.dim("  Foydalanish: sovereign key sk-or-v1-..."));
    process.exit(1);
  }
  const path = saveConfig({ openrouterKey: key });
  console.log(`\n  ${c.green("Kalit saqlandi:")} ${c.dim(path)}`);
  console.log(`  ${c.dim("Endi shunchaki")} ${c.white("sovereign")} ${c.dim("deb yozing.")}\n`);
}

async function handleLogin() {
  const cfg = loadConfig();
  const urlFlag = rawArgs.includes("--local")
    ? "http://localhost:3000"
    : (rawArgs.find((a) => a.startsWith("--url="))?.slice(6) ?? cfg.baseUrl);
  const ok = await login(urlFlag);
  process.exit(ok ? 0 : 1);
}

function handleLogout() {
  const base = clearAuth();
  console.log(`\n  ${c.green("Chiqdingiz.")} ${base ? c.dim(base) : ""}\n`);
}

function handleWhoami() {
  const cfg = loadConfig();
  if (cfg.token) console.log(`\n  ${c.green("Ulangan:")} SOVEREIGN akkaunt ${c.dim("(" + cfg.baseUrl + ")")}\n`);
  else if (cfg.openrouterKey) console.log(`\n  ${c.green("Ulangan:")} O'z OpenRouter kaliti ${c.dim("(" + cfg.model + ")")}\n`);
  else console.log(`\n  ${c.amber("Ulanmagan.")} ${c.dim("sovereign login")}\n`);
}

// ---- dispatch ---------------------------------------------------------
const cmd = args[0];
if (cmd === "models") printModels(loadConfig().model);
else if (cmd === "login") await handleLogin();
else if (cmd === "logout") handleLogout();
else if (cmd === "whoami" || cmd === "who") handleWhoami();
else if (cmd === "config") await handleConfig();
else if (cmd === "key") handleKey(args[1]);
else if (cmd === "help" || cmd === "--help" || cmd === "-h") handleHelp();
else if (cmd && !cmd.startsWith("-")) await oneShot(args.join(" "));
else await repl();
