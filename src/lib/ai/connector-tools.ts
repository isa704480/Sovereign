import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Connector tool-calling. Javobdan OLDIN ishlaydi: model ulangan connectorlardan
 * (Figma/GitHub/Google/MCP) tool orqali ma'lumot oladi, natija javob konteksti
 * sifatida qaytariladi. Streaming javob kodiga tegmaydi — xavfsiz qo'shimcha bosqich.
 */

const OPENROUTER = "https://openrouter.ai/api/v1/chat/completions";
const NL = "\n";
const MCP_PREFIX = "mcp__";

interface EnabledConnector {
  id: string;
  config: Record<string, unknown>;
}

type ORTool = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

/** Yoqilgan va ulangan (tokenli) connectorlar. */
export async function getEnabledConnectors(
  supabase: SupabaseClient,
  userId: string,
): Promise<EnabledConnector[]> {
  const { data } = await supabase
    .from("connector_accounts")
    .select("connector_id, enabled, config")
    .eq("user_id", userId)
    .eq("enabled", true);
  return (data ?? [])
    .map((r) => ({ id: r.connector_id as string, config: (r.config ?? {}) as Record<string, unknown> }))
    .filter((c) => typeof c.config.token === "string" || typeof c.config.url === "string");
}

function tool(name: string, description: string, properties: Record<string, unknown>, required: string[] = []): ORTool {
  return { type: "function", function: { name, description, parameters: { type: "object", properties, required } } };
}

function toolsFor(enabled: EnabledConnector[]): ORTool[] {
  const tools: ORTool[] = [];
  const has = (id: string) => enabled.some((c) => c.id === id);
  if (has("figma")) {
    tools.push(tool(
      "figma_get_file",
      "Figma faylining tuzilishini o'qiydi: nomi, sahifalar va yuqori darajadagi freymlar.",
      { file_key: { type: "string", description: "Figma fayl kaliti yoki to'liq URL" } },
      ["file_key"],
    ));
  }
  if (has("github")) {
    tools.push(tool(
      "github_get_repo",
      "GitHub repozitoriysi haqida ma'lumot: tavsif, til, yulduzlar, asosiy branch.",
      { owner: { type: "string" }, repo: { type: "string" } },
      ["owner", "repo"],
    ));
    tools.push(tool(
      "github_read_file",
      "GitHub repozitoriysidagi fayl mazmunini o'qiydi.",
      { owner: { type: "string" }, repo: { type: "string" }, path: { type: "string", description: "Fayl yo'li" } },
      ["owner", "repo", "path"],
    ));
  }
  if (has("gsheets")) {
    tools.push(tool(
      "gsheets_read",
      "Google Sheets jadvalidan diapazonni o'qiydi.",
      { spreadsheet_id: { type: "string" }, range: { type: "string", description: "Masalan Sheet1!A1:D20" } },
      ["spreadsheet_id", "range"],
    ));
  }
  if (has("gmail")) {
    tools.push(tool("gmail_list", "Gmail'dagi so'nggi xatlar mavzularini ko'radi.", { query: { type: "string", description: "Gmail qidiruv (ixtiyoriy)" } }));
  }
  if (has("gcalendar")) {
    tools.push(tool("gcalendar_list", "Yaqin kelayotgan kalendar voqealarini ko'radi.", {}));
  }
  return tools;
}

/* ----------------------------- Google refresh ----------------------------- */

/** Google access token muddati o'tsa refresh_token bilan yangi token oladi. */
async function refreshGoogleToken(refreshToken: string): Promise<string | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  try {
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { access_token?: string };
    return j.access_token ?? null;
  } catch {
    return null;
  }
}

/* ------------------------------- MCP client ------------------------------- */

