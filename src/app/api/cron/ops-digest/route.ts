import { handleOpsDigest } from "@/lib/ops/handlers";
import { opsDigestDeps } from "@/lib/ops/ops.server";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/ops-digest?kind=hourly|daily|weekly — founder'ga to'liq hisobot (Telegram).
 * Soatlik (hodisa bo'lmasa jim), kunlik (21:00 Toshkent) va haftalik (dushanba) — .github/workflows/ops-bot.yml.
 *   Himoya: Authorization: Bearer $CRON_SECRET;  ?dry=1 — matnni qaytaradi, yubormaydi.
 * Har hisobot davriga bir marta (dedupe). Mantiq: src/lib/ops/handlers.ts, matn: src/lib/ops/digest.ts.
 */
export function GET(req: Request) {
  return handleOpsDigest(req, opsDigestDeps());
}
