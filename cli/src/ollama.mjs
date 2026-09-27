// Mahalliy model (Ollama) dvigateli — docs/INQUIRY.md §B.1.
//
// XAVFSIZLIK (qat'iy):
//  - Faqat loopback: OLLAMA_BASE o'zgarmas (v1'da sozlanmaydi, OLLAMA_HOST o'qilmaydi).
//  - Faqat 4 ta endpoint: /api/version, /api/tags, /api/show, /v1/chat/completions.
//    pull/delete/create/copy/push HECH QACHON chaqirilmaydi — model o'rnatish uchun
//    foydalanuvchiga `ollama pull <model>` buyrug'i ko'rsatiladi, xolos.
//  - `redirect: "error"` — loopback'dan boshqa xostga yo'naltirish ishlamaydi.
//  - Model nomi MODEL_NAME_RE bilan tekshiriladi (terminalga boshqaruv belgisi chiqmasin).
//  - Authorization sarlavhasi yuborilmaydi (Ollama'da auth yo'q; tokenimiz u yerga ketmasin).
//  - Javob hajmi cheklangan (readCapped) — buzilgan lokal servis xotirani to'ldira olmaydi.
//
// Desktop `desktop/electron/ollama.mjs` bilan bir xil API.

export const OLLAMA_BASE = "http://127.0.0.1:11434";
export const MODEL_NAME_RE = /^[A-Za-z0-9._:/-]{1,100}$/;

const ALLOWED_PATHS = new Set(["/api/version", "/api/tags", "/api/show", "/v1/chat/completions"]);
const MAX_META_BYTES = 4 * 1024 * 1024; // /api/tags, /api/show, /api/version
const MAX_JSON_BYTES = 16 * 1024 * 1024; // oqimsiz chat javobi
const CHAT_TIMEOUT_MS = 10 * 60_000; // CPU'da sekin — lekin cheksiz emas

/** Model nomi xavfsizmi (regex + ".." yo'q). */
export function isValidModelName(name) {
  return typeof name === "string" && MODEL_NAME_RE.test(name) && !name.includes("..");
}

/** Faqat ruxsat etilgan loopback URL'ni quradi — boshqasi uchun xato tashlaydi. */
function endpoint(path) {
  if (!ALLOWED_PATHS.has(path)) throw new Error(`Ollama: ruxsat etilmagan endpoint (${path})`);
  const u = new URL(path, OLLAMA_BASE);
  if (u.origin !== OLLAMA_BASE) throw new Error("Ollama: faqat loopback");
  return u.href;
}

/** Bir nechta AbortSignal'ni birlashtiradi (Node 20.3+ da AbortSignal.any). */
function anySignal(signals) {
  const list = signals.filter(Boolean);
  if (list.length <= 1) return list[0];
  if (typeof AbortSignal.any === "function") return AbortSignal.any(list);
  const ac = new AbortController();
  for (const s of list) {
    if (s.aborted) {
      ac.abort(s.reason);
      break;
    }
    s.addEventListener("abort", () => ac.abort(s.reason), { once: true });
  }
  return ac.signal;
}

async function localFetch(path, { method = "GET", body, timeoutMs, signal } = {}) {
  const init = {
    method,
    redirect: "error",
    headers: body !== undefined ? { "Content-Type": "application/json" } : {},
    signal: anySignal([signal, timeoutMs ? AbortSignal.timeout(timeoutMs) : null]),
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  return fetch(endpoint(path), init);
}

/** Javob tanasini `max` baytgacha o'qiydi; oshsa — xato. */
async function readCapped(res, max) {
  if (!res.body || typeof res.body.getReader !== "function") {
    const t = await res.text();
    if (t.length > max) throw new Error("Ollama: javob juda katta");
    return t;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let out = "";
  let bytes = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > max) {
      await reader.cancel().catch(() => {});
      throw new Error("Ollama: javob juda katta");
    }
    out += decoder.decode(value, { stream: true });
  }
  return out + decoder.decode();
}

