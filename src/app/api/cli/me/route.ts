import { z } from "zod";
import { createAnonClient } from "@/lib/supabase/anon";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

// Faqat ma'lum skil ID'lariga ruxsat — attacker o'zboshimchalik yozib qo'yolmasin
const KNOWN_SKILLS = ["ui-ux-pro-max", "apple-design", "clean-code", "cybersecurity", "pro-writing", "data-viz"];
const patchSchema = z.object({
  enabled_skills: z.array(z.string().min(1).max(64)).max(12).optional(),
  default_model: z.string().max(100).regex(/^[\w./:@-]+$/).optional(),
  memory_enabled: z.boolean().optional(),
}).strict();

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

  const rl = rateLimit(`cli-me-get:${token.slice(0, 24)}`, 30, 60_000);
  if (!rl.ok) return Response.json({ error: "Juda ko'p so'rov" }, { status: 429 });
  const ipRl = rateLimit(`cli-me:ip:${clientIp(req)}`, 60, 60_000);
  if (!ipRl.ok) return Response.json({ error: "Juda ko'p so'rov (IP)" }, { status: 429 });

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

  const rl = rateLimit(`cli-me-patch:${token.slice(0, 24)}`, 20, 60_000);
  if (!rl.ok) return Response.json({ error: "Juda ko'p so'rov" }, { status: 429 });

  const raw = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) return Response.json({ error: "Noto'g'ri so'rov" }, { status: 400 });

  const body = parsed.data;
  // Skil ID'larini oq ro'yxatga cheklash — attacker o'zboshimchalik yozmasin
  const skills = body.enabled_skills
    ? body.enabled_skills.filter((s) => KNOWN_SKILLS.includes(s))
    : null;

  try {
    const supabase = createAnonClient();
    const { data: ok, error } = await supabase.rpc("cli_update_settings", {
      p_token: token,
      p_enabled_skills: skills,
      p_default_model: body.default_model ?? null,
      p_memory_enabled: body.memory_enabled ?? null,
    });
    if (error) return Response.json({ error: "Serverda xato" }, { status: 500 });
    if (!ok) return Response.json({ error: "Yozib bo'lmadi" }, { status: 403 });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Server xatosi" }, { status: 500 });
  }
}
