/**
 * Ops bot — PURE yordamchilar (tarmoqsiz): maxfiylik niqoblari, Telegram HTML escape, 4096 belgili
 * bo'lish, provayder nomlari, xato sinfi, vaqt formatlari. Test: src/lib/ops/ops.test.ts
 *
 * MAXFIYLIK (Telegram — uchinchi tomon): bu yerdan chiqadigan har qiymat faqat ruxsat etilganlar —
 * niqoblangan email (ab***@domen), 2 harfli mamlakat kodi, tarif, davr, summa, provayder/model id,
 * xato sinfi, OS/ilova nomi. Xabar/chat matni, fayl nomi, IP, token, to'liq email, qurilma xost nomi —
 * HECH QACHON.
 */
import { fmt, translate, type Lang, type TKey } from "@/lib/i18n";

/* ------------------------------------------------------------------ */
/* Niqoblar                                                             */
/* ------------------------------------------------------------------ */

/** "abcdef@gmail.com" → "ab***@gmail.com". Yaroqsiz / bo'sh → "***". */
export function maskEmail(email: string | null | undefined): string {
  const e = (email ?? "").trim().toLowerCase();
  const at = e.lastIndexOf("@");
  if (at < 1 || at === e.length - 1) return "***";
  const local = e.slice(0, at);
  const domain = e.slice(at + 1).replace(/[^a-z0-9.-]/g, "").slice(0, 64);
  if (!domain) return "***";
  const head = [...local].slice(0, Math.min(2, local.length)).join("").replace(/[^a-z0-9._+-]/g, "*");
  return `${head}***@${domain}`;
}

/** ISO-3166 alpha-2 ("uz" → "UZ"); boshqasi → "—". */
export function countryCode(v: unknown): string {
  const s = typeof v === "string" ? v.trim().toUpperCase() : "";
  return /^[A-Z]{2}$/.test(s) ? s : "—";
}

/** Faqat qisqa, xavfsiz identifikator (provayder, tarif, usul): [a-z0-9._-], 40 belgi. */
export function safeId(v: unknown, max = 40): string {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  const out = s.replace(/[^a-z0-9._-]/g, "").slice(0, max);
  return out || "—";
}

/** Model id: harf/raqam va / : . _ - @ ; 80 belgi. */
export function safeModel(v: unknown): string {
  const s = typeof v === "string" ? v.trim() : "";
  const out = s.replace(/[^A-Za-z0-9/:._@-]/g, "").slice(0, 80);
  return out || "—";
}

/** Onboarding maqsadlari — faqat ma'lum id'lar (erkin matn emas). */
export const PURPOSE_IDS = ["work", "research", "creative", "personal"] as const;
export function safePurposes(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && (PURPOSE_IDS as readonly string[]).includes(x)).slice(0, 4);
}

/** Qurilma nomi ("HOST (win32) · Cowork") → faqat ilova va OS. Xost nomi TASHLANADI. */
export function deviceKind(name: string | null | undefined): { app: "CLI" | "Cowork"; os: string } {
  const raw = (name ?? "").replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").trim().slice(0, 80);
  const m = /\(([a-z0-9_]{2,16})\)\s*(?:·\s*(.*))?$/i.exec(raw);
  const OS: Record<string, string> = { win32: "Windows", darwin: "macOS", linux: "Linux", freebsd: "FreeBSD", android: "Android" };
  const os = m ? (OS[m[1].toLowerCase()] ?? "other") : "—";
  const app = /cowork/i.test(m?.[2] ?? "") ? "Cowork" : "CLI";
  return { app, os };
}

/* ------------------------------------------------------------------ */
/* Telegram: HTML escape va bo'lish                                     */
/* ------------------------------------------------------------------ */

export const TELEGRAM_LIMIT = 4096;

/** Telegram HTML parse mode: faqat &, <, > (va qo'shtirnoq atribut uchun). */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Lokal shablon + qiymatlar — ikkalasi ham escape qilinadi (natija HTML parse mode uchun xavfsiz). */
export function tt(lang: Lang, key: TKey, vars: Record<string, string | number> = {}): string {
  const safe: Record<string, string> = {};
  for (const [k, v] of Object.entries(vars)) safe[k] = escapeHtml(String(v));
  return fmt(escapeHtml(translate(lang, key)), safe);
}

/** Qalin sarlavha (matn allaqachon escape qilingan bo'lishi kerak — tt() natijasi). */
export const bold = (escaped: string) => `<b>${escaped}</b>`;

/**
 * Uzun matnni ≤ limit bo'laklarga: avval qator chegarasida. Bitta qator limitdan uzun bo'lsa —
 * qattiq kesiladi, lekin HTML teg (<…>) yoki entity (&…;) o'rtasida emas. Teglar faqat bitta qator
 * ichida ishlatiladi (bold()), shuning uchun qator chegarasida bo'lish teglarni buzmaydi.
 */
