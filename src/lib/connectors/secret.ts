import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Connector maxfiy maydonlarini (OAuth access/refresh token, GitHub/Figma PAT)
 * connector_accounts.config ichida SHIFRLAB saqlash — AES-256-GCM.
 *
 * Format: `enc:v1:<kid>:<iv>:<tag>:<ciphertext>` (base64url). `kid` — kalit
 * barmoq izi (rotatsiya uchun). AAD = `${userId}:${connectorId}:${field}` —
 * shifrlangan qiymatni boshqa foydalanuvchi/connector/maydonga ko'chirib
 * bo'lmaydi.
 *
 * Kalit: env CONNECTOR_TOKEN_KEY (32 bayt: base64 yoki 64 belgili hex).
 * Rotatsiya: eski kalit CONNECTOR_TOKEN_KEY_PREV ga qo'yiladi — faqat o'qish uchun.
 *
 * Kalit sozlanmagan bo'lsa sealField ochiq qiymat YOZMAYDI —
 * ConnectorKeyMissingError tashlaydi (0040 trigger ochiq tokenni baribir rad etadi;
 * chaqiruvchi foydalanuvchiga "server sozlanmagan" xatosini ko'rsatadi).
 * unsealField prefiksiz (eski, ochiq) qiymatni o'zgarishsiz qaytaradi — mavjud
 * qatorlar keyingi server yozuvida shifrlanadi.
 */

export const SEALED_PREFIX = "enc:v1:";
/** Shifrlanadigan config maydonlari. */
export const SECRET_FIELDS = ["token", "refresh"] as const;
export type SecretField = (typeof SECRET_FIELDS)[number];

interface Key {
  kid: string;
  key: Buffer;
}

function parseKey(raw: string | undefined): Key | null {
  const v = raw?.trim();
  if (!v) return null;
  let key: Buffer | null = null;
  if (/^[0-9a-fA-F]{64}$/.test(v)) key = Buffer.from(v, "hex");
  else {
    try {
      const b = Buffer.from(v.replace(/-/g, "+").replace(/_/g, "/"), "base64");
      if (b.length === 32) key = b;
    } catch {
      key = null;
    }
  }
  if (!key || key.length !== 32) {
    // Noto'g'ri kalit — jimgina ochiq saqlashga tushmaymiz: log (qiymatsiz) va null.
    console.error("[connectors/secret] CONNECTOR_TOKEN_KEY 32 bayt (base64 yoki hex) bo'lishi kerak");
    return null;
  }
  const kid = createHash("sha256").update("sov-connector-kid:").update(key).digest("hex").slice(0, 8);
  return { kid, key };
}

/** Barqaror xato kodi — actions/callback uni lokalizatsiya qilingan xabarga aylantiradi. */
export const CONNECTOR_KEY_MISSING = "connector_key_missing" as const;

/** CONNECTOR_TOKEN_KEY sozlanmagan — maxfiy maydonni saqlab bo'lmaydi. */
export class ConnectorKeyMissingError extends Error {
  readonly code = CONNECTOR_KEY_MISSING;
  constructor() {
    super("CONNECTOR_TOKEN_KEY is not configured — connector secrets cannot be stored");
    this.name = "ConnectorKeyMissingError";
  }
}

export function isConnectorKeyMissing(e: unknown): e is ConnectorKeyMissingError {
  return e instanceof ConnectorKeyMissingError || (e as { code?: unknown } | null)?.code === CONNECTOR_KEY_MISSING;
}

/**
 * Connector saqlash xatosini barqaror kodga aylantiradi: ConnectorKeyMissingError yoki
 * 0040 trigger rad etishi ("must be sealed") → connector_key_missing; qolgani → save_failed.
 */
export function connectorSaveErrorCode(err: unknown): typeof CONNECTOR_KEY_MISSING | "save_failed" {
  if (isConnectorKeyMissing(err)) return CONNECTOR_KEY_MISSING;
  const msg = (err as { message?: unknown } | null)?.message;
  return typeof msg === "string" && /must be sealed/i.test(msg) ? CONNECTOR_KEY_MISSING : "save_failed";
}

let keyMissingLogged = false;
function logKeyMissingOnce() {
  if (keyMissingLogged) return;
  keyMissingLogged = true;
  console.error("[connectors/secret] CONNECTOR_TOKEN_KEY sozlanmagan — connector tokenlari saqlanmaydi (server not configured)");
}

/** Joriy (shifrlash) kaliti; env har chaqiruvda o'qiladi (testlar va rotatsiya uchun). */
function currentKey(): Key | null {
  return parseKey(process.env.CONNECTOR_TOKEN_KEY);
}

/** Ochish uchun barcha kalitlar: joriy + oldingi (rotatsiya). */
function allKeys(): Key[] {
  return [currentKey(), parseKey(process.env.CONNECTOR_TOKEN_KEY_PREV)].filter((k): k is Key => !!k);
}

/** Shifrlash yoqilganmi (kalit to'g'ri sozlangan). */
export function tokenCryptoEnabled(): boolean {
  return !!currentKey();
}

export function isSealed(v: unknown): v is string {
  return typeof v === "string" && v.startsWith(SEALED_PREFIX);
}

const b64u = (b: Buffer) => b.toString("base64url");
const aadOf = (userId: string, connectorId: string, field: string) => Buffer.from(`${userId}:${connectorId}:${field}`, "utf8");

/**
 * Qiymatni shifrlaydi. Kalit yo'q bo'lsa — ConnectorKeyMissingError (ochiq
 * qiymat hech qachon qaytarilmaydi). Allaqachon shifrlangan qiymat qayta shifrlanmaydi.
 */
export function sealField(value: string, userId: string, connectorId: string, field: SecretField): string {
  if (isSealed(value)) return value;
  const k = currentKey();
  if (!k) {
    logKeyMissingOnce();
    throw new ConnectorKeyMissingError();
  }
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", k.key, iv);
  c.setAAD(aadOf(userId, connectorId, field));
  const ct = Buffer.concat([c.update(value, "utf8"), c.final()]);
  return `${SEALED_PREFIX}${k.kid}:${b64u(iv)}:${b64u(c.getAuthTag())}:${b64u(ct)}`;
}

/**
 * Qiymatni ochadi. Prefiksiz (eski, ochiq) qiymat o'zgarishsiz qaytadi.
 * Shifrlangan, lekin ochib bo'lmasa (kalit yo'q/almashgan, buzilgan, boshqa
 * foydalanuvchiniki) — null: chaqiruvchi uni "ulanmagan" deb hisoblaydi.
 */
export function unsealField(value: string, userId: string, connectorId: string, field: SecretField): string | null {
  if (!isSealed(value)) return value;
  const parts = value.slice(SEALED_PREFIX.length).split(":");
  if (parts.length !== 4) return null;
  const [kid, ivS, tagS, ctS] = parts;
  const k = allKeys().find((x) => x.kid === kid);
  if (!k) return null;
  try {
    const iv = Buffer.from(ivS, "base64url");
    const tag = Buffer.from(tagS, "base64url");
    if (iv.length !== 12 || tag.length !== 16) return null;
    const d = createDecipheriv("aes-256-gcm", k.key, iv);
    d.setAAD(aadOf(userId, connectorId, field));
    d.setAuthTag(tag);
    return Buffer.concat([d.update(Buffer.from(ctS, "base64url")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/**
 * config ichidagi token/refresh'ni shifrlaydi (qolgan maydonlar o'zgarmaydi).
 * Kalit yo'q va ochiq maxfiy maydon bo'lsa — ConnectorKeyMissingError.
 */
export function sealConnectorConfig(
  userId: string,
  connectorId: string,
  config: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...config };
  for (const f of SECRET_FIELDS) {
    const v = out[f];
    if (typeof v === "string" && v) out[f] = sealField(v, userId, connectorId, f);
  }
  return out;
}

/**
 * config ichidagi token/refresh'ni ochadi. Ochib bo'lmagan maydon olib tashlanadi
 * (token yo'q = connector ulanmagan deb hisoblanadi; refresh yo'q = yangilanmaydi).
 */
export function unsealConnectorConfig(
  userId: string,
  connectorId: string,
  config: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...config };
  for (const f of SECRET_FIELDS) {
    const v = out[f];
    if (typeof v !== "string") continue;
    const plain = unsealField(v, userId, connectorId, f);
    if (plain === null) delete out[f];
    else out[f] = plain;
  }
  return out;
}

/** config'da hali shifrlanmagan (eski, ochiq) maxfiy maydon bormi — lazy qayta shifrlash uchun. */
export function hasPlaintextSecret(config: Record<string, unknown>): boolean {
  return SECRET_FIELDS.some((f) => typeof config[f] === "string" && !!config[f] && !isSealed(config[f]));
}
