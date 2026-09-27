/**
 * Token saqlash — VS Code SecretStorage ustidan yupqa qatlam.
 *
 * Qoidalar:
 *  - token FAQAT `context.secrets` da turadi (OS kalit saqlagichi). settings.json ga,
 *    workspace state'ga yoki ish papkasidagi hech qanday faylga yozilmaydi;
 *  - token hech qachon jurnalga (console / OutputChannel) chiqmaydi — kerak bo'lsa `maskToken`;
 *  - saqlashdan oldin shakli tekshiriladi (bo'shliq/boshqaruv belgisi bo'lgan qiymat
 *    Authorization sarlavhasini buzishi mumkin — HTTP header injection).
 *
 * Sof modul: `vscode` ni import qilmaydi, faqat kerakli interfeysni talab qiladi —
 * shuning uchun soxta (fake) SecretStorage bilan `node --test` da sinaladi.
 */

export const TOKEN_KEY = "sovereign.apiToken";
export const EMAIL_KEY = "sovereign.accountEmail";

/** `vscode.SecretStorage` ning bizga kerakli qismi (`Thenable` ≡ `PromiseLike`). */
export interface SecretStorageLike {
  get(key: string): PromiseLike<string | undefined>;
  store(key: string, value: string): PromiseLike<void>;
  delete(key: string): PromiseLike<void>;
}

export const MIN_TOKEN_CHARS = 16;
export const MAX_TOKEN_CHARS = 512;

/** Token shakli: bo'shliqsiz, boshqaruv belgilarisiz ASCII, 16–512 belgi. */
export function isPlausibleToken(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const v = value.trim();
  if (v.length < MIN_TOKEN_CHARS || v.length > MAX_TOKEN_CHARS) return false;
  return /^[\x21-\x7e]+$/.test(v);
}

/** Jurnalga chiqarish uchun: oxirgi 4 belgi va uzunlik. Tokenning o'zi hech qachon chiqmaydi. */
export function maskToken(value: string | null | undefined): string {
  if (!value) return "—";
  const v = value.trim();
  return `…${v.slice(-4)} (${v.length})`;
}

export class TokenStore {
  constructor(private readonly secrets: SecretStorageLike) {}

  async get(): Promise<string | null> {
    const raw = await this.secrets.get(TOKEN_KEY);
    if (!isPlausibleToken(raw)) return null;
    return raw.trim();
  }

  async has(): Promise<boolean> {
    return (await this.get()) !== null;
  }

  /** @returns saqlandimi (shakli noto'g'ri bo'lsa — false, hech narsa yozilmaydi). */
  async set(token: unknown, email?: string): Promise<boolean> {
    if (!isPlausibleToken(token)) return false;
    await this.secrets.store(TOKEN_KEY, token.trim());
    if (typeof email === "string" && email.trim() && email.length <= 320) {
      await this.secrets.store(EMAIL_KEY, email.trim());
    }
    return true;
  }

  async email(): Promise<string | null> {
    const raw = await this.secrets.get(EMAIL_KEY);
    return typeof raw === "string" && raw.trim() ? raw.trim() : null;
  }

  async clear(): Promise<void> {
    await this.secrets.delete(TOKEN_KEY);
    await this.secrets.delete(EMAIL_KEY);
  }
}
