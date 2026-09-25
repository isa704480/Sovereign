import "server-only";
import { omniImage, omniImagePrompt } from "@/lib/ai/omniroute-media";

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
 * Pollinations.ai (tekin, kalitsiz Flux) — sinovda 4-45 soniya. Rasmni serverda
 * yuklab data URL qilamiz: foydalanuvchi brauzeri tashqi domenga so'rov yubormaydi
 * va prompt URL'da ochiq qolmaydi.
 */
async function pollinationsImage(prompt: string, deadline: number): Promise<ImageResult | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const timeout = Math.min(60_000, deadline - Date.now());
    if (timeout < 10_000) break;
    try {
      const seed = Math.floor(Math.random() * 1_000_000);
      const url =
        `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt.slice(0, 1500))}` +
        `?width=1024&height=1024&nologo=true&model=flux&seed=${seed}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(timeout) });
      const type = res.headers.get("content-type") ?? "";
      if (!res.ok || !type.startsWith("image/")) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 1000) continue;
      return { urls: [`data:${type.split(";")[0]};base64,${buf.toString("base64")}`], provider: "pollinations/flux" };
    } catch {
      /* vaqt tugadi — yana bir urinish yoki keyingi provayder */
    }
  }
  return null;
}

/**
 * Rasm yaratadi: Pollinations (tez) → OmniRoute AI Horde → OpenRouter Gemini.
 * Data URL'lar qaytaradi; hammasi muvaffaqiyatsiz bo'lsa xato tashlaydi.
 */
export async function generateImage(request: string): Promise<ImageResult> {
  // Route maxDuration 180s — hamma provayderlar shu byudjet ichida.
  const deadline = Date.now() + 165_000;
  const prompt = (await omniImagePrompt(request)) ?? request;
  const viaPolli = await pollinationsImage(prompt, deadline);
  if (viaPolli) return viaPolli;
  const viaOmni = await omniImage(prompt, deadline);
  if (viaOmni) return viaOmni;
  if (!process.env.OPENROUTER_API_KEY) throw new Error("Rasm provayderi yo'q");
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