async function mcpRpc(url: string, method: string, params: unknown, sessionId?: string): Promise<{ result?: unknown; sessionId?: string }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (sessionId) headers["Mcp-Session-Id"] = sessionId;
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
  });
  const sid = res.headers.get("Mcp-Session-Id") ?? sessionId;
  const text = await res.text();
  // Streamable HTTP javobi JSON yoki SSE bo'lishi mumkin.
  const line = text.split("\n").find((l) => l.trim().startsWith("{") || l.startsWith("data:"));
  const raw = line?.startsWith("data:") ? line.slice(5).trim() : (line ?? text).trim();
  try {
    const j = JSON.parse(raw) as { result?: unknown };
    return { result: j.result, sessionId: sid ?? undefined };
  } catch {
    return { sessionId: sid ?? undefined };
  }
}

interface McpEndpoint {
  url: string;
  sessionId?: string;
  tools: ORTool[];
}

/** MCP serverga ulanib (initialize + tools/list) mavjud toollarni oladi. */
async function mcpConnect(url: string): Promise<McpEndpoint | null> {
  try {
    const init = await mcpRpc(url, "initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "SOVEREIGN", version: "1.0" },
    });
    const sessionId = init.sessionId;
    if (sessionId) await mcpRpc(url, "notifications/initialized", {}, sessionId);
    const listed = await mcpRpc(url, "tools/list", {}, sessionId);
    const list = (listed.result as { tools?: { name: string; description?: string; inputSchema?: Record<string, unknown> }[] })?.tools ?? [];
    if (!list.length) return null;
    const tools: ORTool[] = list.slice(0, 20).map((t) => ({
      type: "function",
      function: {
        name: MCP_PREFIX + t.name,
        description: (t.description ?? t.name).slice(0, 300),
        parameters: t.inputSchema ?? { type: "object", properties: {} },
      },
    }));
    return { url, sessionId, tools };
  } catch {
    return null;
  }
}

async function mcpCall(ep: McpEndpoint, toolName: string, args: Record<string, unknown>): Promise<string> {
  try {
    const res = await mcpRpc(ep.url, "tools/call", { name: toolName.slice(MCP_PREFIX.length), arguments: args }, ep.sessionId);
    const content = (res.result as { content?: { type: string; text?: string }[] })?.content ?? [];
    const text = content.map((c) => c.text ?? "").join(NL).trim();
    return text || "MCP: natija bo'sh.";
  } catch {
    return "MCP chaqiruvida xato.";
  }
}

/* ------------------------------- Tool exec -------------------------------- */

function figmaKey(input: string): string {
  const m = /(?:file|design)\/([A-Za-z0-9]+)/.exec(input);
  return m ? m[1] : input.trim();
}

interface ExecCtx {
  creds: Record<string, Record<string, unknown>>;
  refresh: (connectorId: string) => Promise<string | null>;
  mcp: McpEndpoint[];
}

