import { searchOmniRouteModels, omniRouteConfigured } from "@/lib/ai/omniroute-models";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * GET /api/models?q=<qidiruv>&limit=<n>
 * OmniRoute katalogini (1700+ model) qidiruv bilan qaytaradi. Kalit oshkor
 * bo'lmaydi — server keshdan beradi. CLI, veb va Cowork shu endpointdan foydalanadi.
 */
export async function GET(req: Request) {
  const ipRl = rateLimit(`models:ip:${clientIp(req)}`, 60, 60_000);
  if (!ipRl.ok) return Response.json({ error: "Juda ko'p so'rov" }, { status: 429 });

  if (!omniRouteConfigured()) {
    return Response.json({ configured: false, total: 0, models: [] });
  }

  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  const limit = Number(url.searchParams.get("limit") ?? 60);
  const { total, models } = await searchOmniRouteModels(q, Number.isFinite(limit) ? limit : 60);

  return Response.json(
    { configured: true, total, models },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}
