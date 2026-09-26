import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LANG_FOR_AI, type Lang } from "@/lib/i18n";
import { getServerLang } from "@/lib/i18n-server";
import { isNearDuplicate, isSmallTalk, memoryPrompt } from "@/lib/ai/memory-prompt";

export interface MemoryNode {
  id: string;
  content: string;
  kind: "fact" | "preference" | "project" | "person";
  created_at: string;
}

const OPENROUTER = "https://openrouter.ai/api/v1/chat/completions";

/** Recent memories for a user (most recent first). */
export async function getMemories(supabase: SupabaseClient, userId: string, limit = 40): Promise<MemoryNode[]> {
  const { data } = await supabase
    .from("memory_nodes")
    .select("id, content, kind, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data as MemoryNode[] | null) ?? [];
}

/** System-prompt block injecting what the AI remembers about the user (qat'iy qoidalar bilan). */
export { memoryPrompt };

/**
 * Extracts 0-4 durable facts about the user from the latest exchange using a
 * cheap model, then stores new (non-duplicate) ones. Fire-and-forget.
 */
export async function rememberFromExchange(
  supabase: SupabaseClient,
  userId: string,
  userText: string,
  assistantText: string,
  lang?: Lang,
): Promise<number> {
  if (!process.env.OPENROUTER_API_KEY) return 0;
  // Salomlashish / "rahmat" — eslab qolinadigan narsa yo'q, modelni chaqirmaymiz.
  if (isSmallTalk(userText)) return 0;
  const existing = await getMemories(supabase, userId, 60);

  // Xotira foydalanuvchi o'qiy oladigan tilda yozilsin: berilmasa — interfeys tili (cookie).
  let memLang: Lang | null = lang ?? null;
  if (!memLang) {
    try {
      memLang = await getServerLang();
    } catch {
      memLang = null; // so'rov kontekstidan tashqarida — foydalanuvchi yozgan tilda
    }
  }
  const langRule = memLang ? LANG_FOR_AI[memLang] : "in the language the user wrote in";

  const sys = [
    "You extract LONG-TERM facts about the user from one chat exchange.",
    "Keep only durable facts useful in future chats: profession, ongoing projects, preferences, style, language, goals.",
    "Do NOT store greetings, small talk, thanks, one-off questions or temporary context.",
    "The user's NAME: store it ONLY if the user explicitly states their own name in THEIR message",
    "(e.g. 'mening ismim X', 'ismim X', 'I'm X', 'my name is X', 'меня зовут X'), as kind \"person\",",
    "worded like \"User's name: X\" in the target language. Never infer a name from the AI reply,",
    "and never treat a project, brand, product, company or website name as the user's name.",
    "A project must be kind \"project\" and start with the word 'Project:' in the target language",
    "(e.g. 'Loyiha: …', 'Проект: …', 'Project: …').",
    "Return JSON: {\"memories\":[{\"content\":\"...\",\"kind\":\"fact|preference|project|person\"}]}.",
    `If nothing is worth remembering, return an empty list. Each content: short, one sentence. Target language: ${langRule}.`,
  ].join(" ");
  const user = `Foydalanuvchi: ${userText.slice(0, 2000)}\n\nAI javobi (kontekst): ${assistantText.slice(0, 1000)}`;

  let parsed: { memories?: { content?: string; kind?: string }[] } = {};
  try {
    const res = await fetch(OPENROUTER, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "X-Title": "SOVEREIGN Memory",
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
        temperature: 0,
        max_tokens: 400,
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) return 0;
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    parsed = JSON.parse(data.choices?.[0]?.message?.content ?? "{}");
  } catch {
    return 0;
  }

  const kinds = new Set(["fact", "preference", "project", "person"]);
  // Deyarli bir xil yozuvlar (mavjudlari bilan ham, o'zaro ham) qayta saqlanmaydi.
  const kept: string[] = existing.map((m) => m.content);
  const rows: { content: string; kind: string }[] = [];
  for (const m of parsed.memories ?? []) {
    const content = String(m.content ?? "").trim().slice(0, 300);
    if (content.length <= 3 || kept.some((k) => isNearDuplicate(k, content))) continue;
    kept.push(content);
    rows.push({ content, kind: kinds.has(String(m.kind)) ? (m.kind as string) : "fact" });
    if (rows.length >= 4) break;
  }

  if (!rows.length) return 0;
  const { error } = await supabase
    .from("memory_nodes")
    .insert(rows.map((r) => ({ user_id: userId, content: r.content, kind: r.kind, source: "chat" })));
  return error ? 0 : rows.length;
}
