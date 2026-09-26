/**
 * SOVEREIGN Blind Prompting — replaces PII in the user's message with tokens
 * before sending to the LLM, and restores the originals in the response.
 *
 * Pure client-side by design: the token map lives only in the browser session,
 * so the provider never sees the real values. Deterministic across masks in
 * the same conversation (same value → same token).
 */

export interface BlindResult {
  masked: string;
  /** token → original */
  tokenMap: Record<string, string>;
}

// Unicode-friendly regexlar — kirill, arab, CJK ismlarni ham qamrab oladi.
const EMAIL_RE = /[\p{L}0-9._%+-]+@[\p{L}0-9.-]+\.[\p{L}]{2,}/gu;
const PHONE_RE = /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)?\d{2,4}[\s.-]?\d{2,4}[\s.-]?\d{2,4}/g;
const URL_RE = /(?:https?:\/\/|www\.)[^\s<>"'`]+/gi;
// Kartalar: Visa/MC (16), AMEX (15, 4-6-5), Diners (14), UnionPay (19).
const CARD_RE = /\b(?:\d{4}[\s-]?){2,4}\d{1,4}\b/g;
const IBAN_RE = /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g;
const IP_RE = /\b(?:\d{1,3}\.){3}\d{1,3}\b|\b[0-9a-f]{1,4}(?::[0-9a-f]{1,4}){2,7}\b/gi;
// BTC / ETH / SOL / TRX manzillari
const CRYPTO_RE = /\b(?:0x[a-fA-F0-9]{40}|[13][a-km-zA-HJ-NP-Z1-9]{25,34}|bc1[a-z0-9]{25,60}|T[a-zA-Z0-9]{33})\b/g;
// Pasport / SSN / TIN (asosiy formatlar)
const ID_RE = /\b(?:[A-Z]{2}\d{7}|\d{3}-\d{2}-\d{4}|\d{14})\b/g;

// Ism — 2–4 ta ketma-ket bosh harfli so'z (barcha Unicode scriptlarida, bir qatorda).
// `\b` faqat ASCII'ni biladi (kirillda ishlamaydi) — shuning uchun Unicode lookaround.
// So'z ichida o'zbekcha tutuq belgilari bo'lishi mumkin: O‘tkir, G'ulom, Sa’dulla.
const NAME_WORD = String.raw`\p{Lu}[\p{L}'’‘ʻʼ]*\p{L}`;
const NAME_SEP = String.raw`[^\S\r\n]+`;
const NAME_RE = new RegExp(
  String.raw`(?<![\p{L}\p{N}_])${NAME_WORD}(?:${NAME_SEP}${NAME_WORD}){1,3}(?![\p{L}\p{N}_])`,
  "gu",
);
// Gap boshidagi/oxiridagi bosh harfli oddiy so'zlar (uz/ru/en) — ism emas. Ular
// ketma-ketlikdan chiqarib tashlanadi: "Menga Ali Valiyev" → faqat "Ali Valiyev"
// maskalanadi (avval "Menga Ali" olinib, familiya ochiq qolardi). Ism ham bo'la
// oladigan so'zlar (Aziz, Umid, ...) ro'yxatga KIRITILMAYDI.
const NAME_STOP = new Set(
  [
    // o'zbek (lotin)
    "menga", "men", "sen", "senga", "biz", "bizga", "siz", "sizga", "ular", "ularga", "unga",
    "mening", "bizning", "sizning", "uning", "ularning", "bugun", "kecha", "ertaga", "hozir",
    "salom", "assalomu", "alaykum", "hurmatli", "iltimos", "rahmat", "keyin", "lekin",
    "ammo", "va", "yoki", "agar", "chunki", "bu", "shu", "o‘sha", "o'sha", "mana", "ha", "kim",
    "nima", "qachon", "qayerda", "nega", "qanday", "janob", "xonim", "ustoz", "domla",
    // o'zbek (kirill)
    "менга", "мен", "биз", "сиз", "улар", "унга", "бугун", "кеча", "эртага", "ҳозир", "салом",
    "ассалому", "алайкум", "ҳурматли", "илтимос", "раҳмат", "кейин", "лекин", "ва", "бу",
    // rus
    "мне", "меня", "я", "мы", "ты", "вы", "он", "она", "они", "его", "ее", "её", "сегодня",
    "вчера", "завтра", "сейчас", "привет", "здравствуйте", "уважаемый", "уважаемая", "дорогой",
    "дорогая", "пожалуйста", "спасибо", "это", "этот", "эта", "когда", "потом", "но", "и", "или",
    "если", "мой", "моя", "наш", "ваш", "господин", "госпожа",
    // ingliz
    "yesterday", "today", "tomorrow", "now", "the", "this", "that", "these", "those", "hello",
    "hi", "hey", "dear", "please", "thanks", "thank", "when", "then", "and", "but", "or", "if",
    "my", "our", "your", "his", "her", "their", "we", "you", "he", "she", "they", "it", "mr",
    "mrs", "ms", "dr", "sir", "madam", "monday", "tuesday", "wednesday", "thursday", "friday",
    "saturday", "sunday", "january", "february", "march", "april", "may", "june", "july",
    "august", "september", "october", "november", "december",
  ],
);
const ORG_RE = /\b(\p{Lu}[\p{L}0-9]{2,})\s*(?:LLC|Inc\.?|MChJ|YaTT|Ltd\.?|Corp(?:oration|\.)?|GmbH|OOO|AG|BV|SA|PLC|LLP)\b/gu;
const MONEY_RE = /\$\s?\d[\d,]*(?:\.\d+)?|\d[\d,]*(?:\.\d+)?\s?(?:so'm|som|USD|EUR|GBP|RUB|₽|€|£|¥)/gi;

interface Counters {
  PERSON: number;
  ORG: number;
  EMAIL: number;
  PHONE: number;
  URL: number;
  CARD: number;
  MONEY: number;
  IBAN: number;
  IP: number;
  CRYPTO: number;
  ID: number;
}

function counter(): Counters {
  return { PERSON: 0, ORG: 0, EMAIL: 0, PHONE: 0, URL: 0, CARD: 0, MONEY: 0, IBAN: 0, IP: 0, CRYPTO: 0, ID: 0 };
}

function label(cat: keyof Counters, n: number): string {
  // A..Z, keyin raqam — 26 dan ko'p qiymat bitta tokenga to'qnashmasin.
  return `[${cat}_${n <= 26 ? String.fromCharCode(64 + n) : n}]`;
}

/**
 * Bir suhbat (bir so'rov) davomidagi umumiy holat: turli xabarlardagi qiymatlar
 * turli token oladi, bir xil qiymat — bir xil token. Sessiyasiz har mask() chaqiruvi
 * hisobni noldan boshlardi va ikki xabardagi ikki ism ikkalasi ham [PERSON_A] bo'lardi.
 */
export interface MaskSession {
  cnt: Counters;
  revIndex: Map<string, string>;
  tokenMap: Record<string, string>;
}

export function createMaskSession(): MaskSession {
  return { cnt: counter(), revIndex: new Map(), tokenMap: {} };
}

/** Mask PII inside `text` into stable tokens; returns the token map. */
export function mask(text: string, session: MaskSession = createMaskSession()): BlindResult {
  const { cnt, revIndex, tokenMap } = session; // revIndex: original → token

  const alloc = (cat: keyof Counters, value: string): string => {
    const key = `${cat}:${value.trim().toLowerCase()}`;
    const found = revIndex.get(key);
    if (found) return found;
    cnt[cat] += 1;
    const tok = label(cat, cnt[cat]);
    revIndex.set(key, tok);
    tokenMap[tok] = value;
    return tok;
  };

  let out = text;

  // Order matters: URL/email/card first (they can contain digits that phone
  // would otherwise pick up), then phones, money, orgs, names.
  // Tartib muhim: URL/email/karta/IBAN/crypto avval — ular ichidagi raqamlar
  // keyingi PHONE regexini adashtirmasin.
  out = out.replace(URL_RE, (m) => alloc("URL", m));
  out = out.replace(EMAIL_RE, (m) => alloc("EMAIL", m));
  out = out.replace(IBAN_RE, (m) => alloc("IBAN", m));
  out = out.replace(CRYPTO_RE, (m) => alloc("CRYPTO", m));
  out = out.replace(CARD_RE, (m) => {
    // Karta uzunligini 13-19 raqam bilan cheklaymiz (Luhn qismini oldindan tekshirmaymiz).
    const d = m.replace(/\D/g, "");
    if (d.length < 13 || d.length > 19) return m;
    return alloc("CARD", m);
  });
  out = out.replace(ID_RE, (m) => alloc("ID", m));
  out = out.replace(IP_RE, (m) => {
    // Faqat IPv4/IPv6 shakli — versiya yoki sana kabi noto'g'ri natijalarni chetlaymiz.
    if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(m)) {
      const octets = m.split(".").map(Number);
      if (octets.some((o) => o > 255)) return m;
      return alloc("IP", m);
    }
    if (/:.*:/.test(m)) return alloc("IP", m);
    return m;
  });
  out = out.replace(PHONE_RE, (m) => {
    const digits = m.replace(/\D/g, "");
    if (digits.length < 7 || digits.length > 15) return m; // too short/long → probably not a phone
    // Sana (2024-01-15) yoki UUID qism false-positive'ni chetlaymiz — agar
    // atrofda "-" bo'lsa va yosh yil boshlansa, ehtimol sana.
    if (/^(?:19|20)\d{2}[-/]\d{1,2}[-/]\d{1,2}$/.test(m.trim())) return m;
    return alloc("PHONE", m);
  });
  out = out.replace(MONEY_RE, (m) => alloc("MONEY", m));
  out = out.replace(ORG_RE, (m) => alloc("ORG", m));
  out = out.replace(NAME_RE, (m) => {
    // parts: [so'z, ajratgich, so'z, ...] — ajratgichlar asl holicha saqlanadi.
    const parts = m.split(/([^\S\r\n]+)/);
    const words = parts.filter((_, i) => i % 2 === 0);
    let s = 0;
    let e = words.length;
    while (s < e && NAME_STOP.has(words[s].toLowerCase())) s++;
    while (e > s && NAME_STOP.has(words[e - 1].toLowerCase())) e--;
    if (e - s < 2) return m; // bitta so'z qoldi — ism deb hisoblamaymiz (avvalgidek)
    const head = parts.slice(0, 2 * s).join("");
    const core = parts.slice(2 * s, 2 * e - 1).join("");
    const tail = parts.slice(2 * e - 1).join("");
    return head + alloc("PERSON", core) + tail;
  });

  return { masked: out, tokenMap };
}

/** Restore the real values in `text` using the token map. */
export function unmask(text: string, tokenMap: Record<string, string>): string {
  if (!text) return text;
  let out = text;
  for (const [tok, val] of Object.entries(tokenMap)) {
    // Escape the token literal for regex use.
    const esc = tok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(esc, "g"), val);
  }
  return out;
}
