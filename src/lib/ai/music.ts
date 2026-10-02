import "server-only";
import { omniImagePrompt } from "@/lib/ai/omniroute-media";
import { hostAllowedIn } from "@/lib/ai/region";

/**
 * Musiqa generatsiya — Pollinations (gen.pollinations.ai) `/music/{prompt}`.
 *
 * Modellar (eng arzondan kuchligiga, foydalanuvchiga ko'rsatilmaydi):
 *   1. musicgen-small    — ~0.005 pollen/s  (tez, 8 soniya)
 *   2. musicgen-medium   — ~0.008 pollen/s  (muvozanatli)
 *   3. suno-v4           — ~0.012 pollen/s  (sifatli, qo'shiqlar uchun)
 *
 * Env:
 *   POLLINATIONS_API_KEY        — musiqa uchun ham shu kalit (rasm/video bilan bir xil)
 *   POLLINATIONS_MUSIC_MODEL    — ixtiyoriy override (standart: musicgen-small)
 *   POLLINATIONS_MUSIC_DURATION — soniyalar soni (standart: 8, maksimal: 30)
 */

export interface MusicResult {
  /** data:audio/mp3;base64,... yoki provider URL */
  url: string;
  provider: string;
  /** soniyalar */
  duration: number;
}

export type MusicErrorCode = "disabled" | "blocked" | "busy" | "failed";

export class MusicError extends Error {
  readonly code: MusicErrorCode;
  constructor(code: MusicErrorCode, detail: string) {
    super(detail);
    this.name = "MusicError";
    this.code = code;
  }
}

/** Faqat POLLINATIONS_API_KEY bo'lsa yoqilgan. */
export function musicEnabled(): boolean {
  return Boolean(process.env.POLLINATIONS_API_KEY);
}

// Eng arzondan qimmatga — avtomatik fallback
const MUSIC_MODELS = [
  process.env.POLLINATIONS_MUSIC_MODEL ?? "musicgen-small",
  "musicgen-medium",
  "suno-v4",
];

function musicDuration(): number {
  const v = parseInt(process.env.POLLINATIONS_MUSIC_DURATION ?? "8", 10);
  return Number.isFinite(v) && v >= 3 && v <= 30 ? v : 8;
}

/**
 * Audio response'ni data URL yoki provayder URL sifatida qaytaradi.
 * Foydalanuvchi qaysi model ishlatilganini ko'rmaydi.
 */
export async function generateMusic(
  request: string,
  deadlineMs = 120_000,
  opts: { country?: string | null } = {},
): Promise<MusicResult> {
  const key = process.env.POLLINATIONS_API_KEY;
  if (!key) throw new MusicError("disabled", "POLLINATIONS_API_KEY yo'q");
  if (!hostAllowedIn("pollinations", opts.country)) {
    throw new MusicError("disabled", "musiqa provayderi mintaqada yopiq");
  }

  const deadline = Date.now() + deadlineMs;
  const duration = musicDuration();

  // Promptni yaxshilash (OmniRoute orqali, agar sozlangan bo'lsa)
  const rawPrompt = request.slice(0, 500);
  const prompt = (await omniImagePrompt(rawPrompt, "image", opts.country).catch(() => null)) ?? rawPrompt;

  let lastCode: MusicErrorCode = "failed";

  for (const model of MUSIC_MODELS) {
    const timeout = Math.min(90_000, deadline - Date.now());
    if (timeout < 10_000) break;

    try {
      const qs = new URLSearchParams({
        model,
        duration: String(duration),
        seed: String(Math.floor(Math.random() * 2_000_000_000)),
      });

      const res = await fetch(
        `https://gen.pollinations.ai/music/${encodeURIComponent(prompt)}?${qs}`,
        {
          headers: { Authorization: `Bearer ${key}` },
          signal: AbortSignal.timeout(timeout),
        },
      );

      if (!res.ok) {
        console.warn(`[music] ${model}: HTTP ${res.status}`);
        if (res.status === 401 || res.status === 402 || res.status === 403) {
          throw new MusicError("failed", `HTTP ${res.status}`);
        }
        if (res.status === 400) throw new MusicError("blocked", "content_blocked");
        lastCode = res.status === 429 ? "busy" : "failed";
        await res.body?.cancel().catch(() => {});
        continue;
      }

      const type = (res.headers.get("content-type") ?? "").split(";")[0].trim();
      if (!type.startsWith("audio/")) {
        await res.body?.cancel().catch(() => {});
        lastCode = "failed";
        continue;
      }

      // Link sarlavhasidan provayder URL (saqlanган fayl)
      const link = res.headers.get("link");
      if (link) {
        const m = /<([^>]+)>\s*;\s*rel="?enclosure"?/i.exec(link);
        if (m?.[1]) {
          await res.body?.cancel().catch(() => {});
          return { url: m[1], provider: "pollinations", duration };
        }
      }

      // Inline data URL (kichik fayllar)
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 500) { lastCode = "failed"; continue; }

      const ext = type.includes("mpeg") ? "mp3" : type.includes("ogg") ? "ogg" : "wav";
      return {
        url: `data:${type};base64,${buf.toString("base64")}`,
        provider: "pollinations",
        duration,
      };
    } catch (e) {
      if (e instanceof MusicError) throw e;
      // tarmoq xatosi / timeout — keyingi model
      lastCode = "failed";
    }
  }

  throw new MusicError(lastCode, "barcha musiqa modellari muvaffaqiyatsiz");
}
