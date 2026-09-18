import { c } from "./ui.mjs";

/**
 * Kod-agent uchun ideal modellar. Server-mode (account) da server bu ID'ni
 * o'zining eng mos providerga (Groq/OpenAI direct) yo'naltiradi. Direct-mode
 * (OpenRouter kaliti) bo'lsa xuddi shu OpenRouter ID sifatida ishlaydi.
 *
 * Tanlash mezoni: tool-calling + tezlik + arzon. Groq (llama-3.3-70b) dunyodagi
 * eng tez inference beradi (~500 tok/s) va tool-calling ideal ishlaydi.
 */
export const CLI_MODELS = [
  // ★ Kod agent uchun eng zo'ri (Groq direct, ~500 tok/s)
  { id: "meta-llama/llama-3.3-70b-instruct",   label: "Llama 3.3 70B",       note: "★ Groq — tez, tool-calling, kod" },
  { id: "qwen/qwen-2.5-coder-32b-instruct",    label: "Qwen 2.5 Coder 32B",  note: "★ kod uchun mutaxassis" },

  // OpenAI direct
  { id: "openai/gpt-4o-mini",                  label: "GPT-4o mini",         note: "arzon, tez, tool-calling" },
  { id: "openai/gpt-4o",                       label: "GPT-4o",              note: "kuchli ko'p modal, tool-calling" },

  // OpenRouter tekin modellar (bepul foydalanish uchun)
  { id: "google/gemini-2.0-flash-exp:free",    label: "Gemini 2.0 Flash",    note: "TEKIN, ko'p modal, tool-calling" },
  { id: "deepseek/deepseek-r1-distill-llama-70b:free", label: "DeepSeek R1 70B", note: "TEKIN, reasoning" },
  { id: "meta-llama/llama-3.3-70b-instruct:free", label: "Llama 3.3 70B (free)", note: "TEKIN OpenRouter" },
  { id: "google/gemma-2-9b-it:free",           label: "Gemma 2 9B",          note: "TEKIN, kichik, tez" },

  // Anthropic (agar OpenRouter'da balans bor bo'lsa)
  { id: "anthropic/claude-3.5-sonnet",         label: "Claude 3.5 Sonnet",   note: "premium kod (balans kerak)" },
  { id: "anthropic/claude-3.5-haiku",          label: "Claude 3.5 Haiku",    note: "arzon Anthropic" },
];

export function printModels(current) {
  console.log(`\n  ${c.bold(c.white("Modellar"))}  ${c.dim("(/model <id> yoki qisqa nom bilan)")}\n`);
  for (const m of CLI_MODELS) {
    const active = m.id === current;
    const mark = active ? c.green("●") : c.dim("○");
    console.log(`  ${mark} ${c.white(m.label.padEnd(22))} ${c.dim(m.id.padEnd(38))}  ${c.gray("— " + m.note)}`);
  }
  console.log(`\n  ${c.dim("Misol:")} ${c.white("/model claude")}   yoki   ${c.white("/model openai/gpt-4o")}\n`);
}

/** Resolve a short name or partial id to a full model id. */
export function resolveModelId(input) {
  const q = input.trim().toLowerCase();
  const exact = CLI_MODELS.find((m) => m.id.toLowerCase() === q);
  if (exact) return exact.id;
  const byLabel = CLI_MODELS.find((m) => m.label.toLowerCase().includes(q));
  if (byLabel) return byLabel.id;
  const byId = CLI_MODELS.find((m) => m.id.toLowerCase().includes(q));
  return byId ? byId.id : input; // allow any raw OpenRouter id
}
