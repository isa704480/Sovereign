"use client";

import { AlertTriangle, Check, MapPin, Monitor, ShieldCheck, TerminalSquare, X } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { approveCliDevice, denyCliDevice } from "@/app/actions/cli";
import { LogoMark } from "@/components/brand/Logo";
import { PLAN_BY_ID, isPlanId } from "@/config/plans";
import { countryFlag, countryName } from "@/config/countries";
import type { PendingInfo } from "@/lib/cli/device";
import { EASE_OUT_EXPO } from "@/lib/motion";
import { LANGS, fmt } from "@/lib/i18n";
import { useLang, useT } from "@/store/chat";

interface ConnectApprovalProps {
  code: string;
  name: string;
  email: string;
  plan: string;
  /** Kirishni boshlagan qurilma haqida kontekst (null — ma'lumot olinmadi). */
  info: PendingInfo | null;
}

/**
 * CLI / Cowork device-login tasdiqlash kartasi (src/components/cli/CliConnect.tsx ning
 * phishing'ga chidamli davomi, audit cli-api-1):
 *  - kim so'rayapti: qurilma nomi, so'rov vaqti, boshlovchi tarmoq/mamlakat;
 *  - boshqa mamlakatdan kelgan so'rov → qat'iy ogohlantirish + aniq tasdiq (checkbox);
 *  - "Bekor qilish" kodni serverda ham bekor qiladi (cli_deny).
 */
