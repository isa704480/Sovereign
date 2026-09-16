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

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const PHONE_RE = /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)?\d{2,4}[\s.-]?\d{2,4}[\s.-]?\d{2,4}/g;
const URL_RE = /https?:\/\/[^\s<>"'`]+/gi;
const CARD_RE = /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{2,4}\b/g;

// Common Uzbek/international proper noun heuristics: two consecutive Capitalized
// tokens (Firstname Lastname) or a solo one after "men", "ismim", "menda" etc.
const NAME_RE = /\b([A-ZŇĞÜŞÖŢĐČŠĐŽ][\p{L}]+)\s+([A-ZŇĞÜŞÖŢĐČŠĐŽ][\p{L}]+)\b/gu;
const ORG_RE = /\b([A-Z][\p{L}0-9]{2,})\s*(?:LLC|Inc|MChJ|YaTT|Ltd|Corporation|Corp\.?|GmbH|OOO)\b/gu;
const MONEY_RE = /\$\s?\d[\d,]*(?:\.\d+)?|\d[\d,]*(?:\.\d+)?\s?(?:so'm|som|USD|EUR|₽|€|£)/gi;

interface Counters {
  PERSON: number;
  ORG: number;
  EMAIL: number;
  PHONE: number;
  URL: number;
  CARD: number;
  MONEY: number;
}

function counter(): Counters {
  return { PERSON: 0, ORG: 0, EMAIL: 0, PHONE: 0, URL: 0, CARD: 0, MONEY: 0 };
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
  out = out.replace(URL_RE, (m) => alloc("URL", m));
  out = out.replace(EMAIL_RE, (m) => alloc("EMAIL", m));
  out = out.replace(CARD_RE, (m) => alloc("CARD", m));
  out = out.replace(PHONE_RE, (m) => {
    const digits = m.replace(/\D/g, "");
    if (digits.length < 7) return m; // too short → probably not a phone
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
