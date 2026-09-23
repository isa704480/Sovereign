"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { AnimatePresence } from "motion/react";
import { requestPasswordReset, signInWithEmail } from "@/app/actions/auth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginSchema, type LoginInput } from "@/lib/validations/auth";
import { useT } from "@/store/chat";
import { OAuthButtons } from "./OAuthButtons";
import { PasswordInput } from "./PasswordInput";
import { FieldError, FormAlert, SubmitButton, inputClass } from "./form-primitives";

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

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
    mode: "onTouched",
  });

  function onSubmit(values: LoginInput) {
    setServerError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await signInWithEmail(values, next);
      if (res && !res.ok) setServerError(res.error);
    });
  }

  function onReset() {
    setServerError(null);
    setNotice(null);
    const email = form.getValues("email");
    startTransition(async () => {
      const res = await requestPasswordReset(email);
      if (!res.ok) setServerError(res.error);
      else {
        setNotice("auResetSent");
        setResetMode(false);
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

        {!resetMode && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password" className="text-text-secondary">{t("auPassword")}</Label>
              <button
                type="button"
                onClick={() => setResetMode(true)}
                className="text-xs text-text-muted transition-colors hover:text-primary-soft"
              >
                {t("auForgotPassword")}
              </button>
            </div>
            <PasswordInput
              id="password"
              autoComplete="current-password"
              placeholder={t("auPasswordPlaceholder")}
              aria-invalid={!!form.formState.errors.password}
              className={inputClass}
              {...form.register("password")}
            />
            <FieldError message={form.formState.errors.password?.message} />
          </div>
        )}

        <AnimatePresence>
          {serverError && <FormAlert key="err" message={serverError} />}
          {notice && <FormAlert key="ok" message={notice} tone="success" />}
        </AnimatePresence>

        <SubmitButton pending={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          {resetMode ? t("auSendResetLink") : t("login")}
          {!pending && <ArrowRight className="size-4" />}
        </SubmitButton>

        {resetMode && (
          <button
            type="button"
            onClick={() => setResetMode(false)}
            className="w-full text-center text-xs text-text-muted transition-colors hover:text-text-primary"
          >
            {t("auBackToPasswordLogin")}
          </button>
        )}
      </form>
    </div>
  );
}
