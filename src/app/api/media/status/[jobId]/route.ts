/**
 * GET /api/media/status/[jobId] — render ishi holati.
 *
 * Javob:
 *   { status: "pending"|"processing"|"done"|"failed", url?: string }
 *
 * Xavfsizlik:
 *   - Faqat ish egasi (user_id = auth.uid()) ko'ra oladi (RLS)
 *   - jobId UUID format tekshiriladi
 */

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getServerT } from "@/lib/i18n-server";
import { clientIp, ipKey, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const t = await getServerT();
  const { jobId } = await params;

  // UUID tekshiruvi — IDOR oldini olish
  if (!UUID_RE.test(jobId ?? "")) {
    return Response.json({ error: t("chBadRequest") }, { status: 400 });
  }

  // Rate limit — polling spam oldini olish
  const rl = await rateLimit(`media-status:ip:${ipKey(clientIp(req))}`, 60, 60_000);
  if (!rl.ok) return Response.json({ error: t("chTooManyRequests") }, { status: 429 });

  if (!isSupabaseConfigured()) {
    return Response.json({ error: t("chLoginFirst") }, { status: 401 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: t("chLoginFirst") }, { status: 401 });

  // RLS — faqat o'z ishi (user_id = auth.uid())
  const { data, error } = await supabase
    .from("media_jobs")
    .select("id, status, result_url, kind, created_at")
    .eq("id", jobId)
    .maybeSingle();

  if (error) {
    console.error("[media-status]", error.message);
    return Response.json({ error: t("p4eVideoFailed") }, { status: 500 });
  }
  if (!data) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  return Response.json({
    status:  data.status,
    url:     data.result_url ?? undefined,
    kind:    data.kind,
    created: data.created_at,
  });
}
