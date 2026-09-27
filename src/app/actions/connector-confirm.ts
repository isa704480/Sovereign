"use server";

/**
 * Connector yozish amalini tasdiqlash / rad etish (src/lib/ai/connector-confirm.ts).
 *
 * Mijoz faqat shaffof `ref` yuboradi — argumentlar, tool nomi va MCP manzili serverdagi kutilayotgan
 * yozuvdan (Upstash yoki shifrlangan token) olinadi; mijoz yuborgan hech narsa amalga aralashmaydi.
 * Tekshiruvlar: sessiya (Supabase), rate-limit, yozuv shu foydalanuvchiniki, muddati o'tmagan va
 * bir martalik (take). Bajarish — tool siklidagi bilan bir xil kod yo'li (executeConfirmedAction).
 *
 * Qaytadigan `code` — mashina kodi (UI tarjima qiladi), foydalanuvchi matni emas.
 */
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { rateLimit } from "@/lib/rate-limit";
import { getPendingStore } from "@/lib/ai/connector-confirm";
import { executeConfirmedAction } from "@/lib/ai/connector-tools";
import { plainBlock, type ConfirmResult } from "@/lib/ai/connector-confirm-types";

const inputSchema = z.object({
  ref: z.string().min(8).max(65_536).regex(/^[A-Za-z0-9._-]+$/),
  decision: z.enum(["confirm", "reject"]),
});

const LIMIT = { limit: 30, windowMs: 10 * 60 * 1000 };

export async function resolveConnectorAction(ref: string, decision: "confirm" | "reject"): Promise<ConfirmResult> {
  const parsed = inputSchema.safeParse({ ref, decision });
  if (!parsed.success) return { status: "error", code: "invalid" };
  if (!isSupabaseConfigured()) return { status: "error", code: "auth" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", code: "auth" };

  const rl = await rateLimit(`connector:confirm:${user.id}`, LIMIT.limit, LIMIT.windowMs);
  if (!rl.ok) return { status: "error", code: "rate_limited" };

  let store;
  try {
    store = await getPendingStore();
  } catch {
    return { status: "error", code: "failed" };
  }
  // Bir martalik: rad etishda ham yozuv iste'mol qilinadi (keyin tasdiqlab bo'lmaydi).
  const taken = await store.take(parsed.data.ref, user.id).catch(() => ({ ok: false as const, reason: "invalid" as const }));
  if (!taken.ok) {
    if (parsed.data.decision === "reject") return { status: "rejected" };
    return taken.reason === "invalid" ? { status: "error", code: "invalid" } : { status: "expired" };
  }
  if (parsed.data.decision === "reject") return { status: "rejected" };

  try {
    const r = await executeConfirmedAction(supabase, user.id, taken.action);
    const output = r.output ? plainBlock(r.output, 1000).trim() : "";
    return {
      status: r.status,
      ...(r.link ? { link: r.link } : {}),
      ...(output ? { output } : {}),
      ...(r.code ? { code: r.code } : {}),
    };
  } catch {
    return { status: "error", code: "failed" };
  }
}
