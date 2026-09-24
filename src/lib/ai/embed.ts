import "server-only";
import { omniEmbed } from "@/lib/ai/omniroute-media";

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

/**
 * text-embedding-3-small (1536): avval OmniRoute orqali, bo'lmasa to'g'ridan-to'g'ri
 * OpenRouter. Ikkalasi ham AYNI model — bazadagi vektorlar bilan mos.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];
  const viaOmni = await omniEmbed(texts);
  if (viaOmni) return viaOmni;
  if (!process.env.OPENROUTER_API_KEY) throw new Error("Embedding provayderi yo'q");
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
