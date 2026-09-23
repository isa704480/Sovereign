import { isWatchdogConfigured, probeOmniRoute, restartOmniRoute } from "@/lib/omniroute-watchdog";

export const runtime = "nodejs";
export const maxDuration = 90;
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/omniroute-watchdog — OmniRoute'ni tekshiradi, tiqilib qolgan
 * bo'lsa Railway orqali restart qiladi.
 *   (parametrsiz)        — 2 marta tekshiradi, ikkalasi ham yomon bo'lsa restart (GitHub Actions, 10 daqiqada)
 *   ?mode=preventive     — kechki profilaktik restart (Vercel cron, kuniga 1)
 * Himoya: Authorization: Bearer $CRON_SECRET (Vercel cron o'zi qo'yadi).
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isWatchdogConfigured()) {
    return Response.json({ ok: false, error: "RAILWAY_* env sozlanmagan" }, { status: 503 });
  }

  const mode = new URL(req.url).searchParams.get("mode");
  if (mode === "preventive") {
    return Response.json({ ok: true, mode, ...(await restartOmniRoute("preventive: kechki tozalash")) });
  }

  const first = await probeOmniRoute();
  if (first.healthy) return Response.json({ ok: true, healthy: true, status: first.status });
  // Bir martalik tebranish emasligini tekshirish uchun qisqa tanaffusdan so'ng yana.
  await new Promise((r) => setTimeout(r, 8_000));
  const second = await probeOmniRoute();
  if (second.healthy) return Response.json({ ok: true, healthy: true, recovered: true, status: second.status });

  const result = await restartOmniRoute(`watchdog: ${second.status} ${second.message.slice(0, 80)}`);
  return Response.json({ ok: true, healthy: false, probe: second, ...result });
}
