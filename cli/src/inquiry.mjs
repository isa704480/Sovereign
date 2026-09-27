// "Chuqur so'rash" (Deep Inquiry) — CLI tomoni (docs/INQUIRY.md §A.9) + mahalliy model zaxirasi taklifi (§B.1).
//
// Oqim: yangi vazifaning BIRINCHI xabarida `POST /api/cli/inquiry` (rejalashtirish bosqichi) chaqiriladi.
// Server pre-gate → triage → deterministik siyosat qiladi va `{decision, questions, addendum, ...}` qaytaradi.
//  - `answer`          → addendum (bo'sh bo'lmasa) javob modeliga system xabar sifatida qo'shiladi.
//  - `ask`             → terminalda raqamlangan savollar; javoblar birinchi user xabariga `Aniqlashtirish:`
//                        bloki sifatida qo'shiladi va server qayta chaqiriladi (round+1, ko'pi bilan 2 raund).
//                        Enter — taxmin bilan davom (server bergan "skipped" addendum ishlatiladi).
//  - `answer_then_ask` → javob darhol; savollar javobdan keyin ixtiyoriy aniqlashtirish sifatida ko'rsatiladi.
//
// So'ralmaydi (serverga murojaat ham yo'q): --print/--json, stdin TTY emas, --yes, --no-ask,
// config.inquiry=off, suhbatning birinchi xabari emas. Full auto — faqat `blocking` savol (server hal qiladi).
// Token yo'q (OpenRouter) yoki mahalliy model (Ollama) → faqat deterministik tekshiruv (favqulodda holat).
//
// XAVFSIZLIK: serverdan kelgan har qanday matn (LLM yozgan savollar) terminalga chiqishdan oldin ANSI/boshqaruv/
// bidi belgilaridan tozalanadi va uzunligi cheklanadi. So'rovga faqat foydalanuvchi yozgan matn, fayl NOMLARI va
// papka tuzilmasi ketadi (fayl mazmuni emas). Xato/taymaut → hech narsa so'ralmaydi (fail-open).

import { totalmem } from "node:os";
import { recommend, isValidModelName } from "./ollama.mjs";
import { fetchLocalModels } from "./models.mjs";

export const INQUIRY_PATH = "/api/cli/inquiry";
/** Server triage qattiq chegarasi 1200 ms + tarmoq; oshsa — savolsiz davom. */
export const INQUIRY_TIMEOUT_MS = 3000;
export const MAX_QUESTION_ROUNDS = 2;
const MAX_MESSAGES = 8;
const MAX_MESSAGE_CHARS = 8000;
const MAX_CONTEXT_CHARS = 4000;
const MAX_ASKED_SLOTS = 20;
const MAX_ANSWER_CHARS = 400;
const MAX_ADDENDUM_CHARS = 8000;
const MAX_RESPONSE_BYTES = 256 * 1024;

const DECISIONS = new Set(["answer", "ask", "answer_then_ask"]);
const KINDS = new Set(["single", "multi", "text"]);
const LANGS = new Set(["uz", "uz-cyrl", "ru", "en"]);
const INQUIRY_MODES = new Set(["auto", "always", "off"]);

export const DOMAIN_LABEL = {
  legal: "huquq",
  medical: "tibbiyot",
  financial: "moliya",
  code: "kod",
  business: "biznes",
  personal: "shaxsiy",
  education: "ta'lim",
  creative: "ijodiy",
  general: "umumiy",
};
const STAKES_LABEL = { high: "yuqori xavf", medium: "o'rta xavf", low: "past xavf" };
const PROFESSIONAL_NOTE = {
  lawyer: "Aniq ish bo'yicha litsenziyali advokat bilan maslahatlashing.",
  doctor: "Bu tashxis emas — shifokorga murojaat qiling.",
  financial_advisor: "Shaxsiy investitsiya qarori uchun litsenziyali moliyaviy maslahatchi kerak.",
};

// ── Matn yordamchilari ──────────────────────────────────────────────────────

/**
 * Terminalga chiqadigan (tashqi manbadan kelgan) matn: ANSI/OSC ketma-ketliklari, C0/C1 boshqaruv va
 * bidi belgilari olib tashlanadi, bo'shliqlar yig'iladi, `max` belgigacha kesiladi.
 */
export function cleanTerm(v, max = 200) {
  if (typeof v !== "string") return "";
  const s = v
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)?/g, " ") // OSC (havola, sarlavha)
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, " ") // CSI
    .replace(/\x1b./g, " ")
    .replace(/[\x00-\x1f\x7f-\x9f​-‏‪-‮⁠-⁩﻿]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

/** Xabar mazmunidan foydalanuvchi YOZGAN matn (biriktirilgan fayl mazmuni emas) va fayl nomlari. */
export function splitUserContent(content) {
  if (typeof content === "string") return { text: content, files: [] };
  if (!Array.isArray(content)) return { text: "", files: [] };
  const files = [];
  const texts = [];
  for (const p of content) {
    if (!p || typeof p !== "object") continue;
    if (p.type === "image_url") {
      files.push("rasm");
      continue;
    }
    if (p.type !== "text" || typeof p.text !== "string") continue;
    const m = /^\[(?:FAYL|PDF(?: fayl biriktirildi)?):?\s*([^\]\n]{1,200}?)(?:\.\s[^\]\n]*)?\]/.exec(p.text);
    if (m) files.push(m[1].trim());
    else texts.push(p.text);
  }
  // readAttachment qismlari avval, foydalanuvchi matni — oxirida.
  return { text: texts.length ? texts[texts.length - 1] : "", files };
}

