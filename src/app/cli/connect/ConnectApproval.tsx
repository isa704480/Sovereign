"use client";

import { AlertTriangle, Check, Clock, KeyRound, MapPin, Monitor, ShieldAlert, ShieldCheck, TerminalSquare, X } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";
import { approveCliDevice, denyCliDevice } from "@/app/actions/cli";
import { LogoMark } from "@/components/brand/Logo";
import { PLAN_BY_ID, isPlanId } from "@/config/plans";
import { countryFlag, countryName } from "@/config/countries";
import type { PendingInfo } from "@/lib/cli/device";
import type { CliLoginRef } from "@/lib/cli/user-code";
import { normalizeLegacyCode, normalizeUserCode, prettifyTyping } from "@/lib/cli/user-code-format";
import { EASE_OUT_EXPO } from "@/lib/motion";
import { LANGS, fmt } from "@/lib/i18n";
import { useLang, useT } from "@/store/chat";

/**
 * code            — yangi mijoz (`?h=`): user code ("ABCD-1234") teriladi;
 * legacy          — eski mijoz (`?code=`): ekrandagi kodning birinchi 8 belgisi teriladi;
 * legacy_disabled — eski havola, CLI_LEGACY_LOGIN=off: "ilovani yangilang";
 * invalid         — havola yo'q / buzilgan / muddati o'tgan.
 */
export type ConnectMode = "code" | "legacy" | "legacy_disabled" | "invalid";

interface ConnectApprovalProps {
  loginRef: CliLoginRef | null;
  mode: ConnectMode;
  name: string;
  email: string;
  plan: string;
  /** Kirishni boshlagan qurilma haqida kontekst (null — ma'lumot olinmadi). */
  info: PendingInfo | null;
}

/**
 * CLI / Cowork device-login tasdiqlash kartasi (RFC 8628 uslubi, phishing'ga chidamli):
 *  - URL'ning o'zi hech narsani tasdiqlamaydi — foydalanuvchi O'Z ekranidagi kodni teradi;
 *  - kim so'rayapti: qurilma nomi / OS, so'rov vaqti, taxminiy IP va mamlakat;
 *  - "faqat o'z ekraningizdagi kodni kiriting" ogohlantirishi; boshqa mamlakat → aniq tasdiq;
 *  - "Bekor qilish" kodni serverda ham bekor qiladi (cli_deny).
 */