async function readJson(res, max = MAX_META_BYTES) {
  return JSON.parse(await readCapped(res, max));
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Terminalga chiqadigan matn: boshqaruv va bidi belgilari olib tashlanadi. */
function cleanText(v, max) {
  return String(v).replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g, " ").slice(0, max);
}

function shortStr(v, max = 40) {
  return typeof v === "string" ? v.replace(/[^\x20-\x7E]/g, "").slice(0, max) : "";
}

/**
 * Ollama ishlayaptimi va qaysi modellar o'rnatilgan.
 * @returns {Promise<{available: boolean, version: string|null,
 *   models: {name: string, size: number, paramSize: string, quant: string, family: string}[]}>}
 */
export async function detect(timeoutMs = 800) {
  const empty = { available: false, version: null, models: [] };
  try {
    const [vRes, tRes] = await Promise.all([
      localFetch("/api/version", { timeoutMs }),
      localFetch("/api/tags", { timeoutMs }),
    ]);
    if (!vRes.ok && !tRes.ok) {
      await Promise.all([vRes.body?.cancel?.().catch(() => {}), tRes.body?.cancel?.().catch(() => {})]);
      return empty;
    }
    const v = vRes.ok ? await readJson(vRes).catch(() => ({})) : {};
    const t = tRes.ok ? await readJson(tRes).catch(() => ({})) : {};
    const raw = Array.isArray(t?.models) ? t.models : [];
    const models = [];
    for (const m of raw.slice(0, 500)) {
      const name = typeof m?.name === "string" ? m.name : typeof m?.model === "string" ? m.model : "";
      if (!isValidModelName(name)) continue; // g'alati nom — ko'rsatilmaydi va ishlatilmaydi
      const d = m.details ?? {};
      models.push({
        name,
        size: num(m.size),
        paramSize: shortStr(d.parameter_size, 16),
        quant: shortStr(d.quantization_level, 16),
        family: shortStr(d.family, 32),
      });
    }
    return { available: true, version: shortStr(v?.version, 32) || null, models };
  } catch {
    return empty;
  }
}

/**
 * Model imkoniyatlari (`/api/show`).
 * contextLength — modelning maksimal konteksti; numCtx — Modelfile'da `num_ctx` berilgan bo'lsa
 * (aks holda Ollama standart kichik oyna bilan ishlaydi — OLLAMA_CONTEXT_LENGTH tavsiya qilinadi).
 * known === false — ma'lumot olinmadi (Ollama o'chiq / model yo'q); qiymatlar standart.
 * @returns {Promise<{tools: boolean, vision: boolean, contextLength: number, numCtx: number, known: boolean}>}
 */
export async function capabilities(model, timeoutMs = 2500) {
  const none = { tools: false, vision: false, contextLength: 0, numCtx: 0, known: false };
  if (!isValidModelName(model)) return none;
  try {
    const res = await localFetch("/api/show", { method: "POST", body: { model }, timeoutMs });
    if (!res.ok) {
      await res.body?.cancel?.().catch(() => {});
      return none;
    }
    const data = await readJson(res);
    const caps = Array.isArray(data?.capabilities) ? data.capabilities : null;
    const template = typeof data?.template === "string" ? data.template : "";
    const tools = caps ? caps.includes("tools") : /\.Tools\b/.test(template);
    const vision = caps ? caps.includes("vision") : Boolean(data?.projector_info);
    let contextLength = 0;
    const info = data?.model_info && typeof data.model_info === "object" ? data.model_info : {};
    for (const [k, v] of Object.entries(info)) {
      if (k.endsWith(".context_length")) {
        contextLength = num(v);
        break;
      }
    }
    const m = /(?:^|\n)\s*num_ctx\s+(\d+)/.exec(typeof data?.parameters === "string" ? data.parameters : "");
    return { tools, vision, contextLength, numCtx: m ? num(m[1]) : 0, known: true };
  } catch {
    return none;
  }
}

