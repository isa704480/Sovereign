import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { isDeviceCode } from "./device";
import { LEGACY_CODE_LENGTH, USER_CODE_ALPHABET, USER_CODE_LENGTH, normalizeLegacyCode, normalizeUserCode } from "./user-code-format";

/**
 * CLI / Cowork device-login: user code va URL "handle" (faqat serverda; node:crypto).
 * Testlar: npx tsx --conditions=react-server src/lib/cli/user-code.test.ts
 *
 * Nega bazada saqlanmaydi: user code = HMAC(server siri, device kodi) — device sessiyasiga
 * kriptografik bog'langan, plaintext ham, hash ham bazaga yozilmaydi, migratsiyasiz ishlaydi
 * (0038–0042 qo'llanmagan prod'da ham). Tekshiruv — qayta hisoblash + timingSafeEqual.
 * Bir martalik: sessiya faqat bir marta "pending → approved" bo'ladi (cli_approve), token esa
 * bir marta yetkaziladi (cli_poll). Muddat: min(sessiya muddati, yaratilgan + 10 daqiqa).
 *
 * "Handle": yangi mijozlar uchun tasdiqlash URL'ida device kodining o'rniga uning AES-256-GCM
 * bilan shifrlangan ko'rinishi. URL'ni ko'rgan odam (brauzer tarixi, ekran ulashish, proksi
 * jurnali) device kodini bilmaydi → na /api/cli/poll'dan tokenni o'g'irlay oladi, na eski
 * ("legacy") yo'l bilan kodning boshini terib tasdiqlay oladi (downgrade yo'q).
 */

/** Terilgan kod shu vaqt ichida amal qiladi (sessiya muddati bundan qisqa bo'lsa — o'sha). */
export const USER_CODE_TTL_MS = 10 * 60_000;

const MASTER_LABEL = "sovereign/cli-device-login/master:v1";

/**
 * Server siri: CLI_USER_CODE_SECRET (≥ 32 belgi) yoki — sozlanmagan bo'lsa —
 * SUPABASE_SERVICE_ROLE_KEY dan domen ajratilgan HMAC bilan hosil qilinadi (kalitning o'zi
 * ishlatilmaydi). Har ikkisi yo'q → null (kirish ishlamaydi, /api/cli/start ham service role'siz
 * ishlamaydi). Sir almashsa — faqat kutilayotgan (≤ 10 daqiqalik) kirishlar bekor bo'ladi.
 */
export function cliCodeSecret(env: Record<string, string | undefined> = process.env): Buffer | null {
  const dedicated = env.CLI_USER_CODE_SECRET?.trim();
  const source = dedicated && dedicated.length >= 32 ? `dedicated:${dedicated}` : null;
  const sr = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const fallback = sr && sr.length >= 20 ? `service-role:${sr}` : null;
  const material = source ?? fallback;
  if (!material) return null;
  return createHmac("sha256", MASTER_LABEL).update(material).digest();
}

function subkey(secret: Buffer, label: string): Buffer {
  return createHmac("sha256", secret).update(label).digest();
}

/** Device kodi uchun kanonik user code (8 belgi, chiziqchasiz). Deterministik. */
export function deriveUserCode(deviceCode: string, secret: Buffer): string {
  const mac = createHmac("sha256", subkey(secret, "user-code:v1")).update(deviceCode.trim().toLowerCase()).digest();
  // 5 bayt = 40 bit = 8 × 5 bit; 32 belgili alifbo — bias yo'q. 2^40 < 2^53 — Number xavfsiz.
  let n = mac.readUIntBE(0, 5);
  let out = "";
  for (let i = 0; i < USER_CODE_LENGTH; i++) {
    out = USER_CODE_ALPHABET[n % 32] + out;
    n = Math.floor(n / 32);
  }
  return out;
}

const HANDLE_AAD = Buffer.from("sov-cli-handle:v1");

/** Device kodi → URL uchun shaffof bo'lmagan handle (base64url, har chaqiruvda boshqacha). */
export function sealDeviceCode(deviceCode: string, secret: Buffer): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", subkey(secret, "handle:v1"), iv);
  c.setAAD(HANDLE_AAD);
  const ct = Buffer.concat([c.update(deviceCode.trim().toLowerCase(), "utf8"), c.final()]);
  return Buffer.concat([iv, ct, c.getAuthTag()]).toString("base64url");
}

