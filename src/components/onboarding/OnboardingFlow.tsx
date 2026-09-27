"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { completeOnboarding } from "@/app/actions/onboarding";
import { LogoMark } from "@/components/brand/Logo";
import { ONBOARDING_STEPS, TOTAL_STEPS } from "@/config/onboarding";
import { stepIsValid, useOnboarding, useOnboardingHydrated } from "@/store/onboarding";
import { stepText } from "@/lib/locales/onboarding-data";
import { useLang, useT } from "@/store/chat";
import { Completion } from "./Completion";
import { ProgressBar } from "./ProgressBar";
import { StepShell } from "./StepShell";
import { StepAge, StepCountry, StepExperience, StepIndustry, StepLanguages, StepPriorities, StepPurpose } from "./steps";

const STEP_COMPONENTS = [StepPurpose, StepIndustry, StepPriorities, StepLanguages, StepExperience, StepAge, StepCountry];

export function OnboardingFlow() {
  const lang = useLang();
  const t = useT();
  const router = useRouter();
  const hydrated = useOnboardingHydrated();
  const state = useOnboarding();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Xato bo'lsa "Qayta urinish" oxirgi amalni (yakunlash yoki o'tkazib yuborish) takrorlaydi.
  const [lastAction, setLastAction] = useState<"finish" | "skip">("finish");
  const [result, setResult] = useState<{ modelId: string; reason: string } | null>(null);

  const step = Math.min(state.step, TOTAL_STEPS - 1);
  const isLast = step === TOTAL_STEPS - 1;
  const canNext = stepIsValid(state, step);
  const Step = STEP_COMPONENTS[step];
  const meta = ONBOARDING_STEPS[step];
  const text = stepText(meta.id, lang, meta);

  function handleNext() {
    if (!canNext) return;
    if (!isLast) {
      state.next();
      return;
    }
    setError(null);
    setLastAction("finish");
    startTransition(async () => {
      const res = await completeOnboarding({
        purposes: state.purposes,
        industries: state.industries,
        otherIndustry: state.otherIndustry ?? "",
        priorities: state.priorities,
        languages: state.languages,
        otherLanguage: state.otherLanguage ?? "",
        experience: state.experience,
        ageGroup: state.ageGroup ?? "",
        country: state.country ?? "",
        otherCountry: state.otherCountry ?? "",
      }).catch(() => ({ ok: false as const, error: t("p7cOnbSaveFailed") }));
      if (!res.ok) {
        setError(res.error || t("p7cOnbSaveFailed"));
        return;
      }
      setResult({ modelId: res.modelId, reason: res.reason });
    });
  }

  /**
   * "O'tkazib yuborish": hozirgacha berilgan javoblar + oqilona standartlar bilan
   * saqlaymiz va darhol chatga o'tamiz (birinchi xabargacha tezroq).
   */
  function handleSkip() {
    if (pending) return;
    setError(null);
    const uiLang = lang === "ru" ? "ru" : lang === "en" ? "en" : "uz";
    setLastAction("skip");
    startTransition(async () => {
      const res = await completeOnboarding({
        purposes: state.purposes.length ? state.purposes : ["personal"],
        industries: state.industries,
        otherIndustry: state.otherIndustry ?? "",
        priorities: state.priorities.length ? state.priorities : ["speed"],
        languages: state.languages.length ? state.languages : [uiLang],
        otherLanguage: state.otherLanguage ?? "",
        experience: state.experience,
        ageGroup: state.ageGroup ?? "",
        country: state.country ?? "",
        otherCountry: state.otherCountry ?? "",
      }).catch(() => ({ ok: false as const, error: t("p7cOnbSaveFailed") }));
      if (!res.ok) {
        setError(res.error || t("p7cOnbSaveFailed"));
        return;
      }
      state.reset();
      router.push("/app");
    });
  }

  return (
    <main className="relative flex flex-1 flex-col items-center px-5 py-8 sm:py-12">
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(50% 40% at 50% 0%, rgba(91,80,240,0.18) 0%, transparent 70%), #060812",
        }}
      />
      <div className="grid-fade pointer-events-none absolute inset-0 -z-10 opacity-60" />

      <div className="mb-8 flex w-full max-w-[600px] items-center justify-between">
        <LogoMark size={28} />
        {!result && (
          <div className="flex min-w-0 flex-1 items-end gap-3 pl-6">
            <div className="min-w-0 flex-1">
              <ProgressBar step={step} />
            </div>
            {hydrated && (
              <button
                type="button"
                onClick={handleSkip}
                disabled={pending}
                className="-mb-2 inline-flex h-11 shrink-0 items-center rounded-lg px-3 text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary disabled:opacity-50 md:h-9"
              >
                {t("uxSkip")}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex w-full flex-1 items-start justify-center">
        {!hydrated ? (
          <div aria-hidden className="h-[420px] w-full max-w-[600px] animate-pulse rounded-2xl border border-[var(--border-subtle)] bg-bg-elevated/60 motion-reduce:animate-none" />
        ) : result ? (
          <Completion modelId={result.modelId} reason={result.reason} onEnter={() => state.reset()} />
        ) : (
          <AnimatePresence mode="wait" custom={state.direction} initial={false}>
            <StepShell
              key={meta.id}
              number={meta.number}
              title={text.title}
              subtitle={text.subtitle}
              direction={state.direction}
              canNext={canNext}
              canBack={step > 0}
              isLast={isLast}
              pending={pending}
              onNext={handleNext}
              onBack={state.back}
            >
              <Step />
              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-error/30 bg-error/10 px-3.5 py-2.5 text-sm text-error"
                    role="alert"
                  >
                    <span className="min-w-0 flex-1">{error}</span>
                    <button
                      type="button"
                      onClick={lastAction === "skip" ? handleSkip : handleNext}
                      disabled={pending}
                      className="inline-flex min-h-9 items-center rounded-md border border-error/40 px-3 text-sm font-medium text-text-primary hover:bg-error/10 disabled:opacity-50 [@media(pointer:coarse)]:min-h-11"
                    >
                      {t("uxRetry")}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </StepShell>
          </AnimatePresence>
        )}
      </div>
    </main>
  );
}
