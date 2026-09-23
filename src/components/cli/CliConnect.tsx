"use client";

import { Check, TerminalSquare, X } from "lucide-react";
import { motion } from "motion/react";
import { useState, useTransition } from "react";
import { approveCliDevice } from "@/app/actions/cli";
import { LogoMark } from "@/components/brand/Logo";
import { PLAN_BY_ID, isPlanId } from "@/config/plans";
import { EASE_OUT_EXPO } from "@/lib/motion";
import { fmt } from "@/lib/i18n";
import { useT } from "@/store/chat";

interface CliConnectProps {
  code: string;
  name: string;
  email: string;
  plan: string;
}

export function CliConnect({ code, name, email, plan }: CliConnectProps) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<"idle" | "done" | "denied" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const planName = (isPlanId(plan) ? PLAN_BY_ID[plan] : PLAN_BY_ID.free).name;

  function approve() {
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
            <p className="mt-2 text-sm text-text-secondary">
              {t("auCliConnectedDesc")}
            </p>
            <p className="mt-4 text-xs text-text-muted">{t("auCliCanClose")}</p>
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
            <p className="mt-2 text-sm text-text-secondary">
              {t("auCliRequest")}
            </p>

            <div className="mt-5 rounded-2xl border border-border bg-bg-base/60 p-4 text-left">
              <div className="text-sm font-medium text-text-primary">{name}</div>
              <div className="text-xs text-text-muted">{email}</div>
              <div className="mt-2 inline-flex rounded-full bg-primary/15 px-2.5 py-0.5 text-[11px] font-semibold text-primary-soft">
                {fmt(t("auCliPlan"), { plan: planName })}
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-border bg-bg-base/40 px-3 py-2 text-left font-mono text-[11px] text-text-muted">
              {t("auCliCode")}: {code.slice(0, 8)}…{code.slice(-4)}
            </div>

            {error && <p className="mt-3 text-sm text-error">{error}</p>}

            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setState("denied")}
                disabled={pending}
                className="h-11 rounded-xl border border-border text-sm font-medium text-text-secondary transition-colors hover:bg-bg-hover"
              >
                {t("auCliCancel")}
              </button>
              <button
                type="button"
                onClick={approve}
                disabled={pending}
                className="h-11 rounded-xl bg-primary text-sm font-semibold text-white shadow-glow transition-colors hover:bg-primary-dark disabled:opacity-60"
              >
                {pending ? t("auCliConnecting") : t("auCliAllow")}
              </button>
            </div>
            <p className="mt-4 text-xs text-text-muted">
              {t("auCliWarning")}
            </p>
          </>
        )}
      </motion.div>
    </main>
  );
}
