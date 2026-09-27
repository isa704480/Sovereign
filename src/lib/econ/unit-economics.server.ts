import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { computeUnitEconomics, type EconRange, type UnitEconomics, type UsageRow } from "./unit-economics";

/**
 * Admin "Unit economics" — token_usage_daily'dan (RLS siyosatsiz, faqat service role
 * o'qiydi) tanlangan sanalar oralig'i uchun hisob. CHAQIRUVCHI admin ekanini o'zi
 * tekshirishi SHART (src/app/admin/page.tsx: profiles.is_admin). Service-role kaliti
 * faqat serverda; natijada foydalanuvchi id'lari yo'q (faqat yig'indilar).
 *
 * 0036 migratsiyasi qo'llanmagan bo'lsa — provider/upstream_model ustunlarisiz o'qiladi
 * va natijada servedColumns=false (karta buni aytadi).
 */

const PAGE = 1000;
const MAX_ROWS = 100_000;
const BASE_COLS = "day,user_id,model,input_tokens,output_tokens,calls";

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function fetchRows(
  sb: ReturnType<typeof createServiceClient>,
  cols: string,
  from: string,
  to: string,
): Promise<{ rows: UsageRow[]; error: { message: string; code?: string } | null }> {
  const rows: UsageRow[] = [];
  for (let off = 0; off < MAX_ROWS; off += PAGE) {
    const { data, error } = await sb
      .from("token_usage_daily")
      .select(cols)
      .gte("day", from)
      .lte("day", to)
      .order("day", { ascending: true })
      .range(off, off + PAGE - 1);
    if (error) return { rows, error };
    rows.push(...((data ?? []) as unknown as UsageRow[]));
    if (!data || data.length < PAGE) break;
  }
  return { rows, error: null };
}

/** Oxirgi `days` kun (UTC, bugun ham) bo'yicha unit economics. Xato bo'lsa — null. */
export async function getUnitEconomics(days: EconRange = 30): Promise<UnitEconomics | null> {
  const now = new Date();
  const to = isoDay(now);
  const from = isoDay(new Date(now.getTime() - (days - 1) * 86_400_000));
  return getUnitEconomicsBetween(from, to);
}

/**
 * [from, to] ("YYYY-MM-DD", UTC, ikkalasi ham kiradi) bo'yicha. `plans: false` — tarif bo'yicha
 * taqsimot kerak emas (profiles so'ralmaydi; byudjet guard'i uchun). Xato bo'lsa — null.
 */
export async function getUnitEconomicsBetween(
  from: string,
  to: string,
  opts: { plans?: boolean } = {},
): Promise<UnitEconomics | null> {
  let sb: ReturnType<typeof createServiceClient>;
  try {
    sb = createServiceClient();
  } catch {
    return null; // SUPABASE_SERVICE_ROLE_KEY yo'q (lokal/preview)
  }

  let servedColumns = true;
  let res = await fetchRows(sb, `${BASE_COLS},provider,upstream_model`, from, to);
  if (res.error && /provider|upstream_model|column/i.test(res.error.message)) {
    servedColumns = false;
    res = await fetchRows(sb, BASE_COLS, from, to);
  }
  if (res.error) {
    console.error("[admin/econ] token_usage_daily:", res.error.message);
    return null;
  }

  // Tarif bo'yicha taqsimot — foydalanuvchining JORIY tarifi (tarif tarixi saqlanmaydi).
  const planByUser: Record<string, string> = {};
  const ids = opts.plans === false ? [] : [...new Set(res.rows.map((r) => r.user_id))];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await sb.from("profiles").select("id,plan").in("id", ids.slice(i, i + 200));
    if (error) {
      console.error("[admin/econ] profiles:", error.message);
      break;
    }
    for (const p of (data ?? []) as { id: string; plan: string | null }[]) planByUser[p.id] = p.plan ?? "free";
  }

  return computeUnitEconomics(res.rows, { from, to, servedColumns, planByUser });
}
