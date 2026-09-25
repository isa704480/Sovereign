import { z } from "zod";
import { createAnonClient } from "@/lib/supabase/anon";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { getServerT } from "@/lib/i18n-server";

export const runtime = "nodejs";

const schema = z.object({ device: z.string().max(80).optional() });

/** POST /api/cli/start — creates a device-login code, returns the approve URL. */
export async function POST(req: Request) {
  // Har IP uchun cheklov — cli_sessions jadvalini keraksiz kodlar bilan
  // to'ldirishning (spam/DoS) oldini oladi.
  const rl = rateLimit(`cli-start:ip:${clientIp(req)}`, 10, 60_000);
  if (!rl.ok) {
    return Response.json(
      { error: (await getServerT())("secTooManyRequests") },
      { status: 429, headers: { "Retry-After": Math.ceil(rl.retryAfterMs / 1000).toString() } },
    );
  }

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  const device = parsed.success ? parsed.data.device : undefined;

  let code: string;
  try {
    const supabase = createAnonClient();
    const { data, error } = await supabase.rpc("cli_start", { p_device: device ?? null });
    if (error || typeof data !== "string") {
      if (error) console.error("[cli/start]", error.message);
      return Response.json({ error: (await getServerT())("secServerError") }, { status: 500 });
    }
    code = data;
  } catch (e) {
    console.error("[cli/start]", e);
    return Response.json({ error: (await getServerT())("secServerError") }, { status: 500 });
  }

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;
  return Response.json({ code, url: `${origin.replace(/\/$/, "")}/cli/connect?code=${code}` });
}
