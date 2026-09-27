import { budgetWatchDeps } from "@/lib/econ/budget.server";
import { handleBudgetWatch } from "@/lib/econ/budget-watch";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/budget-watch — API sarfi / daromad nisbati va OpenRouter balansi kuzatuvi
 * (GitHub Actions: .github/workflows/budget-watch.yml, har 30 daqiqa).
 *   Himoya: Authorization: Bearer $CRON_SECRET;  ?dry=1 — alert yubormaydi.
 * Guard holatini (paidRestricted) yangilaydi va chegaralar oshsa Telegram/email alert yuboradi
 * (har alert kuniga bir marta). Mantiq: src/lib/econ/budget-watch.ts, formulalar: budget.ts.
 */
export function GET(req: Request) {
  return handleBudgetWatch(req, budgetWatchDeps());
}
