import { TOOL_SCHEMA, runTool, contextSummary } from "./tools.mjs";
import { c, spinner } from "./ui.mjs";

const OPENROUTER = "https://openrouter.ai/api/v1/chat/completions";

const SYSTEM = [
  "Sen SOVEREIGN — terminalda ishlaydigan AI koding agentisan.",
  "Foydalanuvchining ish papkasida fayl va papkalar yarata, o'qiy va o'zgartira olasan (vositalar orqali).",
  "Foydalanuvchi qaysi tilda yozsa, o'sha tilda javob ber (asosan o'zbek tili).",
  "MUHIM: har bir qadamda nima qilayotganingni QISQA gap bilan tushuntirib bor — avval rejangni ayt, keyin vositani chaqir.",
  "Masalan: 'Avval package.json yarataman, keyin src papkasini ochaman.' — keyin write_file/make_dir chaqir.",
  "Kod toza, ishlaydigan va xavfsiz bo'lsin. Fayl uchun write_file, papka uchun make_dir vositasidan foydalan.",
  "Foydalanuvchi rasm biriktirsa — uni ko'rib, tavsifla; PDF/matn biriktirsa — mazmunini o'qib xulosa qil.",
  "Ish tugagach, nima qilganingni 1-2 gapda xulosala.",
].join(" ");

/** Human, Uzbek description of a tool call — printed as a step line. */
function describe(name, args) {
  switch (name) {
    case "write_file":
      return `${c.green("✎")} ${c.white(args.path)} ${c.dim("faylini yozyapman")}`;
    case "make_dir":
      return `${c.green("📁")} ${c.white(args.path)} ${c.dim("papkasini yaratyapman")}`;
    case "read_file":
      return `${c.teal("📖")} ${c.white(args.path)} ${c.dim("faylini o'qiyapman")}`;
    case "list_dir":
      return `${c.teal("📂")} ${c.dim("papkani ko'zdan kechiryapman")}`;
    case "run_command":
      return `${c.amber("▶")} ${c.white(args.command)} ${c.dim("buyrug'ini bajaryapman")}`;
    default:
      return `${c.teal("▸")} ${c.dim(name)}`;
  }
}

async function* sseLines(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const raw of lines) {
      const line = raw.trim();
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") return;
      try {
        yield JSON.parse(data);
      } catch {
        /* keep */
      }
    }
  }
}

async function typeOut(text, onText) {
  // Account mode returns full text — reveal it in small chunks for a live feel.
  const chunks = text.match(/\S+\s*|\s+/g) ?? [text];
  for (const ch of chunks) {
    onText(ch);
    await new Promise((r) => setTimeout(r, 12));
  }
}

