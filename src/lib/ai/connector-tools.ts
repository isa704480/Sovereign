import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Connector tool-calling. Javobdan OLDIN ishlaydi: model ulangan connectorlardan
 * (Figma/GitHub) tool orqali ma'lumot oladi, natija javob konteksti sifatida
 * qaytariladi. Streaming javob kodiga tegmaydi — xavfsiz qo'shimcha bosqich.
 */

const OPENROUTER = "https://openrouter.ai/api/v1/chat/completions";

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

function toolsFor(enabled: EnabledConnector[]): ORTool[] {
  const tools: ORTool[] = [];
  const has = (id: string) => enabled.some((c) => c.id === id);
  if (has("figma")) {
    tools.push({
      type: "function",
      function: {
        name: "figma_get_file",
        description: "Figma faylining tuzilishini o'qiydi: nomi, sahifalar va yuqori darajadagi freymlar. Dizayndan kod yozishda ishlat.",
        parameters: {
          type: "object",
          properties: { file_key: { type: "string", description: "Figma fayl kaliti yoki to'liq URL (…/file/<KEY>/… yoki …/design/<KEY>/…)" } },
          required: ["file_key"],
        },
      },
    });
  }
  if (has("github")) {
    tools.push({
      type: "function",
      function: {
        name: "github_get_repo",
        description: "GitHub repozitoriysi haqida ma'lumot: tavsif, til, yulduzlar, asosiy branch.",
        parameters: {
          type: "object",
          properties: { owner: { type: "string" }, repo: { type: "string" } },
          required: ["owner", "repo"],
        },
      },
    });
    tools.push({
      type: "function",
      function: {
        name: "github_read_file",
        description: "GitHub repozitoriysidagi fayl mazmunini o'qiydi.",
        parameters: {
          type: "object",
          properties: { owner: { type: "string" }, repo: { type: "string" }, path: { type: "string", description: "Fayl yo'li, masalan src/index.ts" } },
          required: ["owner", "repo", "path"],
        },
      },
    });
  }
  return tools;
}

function figmaKey(input: string): string {
  const m = /(?:file|design)\/([A-Za-z0-9]+)/.exec(input);
  return m ? m[1] : input.trim();
}

async function execTool(name: string, args: Record<string, unknown>, creds: Record<string, Record<string, unknown>>): Promise<string> {
  try {
    if (name === "figma_get_file") {
      const token = creds.figma?.token as string | undefined;
      if (!token) return "Figma ulanmagan.";
      const key = figmaKey(String(args.file_key ?? ""));
      const r = await fetch(`https://api.figma.com/v1/files/${encodeURIComponent(key)}?depth=2`, { headers: { "X-Figma-Token": token } });
      if (!r.ok) return `Figma xatosi: ${r.status}`;
      const j = (await r.json()) as { name?: string; document?: { children?: { name: string; type: string; children?: { name: string; type: string }[] }[] } };
      const pages = (j.document?.children ?? []).slice(0, 12).map((p) => {
        const frames = (p.children ?? []).slice(0, 20).map((f) => `${f.name} (${f.type})`).join(", ");
        return `• ${p.name}: ${frames || "—"}`;
      });
      return `Figma fayl: "${j.name ?? key}"\nSahifalar/freymlar:\n${pages.join("\n")}`.slice(0, 6000);
    }
    if (name === "github_get_repo" || name === "github_read_file") {
      const token = creds.github?.token as string | undefined;
      if (!token) return "GitHub ulanmagan.";
      const headers = { Authorization: `Bearer ${token}`, "User-Agent": "SOVEREIGN", Accept: "application/vnd.github+json" };
      const owner = String(args.owner ?? "");
      const repo = String(args.repo ?? "");
      if (name === "github_get_repo") {
        const r = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });
        if (!r.ok) return `GitHub xatosi: ${r.status}`;
        const j = (await r.json()) as { description?: string; language?: string; stargazers_count?: number; default_branch?: string };
        return `Repo ${owner}/${repo}: ${j.description ?? "—"} · til: ${j.language ?? "—"} · ⭐ ${j.stargazers_count ?? 0} · branch: ${j.default_branch ?? "main"}`;
      }
      const path = String(args.path ?? "");
      const r = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, { headers });
      if (!r.ok) return `GitHub xatosi: ${r.status}`;
      const j = (await r.json()) as { content?: string; encoding?: string };
      const content = j.content && j.encoding === "base64" ? Buffer.from(j.content, "base64").toString("utf8") : "";
      return `${owner}/${repo}/${path}:\n${content.slice(0, 5000)}`;
    }
    return "Noma'lum tool.";
  } catch {
    return "Tool bajarilishida xato.";
  }
}

interface RunOpts {
  providerModel: string;
  messages: { role: string; content: unknown }[];
  enabled: EnabledConnector[];
  signal?: AbortSignal;
}

/**
 * Bog'langan connectorlar bilan agentik tool bosqichi. Model kerak bo'lsa
 * toollarni chaqiradi, biz bajaramiz, natijani qaytaramiz (javob konteksti).
 * Hech narsa kerak bo'lmasa null qaytadi.
 */
function toText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((p) => (p && typeof p === "object" && "text" in p ? String((p as { text?: string }).text ?? "") : ""))
      .join(" ");
  }
  return "";
}

export async function runConnectorTools({ providerModel, messages, enabled, signal }: RunOpts): Promise<string | null> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key || !enabled.length) return null;
  const tools = toolsFor(enabled);
  if (!tools.length) return null;
  const creds = Object.fromEntries(enabled.map((c) => [c.id, c.config]));

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
      const result = await execTool(call.function.name, args, creds);
      collected.push(`[${call.function.name}] → ${result}`);
      convo.push({ role: "tool", tool_call_id: call.id, content: result.slice(0, 8000) });
    }
  }

  return collected.length ? collected.join("\n\n").slice(0, 10_000) : null;
}
