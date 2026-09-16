import { TOOL_SCHEMA, runTool, contextSummary } from "./tools.mjs";
import { c, spinner } from "./ui.mjs";

const OPENROUTER = "https://openrouter.ai/api/v1/chat/completions";

const SYSTEM = [
  "Sen SOVEREIGN — terminalda ishlaydigan AI koding agentisan.",
  "Foydalanuvchining ish papkasida fayl va papkalar yarata, o'qiy va o'zgartira olasan (vositalar orqali).",
  "Foydalanuvchi qaysi tilda yozsa, o'sha tilda javob ber (asosan o'zbek tili).",
  "Kod yozganda toza, ishlaydigan va xavfsiz kod yoz. Fayl yaratish uchun write_file, papka uchun make_dir vositasidan foydalan.",
  "Rejangni qisqa ayt, keyin vositalar bilan bajarib bor. Har bir qadamda nima qilayotganingni bir gapda tushuntir.",
  "Faqat kerak bo'lganda vosita chaqir. Ishing tugagach, natijani qisqa xulosala.",
].join(" ");

/**
 * Runs one agent turn: sends the conversation, executes any tool calls,
 * loops until the model produces a final text answer. Returns the answer.
 */
export async function agentTurn({ messages, config, confirm, maxSteps = 12 }) {
  const seen = new Set();
  for (let step = 0; step < maxSteps; step++) {
    const spin = spinner(step === 0 ? "o'ylayapti..." : "davom etyapti...");
    let data;
    try {
      const res = await fetch(OPENROUTER, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.openrouterKey}`,
          "HTTP-Referer": "https://sovereign.ai",
          "X-Title": "SOVEREIGN CLI",
        },
        body: JSON.stringify({
          model: config.model,
          messages,
          tools: TOOL_SCHEMA,
          tool_choice: "auto",
          temperature: 0.4,
          max_tokens: 4096,
        }),
      });
      spin.stop();
      if (!res.ok) {
        const body = await res.text();
        let msg = `${res.status}`;
        try {
          msg = JSON.parse(body).error?.message ?? msg;
        } catch {
          /* keep */
        }
        return { error: msg };
      }
      data = await res.json();
    } catch (err) {
      spin.stop();
      return { error: err.message };
    }

    const msg = data.choices?.[0]?.message;
    if (!msg) return { error: "Bo'sh javob." };
    messages.push(msg);

    const calls = msg.tool_calls ?? [];
    if (!calls.length) {
      return { text: msg.content ?? "" };
    }

    // Execute each requested tool and feed results back.
    for (const call of calls) {
      let args = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        /* ignore */
      }
      const fp = `${call.function.name}:${JSON.stringify(args)}`;
      console.log(`  ${c.teal("▸")} ${c.dim(call.function.name)} ${c.gray(JSON.stringify(args).slice(0, 80))}`);
      let result;
      if (seen.has(fp)) {
        // Model is repeating an identical call — break the loop.
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
  return { text: "Ish yakunlandi (qadamlar chegarasi)." };
}

export function initialMessages() {
  return [
    { role: "system", content: SYSTEM },
    { role: "system", content: contextSummary() },
  ];
}