export function ConnectApproval({ code, name, email, plan, info }: ConnectApprovalProps) {
  const t = useT();
  const lang = useLang();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<"idle" | "done" | "denied" | "error">("idle");
  const [error, setError] = useState<string | null>(info && !info.pending ? t("auCliErrExpired") : null);
  const [confirmed, setConfirmed] = useState(false);
  const planName = (isPlanId(plan) ? PLAN_BY_ID[plan] : PLAN_BY_ID.free).name;

  const gone = !!info && !info.pending;
  const strict = info?.match === "other-country";
  const canApprove = !gone && !pending && (!strict || confirmed);
  const locale = LANGS.find((l) => l.id === lang)?.htmlLang ?? "en";
  const place = info?.startCountry ? `${countryFlag(info.startCountry)} ${countryName(info.startCountry, lang)}` : null;
  const requestedAt = info?.requestedAt ? new Date(info.requestedAt) : null;

  function approve() {
    if (!canApprove) return;
    setError(null);
    startTransition(async () => {
      const res = await approveCliDevice(code);
      if (res.ok) setState("done");
      else {
        setError(res.error);
        setState("error");
      }
    });
  }

  function deny() {
    startTransition(async () => {
      // Server xatosi bo'lsa ham foydalanuvchi uchun rad etilgan (kod baribir 5 daqiqada eskiradi).
      await denyCliDevice(code).catch(() => undefined);
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
        className="w-full max-w-md rounded-3xl border border-border bg-bg-elevated/70 p-8 text-center shadow-lg"
      >
        <div className="mb-6 flex items-center justify-center gap-2">
          <LogoMark size={28} />
          <span className="text-text-muted">×</span>
          <TerminalSquare className="size-6 text-primary-soft" />
        </div>

        {state === "done" ? (
          <>
            <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-success/15 text-success shadow-[0_0_28px_rgba(16,212,160,0.35)]">
              <Check className="size-7" strokeWidth={3} />
            </div>
            <h1 className="font-display mt-5 text-2xl font-extrabold text-text-primary">{t("auCliConnected")}</h1>
            <p className="mt-2 text-sm text-text-secondary">{t("auCliConnectedDesc")}</p>
            <p className="mt-4 text-xs text-text-muted">{t("auCliCanClose")}</p>
            <Link href="/cli/sessions" className="mt-3 inline-block text-xs text-primary-soft hover:underline">
              {t("auCliManageDevices")}
            </Link>
          </>
        ) : state === "denied" ? (
          <>
            <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-error/15 text-error">
              <X className="size-7" strokeWidth={3} />
            </div>
            <h1 className="font-display mt-5 text-2xl font-extrabold text-text-primary">{t("auCliDenied")}</h1>
            <p className="mt-2 text-sm text-text-secondary">{t("auCliDeniedDesc")}</p>
          </>
        ) : (
          <>
            <h1 className="font-display text-2xl font-extrabold text-text-primary">{t("auCliTitle")}</h1>
            <p className="mt-2 text-sm text-text-secondary">{t("auCliRequest")}</p>

            <div className="mt-5 rounded-2xl border border-border bg-bg-base/60 p-4 text-left">
              <div className="text-sm font-medium text-text-primary">{name}</div>
              <div className="text-xs text-text-muted">{email}</div>
              <div className="mt-2 inline-flex rounded-full bg-primary/15 px-2.5 py-0.5 text-[11px] font-semibold text-primary-soft">
                {fmt(t("auCliPlan"), { plan: planName })}
              </div>
            </div>

            {info && !gone && (
              <dl className="mt-4 space-y-1.5 rounded-xl border border-border bg-bg-base/40 px-3 py-2.5 text-left text-xs">
                <div className="flex items-start gap-2">
                  <Monitor className="mt-0.5 size-3.5 shrink-0 text-text-muted" aria-hidden />
                  <dt className="sr-only">{t("auCliDeviceLabel")}</dt>
                  <dd className="min-w-0 break-words text-text-primary">{info.device || t("auCliDeviceUnknown")}</dd>
                </div>
                {requestedAt && (
                  <div className="flex items-start gap-2 text-text-muted">
                    <dt className="shrink-0">{t("auCliRequestedLabel")}:</dt>
                    <dd suppressHydrationWarning>
                      {requestedAt.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}
                    </dd>
                  </div>
                )}
                {(place || info.startIp) && (
                  <div className="flex items-start gap-2 text-text-muted">
                    <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    <dt className="sr-only">{t("auCliLocationLabel")}</dt>
                    <dd className="min-w-0 break-words">
                      {[place, info.startIp].filter(Boolean).join(" · ")}
                    </dd>
                  </div>
                )}
              </dl>
            )}

            {info?.match === "same" && !gone && (
              <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-success">
                <ShieldCheck className="size-3.5" aria-hidden />
                {t("auCliNetSame")}
              </p>
            )}
            {info?.match === "other-ip" && !gone && (
              <p className="mt-3 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-left text-xs text-text-secondary">
                {fmt(t("auCliNetOtherIp"), { ip: info.startIp ?? "?" })}
              </p>
            )}
            {strict && !gone && (
              <div role="alert" className="mt-3 rounded-xl border border-error/40 bg-error/10 px-3 py-2.5 text-left text-xs text-text-primary">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-error" aria-hidden />
                  <span>{fmt(t("auCliNetOtherCountry"), { country: place ?? info?.startCountry ?? "?" })}</span>
                </div>
                <label className="mt-2 flex cursor-pointer items-center gap-2 text-text-secondary">
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

            <div className="mt-4 rounded-xl border border-border bg-bg-base/40 px-3 py-2 text-left font-mono text-[11px] text-text-muted">
              {t("auCliCode")}: {code.slice(0, 8)}…{code.slice(-4)}
            </div>

            {error && <p className="mt-3 text-sm text-error">{error}</p>}

            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={deny}
                disabled={pending}
                className="h-11 rounded-xl border border-border text-sm font-medium text-text-secondary transition-colors hover:bg-bg-hover"
              >
                {t("auCliCancel")}
              </button>
              <button
                type="button"
                onClick={approve}
                disabled={!canApprove}
                className="h-11 rounded-xl bg-primary text-sm font-semibold text-white shadow-glow transition-colors hover:bg-primary-dark disabled:opacity-60"
              >
                {pending ? t("auCliConnecting") : t("auCliAllow")}
              </button>
            </div>
            <p className="mt-4 text-xs text-text-muted">{t("auCliWarning")}</p>
            <p className="mt-2 text-xs font-medium text-text-secondary">{t("auCliNotYou")}</p>
          </>
        )}
      </motion.div>
    </main>
  );
}
