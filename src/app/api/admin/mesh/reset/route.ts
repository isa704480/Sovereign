import { createClient } from "@/lib/supabase/server";
import { getServerT } from "@/lib/i18n-server";
import { resetHealth } from "@/lib/ai/mesh/health";
import { PROVIDER_IDS, type ProviderId } from "@/lib/ai/mesh/types";

export const runtime = "nodejs";

/**
 * POST /api/admin/mesh/reset — Provider Mesh sog'lig'ini tiklash (masalan kalit almashtirilgandan
 * keyin auth blokini darhol olib tashlash). Tana: `{ "provider": "groq" }` yoki `{}` (hammasi).
 * Faqat admin (profiles.is_admin). Javobda kalit/sir yo'q — faqat tiklangan kalitlar soni.
 */
export async function POST(req: Request) {
  const t = await getServerT();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: t("pnErrLoginFirst") }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
  if (!profile?.is_admin) return Response.json({ error: t("p7cNoAccess") }, { status: 403 });

  let provider: ProviderId | undefined;
  try {
    const body = (await req.json().catch(() => ({}))) as { provider?: unknown };
    if (body?.provider !== undefined && body.provider !== null && body.provider !== "") {
      if (typeof body.provider !== "string" || !(PROVIDER_IDS as readonly string[]).includes(body.provider)) {
        return Response.json({ error: t("chBadRequest") }, { status: 400 });
      }
      provider = body.provider as ProviderId;
    }
  } catch {
    return Response.json({ error: t("chBadRequest") }, { status: 400 });
  }

  const reset = await resetHealth(provider);
  return Response.json({ ok: true, provider: provider ?? "all", reset }, { headers: { "Cache-Control": "no-store" } });
}
