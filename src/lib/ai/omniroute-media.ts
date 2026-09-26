import "server-only";

/**
 * OmniRoute media endpointlari (OpenAI-mos): embeddings, transkripsiya, rasm.
 * Har biri sozlanmagan yoki xato bo'lsa `null` qaytaradi — chaqiruvchi eski
 * yo'lga (OpenRouter / OpenAI) o'tadi. Modellar 2026-09-24 da sinovdan o'tgan.
 */
function omni(): { base: string; key: string } | null {
  const base = process.env.OMNIROUTE_BASE_URL;
  const key = process.env.OMNIROUTE_API_KEY;
  return base && key ? { base: base.replace(/\/$/, ""), key } : null;
}

/**
 * Bazadagi vektorlar text-embedding-3-small (1536) bilan yozilgan — faqat
 * AYNAN shu model: boshqa model o'lchami mos bo'lsa ham vektor fazosi boshqa,
 * eski hujjatlar/kesh bilan solishtirib bo'lmaydi.
 */
export const EMBED_MODEL = "openrouter/openai/text-embedding-3-small";

export async function omniEmbed(texts: string[]): Promise<number[][] | null> {
  const o = omni();
  if (!o) return null;
  try {
    const res = await fetch(`${o.base}/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${o.key}` },
      body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { data?: { embedding: number[] }[] };
    const out = (data.data ?? []).map((d) => d.embedding);
    return out.length === texts.length && out.every((v) => v?.length === 1536) ? out : null;
  } catch {
    return null;
  }
}

/** Groq Whisper (tekin) — sinovda 1-2 soniya. */
const STT_MODELS = ["groq/whisper-large-v3-turbo", "groq/whisper-large-v3"];

export async function omniTranscribe(file: Blob, filename: string, language: string): Promise<string | null> {
  const o = omni();
  if (!o) return null;
  for (const model of STT_MODELS) {
    try {
      const form = new FormData();
      form.append("file", file, filename);
      form.append("model", model);
      form.append("language", language);
      form.append("response_format", "json");
      const res = await fetch(`${o.base}/audio/transcriptions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${o.key}` },
        body: form,
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as { text?: string };
      if (typeof data.text === "string") return data.text.trim();
    } catch {
      /* keyingi model */
    }
  }
  return null;
}

/** AI Horde odatda WEBP qaytaradi — MIME'ni fayl boshidagi imzodan aniqlaymiz. */
function imageMime(b64: string): string {
  if (b64.startsWith("UklGR")) return "image/webp";
  if (b64.startsWith("/9j/")) return "image/jpeg";
  if (b64.startsWith("R0lGOD")) return "image/gif";
  return "image/png";
}

/**
 * AI Horde (tekin, ko'ngillilar GPU'si) — navbat bo'lishi mumkin, shuning uchun
 * har modelga vaqt chegarasi. Flux Schnell sinovda 23-60 soniya.
 */
// [model, kutish ms]: navbat 20-70 soniya o'zgarib turadi; jami route maxDuration (180s) ichida.
const IMAGE_MODELS: [string, number][] = [
  ["aihorde/Flux.1-Schnell fp8 (Compact)", 110_000],
  ["aihorde/AlbedoBase XL (SDXL)", 60_000],
];

export async function omniImage(
  prompt: string,
  deadline = Date.now() + 170_000,
): Promise<{ urls: string[]; provider: string } | null> {
  const o = omni();
  if (!o) return null;
  for (const [model, max] of IMAGE_MODELS) {
    const timeout = Math.min(max, deadline - Date.now());
    if (timeout < 10_000) break;
    try {
      const res = await fetch(`${o.base}/images/generations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${o.key}` },
        body: JSON.stringify({ model, prompt, n: 1, size: "1024x1024" }),
        signal: AbortSignal.timeout(timeout),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as { data?: { b64_json?: string; url?: string }[] };
      const urls = (data.data ?? [])
        .map((d) => (d.b64_json ? `data:${imageMime(d.b64_json)};base64,${d.b64_json}` : d.url))
        .filter((u): u is string => Boolean(u));
      if (urls.length) return { urls, provider: model };
    } catch {
      /* navbat uzun — keyingi model */
    }
  }
  return null;
}

