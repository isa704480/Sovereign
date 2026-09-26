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

export type Aspect = "square" | "landscape" | "portrait";

/** Tomonlar nisbati → piksel o'lchami (Flux/Z-Image uchun 64 ga karrali). */
export const ASPECT_SIZE: Record<Aspect, { width: number; height: number }> = {
  square: { width: 1024, height: 1024 },
  landscape: { width: 1344, height: 768 },
  portrait: { width: 768, height: 1344 },
};

// Aniq nisbat ("16:9", "9:16", "1:1", "4:3"...) — faqat ma'lum nisbatlar, "10:30" vaqt emas.
const RATIO = /(?:^|\D)(1|2|3|4|5|9|16|21)\s*[:x×]\s*(1|2|3|4|5|9|16|21)(?!\d)/;
const KNOWN_RATIOS = new Set(["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3", "21:9", "9:21", "4:5", "5:4", "2:1", "1:2"]);
// Piksel o'lchami: "1920x1080", "1080×1920".
const PIXELS = /(?:^|\D)(\d{3,4})\s*[x×]\s*(\d{3,4})(?!\d)/;
// Aniq yo'nalish so'zlari (eng kuchli signal).
const ORIENT_PORTRAIT = /(vertical|vertikal|вертикал|tik\s+holat|portrait\s+(orientation|mode|format))/i;
const ORIENT_LANDSCAPE = /(horizontal|gorizontal|горизонтал|landscape\s+(orientation|mode|format)|widescreen|keng\s*format|кенг\s*формат|широкоформат)/i;
// Logo/ikonka — kvadrat.
const SQUARE_ITEMS = /(logo|логотип|лого(?=[\s,.!?]|$)|icon|ikon|иконк|favicon|avatar|аватар|sticker|стикер|profile\s+pic|kvadrat|квадрат|square)/i;
// Odatda vertikal formatlar.
const PORTRAIT_ITEMS =
  /(poster|постер|плакат|afisha|афиша|story|stories|сторис|reels?\b|tiktok|pinterest|phone\s+wallpaper|mobile\s+wallpaper|telefon|телефон|smartfon|смартфон|portrait|portret|портрет|book\s+cover|kitob\s+muqova|китоб\s+муқова|обложк[аиу]\s+(для\s+)?книг)/i;
// Odatda gorizontal formatlar.
const LANDSCAPE_ITEMS =
  /(banner|баннер|landscape|\bwide\b|panoram|панорам|header|шапк|cover\s+(photo|image)|thumbnail|превью|youtube|ютуб|desktop|рабоч\S*\s+стол|wallpaper|обои|fon\s+rasm|\bslide|слайд|presentation|презентац|taqdimot|тақдимот|cinematic|кинематограф)/i;

/**
 * So'rovdan tomonlar nisbatini aniqlaydi (uz/uz-cyrl/ru/en). Tartib: aniq nisbat →
 * aniq yo'nalish so'zi → logo/ikonka (kvadrat) → vertikal formatlar → gorizontal
 * formatlar → kvadrat (sukut).
 */
export function detectAspect(request: string): Aspect {
  const s = request.toLowerCase();
  const r = RATIO.exec(s);
  if (r && KNOWN_RATIOS.has(`${r[1]}:${r[2]}`)) {
    const a = Number(r[1]);
    const b = Number(r[2]);
    if (a === b) return "square";
    return a > b ? "landscape" : "portrait";
  }
  const px = PIXELS.exec(s);
  if (px) {
    const w = Number(px[1]);
    const h = Number(px[2]);
    if (w >= 256 && h >= 256) {
      if (w / h > 1.15) return "landscape";
      if (h / w > 1.15) return "portrait";
      return "square";
    }
  }
  if (ORIENT_PORTRAIT.test(s)) return "portrait";
  if (ORIENT_LANDSCAPE.test(s)) return "landscape";
  if (SQUARE_ITEMS.test(s)) return "square";
  if (PORTRAIT_ITEMS.test(s)) return "portrait";
  if (LANDSCAPE_ITEMS.test(s)) return "landscape";
  return "square";
}

/**
 * Kalitli Pollinations (gen.pollinations.ai): suv belgisi yo'q, sifatli model.
 * `tongyi-mai/z-image-turbo` — hujjatdagi sukut model: tez, fotorealistik, matnni
 * yaxshi yozadi, ~0.004 pollen/rasm. POLLINATIONS_IMAGE_MODEL bilan almashtirish mumkin.
 */