async function execTool(name: string, args: Record<string, unknown>, ctx: ExecCtx): Promise<string> {
  const { creds, refresh } = ctx;
  const tokenOf = (id: string) => creds[id]?.token as string | undefined;

  // 401 bo'lsa Google tokenini yangilab qayta uriradigan fetch.
  const gfetch = async (id: string, url: string): Promise<Response> => {
    let r = await fetch(url, { headers: { Authorization: `Bearer ${tokenOf(id)}` } });
    if (r.status === 401) {
      const nt = await refresh(id);
      if (nt) r = await fetch(url, { headers: { Authorization: `Bearer ${nt}` } });
    }
    return r;
  };

  try {
    if (name.startsWith(MCP_PREFIX)) {
      const ep = ctx.mcp.find((e) => e.tools.some((t) => t.function.name === name));
      return ep ? mcpCall(ep, name, args) : "MCP server topilmadi.";
    }

    if (name === "figma_get_file") {
      const token = tokenOf("figma");
      if (!token) return "Figma ulanmagan.";
      const key = figmaKey(String(args.file_key ?? ""));
      const r = await fetch(`https://api.figma.com/v1/files/${encodeURIComponent(key)}?depth=2`, { headers: { "X-Figma-Token": token } });
      if (!r.ok) return `Figma xatosi: ${r.status}`;
      const j = (await r.json()) as { name?: string; document?: { children?: { name: string; type: string; children?: { name: string; type: string }[] }[] } };
      const pages = (j.document?.children ?? []).slice(0, 12).map((p) => {
        const frames = (p.children ?? []).slice(0, 20).map((f) => `${f.name} (${f.type})`).join(", ");
        return `- ${p.name}: ${frames || "—"}`;
      });
      return [`Figma fayl: "${j.name ?? key}"`, "Sahifalar/freymlar:", ...pages].join(NL).slice(0, 6000);
    }

    if (name === "github_get_repo" || name === "github_read_file") {
      const token = tokenOf("github");
      if (!token) return "GitHub ulanmagan.";
      const headers = { Authorization: `Bearer ${token}`, "User-Agent": "SOVEREIGN", Accept: "application/vnd.github+json" };
      const owner = String(args.owner ?? "");
      const repo = String(args.repo ?? "");
      if (name === "github_get_repo") {
        const r = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });
        if (!r.ok) return `GitHub xatosi: ${r.status}`;
        const j = (await r.json()) as { description?: string; language?: string; stargazers_count?: number; default_branch?: string };
        return `Repo ${owner}/${repo}: ${j.description ?? "—"} · til: ${j.language ?? "—"} · yulduz ${j.stargazers_count ?? 0} · branch: ${j.default_branch ?? "main"}`;
      }
      const path = String(args.path ?? "");
      const r = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, { headers });
      if (!r.ok) return `GitHub xatosi: ${r.status}`;
      const j = (await r.json()) as { content?: string; encoding?: string };
      const content = j.content && j.encoding === "base64" ? Buffer.from(j.content, "base64").toString("utf8") : "";
      return [`${owner}/${repo}/${path}:`, content.slice(0, 5000)].join(NL);
    }

    if (name === "gsheets_read") {
      if (!tokenOf("gsheets")) return "Google Sheets ulanmagan.";
      const id = encodeURIComponent(String(args.spreadsheet_id ?? ""));
      const range = encodeURIComponent(String(args.range ?? "A1:Z50"));
      const r = await gfetch("gsheets", `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${range}`);
      if (!r.ok) return `Sheets xatosi: ${r.status}`;
      const j = (await r.json()) as { values?: string[][] };
      const rows = (j.values ?? []).slice(0, 40).map((row) => row.join(" | "));
      return [`Sheet ${String(args.range)}:`, ...rows].join(NL).slice(0, 6000);
    }

    if (name === "gmail_list") {
      if (!tokenOf("gmail")) return "Gmail ulanmagan.";
      const q = encodeURIComponent(String(args.query ?? ""));
      const lr = await gfetch("gmail", `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=5&q=${q}`);
      if (!lr.ok) return `Gmail xatosi: ${lr.status}`;
      const lj = (await lr.json()) as { messages?: { id: string }[] };
      const subs: string[] = [];
      for (const m of (lj.messages ?? []).slice(0, 5)) {
        const mr = await gfetch("gmail", `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`);
        if (!mr.ok) continue;
        const mj = (await mr.json()) as { payload?: { headers?: { name: string; value: string }[] } };
        const h = mj.payload?.headers ?? [];
        const subj = h.find((x) => x.name === "Subject")?.value ?? "(mavzusiz)";
        const from = h.find((x) => x.name === "From")?.value ?? "";
        subs.push(`- ${subj} — ${from}`);
      }
      return subs.length ? ["So'nggi xatlar:", ...subs].join(NL) : "Xat topilmadi.";
    }

    if (name === "gcalendar_list") {
      if (!tokenOf("gcalendar")) return "Google Kalendar ulanmagan.";
      const now = new Date().toISOString();
      const r = await gfetch("gcalendar", `https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=5&singleEvents=true&orderBy=startTime&timeMin=${encodeURIComponent(now)}`);
      if (!r.ok) return `Kalendar xatosi: ${r.status}`;
      const j = (await r.json()) as { items?: { summary?: string; start?: { dateTime?: string; date?: string } }[] };
      const ev = (j.items ?? []).map((e) => `- ${e.start?.dateTime ?? e.start?.date ?? "?"} — ${e.summary ?? "(nomsiz)"}`);
      return ev.length ? ["Yaqin voqealar:", ...ev].join(NL) : "Voqea yo'q.";
    }

    return "Noma'lum tool.";
  } catch {
    return "Tool bajarilishida xato.";
  }
}