export function ConnectApproval({ loginRef, mode, name, email, plan, info }: ConnectApprovalProps) {
  const t = useT();
  const lang = useLang();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<"idle" | "done" | "denied">("idle");
  const [error, setError] = useState<string | null>(null);
  const [final, setFinal] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [typed, setTyped] = useState("");
  const planName = (isPlanId(plan) ? PLAN_BY_ID[plan] : PLAN_BY_ID.free).name;

  const legacy = mode === "legacy";
  const gone = mode === "invalid" || (!!info && !info.pending);
  const strict = info?.match === "other-country";
  const typedOk = legacy ? !!(normalizeLegacyCode(typed) || normalizeUserCode(typed)) : !!normalizeUserCode(typed);
  const canApprove = !gone && !final && !pending && typedOk && (!strict || confirmed) && !!loginRef;
  const locale = LANGS.find((l) => l.id === lang)?.htmlLang ?? "en";
  const place = info?.startCountry ? `${countryFlag(info.startCountry)} ${countryName(info.startCountry, lang)}` : null;
  const time = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }) : null;
  const requestedAt = time(info?.requestedAt);
  const expiresAt = time(info?.expiresAt);
  const osLine = [info?.os, info?.app].filter(Boolean).join(" · ");

  function approve(e?: FormEvent) {
    e?.preventDefault();
    if (!canApprove || !loginRef) return;
    setError(null);
    startTransition(async () => {
      // Tarmoq uzilsa server action reject bo'ladi — tugma "ulanmoqda"da qotib qolmasin.
      const res = await approveCliDevice(loginRef, typed).catch(() => ({ ok: false as const, error: t("auErrNetwork"), final: false }));
      if (res.ok) setState("done");
      else {
        setError(res.error);
        if (res.final) setFinal(true);
      }
    });
  }

  function deny() {
    startTransition(async () => {
      // Server xatosi bo'lsa ham foydalanuvchi uchun rad etilgan (kod baribir 5–10 daqiqada eskiradi).
      if (loginRef) await denyCliDevice(loginRef).catch(() => undefined);
      setState("denied");
    });
  }

  return (
    <main className="relative flex min-h-svh flex-1 items-center justify-center px-5 py-10">
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{ background: "radial-gradient(50% 40% at 50% 0%, rgba(91,80,240,0.18) 0%, transparent 70%), #060812" }}
      />
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: EASE_OUT_EXPO }}
        className="w-full max-w-md rounded-2xl border border-border bg-bg-elevated p-6 text-center shadow-lg sm:p-8"
      >
        <div className="mb-6 flex items-center justify-center gap-2" aria-hidden>
          <LogoMark size={28} />
          <span className="text-text-muted">×</span>
          <TerminalSquare className="size-6 text-text-secondary" />
        </div>

        {state === "done" ? (
          <>
            <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-success/15 text-success" aria-hidden>
              <Check className="size-7" strokeWidth={3} />
            </div>
            <h1 className="font-display mt-5 text-2xl font-extrabold text-text-primary">{t("auCliConnected")}</h1>
            <p className="mt-2 text-sm text-text-secondary">{t("auCliConnectedDesc")}</p>
            <p className="mt-4 text-xs text-text-secondary">{t("auCliCanClose")}</p>
            <Link href="/cli/sessions" className="mt-2 inline-flex min-h-11 items-center text-sm text-primary-soft hover:underline">
              {t("auCliManageDevices")}
            </Link>
          </>
        ) : state === "denied" ? (
          <>
            <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-error/15 text-error" aria-hidden>
              <X className="size-7" strokeWidth={3} />
            </div>
            <h1 className="font-display mt-5 text-2xl font-extrabold text-text-primary">{t("auCliDenied")}</h1>
            <p className="mt-2 text-sm text-text-secondary">{t("auCliDeniedDesc")}</p>
          </>
        ) : gone ? (
          <>
            <h1 className="font-display text-2xl font-extrabold text-text-primary">{t("auCliTitle")}</h1>
            <p className="mt-4 text-sm text-error" role="alert">{t("auCliErrExpired")}</p>
            <p className="mt-2 text-xs text-text-secondary">{t("p17dStartAgain")}</p>
          </>
        ) : mode === "legacy_disabled" ? (
          <>
            <h1 className="font-display text-2xl font-extrabold text-text-primary">{t("auCliTitle")}</h1>
            <p className="mt-4 text-sm text-text-secondary">{t("p17dLegacyDisabled")}</p>
            <p className="mt-2 font-mono text-xs text-text-muted">{t("p17dUpdateHint")}</p>
            <button
              type="button"
              onClick={deny}
              disabled={pending}
              className="mt-6 h-11 w-full rounded-lg border border-border text-sm font-medium text-text-secondary transition-colors hover:bg-bg-hover"
            >
              {t("auCliCancel")}
            </button>
          </>
        ) : (
          <form onSubmit={approve} noValidate>
            <h1 className="font-display text-2xl font-extrabold text-text-primary">{t("auCliTitle")}</h1>
            <p className="mt-2 text-sm text-text-secondary">{t("auCliRequest")}</p>

            <div className="mt-5 rounded-xl border border-border bg-bg-base/60 p-4 text-left">
              <div className="text-sm font-medium text-text-primary">{name}</div>
              <div className="text-xs text-text-secondary">{email}</div>
              <div className="mt-2 inline-flex rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold text-primary-soft">
                {fmt(t("auCliPlan"), { plan: planName })}
              </div>
            </div>

            {info && (
              <dl className="mt-4 space-y-1.5 rounded-xl border border-border bg-bg-base/40 px-3 py-2.5 text-left text-xs">
                <div className="flex items-start gap-2">
                  <Monitor className="mt-0.5 size-3.5 shrink-0 text-text-muted" aria-hidden />
                  <dt className="sr-only">{t("auCliDeviceLabel")}</dt>
                  <dd className="min-w-0 break-words text-text-primary">
                    {info.device || t("auCliDeviceUnknown")}
                    {osLine && <span className="text-text-muted"> · {osLine}</span>}
                  </dd>
                </div>
                {requestedAt && (
                  <div className="flex items-start gap-2 text-text-muted">
                    <Clock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    <dt className="shrink-0">{t("auCliRequestedLabel")}:</dt>
                    <dd suppressHydrationWarning>
                      {requestedAt}
                      {expiresAt && <> · {fmt(t("p17dValidUntil"), { time: expiresAt })}</>}
                    </dd>
                  </div>
                )}
                {(place || info.ipApprox) && (
                  <div className="flex items-start gap-2 text-text-muted">
                    <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    <dt className="sr-only">{t("auCliLocationLabel")}</dt>
                    <dd className="min-w-0 break-words">
                      {[place, info.ipApprox ? fmt(t("p17dIpApprox"), { ip: info.ipApprox }) : null].filter(Boolean).join(" · ")}
                    </dd>
                  </div>
                )}
              </dl>
            )}

            {info?.match === "same" && (
              <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-success">
                <ShieldCheck className="size-3.5" aria-hidden />
                {t("auCliNetSame")}
              </p>
            )}
            {info?.match === "other-ip" && (
              <p className="mt-3 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-left text-xs text-text-secondary">
                {fmt(t("auCliNetOtherIp"), { ip: info.ipApprox ?? "?" })}
              </p>
            )}
            {strict && (
              <div role="alert" className="mt-3 rounded-xl border border-error/40 bg-error/10 px-3 py-2.5 text-left text-xs text-text-primary">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-error" aria-hidden />
                  <span>{fmt(t("auCliNetOtherCountry"), { country: place ?? info?.startCountry ?? "?" })}</span>
                </div>
                <label className="mt-2 flex min-h-11 cursor-pointer items-center gap-2 text-text-secondary">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                    className="size-4 accent-primary"
                  />
                  {t("auCliConfirmMine")}
                </label>
              </div>
            )}

            <div className="mt-4 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2.5 text-left text-xs text-text-primary">
              <div className="flex items-start gap-2">
                <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                <div>
                  <div className="font-semibold">{t("p17dWarnTitle")}</div>
                  <div className="mt-1 text-text-secondary">{t("p17dWarnBody")}</div>
                </div>
              </div>
            </div>

            <label htmlFor="cli-user-code" className="mt-5 flex items-center justify-center gap-1.5 text-sm font-medium text-text-primary">
              <KeyRound className="size-4 text-primary-soft" aria-hidden />
              {t("p17dTypeTitle")}
            </label>
            <p id="cli-user-code-desc" className="mt-1 text-xs text-text-secondary">
              {legacy ? t("p17dTypeDescLegacy") : t("p17dTypeDesc")}
            </p>
            {legacy && <p className="mt-1 font-mono text-xs text-text-secondary">{t("p17dUpdateHint")}</p>}
            <input
              id="cli-user-code"
              name="user-code"
              value={typed}
              onChange={(e) => {
                setTyped(prettifyTyping(e.target.value, legacy ? "legacy" : "code"));
                if (!final) setError(null);
              }}
              disabled={final || pending}
              autoFocus
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="characters"
              spellCheck={false}
              inputMode="text"
              maxLength={16}
              placeholder={legacy ? t("p17dPlaceholderLegacy") : t("p17dPlaceholder")}
              aria-describedby={error ? "cli-user-code-desc cli-user-code-error" : "cli-user-code-desc"}
              aria-invalid={!!error}
              className="mt-3 h-14 w-full rounded-xl border border-border bg-bg-base/70 text-center font-mono text-2xl font-bold tracking-[0.25em] text-text-primary uppercase placeholder:text-base placeholder:font-normal placeholder:tracking-normal placeholder:normal-case placeholder:text-text-muted focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-60"
            />

            {error && (
              <p id="cli-user-code-error" role="alert" className="mt-3 text-sm text-error">
                {error}
              </p>
            )}

            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={deny}
                disabled={pending}
                className="h-11 rounded-lg border border-border text-sm font-medium text-text-secondary transition-colors hover:bg-bg-hover"
              >
                {t("auCliCancel")}
              </button>
              <button
                type="submit"
                disabled={!canApprove}
                aria-busy={pending || undefined}
                className="h-11 rounded-lg bg-primary text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
              >
                {pending ? t("auCliConnecting") : t("auCliAllow")}
              </button>
            </div>
            <p className="mt-4 text-xs text-text-secondary">{t("auCliWarning")}</p>
          </form>
        )}
      </motion.div>
    </main>
  );
}
