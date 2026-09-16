#!/usr/bin/env node
import readline from "node:readline";
import { loadConfig, saveConfig, clearAuth, isAccountMode, CONFIG_PATH } from "../src/config.mjs";
import { agentTurn, initialMessages } from "../src/agent.mjs";
import { login } from "../src/login.mjs";
import { printModels, resolveModelId } from "../src/models.mjs";
import { readAttachment } from "../src/files.mjs";
import { banner, c, logo } from "../src/ui.mjs";

const rawArgs = process.argv.slice(2);
const AUTO_YES = rawArgs.includes("--yes") || rawArgs.includes("-y");

// -f <path> / --file <path> collects local files to attach to the first turn.
const attachFiles = [];
const args = [];
for (let i = 0; i < rawArgs.length; i++) {
  const a = rawArgs[i];
  if (a === "--yes" || a === "-y") continue;
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
  return async (question) => {
    if (AUTO_YES) {
      console.log(`  ${c.amber("?")} ${question} ${c.green("auto-yes")}`);
      return true;
    }
    const a = (await ask(rl, `  ${c.amber("?")} ${question} ${c.dim("[y/N] ")}`)).trim().toLowerCase();
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

// ---- interactive REPL -------------------------------------------------
async function repl() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  let config = await ensureAuth(rl);
  let messages = initialMessages();
  const pending = []; // paths queued via /attach for the next user message

  console.log(banner(config));
  const confirm = await confirmer(rl);

  const promptStr = () => (pending.length ? `${c.amber(`[${pending.length}📎]`)} ${c.green("›")} ` : `${c.green("›")} `);
  process.stdout.write("  " + promptStr());

  for await (const raw of rl) {
    const input = raw.trim();
    if (!input) {
      process.stdout.write("  " + promptStr());
      continue;
    }

    if (input === "/exit" || input === "/quit") break;
    if (input === "/clear") {
      messages = initialMessages();
      console.log(c.dim("  Suhbat tozalandi."));
      process.stdout.write("  " + promptStr());
      continue;
    }
    if (input === "/help") {
      handleHelp();
      process.stdout.write("  " + promptStr());
      continue;
    }
    if (input === "/models") {
      printModels(config.model);
      process.stdout.write("  " + promptStr());
      continue;
    }
    if (input.startsWith("/model")) {
      const arg = input.slice(6).trim();
      if (arg) {
        const m = resolveModelId(arg);
        config = { ...config, model: m };
        saveConfig({ model: m });
        console.log(`  ${c.green("Model:")} ${c.indigo(m)}${config.token ? c.dim("  (akkaunt rejimida server tarifga qarab tanlaydi)") : ""}`);
      } else {
        printModels(config.model);
      }
      process.stdout.write("  " + promptStr());
      continue;
    }
    if (input.startsWith("/cwd")) {
      const p = input.slice(4).trim();
      if (p) {
        try {
          process.chdir(p);
          messages = initialMessages();
          console.log(`  ${c.green("Ish papkasi:")} ${c.white(process.cwd())} ${c.dim("(kontekst yangilandi)")}`);
        } catch (err) {
          console.log(c.red(`  Xato: ${err.message}`));
        }
      } else {
        console.log(`  ${c.dim(process.cwd())}`);
      }
      process.stdout.write("  " + promptStr());
      continue;
    }
    if (input.startsWith("/attach")) {
      const p = input.slice(7).trim().replace(/^["']|["']$/g, "");
      if (!p) {
        console.log(`  ${c.dim("Foydalanish: /attach <fayl-yo'li>")}`);
      } else {
        try {
          const att = await readAttachment(p);
          pending.push({ path: p, part: att.part, label: att.label });
          console.log(`  ${att.label} ${c.dim("navbatda — keyingi xabarga qo'shiladi")}`);
        } catch (err) {
          console.log(c.red(`  Xato: ${err.message}`));
        }
      }
      process.stdout.write("  " + promptStr());
      continue;
    }
    if (input === "/detach") {
      pending.length = 0;
      console.log(c.dim("  Biriktirilgan fayllar tozalandi."));
      process.stdout.write("  " + promptStr());
      continue;
    }

    if (pending.length) {
      const parts = pending.map((x) => x.part);
      parts.push({ type: "text", text: input });
      messages.push({ role: "user", content: parts });
      pending.length = 0;
    } else {
      messages.push({ role: "user", content: input });
    }
    const { error } = await agentTurn({ messages, config, confirm });
    if (error) console.log(c.red(`\n  Xato: ${error}\n`));
    process.stdout.write("  " + promptStr());
  }

  rl.close();
  console.log(c.dim("\n  Xayr! ⬡\n"));
}

// ---- one-shot ---------------------------------------------------------
async function oneShot(task) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const config = await ensureAuth(rl);
  const confirm = await confirmer(rl);
  const messages = initialMessages();
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
