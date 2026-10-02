/**
 * POST /api/webhooks/shotstack — Shotstack render natijasi.
 *
 * Xavfsizlik:
 *   - HMAC-SHA256 imzo tekshiruvi (SHOTSTACK_WEBHOOK_SECRET)
 *   - jobId UUID format tekshiruvi
 *   - Faqat service_role bilan DB yangilash
 *   - URL SSRF tekshiruvi — faqat *.shotstack.io domenidan
 *
 * Payload (Shotstack yuboradi):
 *   { id, status: "done"|"failed", url?, error? }
 */

import { createServiceClient } from "@/lib/supabase/service";
import { verifyWebhookSignature } from "@/lib/media/shotstack";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Shotstack natija URL'i xavfsizmi — faqat rasmiy domendan */
function isSafeResultUrl(url: unknown): url is string {
  if (typeof url !== "string") return false;
  try {
    const u = new URL(url);
    // Shotstack CDN yoki S3 domenlariga ruxsat
    return (
      u.protocol === "https:" &&
      (u.hostname.endsWith(".shotstack.io") ||
       u.hostname.endsWith(".amazonaws.com"))
    );
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  // Raw body (imzo tekshiruvi uchun)
  const rawBody = await req.text();
  const signature = req.headers.get("x-shotstack-signature");

  // HMAC imzo tekshiruvi
  if (!verifyWebhookSignature(rawBody, signature)) {
    console.warn("[webhook/shotstack] imzo tekshiruvi muvaffaqiyatsiz");
    return Response.json({ error: "invalid signature" }, { status: 401 });
  }

  // jobId URL parametridan
  const url = new URL(req.url);
  const jobId = url.searchParams.get("jobId") ?? "";

  if (!UUID_RE.test(jobId)) {
    console.warn("[webhook/shotstack] noto'g'ri jobId:", jobId.slice(0, 40));
    return Response.json({ error: "invalid jobId" }, { status: 400 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  const status = payload.status as string;
  const resultUrl = payload.url;

  // Faqat ma'lum holatlar
  if (status !== "done" && status !== "failed") {
    // "rendering", "fetching" — hali davom etayapti, 200 qaytaramiz
    return Response.json({ ok: true, ignored: true });
  }

  const svc = createServiceClient();

  if (status === "done" && isSafeResultUrl(resultUrl)) {
    const { error } = await svc
      .from("media_jobs")
      .update({ status: "done", result_url: resultUrl })
      .eq("id", jobId);

    if (error) console.error("[webhook/shotstack] DB yangilash xato:", error.message);
  } else if (status === "failed") {
    const errMsg = typeof payload.error === "string"
      ? payload.error.slice(0, 300)
      : "Shotstack render failed";
    const { error } = await svc
      .from("media_jobs")
      .update({ status: "failed", error_msg: errMsg })
      .eq("id", jobId);

    if (error) console.error("[webhook/shotstack] DB failed yangilash:", error.message);
    console.warn("[webhook/shotstack] render failed, jobId:", jobId, "reason:", errMsg);
  }

  return Response.json({ ok: true });
}
