import "server-only";

/**
 * Resend REST API orqali bitta email (SDK'siz). Kalit: RESEND_API_KEY.
 * Hech qachon throw qilmaydi — natijani qaytaradi (cron keyingi foydalanuvchiga o'tadi).
 */

export const TIPS_FROM = "SOVEREIGN AI <tips@soveregn.xyz>";

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
  /** Takroriy yuborishdan himoya (Resend Idempotency-Key). */
  idempotencyKey?: string;
}

export type SendEmailResult = { ok: true; id: string | null } | { ok: false; status: number; error: string };

export function isResendConfigured(): boolean {
  return !!process.env.RESEND_API_KEY?.trim();
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return { ok: false, status: 0, error: "RESEND_API_KEY not set" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...(input.idempotencyKey ? { "Idempotency-Key": input.idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from: TIPS_FROM,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
        headers: input.headers,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, status: res.status, error: body.slice(0, 200) };
    }
    const data = (await res.json().catch(() => null)) as { id?: string } | null;
    return { ok: true, id: data?.id ?? null };
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message.slice(0, 200) : "network error" };
  }
}
