/**
 * CLI / Cowork qurilma sessiyalari (cli_sessions) — foydalanuvchi o'z tokenlarini bekor qiladi.
 * Faqat mavjud RPC'lar ishlatiladi (0012_cli_expiry.sql): cli_sessions_list() va cli_revoke(code),
 * ikkalasi ham SECURITY DEFINER va auth.uid() bilan cheklangan — yangi migratsiya shart emas.
 *
 * Parol tiklanganda va "Barcha ma'lumotlarni o'chirish"da chaqiriladi: aks holda o'g'irlangan /
 * fishing orqali tasdiqlangan 90 kunlik CLI tokeni parol almashgandan keyin ham ishlab turadi.
 */

/** Minimal RPC interfeysi (server Supabase klienti mos keladi; testda soxta klient). */
export interface CliRpcClient {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

export interface CliDevice {
  code: string;
  deviceName: string;
  createdAt: string | null;
  expiresAt: string | null;
  lastUsedAt: string | null;
}

export type CliRevokeResult = { ok: true; revoked: number } | { ok: false; error: string };

const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

/** Foydalanuvchining faol (tasdiqlangan, bekor qilinmagan) qurilmalari. */
export async function listCliDevices(
  supabase: CliRpcClient,
): Promise<{ ok: true; devices: CliDevice[] } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc("cli_sessions_list");
  if (error) return { ok: false, error: error.message };
  const rows = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
  const devices: CliDevice[] = [];
  for (const r of rows) {
    const code = str(r?.code);
    if (!code) continue;
    devices.push({
      code,
      deviceName: str(r.device_name) ?? "",
      createdAt: str(r.created_at),
      expiresAt: str(r.expires_at),
      lastUsedAt: str(r.last_used_at),
    });
  }
  return { ok: true, devices };
}

/** Bitta qurilmani bekor qiladi (faqat o'ziniki — RPC auth.uid() bilan tekshiradi). */
export async function revokeCliDevice(supabase: CliRpcClient, code: string): Promise<CliRevokeResult> {
  if (typeof code !== "string" || code.length < 16 || code.length > 128) return { ok: false, error: "invalid code" };
  const { data, error } = await supabase.rpc("cli_revoke", { p_code: code });
  if (error) return { ok: false, error: error.message };
  return { ok: true, revoked: data === true ? 1 : 0 };
}

/** Foydalanuvchining BARCHA CLI / Cowork tokenlarini bekor qiladi. */
export async function revokeAllCliSessions(supabase: CliRpcClient): Promise<CliRevokeResult> {
  const list = await listCliDevices(supabase);
  if (!list.ok) return list;
  const results = await Promise.all(list.devices.map((d) => supabase.rpc("cli_revoke", { p_code: d.code })));
  const failed = results.find((r) => r.error);
  if (failed?.error) return { ok: false, error: failed.error.message };
  return { ok: true, revoked: results.filter((r) => r.data === true).length };
}
