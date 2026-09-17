import { c } from "./ui.mjs";

/**
 * OpenRouter'da HAQIQIY mavjud modellar (2026 yil boshi). Ba'zilari tekin, ba'zilari
 * balansingizga qarab hisoblanadi. Tool-calling qo'llab-quvvatlaydiganlarga * qo'yildi.
 */
export const CLI_MODELS = [
  { id: "openai/gpt-4o-mini",              label: "GPT-4o mini",        note: "arzon, tez, tool-calling ★" },
  { id: "openai/gpt-4o",                   label: "GPT-4o",             note: "kuchli ko'p modal, tool-calling ★" },
  { id: "anthropic/claude-3.5-sonnet",     label: "Claude 3.5 Sonnet",  note: "kod va tahlil, tool-calling ★" },
  { id: "anthropic/claude-3.5-haiku",      label: "Claude 3.5 Haiku",   note: "arzon Anthropic, tool-calling ★" },
  { id: "google/gemini-2.0-flash-001",     label: "Gemini 2.0 Flash",   note: "tez, ko'p modal, tekin qismi bor" },
  { id: "google/gemini-flash-1.5",         label: "Gemini 1.5 Flash",   note: "tez, katta kontekst" },
  { id: "deepseek/deepseek-chat",          label: "DeepSeek V3",        note: "kodga kuchli, arzon" },
  { id: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B",    note: "ochiq model, kuchli" },
  { id: "x-ai/grok-2-1212",                label: "Grok 2",             note: "suhbat, tahlil" },
  { id: "qwen/qwen-2.5-72b-instruct",      label: "Qwen 2.5 72B",       note: "ko'p tilli, kod" },
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
