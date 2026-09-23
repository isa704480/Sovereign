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
  | { ok: true; code: string; percent: number; amount: string }
  | { ok: false; error: TKey };

/** Kodni tekshiradi va chegirmali summani qaytaradi (USD, "12.34" ko'rinishida). */
export async function resolvePromo(code: string, userId: string, price: number): Promise<PromoResult> {
  const def = promoDefs().find((d) => d.code === code);
  if (!def) return { ok: false, error: "chPromoInvalid" };

  const db = createServiceClient();
  // Shu foydalanuvchi bu kodni allaqachon to'lov bilan ishlatganmi?
  const mine = await db
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("promo_code", code)
    .eq("user_id", userId)
    .eq("status", "paid");
  if (mine.error) return { ok: false, error: "chPromoUnavailable" };
  if ((mine.count ?? 0) > 0) return { ok: false, error: "chPromoAlreadyUsed" };

  // Umumiy limit: to'langanlar + oxirgi 1 soatdagi ochiq checkout'lar (parallel suiiste'molga qarshi).
  const since = new Date(Date.now() - 3600_000).toISOString();
  const used = await db
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("promo_code", code)
    .or(`status.eq.paid,and(status.eq.pending,created_at.gte."${since}")`);
  if (used.error) return { ok: false, error: "chPromoUnavailable" };
  if ((used.count ?? 0) >= def.maxUses) return { ok: false, error: "chPromoUsedUp" };

  const min = Number(process.env.PROMO_MIN_USD ?? "1") || 1;
  const discounted = Math.round(price * (100 - def.percent)) / 100;
  const amount = Math.min(price, Math.max(min, discounted)).toFixed(2);
  return { ok: true, code, percent: def.percent, amount };
}
