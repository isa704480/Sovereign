import { createAnonClient } from "@/lib/supabase/anon";

export const runtime = "nodejs";

/** GET /api/cli/poll?code=... — returns the token once the browser approved. */
export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get("code");
  if (!code) return Response.json({ error: "code kerak" }, { status: 400 });

  try {
    const supabase = createAnonClient();
    const { data, error } = await supabase.rpc("cli_poll", { p_code: code });
    if (error) return Response.json({ error: error.message }, { status: 500 });
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return Response.json({ status: "expired" });
    if (!row.approved) return Response.json({ status: "pending" });
    return Response.json({ status: "approved", token: row.token });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Server xatosi" }, { status: 500 });
  }
}
