export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** True when both public Supabase env vars are present. */
export function isSupabaseConfigured(): boolean {
  return SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;
}

/**
 * Umumiy login cookie domeni (masalan ".soveregn.xyz") — landing, app., api. bitta
 * sessiyani ko'radi. Faqat so'rov haqiqatan shu domen (yoki subdomeni)dan kelganda
 * qo'llanadi: localhost / *.vercel.app da boshqa domenli cookie'ni brauzer rad etadi.
 */
export function cookieDomainFor(hostname: string | null | undefined): string | undefined {
  const raw = process.env.NEXT_PUBLIC_COOKIE_DOMAIN?.trim();
  if (!raw || !hostname) return undefined;
  const base = raw.replace(/^\./, "").toLowerCase();
  const host = hostname.split(":")[0].toLowerCase();
  return host === base || host.endsWith(`.${base}`) ? `.${base}` : undefined;
}

/**
 * Sessiya cookie'si httpOnly bo'ladimi (faqat serverda o'qiladi; brauzer baribir httpOnly
 * cookie yoza olmaydi). Standart — o'chiq (avvalgi xatti-harakat). SESSION_COOKIE_HTTPONLY=1
 * FAQAT quyidagilardan keyin yoqiladi: OAuthButtons Google kirishini signInWithGoogleIdToken
 * server action'iga o'tkazgan va landing useSignedIn() SIGNED_IN_HINT_COOKIE'ni o'qiydigan
 * bo'lgach (aks holda JS sessiya cookie'sini ko'rmaydi).
 */
export function sessionCookieHttpOnly(): boolean {
  return typeof window === "undefined" && process.env.SESSION_COOKIE_HTTPONLY === "1";
}

/**
 * httpOnly rejimida landing "kirganmi" ishorasi uchun alohida, MAXFIY BO'LMAGAN cookie
 * (qiymati faqat "1"; token emas). Proxy har so'rovda sessiya holatiga moslaydi.
 */
export const SIGNED_IN_HINT_COOKIE = "sov-signed-in";

/**
 * Sessiya cookie parametrlari: umumiy domen (bo'lsa) + Secure (production/https) +
 * (yoqilgan bo'lsa) httpOnly/SameSite=Lax. httpOnly o'chiq bo'lsa — brauzer Supabase klienti
 * cookie'ni o'qiy oladi (hozirgi holat). maxAge'ni @supabase/ssr o'zi belgilaydi.
 */
export function sessionCookieOptions(
  domain: string | undefined,
  secure: boolean,
  httpOnly = false,
): { domain?: string; secure: boolean; httpOnly?: boolean; sameSite?: "lax" } {
  return { ...(domain ? { domain } : {}), secure, ...(httpOnly ? { httpOnly: true, sameSite: "lax" as const } : {}) };
}

export const SUPABASE_MISSING_MESSAGE =
  "Supabase sozlanmagan: .env.local ichida NEXT_PUBLIC_SUPABASE_URL va NEXT_PUBLIC_SUPABASE_ANON_KEY ni to'ldiring (docs/SETUP.md).";
