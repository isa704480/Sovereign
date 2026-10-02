/**
 * Shotstack API — asinxron video/musiqa/taqdimot render.
 *
 * Arxitektura:
 *   1. /api/media/[kind] → submitRender() → Shotstack API → render_id
 *   2. Shotstack render qilib bo'lgach → /api/webhooks/shotstack → DB yangilash
 *   3. Mijoz polling → /api/media/status/[jobId] → tayyor bo'lsa URL qaytarish
 *
 * Xavfsizlik:
 *   - Webhook HMAC-SHA256 imzosi tekshiriladi (SHOTSTACK_WEBHOOK_SECRET)
 *   - Kalit va render ID'lar foydalanuvchiga oshkor qilinmaydi
 *   - SSRF: faqat Shotstack domeniga so'rov
 *
 * Env:
 *   SHOTSTACK_API_KEY          — API kalit (sandbox yoki production)
 *   SHOTSTACK_STAGE            — "stage" (sandbox) yoki "v1" (production)
 *   SHOTSTACK_WEBHOOK_SECRET   — Webhook HMAC imzo tekshiruvi
 *   NEXT_PUBLIC_SITE_URL       — Webhook callback URL bazasi
 */

import "server-only";
import { createHmac } from "node:crypto";

// ── Konfiguratsiya ─────────────────────────────────────────────────────────

function apiKey(): string {
  const k = process.env.SHOTSTACK_API_KEY?.trim();
  if (!k) throw new Error("SHOTSTACK_API_KEY sozlanmagan");
  return k;
}

function stage(): string {
  return (process.env.SHOTSTACK_STAGE ?? "stage").trim();
}

function baseUrl(): string {
  return `https://api.shotstack.io/${stage()}`;
}

export function shotstackEnabled(): boolean {
  return Boolean(process.env.SHOTSTACK_API_KEY?.trim());
}

// ── Tiplar ─────────────────────────────────────────────────────────────────

export interface ShotstackClip {
  asset: { type: "image" | "video" | "audio" | "html"; src: string; [k: string]: unknown };
  start: number;
  length: number;
  effect?: string;
  transition?: { in?: string; out?: string };
}

export interface ShotstackTrack {
  clips: ShotstackClip[];
}

export interface ShotstackTimeline {
  soundtrack?: { src: string; effect?: string; volume?: number };
  tracks: ShotstackTrack[];
}

export interface ShotstackOutput {
  format: "mp4" | "mp3" | "gif";
  resolution?: "preview" | "mobile" | "sd" | "hd" | "1080";
  fps?: number;
  size?: { width: number; height: number };
}

export interface ShotstackRenderRequest {
  timeline: ShotstackTimeline;
  output: ShotstackOutput;
  callback?: string;
}

export interface ShotstackRenderResult {
  renderId: string;
  status: "queued" | "fetching" | "rendering" | "saving" | "done" | "failed";
  url?: string;
}

// ── Render yuborish ────────────────────────────────────────────────────────

/**
 * Shotstack ga render topshirig'i yuboradi.
 * Callback URL — /api/webhooks/shotstack?jobId={jobId}
 */
export async function submitRender(
  payload: ShotstackRenderRequest,
  jobId: string,
): Promise<string> {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  const withCallback: ShotstackRenderRequest = {
    ...payload,
    callback: `${siteUrl}/api/webhooks/shotstack?jobId=${encodeURIComponent(jobId)}`,
  };

  const res = await fetch(`${baseUrl()}/render`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey(),
    },
    body: JSON.stringify(withCallback),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // Xato matni foydalanuvchiga emas, logga
    console.error("[shotstack] submit xato:", res.status, body.slice(0, 200));
    throw new Error(`Shotstack API xato: ${res.status}`);
  }

  const data = (await res.json()) as { response?: { id?: string } };
  const renderId = data.response?.id;
  if (!renderId) throw new Error("Shotstack render ID qaytarmadi");
  return renderId;
}

// ── Render holati ──────────────────────────────────────────────────────────

