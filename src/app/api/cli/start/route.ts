import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { clientIp, ipKey, rateLimit } from "@/lib/rate-limit";
import { getServerT } from "@/lib/i18n-server";
import { countryOf } from "@/lib/cli/device";

export const runtime = "nodejs";

const schema = z.object({ device: z.string().max(80).optional() });

/** POST /api/cli/start — creates a device-login code, returns the approve URL. */
export async function POST(req: Request) {
  // Har IP uchun cheklov — cli_sessions jadvalini keraksiz kodlar bilan
  // to'ldirishning (spam/DoS) oldini oladi.
  const rl = await rateLimit(`cli-start:ip:${ipKey(clientIp(req))}`, 10, 60_000);
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
    const supabase = createServiceClient(); // 0035: faqat service_role — IP limitini chetlab bo'lmaydi
    // 0040: boshlovchi IP/mamlakat saqlanadi — tasdiqlash sahifasi uni brauzer tarmog'i bilan
    // solishtiradi (device-code phishing'ga qarshi, cli-api-1). Migratsiya hali ishlamagan
    // bo'lsa (yangi imzo topilmadi) — eski chaqiruv.
    const ip = clientIp(req);
    let { data, error } = await supabase.rpc("cli_start", {
      p_device: device ?? null,
      p_ip: ip === "unknown" ? null : ip.slice(0, 64),
      p_country: countryOf(req.headers),
    });
    if (error && (error.code === "PGRST202" || /could not find the function/i.test(error.message))) {
      ({ data, error } = await supabase.rpc("cli_start", { p_device: device ?? null }));
    }
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
