import "server-only";
import { createHash } from "node:crypto";

/**
 * Kalit barmoq izi: kalit sarlavhalari (Authorization / x-api-key / api-key) → sha256 → birinchi
 * 8 hex belgi. Qaytarib bo'lmaydi (kalitning o'zi hech qachon saqlanmaydi/logga chiqmaydi) —
 * faqat "auth blokini qaysi kalit olgan" ni solishtirish uchun: kalit almashtirilsa, eski blok
 * e'tiborsiz qoldiriladi. Kalit sarlavhasi yo'q — undefined.
 */
export function keyFingerprint(headers: Record<string, string> | undefined | null): string | undefined {
  if (!headers) return undefined;
  const parts: string[] = [];
  for (const [k, v] of Object.entries(headers)) {
    const name = k.toLowerCase();
    if ((name === "authorization" || name === "x-api-key" || name === "api-key") && typeof v === "string" && v.trim()) {
      parts.push(`${name}=${v.trim()}`);
    }
  }
  if (!parts.length) return undefined;
  parts.sort();
  return createHash("sha256").update(parts.join("\n")).digest("hex").slice(0, 8);
}
