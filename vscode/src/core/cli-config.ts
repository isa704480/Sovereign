/**
 * "CLI'dagi mavjud kirishdan foydalanish" — `~/.sovereign/config.json` dan tokenni o'qish.
 *
 * Fayl CLI'niki: uni foydalanuvchi (yoki boshqa dastur) tahrirlagan bo'lishi mumkin, shuning
 * uchun ISHONCHSIZ ma'lumot deb qaraladi — har maydon tekshiriladi, `baseUrl` tozalanadi.
 * O'qilgan token darhol SecretStorage ga ko'chiriladi; fayl o'zgartirilmaydi va token
 * hech qayerga qayta yozilmaydi.
 *
 * Sof modul (fayl tizimiga tegmaydi): `readCliConfig` matnni oladi, o'qishni chaqiruvchi bajaradi.
 */
import { isPlausibleToken } from "./secrets";
import { DEFAULT_BASE_URL, sanitizeBaseUrl } from "./url";

export interface CliAuth {
  baseUrl: string;
  token: string;
  email: string;
}

/** `config.json` matnidan kirish ma'lumotlari; token bo'lmasa/yaroqsiz bo'lsa — null. */
export function parseCliConfig(raw: string | null | undefined): CliAuth | null {
  if (typeof raw !== "string" || raw.length > 1_000_000) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  const obj = parsed as Record<string, unknown>;
  const token = typeof obj.token === "string" ? obj.token.trim() : "";
  if (!isPlausibleToken(token)) return null;
  const email = typeof obj.email === "string" && obj.email.length <= 320 ? obj.email.trim() : "";
  return {
    baseUrl: sanitizeBaseUrl(obj.baseUrl, DEFAULT_BASE_URL),
    token,
    email,
  };
}

/** CLI konfiguratsiyasining odatiy yo'li (platformadan qat'i nazar `~/.sovereign/config.json`). */
export function cliConfigPath(homeDir: string): string {
  const sep = homeDir.includes("\\") && !homeDir.includes("/") ? "\\" : "/";
  return `${homeDir.replace(/[\\/]+$/, "")}${sep}.sovereign${sep}config.json`;
}
