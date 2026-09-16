import { z } from "zod";
import { createAnonClient } from "@/lib/supabase/anon";

export const runtime = "nodejs";

const schema = z.object({ device: z.string().max(80).optional() });

/** POST /api/cli/start — creates a device-login code, returns the approve URL. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  const device = parsed.success ? parsed.data.device : undefined;

  let code: string;
  try {
    const supabase = createAnonClient();
    const { data, error } = await supabase.rpc("cli_start", { p_device: device ?? null });
    if (error || typeof data !== "string") {
      return Response.json({ error: error?.message ?? "Kod yaratilmadi" }, { status: 500 });
    }
    code = data;
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Server xatosi" }, { status: 500 });
  }

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;
  return Response.json({ code, url: `${origin.replace(/\/$/, "")}/cli/connect?code=${code}` });
}