/** Taxminiy token (belgi/3.5) — kesish byudjeti uchun yetarli. */
function approxTokens(m) {
  let chars = 0;
  if (typeof m.content === "string") chars += m.content.length;
  else if (Array.isArray(m.content)) for (const p of m.content) chars += typeof p?.text === "string" ? p.text.length : 1000;
  for (const tc of m.tool_calls ?? []) chars += String(tc?.function?.arguments ?? "").length + 40;
  return Math.ceil(chars / 3.5) + 4;
}

/**
 * Tarixni mahalliy model kontekstiga sig'diradi: barcha system xabarlari + eng oxirgi
 * navbatlar; kesma user xabaridan boshlanadi (egasiz `tool` xabari qolmasin).
 * Ollama oshiqcha kontekstni jim kesadi — shuning uchun bu yerda oldindan kesamiz.
 */
export function fitToContext(messages, contextTokens, reserveTokens = 1024) {
  if (!contextTokens || contextTokens <= 0) return messages;
  const budget = Math.max(512, contextTokens - reserveTokens);
  const system = messages.filter((m) => m.role === "system");
  const rest = messages.filter((m) => m.role !== "system");
  let used = system.reduce((s, m) => s + approxTokens(m), 0);
  let start = rest.length;
  for (let i = rest.length - 1; i >= 0; i--) {
    const t = approxTokens(rest[i]);
    if (used + t > budget && start < rest.length) break;
    used += t;
    start = i;
  }
  let tail = rest.slice(start);
  const firstUser = tail.findIndex((m) => m.role === "user");
  if (firstUser > 0) tail = tail.slice(firstUser);
  else if (firstUser === -1) {
    const lastUser = [...rest].reverse().find((m) => m.role === "user");
    const a = tail.findIndex((m) => m.role === "assistant");
    tail = a === -1 ? [] : tail.slice(a);
    if (lastUser) tail = [lastUser, ...tail];
  }
  return [...system, ...tail];
}

