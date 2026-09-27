"use client";

import { AlertTriangle, Check, Clock, ExternalLink, FileSpreadsheet, LoaderCircle, Plug, Presentation, XCircle } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { resolveConnectorAction } from "@/app/actions/connector-confirm";
import {
  PREVIEW_LIMITS,
  safeConnectorLink,
  type ConfirmErrorCode,
  type ConfirmResult,
  type ConfirmState,
  type ConfirmSummary,
  type ConnectorConfirmCard as Card,
} from "@/lib/ai/connector-confirm-types";
import { fmt, type TKey } from "@/lib/i18n";
import { useChat, useT } from "@/store/chat";

/**
 * Connector yozish amalini tasdiqlash kartasi. Amal (Sheets/Slides yaratish, qator qo'shish, MCP tool)
 * model tool siklida BAJARILMAGAN — foydalanuvchi "Tasdiqlash" ni bossagina server action
 * (resolveConnectorAction) uni bajaradi.
 *
 * Xavfsizlik: kartadagi barcha matn (nom, kataklar, MCP argumentlari) — server qurgan xulosa, lekin
 * manbasi model/tashqi server: faqat React matn tugunlari sifatida chiziladi (Markdown/HTML yo'q).
 * Havola — faqat connectorning o'z https domeni (safeConnectorLink, server ham tekshirgan).
 */

/** Telefonda yorliq qiymat ustida (kichik), kengroq ekranda — yonma-yon ustun. */
const DT = "mt-2 text-xs first:mt-0 sm:mt-0 sm:text-sm";

const ERR_KEY: Record<ConfirmErrorCode, TKey> = {
  auth: "p16cErrAuth",
  invalid: "p16cErrInvalid",
  rate_limited: "p16cErrRate",
  not_connected: "p16cErrNotConnected",
  failed: "p16cErrFailed",
};

/** Karta holatini store'da yangilaydi (xabar qaysi suhbatda bo'lsa ham). */
function patchCard(messageId: string, cardId: string, patch: Partial<Card>) {
  const s = useChat.getState();
  for (const convId of s.order) {
    const msg = s.conversations[convId]?.messages.find((m) => m.id === messageId);
    if (!msg?.connectorConfirms) continue;
    s.updateMessage(convId, messageId, {
      connectorConfirms: msg.connectorConfirms.map((c) => (c.id === cardId ? { ...c, ...patch } : c)),
    });
    return;
  }
}

function resultPatch(r: ConfirmResult): Partial<Card> {
  const link = safeConnectorLink(r.link) ?? undefined;
  return {
    state: r.status,
    link,
    code: r.code,
    output: typeof r.output === "string" ? r.output.slice(0, 1000) : undefined,
  };
}

export function ConnectorConfirmList({ messageId, cards }: { messageId: string; cards: Card[] }) {
  const t = useT();
  if (!cards.length) return null;
  return (
    <div className="mt-3 flex flex-col gap-2.5" role="group" aria-label={t("p16cGroupAria")}>
      {cards.slice(0, 5).map((c) => (
        <ConnectorConfirmCard key={c.id} messageId={messageId} card={c} />
      ))}
    </div>
  );
}

function KindIcon({ summary }: { summary: ConfirmSummary }) {
  if (summary.kind === "sheets_create" || summary.kind === "sheets_append") return <FileSpreadsheet className="size-4" />;
  if (summary.kind === "slides_create") return <Presentation className="size-4" />;
  return <Plug className="size-4" />;
}

