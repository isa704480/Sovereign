"use server";

import { randomBytes } from "node:crypto";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { rateLimit } from "@/lib/rate-limit";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getServerT } from "@/lib/i18n-server";

/** Havola id: 16 belgi, taxmin qilib bo'lmaydigan. */
function shareId(): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(16);
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

const schema = z.object({
  title: z.string().max(200),
  modelId: z.string().max(80).optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(60_000),
        modelId: z.string().max(80).optional().nullable(),
        createdAt: z.string(),
      }),
    )
    .min(1)
    .max(200),
});

export type ShareResult = { ok: true; url: string; id: string } | { ok: false; error: string };

/**
 * Suhbatning "muzlatilgan" nusxasini yaratadi. Biriktirmalar, manbalar va
 * maxfiy maydonlar (verifier, route) nusxaga kirmaydi — faqat matn.
 */
export async function shareConversation(raw: unknown): Promise<ShareResult> {
  const t = await getServerT();
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: t("chBadConversation") };
  if (!isSupabaseConfigured()) return { ok: false, error: t("chSupabaseMissing") };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: t("chLoginFirst") };

  // Suiiste'molga qarshi: bir foydalanuvchi soatiga ko'pi bilan 30 ta havola.
  if (!(await rateLimit(`share:${user.id}`, 30, 60 * 60_000)).ok) return { ok: false, error: t("chTooManyRequests") };

  // Yozuv faqat server orqali (0035: to'g'ridan-to'g'ri REST insert policy olib tashlangan) —
  // id'ni server yaratadi ("SovereignSupport" kabi tanlangan id bo'lmaydi), shakl zod bilan
  // tekshirilgan. Servis kaliti bo'lmasa (lokal) — foydalanuvchi sessiyasi bilan.
  const id = shareId();
  const row = {
    id,
    user_id: user.id,
    title: parsed.data.title || t("chShareDefaultTitle"),
    model_id: parsed.data.modelId ?? null,
    // Faqat ruxsat etilgan maydonlar (zod ortiqchasini olib tashlagan).
    messages: parsed.data.messages.map((m) => ({ role: m.role, content: m.content, modelId: m.modelId ?? null, createdAt: m.createdAt })),
  };
  let writer: Pick<typeof supabase, "from"> = supabase;
  try {
    writer = createServiceClient();
  } catch {
    /* servis kaliti yo'q — foydalanuvchi sessiyasi */
  }
  const { error } = await writer.from("shared_conversations").insert(row);
  if (error) {
    console.error("[share] insert:", error.message);
    return { ok: false, error: t("chShareFailed") };
  }

  const origin = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://soveregn.xyz").replace(/\/$/, "");
  return { ok: true, id, url: `${origin}/share/${id}` };
}

export async function unshareConversation(id: string): Promise<{ ok: boolean }> {
  if (!/^[A-Za-z0-9]{16}$/.test(id) || !isSupabaseConfigured()) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase.from("shared_conversations").delete().eq("id", id);
  return { ok: !error };
}