/** Handle → device kodi; soxta / buzilgan / boshqa sir bilan yaratilgan bo'lsa null. */
export function openDeviceCode(handle: unknown, secret: Buffer | null): string | null {
  if (!secret || typeof handle !== "string" || !/^[A-Za-z0-9_-]{40,200}$/.test(handle)) return null;
  try {
    const raw = Buffer.from(handle, "base64url");
    if (raw.length < 12 + 16 + 10) return null;
    const d = createDecipheriv("aes-256-gcm", subkey(secret, "handle:v1"), raw.subarray(0, 12));
    d.setAAD(HANDLE_AAD);
    d.setAuthTag(raw.subarray(raw.length - 16));
    const code = Buffer.concat([d.update(raw.subarray(12, raw.length - 16)), d.final()]).toString("utf8");
    return isDeviceCode(code) ? code : null;
  } catch {
    return null;
  }
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export type TypedCheck = "ok" | "mismatch" | "malformed";

/**
 * Terilgan kodni tekshiradi. `allowLegacy` — faqat eski mijozlarning `?code=` havolasi uchun:
 * device kodining birinchi 8 belgisi ham qabul qilinadi (eski Cowork uni ekranda ko'rsatadi).
 * 8 belgili hex satr Crockford alifbosida ham to'g'ri, shuning uchun ikkala shakl solishtiriladi.
 */
export function checkTypedCode(opts: { deviceCode: string; typed: unknown; secret: Buffer; allowLegacy: boolean }): TypedCheck {
  const uc = normalizeUserCode(opts.typed);
  const lc = opts.allowLegacy ? normalizeLegacyCode(opts.typed) : null;
  if (!uc && !lc) return "malformed";
  let ok = false;
  if (uc) ok = safeEqual(uc, deriveUserCode(opts.deviceCode, opts.secret)) || ok;
  if (lc) ok = safeEqual(lc, opts.deviceCode.trim().toLowerCase().slice(0, LEGACY_CODE_LENGTH)) || ok;
  return ok ? "ok" : "mismatch";
}

/** cli_sessions dan (service role) o'qiladigan maydonlar. */
export interface CliSessionRow {
  approved: boolean;
  revoked_at: string | null;
  expires_at: string;
  created_at: string;
  user_id: string | null;
}

/**
 * Sessiya holati tasdiqlovchi foydalanuvchi nuqtai nazaridan:
 *  - pending        — kutilmoqda, tasdiqlash mumkin;
 *  - approved_self  — shu foydalanuvchi allaqachon tasdiqlagan (cli_approve → true, idempotent);
 *  - used           — BOSHQA hisob tasdiqlagan (bir martalik — qayta ishlatib bo'lmaydi);
 *  - expired        — muddati o'tgan, bekor qilingan yoki topilmadi.
 */
export type SessionState = "pending" | "approved_self" | "used" | "expired";

export function sessionState(row: CliSessionRow | null, userId: string, now: number): SessionState {
  if (!row || row.revoked_at) return "expired";
  if (row.approved) return row.user_id && row.user_id === userId ? "approved_self" : "used";
  const created = Date.parse(row.created_at);
  const exp = Date.parse(row.expires_at);
  if (!Number.isFinite(created) || !Number.isFinite(exp)) return "expired";
  return now < Math.min(exp, created + USER_CODE_TTL_MS) ? "pending" : "expired";
}

/**
 * Eski mijozlar (`/cli/connect?code=...`) yo'li. Standart — yoqilgan (eski CLI/Cowork kira olsin).
 * Ko'pchilik yangilangach o'chiriladi: CLI_LEGACY_LOGIN=off (yoki 0 / false).
 */
export function legacyLoginEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const v = (env.CLI_LEGACY_LOGIN ?? "").trim().toLowerCase();
  return !(v === "off" || v === "0" || v === "false" || v === "no");
}

/** Tasdiqlash sahifasi / action'ga keladigan havola: yangi (`h`) yoki eski (`code`). */
export type CliLoginRef = { kind: "h" | "code"; value: string };

export type ResolvedRef =
  | { ok: true; deviceCode: string; legacy: boolean }
  | { ok: false; reason: "invalid" | "legacy_disabled" };

export function resolveLoginRef(ref: unknown, secret: Buffer | null, legacyEnabled: boolean): ResolvedRef {
  const r = ref as Partial<CliLoginRef> | null;
  if (!r || typeof r !== "object" || typeof r.value !== "string" || r.value.length > 200) return { ok: false, reason: "invalid" };
  if (r.kind === "h") {
    const deviceCode = openDeviceCode(r.value, secret);
    return deviceCode ? { ok: true, deviceCode, legacy: false } : { ok: false, reason: "invalid" };
  }
  if (r.kind === "code") {
    if (!isDeviceCode(r.value)) return { ok: false, reason: "invalid" };
    if (!legacyEnabled) return { ok: false, reason: "legacy_disabled" };
    return { ok: true, deviceCode: r.value.toLowerCase(), legacy: true };
  }
  return { ok: false, reason: "invalid" };
}
