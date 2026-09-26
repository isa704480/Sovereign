import { z } from "zod";
import { generateVideo, VideoError, videoEnabled } from "@/lib/ai/video";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { effectivePlan, getProfile } from "@/lib/auth/profile";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { getServerT } from "@/lib/i18n-server";
import { fmt } from "@/lib/i18n";

/** Kunlik video limiti (tarif bo'yicha) — video pullik (pollen), shuning uchun kam. */
const VIDEOS_PER_DAY: Record<string, number> = { free: 0, starter: 1, pro: 5, ultra: 20 };

export const runtime = "nodejs";
// Pollinations video sinxron: generatsiya 30-120 s, provayder chegarasi 300 s.
export const maxDuration = 300;

const schema = z.object({ prompt: z.string().min(2).max(2000) });

/** GET /api/video — video yoqilganmi (kalit sozlanganmi). Mijoz "+" menyusi uchun. */
export async function GET() {
  return Response.json({ enabled: videoEnabled() }, { headers: { "Cache-Control": "no-store" } });
}

/** POST /api/video — ~5 soniyalik video (faqat kirgan foydalanuvchi, tarif bo'yicha kunlik limit). */
export async function POST(req: Request) {
  const t = await getServerT();
  if (!videoEnabled()) return Response.json({ error: t("p4eVideoUnavailable") }, { status: 503 });

  const ipRl = await rateLimit(`vid:ip:${clientIp(req)}`, 4, 60_000);
  if (!ipRl.ok) return Response.json({ error: t("p4eVideoTooMany") }, { status: 429 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return Response.json({ error: t("chBadRequest") }, { status: 400 });

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: t("chLoginFirst") }, { status: 401 });
    const profile = await getProfile(supabase, user.id);
    const plan = effectivePlan(profile);
    const perDay = VIDEOS_PER_DAY[plan.id] ?? 0;
    if (perDay <= 0) {
      return Response.json({ error: t("p4eVideoPlanRequired"), upgrade: "starter" }, { status: 403 });
    }
    const day = await rateLimit(`vid:day:${user.id}`, perDay, 24 * 60 * 60 * 1000);
    if (!day.ok) {
      return Response.json(
        { error: fmt(t("p4eVideoDailyLimit"), { n: perDay }), ...(plan.id === "ultra" ? {} : { upgrade: "pro" }) },
        { status: 429 },
      );
    }
  } else if (process.env.NODE_ENV !== "development") {
    // Auth sozlanmagan prod — pullik video hech kimga ochiq emas.
    return Response.json({ error: t("chLoginFirst") }, { status: 401 });
  }

  try {
    const result = await generateVideo(parsed.data.prompt);
    return Response.json(result);
  } catch (e) {
    const code = e instanceof VideoError ? e.code : "failed";
    console.error("[video] generatsiya xato:", code, e instanceof Error ? e.message : "");
    if (code === "blocked") return Response.json({ error: t("p4eVideoBlocked") }, { status: 400 });
    if (code === "busy") return Response.json({ error: t("p4eVideoBusy") }, { status: 503 });
    if (code === "disabled") return Response.json({ error: t("p4eVideoUnavailable") }, { status: 503 });
    return Response.json({ error: t("p4eVideoFailed") }, { status: 502 });
  }
}
