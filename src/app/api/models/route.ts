import { searchOmniRouteModels, getFamilies, omniRouteConfigured } from "@/lib/ai/omniroute-models";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * GET /api/models
 *   ?families=1            → oilalar ro'yxati (Cursor uslubi: Claude, Gemini, ...)
 *   ?family=<key>&q=&limit → o'sha oiladagi modellar
 *   ?q=<matn>&limit        → hamma bo'yicha qidiruv
 * Kalit oshkor bo'lmaydi — server keshdan beradi. CLI, veb va Cowork foydalanadi.
 */
export async function GET(req: Request) {
  const ipRl = rateLimit(`models:ip:${clientIp(req)}`, 60, 60_000);
  if (!ipRl.ok) return Response.json({ error: "Juda ko'p so'rov" }, { status: 429 });

  if (!omniRouteConfigured()) {
    return Response.json({ configured: false, total: 0, models: [], families: [] });
  }

  const url = new URL(req.url);

  if (url.searchParams.get("families")) {
    const families = await getFamilies();
    return Response.json({ configured: true, families }, { headers: { "Cache-Control": "public, max-age=300" } });
  }

  const q = url.searchParams.get("q") ?? "";
  const family = url.searchParams.get("family") ?? "";
  const limit = Number(url.searchParams.get("limit") ?? 60);
  const { total, models } = await searchOmniRouteModels(q, Number.isFinite(limit) ? limit : 60, family);

  return Response.json(
    { configured: true, total, models },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}
