"use server";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getMemories } from "@/lib/ai/memory";
import { getServerT } from "@/lib/i18n-server";
import { listCliDevices, revokeAllCliSessions, revokeCliDevice, type CliDevice } from "@/lib/supabase/cli-sessions";

async function session() {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { supabase, user } : null;
}

/** GDPR export: all of the user's data as a JSON object. */
export async function exportMyData(): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  const s = await session();
  if (!s) return { ok: false, error: (await getServerT())("pnErrNoSession") };
  const [{ data: profile }, { data: conversations }, { data: messages }, memories, { data: orders }] = await Promise.all([
    s.supabase.from("profiles").select("*").eq("id", s.user.id).maybeSingle(),
    s.supabase.from("conversations").select("*").eq("user_id", s.user.id),
    s.supabase.from("messages").select("*").eq("user_id", s.user.id),
    getMemories(s.supabase, s.user.id, 1000),
    s.supabase.from("orders").select("id, plan, amount, status, created_at").eq("user_id", s.user.id),
  ]);
  return {
    ok: true,
    data: {
      exportedAt: new Date().toISOString(),
      user: { id: s.user.id, email: s.user.email },
      profile,
      conversations,
      messages,
      memories,
      orders,
    },
  };
}

/**
 * Deletes all of the user's content: conversations (messages cascade), memories, public share
 * links (frozen jsonb copies — no FK to conversations), knowledge-base documents (chunks cascade)
 * and connector accounts (provider OAuth tokens); also revokes every CLI / Cowork device token.
 * inquiry_events is anonymized by design (no user_id) and is not touched.
 */
export async function deleteMyData(): Promise<{ ok: boolean }> {
  const s = await session();
  if (!s) return { ok: false };
  const uid = s.user.id;
  const results = await Promise.all([
    s.supabase.from("conversations").delete().eq("user_id", uid),
    s.supabase.from("memory_nodes").delete().eq("user_id", uid),
    // Ommaviy /share havolalari suhbatlar o'chgandan keyin ham o'qilib qolmasin.
    s.supabase.from("shared_conversations").delete().eq("user_id", uid),
    s.supabase.from("kb_documents").delete().eq("user_id", uid),
    s.supabase.from("connector_accounts").delete().eq("user_id", uid),
  ]);
  // Biror jadval o'chmasa — "o'chirildi" deb aldamaymiz (mijoz xato ko'rsatadi).
  const failed = results.find((r) => r.error);
  if (failed?.error) {
    console.error("[account] deleteMyData:", failed.error.message);
    return { ok: false };
  }
  // CLI / Cowork tokenlari xotirani o'qiy oladi — ular ham bekor qilinadi.
  const cli = await revokeAllCliSessions(s.supabase);
  if (!cli.ok) {
    console.error("[account] deleteMyData cli revoke:", cli.error);
    return { ok: false };
  }
  return { ok: true };
}

/** Ulangan CLI / Cowork qurilmalari (sozlamalardagi "Ulangan qurilmalar" bo'limi uchun). */
export async function getCliDevices(): Promise<{ ok: true; devices: CliDevice[] } | { ok: false }> {
  const s = await session();
  if (!s) return { ok: false };
  const res = await listCliDevices(s.supabase);
  if (!res.ok) {
    console.error("[account] getCliDevices:", res.error);
    return { ok: false };
  }
  return res;
}

/** Bitta qurilmaning tokenini bekor qiladi (faqat o'ziniki — RPC auth.uid() bilan cheklaydi). */
export async function revokeCliDeviceAction(code: string): Promise<{ ok: boolean }> {
  const s = await session();
  if (!s) return { ok: false };
  const res = await revokeCliDevice(s.supabase, code);
  if (!res.ok) console.error("[account] revokeCliDevice:", res.error);
  return { ok: res.ok && res.revoked > 0 };
}

/** Barcha CLI / Cowork qurilmalaridan chiqish. */
export async function revokeAllCliDevicesAction(): Promise<{ ok: boolean; revoked: number }> {
  const s = await session();
  if (!s) return { ok: false, revoked: 0 };
  const res = await revokeAllCliSessions(s.supabase);
  if (!res.ok) {
    console.error("[account] revokeAllCliDevices:", res.error);
    return { ok: false, revoked: 0 };
  }
  return { ok: true, revoked: res.revoked };
}

/**
 * "Javoblarim Tella 2 ni o'rgatishda ishlatilsin" sozlamasi.
 * O'chirilsa, bu foydalanuvchining savol-javoblari trening bazasiga tushmaydi.
 */
export async function setTrainingOptIn(enabled: boolean): Promise<{ ok: boolean }> {
  const s = await session();
  if (!s) return { ok: false };
  const { error } = await s.supabase.from("profiles").update({ training_opt_in: enabled }).eq("id", s.user.id);
  return { ok: !error };
}

/** Joriy holat — sozlamalar panelini to'ldirish uchun. */
export async function getTrainingOptIn(): Promise<boolean> {
  const s = await session();
  if (!s) return false;
  const { data } = await s.supabase.from("profiles").select("training_opt_in").eq("id", s.user.id).maybeSingle();
  return (data as { training_opt_in?: boolean } | null)?.training_opt_in !== false;
}
