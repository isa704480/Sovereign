import { z } from "zod";
import { generateVideo, VideoError, videoEnabled } from "@/lib/ai/video";
import { resolveUserRegion } from "@/lib/ai/region-server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { effectivePlan, getProfile } from "@/lib/auth/profile";
import { clientIp, ipKey, rateLimit } from "@/lib/rate-limit";
import { getServerT } from "@/lib/i18n-server";
import { fmt } from "@/lib/i18n";
import { consumeMedia } from "@/lib/media/quota";

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

  const ipRl = await rateLimit(`vid:ip:${ipKey(clientIp(req))}`, 4, 60_000);
  if (!ipRl.ok) return Response.json({ error: t("p4eVideoTooMany") }, { status: 429 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return Response.json({ error: t("chBadRequest") }, { status: 400 });

  let country: string | null = null;
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: t("chLoginFirst") }, { status: 401 });
    const profile = await getProfile(supabase, user.id);
    // Mintaqa (region-server.ts): OFAC embargo mintaqasida Groq/Pollinations chaqirilmaydi (chat route
    // bilan bir xil); kvota tekshiruvidan OLDIN — rad etilgan so'rov kunlik limitni yemaydi.
    const region = await resolveUserRegion({ headers: req.headers, supabase, userId: user.id, onboarding: profile?.onboarding ?? null });
    if (region.sanctioned) return Response.json({ error: t("p10RegionNoModels") }, { status: 451 });
    country = region.restricted ? region.country : null;
    const plan = effectivePlan(profile);
    const perDay = VIDEOS_PER_DAY[plan.id] ?? 0;
    if (perDay <= 0) {
      return Response.json({ error: t("p4eVideoPlanRequired"), upgrade: "starter" }, { status: 403 });
    }
    const day = await rateLimit(`vid:day:${user.id}`, perDay, 24 * 60 * 60 * 1000);
    // Bazadagi kunlik hisob (0041) — pullik video: DB xatosida yopiq.
    const dbDay = day.ok ? await consumeMedia(supabase, "video", perDay) : false;
    if (dbDay === null) return Response.json({ error: t("p4eVideoBusy") }, { status: 503 });
    if (!day.ok || !dbDay) {
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
    const result = await generateVideo(parsed.data.prompt, undefined, { country });
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
