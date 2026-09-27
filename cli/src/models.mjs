import { totalmem } from "node:os";
import { c } from "./ui.mjs";
import { detect, capabilities, recommend, isValidModelName } from "./ollama.mjs";

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

/** Mahalliy model identifikatori prefiksi: `/model local:qwen2.5-coder:7b`. */
export const LOCAL_PREFIX = "local:";

/** "local:<nom>" yoki "ollama:<nom>" → model nomi; aks holda null. */
export function parseLocalModelId(input) {
  const s = String(input ?? "").trim();
  const m = /^(?:local|ollama):(.+)$/i.exec(s);
  if (!m) return null;
  return isValidModelName(m[1]) ? m[1] : null;
}

/**
 * O'rnatilgan mahalliy modellar + (ixtiyoriy) har birining imkoniyatlari.
 * Faqat loopback (ollama.mjs); hech narsa yuklab olinmaydi.
 * @returns {Promise<{available: boolean, version: string|null, models: object[]}>}
 */
export async function fetchLocalModels({ withCaps = true, timeoutMs = 800 } = {}) {
  const d = await detect(timeoutMs);
  if (!d.available || !withCaps) return d;
  const list = d.models.slice(0, 16);
  const caps = await Promise.all(list.map((m) => capabilities(m.name, 1500)));
  return { ...d, models: list.map((m, i) => ({ ...m, ...caps[i] })) };
}

function gb(bytes) {
  return bytes > 0 ? (bytes / 1024 ** 3).toFixed(1) + " GB" : "";
}

/** "Mahalliy (Ollama)" bo'limi: o'rnatilgan modellar yoki o'rnatish ko'rsatmasi. */
export function printLocalModels(local, currentLocal = "") {
  console.log(`
  ${c.bold(c.white("Mahalliy (Ollama)"))}  ${c.dim("— kompyuteringizda, server tokeni sarflanmaydi")}
`);
  if (!local?.available) {
    const rec = recommend(totalmem() / 1024 ** 3, 0);
    console.log(`  ${c.dim("Ollama topilmadi (127.0.0.1:11434).")} ${c.dim("O'rnatish:")} ${c.white("https://ollama.com/download")}`);
    if (rec.length) {
      console.log(`  ${c.dim("Kompyuteringizga tavsiya:")} ${c.white("ollama pull " + rec[0].name)}  ${c.gray("— " + rec[0].why)}`);
      console.log(`  ${c.dim(rec[0].quality)}`);
    }
    console.log("");
    return;
  }
  if (!local.models.length) {
    const rec = recommend(totalmem() / 1024 ** 3, 0);
    console.log(`  ${c.dim("Ollama ishlayapti, lekin model o'rnatilmagan.")} ${c.dim("Buyruq:")} ${c.white("ollama pull " + (rec[0]?.name ?? "qwen2.5-coder:7b"))}
`);
    return;
  }
  for (const m of local.models) {
    const active = m.name === currentLocal;
    const mark = active ? c.green("●") : c.dim("○");
    const caps = [m.tools ? "🔧" : "", m.vision ? "👁" : ""].filter(Boolean).join(" ");
    const meta = [m.paramSize, m.quant, gb(m.size)].filter(Boolean).join(" · ");
    console.log(`  ${mark} ${c.white((LOCAL_PREFIX + m.name).padEnd(40))} ${c.gray(caps.padEnd(6))} ${c.dim(meta)}`);
  }
  const noTools = local.models.some((m) => m.tools === false);
  if (noTools) console.log(`
  ${c.dim("🔧 belgisiz modellar vositalarni (fayl/buyruq) qo'llamaydi — faqat suhbat rejimi.")}`);
  console.log(`
  ${c.dim("Tanlash:")} ${c.white("/model " + LOCAL_PREFIX + local.models[0].name)}   ${c.dim("· mahalliy model sifati bulut modellaridan past bo'lishi mumkin")}
`);
}

/**
 * @param {string} current     joriy server/OpenRouter model id
 * @param {object} [local]     fetchLocalModels() natijasi — berilsa "Mahalliy (Ollama)" bo'limi ham chiqadi
 * @param {string} [currentLocal] joriy mahalliy model nomi
 */
export function printModels(current, local, currentLocal = "") {
  console.log(`\n  ${c.bold(c.white("Modellar"))}  ${c.dim("(/model <id> yoki qisqa nom bilan)")}\n`);
  const autoOn = !current;
  console.log(`  ${autoOn ? c.green("●") : c.dim("○")} ${c.white("SOVEREIGN Auto".padEnd(22))} ${c.dim("/model auto".padEnd(38))}  ${c.gray("— ★ tavsiya: server o'zi eng mosini tanlaydi")}`);
  for (const m of CLI_MODELS) {
    const active = m.id === current;
    const mark = active ? c.green("●") : c.dim("○");
    console.log(`  ${mark} ${c.white(m.label.padEnd(22))} ${c.dim(m.id.padEnd(38))}  ${c.gray("— " + m.note)}`);
  }
  if (local) printLocalModels(local, currentLocal);
  console.log(`\n  ${c.dim("Misol:")} ${c.white("/model claude")}   yoki   ${c.white("/model openai/gpt-4o")}   yoki   ${c.white("/model " + LOCAL_PREFIX + "qwen2.5-coder:7b")}\n`);
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
  // Mahalliy model ("local:<nom>") — o'zgarishsiz qaytadi; chaqiruvchi parseLocalModelId bilan ajratadi.
  if (parseLocalModelId(input)) return input.trim();
  const q = input.trim().toLowerCase();
  const exact = CLI_MODELS.find((m) => m.id.toLowerCase() === q);
  if (exact) return exact.id;
  const byLabel = CLI_MODELS.find((m) => m.label.toLowerCase().includes(q));
  if (byLabel) return byLabel.id;
  const byId = CLI_MODELS.find((m) => m.id.toLowerCase().includes(q));
  return byId ? byId.id : input; // allow any raw OpenRouter id
}
