/**
 * Model id → uni yaratgan KOMPANIYA (vendor). PURE (tarmoq, env, server-only yo'q) —
 * server (judge.ts, verifier, CLI verify) va klient (VerifierPanel yorlig'i) bir xil
 * qoidadan foydalanadi. Test: npx tsx --conditions=react-server src/lib/ai/judge.test.ts
 *
 * region.ts'dagi `policyOwner`dan farqi: u "kimning mintaqa qoidasi amal qiladi" deydi
 * (ochiq og'irlikli gpt-oss → host qoidasi, "openweight"); bu yerda esa "modelni qaysi
 * kompaniya yaratgan" — gpt-oss OpenAI'niki, Gemma Google'niki. Mustaqil tekshiruv
 * qoidasi ("javobni yaratgan kompaniya o'zini tekshirmaydi") shu javobga tayanadi.
 */

export type Vendor =
  | "openai"
  | "anthropic"
  | "google"
  | "meta"
  | "alibaba"
  | "deepseek"
  | "moonshot"
  | "zhipu"
  | "mistral"
  | "xai"
  | "nvidia"
  | "minimax"
  | "perplexity"
  | "xiaomi"
  | "sovereign"
  | "unknown";

/** Kompaniya nomi (brend — tarjima qilinmaydi). "unknown" — UI o'zi tarjima qiladi. */
export const VENDOR_LABEL: Record<Vendor, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  meta: "Meta",
  alibaba: "Alibaba (Qwen)",
  deepseek: "DeepSeek",
  moonshot: "Moonshot AI (Kimi)",
  zhipu: "Zhipu AI (GLM)",
  mistral: "Mistral AI",
  xai: "xAI",
  nvidia: "NVIDIA",
  minimax: "MiniMax",
  perplexity: "Perplexity",
  xiaomi: "Xiaomi",
  sovereign: "SOVEREIGN (Tella)",
  unknown: "",
};

export function isVendor(v: unknown): v is Vendor {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(VENDOR_LABEL, v);
}

/**
 * Faqat xizmat ko'rsatuvchi (host / proksi) bo'la oladigan prefikslar — model yaratuvchisi
 * emas. "groq/openai/gpt-oss-20b" → "openai/gpt-oss-20b", "cloudflare/@cf/meta/llama-..."
 * → "meta/llama-...". "nvidia" — faqat undan keyin yana ikki bo'lak bo'lsa host (NIM:
 * "nvidia/meta/llama-3.3-70b-instruct"); "nvidia/nemotron-..." — NVIDIA'ning o'z modeli.
 */
const HOSTS = new Set([
  "openrouter",
  "omniroute",
  "groq",
  "cloudflare",
  "@cf",
  "@hf",
  "cerebras",
  "sambanova",
  "together",
  "fireworks",
  "deepinfra",
  "rsi",
  "llm7",
  "gateway",
  "experiential",
  "aihorde",
  "pollinations",
  "mock",
]);

/** Katalog id'lari — nomidan kompaniya ko'rinmaydiganlari (qolgani regex bilan tutiladi). */
const STATIC: Record<string, Vendor> = {
  "tella-2": "sovereign",
  "sonar-online": "perplexity",
  "sonar-pro-online": "perplexity",
};

/**
 * Tartib muhim: aniqroq qoida umumiyroqdan oldin. DeepSeek distill'lari ("deepseek-r1-
 * distill-llama/qwen") — DeepSeek; Nemotron (Llama asosli) — NVIDIA; gpt-oss — OpenAI.
 */
const RULES: [RegExp, Vendor][] = [
  [/(^|\/)tella/, "sovereign"],
  [/deepseek/, "deepseek"],
  [/nemotron|(^|\/)nvidia\//, "nvidia"],
  [/gemma|gemini|imagen|(^|\/)veo-?\d|nano-?banana|(^|\/)google\//, "google"],
  [/claude|anthropic/, "anthropic"],
  [/grok|(^|\/)x-ai\/|(^|\/)xai\//, "xai"],
  [/mistral|mixtral|ministral|magistral|codestral|devstral|pixtral|voxtral/, "mistral"],
  [/sonar|perplexity/, "perplexity"],
  [/qwen|qwq|tongyi|alibaba/, "alibaba"],
  [/glm|(^|\/)z-ai\/|(^|\/)zai(-org)?\/|zhipu/, "zhipu"],
  [/kimi|moonshot/, "moonshot"],
  [/minimax/, "minimax"],
  [/(^|\/)mimo|xiaomi/, "xiaomi"],
  [/llama|(^|\/)meta\//, "meta"],
  [/gpt|codex|(^|\/)o[1345](-|$)|dall-e|whisper|text-embedding|(^|\/)tts-|sora|(^|\/)openai\//, "openai"],
];

/** Host prefikslari va ":free" kabi qo'shimchalarsiz, kichik harfli id. */
export function bareModelId(modelId: string): string {
  let parts = (modelId ?? "").trim().toLowerCase().replace(/:[a-z0-9-]+$/, "").split("/").filter(Boolean);
  for (;;) {
    const head = parts[0];
    if (parts.length >= 2 && head && HOSTS.has(head)) parts = parts.slice(1);
    else if (parts.length >= 3 && head === "nvidia") parts = parts.slice(1);
    else break;
  }
  return parts.join("/");
}

/**
 * Model id (katalog-uslub, OpenRouter "vendor/model", OmniRoute "host/vendor/model",
 * Cloudflare "cloudflare/@cf/vendor/model", upstream javobidagi "Meta-Llama-3.3-70B")
 * → kompaniya. Katalog id'ni providerModel'ga aylantirish — judge.ts `vendorOf`.
 */
export function vendorOfId(modelId: string | null | undefined): Vendor {
  const raw = (modelId ?? "").trim().toLowerCase();
  if (!raw || raw === "auto" || raw === "auto/best-free") return "unknown";
  if (STATIC[raw]) return STATIC[raw];
  const id = bareModelId(raw);
  if (!id) return "unknown";
  if (STATIC[id]) return STATIC[id];
  for (const [re, vendor] of RULES) if (re.test(id)) return vendor;
  return "unknown";
}
