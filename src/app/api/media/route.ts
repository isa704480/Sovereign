/**
 * POST /api/media — video, musiqa yoki taqdimot render topshirig'i.
 *
 * So'rov:
 *   { kind: "video"|"music"|"presentation", prompt: string }
 *
 * Javob:
 *   { jobId: string, status: "processing" }
 *
 * Oqim:
 *   1. Auth + tarif tekshiruvi
 *   2. DB da ish yaratiladi (create_media_job RPC)
 *   3. Shotstack ga render yuboriladi, render_id DB ga saqlanadi
 *   4. Mijoz /api/media/status/[jobId] orqali holat so'raydi
 */

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { effectivePlan, getProfile } from "@/lib/auth/profile";
import { clientIp, ipKey, rateLimit } from "@/lib/rate-limit";
import { getServerT } from "@/lib/i18n-server";
import { shotstackEnabled, submitRender, buildVideoPayload, buildMusicPayload } from "@/lib/media/shotstack";

export const runtime = "nodejs";
export const maxDuration = 30; // Faqat topshiriq — render Shotstack da

// Tarif bo'yicha kunlik limit
const LIMITS: Record<string, Record<string, number>> = {
  video:        { free: 0, starter: 2, pro: 10, ultra: 50 },
  music:        { free: 1, starter: 5, pro: 20, ultra: 100 },
  presentation: { free: 0, starter: 1, pro:  5, ultra: 20 },
};

const schema = z.object({
  kind:   z.enum(["video", "music", "presentation"]),
  prompt: z.string().min(2).max(2000),
  // Ixtiyoriy: video uchun rasm URL'lari ro'yxati
  imageUrls: z.array(z.string().url()).max(30).optional(),
  audioUrl:  z.string().url().optional(),
  durationPerSlide: z.number().int().min(1).max(10).optional(),
  aspect: z.enum(["landscape", "portrait", "square"]).optional(),
});

export async function POST(req: Request) {
  const t = await getServerT();

  // Rate limit: IP bo'yicha
  const rl = await rateLimit(`media:ip:${ipKey(clientIp(req))}`, 10, 60_000);
  if (!rl.ok) return Response.json({ error: t("chTooManyRequests") }, { status: 429 });

  // Shotstack sozlanganmi?
  if (!shotstackEnabled()) {
    return Response.json({ error: t("p4eVideoUnavailable") }, { status: 503 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: t("chBadRequest") }, { status: 400 });
  }
  const { kind, prompt, imageUrls = [], audioUrl, durationPerSlide, aspect } = parsed.data;

  // Auth
  if (!isSupabaseConfigured()) {
    return Response.json({ error: t("chLoginFirst") }, { status: 401 });
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: t("chLoginFirst") }, { status: 401 });

  const profile = await getProfile(supabase, user.id);
  const plan = effectivePlan(profile);
  const planLimits = LIMITS[kind] ?? {};
  const perDay = planLimits[plan.id] ?? 0;

  if (perDay <= 0) {
    return Response.json({ error: t("p4eVideoPlanRequired"), upgrade: "starter" }, { status: 403 });
  }

  // Kunlik limit (Redis)
  const dayRl = await rateLimit(`media:${kind}:day:${user.id}`, perDay, 24 * 60 * 60 * 1000);
  if (!dayRl.ok) {
    return Response.json({ error: t("p4eVideoDailyLimit").replace("{n}", String(perDay)) }, { status: 429 });
  }

  try {
    const svc = createServiceClient();

    // DB da ish yaratish (RPC — auth.uid() tekshiradi)
    const { data: jobId, error: jobErr } = await supabase.rpc("create_media_job", {
      p_kind:   kind,
      p_prompt: prompt,
      p_plan:   plan.id,
    });
    if (jobErr || !jobId) {
      console.error("[media] create_media_job:", jobErr?.message);
      return Response.json({ error: t("p4eVideoFailed") }, { status: 500 });
    }

    // Render payload yaratish
    let payload;
    if (kind === "video" || kind === "presentation") {
      // Rasmlar yo'q bo'lsa — placeholder
      const imgs = imageUrls.length > 0
        ? imageUrls
        : [`https://via.placeholder.com/1280x720/060812/8B7DFF?text=${encodeURIComponent(prompt.slice(0, 40))}`];
      payload = buildVideoPayload({ imageUrls: imgs, audioUrl, durationPerSlide, aspect });
    } else {
      // music — audio URL kerak (Pollinations yoki tashqi)
      const audio = audioUrl ?? "https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3";
      payload = buildMusicPayload({ audioUrl: audio });
    }

    // Shotstack ga yuborish
    const renderId = await submitRender(payload, jobId);

    // render_id va status yangilash (service role)
    await svc.from("media_jobs")
      .update({ render_id: renderId, status: "processing" })
      .eq("id", jobId);

    return Response.json({ jobId, status: "processing" });

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[media] submit xato:", msg);
    return Response.json({ error: t("p4eVideoFailed") }, { status: 502 });
  }
}

export async function GET(req: Request) {
  // Shotstack yoqilganmi — mijoz "+" menyusi uchun
  return Response.json({
    enabled: shotstackEnabled(),
    kinds: ["video", "music", "presentation"],
  });
}
