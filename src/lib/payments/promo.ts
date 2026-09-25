import "server-only";
import type { TKey } from "@/lib/i18n";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Saytning o'z promokodlari (ZenoBank'da kupon tizimi yo'q). Kodlar faqat
 * serverda — Vercel env `PROMO_CODES` da saqlanadi:
 *   PROMO_CODES=SOVTEST99:99:3,FRIEND50:50:20   (kod:foiz:maksimal_ishlatish)
 * Har foydalanuvchi bitta kodni bir marta ishlatadi. Kripto tarmoqlarida juda
 * kichik summa o'tmaydi — chegirmali narx PROMO_MIN_USD (default $1) dan tushmaydi.
 */
interface PromoDef {
  code: string;
  percent: number;
  maxUses: number;
}

function promoDefs(): PromoDef[] {
  return (process.env.PROMO_CODES ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .flatMap((entry) => {
      const [code, pct, max] = entry.split(":");
      const percent = Number(pct);
      const maxUses = Number(max ?? "1");
      if (!code || !Number.isFinite(percent) || percent <= 0 || percent >= 100) return [];
      return [{ code: code.toUpperCase(), percent, maxUses: Number.isFinite(maxUses) && maxUses > 0 ? maxUses : 1 }];
    });
}

export function normalizePromo(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().toUpperCase().slice(0, 32) : "";
}

export type PromoResult =
  | { ok: true; code: string; percent: number; maxUses: number; amount: string }
  | { ok: false; error: TKey };

/**
 * Kodni tekshiradi va chegirmali summani qaytaradi (USD, "12.34" ko'rinishida).
 * Bu faqat oldindan tekshiruv — haqiqiy band qilish (limit/bir martalik) order
 * bilan birga `reservePromoOrder` da atomik bajariladi.
 */
export async function resolvePromo(code: string, userId: string, price: number, minAmount?: number): Promise<PromoResult> {
  const def = promoDefs().find((d) => d.code === code);
  if (!def) return { ok: false, error: "chPromoInvalid" };

  const db = createServiceClient();
  // Shu foydalanuvchi bu kodni allaqachon to'lov bilan ishlatganmi? (tezkor javob uchun)
  const mine = await db
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("promo_code", code)
    .eq("user_id", userId)
    .eq("status", "paid");
  if (mine.error) return { ok: false, error: "chPromoUnavailable" };
  if ((mine.count ?? 0) > 0) return { ok: false, error: "chPromoAlreadyUsed" };

  // minAmount — boshqa valyutada (masalan rubl) chaqirilganda o'sha valyutadagi minimum.
  const min = minAmount ?? (Number(process.env.PROMO_MIN_USD ?? "1") || 1);
  const discounted = Math.round(price * (100 - def.percent)) / 100;
  const amount = Math.min(price, Math.max(min, discounted)).toFixed(2);
  return { ok: true, code, percent: def.percent, maxUses: def.maxUses, amount };
}

export interface PromoOrderInput {
  orderId: string;
  userId: string;
  plan: string;
  amount: string;
  currency: string;
  provider: string;
  billingPeriod: "month" | "year";
  code: string;
  maxUses: number;
}

/**
 * Promokodli buyurtmani ATOMIK yaratadi (0028 create_promo_order): kod bo'yicha
 * advisory lock ostida "ishlatilganmi / limit tugaganmi" tekshiruvi va INSERT
 * bitta tranzaksiyada — parallel so'rovlar limitni aylanib o'ta olmaydi.
 */
export async function reservePromoOrder(input: PromoOrderInput): Promise<{ ok: true } | { ok: false; error: TKey }> {
  const db = createServiceClient();
  const { data, error } = await db.rpc("create_promo_order", {
    p_order_id: input.orderId,
    p_user_id: input.userId,
    p_plan: input.plan,
    p_amount: input.amount,
    p_currency: input.currency,
    p_provider: input.provider,
    p_billing_period: input.billingPeriod,
    p_promo_code: input.code,
    p_max_uses: input.maxUses,
  });
  if (error) {
    console.error("[promo] create_promo_order:", error.message);
    return { ok: false, error: "chPromoUnavailable" };
  }
  if (data === "ok") return { ok: true };
  if (data === "already_used") return { ok: false, error: "chPromoAlreadyUsed" };
  if (data === "used_up") return { ok: false, error: "chPromoUsedUp" };
  return { ok: false, error: "chPromoUnavailable" };
}
