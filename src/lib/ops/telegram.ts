/**
 * Yagona Telegram yuboruvchi (budget alertlari va ops bot). Xabar FAQAT TELEGRAM_ALERT_CHAT_ID ga
 * ketadi — chat id chaqiruvchidan olinmaydi (bot buyruqlari ham shu chatga javob beradi).
 * Uzun matn 4096 belgidan bo'linadi. Token/tana logga chiqmaydi (faqat HTTP status).
 * Tarmoq `fetchImpl` orqali — testda soxta (haqiqiy xabar yuborilmaydi).
 */
import { splitMessage, TELEGRAM_LIMIT } from "./format";

export interface TelegramConfig {
  token: string;
  chatId: string;
}

export function telegramConfig(env: Record<string, string | undefined> = process.env): TelegramConfig | null {
  const token = env.TELEGRAM_ALERT_BOT_TOKEN?.trim();
  const chatId = env.TELEGRAM_ALERT_CHAT_ID?.trim();
  if (!token || !chatId) return null;
  // Chat id: butun son (guruh/kanal — manfiy) yoki @kanal. Boshqa narsa — sozlama xatosi, yubormaymiz.
  if (!/^(-?\d{1,20}|@[A-Za-z0-9_]{5,32})$/.test(chatId)) return null;
  return { token, chatId };
}

/**
 * Matnni (kerak bo'lsa bo'laklab) yuboradi. `html` — parse_mode HTML (matn escape qilingan bo'lishi SHART,
 * ops/format.ts tt()). Birinchi yiqilgan bo'lakda to'xtaydi. true — hammasi yuborildi.
 */
export async function sendTelegramText(
  text: string,
  opts: { config: TelegramConfig | null; fetchImpl?: typeof fetch; html?: boolean; tag?: string },
): Promise<boolean> {
  const cfg = opts.config;
  if (!cfg || !text.trim()) return false;
  const f = opts.fetchImpl ?? fetch;
  const tag = opts.tag ?? "telegram";
  for (const part of splitMessage(text, TELEGRAM_LIMIT)) {
    try {
      const res = await f(`https://api.telegram.org/bot${cfg.token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: cfg.chatId,
          text: part,
          disable_web_page_preview: true,
          ...(opts.html ? { parse_mode: "HTML" } : {}),
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        console.error(`[${tag}] telegram HTTP ${res.status}`); // tana/token logga chiqmaydi
        return false;
      }
    } catch (e) {
      console.error(`[${tag}] telegram:`, e instanceof Error ? e.name : "error");
      return false;
    }
  }
  return true;
}
