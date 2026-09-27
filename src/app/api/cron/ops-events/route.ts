import { handleOpsEvents } from "@/lib/ops/feed";
import { opsFeedDeps } from "@/lib/ops/ops.server";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/ops-events — founder'ga tezkor Telegram lentasi (GitHub Actions: .github/workflows/ops-bot.yml,
 * har 5 daqiqa): yangi foydalanuvchilar, to'lov / obuna / refund / chargeback, Provider Mesh circuit breaker
 * o'tishlari va failover'lar, relizlar va main'dagi deploy, CLI/Cowork qurilma kirishlari.
 *   Himoya: Authorization: Bearer $CRON_SECRET;  ?dry=1 — matnni qaytaradi, yubormaydi va holatni yozmaydi.
 * Maxfiylik: faqat niqoblangan email, mamlakat kodi, tarif, summa, provayder/model id — mantiq: src/lib/ops/feed.ts.
 */
export function GET(req: Request) {
  return handleOpsEvents(req, opsFeedDeps());
}
