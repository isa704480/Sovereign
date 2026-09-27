import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeCountry, restrictedRegion, sanctionedRegion } from "@/lib/ai/region";

/**
 * Foydalanuvchi mintaqasini SERVERDA aniqlash (mijoz yuborgan qiymatga ishonilmaydi).
 *
 * Signallar — birortasi cheklangan mintaqani ko'rsatsa, foydalanuvchi shu mintaqada
 * deb hisoblanadi (VPN bilan chetlab o'tib bo'lmasin):
 *   1) IP mamlakati — Vercel edge qo'yadigan `x-vercel-ip-country` (mijoz uni
 *      o'zgartira olmaydi: Vercel kiruvchi sarlavhani qayta yozadi);
 *   2) to'lov — RollyPay SBP (faqat Rossiya banklari) orqali to'langan buyurtma → RU;
 *   3) onboarding'da foydalanuvchi o'zi tanlagan mamlakat (profiles.onboarding.country).
 * Migratsiya kerak emas: mavjud orders / profiles ustunlaridan foydalaniladi.
 *
 * REGION_FORCE_COUNTRY (env, masalan "RU") — lokal sinov uchun: hamma so'rov shu mamlakatdan.
 */

export type RegionSource = "ip" | "billing" | "profile" | "env";

export interface UserRegion {
  /** Siyosat qo'llanadigan mamlakat (cheklangan signal bo'lsa — o'sha), yoki IP mamlakati. */
  country: string | null;
  restricted: boolean;
  /** OFAC to'liq embargo — hech bir tashqi provayder ishlamaydi. */
  sanctioned: boolean;
  source: RegionSource | null;
}

const NONE: UserRegion = { country: null, restricted: false, sanctioned: false, source: null };

/** Kripto (RollyPay) buyurtmalari shu prefiks bilan yaratiladi — ular mintaqa signali emas. */
export const ROLLYPAY_CRYPTO_ORDER_PREFIX = "sov_cry_";

export function ipCountry(headers: Headers): string | null {
  return normalizeCountry(headers.get("x-vercel-ip-country"));
}

/**
 * RollyPay orqali to'langan (SBP/RUB) buyurtma bormi. Kripto buyurtmalar (prefiks)
 * hisobga olinmaydi; prefikssiz eski RollyPay buyurtmalari — standart usul SBP edi,
 * shuning uchun ehtiyotkorlik bilan SBP deb hisoblanadi.
 * `supabase` — foydalanuvchi sessiyasi (RLS: faqat o'z buyurtmalari) yoki service client.
 */
export async function hasSbpPayment(supabase: SupabaseClient, userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("orders")
      .select("id")
      .eq("user_id", userId)
      .eq("provider", "rollypay")
      .not("paid_at", "is", null)
      .not("id", "like", `${ROLLYPAY_CRYPTO_ORDER_PREFIX}%`)
      .limit(1);
    if (error) {
      console.error("[region] orders:", error.message);
      return false;
    }
    return Array.isArray(data) && data.length > 0;
  } catch (e) {
    console.error("[region] orders:", e instanceof Error ? e.message : e);
    return false;
  }
}

function build(country: string, source: RegionSource): UserRegion {
  return { country, restricted: restrictedRegion(country), sanctioned: sanctionedRegion(country), source };
}

/**
 * Yakuniy mintaqa. `onboarding` — profiles.onboarding (bo'lsa, qayta so'ralmaydi).
 * `supabase`/`userId` bo'lmasa — faqat IP.
 */
export async function resolveUserRegion(opts: {
  headers: Headers;
  supabase?: SupabaseClient | null;
  userId?: string | null;
  onboarding?: Record<string, unknown> | null;
}): Promise<UserRegion> {
  const forced = normalizeCountry(process.env.REGION_FORCE_COUNTRY);
  if (forced) return build(forced, "env");

  const ip = ipCountry(opts.headers);
  if (ip && restrictedRegion(ip)) return build(ip, "ip");

  if (opts.supabase && opts.userId) {
    let onboarding = opts.onboarding;
    if (onboarding === undefined) {
      try {
        const { data } = await opts.supabase.from("profiles").select("onboarding").eq("id", opts.userId).maybeSingle();
        onboarding = ((data as { onboarding?: Record<string, unknown> | null } | null)?.onboarding ?? null) as Record<
          string,
          unknown
        > | null;
      } catch {
        onboarding = null;
      }
    }
    const self = normalizeCountry(typeof onboarding?.country === "string" ? onboarding.country : null);
    if (self && restrictedRegion(self)) return build(self, "profile");
    if (await hasSbpPayment(opts.supabase, opts.userId)) return build("RU", "billing");
  }

  return ip ? build(ip, "ip") : NONE;
}
