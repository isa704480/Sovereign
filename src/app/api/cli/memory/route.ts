import { z } from "zod";
import { createAnonClient } from "@/lib/supabase/anon";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : null;
}

/**
 * CLI ↔ Web umumiy xotira (Bosqich 4).
 * GET    — foydalanuvchining barcha xotirasi (web bilan bir xil memory_nodes).
 * POST   — yangi fakt qo'shadi ({ content }).
 * DELETE — ?id=<uuid> bitta, yoki ?all=1 hammasini o'chiradi.
 */
export async function GET(req: Request) {
  const token = bearer(req);
  if (!token) return Response.json({ error: "Token yo'q" }, { status: 401 });
  const rl = await rateLimit(`cli-mem:${token.slice(0, 24)}`, 40, 60_000);
  if (!rl.ok) return Response.json({ error: "Juda ko'p so'rov" }, { status: 429 });

  try {
    const supabase = createAnonClient();
    const { data, error } = await supabase.rpc("cli_memory_list", { p_token: token });
    if (error) return Response.json({ error: "Server xatosi" }, { status: 500 });
    const memories = (Array.isArray(data) ? data : []).map((m: { id: string; content: string; created_at: string }) => ({
      id: m.id,
      content: m.content,
      created_at: m.created_at,
    }));
    return Response.json({ memories });
  } catch {
    return Response.json({ error: "Server xatosi" }, { status: 500 });
  }
}

const addSchema = z.object({ content: z.string().min(1).max(500) }).strict();

export async function POST(req: Request) {
  const token = bearer(req);
  if (!token) return Response.json({ error: "Token yo'q" }, { status: 401 });
  const rl = await rateLimit(`cli-mem-w:${token.slice(0, 24)}`, 30, 60_000);
  if (!rl.ok) return Response.json({ error: "Juda ko'p so'rov" }, { status: 429 });
  const ipRl = await rateLimit(`cli-mem:ip:${clientIp(req)}`, 60, 60_000);
  if (!ipRl.ok) return Response.json({ error: "Juda ko'p so'rov (IP)" }, { status: 429 });

  const parsed = addSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Noto'g'ri so'rov" }, { status: 400 });

  try {
    const supabase = createAnonClient();
    const { data: id, error } = await supabase.rpc("cli_memory_add", { p_token: token, p_content: parsed.data.content });
    if (error || !id) return Response.json({ error: "Token yaroqsiz yoki yozib bo'lmadi" }, { status: 403 });
    return Response.json({ ok: true, id });
  } catch {
    return Response.json({ error: "Server xatosi" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const token = bearer(req);
  if (!token) return Response.json({ error: "Token yo'q" }, { status: 401 });
  const rl = await rateLimit(`cli-mem-d:${token.slice(0, 24)}`, 30, 60_000);
  if (!rl.ok) return Response.json({ error: "Juda ko'p so'rov" }, { status: 429 });

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const all = url.searchParams.get("all");

  try {
    const supabase = createAnonClient();
    if (all) {
      const { data, error } = await supabase.rpc("cli_memory_clear", { p_token: token });
      if (error) return Response.json({ error: "Server xatosi" }, { status: 500 });
      return Response.json({ ok: true, cleared: data ?? 0 });
    }
    if (!id) return Response.json({ error: "id yoki all kerak" }, { status: 400 });
    const { data: ok, error } = await supabase.rpc("cli_memory_delete", { p_token: token, p_id: id });
    if (error) return Response.json({ error: "Server xatosi" }, { status: 500 });
    return Response.json({ ok: !!ok });
  } catch {
    return Response.json({ error: "Server xatosi" }, { status: 500 });
  }
}
