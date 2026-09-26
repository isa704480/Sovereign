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
 * Sessiya cookie parametrlari: umumiy domen (bo'lsa) + Secure (production/https).
 * httpOnly=false qoladi — brauzer Supabase klienti cookie'ni o'qiydi. maxAge'ni
 * @supabase/ssr o'zi belgilaydi.
 */
export function sessionCookieOptions(domain: string | undefined, secure: boolean): { domain?: string; secure: boolean } {
  return { ...(domain ? { domain } : {}), secure };
}

export const SUPABASE_MISSING_MESSAGE =
  "Supabase sozlanmagan: .env.local ichida NEXT_PUBLIC_SUPABASE_URL va NEXT_PUBLIC_SUPABASE_ANON_KEY ni to'ldiring (docs/SETUP.md).";
