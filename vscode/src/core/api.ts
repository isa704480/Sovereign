/**
 * SOVEREIGN server mijozi — `/api/cli/*` va `/api/models`.
 * `vscode` ga bog'liq emas (global `fetch`, Node 20+ / VS Code 1.85+).
 *
 * Xavfsizlik:
 *  - manzil har chaqiruvda `sanitizeBaseUrl` dan o'tadi (faqat https yoki http://localhost);
 *  - token faqat `Authorization` sarlavhasida ketadi — URL'ga, so'rov tanasiga yoki
 *    jurnalga hech qachon tushmaydi;
 *  - xato matni serverdan keladi (ishonchsiz) — faqat qisqartirilgan holda ko'rsatiladi.
 */
import { apiUrl } from "./url";

export type ApiErrorKind = "network" | "unauthorized" | "rate" | "server" | "bad";

export class ApiError extends Error {
  constructor(
    readonly kind: ApiErrorKind,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Serverdan kelgan xato matni — ishonchsiz: uzunligi va boshqaruv belgilari cheklanadi. */
function cleanServerMessage(v: unknown): string {
  if (typeof v !== "string") return "";
  return v.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 300);
}

function kindOf(status: number): ApiErrorKind {
  if (status === 401 || status === 403) return "unauthorized";
  if (status === 429) return "rate";
  if (status === 400 || status === 413) return "bad";
  return "server";
}

async function request(
  url: string,
  init: RequestInit & { token?: string; lang?: string },
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.token) headers.set("Authorization", `Bearer ${init.token}`);
  if (init.lang) headers.set("X-Sov-Lang", init.lang);
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw e;
    throw new ApiError("network", 0, e instanceof Error ? e.message : "network error");
  }
  if (!res.ok) {
    let msg = "";
    try {
      const body = (await res.json()) as { error?: unknown };
      msg = cleanServerMessage(body?.error);
    } catch {
      /* JSON emas */
    }
    throw new ApiError(kindOf(res.status), res.status, msg);
  }
  return res;
}

/* ───────────────────────── Device login ───────────────────────── */

export interface DeviceStart {
  code: string;
  url: string;
}

export async function startDeviceLogin(base: string, device: string, lang: string): Promise<DeviceStart> {
  const res = await request(apiUrl(base, "/api/cli/start"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ device: device.slice(0, 80) }),
    lang,
  });
  const data = (await res.json()) as { code?: unknown; url?: unknown };
  const code = typeof data.code === "string" ? data.code : "";
  const url = typeof data.url === "string" ? data.url : "";
  // Server qaytargan sahifa manzili ham tekshiriladi: faqat https (yoki localhost) va
  // biz so'ragan xost — brauzer boshqa saytga ochilib ketmasin.
  if (!/^[0-9a-f]{10,80}$/i.test(code) || !sameOrigin(url, base)) {
    throw new ApiError("server", 200, "bad start response");
  }
  return { code, url };
}

export function sameOrigin(candidate: string, base: string): boolean {
  try {
    const a = new URL(candidate);
    const b = new URL(apiUrl(base, "/"));
    if (a.protocol !== "https:" && !(a.protocol === "http:" && a.hostname === "localhost")) return false;
    // `api.soveregn.xyz` → `soveregn.xyz` yo'naltirishiga ham ruxsat: registrable qism bir xil.
    return a.hostname === b.hostname || a.hostname.endsWith(`.${b.hostname}`) || b.hostname.endsWith(`.${a.hostname}`);
  } catch {
    return false;
  }
}

export type PollResult = { status: "pending" } | { status: "expired" } | { status: "approved"; token: string };

export async function pollDeviceLogin(base: string, code: string, signal?: AbortSignal): Promise<PollResult> {
  const res = await request(apiUrl(base, `/api/cli/poll?code=${encodeURIComponent(code)}`), { signal });
  const data = (await res.json()) as { status?: unknown; token?: unknown };
  if (data.status === "approved" && typeof data.token === "string") return { status: "approved", token: data.token };
  if (data.status === "expired") return { status: "expired" };
  return { status: "pending" };
}

/* ───────────────────────── Hisob ma'lumoti ───────────────────────── */

export interface Me {
  email: string;
  plan: string;
  defaultModel: string;
}

export async function fetchMe(base: string, token: string, lang: string): Promise<Me> {
  const res = await request(apiUrl(base, "/api/cli/me"), { token, lang });
  const data = (await res.json()) as Record<string, unknown>;
  return {
    email: typeof data.email === "string" ? data.email.slice(0, 320) : "",
    plan: typeof data.plan === "string" ? data.plan.slice(0, 32) : "free",
    defaultModel: typeof data.default_model === "string" ? data.default_model.slice(0, 120) : "",
  };
}

/* ───────────────────────── Modellar katalogi ───────────────────────── */

export interface CatalogModel {
  id: string;
  label: string;
  note?: string;
}

