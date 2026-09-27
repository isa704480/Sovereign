"use client";

import { Monitor, TerminalSquare } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { revokeAllCliSessions, revokeCliSession, type CliSessionView } from "@/app/actions/cli";
import { LogoMark } from "@/components/brand/Logo";
import { LANGS, fmt } from "@/lib/i18n";
import { useLang, useT } from "@/store/chat";

/** Ulangan CLI / Cowork qurilmalari ro'yxati: bittasini yoki hammasini bekor qilish (cli-api-2). */
export function CliSessions({ initial, loadError }: { initial: CliSessionView[]; loadError: string | null }) {
  const t = useT();
  const lang = useLang();
  const locale = LANGS.find((l) => l.id === lang)?.htmlLang ?? "en";
  const [sessions, setSessions] = useState(initial);
  const [error, setError] = useState<string | null>(loadError);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const date = (iso: string) =>
    new Date(iso).toLocaleString(locale, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

  function revoke(id: string) {
    setError(null);
    setBusy(id);
    startTransition(async () => {
      const res = await revokeCliSession(id);
      if (res.ok) setSessions((s) => s.filter((x) => x.id !== id));
      else setError(res.error);
      setBusy(null);
    });
  }

  function revokeAll() {
    if (!window.confirm(t("auCliSessRevokeAllConfirm"))) return;
    setError(null);
    setBusy("*");
    startTransition(async () => {
      const res = await revokeAllCliSessions();
      if (res.ok) setSessions([]);
      else setError(res.error);
      setBusy(null);
    });
  }

  return (
    <main className="relative flex min-h-svh flex-1 items-start justify-center px-4 py-10 sm:items-center">
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{ background: "radial-gradient(50% 40% at 50% 0%, rgba(91,80,240,0.18) 0%, transparent 70%), #060812" }}
      />
      <div className="w-full max-w-lg rounded-3xl border border-border bg-bg-elevated/70 p-6 shadow-lg sm:p-8">
        <div className="mb-5 flex items-center gap-2">
          <LogoMark size={24} />
          <span className="text-text-muted">×</span>
          <TerminalSquare className="size-5 text-primary-soft" aria-hidden />
        </div>
        <h1 className="font-display text-2xl font-extrabold text-text-primary">{t("auCliSessTitle")}</h1>
        <p className="mt-2 text-sm text-text-secondary">{t("auCliSessDesc")}</p>

        {error && (
          <p role="alert" className="mt-4 text-sm text-error">
            {error}
          </p>
        )}

        {sessions.length === 0 ? (
          <p className="mt-6 rounded-2xl border border-border bg-bg-base/50 px-4 py-6 text-center text-sm text-text-muted">
            {t("auCliSessEmpty")}
          </p>
        ) : (
          <ul className="mt-6 space-y-3">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-start gap-3 rounded-2xl border border-border bg-bg-base/50 p-4">
                <Monitor className="mt-0.5 size-4 shrink-0 text-text-muted" aria-hidden />
                <div className="min-w-0 flex-1 text-xs text-text-muted">
                  <div className="break-words text-sm font-medium text-text-primary">{s.device || t("auCliDeviceUnknown")}</div>
                  <div suppressHydrationWarning>{fmt(t("auCliSessConnected"), { date: date(s.createdAt) })}</div>
                  <div suppressHydrationWarning>
                    {s.lastUsedAt ? fmt(t("auCliSessLastUsed"), { date: date(s.lastUsedAt) }) : t("auCliSessNeverUsed")}
                  </div>
                  <div suppressHydrationWarning>{fmt(t("auCliSessExpires"), { date: date(s.expiresAt) })}</div>
                </div>
                <button
                  type="button"
                  onClick={() => revoke(s.id)}
                  disabled={pending}
                  className="h-9 shrink-0 rounded-xl border border-error/40 px-3 text-xs font-medium text-error transition-colors hover:bg-error/10 disabled:opacity-60"
                >
                  {busy === s.id ? t("auCliSessRevoking") : t("auCliSessRevoke")}
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <Link href="/app" className="text-sm text-text-secondary hover:text-text-primary">
            {t("p7cAdBack")}
          </Link>
          {sessions.length > 0 && (
            <button
              type="button"
              onClick={revokeAll}
              disabled={pending}
              className="h-10 rounded-xl bg-error/90 px-4 text-sm font-semibold text-white transition-colors hover:bg-error disabled:opacity-60"
            >
              {busy === "*" ? t("auCliSessRevoking") : t("auCliSessRevokeAll")}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