/* --------------------------------- Runner --------------------------------- */

interface RunOpts {
  supabase: SupabaseClient;
  userId: string;
  providerModel: string;
  messages: { role: string; content: unknown }[];
  enabled: EnabledConnector[];
  signal?: AbortSignal;
}

function toText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((p) => (p && typeof p === "object" && "text" in p ? String((p as { text?: string }).text ?? "") : ""))
      .join(" ");
  }
  return "";
}

export async function runConnectorTools({ supabase, userId, providerModel, messages, enabled, signal }: RunOpts): Promise<string | null> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key || !enabled.length) return null;

  const creds: Record<string, Record<string, unknown>> = Object.fromEntries(enabled.map((c) => [c.id, { ...c.config }]));

  // Google token yangilab, DB'ga ham saqlaydi (keyingi safar tayyor turadi).
  const refresh = async (connectorId: string): Promise<string | null> => {
    const rt = creds[connectorId]?.refresh as string | undefined;
    if (!rt) return null;
    const nt = await refreshGoogleToken(rt);
    if (!nt) return null;
    creds[connectorId].token = nt;
    try {
      await supabase
        .from("connector_accounts")
        .update({ config: { ...creds[connectorId], token: nt } })
        .eq("user_id", userId)
        .eq("connector_id", connectorId);
    } catch {
      /* saqlanmasa ham davom */
    }
    return nt;
  };

  // MCP serverlarni ulaymiz va ularning toollarini qo'shamiz.
  const mcpUrls = enabled.filter((c) => c.id === "mcp" && typeof c.config.url === "string").map((c) => String(c.config.url));
  const mcp: McpEndpoint[] = [];
  for (const u of mcpUrls.slice(0, 3)) {
    const ep = await mcpConnect(u);
    if (ep) mcp.push(ep);
  }

  const tools = [...toolsFor(enabled), ...mcp.flatMap((e) => e.tools)];
  if (!tools.length) return null;

  const ctx: ExecCtx = { creds, refresh, mcp };
  const convo: unknown[] = [
    {
      role: "system",
      content:
        "Foydalanuvchi savoliga javob berish uchun KERAK BO'LSA ulangan connectorlardan (tool) foydalanib ma'lumot ol. " +
        "Ma'lumot kerak bo'lmasa hech qanday tool chaqirma.",
    },
    ...messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-6)
      .map((m) => ({ role: m.role, content: toText(m.content) })),
  ];
  const collected: string[] = [];

  for (let round = 0; round < 3; round++) {
    let res: Response;
    try {
      res = await fetch(OPENROUTER, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
          "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
          "X-Title": "SOVEREIGN AI",
        },
        body: JSON.stringify({ model: providerModel, messages: convo, tools, tool_choice: "auto", max_tokens: 1024, stream: false }),
        signal,
      });
    } catch {
      break;
    }
    if (!res.ok) break;
    const j = (await res.json()) as { choices?: { message?: { role: string; content?: string; tool_calls?: { id: string; function: { name: string; arguments: string } }[] } }[] };
    const msg = j.choices?.[0]?.message;
    if (!msg) break;
    const calls = msg.tool_calls ?? [];
    if (!calls.length) break;
    convo.push(msg);
    for (const call of calls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        /* ignore */
      }
      const result = await execTool(call.function.name, args, ctx);
      collected.push(`[${call.function.name}] -> ${result}`);
      convo.push({ role: "tool", tool_call_id: call.id, content: result.slice(0, 8000) });
    }
  }

  return collected.length ? collected.join(NL + NL).slice(0, 10_000) : null;
}