async function* sseData(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    if (buf.length > MAX_JSON_BYTES) throw new Error("Ollama: oqim qatori juda katta");
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

function argString(a) {
  if (typeof a === "string") return a;
  if (a && typeof a === "object") return JSON.stringify(a);
  return "";
}

/**
 * Mahalliy modeldan bitta javob (OpenAI-mos `/v1/chat/completions`).
 * @param {object} p
 * @param {string} p.model
 * @param {object[]} p.messages
 * @param {object[]} [p.tools]      bo'sh/yo'q bo'lsa — vositasiz (faqat suhbat)
 * @param {boolean} [p.stream=true]
 * @param {AbortSignal} [p.signal]
 * @param {(t: string) => void} [p.onText]
 * @param {number} [p.maxTokens=4096]
 * @param {number} [p.temperature=0.4]
 * @param {number} [p.contextLength] berilsa — tarix shu oynaga sig'diriladi
 * @returns {Promise<{message: object, toolCalls: object[], usage: object|null, model: string}>}
 */
export async function chat({ model, messages, tools, stream = true, signal, onText, maxTokens = 4096, temperature = 0.4, contextLength = 0 }) {
  if (!isValidModelName(model)) throw new Error("Mahalliy model nomi noto'g'ri");
  const sent = fitToContext(messages, contextLength, Math.min(maxTokens, 4096) + 256);
  const body = {
    model,
    messages: sent,
    temperature,
    max_tokens: maxTokens,
    stream: Boolean(stream),
    ...(tools?.length ? { tools, tool_choice: "auto" } : {}),
    ...(stream ? { stream_options: { include_usage: true } } : {}),
  };
  let res;
  try {
    res = await localFetch("/v1/chat/completions", { method: "POST", body, timeoutMs: CHAT_TIMEOUT_MS, signal });
  } catch (err) {
    if (signal?.aborted || err?.name === "AbortError") throw err;
    throw Object.assign(new Error("Ollama ishlamayapti (127.0.0.1:11434). `ollama serve` ni ishga tushiring."), { local: true, cause: err });
  }
  if (!res.ok) {
    let m = `${res.status}`;
    try {
      const j = JSON.parse(await readCapped(res, 64 * 1024));
      m = j?.error?.message ?? (typeof j?.error === "string" ? j.error : m);
    } catch {
      /* keep */
    }
    const hint = res.status === 404 ? ` — o'rnatish: ollama pull ${model}` : "";
    // `detail` — tilsiz xom Ollama xatosi (Cowork UI o'z tilida sarlavha beradi, o'zbekcha maslahatsiz).
    const detail = `Ollama: ${cleanText(m, 300)}`;
    throw Object.assign(new Error(`${detail}${hint}`), { status: res.status, local: true, detail });
  }

  if (!stream || !res.body) {
    const data = JSON.parse(await readCapped(res, MAX_JSON_BYTES));
    const msg = data?.choices?.[0]?.message ?? {};
    const toolCalls = (Array.isArray(msg.tool_calls) ? msg.tool_calls : []).map((tc, i) => ({
      id: typeof tc?.id === "string" && tc.id ? tc.id : `call_local_${i}`,
      type: "function",
      function: { name: String(tc?.function?.name ?? ""), arguments: argString(tc?.function?.arguments) },
    }));
    const content = typeof msg.content === "string" ? msg.content : "";
    if (content) onText?.(content);
    const message = { role: "assistant", content: content || null, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) };
    return { message, toolCalls, usage: data?.usage ?? null, model };
  }

  let content = "";
  const calls = [];
  let usage = null;
  for await (const data of sseData(res.body)) {
    if (data?.usage) usage = data.usage;
    const d = data?.choices?.[0]?.delta;
    if (!d) continue;
    if (typeof d.content === "string" && d.content) {
      content += d.content;
      onText?.(d.content);
    }
    for (const tc of Array.isArray(d.tool_calls) ? d.tool_calls : []) {
      // Ollama ba'zan `index`siz, to'liq chaqiruvni bitta bo'lakda yuboradi → yangi chaqiruv.
      const i = Number.isInteger(tc?.index) ? tc.index : calls.length;
      if (i < 0 || i > 64) continue;
      calls[i] = calls[i] || { id: "", type: "function", function: { name: "", arguments: "" } };
      if (tc.id) calls[i].id = String(tc.id);
      if (tc.function?.name) calls[i].function.name = String(tc.function.name);
      if (tc.function?.arguments != null) calls[i].function.arguments += argString(tc.function.arguments);
    }
  }
  const toolCalls = calls.filter(Boolean).map((tc, i) => (tc.id ? tc : { ...tc, id: `call_local_${i}` }));
  const message = { role: "assistant", content: content || null, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) };
  return { message, toolCalls, usage, model };
}

/** RAM/VRAM bo'yicha tavsiya jadvali (§B.1). Nomlar release oldidan ollama.com/library da tekshirilsin. */
export const RECOMMEND_TIERS = [
  {
    tier: 1,
    minRamGb: 0,
    minVramGb: 0,
    sizeGb: "2–3",
    models: ["qwen3:4b", "llama3.2:3b"],
    quality: "Oddiy suhbat, qisqa matn. Agent/kod vazifalarida tez-tez xato; tool-calling beqaror. O'zbek tili zaif.",
  },
  {
    tier: 2,
    minRamGb: 16,
    minVramGb: 8,
    sizeGb: "4.5–5.5",
    models: ["qwen2.5-coder:7b", "qwen3:8b", "llama3.1:8b"],
    quality: "Oddiy kod tahriri va tushuntirish — yaxshi; ko'p bosqichli agent vazifada bulut modellaridan sezilarli past. CPU'da ~5–12 token/s.",
  },
  {
    tier: 3,
    minRamGb: 32,
    minVramGb: 12,
    sizeGb: "9–14",
    models: ["qwen2.5-coder:14b", "qwen3:14b", "gpt-oss:20b"],
    quality: "Kundalik kod ishi uchun maqbul; murakkab refaktor/arxitekturada hali flagman darajasida emas.",
  },
  {
    tier: 4,
    minRamGb: 64,
    minVramGb: 24,
    sizeGb: "20",
    models: ["qwen2.5-coder:32b", "qwen3:32b"],
    quality: "Eng yaxshi mahalliy tajriba; baribir Claude/GPT flagmanlaridan past, sekinroq.",
  },
];

