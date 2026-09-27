import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sealConnectorConfig, unsealConnectorConfig } from "@/lib/connectors/secret";

/**
 * connector_accounts o'qish/yozish — maxfiy maydonlar (token/refresh) shu yerda
 * shifrlanadi va ochiladi. Ochiq token faqat server xotirasida yashaydi.
 */

export interface EnabledConnector {
  id: string;
  config: Record<string, unknown>;
}

type Db = Pick<SupabaseClient, "from">;

/**
 * Yoqilgan va ulangan connectorlar — token/refresh OCHILGAN holda (faqat serverda
 * ishlatiladi). Ochib bo'lmagan token (kalit almashgan/buzilgan) — ulanmagan deb
 * hisoblanadi va ro'yxatga kirmaydi.
 */
export async function loadEnabledConnectors(supabase: Db, userId: string): Promise<EnabledConnector[]> {
  const { data } = await supabase
    .from("connector_accounts")
    .select("connector_id, enabled, config")
    .eq("user_id", userId)
    .eq("enabled", true);
  return (data ?? [])
    .map((r) => {
      const id = r.connector_id as string;
      return { id, config: unsealConnectorConfig(userId, id, (r.config ?? {}) as Record<string, unknown>) };
    })
    .filter((c) => typeof c.config.token === "string" || typeof c.config.url === "string");
}

/**
 * Yangilangan (refresh) access tokenni saqlaydi — shifrlab. `config` — xotiradagi
 * OCHIQ config (loadEnabledConnectors natijasi); DB'ga faqat shifrlangani yoziladi.
 */
export async function saveRefreshedToken(
  supabase: Db,
  userId: string,
  connectorId: string,
  config: Record<string, unknown>,
  token: string,
): Promise<void> {
  let sealed: Record<string, unknown>;
  try {
    sealed = sealConnectorConfig(userId, connectorId, { ...config, token });
  } catch (e) {
    // Kalit yo'q (ConnectorKeyMissingError) — ochiq token yozilmaydi; yangi token faqat shu so'rovda ishlatiladi.
    console.error("[connectors] refresh saqlanmadi:", e instanceof Error ? e.message : "unknown");
    return;
  }
  const { error } = await supabase
    .from("connector_accounts")
    .update({ config: sealed })
    .eq("user_id", userId)
    .eq("connector_id", connectorId);
  if (error) console.error("[connectors] refresh saqlanmadi:", error.message);
}

/**
 * Google OAuth tokenini bekor qiladi (best-effort). Refresh token bekor qilinsa
 * Google shu ilova uchun berilgan ruxsatni to'liq olib tashlaydi.
 */
export async function revokeGoogleToken(token: string): Promise<boolean> {
  try {
    const r = await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
      signal: AbortSignal.timeout(5_000),
    });
    return r.ok;
  } catch {
    return false;
  }
}
