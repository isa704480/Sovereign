/**
 * Composio connector adapter.
 *
 * Composio (factory.composio.dev) — 600+ tashqi servisga tayyor tool'lar.
 * Ushbu adapter Composio OpenAI-compatible tool calling endpointini ishlatadi:
 *   POST https://backend.composio.dev/api/v1/actions/execute/function
 *
 * Qanday ishlaydi:
 *   1. connectorIsEnabled("composio") — COMPOSIO_API_KEY bor + foydalanuvchi composio
 *      connector'ini yoqgan (connector_accounts jadvalida enabled=true).
 *   2. listComposioTools() — foydalanuvchining ulangan Composio app'lari uchun
 *      tool ro'yxati (OpenAI format).
 *   3. executeComposioTool() — tool chaqiruvi.
 *
 * Xavfsizlik:
 *   - API key faqat serverda (process.env.COMPOSIO_API_KEY)
 *   - Tool nomlari COMPOSIO_ prefiksi bilan ajratiladi (boshqa connector'lar bilan aralashmasligi uchun)
 *   - Foydalanuvchi entityId — user.id (har foydalanuvchi faqat o'z ulangan app'larini ko'radi)
 *   - Prompt-injection: tool description "external" deb belgilanadi (connector-tools kabi)
 *
 * Env:
 *   COMPOSIO_API_KEY  — Composio API kaliti
 */

import "server-only";

export const COMPOSIO_TOOL_PREFIX = "composio__";
const COMPOSIO_BASE = "https://backend.composio.dev/api/v1";
const MAX_TOOLS = 30; // Juda ko'p tool model kontekstini to'ldirmasin

export interface ComposioTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export function composioEnabled(): boolean {
  return Boolean(process.env.COMPOSIO_API_KEY?.trim());
}

function apiKey(): string {
  return process.env.COMPOSIO_API_KEY!.trim();
}

/**
 * Foydalanuvchi uchun ulangan Composio app'lari tool ro'yxati.
 * entityId — Sovereign user ID (Composio da har foydalanuvchi alohida entity).
 */
export async function listComposioTools(entityId: string): Promise<ComposioTool[]> {
  if (!composioEnabled()) return [];
  try {
    // 1. Foydalanuvchining ulangan app'larini ol
    const connRes = await fetch(
      `${COMPOSIO_BASE}/connectedAccounts?entityId=${encodeURIComponent(entityId)}&status=ACTIVE&limit=20`,
      {
        headers: { "x-api-key": apiKey(), "Content-Type": "application/json" },
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
    const apps = [...new Set((connData.items ?? []).map((i) => i.appName).filter(Boolean))] as string[];
    if (!apps.length) return [];

    // 2. Har app uchun tool'larni ol (OpenAI format)
    const appList = apps.slice(0, 10).join(",");
    const toolRes = await fetch(
      `${COMPOSIO_BASE}/actions?appNames=${encodeURIComponent(appList)}&limit=${MAX_TOOLS}`,
      {
        headers: { "x-api-key": apiKey(), "Content-Type": "application/json" },
        signal: AbortSignal.timeout(8_000),
      },
    );
    if (!toolRes.ok) {
      console.warn("[composio] actions:", toolRes.status);
      return [];
    }
    const toolData = (await toolRes.json()) as {
      items?: {
        name?: string;
        description?: string;
        parameters?: Record<string, unknown>;
      }[];
    };

    return (toolData.items ?? [])
      .slice(0, MAX_TOOLS)
      .filter((t) => t.name && t.description)
      .map((t) => ({
        type: "function" as const,
        function: {
          // Prefix bilan ajratamiz — execTool da tanib olish uchun
          name: COMPOSIO_TOOL_PREFIX + (t.name ?? "").replace(/[^a-zA-Z0-9_]/g, "_"),
          // "external" belgisi — connector-tools.ts da indirect prompt injection
          // oldini olish uchun (xuddi MCP kabi)
          description: `[Composio: ${t.name}] ${(t.description ?? "").slice(0, 200)}`,
          parameters: (t.parameters as Record<string, unknown>) ?? { type: "object", properties: {} },
        },
      }));
  } catch (e) {
    console.error("[composio] listTools:", e instanceof Error ? e.message : "error");
    return [];
  }
}

/**
 * Composio tool'ini bajaradi.
 * toolName — COMPOSIO_ prefiksi bilan (execTool dan keladi).
 */
export async function executeComposioTool(
  toolName: string,
  args: Record<string, unknown>,
  entityId: string,
): Promise<{ ok: boolean; text: string }> {
  // Prefixni olib tashlash va original nomni tiklash
  const actionName = toolName.slice(COMPOSIO_TOOL_PREFIX.length);

  try {
    const res = await fetch(`${COMPOSIO_BASE}/actions/execute/function`, {
      method: "POST",
      headers: {
        "x-api-key": apiKey(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        actionName,
        input: args,
        entityId,
      }),
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
      return {
        ok: false,
        text: `Composio: ${data.error ?? "bajarilmadi"}`,
      };
    }

    // Natijani matn sifatida chiqarish
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
