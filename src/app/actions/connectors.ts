"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { CONNECTOR_BY_ID } from "@/config/connectors";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { assertPublicUrl } from "@/lib/ai/web-read";
import { getServerT } from "@/lib/i18n-server";

async function session() {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { supabase, user } : null;
}

/** Klientга qaytadigan holat — maxfiy token EMAS. */
export interface ConnectorState {
  connectorId: string;
  enabled: boolean;
  connected: boolean;
  meta?: string | null;
}

/** Foydalanuvchining barcha connector holatlari (token qaytarilmaydi). */
export async function listConnectors(): Promise<ConnectorState[]> {
  const s = await session();
  if (!s) return [];
  const { data } = await s.supabase
    .from("connector_accounts")
    .select("connector_id, enabled, config")
    .eq("user_id", s.user.id);
  return (data ?? []).map((r) => {
    const cfg = (r.config ?? {}) as Record<string, unknown>;
    return {
      connectorId: r.connector_id as string,
      enabled: !!r.enabled,
      connected: !!(cfg.token || cfg.url || cfg.oauth || cfg.builtin),
      meta: (cfg.meta as string | undefined) ?? null,
    };
  });
}

type Result = { ok: true; meta?: string | null } | { ok: false; error: string };

async function upsert(userId: string, connectorId: string, patch: { enabled?: boolean; config?: Record<string, unknown> }, supabase: Awaited<ReturnType<typeof createClient>>): Promise<boolean> {
  const { data: existing } = await supabase
    .from("connector_accounts")
    .select("id, config")
    .eq("user_id", userId)
    .eq("connector_id", connectorId)
    .maybeSingle();
  const config = { ...((existing?.config as Record<string, unknown>) ?? {}), ...(patch.config ?? {}) };
  const row = { user_id: userId, connector_id: connectorId, enabled: patch.enabled ?? true, config };
  // config.url (MCP) ni foydalanuvchi REST orqali yozolmaydi (0028 trigger) —
  // URL tekshiruvdan o'tgach, faqat server (service role) yozadi. user_id sessiyadan.
  let db: SupabaseLike = supabase;
  if (typeof config.url === "string") {
    try {
      db = createServiceClient();
    } catch (e) {
      console.error("[connectors] service client:", e);
      return false;
    }
  }
  const { error } = await db.from("connector_accounts").upsert(row, { onConflict: "user_id,connector_id" });
  if (error) {
    console.error("[connectors] upsert:", error.message);
    return false;
  }
  return true;
}

type SupabaseLike = Pick<Awaited<ReturnType<typeof createClient>>, "from">;

/** Figma/GitHub tokenini tekshiradi (haqiqiy API chaqiruvi). */
async function verifyToken(connectorId: string, token: string): Promise<Result> {
  const t = await getServerT();
  try {
    if (connectorId === "figma") {
      const r = await fetch("https://api.figma.com/v1/me", { headers: { "X-Figma-Token": token } });
      if (!r.ok) return { ok: false, error: t("pnErrFigmaToken") };
      const j = (await r.json()) as { email?: string; handle?: string };
      return { ok: true, meta: j.email ?? j.handle ?? "Figma" };
    }
    if (connectorId === "github") {
      const r = await fetch("https://api.github.com/user", {
        headers: { Authorization: `Bearer ${token}`, "User-Agent": "SOVEREIGN", Accept: "application/vnd.github+json" },
      });
      if (!r.ok) return { ok: false, error: t("pnErrGithubToken") };
      const j = (await r.json()) as { login?: string };
      return { ok: true, meta: j.login ? `@${j.login}` : "GitHub" };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: t("pnErrVerifyNetwork") };
  }
}

const tokenSchema = z.object({ connectorId: z.string().min(1).max(60), token: z.string().min(4).max(4000) });

