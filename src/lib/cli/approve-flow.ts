import { isDeviceCode, sessionId } from "./device";
import { checkTypedCode, sessionState, type CliSessionRow } from "./user-code";

/**
 * Device-login tasdig'i: terilgan kodni tekshirish + noto'g'ri urinishlar chegarasi +
 * tasdiqlash. Tarmoq/baza bog'liqliklari tashqaridan beriladi (server action — haqiqiy,
 * testlar — soxta), shuning uchun butun mantiq tarmoqsiz sinovdan o'tadi:
 *   npx tsx --conditions=react-server src/lib/cli/approve-flow.test.ts
 */

/** Bitta device kodi uchun noto'g'ri urinishlar: shundan keyin sessiya bekor qilinadi. */
export const CODE_MAX_FAILS = 5;
/** Bitta foydalanuvchi (barcha kodlar bo'yicha) — 15 daqiqada. */
export const USER_MAX_FAILS = 10;
/** Bitta IP (IPv6 — /64) — 15 daqiqada (NAT ortidagi bir nechta odam uchun zaxira bilan). */
export const IP_MAX_FAILS = 20;
/** Hisoblagich oynasi (kod ≤ 10 daqiqa yashaydi — qulf undan uzoqroq). */
export const FAIL_WINDOW_MS = 15 * 60_000;

export type ApproveFailure =
  | "malformed" // kod formati noto'g'ri (hisoblanmaydi)
  | "mismatch" // kod mos kelmadi (hisoblanadi)
  | "locked" // shu kod uchun urinishlar tugadi — sessiya bekor qilindi
  | "rate_limited" // foydalanuvchi yoki IP bo'yicha chegara
  | "expired" // muddati o'tgan / bekor qilingan / topilmadi
  | "used" // boshqa hisob allaqachon tasdiqlagan
  | "unavailable" // server siri sozlanmagan
  | "error"; // baza xatosi

export type ApproveOutcome = { ok: true } | { ok: false; reason: ApproveFailure; remaining?: number };

export interface FailureCounter {
  count(key: string): Promise<number>;
  record(key: string, windowMs: number): Promise<number>;
}

export interface ApproveDeps {
  now(): number;
  secret: Buffer | null;
  failures: FailureCounter;
  /** Service role bilan bitta qator; topilmasa null; xato — "error". */
  loadSession(deviceCode: string): Promise<CliSessionRow | null | "error">;
  /** cli_approve semantikasi: true — tasdiqlandi, false — kutilayotgan kod yo'q. */
  approve(deviceCode: string): Promise<boolean | "error">;
  /** Urinishlar tugaganda sessiyani serverda bekor qilish (0040 cli_deny; yo'q bo'lsa — jim). */
  deny(deviceCode: string): Promise<void>;
}

export interface ApproveInput {
  deviceCode: string;
  typed: unknown;
  userId: string;
  /** rate-limit uchun tayyor kalit (ipKey) yoki null. */
  ip: string | null;
  /** Eski mijoz havolasi (`?code=`) va CLI_LEGACY_LOGIN yoqilgan. */
  allowLegacy: boolean;
}

export function failureKeys(input: Pick<ApproveInput, "deviceCode" | "userId" | "ip">) {
  return {
    // Device kodi Redis'ga tushmaydi — faqat uning hash'i (sessionId).
    code: `cli-uc:c:${sessionId(input.deviceCode)}`,
    user: `cli-uc:u:${input.userId}`,
    ip: input.ip ? `cli-uc:ip:${input.ip}` : null,
  };
}

export async function approveWithTypedCode(deps: ApproveDeps, input: ApproveInput): Promise<ApproveOutcome> {
  if (!isDeviceCode(input.deviceCode)) return { ok: false, reason: "expired" };
  if (!deps.secret) return { ok: false, reason: "unavailable" };

  // 1. Chegaralar — kodni solishtirishdan OLDIN (qulflangan holatda to'g'ri kod ham o'tmaydi).
  const keys = failureKeys(input);
  const [codeFails, userFails, ipFails] = await Promise.all([
    deps.failures.count(keys.code),
    deps.failures.count(keys.user),
    keys.ip ? deps.failures.count(keys.ip) : Promise.resolve(0),
  ]);
  if (codeFails >= CODE_MAX_FAILS) return { ok: false, reason: "locked" };
  if (userFails >= USER_MAX_FAILS || ipFails >= IP_MAX_FAILS) return { ok: false, reason: "rate_limited" };

  // 2. Format (noto'g'ri formatdagi kiritish — urinish hisoblanmaydi, u hech narsani taxmin qilmaydi).
  const check = checkTypedCode({ deviceCode: input.deviceCode, typed: input.typed, secret: deps.secret, allowLegacy: input.allowLegacy });
  if (check === "malformed") return { ok: false, reason: "malformed" };

  // 3. Sessiya holati (muddati, bir martalik, boshqa foydalanuvchi).
  const row = await deps.loadSession(input.deviceCode);
  if (row === "error") return { ok: false, reason: "error" };
  const state = sessionState(row, input.userId, deps.now());
  if (state === "expired") return { ok: false, reason: "expired" };
  if (state === "used") return { ok: false, reason: "used" };

  // 4. Kod mos kelmadi — uchala hisoblagich oshadi; kod bo'yicha chegara → sessiya bekor.
  if (check === "mismatch") {
    const [c] = await Promise.all([
      deps.failures.record(keys.code, FAIL_WINDOW_MS),
      deps.failures.record(keys.user, FAIL_WINDOW_MS),
      keys.ip ? deps.failures.record(keys.ip, FAIL_WINDOW_MS) : Promise.resolve(0),
    ]);
    if (c >= CODE_MAX_FAILS) {
      await deps.deny(input.deviceCode).catch(() => undefined);
      return { ok: false, reason: "locked" };
    }
    return { ok: false, reason: "mismatch", remaining: Math.max(0, CODE_MAX_FAILS - c) };
  }

  // 5. Tasdiqlash (cli_approve: foydalanuvchiga bog'laydi, faqat pending → approved).
  if (state === "approved_self") return { ok: true };
  const res = await deps.approve(input.deviceCode);
  if (res === "error") return { ok: false, reason: "error" };
  return res ? { ok: true } : { ok: false, reason: "expired" };
}
