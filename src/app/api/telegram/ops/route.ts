import { handleTelegramWebhook } from "@/lib/ops/handlers";
import { opsBotDeps } from "@/lib/ops/ops.server";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * POST /api/telegram/ops — ops bot buyruqlari (/today, /week, /providers, /users, /help). IXTIYORIY.
 *
 * Xavfsizlik:
 *  - faqat `X-Telegram-Bot-Api-Secret-Token` sarlavhasi TELEGRAM_WEBHOOK_SECRET ga teng bo'lsa (timing-safe);
 *    env o'rnatilmagan (yoki 16 belgidan qisqa) — 404;
 *  - faqat chat.id === TELEGRAM_ALERT_CHAT_ID bo'lgan xabarlar; javob HAM faqat shu chatga
 *    (update'dagi chat id'ga emas); boshqa chatlar jim e'tiborsiz;
 *  - bir buyruq 10 soniyada bir marta; hisobot javobdan keyin (after) tayyorlanadi.
 *
 * Ro'yxatdan o'tkazish (bir marta, founder o'zi; bu kod setWebhook chaqirmaydi):
 *   1) TELEGRAM_WEBHOOK_SECRET = 32+ tasodifiy belgi (faqat A-Z a-z 0-9 _ -), Vercel env, redeploy;
 *   2) curl -sS "https://api.telegram.org/bot$TELEGRAM_ALERT_BOT_TOKEN/setWebhook" \
 *        -d "url=https://soveregn.xyz/api/telegram/ops" \
 *        -d "secret_token=$TELEGRAM_WEBHOOK_SECRET" \
 *        -d 'allowed_updates=["message"]'
 *   3) Tekshirish: .../getWebhookInfo. O'chirish: .../deleteWebhook.
 */
export function POST(req: Request) {
  return handleTelegramWebhook(req, opsBotDeps());
}
