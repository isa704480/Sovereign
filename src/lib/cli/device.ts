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
  /** device_name dan ajratilgan OS (Windows / macOS / Linux …) va ilova (CLI / Cowork). */
  os: string | null;
  app: "CLI" | "Cowork" | null;
  requestedAt: string | null;
  /** Terilgan kod shu vaqtgacha amal qiladi (min(sessiya muddati, yaratilgan + 10 daqiqa)). */
  expiresAt: string | null;
  startCountry: string | null;
  /** Boshlovchi IP — taxminiy (IPv4 /24, IPv6 /48); to'liq manzil brauzerga yuborilmaydi. */
  ipApprox: string | null;
  match: NetworkMatch;
}

const OS_NAMES: Record<string, string> = {
  win32: "Windows",
  darwin: "macOS",
  linux: "Linux",
  freebsd: "FreeBSD",
  openbsd: "OpenBSD",
  android: "Android",
  aix: "AIX",
  sunos: "SunOS",
};

/**
 * CLI/Cowork yuboradigan qurilma nomi: "HOST (win32)" yoki "HOST (darwin) · Cowork".
 * Eslatma: bu matnni kirishni BOSHLAGAN tomon yuboradi — ma'lumot uchun, isbot emas.
 */
export function describeDevice(name: string | null | undefined): { host: string; os: string | null; app: "CLI" | "Cowork" | null } {
  const raw = (name ?? "").replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").trim().slice(0, 80);
  const m = /^(.*?)\s*\(([a-z0-9_]{2,16})\)\s*(?:·\s*(.*))?$/i.exec(raw);
  if (!m) return { host: raw, os: null, app: raw ? "CLI" : null };
  const plat = m[2].toLowerCase();
  return {
    host: m[1].trim(),
    os: OS_NAMES[plat] ?? plat,
    app: /cowork/i.test(m[3] ?? "") ? "Cowork" : "CLI",
  };
}

/** Taxminiy IP: IPv4 → "203.0.113.x", IPv6 → "2001:db8:1::/48". Noma'lum → null. */
export function approxIp(ip: string | null | undefined): string | null {
  const raw = (ip ?? "").trim().toLowerCase();
  if (!raw || raw === "unknown") return null;
  if (!raw.includes(":")) {
    const p = raw.split(".");
    return p.length === 4 && p.every((x) => /^\d{1,3}$/.test(x)) ? `${p[0]}.${p[1]}.${p[2]}.x` : null;
  }
  const net = networkKey(raw);
  return net ? `${net.split(":").slice(0, 3).join(":")}::/48` : null;
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
