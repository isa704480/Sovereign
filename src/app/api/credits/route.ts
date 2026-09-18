import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * GET /api/credits — foydalanuvchining oylik token holati.
 * Faqat `ratio` (0..1) qaytariladi — aniq son ko'rsatilmaydi (Claude uslubi).
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ ratio: 0 });

  const { data } = await supabase.rpc("my_token_status");
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return Response.json({ ratio: 0 });

  return Response.json({
    ratio: typeof row.ratio === "number" ? row.ratio : 0,
    // used va limit_month qaytmaydi — mahsulot qoidasi (aniq son yashiringan)
  });
}
