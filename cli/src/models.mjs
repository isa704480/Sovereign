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
  const autoOn = !current;
  console.log(`  ${autoOn ? c.green("●") : c.dim("○")} ${c.white("SOVEREIGN Auto".padEnd(22))} ${c.dim("/model auto".padEnd(38))}  ${c.gray("— ★ tavsiya: server o'zi eng mosini tanlaydi")}`);
  for (const m of CLI_MODELS) {
    const active = m.id === current;
    const mark = active ? c.green("●") : c.dim("○");
    console.log(`  ${mark} ${c.white(m.label.padEnd(22))} ${c.dim(m.id.padEnd(38))}  ${c.gray("— " + m.note)}`);
  }
  console.log(`\n  ${c.dim("Misol:")} ${c.white("/model claude")}   yoki   ${c.white("/model openai/gpt-4o")}\n`);
}

/** OmniRoute id — har doim "provider/model" ko'rinishida (slash bor). */
export function isOmniId(id) {
  return typeof id === "string" && id.includes("/") && !id.endsWith(":free");
}

/** Serverdan OmniRoute katalogini (1700+ model) qidirib oladi (oila yoki qidiruv). */
export async function fetchCatalog(config, q = "", limit = 40, family = "") {
  const base = (config.baseUrl || "https://soveregn.xyz").replace(/\/$/, "");
  const params = new URLSearchParams({ limit: String(limit) });
  if (q) params.set("q", q);
  if (family) params.set("family", family);
  const url = `${base}/api/models?${params.toString()}`;
  try {
    const res = await fetch(url, config.token ? { headers: { Authorization: `Bearer ${config.token}` } } : {});
    if (!res.ok) return { configured: false, total: 0, models: [] };
    return await res.json();
  } catch {
    return { configured: false, total: 0, models: [] };
  }
}

/** Oilalar ro'yxatini oladi (Cursor uslubi: Claude, Gemini, GPT...). */
export async function fetchFamilies(config) {
  const base = (config.baseUrl || "https://soveregn.xyz").replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/api/models?families=1`, config.token ? { headers: { Authorization: `Bearer ${config.token}` } } : {});
    if (!res.ok) return { configured: false, families: [] };
    return await res.json();
  } catch {
    return { configured: false, families: [] };
  }
}

/** Oilalar ro'yxatini chiroyli chiqaradi. */
export function printFamilies(data) {
  if (!data.configured) {
    console.log(`\n  ${c.amber("OmniRoute katalogi hozircha ulanmagan.")} ${c.dim("(server env sozlanmagan)")}\n`);
    return;
  }
  const fams = data.families ?? [];
  console.log(`\n  ${c.bold(c.white("Model oilalari"))}  ${c.dim(`(${fams.length} ta)`)}\n`);
  for (const f of fams) {
    const auto = f.auto ? c.dim("  · auto: ") + c.accent(f.auto) : "";
    console.log(`  ${c.accent("✦")} ${c.white(f.label.padEnd(20))} ${c.gray(String(f.count).padStart(4))}${auto}`);
  }
  console.log(`\n  ${c.dim("Ichini ko'rish:")} ${c.white("/models claude")}   ${c.dim("· qidirish:")} ${c.white("/models <so'z>")}   ${c.dim("· tanlash:")} ${c.white("/model <id>")}\n`);
}

/** Berilgan so'z oila kaliti/nomiga mos kelsa — oila kalitini qaytaradi. */
export function matchFamily(families, arg) {
  const q = arg.trim().toLowerCase();
  if (!q) return "";
  const byKey = families.find((f) => f.key.toLowerCase() === q);
  if (byKey) return byKey.key;
  const byLabel = families.find((f) => f.label.toLowerCase().startsWith(q) || f.label.toLowerCase().includes(q));
  return byLabel ? byLabel.key : "";
}

/** Katalog natijalarini chiroyli ro'yxat qilib chiqaradi. */
export function printCatalog(data, query, current) {
  if (!data.configured) {
    console.log(`\n  ${c.amber("OmniRoute katalogi hozircha ulanmagan.")} ${c.dim("(server env sozlanmagan)")}\n`);
    return;
  }
  const { total, models } = data;
  console.log(
    `\n  ${c.bold(c.white("OmniRoute modellari"))}  ${c.dim(query ? `"${query}" — ${total} ta topildi` : `${total} ta`)}\n`,
  );
  if (!models.length) {
    console.log(`  ${c.dim("Hech narsa topilmadi. Boshqa so'z bilan qidiring.")}\n`);
    return;
  }
  for (const m of models) {
    const active = m.id === current;
    const mark = active ? c.green("●") : c.dim("○");
    const caps = [m.tools ? "🔧" : "", m.vision ? "👁" : "", m.reasoning ? "🧠" : ""].filter(Boolean).join(" ");
    const ctx = m.context ? c.dim((m.context / 1000).toFixed(0) + "k") : "";
    console.log(`  ${mark} ${c.white(m.id.padEnd(42))} ${c.gray(caps.padEnd(6))} ${ctx}`);
  }
  console.log(`\n  ${c.dim("Tanlash:")} ${c.white("/model <id>")}   ${c.dim("(masalan /model " + (models[0]?.id ?? "auto/best-coding") + ")")}\n`);
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