export function ConnectorConfirmCard({ messageId, card }: { messageId: string; card: Card }) {
  const t = useT();
  const uid = useId();
  const [running, setRunning] = useState(false);
  /** Qayta urinsa bo'ladigan xato (sessiya yo'q / limit) — karta "pending" qoladi. */
  const [notice, setNotice] = useState<ConfirmErrorCode | null>(null);
  // 0 — hali o'lchanmagan (render sof bo'lsin: Date.now() faqat taymer ichida).
  const [now, setNow] = useState(0);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const focusStatus = useRef(false);

  const expired = card.state === "pending" && now > 0 && now >= card.expiresAt;
  const state: ConfirmState = expired ? "expired" : card.state;
  const pending = state === "pending";

  // Muddat taymeri: har 30 s "qolgan daqiqa" yangilanadi, muddat tugagach karta "expired" bo'ladi.
  useEffect(() => {
    if (card.state !== "pending") return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const every = setInterval(tick, 30_000);
    const end = setTimeout(tick, Math.max(0, card.expiresAt - Date.now()) + 50);
    return () => {
      clearTimeout(first);
      clearInterval(every);
      clearTimeout(end);
    };
  }, [card.state, card.expiresAt]);

  // Muddati o'tgan kartani saqlab qo'yamiz (qayta yuklanganda ham "expired").
  useEffect(() => {
    if (expired && !running) patchCard(messageId, card.id, { state: "expired" });
  }, [expired, running, messageId, card.id]);

  // Tugma bosilgandan keyin tugmalar yo'qoladi — fokus holat satriga o'tadi (klaviatura foydalanuvchisi adashmasin).
  useEffect(() => {
    if (!pending && !running && focusStatus.current) {
      focusStatus.current = false;
      statusRef.current?.focus();
    }
  }, [pending, running]);

  async function confirm() {
    if (!pending || running) return;
    setRunning(true);
    focusStatus.current = true;
    setNotice(null);
    try {
      const r = await resolveConnectorAction(card.ref, "confirm");
      if (r.status === "error" && (r.code === "auth" || r.code === "rate_limited")) {
        // Server yozuvni iste'mol qilmagan (sessiya/limit tekshiruvi undan oldin) — karta kutishda qoladi, qayta urinish mumkin.
        focusStatus.current = false;
        setNotice(r.code);
        return;
      }
      patchCard(messageId, card.id, resultPatch(r));
    } catch {
      patchCard(messageId, card.id, { state: "error", code: "failed" });
    } finally {
      setRunning(false);
    }
  }

  function reject() {
    if (!pending || running) return;
    focusStatus.current = true;
    // Rad etish — darhol (hech narsa bajarilmaydi); server yozuvni o'chiradi (bo'lmasa 10 daq.da o'zi o'chadi).
    patchCard(messageId, card.id, { state: "rejected" });
    void resolveConnectorAction(card.ref, "reject").catch(() => {});
  }

  const s = card.summary;
  const titleId = `${uid}-title`;
  const introId = `${uid}-intro`;
  const minutes = now > 0 ? Math.max(1, Math.ceil((card.expiresAt - now) / 60_000)) : 0;

  let what = "";
  let where = "";
  if (s.kind === "sheets_create") {
    what = s.rows > 0 ? fmt(t("p16cActSheetsCreateRows"), { n: s.rows }) : t("p16cActSheetsCreate");
    where = t("p16cWhereSheets");
  } else if (s.kind === "sheets_append") {
    what = fmt(t("p16cActSheetsAppend"), { n: s.rows });
    where = t("p16cWhereSheets");
  } else if (s.kind === "slides_create") {
    what = t("p16cActSlidesCreate");
    where = t("p16cWhereSlides");
  } else {
    what = fmt(t("p16cActMcp"), { tool: s.tool });
    where = fmt(t("p16cWhereMcp"), { host: s.host || "—" });
  }

  const rows = s.kind === "sheets_create" || s.kind === "sheets_append" ? s : null;
  const link = safeConnectorLink(card.link);

  return (
    <section
      aria-labelledby={titleId}
      aria-describedby={introId}
      aria-busy={running || undefined}
      data-confirm-state={running ? "running" : state}
      className="tt rounded-2xl border p-4"
      style={{
        borderColor: pending ? "color-mix(in srgb, var(--t-primary) 35%, var(--t-border))" : "var(--t-border)",
        background: "color-mix(in srgb, var(--t-primary) 4%, transparent)",
      }}
    >
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-xl"
          style={{ background: "color-mix(in srgb, var(--t-primary) 14%, transparent)", color: "var(--t-primary)" }}
          aria-hidden
        >
          <KindIcon summary={s} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 id={titleId} className="text-[15px] font-semibold leading-snug" style={{ color: "var(--t-text)" }}>
            {t("p16cTitle")}
          </h3>
          <p id={introId} className="mt-0.5 text-xs" style={{ color: "var(--t-text-muted)" }}>
            {t("p16cIntro")}
          </p>
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-1 text-sm sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-x-3 sm:gap-y-1.5">
        <dt className={DT} style={{ color: "var(--t-text-muted)" }}>{t("p16cWhat")}</dt>
        <dd style={{ color: "var(--t-text)" }}>{what}</dd>
        <dt className={DT} style={{ color: "var(--t-text-muted)" }}>{t("p16cWhere")}</dt>
        <dd className="break-words" style={{ color: "var(--t-text)" }}>
          {where}
        </dd>
        {(s.kind === "sheets_create" || s.kind === "slides_create") && (
          <>
            <dt className={DT} style={{ color: "var(--t-text-muted)" }}>{t("p16cName")}</dt>
            <dd className="break-words font-medium" style={{ color: "var(--t-text)" }}>
              {s.title || t("p16cUntitled")}
            </dd>
          </>
        )}
        {s.kind === "sheets_append" && (
          <>
            <dt className={DT} style={{ color: "var(--t-text-muted)" }}>{t("p16cSheetId")}</dt>
            <dd className="break-all font-mono text-xs leading-5" style={{ color: "var(--t-text)" }}>
              {s.spreadsheetId}
            </dd>
          </>
        )}
        {rows && rows.rows > 0 && (
          <>
            <dt className={DT} style={{ color: "var(--t-text-muted)" }}>{t("p16cPreview")}</dt>
            <dd style={{ color: "var(--t-text-muted)" }}>{fmt(t("p16cSize"), { n: rows.rows, c: rows.cols })}</dd>
          </>
        )}
      </dl>

      {rows && rows.preview.length > 0 && (
        <div className="mt-2.5 overflow-x-auto rounded-xl border" style={{ borderColor: "var(--t-border)" }}>
          <table className="w-full border-collapse text-left text-xs" aria-label={t("p16cPreviewAria")}>
            <tbody>
              {rows.preview.map((r, i) => (
                <tr key={i} className={i > 0 ? "border-t" : undefined} style={{ borderColor: "var(--t-border)" }}>
                  {r.map((c, j) => (
                    <td key={j} className="max-w-[12rem] truncate px-2.5 py-1.5" style={{ color: "var(--t-text)" }} title={c}>
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {rows.rows > rows.preview.length && (
            <p className="border-t px-2.5 py-1 text-[11px]" style={{ borderColor: "var(--t-border)", color: "var(--t-text-muted)" }}>
              {fmt(t("p16cMoreRows"), { n: rows.rows - Math.min(rows.preview.length, PREVIEW_LIMITS.rows) })}
            </p>
          )}
        </div>
      )}

      {rows && rows.formulas > 0 && (
        <p className="mt-2 flex items-start gap-1.5 text-xs" style={{ color: "var(--warning, #F59E0B)" }}>
          <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
          <span>{fmt(t("p16cFormulas"), { n: rows.formulas })}</span>
        </p>
      )}

      {s.kind === "mcp" && s.argsPreview && (
        <div className="mt-2.5">
          <p className="text-xs" style={{ color: "var(--t-text-muted)" }}>
            {t("p16cArgs")}
          </p>
          <pre
            className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-xl border px-3 py-2 font-mono text-[11px] leading-5"
            style={{ borderColor: "var(--t-border)", color: "var(--t-text)" }}
          >
            {s.argsPreview}
          </pre>
        </div>
      )}

      {pending ? (
        <div className="mt-3.5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={confirm}
            disabled={running}
            aria-label={t("p16cConfirmAria")}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3.5 text-sm font-semibold text-white transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--t-primary)] focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
            style={{ background: "var(--t-primary)" }}
          >
            {running ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <Check className="size-3.5" aria-hidden />}
            {running ? t("p16cRunning") : t("p16cConfirm")}
          </button>
          <button
            type="button"
            onClick={reject}
            disabled={running}
            aria-label={t("p16cRejectAria")}
            className="inline-flex min-h-9 items-center rounded-lg border px-3.5 text-sm font-medium transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--t-primary)] disabled:cursor-not-allowed disabled:opacity-50"
            style={{ borderColor: "var(--t-border)", color: "var(--t-text)" }}
          >
            {t("p16cReject")}
          </button>
          {minutes > 0 && !running && (
            <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: "var(--t-text-muted)" }}>
              <Clock className="size-3" aria-hidden /> {fmt(t("p16cExpiresIn"), { m: minutes })}
            </span>
          )}
          <span role="status" aria-live="polite" className="sr-only">
            {running ? t("p16cRunning") : ""}
          </span>
          {notice && !running && (
            <p role="alert" className="flex w-full items-start gap-1.5 text-xs" style={{ color: "var(--warning, #F59E0B)" }}>
              <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
              <span>
                {t("p16cError")} · {t(ERR_KEY[notice])}
              </span>
            </p>
          )}
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          <p
            ref={statusRef}
            tabIndex={-1}
            role="status"
            aria-live="polite"
            className="inline-flex flex-wrap items-center gap-1.5 rounded text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--t-primary)]"
            style={{ color: state === "error" || state === "partial" ? "var(--warning, #F59E0B)" : "var(--t-text-muted)" }}
          >
            <StateIcon state={state} />
            <span>{stateText(state, t)}</span>
            {state === "error" && card.code && <span style={{ color: "var(--t-text-muted)" }}>{t(ERR_KEY[card.code])}</span>}
            {(state === "done" || state === "partial") && link && (
              <a
                href={link}
                target="_blank"
                rel="noopener noreferrer nofollow"
                aria-label={t("p16cOpenAria")}
                className="inline-flex items-center gap-1 rounded font-semibold underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--t-primary)]"
                style={{ color: "var(--t-accent)" }}
              >
                {t("p16cOpen")} <ExternalLink className="size-3" aria-hidden />
              </a>
            )}
          </p>
          {state === "done" && card.output && (
            <details className="text-xs" style={{ color: "var(--t-text-muted)" }}>
              <summary className="cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--t-primary)]">
                {t("p16cOutput")}
              </summary>
              <pre
                className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-xl border px-3 py-2 font-mono text-[11px] leading-5"
                style={{ borderColor: "var(--t-border)", color: "var(--t-text)" }}
              >
                {card.output}
              </pre>
            </details>
          )}
        </div>
      )}
    </section>
  );
}

function stateText(state: ConfirmState, t: (k: TKey) => string): string {
  switch (state) {
    case "done":
      return t("p16cDone");
    case "partial":
      return t("p16cPartial");
    case "rejected":
      return t("p16cRejected");
    case "expired":
      return t("p16cExpired");
    case "error":
      return t("p16cError");
    default:
      return "";
  }
}

function StateIcon({ state }: { state: ConfirmState }) {
  if (state === "done") return <Check className="size-3.5" style={{ color: "var(--t-accent)" }} aria-hidden />;
  if (state === "error" || state === "partial") return <AlertTriangle className="size-3.5" aria-hidden />;
  if (state === "expired") return <Clock className="size-3.5" aria-hidden />;
  return <XCircle className="size-3.5" aria-hidden />;
}