/** Token bilan ulash (Figma/GitHub/MCP). Muvaffaqiyatli bo'lsa yoqib qo'yiladi. */
export async function connectToken(input: unknown): Promise<Result> {
  const t = await getServerT();
  const parsed = tokenSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t("pnErrBadToken") };
  const { connectorId } = parsed.data;
  let { token } = parsed.data;
  const spec = CONNECTOR_BY_ID[connectorId];
  if (!spec) return { ok: false, error: t("pnErrNoConnector") };
  const s = await session();
  if (!s) return { ok: false, error: t("pnErrLoginFirst") };

  let meta: string | null = null;
  if (spec.auth === "token") {
    const v = await verifyToken(connectorId, token);
    if (!v.ok) return v;
    meta = v.meta ?? null;
  } else if (spec.auth === "mcp") {
    // MCP: "token" — bu server URL. SSRF: faqat https/443, ommaviy IP (DNS ham
    // tekshiriladi). Har bir so'rovda connector-tools yana tekshiradi.
    const raw = token.trim();
    try {
      await assertPublicUrl(raw, { httpsOnly: true });
    } catch {
      return { ok: false, error: t("pnErrMcpUrl") };
    }
    token = raw;
    meta = raw.replace(/^https:\/\//i, "").slice(0, 40);
  } else {
    return { ok: false, error: t("pnErrNoTokenAuth") };
  }

  const saved = await upsert(
    s.user.id,
    connectorId,
    { enabled: true, config: spec.auth === "mcp" ? { url: token, meta } : { token, meta } },
    s.supabase,
  );
  if (!saved) return { ok: false, error: t("chUnknownError") };
  return { ok: true, meta };
}

const toggleSchema = z.object({ connectorId: z.string().min(1).max(60), enabled: z.boolean() });

/** Vaqtincha o'chirish/yoqish (token saqlanadi). Builtin uchun ham ishlaydi. */
export async function setConnectorEnabled(input: unknown): Promise<Result> {
  const t = await getServerT();
  const parsed = toggleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t("pnErrBadRequest") };
  const { connectorId, enabled } = parsed.data;
  const spec = CONNECTOR_BY_ID[connectorId];
  if (!spec) return { ok: false, error: t("pnErrNoConnector") };
  const s = await session();
  if (!s) return { ok: false, error: t("pnErrLoginFirst") };
  // Builtin (CLI/brauzer) — kalitsiz, faqat yoqish belgisi.
  const config = spec.auth === "builtin" ? { builtin: true } : {};
  const saved = await upsert(s.user.id, connectorId, { enabled, config }, s.supabase);
  if (!saved) return { ok: false, error: t("chUnknownError") };
  return { ok: true };
}

/** Ulanishni butunlay uzish (token o'chadi). */
export async function disconnectConnector(connectorId: string): Promise<Result> {
  const t = await getServerT();
  const s = await session();
  if (!s) return { ok: false, error: t("pnErrLoginFirst") };
  const { error } = await s.supabase
    .from("connector_accounts")
    .delete()
    .eq("user_id", s.user.id)
    .eq("connector_id", connectorId);
  if (error) {
    console.error("[connectors] delete:", error.message);
    return { ok: false, error: t("chUnknownError") };
  }
  return { ok: true };
}

/**
 * Google connectorni ulash — qo'shimcha scope bilan OAuth boshlaydi. Callback
 * provider_token'ni connector_accounts'ga saqlaydi. Google Cloud'da consent va
 * scope sozlangan bo'lishi shart (sensitive scope'lar Google tekshiruvini talab qiladi).
 */
export async function connectGoogle(connectorId: string): Promise<{ ok: false; error: string } | never> {
  const t = await getServerT();
  const spec = CONNECTOR_BY_ID[connectorId];
  if (!spec || spec.auth !== "oauth-google") return { ok: false, error: t("pnErrNotGoogle") };
  const s = await session();
  if (!s) return { ok: false, error: t("pnErrLoginFirst") };
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const scopes = ["openid", "email", "profile", ...(spec.scopes ?? [])].join(" ");
  const { data, error } = await s.supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${site}/auth/callback?connect=${encodeURIComponent(connectorId)}&next=/app`,
      scopes,
      queryParams: { access_type: "offline", prompt: "consent" },
    },
  });
  if (error) {
    console.error("[connectors] google oauth:", error.message);
    return { ok: false, error: t("pnErrNoOauthUrl") };
  }
  if (data.url) redirect(data.url);
  return { ok: false, error: t("pnErrNoOauthUrl") };
}