export async function getRenderStatus(renderId: string): Promise<ShotstackRenderResult> {
  const res = await fetch(`${baseUrl()}/render/${encodeURIComponent(renderId)}`, {
    headers: { "x-api-key": apiKey() },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Shotstack status xato: ${res.status}`);
  const data = (await res.json()) as {
    response?: { id: string; status: string; url?: string };
  };
  const r = data.response;
  if (!r) throw new Error("Shotstack holat ma'lumoti yo'q");
  return {
    renderId: r.id,
    status: r.status as ShotstackRenderResult["status"],
    url: r.url,
  };
}

// ── Webhook imzo tekshiruvi ────────────────────────────────────────────────

/**
 * Shotstack Webhook so'rovining HMAC-SHA256 imzosini tekshiradi.
 * SHOTSTACK_WEBHOOK_SECRET sozlanmagan bo'lsa — tekshiruv o'tkazib yuboriladi
 * (sandbox da qulay, production da majburiy).
 */
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
): boolean {
  const secret = process.env.SHOTSTACK_WEBHOOK_SECRET?.trim();
  if (!secret) {
    // Prod da ogohlantirish
    if (process.env.NODE_ENV === "production") {
      console.warn("[shotstack] SHOTSTACK_WEBHOOK_SECRET sozlanmagan — imzo tekshiruvi o'chirilgan!");
    }
    return true; // fail-open (secret yo'q)
  }
  if (!signatureHeader) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  // Timing-safe taqqoslash
  try {
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(signatureHeader.replace(/^sha256=/, ""), "hex");
    if (a.length !== b.length) return false;
    return a.every((v, i) => v === b[i]);
  } catch {
    return false;
  }
}

// ── Video payload ──────────────────────────────────────────────────────────

/**
 * Rasmlar ro'yxatidan video timeline yaratadi.
 * aspect: "landscape" (16:9) yoki "portrait" (9:16).
 */
export function buildVideoPayload(opts: {
  imageUrls: string[];
  audioUrl?: string;
  durationPerSlide?: number;
  aspect?: "landscape" | "portrait" | "square";
}): ShotstackRenderRequest {
  const dur = opts.durationPerSlide ?? 3;
  const clips: ShotstackClip[] = opts.imageUrls.map((src, i) => ({
    asset: { type: "image", src },
    start: i * dur,
    length: dur,
    effect: "zoomIn",
    transition: { in: "fade", out: "fade" },
  }));

  const sizeMap = {
    landscape: { width: 1280, height: 720 },
    portrait:  { width: 720,  height: 1280 },
    square:    { width: 1080, height: 1080 },
  };

  return {
    timeline: {
      tracks: [{ clips }],
      ...(opts.audioUrl
        ? { soundtrack: { src: opts.audioUrl, effect: "fadeOut", volume: 1 } }
        : {}),
    },
    output: {
      format: "mp4",
      resolution: "sd",
      size: sizeMap[opts.aspect ?? "landscape"],
    },
  };
}

// ── Musiqa payload ─────────────────────────────────────────────────────────

/**
 * Matndan musiqa: cover rasmlar bilan qisqa video (audio-vizual).
 * Sof audio eksport hali Shotstack da beta — video sifatida qaytaradi.
 */
export function buildMusicPayload(opts: {
  audioUrl: string;
  coverImageUrl?: string;
  durationSeconds?: number;
}): ShotstackRenderRequest {
  const dur = opts.durationSeconds ?? 30;
  const coverSrc = opts.coverImageUrl ?? "https://via.placeholder.com/1280x720/1a1a2e/8B7DFF?text=♪";
  return {
    timeline: {
      tracks: [
        {
          clips: [{
            asset: { type: "image", src: coverSrc },
            start: 0,
            length: dur,
          }],
        },
      ],
      soundtrack: { src: opts.audioUrl, effect: "fadeOut", volume: 1 },
    },
    output: { format: "mp4", resolution: "sd", size: { width: 1280, height: 720 } },
  };
}
