import "server-only";

const OPENROUTER = "https://openrouter.ai/api/v1/chat/completions";

/** Detects whether the user is asking for an image. */
export function detectImageIntent(text: string): boolean {
  return /\b(rasm chiz|rasm yarat|logo chiz|logo yarat|sur[ao]t|image|picture|draw|generate.*image|make.*image|illustration|design.*logo|chizib ber)\b/i.test(
    text,
  );
}

export interface ImageResult {
  urls: string[];
  provider: string;
}

/**
 * Generates an image via OpenRouter's Gemini image models. Returns data URLs
 * that can be embedded in a message. Throws on error so the caller can fall
 * back to text.
 */
export async function generateImage(prompt: string): Promise<ImageResult> {
  if (!process.env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY yo'q");
  const res = await fetch(OPENROUTER, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "X-Title": "SOVEREIGN Image",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-image",
      modalities: ["image", "text"],
      messages: [{ role: "user", content: prompt }],
      max_tokens: 2048,
    }),
  });
  if (!res.ok) throw new Error(`Rasm generatsiya xato: ${res.status}`);
  const data = (await res.json()) as {
    choices?: { message?: { content?: unknown; images?: { image_url?: { url: string } }[] } }[];
  };
  const msg = data.choices?.[0]?.message;
  const urls: string[] = [];
  // Gemini via OpenRouter returns images either in message.images[] or embedded
  // in the multimodal content array.
  for (const img of msg?.images ?? []) if (img?.image_url?.url) urls.push(img.image_url.url);
  if (Array.isArray(msg?.content)) {
    for (const p of msg?.content as { type?: string; image_url?: { url?: string } }[]) {
      if (p?.type === "image_url" && p.image_url?.url) urls.push(p.image_url.url);
    }
  }
  if (!urls.length) throw new Error("Rasm qaytarilmadi");
  return { urls, provider: "google/gemini-2.5-flash-image" };
}
