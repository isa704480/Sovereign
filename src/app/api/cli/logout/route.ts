import { createAnonClient } from "@/lib/supabase/anon";
import { clientIp, ipKey, rateLimit } from "@/lib/rate-limit";
import { getServerT } from "@/lib/i18n-server";
import { bearerToken, tokenKey } from "@/lib/cli/device";

export const runtime = "nodejs";

/**
 * POST /api/cli/logout — CLI (`sov logout`) va Cowork chiqishi o'z tokenini SERVERDA bekor
 * qiladi (0040 cli_revoke_self). Avval faqat mahalliy fayl o'chirilardi — sizib chiqqan token
 * 90 kun ishlayverardi (cli-api-2).
 *
 * Javob: { ok: true, revoked: boolean }. Token allaqachon yaroqsiz bo'lsa ham ok: true
 * (mijoz baribir mahalliy konfiguratsiyani tozalaydi). Migratsiya hali ishlamagan bo'lsa — 503.
 */
export async function POST(req: Request) {
  const t = await getServerT();
  const token = bearerToken(req);
  if (!token) return Response.json({ error: t("p7cCliNoToken") }, { status: 401 });

  const rl = await rateLimit(`cli-logout:${tokenKey(token)}`, 10, 60_000);
  if (!rl.ok) return Response.json({ error: t("secTooManyRequests") }, { status: 429 });
  const ipRl = await rateLimit(`cli-logout:ip:${ipKey(clientIp(req))}`, 30, 60_000);
  if (!ipRl.ok) return Response.json({ error: t("secTooManyRequests") }, { status: 429 });

  try {
    const { data, error } = await createAnonClient().rpc("cli_revoke_self", { p_token: token });
    if (error) {
      console.error("[cli/logout]", error.message);
      return Response.json({ error: t("secServerError") }, { status: error.code === "PGRST202" ? 503 : 500 });
    }
    return Response.json({ ok: true, revoked: data === true }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[cli/logout]", e);
    return Response.json({ error: t("secServerError") }, { status: 500 });
  }
}
