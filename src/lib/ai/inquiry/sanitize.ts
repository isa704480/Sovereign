/**
 * Triage chiqishini tozalash (docs/INQUIRY.md §A.3, §C T1, R1). Pure.
 *
 * - `parseTriage(raw)` — JSON (yoki matndagi birinchi {…} bloki) → zod → uzunlik chegaralari → toza
 *   `TriageResult`; tuzilma yaroqsiz bo'lsa `null` (chaqiruvchi fail-open → "answer").
 * - `cleanText()` — markdown/HTML/URL, boshqaruv, bidi va ko'rinmas belgilarni olib tashlaydi (kartada
 *   faqat oddiy matn; prompt-injection/phishing yuzasini kamaytirish).
 * - `dropUnsafeFacts()` — sir so'raydigan savollarni tashlaydi (parol, PIN, CVV, karta/pasport/JShShIR
 *   raqami, API kalit, OTP ... — 4 tilda). Siyosat (`decide`) buni har doim chaqiradi.
 */
import { z } from "zod";
import { normalizeSlot } from "./known-facts";
import { normalizeForMatch } from "./playbooks";
import {
  INQUIRY_DECISIONS,
  INQUIRY_DOMAINS,
  INQUIRY_TUNING,
  STAKES,
  type InquiryDomain,
  type MissingFact,
  type QuestionKind,
  type TriageResult,
} from "./types";

const L = INQUIRY_TUNING.limits;

// ── Matnni tozalash ───────────────────────────────────────────────────────

/** Bidi override/isolate, zero-width, BOM, soft hyphen, boshqa boshqaruv belgilari. */
const INVISIBLE_RE = /[­؜ᅟᅠ᠎​-‏‪-‮⁠-⁯ㅤ︀-️﻿￹-￻]/g;
const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
const HTML_TAG_RE = /<\/?[a-z!][^<>]{0,300}>/gi;
const HTML_ENTITY_RE = /&(?:[a-z]{2,8}|#\d{1,6}|#x[0-9a-f]{1,6});/gi;
const MD_IMAGE_RE = /!\[([^\]]{0,200})\]\([^)]{0,500}\)/g;
const MD_LINK_RE = /\[([^\]]{0,200})\]\([^)]{0,500}\)/g;
/**
 * URL'lar (R1): istalgan `…://…` bo'lagi (ht_tps://, hxxp:// ham), sxemali xavfli prefikslar (javascript:,
 * data: ...), www., mashhur/xavfli TLD'li domenlar (yo'l bilan yoki yo'lsiz), istalgan harfli (IDN ham)
 * TLD + "/" yo'l, IPv4. Yo'lsiz texnik nomlar ("Next.js", "package.json") saqlanadi.
 */
const TLDS =
  "com|net|org|io|xyz|ru|uz|me|app|dev|ly|co|info|biz|link|site|online|top|click|gg|to|ai|tk|ml|ga|cf|shop|store|pro|su|kz|kg|tj|tm|help|live|lol|cc|tv|ws|zip|mov|page|cloud|tech|space|fun|icu|cn|de|uk|us|eu|fr|win|bid|work|support|services|email|network|host|website|digital|world|today|agency|group|codes|club|vip|buzz|rest|monster|cam|quest|sbs|cfd|bond|best|pw|ae|tr|in|jp|kr|br|ir|by|ua|az|ge|am|mn|af|pk|рф|срб|укр|бел|қаз";
