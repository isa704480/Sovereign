import { c } from "./ui.mjs";

/** Curated OpenRouter models for the CLI (direct mode). */
export const CLI_MODELS = [
  { id: "openai/gpt-4o-mini", label: "GPT-4o mini", note: "arzon, tez, tool-calling" },
  { id: "openai/gpt-4o", label: "GPT-4o", note: "kuchli ko'p modal" },
  { id: "openai/gpt-5.6-sol", label: "GPT-5.6 Sol", note: "yangi, kuchli" },
  { id: "anthropic/claude-sonnet-4.5", label: "Claude Sonnet 4.5", note: "kod va yozish" },
  { id: "anthropic/claude-sonnet-5", label: "Claude Sonnet 5", note: "yangi Sonnet" },
  { id: "anthropic/claude-opus-5", label: "Claude Opus 5", note: "eng kuchli" },
  { id: "google/gemini-3.5-flash", label: "Gemini 3.5 Flash", note: "tez, ko'p modal" },
  { id: "deepseek/deepseek-v4-pro-0813", label: "DeepSeek V4 Pro", note: "kodga kuchli" },
  { id: "x-ai/grok-4.6", label: "Grok 4.6", note: "suhbat" },
  { id: "qwen/qwen3.7-max", label: "Qwen 3.7 Max", note: "ko'p tilli" },
  { id: "z-ai/glm-5.2:free", label: "GLM 5.2 (tekin)", note: "tool-calling cheklangan" },
];

export function printModels(current) {
  console.log(`\n  ${c.bold(c.white("Modellar"))}  ${c.dim("(/model <id> yoki sovereign key bilan)")}\n`);
  for (const m of CLI_MODELS) {
    const active = m.id === current;
    const mark = active ? c.green("●") : c.dim("○");
    console.log(`  ${mark} ${c.white(m.label.padEnd(22))} ${c.dim(m.id)}  ${c.gray("— " + m.note)}`);
  }
  console.log(`\n  ${c.dim("Almashtirish:")} ${c.white("/model openai/gpt-4o")}\n`);
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
