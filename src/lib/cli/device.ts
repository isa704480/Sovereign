import { createHash } from "node:crypto";

/**
 * CLI/Cowork device-login va /api/cli/* uchun umumiy, sof (tarmoqsiz) yordamchilar.
 * Testlar: npx tsx --conditions=react-server src/lib/cli/device.test.ts
 */

/** `Authorization: Bearer <token>` — bo'sh yoki 512 belgidan uzun bo'lsa null. */
export function bearerToken(req: Request): string | null {
  const h = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  const token = m ? m[1].trim() : "";
  return token && token.length <= 512 ? token : null;
}

/**
 * Rate-limit kaliti: token o'zi (yoki uning prefiksi) Redis'ga/logga tushmasin (cli-api-3).
 * sha256 → 32 hex; /api/cli/inquiry bilan bir xil.
 */
export function tokenKey(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 32);
}

/** Qurilmalar ro'yxatida sessiya kodining o'rniga ishlatiladigan shaffof bo'lmagan id. */
export function sessionId(code: string): string {
  return createHash("sha256").update(`cli-session:${code}`).digest("hex").slice(0, 24);
}

/** Device kodi: cli_start 24 bayt hex (48 belgi) qaytaradi; eski/boshqa uzunliklarga ham joy. */
export function isDeviceCode(code: unknown): code is string {
  return typeof code === "string" && /^[0-9a-f]{10,80}$/i.test(code);
}

/** Vercel `x-vercel-ip-country` — 2 harfli kod yoki null. */
export function countryOf(headers: Headers): string | null {
  const v = (headers.get("x-vercel-ip-country") ?? "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(v) && v !== "XX" ? v : null;
}

/** Client IP (Vercel / proxy sarlavhalari) — rate-limit.ts clientIp bilan bir xil, Headers uchun. */
export function ipFromHeaders(headers: Headers): string | null {
  const ip = headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip")?.trim() || "";
  return ip && ip.length <= 64 ? ip : null;
}

/** IP ni solishtirish uchun: IPv4 — o'zi, IPv6 — /64 prefiks (maxfiylik manzillari almashadi). */
export function networkKey(ip: string | null | undefined): string | null {
  const raw = (ip ?? "").trim().toLowerCase();
  if (!raw || raw === "unknown") return null;
  if (!raw.includes(":")) return raw;
  const [head] = raw.split("%");
  const parts = head.split("::");
  const left = parts[0] ? parts[0].split(":") : [];
  const right = parts.length > 1 && parts[1] ? parts[1].split(":") : [];
  const groups =
    parts.length > 1 ? [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right] : left;
  return groups
    .slice(0, 4)
    .map((g) => (g || "0").replace(/^0+(?=.)/, ""))
    .join(":");
}

/**
 * Kirishni boshlagan qurilma tarmog'i bilan tasdiqlayotgan brauzer tarmog'ini solishtiradi.
 *  - "same": bir xil IP (yoki IPv6 /64) — odatdagi holat (bir kompyuter);
 *  - "other-ip": mamlakat bir xil yoki noma'lum, IP boshqa (SSH, VPN, IPv4/IPv6 farqi);
 *  - "other-country": ikkala mamlakat ma'lum va farqli — phishing belgisi, qat'iy ogohlantirish;
 *  - "unknown": boshlovchi haqida ma'lumot yo'q (eski qator yoki migratsiya hali ishlamagan).
 */
export type NetworkMatch = "same" | "other-ip" | "other-country" | "unknown";

export function networkMatch(start: { ip?: string | null; country?: string | null }, viewer: { ip?: string | null; country?: string | null }): NetworkMatch {
  const a = networkKey(start.ip);
  const b = networkKey(viewer.ip);
  const ca = (start.country ?? "").toUpperCase() || null;
  const cb = (viewer.country ?? "").toUpperCase() || null;
  if (!a && !ca) return "unknown";
  if (a && b && a === b) return "same";
  if (ca && cb && ca !== cb) return "other-country";
  if (!a || !b) return "unknown";
  return "other-ip";
}

/** Tasdiqlash sahifasiga uzatiladigan kontekst (cli-api-1). */
export interface PendingInfo {
  /** Kod hali tasdiqlanishi mumkinmi (false — eskirgan / bekor qilingan / ishlatilgan). */
  pending: boolean;
  device: string;
  requestedAt: string | null;
  startCountry: string | null;
  startIp: string | null;
  match: NetworkMatch;
}

/** Boshqa tarmoqdan kelgan so'rovni tasdiqlashdan oldin aniq tasdiq (checkbox) kerakmi. */
export function needsExplicitConfirm(m: NetworkMatch): boolean {
  return m === "other-country";
}

/** Hakam yo'llaridan pullik bo'lganlari (byudjet guard yoqilganda o'tkaziladi). */
export const PAID_JUDGE_ROUTES: ReadonlySet<string> = new Set(["mistral", "openrouter"]);

export function freeJudgePool<T extends { route: string }>(pool: readonly T[]): T[] {
  return pool.filter((c) => !PAID_JUDGE_ROUTES.has(c.route));
}

/** /api/cli/verify uchun foydalanuvchi bo'yicha kunlik chaqiruv chegarasi (tokenlar soniga bog'liq emas). */
export function verifyDailyCap(messagesPerDay: number): number {
  const n = Number.isFinite(messagesPerDay) && messagesPerDay > 0 ? messagesPerDay : 0;
  return Math.min(2_000, Math.max(100, Math.round(n * 2)));
}

/** Hakam chaqiruvi uchun taxminiy token hisobi (~4 belgi = 1 token; provayder usage bermaydi). */
export function estimateTokens(chars: number): number {
  return Math.max(0, Math.round((Number.isFinite(chars) ? chars : 0) / 4));
}