const KEYED_IMAGE_MODELS = [process.env.POLLINATIONS_IMAGE_MODEL || "tongyi-mai/z-image-turbo", "black-forest-labs/flux.2-klein-4b"];

function randomSeed(): number {
  return Math.floor(Math.random() * 2_000_000_000);
}

/** Javobni data URL qiladi (brauzer tashqi domenga so'rov yubormaydi, prompt URL'da qolmaydi). */
async function toDataUrl(res: Response): Promise<string | null> {
  const type = (res.headers.get("content-type") ?? "").split(";")[0].trim();
  // SVG emas — skript yashirishi mumkin; Markdown ham faqat raster data:image'ga ruxsat beradi.
  if (!res.ok || !/^image\/(png|jpe?g|webp|gif)$/i.test(type)) {
    await res.body?.cancel().catch(() => {});
    return null;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1000) return null;
  return `data:${type};base64,${buf.toString("base64")}`;
}

async function pollinationsKeyed(prompt: string, aspect: Aspect, deadline: number): Promise<ImageResult | null> {
  const key = process.env.POLLINATIONS_API_KEY;
  if (!key) return null;
  const { width, height } = ASPECT_SIZE[aspect];
  for (const model of KEYED_IMAGE_MODELS) {
    const timeout = Math.min(60_000, deadline - Date.now());
    if (timeout < 10_000) break;
    try {
      const qs = new URLSearchParams({ model, width: String(width), height: String(height), seed: String(randomSeed()) });
      const res = await fetch(`https://gen.pollinations.ai/image/${encodeURIComponent(prompt.slice(0, 1500))}?${qs}`, {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(timeout),
      });
      if (!res.ok) {
        // Kalit/balans muammosi — faqat status (kalit va provayder matni logga tushmaydi).
        console.warn(`[image] pollinations ${model}: HTTP ${res.status}`);
        await res.body?.cancel().catch(() => {});
        // 401/402/403 — boshqa model ham o'tmaydi, darhol anonim yo'lga.
        if (res.status === 401 || res.status === 402 || res.status === 403) return null;
        continue;
      }
      const url = await toDataUrl(res);
      if (url) return { urls: [url], provider: `pollinations/${model}` };
    } catch {
      /* vaqt tugadi — keyingi model */
    }
  }
  return null;
}

/**
 * Anonim Pollinations (tekin, kalitsiz) — sinovda 3-45 soniya. Hozir server faqat
 * `sana` modelini beradi (model parametri e'tiborsiz), ~0.6 MP gacha kichraytiradi,
 * lekin nisbatni saqlaydi. `enhance=false` — promptni o'zimiz boyitganmiz.
 */
async function pollinationsAnon(prompt: string, aspect: Aspect, deadline: number): Promise<ImageResult | null> {
  const { width, height } = ASPECT_SIZE[aspect];
  for (let attempt = 0; attempt < 2; attempt++) {
    const timeout = Math.min(60_000, deadline - Date.now());
    if (timeout < 10_000) break;
    try {
      const qs = new URLSearchParams({
        width: String(width),
        height: String(height),
        model: "flux",
        nologo: "true",
        enhance: "false",
        private: "true",
        seed: String(randomSeed()),
      });
      const res = await fetch(`https://image.pollinations.ai/prompt/${encodeURIComponent(prompt.slice(0, 1500))}?${qs}`, {
        signal: AbortSignal.timeout(timeout),
      });
      const url = await toDataUrl(res);
      if (url) return { urls: [url], provider: "pollinations/anon" };
    } catch {
      /* vaqt tugadi — yana bir urinish yoki keyingi provayder */
    }
  }
  return null;
}

/**
 * Rasm yaratadi: Pollinations (kalitli, keyin anonim) → OmniRoute AI Horde →
 * OpenRouter Gemini. Data URL'lar qaytaradi; hammasi muvaffaqiyatsiz bo'lsa xato tashlaydi.
 */
export async function generateImage(request: string): Promise<ImageResult> {
  // Route maxDuration 180s — hamma provayderlar shu byudjet ichida.
  const deadline = Date.now() + 165_000;
  const aspect = detectAspect(request);
  const prompt = (await omniImagePrompt(request, "image")) ?? request;
  const viaKeyed = await pollinationsKeyed(prompt, aspect, deadline);
  if (viaKeyed) return viaKeyed;
  const viaPolli = await pollinationsAnon(prompt, aspect, deadline);
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
    signal: AbortSignal.timeout(Math.max(5_000, deadline - Date.now())),
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
