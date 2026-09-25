"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, Loader2, MailCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { AnimatePresence, motion } from "motion/react";
import { signUpWithEmail } from "@/app/actions/auth";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { registerSchema, type RegisterInput } from "@/lib/validations/auth";
import { EASE } from "@/lib/motion";
import { useT } from "@/store/chat";
import { OAuthButtons } from "./OAuthButtons";
import { PasswordInput } from "./PasswordInput";
import { FieldError, FormAlert, SubmitButton, inputClass } from "./form-primitives";

/** Landing'dagi tarif tugmasi: /register?plan=pro&period=year — Dashboard o'qiydi. */
const PENDING_PLAN_KEY = "sov-pending-plan";
const LINK_CLASS = "text-primary-soft underline underline-offset-4 hover:text-primary";

export function RegisterForm() {
  const t = useT();

  // Tanlangan tarifni eslab qolamiz: onboarding'dan keyin to'lov oynasi shu tarif bilan ochiladi.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const plan = q.get("plan");
    if (!plan || !/^[a-z]{2,16}$/.test(plan)) return;
    const period = q.get("period") === "year" ? "year" : "month";
    try {
      localStorage.setItem(PENDING_PLAN_KEY, JSON.stringify({ plan, period, at: Date.now() }));
    } catch {
      /* saqlab bo'lmadi — oddiy ro'yxatdan o'tish davom etadi */
    }
  }, []);
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: "", password: "", confirmPassword: "", acceptTerms: false },
    mode: "onTouched",
  });

  function onSubmit(values: RegisterInput) {
    setServerError(null);
    startTransition(async () => {
      const res = await signUpWithEmail(values);
      if (!res) return; // redirected
      if (!res.ok) setServerError(res.error);
      else if (res.status === "confirm-email") setSentTo(values.email);
    });
  }

  if (sentTo) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.35, ease: EASE }}
        className="rounded-2xl border border-[var(--border-accent)] bg-primary/5 p-6 text-center"
      >
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/15 text-primary-soft">
          <MailCheck className="size-6" />
        </div>
        <h2 className="font-display mt-4 text-lg font-bold text-text-primary">{t("auCheckInbox")}</h2>
        <p className="mt-2 text-sm text-text-secondary">
          {t("auSentToPrefix")}
          <span className="font-medium text-text-primary">{sentTo}</span>
          {t("auSentToSuffix")} {t("auAfterConfirm")}
        </p>
        <p className="mt-4 text-xs text-text-muted">{t("auNoEmail")}</p>
      </motion.div>
    );
  }

  return (
    <div className="space-y-5">
      <OAuthButtons next="/onboarding" onError={setServerError} />

      <div className="flex items-center gap-3 text-xs text-text-muted">
        <span className="h-px flex-1 bg-border" />
        {t("auOr")}
        <span className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-text-secondary">{t("auEmail")}</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="email@example.com"
            aria-invalid={!!form.formState.errors.email}
            className={inputClass}
            {...form.register("email")}
          />
          <FieldError message={form.formState.errors.email?.message} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password" className="text-text-secondary">{t("auPassword")}</Label>
          <PasswordInput
            id="password"
            autoComplete="new-password"
            placeholder={t("auPasswordMinPlaceholder")}
            aria-invalid={!!form.formState.errors.password}
            className={inputClass}
            {...form.register("password")}
          />
          <FieldError message={form.formState.errors.password?.message} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="confirmPassword" className="text-text-secondary">{t("auConfirmPassword")}</Label>
          <PasswordInput
            id="confirmPassword"
            autoComplete="new-password"
            placeholder={t("auConfirmPasswordPlaceholder")}
            aria-invalid={!!form.formState.errors.confirmPassword}
            className={inputClass}
            {...form.register("confirmPassword")}
          />
          <FieldError message={form.formState.errors.confirmPassword?.message} />
        </div>

        <Controller
          control={form.control}
          name="acceptTerms"
          render={({ field }) => (
            <div className="space-y-1.5">
              <label className="flex cursor-pointer items-start gap-2.5 text-sm text-text-secondary">
                <Checkbox
                  checked={field.value}
                  onCheckedChange={(v) => field.onChange(v === true)}
                  aria-invalid={!!form.formState.errors.acceptTerms}
                  className="mt-0.5"
                />
                <span>
                  {t("auAcceptPrefix")}
                  <Link href="/terms" target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
                    {t("auAcceptLink")}
                  </Link>
                  {t("uxAnd")}
                  <Link href="/privacy" target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
                    {t("uxPrivacyAccept")}
                  </Link>
                  {t("auAcceptSuffix")}
                </span>
              </label>
              <FieldError message={form.formState.errors.acceptTerms?.message} />
            </div>
          )}
        />

        <AnimatePresence>{serverError && <FormAlert message={serverError} />}</AnimatePresence>

        <SubmitButton pending={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          {t("auContinue")}
          {!pending && <ArrowRight className="size-4" />}
        </SubmitButton>
      </form>
    </div>
  );
}
