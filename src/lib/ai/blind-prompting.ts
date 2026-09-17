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

// Ism — ikkita ketma-ket bosh harfli so'z (barcha Unicode scriptlarida)
const NAME_RE = /\b(\p{Lu}\p{L}{1,})\s+(\p{Lu}\p{L}{1,})\b/gu;
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
  return `[${cat}_${String.fromCharCode(64 + n)}]`;
}

/** Mask PII inside `text` into stable tokens; returns the token map. */
export function mask(text: string): BlindResult {
  const cnt = counter();
  const revIndex = new Map<string, string>(); // original → token
  const tokenMap: Record<string, string> = {};

  const alloc = (cat: keyof Counters, value: string): string => {
    const key = `${cat}:${value.trim().toLowerCase()}`;
    const found = revIndex.get(key);
    if (found) return found;
    cnt[cat] = Math.min(cnt[cat] + 1, 26);
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
  out = out.replace(NAME_RE, (m) => alloc("PERSON", m));

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
