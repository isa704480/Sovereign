import { TOOL_SCHEMA, runTool, contextSummary } from "./tools.mjs";
import { c, spinner } from "./ui.mjs";
import { memorySystemMessage } from "./memory.mjs";

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

// Server limits (/api/cli/chat): 60 messages, 40k chars per message.
const TOOL_RESULT_MAX = 24_000;
const HISTORY_MAX = 44;

/**
 * Keeps every system message plus the most recent turns, starting at a user
 * message so no tool result is sent without the assistant call that produced it.
 */
function forServer(messages) {
  const system = messages.filter((m) => m.role === "system");
  const rest = messages.filter((m) => m.role !== "system");
  if (rest.length <= HISTORY_MAX) return messages;
  let tail = rest.slice(-HISTORY_MAX);
  const firstUser = tail.findIndex((m) => m.role === "user");
  if (firstUser > 0) tail = tail.slice(firstUser);
  return [...system, ...tail];
}

/** One model round. Returns the assistant message + parsed tool calls. Streams text via onText. */
async function runRound(messages, config, onText) {
  if (config.token) {
    const res = await fetch(`${config.baseUrl.replace(/\/$/, "")}/api/cli/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.token}` },
      body: JSON.stringify({ messages: forServer(messages), tools: TOOL_SCHEMA }),
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
      // Apple-style javob boshi: yagona kul indent + kichik accent belgi
      process.stdout.write("\n   " + c.accent("◆") + "  ");
      printedHeader = true;
    }
    // Faqat matnni yumshoq indent bilan, chegara chizmasdan
    process.stdout.write(t.replace(/\n/g, "\n      "));
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
      process.stdout.write("\n\n");
      return { done: true };
    }

    // Model asked for tools — narrate & run each, then loop.
    if (printedHeader) process.stdout.write("\n");
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
      messages.push({ role: "tool", tool_call_id: call.id, content: String(result).slice(0, TOOL_RESULT_MAX) });
    }
  }
  return { done: true };
}

/** Bitta javob — vositalarsiz, oqimsiz. Parallel rejim uchun. */
async function askOnce(messages, config, maxTokens = 900) {
  if (config.token) {
    const res = await fetch(`${config.baseUrl.replace(/\/$/, "")}/api/cli/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.token}` },
      body: JSON.stringify({ messages: forServer(messages) }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `${res.status}`);
    const { message } = await res.json();
    return message?.content ?? "";
  }
  const res = await fetch(OPENROUTER, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.openrouterKey}`,
      "HTTP-Referer": "https://sovhq.vercel.app",
      "X-Title": "SOVEREIGN CLI",
    },
    body: JSON.stringify({ model: config.model, messages, temperature: 0.8, max_tokens: maxTokens }),
  });
  if (!res.ok) throw new Error(JSON.parse(await res.text()).error?.message ?? `${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

/**
 * Parallel rejim: bitta vazifani bir nechta mustaqil "ishchi" bir vaqtda
 * ko'rib chiqadi, keyin natijalar bitta yechimga birlashtiriladi. Ishchilar
 * fayl yozmaydi (vositalarsiz) — shuning uchun bir-birining ishini buzmaydi.
 */
export async function swarm({ task, count, config, onProgress }) {
  const n = Math.max(2, Math.min(8, count || 3));
  const angles = [
    "eng sodda va tez yechim",
    "eng ishonchli, chegara holatlarini hisobga olgan yechim",
    "eng tejamkor (kam kod, kam bog'liqlik) yechim",
    "xavfsizlik nuqtai nazaridan yechim",
    "kengaytiriladigan arxitektura nuqtai nazaridan yechim",
    "eng tezkor ishlash (performance) nuqtai nazaridan yechim",
    "test qilish oson bo'lgan yechim",
    "yangi boshlovchi tushunadigan yechim",
  ];

  const workers = Array.from({ length: n }, (_, i) =>
    askOnce(
      [
        { role: "system", content: `Sen SOVEREIGN ishchi #${i + 1}san. Yondashuv: ${angles[i % angles.length]}. Qisqa va aniq yoz (maks 250 so'z).` },
        { role: "user", content: task },
      ],
      config,
      700,
    )
      .then((text) => {
        onProgress?.(i, true);
        return { i, text };
      })
      .catch((err) => {
        onProgress?.(i, false, err.message);
        return { i, text: "", error: err.message };
      }),
  );

  const results = await Promise.all(workers);
  const good = results.filter((r) => r.text.trim());
  if (!good.length) return { error: results[0]?.error ?? "Hech bir ishchi javob bermadi" };

  const merged = await askOnce(
    [
      {
        role: "system",
        content:
          "Sen SOVEREIGN bosh muhandisisan. Quyida bir vazifa bo'yicha bir nechta mustaqil yechim bor. " +
          "Ularni tahlil qil, eng yaxshi g'oyalarni birlashtirib YAGONA yakuniy yechim ber. " +
          "Qaysi ishchidan nima olganingni bir qatorda ayt.",
      },
      { role: "user", content: `VAZIFA: ${task}\n\n${good.map((r) => `--- ISHCHI #${r.i + 1} ---\n${r.text}`).join("\n\n")}` },
    ],
    config,
    1200,
  ).catch((err) => `Birlashtirishda xato: ${err.message}`);

  return { results: good, merged };
}

export function initialMessages(config) {
  const base = [
    { role: "system", content: SYSTEM },
    { role: "system", content: contextSummary() },
  ];
  const mem = config ? memorySystemMessage(config) : null;
  if (mem) base.push(mem);
  return base;
}
