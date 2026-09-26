import { isAuthKey, type AuthKey } from "@/lib/locales/auth";
import { P3C } from "@/lib/locales/p3-c";

/** Auth sahifalarida ko'rsatilishi mumkin bo'lgan qo'shimcha (3-bosqich) kalitlar. */
type P3AuthKey = Extract<keyof typeof P3C, `au${string}`>;
export type AuthMsgKey = AuthKey | P3AuthKey;

/**
 * Qiymat auth xabar kalitimi. URL ?error= va server javoblari faqat shu kalitlar
 * orqali ko'rsatiladi — ixtiyoriy matn (content spoofing) sahifaga chiqmaydi.
 * Server va client komponentlarida bir xil ishlaydi (sof funksiya).
 */
export function isAuthMsgKey(v: unknown): v is AuthMsgKey {
  if (isAuthKey(v)) return true;
  return typeof v === "string" && v.startsWith("au") && Object.prototype.hasOwnProperty.call(P3C, v);
}
