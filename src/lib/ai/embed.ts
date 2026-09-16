import "server-only";

const EMBED_URL = "https://openrouter.ai/api/v1/embeddings";

/** Splits text into ~800-token chunks with light overlap. */
export function chunkText(text: string, targetChars = 3200, overlapChars = 200): string[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (normalized.length <= targetChars) return normalized ? [normalized] : [];
  const chunks: string[] = [];
  let i = 0;
  while (i < normalized.length) {
    const end = Math.min(i + targetChars, normalized.length);
    // Prefer to cut on a paragraph or sentence boundary near the end.
    let cut = end;
    if (end < normalized.length) {
      const window = normalized.slice(i, end);
      const para = window.lastIndexOf("\n\n");
      const period = window.lastIndexOf(". ");
      const best = Math.max(para, period);
      if (best > targetChars * 0.6) cut = i + best + 1;
    }
    chunks.push(normalized.slice(i, cut).trim());
    if (cut >= normalized.length) break;
    i = Math.max(cut - overlapChars, i + 1);
  }
  return chunks.filter((c) => c.length > 20);
}

/** Batches text through OpenAI's small embeddings model (via OpenRouter). */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (!process.env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY yo'q");
  if (!texts.length) return [];
  const res = await fetch(EMBED_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "X-Title": "SOVEREIGN KB",
    },
    body: JSON.stringify({ model: "openai/text-embedding-3-small", input: texts }),
  });
  if (!res.ok) throw new Error(`Embedding xato: ${res.status}`);
  const data = (await res.json()) as { data?: { embedding: number[] }[] };
  return (data.data ?? []).map((d) => d.embedding);
}

/** Convenience: single-query embedding as a pgvector-friendly array. */
export async function embedQuery(text: string): Promise<number[] | null> {
  const [v] = await embedTexts([text]);
  return v ?? null;
}
