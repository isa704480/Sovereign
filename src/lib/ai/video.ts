import "server-only";
import { detectAspect } from "@/lib/ai/image";
import { omniImagePrompt } from "@/lib/ai/omniroute-media";

/**
 * Video generatsiya — Pollinations (gen.pollinations.ai) `GET /video/{prompt}`.
 * API sinxron: javob tayyor MP4 (navbat/polling yo'q). Javobdagi `Link: <...>;
 * rel="enclosure"` — media.pollinations.ai dagi ochiq fayl (30 kun saqlanadi).
 * Faqat POLLINATIONS_API_KEY bo'lsa yoqiladi (pullik: pollen).
 */

/**
 * Tejamkor modellar: `alibaba/wan-2.2-fast` — 0.01 pollen/s (5 s = 0.05 pollen,
 * 480p, ovozsiz); zaxira `prunaai/p-video` — 0.02 pollen/s (720p). Ikkalasi ham
 * "paid_only" (Paid Pollen balansi kerak). POLLINATIONS_VIDEO_MODEL bilan almashtirish mumkin.
 */
const VIDEO_MODELS = [process.env.POLLINATIONS_VIDEO_MODEL || "alibaba/wan-2.2-fast", "prunaai/p-video"];
const DURATION_S = 5;
/** Link sarlavhasi bo'lmasa — data URL faqat shu hajmgacha (Vercel javob limiti 4.5 MB, base64 +33%). */
const MAX_INLINE_BYTES = 2_500_000;

/** Faqat shu ko'rinishdagi URL'lar chatda <video> sifatida ko'rsatiladi (Markdown.tsx bilan bir xil). */
export const PROVIDER_VIDEO_URL = /^https:\/\/media\.pollinations\.ai\/[A-Za-z0-9_-]{8,128}$/;

export function videoEnabled(): boolean {
  return Boolean(process.env.POLLINATIONS_API_KEY);
}

export type VideoErrorCode = "disabled" | "blocked" | "busy" | "failed";

/** Foydalanuvchiga tarjima qilingan xabar ko'rsatish uchun kod (provayder matni emas). */
export class VideoError extends Error {
  readonly code: VideoErrorCode;
  constructor(code: VideoErrorCode, detail: string) {
    super(detail);
    this.name = "VideoError";
    this.code = code;
  }
}

export interface VideoResult {
  url: string;
  provider: string;
}

function enclosureUrl(link: string | null): string | null {
  if (!link) return null;
  for (const part of link.split(",")) {
    const m = /<([^>]+)>\s*;\s*rel="?enclosure"?/i.exec(part.trim());
    if (m && PROVIDER_VIDEO_URL.test(m[1])) return m[1];
  }
  return null;
}

/** Xato javobidan faqat `error.code` ni oladi (xom matn foydalanuvchiga chiqmaydi). */
async function errorCode(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: { code?: unknown } };
    return typeof j.error?.code === "string" ? j.error.code : "";
  } catch {
    return "";
  }
}

/**
 * ~5 soniyalik video yaratadi. `deadlineMs` — route maxDuration ichidagi byudjet.
 * Xatoda VideoError tashlaydi.
 */
export async function generateVideo(request: string, deadlineMs = 280_000): Promise<VideoResult> {
  const key = process.env.POLLINATIONS_API_KEY;
  if (!key) throw new VideoError("disabled", "POLLINATIONS_API_KEY yo'q");
  const deadline = Date.now() + deadlineMs;
  const aspectRatio = detectAspect(request) === "portrait" ? "9:16" : "16:9";
  const prompt = (await omniImagePrompt(request, "video")) ?? request;

  let lastCode: VideoErrorCode = "failed";
  for (const model of VIDEO_MODELS) {
    const timeout = Math.min(240_000, deadline - Date.now());
    if (timeout < 30_000) break;
    try {
      const qs = new URLSearchParams({ model, duration: String(DURATION_S), aspectRatio });
      const res = await fetch(`https://gen.pollinations.ai/video/${encodeURIComponent(prompt.slice(0, 1500))}?${qs}`, {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(timeout),
      });
      if (!res.ok) {
        const code = await errorCode(res);
        // Faqat status va kod — kalit/prompt/provayder matni logga tushmaydi.
        console.warn(`[video] pollinations ${model}: HTTP ${res.status} ${code}`);
        if (res.status === 400 && code === "content_blocked") throw new VideoError("blocked", code);
        if (res.status === 401 || res.status === 402 || res.status === 403) {
          // Kalit/balans muammosi — boshqa model ham o'tmaydi.
          throw new VideoError("failed", `HTTP ${res.status} ${code}`);
        }
        lastCode = res.status === 429 ? "busy" : "failed";
        continue;
      }
      const type = (res.headers.get("content-type") ?? "").split(";")[0].trim();
      if (!type.startsWith("video/")) {
        await res.body?.cancel().catch(() => {});
        continue;
      }
      const stored = enclosureUrl(res.headers.get("link"));
      if (stored) {
        // Fayl allaqachon provayder xotirasida — tanani yuklab o'tirmaymiz.
        await res.body?.cancel().catch(() => {});
        return { url: stored, provider: `pollinations/${model}` };
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 1000 || buf.length > MAX_INLINE_BYTES) continue;
      return { url: `data:video/mp4;base64,${buf.toString("base64")}`, provider: `pollinations/${model}` };
    } catch (e) {
      if (e instanceof VideoError) throw e;
      /* vaqt tugadi / tarmoq — keyingi model */
    }
  }
  throw new VideoError(lastCode, "barcha video modellari muvaffaqiyatsiz");
}