/**
 * Rasm modellari (Flux/SDXL) faqat inglizchani yaxshi tushunadi: "tog'da quyosh
 * chiqishi" o'rniga tasodifiy rasm chiqardi. So'rovni tez LLM bilan inglizcha
 * rasm promptiga aylantiramiz (sinovda ~1-1.5 s). Xato bo'lsa — null (asl matn).
 */
const PROMPT_MODELS = ["groq/qwen/qwen3.8-27b", "groq/openai/gpt-oss-20b"];

/**
 * Sifat uchun "prompt muhandisi" ko'rsatmasi: niyat va so'ralgan matn aynan
 * saqlanadi, qolgani (kompozitsiya, yorug'lik, uslub, kamera) boyitiladi.
 */
const IMAGE_SYSTEM = [
  "You are an expert prompt engineer for text-to-image models (FLUX, Z-Image, SANA).",
  "Rewrite the user's request (any language: Uzbek Latin/Cyrillic, Russian, English...) into ONE English prompt that yields a stunning, high-quality image.",
  "Rules:",
  "1. Preserve the user's intent exactly: every subject, count, color, style, mood, setting and detail they asked for. Never add unrelated subjects or change the subject.",
  '2. Text in the image: if the user asks for any words, name, slogan or lettering, copy it VERBATIM (original language and spelling) inside double quotes, e.g. with the text "SOVEREIGN" in bold clean sans-serif letters. If no text was requested, end with: no text, no letters, no watermark.',
  "3. Order: main subject with concrete details, action or pose, setting/background, composition and framing (close-up, wide shot, rule of thirds, centered...), lighting (golden hour, soft studio light, dramatic rim light...), color palette and mood, style or medium.",
  "4. Style: follow any style the user names (anime, watercolor, 3D render, pixel art, oil painting, flat vector...). If none is named, pick the best fit; for real people, animals, food, products, places and nature default to photorealistic photography and add camera details (e.g. shot on a full-frame camera, 85mm lens, f/1.8, shallow depth of field).",
  "5. Logos and icons: flat vector design, clean simple geometric shapes, centered on a plain background, balanced negative space, professional, no mockup.",
  "6. Finish with quality cues: highly detailed, sharp focus, professional composition; for people add natural skin texture, realistic proportions, well-formed hands and faces.",
  "Write 40-90 words as comma-separated descriptive phrases. No explanations, no lists, no quotes around the whole prompt. Output only the prompt.",
].join("\n");

/** Video (Wan va h.k.): bitta uzluksiz ~5 soniyalik kadr — harakat va kamera muhim. */
const VIDEO_SYSTEM = [
  "You are an expert prompt engineer for text-to-video models (Wan, Seedance).",
  "Rewrite the user's request (any language) into ONE English prompt for a single continuous ~5-second shot.",
  "Keep every subject, count, color, style and detail the user asked for; never add unrelated subjects. If the user requests on-screen text, copy it verbatim in double quotes.",
  "Describe: the subject and its appearance, the specific motion or action (clear, smooth, physically plausible), the camera movement (slow dolly-in, tracking shot, orbit, aerial drone, static tripod...), the setting, lighting, color palette and mood, and the style (cinematic photorealistic unless the user names another style, e.g. anime or 3D animation).",
  "No scene cuts, no multiple shots. Write 40-80 words. Output only the prompt.",
].join("\n");

/**
 * Foydalanuvchi so'rovini (istalgan tilda) sifatli inglizcha rasm/video
 * promptiga aylantiradi. Xato yoki OmniRoute yo'q bo'lsa — null (asl matn).
 */
export async function omniImagePrompt(request: string, kind: "image" | "video" = "image"): Promise<string | null> {
  const o = omni();
  if (!o) return null;
  for (const model of PROMPT_MODELS) {
    try {
      const res = await fetch(`${o.base}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${o.key}` },
        body: JSON.stringify({
          model,
          max_tokens: 400,
          temperature: 0.4,
          messages: [
            { role: "system", content: kind === "video" ? VIDEO_SYSTEM : IMAGE_SYSTEM },
            { role: "user", content: request },
          ],
        }),
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const out = data.choices?.[0]?.message?.content
        ?.replace(/<think>[\s\S]*?<\/think>/g, "")
        .trim()
        .replace(/^(?:\*\*)?(?:image |video )?prompt(?:\*\*)?\s*:\s*/i, "")
        .replace(/^["']|["']$/g, "")
        .trim();
      if (out && out.length >= 3) return out.slice(0, 1000);
    } catch {
      /* keyingi model */
    }
  }
  return null;
}