/** Foydalanuvchi tili (so'rovdagi `lang`): kirill — uz-cyrl/ru; lotin — uz/en. CLI standarti — uz. */
export function detectLang(text) {
  const t = String(text ?? "");
  const cyr = (t.match(/[Ѐ-ӿ]/g) || []).length;
  const lat = (t.match(/[A-Za-z]/g) || []).length;
  if (cyr > lat) {
    if (/[ўқғҳЎҚҒҲ]/.test(t)) return "uz-cyrl";
    // ў/қ/ғ/ҳ siz kirillcha o'zbekcha ("Салом, шартнома ёзиб бер") — tez-tez so'zlar bo'yicha (R2-6).
    const words = (re) => (t.match(re) || []).length;
    const B = "(?<![\\p{L}])", E = "(?![\\p{L}])";
    const uz = words(new RegExp(`${B}(?:бу|ва|учун|керак|нима|нега|билан|ёки|эмас|бор|салом|менга|мен|сиз|сизнинг|қилиб|бериб|ёзиб|бер|қил|ёз|ҳам|лекин|агар|жуда|яна|шу|борми|керакми|беринг|ёзинг|тузиб|тузатиб|тушунтир)${E}`, "giu"));
    const ru = words(new RegExp(`${B}(?:и|не|что|как|это|для|мне|или|пожалуйста|вы|ваш|какой|нужно|надо|есть|меня|мой|если|почему|когда|где|сделай|напиши|помоги|можно|ли)${E}`, "giu")) + words(/[ыщЫЩ]/g);
    return uz > ru ? "uz-cyrl" : "ru";
  }
  if (!lat) return "uz";
  if (/[oOgG][ʻ'‘’`]/.test(t)) return "uz";
  if (/\b(va|uchun|qanday|qil|qiling|qilib|kerak|nima|nega|menga|bilan|yoz|yarat|tuzat|emas|ham|qayer|qachon|bormi|yo'q|iltimos|salom)\b/i.test(t)) return "uz";
  if (/\b(the|and|is|are|what|how|why|please|with|for|my|should|can|could|this|that|write|create|build|explain|help)\b/i.test(t)) return "en";
  return "uz";
}

// ── Favqulodda holat (mahalliy, deterministik — token yo'q / Ollama rejimi) ────
// src/lib/ai/inquiry/playbooks.ts EMERGENCY_RE ning qisqa nusxasi (CLI alohida paket, TS'ni import qilolmaydi).

function norm(s) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[ʻʼ‘’`´]/g, "'")
    .replace(/ё/g, "е");
}
const B = "(?<![\\p{L}])";
const EMERGENCY_PATTERNS = [
  "ko'kra(?:g|k)\\p{L}* (?:qattiq |kuchli )?og'ri|yurag\\p{L}* (?:qattiq |kuchli )?(?:og'ri|sanchi)",
  "кўкра(?:г|к)\\p{L}* (?:қаттиқ |кучли )?оғри|юраг\\p{L}* (?:қаттиқ |кучли )?(?:оғри|санчи)",
  "бол\\p{L}* в (?:груди|сердце)|грудь болит|болит (?:в )?груд|давит (?:в )?груд|сердечный приступ|инфаркт",
  "chest (?:pain|hurts|pressure|tightness)|pain in (?:my |the )?chest|heart attack",
  "nafas ol(?:a ?olmay|ish qiyin)|nafasim qis|bo'g'il(?:ib|yap)",
  "нафас ол(?:а ?олмай|иш қийин)|нафасим қис|бўғил(?:иб|яп)",
  "не могу дышать|задыха|трудно дышать|не хватает воздуха",
  "can'?t breathe|cannot breathe|trouble breathing|struggling to breathe|not breathing|choking",
  "insult (?:bo'l|ur|belgi)|(?:yuz|qo'l)\\p{L}* (?:bir tomoni )?(?:uvishib|uvishyapti|qiyshay)",
  "инсульт|(?:юз|қўл)\\p{L}* (?:бир томони )?(?:увишиб|увишяпти|қийшай)",
  "неме(?:ет|ют) (?:левая |правая )?(?:рука|нога|лицо|половина)|онемел\\p{L}* (?:рука|лицо)|перекосило лицо",
  "(?:having|had|has|signs of|symptoms of) (?:a )?stroke(?!\\p{L})|stroke symptoms|face (?:is )?droop|slurred speech",
  "qon ketyapti|ko'p qon ket|qon to'xtamay",
  "қон кетяпти|кўп қон кет|қон тўхтамай",
  "сильное кровотечение|кровь не останавлива|кровотечение не",
  "heavy bleeding|bleeding (?:a lot|heavily|badly|won'?t stop)|losing a lot of blood",
  "hushidan ket|hushsiz|zaharlan",
  "ҳушидан кет|ҳушсиз|заҳарлан",
  "потерял\\p{L}* сознание|без сознания|отравил|передозир",
  "unconscious|passed out|overdos|poisoned",
  "o'zimni o'ldir|o'z jonimga qasd|o'z joniga qasd|yashagim kelmay|o'lgim kel|o'zimga zarar",
  "ўзимни ўлдир|ўз жонимга қасд|ўз жонига қасд|яшагим келмай|ўлгим кел|ўзимга зарар",
  "покончить с собой|суицид|хочу умереть|убить себя|не хочу жить|покончу с",
  "kill myself|suicid|end my life|want to die|don'?t want to live|hurt myself|self[- ]harm",
].map((p) => new RegExp(`${B}(?:${p})`, "iu"));

export function isEmergencyText(text) {
  const t = norm(text);
  return Boolean(t) && EMERGENCY_PATTERNS.some((re) => re.test(t));
}

/** src/lib/ai/inquiry/prompt.ts EMERGENCY_FIRST bilan bir xil ma'no (model uchun, inglizcha). */
export const EMERGENCY_FIRST = [
  "EMERGENCY FIRST: the user's message may describe an emergency.",
  "Your FIRST line must tell them to call emergency services now (Uzbekistan: 103 ambulance, 112 general; elsewhere their local emergency number) and give the one most important immediate action.",
  "If self-harm or suicide is mentioned: respond with warmth, urge them to contact emergency services or a trusted person right now, and do not leave them alone with the question.",
  "Then give short, safe guidance. Do NOT ask clarifying questions before this guidance.",
].join(" ");

const FULL_AUTO_BLOCKING_NOTE =
  "INQUIRY: a blocking fact for this task was NOT provided by the user. Do not perform irreversible or external actions " +
  "(deploy, delete, push, publish, migrations on real data) based on a guess — do the safe parts, state your assumptions first, " +
  "and ask for the missing fact at the end.";

// ── Qaror: so'raymizmi? ─────────────────────────────────────────────────────

/**
 * Bu navbatda chuqur so'rash qanday ishlaydi.
 * @param {object} p
 * @param {object} p.flags        parseArgs() flaglari (print, json, yes, noAsk)
 * @param {object} p.config       loadConfig() (+ runtime `local`)
 * @param {boolean} p.interactive stdin TTY va savol berish mumkin (REPL / oneShot)
 * @param {boolean} p.firstMessage suhbatning (yoki /clear dan keyingi) birinchi xabari
 * @returns {{mode: "server"|"local"|"none", ask: boolean, reason: string}}
 *   server — /api/cli/inquiry chaqiriladi; local — faqat deterministik (favqulodda) tekshiruv; none — hech narsa.
 *   `ask` — savol berish mumkinmi (false bo'lsa server ham chaqirilmaydi, faqat mahalliy tekshiruv).
 */
export function inquiryPlan({ flags = {}, config = {}, interactive = false, firstMessage = false }) {
  if (!firstMessage) return { mode: "none", ask: false, reason: "not_first" };
  const local = { mode: "local", ask: false };
  if (config.inquiry === "off") return { ...local, reason: "off" };
  if (flags.print) return { ...local, reason: "print" };
  if (flags.json) return { ...local, reason: "json" };
  if (!interactive) return { ...local, reason: "non_tty" };
  if (flags.yes) return { ...local, reason: "yes" };
  if (flags.noAsk) return { ...local, reason: "no_ask" };
  if (config.local) return { ...local, reason: "local_model" };
  if (!config.token) return { ...local, reason: "no_token" };
  return { mode: "server", ask: true, reason: "ok" };
}

// ── So'rov / javob ──────────────────────────────────────────────────────────

/** Suhbatdan so'rov xabarlari: faqat user/assistant matni (tool va fayl mazmunisiz), oxirgi 8 tasi. */
export function toInquiryMessages(messages) {
  const out = [];
  for (const m of Array.isArray(messages) ? messages : []) {
    if (!m || (m.role !== "user" && m.role !== "assistant")) continue;
    const text = (m.role === "user" ? splitUserContent(m.content).text : typeof m.content === "string" ? m.content : "").trim();
    if (!text) continue;
    out.push({ role: m.role, content: text.length > MAX_MESSAGE_CHARS ? text.slice(0, MAX_MESSAGE_CHARS) : text });
  }
  const tail = out.slice(-MAX_MESSAGES);
  // Server oxirgi user xabarini triage qiladi — undan keyingi assistant xabarlari keraksiz.
  while (tail.length && tail[tail.length - 1].role !== "user") tail.pop();
  return tail;
}

/** `context` (≤4000): biriktirilgan fayl nomlari + papka tuzilmasining boshi. */
export function buildContext({ files = [], folder = "" } = {}) {
  const parts = [];
  const names = [...new Set(files.map((f) => cleanTerm(f, 120)).filter(Boolean))].slice(0, 20);
  if (names.length) parts.push(`Attached files: ${names.join(", ")}`);
  if (folder) parts.push(String(folder));
  const s = parts.join("\n");
  return s.length > MAX_CONTEXT_CHARS ? s.slice(0, MAX_CONTEXT_CHARS) : s;
}

/**
 * /api/cli/inquiry so'rov tanasi (server sxemasi `.strict()` — ortiqcha maydon yo'q).
 * @returns {object|null} user xabari bo'lmasa null
 */
export function buildInquiryRequest({ messages, config = {}, fullAuto = false, round = 0, askedSlots = [], context = "", lang }) {
  const msgs = toInquiryMessages(messages);
  if (!msgs.length) return null;
  const last = msgs[msgs.length - 1].content;
  const body = {
    messages: msgs,
    surface: "cli",
    mode: "code",
    fullAuto: Boolean(fullAuto),
    lang: LANGS.has(lang) ? lang : detectLang(last),
    inquiryMode: INQUIRY_MODES.has(config.inquiry) ? config.inquiry : "auto",
    round: Math.min(3, Math.max(0, Math.floor(Number(round) || 0))),
    askedSlots: [...new Set((askedSlots || []).filter((s) => typeof s === "string" && s && s.length <= 40))].slice(-MAX_ASKED_SLOTS),
  };
  const ctx = typeof context === "string" ? context.slice(0, MAX_CONTEXT_CHARS) : "";
  if (ctx.trim()) body.context = ctx;
  return body;
}

/**
 * Model yozgan savol matni (R1): markdown belgilari va "://" li har qanday bo'lak (havola) olib tashlanadi —
 * javob user xabariga ko'chadi, havola agent/server tomonidan o'qilmasin. Server ham tozalaydi (ikkinchi qatlam).
 */
export function cleanModelText(v, max = 200) {
  if (typeof v !== "string") return "";
  let s = v;
  for (let i = 0; i < 4; i++) {
    const next = s.replace(/[*`|~]+|_{2,}/g, "").replace(/\S*:\/\/\S*/g, " ");
    if (next === s) break;
    s = next;
  }
  return cleanTerm(s.replace(/:\/\//g, " "), max);
}

function clampList(list, maxItems, maxChars) {
  if (!Array.isArray(list)) return [];
  return list.map((x) => cleanModelText(x, maxChars)).filter(Boolean).slice(0, maxItems);
}

/**
 * Server javobini tekshiradi va tozalaydi (LLM matni terminalga xavfsiz chiqishi uchun).
 * Yaroqsiz bo'lsa null (fail-open).
 */
export function normalizeInquiryResponse(raw) {
  if (!raw || typeof raw !== "object") return null;
  const decision = DECISIONS.has(raw.decision) ? raw.decision : null;
  if (!decision) return null;
  const questions = [];
  for (const q of Array.isArray(raw.questions) ? raw.questions.slice(0, 5) : []) {
    if (!q || typeof q !== "object") continue;
    const text = cleanModelText(q.text, 200);
    if (!text) continue;
    const options = clampList(q.options, 6, 60);
    const kind = KINDS.has(q.kind) ? q.kind : options.length ? "single" : "text";
    questions.push({
      id: `q${questions.length + 1}`,
      slot: typeof q.slot === "string" && /^[a-z0-9_]{1,40}$/i.test(q.slot) ? q.slot : `q${questions.length + 1}`,
      text,
      why: cleanModelText(q.why, 160),
      kind: kind !== "text" && !options.length ? "text" : kind,
      options,
      critical: q.critical === true,
    });
  }
  const round = Number.isInteger(raw.round) && raw.round >= 0 && raw.round <= 3 ? raw.round : 1;
  return {
    decision: decision !== "answer" && !questions.length ? "answer" : decision,
    inquiryId: typeof raw.inquiryId === "string" ? raw.inquiryId.slice(0, 64) : "",
    domain: Object.hasOwn(DOMAIN_LABEL, raw.domain) ? raw.domain : "general",
    stakes: Object.hasOwn(STAKES_LABEL, raw.stakes) ? raw.stakes : "low",
    goal: cleanModelText(raw.goal, 160),
    questions,
    assumptions: clampList(raw.assumptions, 6, 160),
    blocking: raw.blocking === true,
    emergency: raw.emergency === true,
    round,
    professional: Object.hasOwn(PROFESSIONAL_NOTE, raw.professional) ? raw.professional : null,
    addendum: typeof raw.addendum === "string" ? raw.addendum.slice(0, MAX_ADDENDUM_CHARS) : "",
  };
}

/** Javob tanasini `max` baytgacha o'qiydi. */
async function readCappedJson(res, max) {
  const text = await res.text();
  if (text.length > max) return null;
  return JSON.parse(text);
}

/**
 * /api/cli/inquiry — har qanday xato/taymaut/200 bo'lmagan javob → null (fail-open).
 * @param {object} config  {baseUrl, token}
 */
export async function fetchInquiry(config, body, { signal, timeoutMs = INQUIRY_TIMEOUT_MS, fetchImpl = globalThis.fetch } = {}) {
  if (!config?.token || !body) return null;
  const signals = [AbortSignal.timeout(timeoutMs), signal].filter(Boolean);
  const sig = signals.length > 1 && typeof AbortSignal.any === "function" ? AbortSignal.any(signals) : signals[0];
  try {
    const res = await fetchImpl(`${String(config.baseUrl).replace(/\/+$/, "")}${INQUIRY_PATH}`, {
      method: "POST",
      redirect: "error",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.token}` },
      body: JSON.stringify(body),
      signal: sig,
    });
    if (!res.ok) {
      await res.body?.cancel?.().catch(() => {});
      return null;
    }
    return normalizeInquiryResponse(await readCappedJson(res, MAX_RESPONSE_BYTES));
  } catch {
    return null;
  }
}

// ── Terminal render va javoblar ─────────────────────────────────────────────

const OTHER_RE = /^(?:boshqa|бошқа|другое|другой|другая|иное|other|something else)(?![\p{L}])/iu;
export const isOtherOption = (o) => OTHER_RE.test(String(o ?? "").trim());

/** Savol kartasining sarlavhasi va har savol qatorlari (ranglar `c` orqali). */
export function renderCard(resp, c, { roundNo = 1 } = {}) {
  const lines = [];
  const tags = [DOMAIN_LABEL[resp.domain], STAKES_LABEL[resp.stakes]].filter(Boolean).join(" · ");
  const title = resp.blocking ? "Boshlashdan oldin bitta muhim fakt kerak" : "Aniq javob uchun bir necha savol";
  lines.push(`${c.accent("◆")} ${c.white(title)}${tags ? "  " + c.dim(`(${tags}${roundNo > 1 ? ` · ${roundNo}-raund` : ""})`) : ""}`);
  if (resp.goal) lines.push(`  ${c.dim("Maqsad:")} ${resp.goal}`);
  if (resp.professional) lines.push(`  ${c.dim(PROFESSIONAL_NOTE[resp.professional])}`);
  lines.push(`  ${c.faint("Har savolga: raqam(lar) yoki o'z javobingiz · Enter — o'tkazish (taxmin bilan davom)")}`);
  return lines;
}

export function renderQuestion(q, index, c) {
  const lines = [];
  const badge = q.critical ? " " + c.amber("(muhim)") : "";
  lines.push(`${c.white(`${index + 1}. ${q.text}`)}${badge}`);
  if (q.why) lines.push(`   ${c.dim("Nega: " + q.why)}`);
  if (q.options.length) {
    lines.push("   " + q.options.map((o, i) => `${c.accent(`[${i + 1}]`)} ${o}`).join("  "));
    if (q.kind === "multi") lines.push(`   ${c.faint("bir nechtasini tanlash mumkin: 1,3")}`);
  }
  return lines;
}

/**
 * Foydalanuvchi kiritgan qatorni savol javobiga aylantiradi.
 * @returns {{value: string|null, other?: boolean, invalid?: boolean}}
 *   value null — o'tkazildi; other — "Boshqa…" tanlandi (matn so'rash kerak); invalid — raqam diapazondan tashqarida.
 */
export function parseAnswer(input, q) {
  const s = String(input ?? "").trim();
  if (!s) return { value: null };
  if (q.options.length && /^\d+(?:\s*[,\s]\s*\d+)*$/.test(s)) {
    const nums = s.split(/[,\s]+/).map(Number);
    if (nums.some((n) => n < 1 || n > q.options.length)) return { value: null, invalid: true };
    const picked = [...new Set(q.kind === "multi" ? nums : nums.slice(0, 1))].map((n) => q.options[n - 1]);
    const other = picked.some(isOtherOption);
    const named = picked.filter((o) => !isOtherOption(o));
    return { value: named.length ? named.join(", ") : null, other };
  }
  return { value: cleanTerm(s, MAX_ANSWER_CHARS) || null };
}

/** `Aniqlashtirish:` bloki (web bilan bir xil shakl, §A.7). */
export function formatClarification(pairs, { unanswered = 0 } = {}) {
  const lines = ["Aniqlashtirish:"];
  for (const p of pairs) lines.push(`- ${p.question} — ${p.answer}`);
  if (unanswered > 0) lines.push("- Qolgan savollar bo'yicha o'zing asosli taxmin qil va taxminlarni javob boshida ochiq yoz.");
  return lines.join("\n");
}

/** Blokni user xabari matniga qo'shadi (multimodal bo'lsa — oxirgi matn qismiga). */
export function appendToUserMessage(msg, block) {
  if (!msg || !block) return;
  if (typeof msg.content === "string") {
    msg.content = `${msg.content}\n\n${block}`;
    return;
  }
  if (Array.isArray(msg.content)) {
    for (let i = msg.content.length - 1; i >= 0; i--) {
      const p = msg.content[i];
      if (p?.type === "text" && typeof p.text === "string" && !/^\[(?:FAYL|PDF)/.test(p.text)) {
        p.text = `${p.text}\n\n${block}`;
        return;
      }
    }
    msg.content.push({ type: "text", text: block });
  }
}

/** Addendum system xabari — birinchi system bo'lmagan xabardan oldin qo'yiladi; navbatdan keyin olib tashlanadi. */
export function insertAddendum(messages, text) {
  if (!text || !Array.isArray(messages)) return null;
  const msg = { role: "system", content: text };
  const at = messages.findIndex((m) => m.role !== "system");
  messages.splice(at === -1 ? messages.length : at, 0, msg);
  return msg;
}

export function removeMessage(messages, msg) {
  if (!msg || !Array.isArray(messages)) return;
  const i = messages.indexOf(msg);
  if (i !== -1) messages.splice(i, 1);
}

/** Shu suhbat davomidagi holat (/clear bilan yangilanadi). */
export function createInquiryState() {
  return { askedSlots: [] };
}

/**
 * Birinchi xabar uchun rejalashtirish bosqichi (savol-javob bilan).
 * `userMsg` allaqachon `messages` ichida bo'lishi kerak; javoblar unga qo'shiladi.
 *
 * @param {object} p
 * @param {object[]} p.messages
 * @param {object} p.userMsg
 * @param {object} p.config
 * @param {{mode: string, ask: boolean}} p.plan  inquiryPlan() natijasi
 * @param {boolean} [p.fullAuto]
 * @param {string} [p.context]
 * @param {object} [p.state]  createInquiryState()
 * @param {(q: string) => Promise<string>} p.ask  savol (bekor qilinsa "")
 * @param {(line: string) => void} p.log
 * @param {object} p.c   ranglar (ui.mjs)
 * @param {AbortSignal} [p.signal]
 * @param {() => {stop: () => void}} [p.spin]
 * @param {Function} [p.fetchImpl]
 * @returns {Promise<{cancelled: boolean, addendum: string, followups: object[], decision: string|null, asked: number, answered: number}>}
 */
export async function runInquiry({ messages, userMsg, config, plan, fullAuto = false, context = "", state, ask, log, c, signal, spin, fetchImpl }) {
  const out = { cancelled: false, addendum: "", followups: [], decision: null, asked: 0, answered: 0 };
  const text = splitUserContent(userMsg?.content).text;
  if (!plan || plan.mode === "none") return out;
  if (plan.mode === "local" || !plan.ask) {
    if (isEmergencyText(text)) out.addendum = EMERGENCY_FIRST;
    return out;
  }
  const st = state ?? createInquiryState();
  let round = 0;
  for (let rnd = 0; rnd <= MAX_QUESTION_ROUNDS; rnd++) {
    const body = buildInquiryRequest({ messages, config, fullAuto, round, askedSlots: st.askedSlots, context });
    const sp = spin?.();
    const resp = await fetchInquiry(config, body, { signal, fetchImpl });
    sp?.stop();
    if (signal?.aborted) return { ...out, cancelled: true };
    if (!resp) {
      // Fail-open: faqat mahalliy favqulodda tekshiruv. Oldingi raundning "skipped" addendumi ishlatilmaydi —
      // foydalanuvchi savollarga javob bergan.
      out.addendum = isEmergencyText(text) ? EMERGENCY_FIRST : "";
      return out;
    }
    out.decision = resp.decision;
    out.addendum = resp.addendum || (resp.emergency ? EMERGENCY_FIRST : "");
    round = resp.round;
    for (const q of resp.questions) if (!st.askedSlots.includes(q.slot)) st.askedSlots.push(q.slot);
    if (st.askedSlots.length > MAX_ASKED_SLOTS) st.askedSlots.splice(0, st.askedSlots.length - MAX_ASKED_SLOTS);

    if (resp.decision === "answer_then_ask") {
      out.followups = resp.questions.slice(0, 3);
      return out;
    }
    if (resp.decision !== "ask" || rnd >= MAX_QUESTION_ROUNDS) return out;

    // ── Savol kartasi ──
    log("");
    for (const l of renderCard(resp, c, { roundNo: rnd + 1 })) log(l);
    const pairs = [];
    let skipped = 0;
    for (const [i, q] of resp.questions.entries()) {
      log("");
      for (const l of renderQuestion(q, i, c)) log(l);
      out.asked++;
      let ans = { value: null };
      for (let tries = 0; tries < 3; tries++) {
        ans = parseAnswer(await ask(`   ${c.accent("›")} `), q);
        if (signal?.aborted) return { ...out, cancelled: true };
        if (!ans.invalid) break;
        log(`   ${c.amber(`1–${q.options.length} oralig'idagi raqam yoki o'z javobingizni yozing (Enter — o'tkazish).`)}`);
      }
      if (ans.other) {
        const extra = cleanTerm(await ask(`   ${c.dim("Aniqlang:")} `), MAX_ANSWER_CHARS);
        if (signal?.aborted) return { ...out, cancelled: true };
        ans.value = [ans.value, extra].filter(Boolean).join(", ") || null;
      }
      if (ans.value) pairs.push({ question: q.text, answer: ans.value });
      else skipped++;
    }
    log("");
    if (!pairs.length) {
      // Hammasi o'tkazildi → "taxmin bilan javob ber" (server bergan skipped-addendum).
      log(`${c.dim("↷ Taxmin bilan davom etyapman — taxminlar javob boshida yoziladi.")}`);
      if (resp.blocking && fullAuto) out.addendum = [out.addendum, FULL_AUTO_BLOCKING_NOTE].filter(Boolean).join("\n\n");
      return out;
    }
    out.answered += pairs.length;
    appendToUserMessage(userMsg, formatClarification(pairs, { unanswered: skipped }));
    log(`${c.green("✓")} ${c.dim(`${pairs.length} ta javob vazifaga qo'shildi.`)}`);
    // Keyingi raund: server javoblarni ko'rib yangi addendum beradi (yoki 2-raund savollari).
  }
  return out;
}

/** Javobdan keyin (answer_then_ask) — ixtiyoriy aniqlashtirish savollari. */
export function renderFollowups(followups, c) {
  if (!followups?.length) return [];
  const lines = [c.faint("Javobni aniqroq qilish uchun (ixtiyoriy) yozib yuborishingiz mumkin:")];
  for (const q of followups) {
    const opts = q.options.length ? c.dim(`  [${q.options.join(" / ")}]`) : "";
    lines.push(`${c.accent("·")} ${q.text}${opts}`);
  }
  return lines;
}

// ── Mahalliy model (Ollama) zaxirasi ────────────────────────────────────────

const KIND_TEXT = {
  user_limit: "Tarif limitingiz tugadi (kunlik xabar yoki oylik token).",
  rate_limited: "So'rovlar chegarasi — server hozir band (qayta urinishlar tugadi).",
  offline: "SOVEREIGN serveriga ulanib bo'lmadi (internet yo'q yoki server yetib bo'lmaydi).",
  server: "SOVEREIGN serveri ketma-ket xato qaytardi.",
};
export const limitKindText = (kind) => KIND_TEXT[kind] ?? "Server bilan muammo.";

/** O'rnatilgan modellardan tanlov: saqlangan localModel → tool-calling'li birinchisi → birinchisi. */
export function pickLocalModel(models, preferred = "") {
  if (!Array.isArray(models) || !models.length) return null;
  if (preferred) {
    const hit = models.find((m) => m.name === preferred || m.name === `${preferred}:latest`);
    if (hit) return hit;
  }
  return models.find((m) => m.tools === true) ?? models[0];
}

/** Ollama holati + modellar (imkoniyatlari bilan). Faqat loopback (ollama.mjs orqali). */
export async function localModels({ timeoutMs = 800 } = {}) {
  const d = await fetchLocalModels({ withCaps: true, timeoutMs });
  return { available: Boolean(d?.available), models: Array.isArray(d?.models) ? d.models : [] };
}

/** Ollama topilmasa / model yo'q — o'rnatish ko'rsatmasi qatorlari. */
export function installHint(local, c, ramGb = totalmem() / 1024 ** 3) {
  const rec = recommend(ramGb, 0)[0];
  const lines = [];
  if (!local?.available) lines.push(`${c.dim("Ollama topilmadi (127.0.0.1:11434). O'rnatish:")} ${c.white("https://ollama.com/download")}`);
  else lines.push(c.dim("Ollama ishlayapti, lekin birorta model o'rnatilmagan."));
  if (rec) {
    lines.push(`${c.dim("Kompyuteringizga tavsiya:")} ${c.white(`ollama pull ${rec.name}`)} ${c.faint("— " + rec.why)}`);
    lines.push(c.faint(rec.quality));
  }
  return lines;
}

/**
 * Full auto + mahalliy model — alohida tasdiq (§B.1: kichik model fayllardagi prompt-injection'ga zaifroq).
 * @returns {Promise<boolean>} true — full auto yoqiq qoladi
 */
export async function confirmFullAutoLocal({ interactive, ask, log, c }) {
  log(`${c.amber("⚠ Full auto + mahalliy model:")} ${c.dim("kichik modellar fayllardagi yashirin buyruqlarga (prompt-injection) zaifroq va tez-tez xato qiladi.")}`);
  if (!interactive) {
    log(c.dim("  Interaktiv tasdiq imkonsiz — full auto o'chirildi, amallar oddiy qoidalar bilan (xavflisi rad etiladi)."));
    return false;
  }
  const a = String(await ask(`  ${c.amber("?")} Full auto mahalliy model bilan ham yoqiq qolsinmi? ${c.dim("[y/N] ")}`)).trim().toLowerCase();
  const ok = ["y", "yes", "ha"].includes(a);
  log(ok ? c.dim("  Full auto yoqiq qoldi.") : c.dim("  Full auto o'chirildi — amallar yana tasdiqlanadi (/auto — qayta yoqish)."));
  return ok;
}

/**
 * agentTurn uchun `config.onLimit` (T9 hook'i): limit/offline/server xatosida mahalliy modelga o'tishni taklif qiladi.
 * Qaytaradi: model nomi (o'tish) yoki null (o'tmaslik). `config.localFallback`: ask | auto (off — agent chaqirmaydi).
 *
 * @param {object} p
 * @param {() => object} p.getConfig
 * @param {boolean} p.interactive
 * @param {(q: string) => Promise<string>} p.ask
 * @param {(line: string) => void} p.log
 * @param {object} p.c
 * @param {{on: boolean}} [p.fullAuto]
 * @param {(patch: object) => void} [p.save]  saveConfig
 * @param {Function} [p.listModels]  localModels (test uchun almashtiriladi)
 * @param {() => void} [p.beforePrompt]  spinner'ni to'xtatish
 */
export function createLimitHandler({ getConfig, interactive, ask, log, c, fullAuto, save, listModels = localModels, beforePrompt }) {
  return async ({ kind } = {}) => {
    beforePrompt?.();
    const config = getConfig() ?? {};
    const mode = config.localFallback === "auto" ? "auto" : "ask";
    log("");
    log(`${c.amber("⚠")} ${c.white(limitKindText(kind))}`);
    const local = await listModels();
    if (!local.available || !local.models.length) {
      for (const l of installHint(local, c)) log("  " + l);
      if (kind === "user_limit") log(`  ${c.dim("Tarifni oshirish:")} ${c.violet("/upgrade")}`);
      return null;
    }
    let chosen = pickLocalModel(local.models, config.localModel);
    if (mode === "ask") {
      if (!interactive) {
        log(`  ${c.dim("Mahalliy model bilan davom etish:")} ${c.white(`sov --ollama=${chosen.name} ...`)} ${c.dim("yoki")} ${c.white("sov config localFallback=auto")}`);
        return null;
      }
      log(`  ${c.white("Mahalliy model bilan davom etasizmi?")} ${c.dim("(kompyuteringizda ishlaydi, server tokeni sarflanmaydi; sifat bulut modellaridan past bo'lishi mumkin)")}`);
      const shown = local.models.slice(0, 9);
      shown.forEach((m, i) => {
        const caps = [m.tools ? "🔧" : "", m.vision ? "👁" : ""].filter(Boolean).join(" ");
        const mark = m.name === chosen.name ? c.green("●") : c.dim("○");
        log(`   ${mark} ${c.accent(`[${i + 1}]`)} ${c.white(m.name)} ${c.dim([caps, m.paramSize].filter(Boolean).join(" · "))}`);
      });
      const a = String(await ask(`  ${c.amber("?")} ${c.dim("Enter/y — davom etish · n — yo'q · a — ha, keyingi safar so'rama · raqam — boshqa model: ")}`)).trim().toLowerCase();
      if (["n", "no", "yo'q", "yoq"].includes(a)) {
        log(c.dim("  Mahalliy modelga o'tilmadi. Doim o'chirish: sov config localFallback=off"));
        return null;
      }
      if (/^\d+$/.test(a)) {
        const m = shown[Number(a) - 1];
        if (!m) {
          log(c.dim("  Noto'g'ri raqam — mahalliy modelga o'tilmadi."));
          return null;
        }
        chosen = m;
      } else if (a && !["y", "yes", "ha", "a", "doim"].includes(a)) {
        log(c.dim("  Tushunarsiz javob — mahalliy modelga o'tilmadi."));
        return null;
      }
      if (a === "a" || a === "doim") {
        save?.({ localFallback: "auto" });
        config.localFallback = "auto";
        log(c.dim("  Keyingi safar so'ralmaydi (localFallback=auto). Qaytarish: sov config localFallback=ask"));
      }
    } else {
      log(`  ${c.teal("◇")} ${c.dim(`Mahalliy modelga o'tildi: ${chosen.name} (localFallback=auto)`)}`);
    }
    if (fullAuto?.on) {
      const keep = await confirmFullAutoLocal({ interactive, ask, log, c });
      if (!keep) fullAuto.on = false;
    }
    if (chosen.tools === false) log(`  ${c.amber("Bu model vositalarni (fayl/buyruq) qo'llamaydi — faqat suhbat rejimi.")}`);
    if (config.localModel !== chosen.name) {
      save?.({ localModel: chosen.name });
      config.localModel = chosen.name;
    }
    return chosen.name;
  };
}

/**
 * `--ollama[=model]` / `/local on [model]` — mahalliy modelni aniqlash.
 * @returns {Promise<{ok: true, model: object} | {ok: false, error: string, hint?: string[]}>}
 */
export async function resolveLocalModel(requested, config, { c, listModels = localModels } = {}) {
  const want = typeof requested === "string" && requested && requested !== "true" ? requested.trim() : "";
  if (want && !isValidModelName(want)) return { ok: false, error: `Noto'g'ri model nomi: ${cleanTerm(want, 60)}` };
  const local = await listModels();
  if (!local.available || !local.models.length) {
    return { ok: false, error: local.available ? "Ollama'da model o'rnatilmagan." : "Ollama topilmadi (127.0.0.1:11434).", hint: c ? installHint(local, c) : [] };
  }
  if (want) {
    const hit = local.models.find((m) => m.name === want || m.name === `${want}:latest`);
    if (!hit) return { ok: false, error: `Model o'rnatilmagan: ${want}`, hint: [`O'rnatish: ollama pull ${want}`] };
    return { ok: true, model: hit };
  }
  return { ok: true, model: pickLocalModel(local.models, config?.localModel) };
}
