import { z } from "zod";

export const emailSchema = z
  .email({ message: "To'g'ri email manzil kiriting" })
  .trim()
  .toLowerCase();

export const passwordSchema = z
  .string()
  .min(8, "Parol kamida 8 belgidan iborat bo'lsin")
  .max(72, "Parol juda uzun");

export const registerSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    acceptTerms: z.boolean().refine((v) => v === true, {
      message: "Davom etish uchun shartlarga rozilik bering",
    }),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Parollar mos kelmadi",
    path: ["confirmPassword"],
  });

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Parolni kiriting"),
});

export const resetSchema = z.object({
  email: emailSchema,
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ResetInput = z.infer<typeof resetSchema>;

export type OAuthProvider = "google" | "github";
