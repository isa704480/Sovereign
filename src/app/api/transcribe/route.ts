import { transcribe } from "@/lib/ai/transcribe";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { effectivePlan, getProfile } from "@/lib/auth/profile";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX = 25 * 1024 * 1024;

/** POST /api/transcribe — multipart form with a "file" field. Pro+ only. */
export async function POST(req: Request) {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const profile = await getProfile(supabase, user.id);
      if (!effectivePlan(profile).limits.fullCode) {
        return Response.json({ error: "Transkripsiya Pro tarifda ochiladi.", upgrade: "pro" }, { status: 402 });
      }
    } else if (process.env.NODE_ENV !== "development") {
      return Response.json({ error: "Avval tizimga kiring" }, { status: 401 });
    }
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "Multipart body kutildi" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof Blob)) return Response.json({ error: "file yo'q" }, { status: 400 });
  if (file.size > MAX) return Response.json({ error: "Fayl juda katta (max 25 MB)" }, { status: 413 });

  try {
    const name = (form.get("name") as string) || "audio.webm";
    const language = (form.get("language") as string) || "uz";
    const text = await transcribe(file, name, language);
    return Response.json({ text });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Transkripsiya xato" }, { status: 502 });
  }
}
