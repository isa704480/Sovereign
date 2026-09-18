import { createAnonClient } from "@/lib/supabase/anon";

export const runtime = "nodejs";

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : null;
}

/**
 * GET  /api/cli/me — kirgan foydalanuvchining barcha sozlamalarini qaytaradi
 *                     (plan, muddat, skillar, model, xotira).
 * PATCH /api/cli/me — CLI'dagi o'zgarishlar profilga yozadi (skillar toggle, ...).
 * Bu ikkalasi CLI va Web bir xil holatda qolishini ta'minlaydi.
 */
export async function GET(req: Request) {
  const token = bearer(req);
  if (!token) return Response.json({ error: "Token yo'q" }, { status: 401 });

  try {
    const supabase = createAnonClient();
    const { data, error } = await supabase.rpc("cli_whoami", { p_token: token });
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row?.user_id) {
      return Response.json({ error: "Token yaroqsiz" }, { status: 401 });
    }
    // Plan holati alohida so'roqda — expired/expiring_soon/active
    const { data: statusData } = await supabase.rpc("plan_status", { p_user_id: row.user_id });
    const status = Array.isArray(statusData) ? statusData[0] : statusData;
    return Response.json({
      user_id: row.user_id,
      email: row.email,
      plan: row.plan,
      plan_expires_at: row.plan_expires_at,
      plan_state: status?.state ?? "free",
      days_left: status?.days_left ?? null,
      default_model: row.default_model,
      enabled_skills: row.enabled_skills ?? [],
      memory_enabled: row.memory_enabled,
    });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Server xatosi" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const token = bearer(req);
  if (!token) return Response.json({ error: "Token yo'q" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    enabled_skills?: string[];
    default_model?: string;
    memory_enabled?: boolean;
  } | null;
  if (!body) return Response.json({ error: "Noto'g'ri so'rov" }, { status: 400 });

  try {
    const supabase = createAnonClient();
    const { data: ok, error } = await supabase.rpc("cli_update_settings", {
      p_token: token,
      p_enabled_skills: body.enabled_skills ?? null,
      p_default_model: body.default_model ?? null,
      p_memory_enabled: body.memory_enabled ?? null,
    });
    if (error) return Response.json({ error: error.message }, { status: 500 });
    if (!ok) return Response.json({ error: "Yozib bo'lmadi" }, { status: 403 });
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Server xatosi" }, { status: 500 });
  }
}
