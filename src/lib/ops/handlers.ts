/**
 * HTTP handler'lar (bog'liqliklar tashqaridan — testda soxta):
 *  - handleOpsDigest   — GET /api/cron/ops-digest?kind=hourly|daily|weekly[&dry=1]  (Bearer CRON_SECRET)
 *  - handleTelegramWebhook — POST /api/telegram/ops (Telegram secret_token sarlavhasi + faqat founder chati)
 * Lenta (ops-events) — feed.ts.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { bearerMatches } from "@/lib/email/token";
import type { Lang } from "@/lib/i18n";
import { composeDigest, DIGEST_WINDOW_MS, isQuiet, type DigestData, type DigestKind } from "./digest";
import { tashkentDay, utcHourKey } from "./format";
import type { OpsStore } from "./store";

/* ------------------------------------------------------------------ */
/* Hisobot                                                              */
/* ------------------------------------------------------------------ */

export interface DigestDeps {
  cronSecret: string | undefined;
  now(): number;
  lang: Lang;
  store: OpsStore;
  telegram: boolean;
  /** `end` — oyna oxiri (soatlik: joriy soat boshi). */
  gather(kind: DigestKind, end: number): Promise<DigestData>;
  send(html: string): Promise<boolean>;
  log?(m: string): void;
}

export function parseDigestKind(v: string | null): DigestKind | null {
  return v === "hourly" || v === "daily" || v === "weekly" ? v : null;
}

/** Oyna oxiri: soatlik — oldingi TO'LIQ soat (cron har soat boshida); qolganlari — hozir. */
export function digestEnd(kind: DigestKind, now: number): number {
  return kind === "hourly" ? Math.floor(now / 3_600_000) * 3_600_000 : now;
}

/** Dedupe davri: bir hisobot bir marta (GitHub Actions qayta ishga tushirsa ham). */
export function digestPeriodKey(kind: DigestKind, end: number): string {
  if (kind === "hourly") return `ops:digest:hourly:${utcHourKey(end - 1)}`;
  return `ops:digest:${kind}:${tashkentDay(end)}`;
}

