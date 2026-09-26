import { getHealthSnapshot, HEALTH_CACHE_SECONDS } from "@/lib/status/health";
import { clientIp, rateLimit } from "@/lib/rate-limit";

/**
 * GET /api/health — ommaviy status (status.soveregn.xyz sahifasi shu yerdan o'qiydi).
 * Natija server xotirasida 60s keshlanadi va CDN ham 60s ushlab turadi; IP bo'yicha
 * rate limit qo'shimcha himoya. Javobda secret/ichki URL/upstream xato matni yo'q.
 */
export const dynamic = "force-dynamic";

const LIMIT_PER_MINUTE = 30;

export async function GET(req: Request) {
  const rl = await rateLimit(`health:${clientIp(req)}`, LIMIT_PER_MINUTE, 60_000);
  if (!rl.ok) {
    return Response.json(
      { error: "rate_limited" },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)),
          "Cache-Control": "no-store",
        },
      },
    );
  }

  const snapshot = await getHealthSnapshot();
  return Response.json(snapshot, {
    headers: {
      "Cache-Control": `public, max-age=30, s-maxage=${HEALTH_CACHE_SECONDS}, stale-while-revalidate=30`,
    },
  });
}