/** One model round. Returns the assistant message + parsed tool calls. Streams text via onText. */
async function runRound(messages, config, onText) {
  if (config.token) {
    const res = await fetch(`${config.baseUrl.replace(/\/$/, "")}/api/cli/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.token}` },
      body: JSON.stringify({ messages, tools: TOOL_SCHEMA }),
    });
    if (!res.ok) {
      let m = `${res.status}`;
      try {
        m = (await res.json()).error ?? m;
      } catch {
        /* keep */
      }
      throw new Error(m);
    }
    const { message } = await res.json();
    const toolCalls = message.tool_calls ?? [];
    if (message.content) await typeOut(message.content, onText);
    return { message, toolCalls };
  }

  // Direct OpenRouter — true token streaming with low-balance auto-retry.
  const send = async (maxTokens) => fetch(OPENROUTER, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.openrouterKey}`,
      "HTTP-Referer": "https://sovhq.vercel.app",
      "X-Title": "SOVEREIGN CLI",
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      tools: TOOL_SCHEMA,
      tool_choice: "auto",
      temperature: 0.4,
      max_tokens: maxTokens,
      stream: true,
    }),
  });
  let res = await send(4096);
  if (!res.ok || !res.body) {
    let m = `${res.status}`;
    try {
      m = JSON.parse(await res.text()).error?.message ?? m;
    } catch {
      /* keep */
    }
    // "You requested up to N tokens, but can only afford M." — kaliting balansi
    // past. M-64 gacha kamaytirib qayta urinamiz — user oddiy javob ololsin.
    const afford = /can only afford (\d+)/i.exec(m);
    if (afford) {
      const allowed = Math.max(256, Number(afford[1]) - 64);
      res = await send(allowed);
      if (!res.ok || !res.body) {
        let m2 = `${res.status}`;
        try { m2 = JSON.parse(await res.text()).error?.message ?? m2; } catch { /* keep */ }
        throw new Error(m2 + "  (OpenRouter balansingiz juda past — https://openrouter.ai/settings/credits)");
      }
    } else {
      throw new Error(m);
    }
  }

  let content = "";
  const calls = [];
  for await (const data of sseLines(res.body)) {
    const d = data.choices?.[0]?.delta;
    if (!d) continue;
    if (d.content) {
      content += d.content;
      onText(d.content);
    }
    for (const tc of d.tool_calls ?? []) {
      const i = tc.index ?? 0;
      calls[i] = calls[i] || { id: "", type: "function", function: { name: "", arguments: "" } };
      if (tc.id) calls[i].id = tc.id;
      if (tc.function?.name) calls[i].function.name = tc.function.name;
      if (tc.function?.arguments) calls[i].function.arguments += tc.function.arguments;
    }
  }
  const toolCalls = calls.filter(Boolean);
  const message = { role: "assistant", content: content || null, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) };
  return { message, toolCalls };
}

export async function agentTurn({ messages, config, confirm, maxSteps = 14 }) {
  const seen = new Set();
  let printedHeader = false;
  const write = (t) => {
    if (!printedHeader) {
      // Uslubli AI javob boshi: markazlashtirilgan ⬡ + rangli chegara
      process.stdout.write("\n  " + c.indigo("╭") + c.indigo("─") + c.indigo(" ⬡ SOVEREIGN ") + c.indigo("─".repeat(2)) + "\n  " + c.indigo("│") + "  ");
      printedHeader = true;
    }
    process.stdout.write(t.replace(/\n/g, "\n  " + c.indigo("│") + "  "));
  };

  for (let step = 0; step < maxSteps; step++) {
    const spin = spinner(step === 0 ? "o'ylayapti..." : "davom etyapti...");
    let round;
    try {
      let first = true;
      round = await runRound(messages, config, (t) => {
        if (first) {
          spin.stop();
          first = false;
        }
        write(t);
      });
      if (first) spin.stop();
    } catch (err) {
      spin.stop();
      return { error: err.message };
    }

    messages.push(round.message);

    if (!round.toolCalls.length) {
      if (printedHeader) process.stdout.write("\n  " + c.indigo("╰" + "─".repeat(3)) + "\n\n");
      else process.stdout.write("\n");
      return { done: true };
    }

    // Model asked for tools — narrate & run each, then loop.
    if (printedHeader) process.stdout.write("\n  " + c.indigo("│") + "\n");
    printedHeader = false;
    for (const call of round.toolCalls) {
      let args = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        /* ignore */
      }
      const fp = `${call.function.name}:${JSON.stringify(args)}`;
      console.log("  " + describe(call.function.name, args));
      let result;
      if (seen.has(fp)) {
        result = "Bu amal allaqachon bajarilgan. Boshqa qadamga o't yoki ishni yakunla.";
      } else {
        seen.add(fp);
        try {
          result = await runTool(call.function.name, args, confirm);
        } catch (err) {
          result = `XATO: ${err.message}`;
        }
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: String(result).slice(0, 60_000) });
    }
  }
  return { done: true };
}

export function initialMessages() {
  return [
    { role: "system", content: SYSTEM },
    { role: "system", content: contextSummary() },
  ];
}
