/**
 * Mashina o'qiydigan limit/xato kodlari (INQUIRY §B.4, §C T14) — pure, tarmoqsiz, mijozda ham ishlaydi.
 *
 * Ikki kanal:
 *  1) CLI/Cowork (`/api/cli/chat` JSON javobi): `{ error, code }` + `X-Sovereign-Code` sarlavhasi.
 *     Matn (`error`) o'zgarmaydi — mijoz qarorni faqat `code` bo'yicha qiladi (T9 `classifyServerError`).
 *       - "user_limit"   — foydalanuvchi tarifi tugadi (kunlik xabar / oylik token). Retry-After YO'Q.
 *       - "rate_limited" — daqiqalik chastota chegarasi. Retry-After BOR (qayta urinish ma'noli).
 *       - "region"       — mintaqada model yo'q (451). Mahalliy zaxira taklif QILINMAYDI.
 *  2) Web chat (SSE `error` hodisasi): `[limit]` marker prefiksi (T3 `refuse()` da qo'yadi, T4/T5 o'qiydi
 *     va "Cowork'da mahalliy model bilan davom eting" CTA ko'rsatadi).
 *     Kanonik tartib: `[limit]` ENG OLDIDA, keyin mavjud `[upgrade]` / `[upgrade:<plan>]`:
 *       "[limit][upgrade] Kunlik limit tugadi…"
 *     `splitErrorMarkers()` har qanday tartibni (va bo'sh joylarni) qabul qiladi, shuning uchun mijoz
 *     eski `^\[upgrade…\]` regexi o'rniga shu funksiyadan foydalanishi kerak.
 *
 * Test: npx tsx --conditions=react-server src/lib/ai/inquiry/limit-codes.test.ts
 */

export const LIMIT_CODES = ["user_limit", "rate_limited", "region"] as const;
export type LimitCode = (typeof LIMIT_CODES)[number];

/** CLI javobidagi sarlavha — `fetchRetry429` tanani o'qimasdan `user_limit` ni qayta urinmasligi uchun. */
export const LIMIT_CODE_HEADER = "X-Sovereign-Code";

/** Web SSE xato matnidagi limit belgisi. */
export const LIMIT_MARK = "[limit]";

export function isLimitCode(v: unknown): v is LimitCode {
  return typeof v === "string" && (LIMIT_CODES as readonly string[]).includes(v);
}

/**
 * CLI JSON xato javobi: `{ error, code }` + `X-Sovereign-Code`; `retryAfterSec` berilsa `Retry-After`.
 * `status` — chaqiruvchi tanlaydi (429 / 451 / 402); matn o'zgartirilmaydi.
 */
export function limitErrorResponse(
  error: string,
  code: LimitCode,
  status: number,
  retryAfterSec?: number,
): Response {
  const headers: Record<string, string> = { [LIMIT_CODE_HEADER]: code };
  if (retryAfterSec !== undefined && Number.isFinite(retryAfterSec)) {
    headers["Retry-After"] = String(Math.max(1, Math.ceil(retryAfterSec)));
  }
  return Response.json({ error, code }, { status, headers });
}

/** Web: xato matniga `[limit]` qo'yadi (takrorlamaydi). `[upgrade]` bo'lsa — undan OLDIN. */
export function markLimit(message: string): string {
  return splitErrorMarkers(message).limit ? message : `${LIMIT_MARK}${message}`;
}

export type ErrorMarkers = {
  /** `[limit]` bor edi — foydalanuvchi tarifi tugagan (Cowork/mahalliy model CTA). */
  limit: boolean;
  /** `[upgrade]` bor edi — tarif oynasini ochish. */
  upgrade: boolean;
  /** `[upgrade:<plan>]` dagi tarif (masalan "ultra"); bo'lmasa undefined. */
  plan?: string;
  /** Barcha markerlardan tozalangan, foydalanuvchiga ko'rsatiladigan matn. */
  text: string;
};

// Bosh qismdagi markerlar ketma-ketligi: "[limit]", "[upgrade]", "[upgrade:ultra]" — istalgan tartibda.
const LEADING_MARKER = /^\s*\[(limit|upgrade)(?::([a-z]+))?\]/;

/**
 * Xato matnining boshidagi `[limit]` / `[upgrade(:plan)]` markerlarini ajratadi.
 * Faqat BOSHDAGI markerlar hisoblanadi (matn ichidagi "[limit]" — oddiy matn).
 * Har bir marker ko'pi bilan bir marta; jami 4 tadan ortiq marker o'qilmaydi (patologik kirish).
 */
export function splitErrorMarkers(message: string): ErrorMarkers {
  const out: ErrorMarkers = { limit: false, upgrade: false, text: "" };
  let rest = typeof message === "string" ? message : "";
  for (let i = 0; i < 4; i++) {
    const m = LEADING_MARKER.exec(rest);
    if (!m) break;
    if (m[1] === "limit") {
      if (m[2] !== undefined) break; // "[limit:x]" — marker emas
      out.limit = true;
    } else {
      out.upgrade = true;
      if (m[2] && out.plan === undefined) out.plan = m[2];
    }
    rest = rest.slice(m[0].length);
  }
  out.text = rest.trim();
  return out;
}

/** Faqat `[limit]` bormi — tez tekshiruv (T5 CTA). */
export function hasLimitMark(message: string): boolean {
  return splitErrorMarkers(message).limit;
}
