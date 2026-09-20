"use server";

import { z } from "zod";
import { CONNECTOR_BY_ID } from "@/config/connectors";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

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

async function upsert(userId: string, connectorId: string, patch: { enabled?: boolean; config?: Record<string, unknown> }, supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: existing } = await supabase
    .from("connector_accounts")
    .select("id, config")
    .eq("user_id", userId)
    .eq("connector_id", connectorId)
    .maybeSingle();
  const config = { ...((existing?.config as Record<string, unknown>) ?? {}), ...(patch.config ?? {}) };
  const row = { user_id: userId, connector_id: connectorId, enabled: patch.enabled ?? true, config };
  const { error } = await supabase.from("connector_accounts").upsert(row, { onConflict: "user_id,connector_id" });
  return error ? error.message : null;
}

/** Figma/GitHub tokenini tekshiradi (haqiqiy API chaqiruvi). */
async function verifyToken(connectorId: string, token: string): Promise<Result> {
  try {
    if (connectorId === "figma") {
      const r = await fetch("https://api.figma.com/v1/me", { headers: { "X-Figma-Token": token } });
      if (!r.ok) return { ok: false, error: "Figma token noto'g'ri yoki muddati o'tgan." };
      const j = (await r.json()) as { email?: string; handle?: string };
      return { ok: true, meta: j.email ?? j.handle ?? "Figma" };
    }
    if (connectorId === "github") {
      const r = await fetch("https://api.github.com/user", {
        headers: { Authorization: `Bearer ${token}`, "User-Agent": "SOVEREIGN", Accept: "application/vnd.github+json" },
      });
      if (!r.ok) return { ok: false, error: "GitHub token noto'g'ri yoki ruxsat yetarli emas." };
      const j = (await r.json()) as { login?: string };
      return { ok: true, meta: j.login ? `@${j.login}` : "GitHub" };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Tekshirishda tarmoq xatosi." };
  }
}

const tokenSchema = z.object({ connectorId: z.string().min(1).max(60), token: z.string().min(4).max(4000) });

/** Token bilan ulash (Figma/GitHub/MCP). Muvaffaqiyatli bo'lsa yoqib qo'yiladi. */
export async function connectToken(input: unknown): Promise<Result> {
  const parsed = tokenSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Token noto'g'ri." };
  const { connectorId, token } = parsed.data;
  const spec = CONNECTOR_BY_ID[connectorId];
  if (!spec) return { ok: false, error: "Bunday connector yo'q." };
  const s = await session();
  if (!s) return { ok: false, error: "Avval tizimga kiring." };

  let meta: string | null = null;
  if (spec.auth === "token") {
    const v = await verifyToken(connectorId, token);
    if (!v.ok) return v;
    meta = v.meta ?? null;
  } else if (spec.auth === "mcp") {
    // MCP: "token" — bu server URL. SSRF xavfi uchun tarmoqqa chiqmaymiz, faqat format.
    if (!/^https?:\/\/[^\s]+$/i.test(token)) return { ok: false, error: "MCP server URL noto'g'ri (https://...)." };
    meta = token.replace(/^https?:\/\//, "").slice(0, 40);
  } else {
    return { ok: false, error: "Bu connector token bilan ulanmaydi." };
  }

  const err = await upsert(
    s.user.id,
    connectorId,
    { enabled: true, config: spec.auth === "mcp" ? { url: token, meta } : { token, meta } },
    s.supabase,
  );
  if (err) return { ok: false, error: err };
  return { ok: true, meta };
}

const toggleSchema = z.object({ connectorId: z.string().min(1).max(60), enabled: z.boolean() });

/** Vaqtincha o'chirish/yoqish (token saqlanadi). Builtin uchun ham ishlaydi. */
export async function setConnectorEnabled(input: unknown): Promise<Result> {
  const parsed = toggleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Noto'g'ri so'rov." };
  const { connectorId, enabled } = parsed.data;
  const spec = CONNECTOR_BY_ID[connectorId];
  if (!spec) return { ok: false, error: "Bunday connector yo'q." };
  const s = await session();
  if (!s) return { ok: false, error: "Avval tizimga kiring." };
  // Builtin (CLI/brauzer) — kalitsiz, faqat yoqish belgisi.
  const config = spec.auth === "builtin" ? { builtin: true } : {};
  const err = await upsert(s.user.id, connectorId, { enabled, config }, s.supabase);
  if (err) return { ok: false, error: err };
  return { ok: true };
}

/** Ulanishni butunlay uzish (token o'chadi). */
export async function disconnectConnector(connectorId: string): Promise<Result> {
  const s = await session();
  if (!s) return { ok: false, error: "Avval tizimga kiring." };
  const { error } = await s.supabase
    .from("connector_accounts")
    .delete()
    .eq("user_id", s.user.id)
    .eq("connector_id", connectorId);
  return error ? { ok: false, error: error.message } : { ok: true };
}
