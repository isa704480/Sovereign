/**
 * GET /api/cron/budget-watch mantiqi (bog'liqliklar tashqaridan — testda soxta). Route faqat
 * standart deps bilan chaqiradi (budget.server.ts budgetWatchDeps). Pul HECH QAYERGA o'tkazilmaydi:
 * faqat o'qish (orders, token_usage_daily, OpenRouter balansi) va ogohlantirish.
 *
 *   Himoya: Authorization: Bearer $CRON_SECRET
 *   ?dry=1 — hisoblaydi, lekin alert yubormaydi va holatni yozmaydi.
 */
import { bearerMatches } from "@/lib/email/token";
import { decideAlerts, sendDeduped, type AlertId, type AlertResult, type DedupeStore, type OpenRouterBalance } from "./alerts";
import type { BudgetConfig, BudgetState } from "./budget";

export interface BudgetWatchDeps {
  cronSecret: string | undefined;
  cfg: BudgetConfig;
  now(): Date;
  /** Majburiy qayta hisoblash (guard keshini ham yangilaydi). null — hisoblab bo'lmadi. */
  refresh(): Promise<BudgetState | null>;
  openrouter(): Promise<OpenRouterBalance | null>;
  prevRestricted(): Promise<boolean | null>;
  savePrevRestricted(v: boolean): Promise<void>;
  dedupe: DedupeStore;
  /** Qaysi kanallar sozlangan (Telegram / email). */
  channels(): { telegram: boolean; email: boolean };
  /** Alertni barcha sozlangan kanallarga yuboradi; true — kamida bittasi yubordi. */
  send(id: AlertId, ctx: { state: BudgetState | null; openrouter: OpenRouterBalance | null }): Promise<boolean>;
  log?(msg: string): void;
}

export async function handleBudgetWatch(req: Request, deps: BudgetWatchDeps): Promise<Response> {
  if (!bearerMatches(req.headers.get("authorization"), deps.cronSecret)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const log = deps.log ?? ((m: string) => console.log(m));
  const dry = new URL(req.url).searchParams.get("dry") === "1";
  const now = deps.now();

  const [state, openrouter, prev] = await Promise.all([
    deps.refresh().catch(() => null),
    deps.openrouter().catch(() => null),
    deps.prevRestricted().catch(() => null),
  ]);
  if (!state) log("[budget-watch] budget state unavailable (Supabase?) — only OpenRouter balance checked");
  if (openrouter?.error) log(`[budget-watch] openrouter: ${openrouter.error}`);

  const ids = decideAlerts({ state, prevRestricted: prev, openrouter, openrouterAlertUsd: deps.cfg.openrouterAlertUsd });
  const ch = deps.channels();
  let results: (AlertResult | { id: AlertId; status: "skipped" })[] = [];
  if (dry) {
    results = ids.map((id) => ({ id, status: "skipped" as const }));
  } else if (!ch.telegram && !ch.email) {
    if (ids.length) log(`[budget-watch] no alert channel configured (TELEGRAM_ALERT_* / ALERT_EMAIL) — ${ids.join(",")} not sent`);
    results = ids.map((id) => ({ id, status: "skipped" as const }));
  } else {
    results = await sendDeduped(ids, { store: deps.dedupe, now, send: (id) => deps.send(id, { state, openrouter }) });
  }

  // Oldingi guard holati: o'tish alerti yuborilmagan bo'lsa yangilanmaydi (keyingi cron qayta urinadi).
  if (!dry && state) {
    const transitionFailed = results.some((r) => (r.id === "guard_on" || r.id === "guard_off") && r.status === "failed");
    if (!transitionFailed) await deps.savePrevRestricted(state.paidRestricted).catch(() => undefined);
  }

  log(
    `[budget-watch] month=${state?.month ?? "?"} revenue=${state?.revenueUsd.toFixed(2) ?? "?"} spend=${state?.spendUsd.toFixed(2) ?? "?"} ` +
      `level=${state?.level ?? "?"} restricted=${state?.paidRestricted ?? "?"} openrouter=${openrouter?.balanceUsd ?? "?"} ` +
      `alerts=${results.map((r) => `${r.id}:${r.status}`).join(",") || "-"}`,
  );
  return Response.json({
    ok: true,
    dry,
    month: state?.month ?? null,
    revenueUsd: state?.revenueUsd ?? null,
    spendUsd: state?.spendUsd ?? null,
    ratio: state?.ratio ?? null,
    allowanceUsd: state?.allowanceUsd ?? null,
    level: state?.level ?? null,
    paidRestricted: state?.paidRestricted ?? null,
    openrouter: openrouter ? { balanceUsd: openrouter.balanceUsd, source: openrouter.source } : null,
    channels: ch,
    alerts: results,
  });
}
