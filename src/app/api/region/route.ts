import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { resolveUserRegion } from "@/lib/ai/region-server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { getServerT } from "@/lib/i18n-server";

export const runtime = "nodejs";

/**
 * GET /api/region — foydalanuvchi mintaqasi (serverda: IP + SBP to'lovi + onboarding).
 * Faqat UI uchun (ModelSwitcher / PricingDialog'da yopiq modellarni ko'rsatish);
 * haqiqiy cheklov /api/chat va /api/cli/chat ichida serverda qo'llanadi.
 */
export async function GET(req: Request) {
  const rl = await rateLimit(`region:ip:${clientIp(req)}`, 30, 60_000);
  if (!rl.ok) return Response.json({ error: (await getServerT())("chTooManyRequests") }, { status: 429 });

  let supabase = null;
  let userId: string | null = null;
  if (isSupabaseConfigured()) {
    supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  }
  const region = await resolveUserRegion({ headers: req.headers, supabase, userId });
  return Response.json(
    { country: region.country, restricted: region.restricted, sanctioned: region.sanctioned, source: region.source },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
