/**
 * Server manzilini tozalash — CLI'dagi `sanitizeBaseUrl` (cli/src/config.mjs) bilan bir xil
 * qoida: faqat `https:`, yoki mahalliy ishlab chiqish uchun `http://localhost`. Aks holda
 * token boshqa sxema/xostga ketishi mumkin edi (`file:`, `javascript:`, ochiq `http:`).
 */

export const DEFAULT_BASE_URL = "https://soveregn.xyz";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export function sanitizeBaseUrl(raw: unknown, fallback = DEFAULT_BASE_URL): string {
  try {
    const u = new URL(String(raw ?? "").trim());
    const local = LOCAL_HOSTS.has(u.hostname);
    if (u.protocol === "https:" || (u.protocol === "http:" && local)) {
      return `${u.origin}${u.pathname}`.replace(/\/+$/, "");
    }
  } catch {
    /* noto'g'ri URL */
  }
  return fallback;
}

/** Manzil sozlamasi to'g'rimi — ogohlantirish ko'rsatish uchun. */
export function isAcceptableBaseUrl(raw: unknown): boolean {
  return sanitizeBaseUrl(raw, "\u0000") !== "\u0000";
}

/** `base` + yo'l (yo'l har doim bizning kodimizdan keladi, foydalanuvchidan emas). */
export function apiUrl(base: string, path: string): string {
  return `${sanitizeBaseUrl(base)}${path.startsWith("/") ? path : `/${path}`}`;
}
