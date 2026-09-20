import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

/**
 * GET /api/admin/training — Tella 2 ni fine-tune qilish uchun JSONL eksport.
 * Har satr: {"messages":[{"role":"user",...},{"role":"assistant",...}]}
 * — finetune/train_qlora.py aynan shu formatni kutadi.
 *
 * Faqat admin. Oddiy foydalanuvchi bu ma'lumotni ko'ra olmaydi.
 */
export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Avval kiring" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
  if (!profile?.is_admin) return Response.json({ error: "Ruxsat yo'q" }, { status: 403 });

  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 2000), 10_000);
  const minLen = Math.max(Number(url.searchParams.get("min") ?? 120), 0);

  const { data, error } = await createServiceClient()
    .from("training_samples")
    .select("question, answer, model, rating, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return Response.json({ error: "O'qib bo'lmadi" }, { status: 500 });

  const rows = (data ?? [])
    .filter((r) => r.answer.length >= minLen && r.rating !== -1)
    .map((r) =>
      JSON.stringify({
        messages: [
          { role: "user", content: r.question },
          { role: "assistant", content: r.answer },
        ],
        meta: { model: r.model, created_at: r.created_at },
      }),
    );

  return new Response(rows.join("\n"), {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Content-Disposition": `attachment; filename="tella-train-${new Date().toISOString().slice(0, 10)}.jsonl"`,
      "Cache-Control": "no-store",
    },
  });
}
