import { createAnonClient } from "@/lib/supabase/anon";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { getServerT } from "@/lib/i18n-server";

export const runtime = "nodejs";

/**
 * GET /api/cli/poll?code=... — returns the token once the browser approved.
 * Token faqat BIR MARTA yetkaziladi (0027 cli_poll → delivered_at); keyingi
 * so'rovlar "expired" oladi.
 */
export async function GET(req: Request) {
  // CLI har ~2 soniyada so'raydi — 60/min yetarli, kod taxminlashni sekinlashtiradi.
  const rl = await rateLimit(`cli-poll:ip:${clientIp(req)}`, 60, 60_000);
  if (!rl.ok) return Response.json({ error: (await getServerT())("secTooManyRequests") }, { status: 429 });

  const code = new URL(req.url).searchParams.get("code");
  if (!code || code.length > 128) return Response.json({ error: "code kerak" }, { status: 400 });

  try {
    const supabase = createAnonClient();
    const { data, error } = await supabase.rpc("cli_poll", { p_code: code });
    if (error) {
      console.error("[cli/poll]", error.message);
      return Response.json({ error: (await getServerT())("secServerError") }, { status: 500 });
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return Response.json({ status: "expired" });
    if (!row.approved || !row.token) return Response.json({ status: "pending" });
    return Response.json({ status: "approved", token: row.token });
  } catch (e) {
    console.error("[cli/poll]", e);
    return Response.json({ error: (await getServerT())("secServerError") }, { status: 500 });
  }
}