const HOST = String.raw`(?<![\p{L}\p{N}_-])[\p{L}\p{N}_-]+(?:\.[\p{L}\p{N}_-]+)*`;
const URL_RES: RegExp[] = [
  // har qanday "sxema://" bo'lagi — bo'shliqqacha butun token (markdown belgilari bilan bo'lingan ham)
  /\S*:\/\/\S*/g,
  /\b(?:https?|ftp|file|javascript|data|vbscript|mailto|tel|sms|intent|blob):\S*/gi,
  /\bwww\.\S+/gi,
  new RegExp(String.raw`${HOST}\.(?:${TLDS})(?![\p{L}\p{N}_-])(?:[:/?#]\S*)?`, "giu"),
  // noma'lum (IDN ham) TLD — faqat "/" yo'l bilan: "evil.help/c?m=..", "пример.испытание/x"
  new RegExp(String.raw`${HOST}\.\p{L}{2,}\/\S*`, "giu"),
  // IPv4 (port/yo'l bilan yoki yo'lsiz)
  /(?<![\d.])\d{1,3}(?:\.\d{1,3}){3}(?![\d.])(?::\d{1,5})?(?:[/?#]\S*)?/g,
];
/** Markdown formatlash belgilari; "_" faqat juft holda (Blind Prompting tokenlari "[PERSON_A]" saqlansin). */
const MD_CHARS_RE = /(?:\*+|__+|~~+|`+|^#{1,6}\s*|^>\s*|\|)/gm;

/** Kod nuqtalari bo'yicha kesish, oxiriga "…". */
export function truncate(s: string, max: number): string {
  const cps = Array.from(s);
  if (cps.length <= max) return s;
  return cps.slice(0, Math.max(1, max - 1)).join("").trimEnd() + "…";
}

/** Bir o'tish: markdown/HTML belgilari AVVAL, keyin URL'lar (R1: "ht**tps://" → "https://" qayta tiklanmasin). */
function cleanPass(input: string): string {
  let s = input.replace(INVISIBLE_RE, "").replace(CONTROL_RE, " ");
  // nuqtaga o'xshash belgilar (․ ． 。 ﹒) — domen yashirish usuli
  s = s.replace(/[․．。﹒]/g, ".");
  s = s.replace(/\r\n?|\n|\t/g, " ");
  s = s.replace(MD_IMAGE_RE, "$1").replace(MD_LINK_RE, "$1");
  s = s.replace(HTML_TAG_RE, " ").replace(HTML_ENTITY_RE, " ");
  s = s.replace(MD_CHARS_RE, "");
  // qolgan burchak qavslar (HTML bo'laklari) — oddiy matnda keraksiz
  s = s.replace(/[<>]/g, " ");
  for (const re of URL_RES) s = s.replace(re, " ");
  return s;
}

/**
 * Bir qatorli oddiy matn: markdown/HTML/URL/boshqaruv/bidi yo'q, bo'sh joy siqilgan, `max` gacha.
 * Idempotent (R1): o'tish natija o'zgarmaguncha takrorlanadi — belgini olib tashlash yangi URL yasamasin
 * ("ht_*_tps://" → "ht__tps://" → "https://"); oxirida qolgan "://" ham uziladi.
 */
export function cleanText(input: unknown, max: number): string {
  if (typeof input !== "string") return "";
  let s = input.normalize("NFC");
  for (let i = 0; i < 8; i++) {
    const next = cleanPass(s);
    if (next === s) break;
    s = next;
  }
  s = s.replace(/:\/\//g, " ");
  s = s.replace(/\s+/g, " ").trim();
  // faqat tinish belgilari qolgan bo'lsa — bo'sh
  if (!/[\p{L}\p{N}]/u.test(s)) return "";
  return truncate(s, max);
}

// ── Sir so'raydigan savollar (4 tilda) ─────────────────────────────────────

const W = (src: string) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${src.replace(/ё/g, "е")})`, "iu");
const WB = (src: string) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${src.replace(/ё/g, "е")})(?![\\p{L}\\p{N}])`, "iu");

export const SECRET_REQUEST_RE: RegExp[] = [
  // parol / login ma'lumotlari
  W("parol|пароль|парол|password|passcode|passphrase|kod ?so'z|код ?сўз|кодовое слово"),
  // PIN, CVV/CVC
  WB("pin(?:[- ]?(?:kod|code|код))?|пин(?:[- ]?код)?|cvv2?|cvc2?|ccv|cid|срок действия карты|karta amal qilish muddati|card expir\\p{L}*|expiry date"),
  // karta / hisob raqami
  W("karta\\p{L}* (?:raqam|ma'lumot|nomer)|карта\\p{L}* (?:рақам|маълумот)|номер\\p{L}* (?:карт|сч[её]т)|данные карт|реквизиты карт|card (?:number|details|info)|credit card number|debit card number|account number|hisob raqam|ҳисоб рақам|iban|swift code|routing number"),
  // pasport / ID / JShShIR / SSN / INN
  W("pasport\\p{L}* (?:raqam|seriya|ma'lumot|nomer)|паспорт\\p{L}* (?:рақам|серия|маълумот|номер|данн)|(?:серия|номер|данные) (?:и номер )?паспорт|passport (?:number|details|no)|jshshir|жшшир|пинфл|pinfl|шахсий идентификация|shaxsiy identifikatsiya|social security|id card number|national id number|stir raqam|tax id number|driver'?s licen[cs]e number|haydovchilik guvohnoma\\p{L}* raqam"),
  // API kalit, token, maxfiy kalit, seed phrase
  W("api[- ]?(?:key|kalit|ключ|калит)|access token|secret key|private key|maxfiy kalit|махфий калит|секретный ключ|приватный ключ|seed phrase|mnemonic|recovery phrase|tiklash so'zlari|сид[- ]?фраз|bearer token|auth token|session token|client secret"),
  // qisqa tokenlar — faqat to'liq so'z sifatida ("инн" ≠ "инновация", "стир" ≠ "стирать")
  WB("инн|стир|ssn|otp"),
  // OTP / SMS kod / 2FA
  W("sms[- ]?(?:kod|code|код)|смс[- ]?код|код из смс|код подтвержден|tasdiqlash kod|тасдиқлаш код|bir martalik kod|бир марталик код|одноразов\\p{L}* (?:код|пароль)|verification code|one[- ]time (?:code|password|passcode)|2fa (?:code|kod|код)|authenticator code|security code"),
  // R1: SMS/kod — so'zlar orasida boshqa so'zlar bilan, ikkala tartibda ("SMS orqali kelgan kodni", "Код, который пришёл в SMS")
  W("(?:sms|смс)[^.?!\\n]{0,30}?(?:kod|код|code)|(?:kod|код|code)[^.?!\\n]{0,30}?(?:sms|смс)"),
  // R1: tokenlar (GitHub/npm/PAT/shaxsiy kirish tokeni; "tokeningiz", "ваш токен", "your … token")
  W("(?:github|gitlab|bitbucket|npm|pypi|docker(?:hub)?|vercel|netlify|slack|telegram|bot|discord|openai|anthropic|stripe|aws|gcp|azure|hugging ?face|hf|jira|notion|figma|supabase|firebase|cloudflare)[- ]?(?:token|токен|secret|сир|kalit|калит|ключ|key)|token\\p{L}*ingiz|токен\\p{L}*ингиз|(?:ваш|вашего|свой|своего|твой)\\p{L}* (?:\\p{L}+ )?токен|your (?:\\p{L}+ ){0,2}(?:access token|api token|auth token|bot token|secret|private key|ssh key)|personal access token|shaxsiy (?:kirish )?token|шахсий (?:кириш )?токен|токен (?:доступа|github|gitlab|npm)|token (?:qiymat|value)|токен\\p{L}* (?:қиймат|значени)|значени\\p{L}* токен"),
  WB("pat"),
  // R1: SSH / maxfiy kalitlar, ulanish satri, .env qiymatlari, СНИЛС, "qizlik familiyasi" (xavfsizlik savoli)
  W("ssh[- ]?(?:kalit|key|ключ|калит)|secret (?:kalit|калит|ключ)|maxfiy (?:token|kalit)|махфий (?:токен|калит)|снилс|snils|connection string|ulanish satr|уланиш сатр|строк\\p{L}* подключения|database_url|db_password|\\.env\\p{L}*[^.?!\\n]{0,30}?(?:qiymat|қиймат|value|content|mazmun|мазмун|содерж|значени|yuboring|юборинг|paste|вставьте|пришлите|ko'rsating)|(?:your|sizning|сизнинг|ваш\\p{L}*) \\.env|qizlik familiya|қизлик фамилия|девичь\\p{L}* фамили|maiden name"),
  // R1: karta raqami — so'zlar orasida ("номер вашей карты", "number on your card", "kartangizning 16 xonali raqami")
  W("(?:kart(?:a|ang|asi|ochk)\\p{L}*|карт(?:[аыуеоя]|очк)\\p{L}*|card(?:s)?(?![\\p{L}]))[^.?!\\n]{0,40}?(?:raqam|рақам|номер|number|nomer)|(?:raqam\\p{L}*|рақам\\p{L}*|номер\\p{L}*|number)[^.?!\\n]{0,40}?(?:kart(?:a|ang|asi|ochk)|карт(?:[аыуеоя]|очк)|card(?![\\p{L}]))"),
];

/** Matn sir (parol, PIN, karta, pasport, JShShIR, API kalit, OTP ...) so'rayaptimi. */
export function isSecretRequest(text: string): boolean {
  const t = normalizeForMatch(text);
  return !!t && SECRET_REQUEST_RE.some((re) => re.test(t));
}

/** Sir so'raydigan savollarni tashlaydi (savol, why yoki variantlarda). */
export function dropUnsafeFacts(facts: MissingFact[]): { kept: MissingFact[]; dropped: MissingFact[] } {
  const kept: MissingFact[] = [];
  const dropped: MissingFact[] = [];
  for (const f of facts) {
    const hay = [f.question, f.why, ...(f.options ?? [])].join(" \n ");
    if (isSecretRequest(hay)) dropped.push(f);
    else kept.push(f);
  }
  return { kept, dropped };
}

// ── zod sxema (tuzilma qat'iy, uzunliklar keyin kesiladi) ─────────────────

const lowerEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess((v) => (typeof v === "string" ? v.trim().toLowerCase() : v), z.enum(values));

const boolish = z.preprocess((v) => (v === "true" ? true : v === "false" ? false : v), z.boolean());

const numberish = z.preprocess((v) => (typeof v === "string" && v.trim() !== "" ? Number(v) : v), z.number().finite());

const factSchema = z.object({
  slot: z.string().min(1),
  critical: boolish.optional().default(false),
  question: z.string().min(1),
  why: z.string().optional().default(""),
  options: z.array(z.unknown()).optional(),
  kind: z.unknown().optional(),
});

const triageSchema = z.object({
  domain: z.preprocess(
    (v) => (typeof v === "string" ? v.trim().toLowerCase() : v),
    z.string().transform((v): InquiryDomain => ((INQUIRY_DOMAINS as readonly string[]).includes(v) ? (v as InquiryDomain) : "general")),
  ),
  stakes: lowerEnum(STAKES),
  clarity: numberish,
  goal: z.string().optional().default(""),
  missing_facts: z.array(z.unknown()).optional().default([]),
  hidden_assumptions: z.array(z.unknown()).optional().default([]),
  risks: z.array(z.unknown()).optional().default([]),
  decision: lowerEnum(INQUIRY_DECISIONS),
  blocking: boolish.optional(),
  emergency: boolish.optional(),
});

function cleanList(items: unknown[], maxItems: number, maxLen: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    const c = cleanText(it, maxLen);
    const key = c.toLowerCase();
    if (!c || seen.has(key)) continue;
    seen.add(key);
    out.push(c);
    if (out.length >= maxItems) break;
  }
  return out;
}

function cleanFact(raw: unknown): MissingFact | null {
  const p = factSchema.safeParse(raw);
  if (!p.success) return null;
  const slot = normalizeSlot(p.data.slot);
  const question = cleanText(p.data.question, L.question);
  if (!slot || !question) return null;
  const why = cleanText(p.data.why, L.why);
  const options = cleanList(p.data.options ?? [], L.maxOptions, L.option);
  const hasOptions = options.length >= L.minOptions;
  const rawKind = typeof p.data.kind === "string" ? p.data.kind.trim().toLowerCase() : "";
  let kind: QuestionKind = hasOptions ? "single" : "text";
  if (rawKind === "multi" && hasOptions) kind = "multi";
  else if (rawKind === "text") kind = "text";
  const fact: MissingFact = { slot, critical: p.data.critical, question, why, kind };
  if (hasOptions && kind !== "text") fact.options = options;
  return fact;
}

/** Matndan birinchi muvozanatli {…} blokini ajratadi (satr ichidagi qavslarni hisobga olib). */
export function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Triage modelining xom chiqishi (obyekt yoki matn) → tozalangan `TriageResult` yoki `null`.
 * Tuzilma xato (domen/stakes/decision/clarity yo'q yoki JSON buzuq) → null. Alohida yaroqsiz
 * `missing_facts` elementlari tashlanadi, qolganlari saqlanadi. Sir so'rovchi savollar bu yerda
 * tashlanmaydi — `decide()` ularni sanab tashlaydi (telemetriya `n_safety_dropped`).
 */
export function parseTriage(raw: unknown): TriageResult | null {
  let obj: unknown = raw;
  if (typeof raw === "string") {
    const text = raw.trim();
    const candidate = text.startsWith("{") ? text : extractJsonObject(text);
    if (!candidate) return null;
    try {
      obj = JSON.parse(candidate);
    } catch {
      const inner = extractJsonObject(text);
      if (!inner || inner === candidate) return null;
      try {
        obj = JSON.parse(inner);
      } catch {
        return null;
      }
    }
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
  const p = triageSchema.safeParse(obj);
  if (!p.success) return null;
  const d = p.data;

  const facts: MissingFact[] = [];
  for (const f of d.missing_facts) {
    const c = cleanFact(f);
    if (c) facts.push(c);
    if (facts.length >= L.maxMissingFacts) break;
  }

  const result: TriageResult = {
    domain: d.domain,
    stakes: d.stakes,
    clarity: Math.min(1, Math.max(0, d.clarity)),
    goal: cleanText(d.goal, L.goal),
    missing_facts: facts,
    hidden_assumptions: cleanList(d.hidden_assumptions, L.maxAssumptions, L.assumption),
    risks: cleanList(d.risks, L.maxRisks, L.risk),
    decision: d.decision,
  };
  if (d.blocking !== undefined) result.blocking = d.blocking;
  if (d.emergency !== undefined) result.emergency = d.emergency;
  return result;
}
