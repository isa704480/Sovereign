import { transcribe } from "@/lib/ai/transcribe";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { effectivePlan, getProfile } from "@/lib/auth/profile";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { getServerLang, getServerT } from "@/lib/i18n-server";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX = 25 * 1024 * 1024;

/** POST /api/transcribe — multipart form with a "file" field. Pro+ only. */
export async function POST(req: Request) {
  // Cost-DoS: Whisper qimmat, IP bo'yicha kuchli chegara
  const t = await getServerT();
  const ipRl = await rateLimit(`trs:ip:${clientIp(req)}`, 5, 60_000);
  if (!ipRl.ok) return Response.json({ error: t("chTooManyTranscribe") }, { status: 429 });

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const profile = await getProfile(supabase, user.id);
      if (!effectivePlan(profile).limits.fullCode) {
        return Response.json({ error: t("chTranscribePro"), upgrade: "pro" }, { status: 402 });
      }
    } else if (process.env.NODE_ENV !== "development") {
      return Response.json({ error: t("chLoginFirst") }, { status: 401 });
    }
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: t("chMultipartExpected") }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof Blob)) return Response.json({ error: t("chNoFile") }, { status: 400 });
  if (file.size > MAX) return Response.json({ error: t("chFileTooBig25") }, { status: 413 });

  try {
    const name = (form.get("name") as string) || "audio.webm";
    // Whisper uchun til ishorasi: aniq berilmasa — interfeys tili (uz-cyrl ham "uz").
    const language = (form.get("language") as string) || (await getServerLang()).slice(0, 2);
    const text = await transcribe(file, name, language);
    return Response.json({ text });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : t("chTranscribeFailed") }, { status: 502 });
  }
}