export async function handleOpsDigest(req: Request, deps: DigestDeps): Promise<Response> {
  if (!bearerMatches(req.headers.get("authorization"), deps.cronSecret)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const kind = parseDigestKind(url.searchParams.get("kind"));
  if (!kind) return Response.json({ error: "kind must be hourly|daily|weekly" }, { status: 400 });
  const dry = url.searchParams.get("dry") === "1";
  const log = deps.log ?? ((m: string) => console.log(m));
  const end = digestEnd(kind, deps.now());

  let data: DigestData;
  try {
    data = await deps.gather(kind, end);
  } catch (e) {
    log(`[ops-digest] gather: ${e instanceof Error ? e.message.slice(0, 200) : "error"}`);
    return Response.json({ error: "gather failed" }, { status: 500 });
  }
  if (kind === "hourly" && isQuiet(data)) {
    log("[ops-digest] hourly: quiet");
    return Response.json({ ok: true, kind, quiet: true, dry });
  }
  const text = composeDigest(data, deps.lang);
  if (dry) return Response.json({ ok: true, kind, dry: true, text });

  const key = digestPeriodKey(kind, end);
  let claimed = false;
  try {
    claimed = await deps.store.setNx(key, DIGEST_WINDOW_MS[kind] + 3_600_000);
  } catch {
    claimed = true; // ombor yo'q — bir marta yuborishga urinamiz
  }
  if (!claimed) return Response.json({ ok: true, kind, deduped: true });
  if (!deps.telegram) {
    await deps.store.del(key).catch(() => undefined);
    log("[ops-digest] Telegram sozlanmagan (TELEGRAM_ALERT_BOT_TOKEN / TELEGRAM_ALERT_CHAT_ID) — yuborilmadi");
    return Response.json({ ok: true, kind, sent: false, reason: "no_channel" });
  }
  const ok = await deps.send(text).catch(() => false);
  if (!ok) {
    await deps.store.del(key).catch(() => undefined);
    return Response.json({ ok: false, kind, sent: false }, { status: 502 });
  }
  log(`[ops-digest] ${kind} sent (${text.length} chars)`);
  return Response.json({ ok: true, kind, sent: true, chars: text.length });
}

/* ------------------------------------------------------------------ */
/* Telegram bot buyruqlari (webhook)                                     */
/* ------------------------------------------------------------------ */

export type BotCommand = "today" | "week" | "providers" | "users" | "help";

export function parseBotCommand(text: unknown): BotCommand | null {
  if (typeof text !== "string") return null;
  const m = /^\/(today|week|providers|users|help|start)(?:@[A-Za-z0-9_]{1,64})?(?:\s|$)/i.exec(text.trim());
  if (!m) return null;
  const c = m[1].toLowerCase();
  return c === "start" ? "help" : (c as BotCommand);
}

export interface BotDeps {
  /** TELEGRAM_WEBHOOK_SECRET (setWebhook secret_token). */
  secret: string | undefined;
  /** TELEGRAM_ALERT_CHAT_ID — javob FAQAT shu chatga, buyruq FAQAT shu chatdan. */
  chatId: string | undefined;
  store: OpsStore;
  /** Javobdan keyin bajarish (next/server after); Telegram 200'ni tez olsin. */
  defer(fn: () => Promise<void>): void;
  /** Buyruq → HTML matn (null — javob yo'q). */
  run(cmd: BotCommand): Promise<string | null>;
  send(html: string): Promise<boolean>;
  log?(m: string): void;
}

const MAX_UPDATE_BYTES = 64 * 1024;

function secretMatches(got: string | null, want: string): boolean {
  if (!got) return false;
  const a = createHash("sha256").update(got).digest();
  const b = createHash("sha256").update(want).digest();
  return timingSafeEqual(a, b);
}

export async function handleTelegramWebhook(req: Request, deps: BotDeps): Promise<Response> {
  const secret = deps.secret?.trim();
  const chatId = deps.chatId?.trim();
  // Sozlanmagan — endpoint yo'qdek (buyruqlar ixtiyoriy).
  if (!secret || secret.length < 16 || !chatId) return new Response(null, { status: 404 });
  if (!secretMatches(req.headers.get("x-telegram-bot-api-secret-token"), secret)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_UPDATE_BYTES) return Response.json({ error: "too large" }, { status: 413 });
  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return Response.json({ ok: true });
  }
  if (raw.length > MAX_UPDATE_BYTES) return Response.json({ error: "too large" }, { status: 413 });
  let update: { message?: { chat?: { id?: unknown }; text?: unknown }; edited_message?: unknown } | null = null;
  try {
    update = JSON.parse(raw);
  } catch {
    return Response.json({ ok: true }); // Telegram qayta yubormasin
  }
  const msg = update?.message;
  // Faqat founder chati. Boshqa chat — jim e'tiborsiz (javob ham, log'da chat id ham yo'q).
  if (!msg || String(msg.chat?.id ?? "") !== chatId) return Response.json({ ok: true });
  const cmd = parseBotCommand(msg.text);
  if (!cmd) return Response.json({ ok: true });
  // Takror bosishdan himoya: bir buyruq 10 soniyada bir marta.
  let fresh = true;
  try {
    fresh = await deps.store.setNx(`ops:bot:rl:${cmd}`, 10_000);
  } catch {
    fresh = true;
  }
  if (!fresh) return Response.json({ ok: true });
  const log = deps.log ?? ((m: string) => console.log(m));
  deps.defer(async () => {
    try {
      const text = await deps.run(cmd);
      if (text) await deps.send(text);
    } catch (e) {
      log(`[ops-bot] ${cmd}: ${e instanceof Error ? e.message.slice(0, 200) : "error"}`);
    }
  });
  return Response.json({ ok: true });
}