const MODEL_ID = /^[\w./:@-]{1,120}$/;

export async function fetchModels(base: string, query: string, lang: string, signal?: AbortSignal): Promise<CatalogModel[]> {
  const q = encodeURIComponent(query.slice(0, 60));
  const res = await request(apiUrl(base, `/api/models?q=${q}&limit=60`), { lang, signal });
  const data = (await res.json()) as { models?: unknown; featured?: unknown };
  const list = Array.isArray(data.models) ? data.models : Array.isArray(data.featured) ? data.featured : [];
  const out: CatalogModel[] = [];
  for (const raw of list) {
    if (typeof raw !== "object" || raw === null) continue;
    const m = raw as Record<string, unknown>;
    const id = typeof m.id === "string" ? m.id : "";
    if (!MODEL_ID.test(id)) continue;
    out.push({
      id,
      label: typeof m.label === "string" ? m.label.slice(0, 80) : id,
      note: typeof m.note === "string" ? m.note.slice(0, 120) : undefined,
    });
    if (out.length >= 60) break;
  }
  return out;
}

export async function fetchFeaturedModels(base: string, lang: string, signal?: AbortSignal): Promise<CatalogModel[]> {
  const res = await request(apiUrl(base, "/api/models?featured=1"), { lang, signal });
  const data = (await res.json()) as { featured?: unknown };
  const list = Array.isArray(data.featured) ? data.featured : [];
  const out: CatalogModel[] = [];
  for (const raw of list) {
    if (typeof raw !== "object" || raw === null) continue;
    const m = raw as Record<string, unknown>;
    const id = typeof m.id === "string" ? m.id : "";
    if (!MODEL_ID.test(id)) continue;
    out.push({ id, label: typeof m.label === "string" ? m.label.slice(0, 80) : id, note: typeof m.note === "string" ? m.note.slice(0, 120) : undefined });
  }
  return out;
}

/* ───────────────────────── Suhbat ───────────────────────── */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatResult {
  text: string;
  model: string;
}

/**
 * `/api/cli/chat` — hozircha bitta JSON javob qaytaradi (SSE emas). Shunga qaramay
 * `onDelta` interfeysi oqim uchun yozilgan: server `text/event-stream` bera boshlasa,
 * bo'laklar kelishi bilan uzatiladi; aks holda tayyor javob bo'laklarga bo'lib beriladi,
 * shunda panel bir xil ishlaydi.
 */
export async function chat(
  base: string,
  token: string,
  messages: ChatMessage[],
  model: string,
  lang: string,
  onDelta: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<ChatResult> {
  const body: Record<string, unknown> = { messages };
  if (model && model !== "auto" && MODEL_ID.test(model)) body.model = model;

  const res = await request(apiUrl(base, "/api/cli/chat"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    token,
    lang,
    signal,
  });

  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("text/event-stream") && res.body) {
    return streamSse(res.body, onDelta);
  }

  const data = (await res.json()) as { message?: unknown; model?: unknown };
  const text = messageText(data.message);
  const modelName = typeof data.model === "string" ? data.model.slice(0, 120) : "";
  const chunks = chunkText(text);
  // Tayyor javobni sekin-asta uzatamiz, lekin umumiy kechikish PACE_BUDGET_MS dan oshmaydi.
  const pause = chunks.length ? Math.min(14, Math.floor(PACE_BUDGET_MS / chunks.length)) : 0;
  for (const chunk of chunks) {
    if (signal?.aborted) break;
    onDelta(chunk);
    if (pause > 0) await sleep(pause);
  }
  return { text, model: modelName };
}

function messageText(message: unknown): string {
  if (typeof message !== "object" || message === null) return "";
  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((p) => (typeof p === "object" && p !== null && typeof (p as { text?: unknown }).text === "string" ? (p as { text: string }).text : ""))
      .join("");
  }
  return "";
}

/** Oqim taqlidi uchun umumiy kechikish byudjeti (ms) — javob kechikib qolmasin. */
const PACE_BUDGET_MS = 900;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Tayyor matnni bo'laklarga bo'lish — panelda javob oqim kabi ko'rinadi. */
export function chunkText(text: string, size = 180): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}

async function streamSse(body: ReadableStream<Uint8Array>, onDelta: (chunk: string) => void): Promise<ChatResult> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let model = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const json = JSON.parse(payload) as Record<string, unknown>;
        if (typeof json.model === "string" && !model) model = json.model.slice(0, 120);
        const choices = json.choices;
        const first = Array.isArray(choices) ? (choices[0] as Record<string, unknown> | undefined) : undefined;
        const delta = first?.delta as { content?: unknown } | undefined;
        const piece = typeof delta?.content === "string" ? delta.content : "";
        if (piece) {
          text += piece;
          onDelta(piece);
        }
      } catch {
        /* to'liq bo'lmagan bo'lak — tashlab ketamiz */
      }
    }
  }
  return { text, model };
}
