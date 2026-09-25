import { z } from "zod";
import { generateImage } from "@/lib/ai/image";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { effectivePlan, getProfile } from "@/lib/auth/profile";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { getServerT } from "@/lib/i18n-server";
import { fmt } from "@/lib/i18n";

/** Kunlik rasm limiti (tarif bo'yicha). */
const IMAGES_PER_DAY: Record<string, number> = { free: 3, starter: 15, pro: 60, ultra: 200 };

export const runtime = "nodejs";
export const maxDuration = 180;

const schema = z.object({ prompt: z.string().min(2).max(2000) });

/** POST /api/image — foydalanuvchi uchun rasm (tarif bo'yicha kunlik limit). */
export async function POST(req: Request) {
  // Cost-DoS: har foydalanuvchi/IP uchun kuchli rate-limit
  const t = await getServerT();
  const ipRl = await rateLimit(`img:ip:${clientIp(req)}`, 10, 60_000);
  if (!ipRl.ok) return Response.json({ error: t("chTooManyImages") }, { status: 429 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return Response.json({ error: t("chBadRequest") }, { status: 400 });

  // Rasm endi tekin AI Horde orqali (OmniRoute) — barcha tariflarga ochiq,
  // lekin tarif bo'yicha kunlik limit (Upstash: barcha serverlar uchun umumiy).
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const profile = await getProfile(supabase, user.id);
      const plan = effectivePlan(profile);
      const perDay = IMAGES_PER_DAY[plan.id] ?? IMAGES_PER_DAY.free;
      const day = await rateLimit(`img:day:${user.id}`, perDay, 24 * 60 * 60 * 1000);
      if (!day.ok) {
        return Response.json(
          { error: fmt(t("uxImageDailyLimit"), { n: perDay }), ...(plan.id === "ultra" ? {} : { upgrade: "pro" }) },
          { status: 429 },
        );
      }
    } else if (process.env.NODE_ENV !== "development") {
      return Response.json({ error: t("chLoginFirst") }, { status: 401 });
    }
  }

  try {
    const result = await generateImage(parsed.data.prompt);
    return Response.json(result);
  } catch (e) {
    console.error("[image] generatsiya xato:", e instanceof Error ? e.message : e);
    return Response.json({ error: t("chImageFailed") }, { status: 502 });
  }
}
