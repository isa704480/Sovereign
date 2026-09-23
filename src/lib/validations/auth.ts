import { z } from "zod";
import type { AuthKey } from "@/lib/locales/auth";

/**
 * Xato xabarlari — AUTH lug'ati kalitlari. Client (FieldError) va server action
 * ularni foydalanuvchi tanlagan tilga o'giradi.
 */
const k = (key: AuthKey) => key;

export const emailSchema = z
  .email({ message: k("auErrEmail") })
  .trim()
  .toLowerCase();

export const passwordSchema = z
  .string()
  .min(8, k("auErrPwMin"))
  .max(72, k("auErrPwMax"));

export const registerSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    acceptTerms: z.boolean().refine((v) => v === true, {
      message: k("auErrTerms"),
    }),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: k("auErrPwMismatch"),
    path: ["confirmPassword"],
  });

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, k("auErrPwRequired")),
});

export const resetSchema = z.object({
  email: emailSchema,
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ResetInput = z.infer<typeof resetSchema>;

export type OAuthProvider = "google" | "github";
