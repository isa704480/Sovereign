#!/usr/bin/env node
import readline from "node:readline";
import { loadConfig, saveConfig, CONFIG_PATH } from "../src/config.mjs";
import { agentTurn, initialMessages } from "../src/agent.mjs";
import { banner, c, logo } from "../src/ui.mjs";

const rawArgs = process.argv.slice(2);
const AUTO_YES = rawArgs.includes("--yes") || rawArgs.includes("-y");
const args = rawArgs.filter((a) => a !== "--yes" && a !== "-y");

function ask(rl, q) {
  return new Promise((res) => rl.question(q, (a) => res(a)));
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

function printAnswer(text) {
  if (!text) return;
  console.log("\n" + c.indigo("⬡") + "  " + text.replace(/\n/g, "\n   ") + "\n");
}

async function ensureKey(rl) {
  let config = loadConfig();
  if (config.openrouterKey) return config;
  console.log(`\n  ${c.amber("OpenRouter API kalit topilmadi.")}`);
  console.log(`  ${c.dim("Oling: https://openrouter.ai/keys")}`);
  const key = (await ask(rl, `  ${c.dim("Kalitni kiriting (sk-or-...): ")}`)).trim();
  if (!key) {
    console.log(c.red("  Kalit kerak. Chiqildi."));
    process.exit(1);
  }
  const path = saveConfig({ openrouterKey: key });
  console.log(`  ${c.green("Saqlandi:")} ${c.dim(path)}\n`);
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
  console.log(banner(loadConfig().model));
  console.log(
    [
      "  Foydalanish:",
      `    ${c.white("sovereign")}                 interaktiv rejim (chat + agent)`,
      `    ${c.white('sovereign "vazifa"')}        bitta topshiriq va chiq`,
      `    ${c.white("sovereign config")}          kalit va modelni sozlash`,
      `    ${c.white("sovereign help")}            yordam`,
      "",
      "  Interaktiv buyruqlar:",
      `    ${c.white("/model <id>")}   modelni almashtirish`,
      `    ${c.white("/cwd <path>")}   ish papkasini o'zgartirish`,
      `    ${c.white("/clear")}        suhbatni tozalash`,
      `    ${c.white("/exit")}         chiqish`,
      "",
      `  Kalit: ${c.dim("$OPENROUTER_API_KEY yoki")} ${c.dim(CONFIG_PATH)}`,
      "",
    ].join("\n"),
  );
}

// ---- interactive REPL -------------------------------------------------
async function repl() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  let config = await ensureKey(rl);
  let messages = initialMessages();

  console.log(banner(config.model));
  const confirm = await confirmer(rl);

  const promptStr = () => `${c.green("›")} `;
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
    if (input.startsWith("/model")) {
      const m = input.split(/\s+/)[1];
      if (m) {
        config = { ...config, model: m };
        saveConfig({ model: m });
        console.log(`  ${c.green("Model:")} ${c.indigo(m)}`);
      } else {
        console.log(`  ${c.dim("Joriy model:")} ${c.indigo(config.model)}`);
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

    messages.push({ role: "user", content: input });
    const { text, error } = await agentTurn({ messages, config, confirm });
    if (error) console.log(c.red(`\n  Xato: ${error}\n`));
    else printAnswer(text);
    process.stdout.write("  " + promptStr());
  }

  rl.close();
  console.log(c.dim("\n  Xayr! ⬡\n"));
}

// ---- one-shot ---------------------------------------------------------
async function oneShot(task) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const config = await ensureKey(rl);
  const confirm = await confirmer(rl);
  const messages = initialMessages();
  messages.push({ role: "user", content: task });
  console.log();
  const { text, error } = await agentTurn({ messages, config, confirm });
  if (error) console.log(c.red(`  Xato: ${error}`));
  else printAnswer(text);
  rl.close();
}

// ---- dispatch ---------------------------------------------------------
const cmd = args[0];
if (cmd === "config") await handleConfig();
else if (cmd === "help" || cmd === "--help" || cmd === "-h") handleHelp();
else if (cmd && !cmd.startsWith("-")) await oneShot(args.join(" "));
else await repl();