export function splitMessage(text: string, limit = TELEGRAM_LIMIT): string[] {
  const out: string[] = [];
  let cur = "";
  const flush = () => {
    if (cur.trim()) out.push(cur.replace(/\n+$/, ""));
    cur = "";
  };
  for (const line of text.split("\n")) {
    const candidate = cur ? `${cur}\n${line}` : line;
    if (candidate.length <= limit) {
      cur = candidate;
      continue;
    }
    flush();
    if (line.length <= limit) {
      cur = line;
      continue;
    }
    let rest = line;
    while (rest.length > limit) {
      let cut = limit;
      const lt = rest.lastIndexOf("<", cut);
      const gt = rest.lastIndexOf(">", cut);
      if (lt > gt && lt > 0) cut = lt; // teg ichida kesilmasin
      const amp = rest.lastIndexOf("&", cut);
      const semi = rest.lastIndexOf(";", cut);
      if (amp > semi && amp > 0 && cut - amp < 10) cut = amp; // entity ichida kesilmasin
      out.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    cur = rest;
  }
  flush();
  return out;
}

/** Bloklarni (har biri butun) xabarlarga joylash: har xabar ≤ limit, bloklar orasida bo'sh qator. */
export function packBlocks(blocks: string[], limit = TELEGRAM_LIMIT - 96): string[][] {
  const out: string[][] = [];
  let cur: string[] = [];
  let len = 0;
  for (const b of blocks) {
    const add = b.length + (cur.length ? 2 : 0);
    if (cur.length && len + add > limit) {
      out.push(cur);
      cur = [];
      len = 0;
    }
    cur.push(b);
    len += b.length + (cur.length > 1 ? 2 : 0);
  }
  if (cur.length) out.push(cur);
  return out;
}

/* ------------------------------------------------------------------ */
/* Provayder va xato sinfi                                              */
/* ------------------------------------------------------------------ */

const PROVIDER_LABEL: Record<string, string> = {
  groq: "Groq",
  cloudflare: "Cloudflare",
  openrouter: "OpenRouter",
  omniroute: "OmniRoute",
  llm7: "LLM7",
  mistral: "Mistral",
  nvidia: "NVIDIA",
  cerebras: "Cerebras",
  sambanova: "SambaNova",
  rsi: "RSI",
  gateway: "Gateway",
  experiential: "Experiential",
  openai: "OpenAI",
  tella: "Tella",
  perplexity: "Perplexity",
};

export function providerLabel(id: string): string {
  const k = safeId(id);
  return PROVIDER_LABEL[k] ?? k;
}

/** Mesh xato turi → qisqa sinf (Telegram'da ko'rinadigan). Xom xabar matni HECH QACHON ishlatilmaydi. */
export function reasonClass(e: { kind?: string; timeout?: boolean } | null | undefined): string {
  switch (e?.kind) {
    case "no_credit":
      return "402";
    case "rate_limited":
      return "429";
    case "quota_exhausted":
      return "quota";
    case "auth":
      return "auth";
    case "unavailable":
      return "404";
    case "bad_request":
      return "400";
    case "context_length":
      return "413";
    case "unsupported":
      return "unsupported";
    case "transient":
      return e.timeout ? "timeout" : "5xx";
    case "region":
      return "region";
    default:
      return "other";
  }
}

export const REASON_CLASSES = ["402", "429", "quota", "auth", "404", "400", "413", "unsupported", "timeout", "5xx", "region", "other"];

/* ------------------------------------------------------------------ */
/* Pul, raqam, vaqt                                                     */
/* ------------------------------------------------------------------ */

export function money(amount: number | null | undefined, currency = "USD"): string {
  if (amount == null || !Number.isFinite(amount)) return "—";
  const c = currency.toUpperCase();
  if (c === "USD") return `$${amount.toFixed(2)}`;
  if (c === "RUB") return `${Math.round(amount).toLocaleString("en-US")} ₽`;
  return `${amount.toFixed(2)} ${safeId(c, 6).toUpperCase()}`;
}

export function compact(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const a = Math.abs(n);
  if (a >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (a >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (a >= 10_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.round(n));
}

export function pct(part: number, total: number): string {
  if (!total || !Number.isFinite(part / total)) return "—";
  return `${((part / total) * 100).toFixed(part / total < 0.1 ? 1 : 0)}%`;
}

export function duration(ms: number, lang: Lang): string {
  const totalMin = Math.max(1, Math.round(ms / 60_000));
  if (totalMin < 60) return fmt(translate(lang, "p22oDurMin"), { m: totalMin });
  return fmt(translate(lang, "p22oDurHour"), { h: Math.floor(totalMin / 60), m: totalMin % 60 });
}

/** Toshkent vaqti (UTC+5, yozgi vaqt yo'q). */
const TASHKENT_OFFSET_MS = 5 * 60 * 60_000;
const two = (n: number) => String(n).padStart(2, "0");

export function tashkentTime(t: number): string {
  const d = new Date(t + TASHKENT_OFFSET_MS);
  return `${two(d.getUTCHours())}:${two(d.getUTCMinutes())}`;
}

export function tashkentDate(t: number): string {
  const d = new Date(t + TASHKENT_OFFSET_MS);
  return `${two(d.getUTCDate())}.${two(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
}

/** Toshkent kalendar kuni "YYYY-MM-DD" (dedupe kaliti uchun). */
export function tashkentDay(t: number): string {
  return new Date(t + TASHKENT_OFFSET_MS).toISOString().slice(0, 10);
}

/** UTC kun "YYYYMMDD" va soat "YYYYMMDDHH" (Upstash hisoblagich kalitlari). */
export function utcDayKey(t: number): string {
  return new Date(t).toISOString().slice(0, 10).replace(/-/g, "");
}
export function utcHourKey(t: number): string {
  const iso = new Date(t).toISOString();
  return iso.slice(0, 10).replace(/-/g, "") + iso.slice(11, 13);
}
