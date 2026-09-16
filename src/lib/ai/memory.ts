import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

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

/** System-prompt block injecting what the AI remembers about the user. */
export function memoryPrompt(memories: MemoryNode[]): string {
  if (!memories.length) return "";
  const lines = memories.slice(0, 25).map((m) => `- ${m.content}`);
  return (
    "FOYDALANUVCHI HAQIDA ESLAB QOLGANLARING (kerak bo'lsa foydalan, ortiqcha eslatma):\n" +
    lines.join("\n")
  );
}

/**
 * Extracts 0-4 durable facts about the user from the latest exchange using a
 * cheap model, then stores new (non-duplicate) ones. Fire-and-forget.
 */
export async function rememberFromExchange(
  supabase: SupabaseClient,
  userId: string,
  userText: string,
  assistantText: string,
): Promise<number> {
  if (!process.env.OPENROUTER_API_KEY) return 0;
  const existing = await getMemories(supabase, userId, 60);
  const existingSet = new Set(existing.map((m) => m.content.toLowerCase().trim()));

  const sys = [
    "Sen foydalanuvchi haqidagi UZOQ MUDDATLI faktlarni ajratib oluvchisan.",
    "Faqat kelajakda foydali, barqaror faktlarni ol: ism, kasb, loyihalar, afzalliklar, uslub, til, maqsadlar.",
    "Vaqtinchalik yoki bir martalik narsalarni OLMA (masalan 'salom dedi', 'bu savol').",
    "JSON qaytar: {\"memories\":[{\"content\":\"...\",\"kind\":\"fact|preference|project|person\"}]}.",
    "Agar eslab qolishga arziydigan narsa bo'lmasa, bo'sh ro'yxat qaytar. Har bir content qisqa, 1 gap, o'zbekcha.",
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
  const rows = (parsed.memories ?? [])
    .map((m) => ({
      content: String(m.content ?? "").trim().slice(0, 300),
      kind: kinds.has(String(m.kind)) ? (m.kind as string) : "fact",
    }))
    .filter((m) => m.content.length > 3 && !existingSet.has(m.content.toLowerCase()))
    .slice(0, 4);

  if (!rows.length) return 0;
  const { error } = await supabase
    .from("memory_nodes")
    .insert(rows.map((r) => ({ user_id: userId, content: r.content, kind: r.kind, source: "chat" })));
  return error ? 0 : rows.length;
}
