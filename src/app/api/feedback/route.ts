import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { clientIp, ipKey, rateLimit } from "@/lib/rate-limit";
import { getServerLang, getServerT } from "@/lib/i18n-server";

export const runtime = "nodejs";

const schema = z.object({
  kind: z.enum(["idea", "bug", "complaint", "other"]),
  message: z.string().trim().min(3).max(4000),
  page: z.string().max(300).optional(),
});

/**
 * POST /api/feedback — taklif / xato / shikoyat. Faqat serverda (service role)
 * `feedback` jadvaliga yoziladi (0031). Kirmagan mehmon ham yozishi mumkin —
 * spamga qarshi IP bo'yicha 5 ta / 10 daqiqa.
 */
export async function POST(req: Request) {
  const t = await getServerT();
  const tooMany = () => Response.json({ error: t("chTooManyRequests") }, { status: 429 });
  // IPv6 — /64 prefiks bo'yicha (manzil almashtirib chetlab o'tilmasin).
  if (!(await rateLimit(`feedback:${ipKey(clientIp(req))}`, 5, 10 * 60_000)).ok) return tooMany();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: t("fbTooShort") }, { status: 400 });
  if (!isSupabaseConfigured()) return Response.json({ error: t("fbFailed") }, { status: 503 });

  let userId: string | null = null;
  let email: string | null = null;
  try {
    const {
      data: { user },
    } = await (await createClient()).auth.getUser();
    userId = user?.id ?? null;
    email = user?.email ?? null;
  } catch {
    /* mehmon */
  }
  // Kirgan foydalanuvchi — hisobi bo'yicha; mehmonlar — umumiy soatlik chegara
  // (ko'p IP'dan spam admin navbatini to'ldirmasin).
  const extra = userId
    ? await rateLimit(`feedback:user:${userId}`, 10, 60 * 60_000)
    : await rateLimit("feedback:guest:global", 60, 60 * 60_000);
  if (!extra.ok) return tooMany();

  try {
    const { error } = await createServiceClient()
      .from("feedback")
      .insert({
        user_id: userId,
        email,
        kind: parsed.data.kind,
        message: parsed.data.message,
        page: parsed.data.page ?? null,
        lang: await getServerLang(),
        user_agent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
      });
    if (error) throw new Error(error.message);
  } catch (e) {
    console.error("[feedback] insert:", e instanceof Error ? e.message : e);
    return Response.json({ error: t("fbFailed") }, { status: 500 });
  }
  return Response.json({ ok: true });
}
