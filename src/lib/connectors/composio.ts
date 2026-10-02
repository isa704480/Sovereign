/**
 * Composio connector adapter.
 *
 * Composio (app.composio.dev) — 600+ tashqi servisga tayyor tool'lar.
 *
 * Qanday ishlaydi:
 *   1. Foydalanuvchi ConnectorsPanel'da Composio API key'ini kiritadi
 *      → connector_accounts jadvalida "composio" yozuvi yaratiladi (token = API key)
 *   2. listComposioTools(apiKey, entityId) — foydalanuvchining ulangan app'lari
 *   3. executeComposioTool(name, args, apiKey, entityId) — tool bajarish
 *
 * API key 2 manbadan olinadi (ustuvorlik tartibi):
 *   1. connector_accounts.config.token (foydalanuvchi o'zi kiritgan) ← asosiy
 *   2. COMPOSIO_API_KEY env (umumiy platform kaliti) ← zaxira
 *
 * Xavfsizlik:
 *   - API key foydalanuvchiga qaytarilmaydi (server-only, AES-256-GCM shifrlangan)
 *   - Tool nomlari COMPOSIO__ prefiksi bilan ajratiladi
 *   - entityId = user.id — har foydalanuvchi faqat o'z app'larini ko'radi
 *   - Tool description "external" belgisi — prompt-injection oldini olish
 */

import "server-only";

export const COMPOSIO_TOOL_PREFIX = "composio__";
const COMPOSIO_BASE = "https://backend.composio.dev/api/v1";
/** Juda ko'p tool model kontekstini to'ldirmasin. */
const MAX_TOOLS = 30;

// ── API key yechimi ────────────────────────────────────────────────────────

/**
 * Composio API key'ini oladi.
 * 1. Foydalanuvchining o'z kaliti (connector token)
 * 2. Platform umumiy kaliti (env)
 * 3. Hech biri bo'lmasa — null
 */
export function resolveComposioKey(connectorToken?: string | null): string | null {
  if (connectorToken?.trim()) return connectorToken.trim();
  return process.env.COMPOSIO_API_KEY?.trim() ?? null;
}

/** Composio yoqilganmi (env kaliti yoki connector token mavjud). */
export function composioEnabled(connectorToken?: string | null): boolean {
  return Boolean(resolveComposioKey(connectorToken));
}

// ── Tool ro'yxati ──────────────────────────────────────────────────────────

export interface ComposioTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/**
 * Foydalanuvchi uchun ulangan Composio app'lari tool ro'yxati.
 *
 * @param apiKey   Composio API kaliti (foydalanuvchi yoki platform)
 * @param entityId Sovereign user ID (Composio da har foydalanuvchi alohida entity)
 */
export async function listComposioTools(
  apiKey: string,
  entityId: string,
): Promise<ComposioTool[]> {
  try {
    // 1. Foydalanuvchining ulangan app'larini ol
    const connRes = await fetch(
      `${COMPOSIO_BASE}/connectedAccounts?entityId=${encodeURIComponent(entityId)}&status=ACTIVE&limit=20`,
      {
        headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(8_000),
      },
    );
    if (!connRes.ok) {
      console.warn("[composio] connectedAccounts:", connRes.status);
      return [];
    }
    const connData = (await connRes.json()) as {
      items?: { appName?: string }[];
    };
    const apps = [
      ...new Set((connData.items ?? []).map((i) => i.appName).filter(Boolean)),
    ] as string[];
    if (!apps.length) return [];

    // 2. Har app uchun tool'larni ol
    const appList = apps.slice(0, 10).join(",");
    const toolRes = await fetch(
      `${COMPOSIO_BASE}/actions?appNames=${encodeURIComponent(appList)}&limit=${MAX_TOOLS}`,
      {
        headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(8_000),
      },
    );
    if (!toolRes.ok) {
      console.warn("[composio] actions:", toolRes.status);
      return [];
    }
    const toolData = (await toolRes.json()) as {
      items?: { name?: string; description?: string; parameters?: Record<string, unknown> }[];
    };

    return (toolData.items ?? [])
      .slice(0, MAX_TOOLS)
      .filter((t) => t.name && t.description)
      .map((t) => ({
        type: "function" as const,
        function: {
          // Prefiks — execTool da tanib olish uchun
          name: COMPOSIO_TOOL_PREFIX + (t.name ?? "").replace(/[^a-zA-Z0-9_]/g, "_"),
          // "external" belgisi — prompt-injection oldini oladi
          description: `[Composio: ${t.name}] ${(t.description ?? "").slice(0, 200)}`,
          parameters: (t.parameters as Record<string, unknown>) ?? {
            type: "object",
            properties: {},
          },
        },
      }));
  } catch (e) {
    console.error("[composio] listTools:", e instanceof Error ? e.message : "error");
    return [];
  }
}

// ── Tool bajarish ──────────────────────────────────────────────────────────

/**
 * Composio tool'ini bajaradi.
 *
 * @param toolName  COMPOSIO__ prefiksi bilan (execTool dan keladi)
 * @param args      Tool argumentlari
 * @param apiKey    Composio API kaliti
 * @param entityId  Foydalanuvchi ID
 */
export async function executeComposioTool(
  toolName: string,
  args: Record<string, unknown>,
  apiKey: string,
  entityId: string,
): Promise<{ ok: boolean; text: string }> {
  // Prefixni olib tashlab original nomni tiklash
  const actionName = toolName.slice(COMPOSIO_TOOL_PREFIX.length);

  try {
    const res = await fetch(`${COMPOSIO_BASE}/actions/execute/function`, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ actionName, input: args, entityId }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn("[composio] execute:", res.status, body.slice(0, 200));
      return { ok: false, text: `Composio xatosi: ${res.status}` };
    }

    const data = (await res.json()) as {
      successfull?: boolean;
      data?: unknown;
      error?: string;
    };

    if (!data.successfull) {
      return { ok: false, text: `Composio: ${data.error ?? "bajarilmadi"}` };
    }

    const result =
      typeof data.data === "string"
        ? data.data
        : JSON.stringify(data.data, null, 2);

    return { ok: true, text: result.slice(0, 5000) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "network error";
    console.error("[composio] execute:", msg);
    return { ok: false, text: `Composio chiqishida xato: ${msg}` };
  }
}
