import "server-only";
import { omniTranscribe } from "@/lib/ai/omniroute-media";
import { modelAllowedIn } from "@/lib/ai/region";

const WHISPER = "https://api.openai.com/v1/audio/transcriptions";

/**
 * Transcribes an audio/video file using OpenAI Whisper (via a direct OpenAI
 * key). Returns plain text. Whisper accepts up to 25 MB and most common
 * container formats (mp3, m4a, wav, mp4, webm, ogg, ...).
 */
export async function transcribe(
  file: Blob,
  filename: string,
  language = "uz",
  opts: { country?: string | null } = {},
): Promise<string> {
  // Avval OmniRoute orqali Groq Whisper (tekin, tez); bo'lmasa OpenAI Whisper.
  const viaOmni = await omniTranscribe(file, filename, language);
  if (viaOmni !== null) return viaOmni;
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("Transkripsiya provayderi yo'q");
  // Mintaqa siyosati (region.ts): OpenAI bu mintaqaga xizmat ko'rsatmasa — Whisper API chaqirilmaydi.
  if (!modelAllowedIn("openai/whisper-1", opts.country)) throw new Error("Transkripsiya provayderi mintaqada yopiq");
  const form = new FormData();
  form.append("file", file, filename);
  form.append("model", "whisper-1");
  form.append("language", language);
  form.append("response_format", "text");
  const res = await fetch(WHISPER, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  if (!res.ok) {
    let msg = `Whisper ${res.status}`;
    try {
      const j = (await res.json()) as { error?: { message?: string } };
      msg = j.error?.message ?? msg;
    } catch {
      /* keep */
    }
    throw new Error(msg);
  }
  return (await res.text()).trim();
}
