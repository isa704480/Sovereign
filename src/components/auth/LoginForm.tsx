"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { AnimatePresence } from "motion/react";
import { requestPasswordReset, signInWithEmail } from "@/app/actions/auth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginSchema, type LoginInput } from "@/lib/validations/auth";
import { useT } from "@/store/chat";
import { OAuthButtons } from "./OAuthButtons";
import { PasswordInput } from "./PasswordInput";
import { Turnstile, type TurnstileHandle } from "./Turnstile";
import { FieldError, FormAlert, SubmitButton, actionFailed, inputClass } from "./form-primitives";

interface LoginFormProps {
  next?: string | null;
  initialError?: string | null;
}

export function LoginForm({ next, initialError }: LoginFormProps) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(initialError ?? null);
  const [notice, setNotice] = useState<string | null>(null);
  const [resetMode, setResetMode] = useState(false);
  // CAPTCHA tokeni (Turnstile yoqilgan bo'lsa) — bir martalik, har urinishdan keyin yangilanadi.
  const [captcha, setCaptcha] = useState<string | undefined>();
  const captchaRef = useRef<TurnstileHandle>(null);

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
    mode: "onTouched",
  });

  function onSubmit(values: LoginInput) {
    setServerError(null);
    setNotice(null);
    startTransition(async () => {
      // Tarmoq uzilsa server action reject bo'ladi — Next xato ekrani o'rniga forma ichida xabar
      // (redirect() xatosi actionFailed ichida qayta otiladi).
      try {
        const res = await signInWithEmail(values, next, captcha);
        if (res && !res.ok) setServerError(res.error);
      } catch (e) {
        setServerError(actionFailed(e, "signIn"));
      } finally {
        captchaRef.current?.reset();
      }
    });
  }

  function onReset() {
    setServerError(null);
    setNotice(null);
    const email = form.getValues("email");
    startTransition(async () => {
      try {
        const res = await requestPasswordReset(email, captcha);
        if (!res.ok) setServerError(res.error);
        else {
          setNotice("auResetSent");
          setResetMode(false);
        }
      } catch (e) {
        setServerError(actionFailed(e, "reset request"));
      } finally {
        captchaRef.current?.reset();
      }
    });
  }

  return (
    <div className="space-y-5">
      <OAuthButtons next={next} onError={setServerError} />

      <div className="flex items-center gap-3 text-xs text-text-muted">
        <span className="h-px flex-1 bg-border" />
        {t("auOr")}
        <span className="h-px flex-1 bg-border" />
      </div>

      <form
        onSubmit={resetMode ? (e) => { e.preventDefault(); onReset(); } : form.handleSubmit(onSubmit)}
        className="space-y-4"
        noValidate
      >
        <div className="space-y-1.5">
          <Label htmlFor="login-email" className="text-text-secondary">{t("auEmail")}</Label>
          <Input
            id="login-email"
            type="email"
            autoComplete="email"
            placeholder="email@example.com"
            aria-invalid={!!form.formState.errors.email}
            aria-describedby={form.formState.errors.email ? "login-email-error" : undefined}
            className={inputClass}
            {...form.register("email")}
          />
          <FieldError id="login-email-error" message={form.formState.errors.email?.message} />
        </div>

        {!resetMode && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="login-password" className="text-text-secondary">{t("auPassword")}</Label>
              <button
                type="button"
                onClick={() => setResetMode(true)}
                className="-mr-1 inline-flex min-h-11 items-center px-1 text-sm text-text-secondary transition-colors hover:text-primary-soft"
              >
                {t("auForgotPassword")}
              </button>
            </div>
            <PasswordInput
              id="login-password"
              autoComplete="current-password"
              placeholder={t("auPasswordPlaceholder")}
              aria-invalid={!!form.formState.errors.password}
              aria-describedby={form.formState.errors.password ? "login-password-error" : undefined}
              className={inputClass}
              {...form.register("password")}
            />
            <FieldError id="login-password-error" message={form.formState.errors.password?.message} />
          </div>
        )}

        <Turnstile ref={captchaRef} onToken={setCaptcha} />

        <AnimatePresence>
          {serverError && <FormAlert key="err" message={serverError} />}
          {notice && <FormAlert key="ok" message={notice} tone="success" />}
        </AnimatePresence>

        <SubmitButton pending={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {resetMode ? t("auSendResetLink") : t("login")}
          {!pending && <ArrowRight className="size-4" aria-hidden />}
        </SubmitButton>

        {resetMode && (
          <button
            type="button"
            onClick={() => setResetMode(false)}
            className="inline-flex min-h-11 w-full items-center justify-center text-sm text-text-secondary transition-colors hover:text-text-primary"
          >
            <ArrowLeft className="mr-1.5 size-3.5" aria-hidden />
            {t("auBackToPasswordLogin")}
          </button>
        )}
      </form>
    </div>
  );
}
