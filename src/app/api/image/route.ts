import { z } from "zod";
import { generateImage } from "@/lib/ai/image";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { effectivePlan, getProfile } from "@/lib/auth/profile";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({ prompt: z.string().min(2).max(2000) });

/** POST /api/image — generate an image for the current user (plan-gated). */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Noto'g'ri so'rov" }, { status: 400 });

  // Image generation lives on the Pro+ plan.
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const profile = await getProfile(supabase, user.id);
      const plan = effectivePlan(profile);
      if (!plan.limits.fullCode) {
        return Response.json(
          { error: "Rasm generatsiya Pro tarifda ochiladi.", upgrade: "pro" },
          { status: 402 },
        );
      }
    } else if (process.env.NODE_ENV !== "development") {
      return Response.json({ error: "Avval tizimga kiring" }, { status: 401 });
    }
  }

  try {
    const result = await generateImage(parsed.data.prompt);
    return Response.json(result);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Rasm yaratilmadi" }, { status: 502 });
  }
}
