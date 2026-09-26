"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { AnimatePresence } from "motion/react";
import { z } from "zod";
import { updatePassword } from "@/app/actions/auth";
import { Label } from "@/components/ui/label";
import { passwordSchema } from "@/lib/validations/auth";
import { useT } from "@/store/chat";
import { PasswordInput } from "./PasswordInput";
import { FieldError, FormAlert, SubmitButton, inputClass } from "./form-primitives";

const schema = z
  .object({ password: passwordSchema, confirmPassword: z.string() })
  .refine((d) => d.password === d.confirmPassword, { message: "auErrPwMismatch", path: ["confirmPassword"] });
type Values = z.infer<typeof schema>;

/** Tiklash havolasidan keyin yangi parol o'rnatish formasi (/reset-password). */
export function ResetPasswordForm() {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { password: "", confirmPassword: "" },
    mode: "onTouched",
  });

  function onSubmit(values: Values) {
    setServerError(null);
    startTransition(async () => {
      const res = await updatePassword(values);
      if (res && !res.ok) setServerError(res.error);
    });
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="password" className="text-text-secondary">{t("auNewPassword")}</Label>
        <PasswordInput
          id="password"
          autoComplete="new-password"
          autoFocus
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

      <AnimatePresence>{serverError && <FormAlert message={serverError} />}</AnimatePresence>

      <SubmitButton pending={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        {t("auSaveNewPassword")}
        {!pending && <ArrowRight className="size-4" />}
      </SubmitButton>
    </form>
  );
}