/**
 * Kompyuter xotirasiga mos modellar.
 * @param {number} totalRamGb   umumiy RAM (GB)
 * @param {number} [hasGpuVramGb=0] GPU VRAM (GB), bo'lmasa 0
 * @returns {{name: string, why: string, quality: string, tier: number, sizeGb: string}[]}
 */
export function recommend(totalRamGb, hasGpuVramGb = 0) {
  const ram = num(totalRamGb);
  const vram = num(hasGpuVramGb);
  let pick = RECOMMEND_TIERS[0];
  for (const t of RECOMMEND_TIERS) {
    if (ram >= t.minRamGb || (t.minVramGb && vram >= t.minVramGb)) pick = t;
  }
  const basis = vram >= pick.minVramGb && pick.minVramGb && ram < pick.minRamGb ? `${Math.round(vram)} GB VRAM` : `${Math.round(ram)} GB RAM`;
  const low = ram > 0 && ram < 8 && vram < 8;
  return pick.models.map((name) => ({
    name,
    tier: pick.tier,
    sizeGb: pick.sizeGb,
    why: `${basis} uchun mos (~${pick.sizeGb} GB, Q4)${low ? " — xotira kam, sekin ishlashi mumkin" : ""}`,
    quality: pick.quality,
  }));
}

const NETWORK_CODES = new Set([
  "ENOTFOUND",
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "ENETDOWN",
  "EPIPE",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
  "UND_ERR_HEADERS_TIMEOUT",
]);

/**
 * SOVEREIGN server xatosini zaxira qarori uchun tasniflaydi (§B.1 jadval).
 * Kirish: `Error` (runRound `status`, `retryAfter`, `code` qo'shadi) yoki
 * `{status, retryAfter, code}` obyekti. Mashina kodi (`code`, T14) statusdan ustun.
 * @returns {"user_limit"|"rate_limited"|"offline"|"server"|"auth"|null}
 */
export function classifyServerError(err) {
  if (!err || typeof err !== "object") return null;
  if (err.local) return null; // Ollama'ning o'z xatosi — zaxiraga qayta o'tish yo'q
  if (err.name === "AbortError") return null;
  const code = typeof err.code === "string" ? err.code : "";
  if (code === "user_limit") return "user_limit";
  if (code === "rate_limited") return "rate_limited";
  if (code === "region") return null;
  const status = Number(err.status);
  if (Number.isInteger(status) && status > 0) {
    if (status === 402) return "user_limit";
    if (status === 429) {
      const ra = err.retryAfter;
      const hasRa = ra !== undefined && ra !== null && String(ra).trim() !== "";
      return hasRa ? "rate_limited" : "user_limit";
    }
    if (status === 401 || status === 403) return "auth";
    if (status === 451 || status === 499) return null;
    if (status >= 500 && status <= 599) return "server";
    return null;
  }
  if (err.offline === true) return "offline";
  if (err.name === "TimeoutError") return "offline";
  const causeCode = typeof err.cause?.code === "string" ? err.cause.code : "";
  if (NETWORK_CODES.has(code) || NETWORK_CODES.has(causeCode)) return "offline";
  if (err.name === "TypeError" && /fetch failed|network|terminated/i.test(String(err.message))) return "offline";
  return null;
}
