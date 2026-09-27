"use client";

import { Monitor, RotateCw, TerminalSquare } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  // "Hammasini bekor qilish" — brauzer confirm() o'rniga joyida ikki bosqichli tasdiq.
  const [confirmAll, setConfirmAll] = useState(false);
  const router = useRouter();
  const failed = !!loadError && sessions.length === 0;

  const date = (iso: string) =>
    new Date(iso).toLocaleString(locale, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

  function revoke(id: string) {
    setError(null);
    setBusy(id);
    startTransition(async () => {
      const res = await revokeCliSession(id).catch(() => ({ ok: false as const, error: t("auErrNetwork") }));
      if (res.ok) setSessions((s) => s.filter((x) => x.id !== id));
      else setError(res.error);
      setBusy(null);
    });
  }

  function revokeAll() {
    if (!confirmAll) {
      setConfirmAll(true);
      return;
    }
    setConfirmAll(false);
    setError(null);
    setBusy("*");
    startTransition(async () => {
      const res = await revokeAllCliSessions().catch(() => ({ ok: false as const, error: t("auErrNetwork") }));
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
      <div className="w-full max-w-lg rounded-2xl border border-border bg-bg-elevated p-6 shadow-lg sm:p-8">
        <div className="mb-5 flex items-center gap-2" aria-hidden>
          <LogoMark size={24} />
          <span className="text-text-muted">×</span>
          <TerminalSquare className="size-5 text-text-secondary" />
        </div>
        <h1 className="font-display text-2xl font-extrabold text-text-primary">{t("auCliSessTitle")}</h1>
        <p className="mt-2 text-sm text-text-secondary">{t("auCliSessDesc")}</p>

        {error && (
          <div role="alert" className="mt-4 flex flex-wrap items-center gap-3 text-sm text-error">
            <span className="min-w-0 flex-1">{error}</span>
            {failed && (
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  router.refresh();
                }}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-text-primary hover:bg-bg-hover"
              >
                <RotateCw className="size-3.5" aria-hidden />
                {t("uxRetry")}
              </button>
            )}
          </div>
        )}

        {failed ? null : sessions.length === 0 ? (
          <p className="mt-6 rounded-xl border border-border bg-bg-base/50 px-4 py-6 text-center text-sm text-text-secondary">
            {t("auCliSessEmpty")}
          </p>
        ) : (
          // Bitta panel + hairline qatorlar.
          <ul className="mt-6 divide-y divide-border overflow-hidden rounded-xl border border-border bg-bg-base/50">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-start gap-3 p-4">
                <Monitor className="mt-0.5 size-4 shrink-0 text-text-secondary" aria-hidden />
                <div className="min-w-0 flex-1 text-xs text-text-secondary">
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
                  aria-label={`${t("auCliSessRevoke")}: ${s.device || t("auCliDeviceUnknown")}`}
                  className="h-9 shrink-0 rounded-lg border border-error/40 px-3 text-xs font-medium text-error transition-colors hover:bg-error/10 disabled:opacity-60 [@media(pointer:coarse)]:h-11"
                >
                  {busy === s.id ? t("auCliSessRevoking") : t("auCliSessRevoke")}
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <Link href="/app" className="inline-flex min-h-11 items-center text-sm text-text-secondary hover:text-text-primary">
            {t("p7cAdBack")}
          </Link>
          {sessions.length > 0 && (
            <div className="flex flex-wrap items-center justify-end gap-2">
              {confirmAll && (
                <>
                  <span role="alert" className="text-xs text-text-primary">{t("auCliSessRevokeAllConfirm")}</span>
                  <button
                    type="button"
                    onClick={() => setConfirmAll(false)}
                    className="h-11 rounded-lg px-3 text-sm text-text-secondary hover:bg-bg-hover"
                  >
                    {t("cancel")}
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={revokeAll}
                disabled={pending}
                className="h-11 rounded-lg bg-[#C62F2F] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#b02929] disabled:opacity-60"
              >
                {busy === "*" ? t("auCliSessRevoking") : t("auCliSessRevokeAll")}
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
