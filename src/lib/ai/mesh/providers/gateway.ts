import type { ChatBody, ClassifiedError, ModelOffer, ProviderAdapter } from "../types";

/**
 * Gateway adapteri — operator sozlagan istalgan OpenAI-mos shlyuz (GATEWAY_BASE_URL +
 * GATEWAY_API_KEY, model: GATEWAY_MODEL ?? "auto"). providers.ts `fallbackTargets()` dagi
 * "gateway" zaxirasining aynan nusxasi: faqat oxirgi chora (rescue), xabarlar faqat matn,
 * max_tokens ≤ 2048, stream: true. Ichida o'zi boshqa modelga yo'naltirishi mumkin (aggregator) —
 * haqiqiy model javob bo'lagidagi `model` maydonidan olinadi.
 *
 * Shu faylda umumiy OpenAI-mos xato tasniflagichi ham bor (`classifyOpenAiCompat`) — RSI va
 * Experiential adapterlari uni qayta ishlatadi (docs/MESH.md §2.1 jadvali).
 */

/* ------------------------------------------------------------------ */
/* Umumiy yordamchilar (RSI / Experiential ham ishlatadi)               */
/* ------------------------------------------------------------------ */

/** Oxiridagi "/" siz bazaviy URL + "/chat/completions" (providers.ts bilan bir xil). */
export function chatCompletionsUrl(base: string): string {
  return `${base.replace(/\/$/, "")}/chat/completions`;
}

/** Xabar mazmuni → oddiy matn (providers.ts textOf nusxasi: multimodal qismlardan faqat text). */
export function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return content == null ? "" : String(content);
  return content
    .map((p) => (p && typeof p === "object" && "text" in p ? String((p as { text?: unknown }).text ?? "") : ""))
    .join(" ");
}

/** SSE bo'lagi yoki JSON javobdagi `model` maydoni (qisqa, toza satr) — providers.ts reportedModel. */
export function reportedModel(chunkOrJson: unknown): string | null {
  if (!chunkOrJson || typeof chunkOrJson !== "object") return null;
  const m = (chunkOrJson as { model?: unknown }).model;
  return typeof m === "string" && m.trim() ? m.trim().slice(0, 120) : null;
}

/**
 * Davomiylik satri → ms. OpenAI uslubi ("1s", "6m0s", "20ms", "1h2m3.5s") yoki oddiy son
 * (sekund). Tushunarsiz bo'lsa — null.
 */
export function parseDurationMs(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(Number(s) * 1000);
  const re = /(\d+(?:\.\d+)?)(ms|h|m|s)/g;
  let total = 0;
  let matched = "";
  for (let m = re.exec(s); m; m = re.exec(s)) {
    const n = Number(m[1]);
    total += m[2] === "ms" ? n : m[2] === "s" ? n * 1000 : m[2] === "m" ? n * 60_000 : n * 3_600_000;
    matched += m[0];
  }
  return matched === s ? Math.round(total) : null;
}

/**
 * Qayta urinish vaqti (ms) sarlavhalardan: retry-after-ms, retry-after (sekund yoki HTTP sana),
 * x-ratelimit-reset-requests / -tokens (davomiylik), x-ratelimit-reset (epoch sekund/ms yoki
 * delta sekund). Bir nechta bo'lsa — eng kattasi (ikkala limit ham tiklanishi kerak).
 */
export function retryAfterFromHeaders(headers: Headers, now: number): number | undefined {
  const out: number[] = [];
  const ms = Number(headers.get("retry-after-ms"));
  if (Number.isFinite(ms) && ms > 0) out.push(ms);
  const ra = headers.get("retry-after");
  if (ra) {
    const secs = Number(ra.trim());
    if (Number.isFinite(secs)) out.push(Math.max(0, secs * 1000));
    else {
      const at = Date.parse(ra);
      if (Number.isFinite(at)) out.push(Math.max(0, at - now));
    }
  }
  for (const h of ["x-ratelimit-reset-requests", "x-ratelimit-reset-tokens"]) {
    const d = parseDurationMs(headers.get(h));
    if (d != null) out.push(d);
  }
  const reset = headers.get("x-ratelimit-reset");
  if (reset) {
    const n = Number(reset.trim());
    if (Number.isFinite(n)) {
      // Epoch ms (> 1e12), epoch sekund (> 1e9) yoki delta sekund.
      const d = n > 1e12 ? n - now : n > 1e9 ? n * 1000 - now : n * 1000;
      if (d >= 0) out.push(d);
    } else {
      const d = parseDurationMs(reset);
      if (d != null) out.push(d);
    }
  }
  const valid = out.filter((v) => Number.isFinite(v) && v >= 0);
  return valid.length ? Math.round(Math.max(...valid)) : undefined;
}

/** Tanadagi xato: { error: { message, code, type } } yoki { message } yoki oddiy matn. */
export function parseErrorBody(body: string): { message: string; code?: string; type?: string; numericCode?: number } {
  const raw = (body ?? "").trim();
  try {
    const j = JSON.parse(raw) as { error?: unknown; message?: unknown; code?: unknown; type?: unknown };
    const e = j && typeof j.error === "object" && j.error ? (j.error as Record<string, unknown>) : null;
    const msg = e?.message ?? (typeof j.error === "string" ? j.error : undefined) ?? j.message;
    const code = e?.code ?? j.code;
    const type = e?.type ?? j.type;
    const numeric = typeof code === "number" ? code : typeof code === "string" && /^\d{3}$/.test(code) ? Number(code) : undefined;
    return {
      message: typeof msg === "string" && msg ? msg : raw,
      code: code == null ? undefined : String(code),
      type: typeof type === "string" ? type : undefined,
      numericCode: numeric,
    };
  } catch {
    return { message: raw };
  }
}

const CONTEXT_RE = /context[_ ]length|context window|maximum context|too many tokens|prompt is too long|input is too long|reduce the length|string_above_max_length/i;
/**
 * Kredit/balans tugagan. Oddiy "billing" so'zi YO'Q: OpenAI RPM 429 xabari ham "add a payment
 * method ... /account/billing" deydi — u rate_limited, no_credit emas.
 */
const CREDIT_RE = /can only afford|insufficient[_ ](funds|balance|credits?|quota)|requires more credits|out of credits|no credits|credits? (exhausted|depleted)|credit balance|balance (is )?(too low|insufficient)|payment required|exceeded your current quota/i;
const DAILY_RE = /per[_ ]day|daily|\brpd\b|\btpd\b|requests per day|tokens per day/i;
const AUTH_RE = /invalid[_ ]api[_ ]key|incorrect api key|invalid[_ ]key|unauthori[sz]ed|authentication|api key (is )?(missing|invalid|expired|revoked)/i;
const MISSING_MODEL_RE = /model[_ ]not[_ ]found|model .{0,80}(does not exist|not found|not available|not supported)|no such model|unknown model|decommissioned|deprecated model|invalid model/i;

/**
 * Umumiy OpenAI-mos xato tasniflagichi (docs/MESH.md §2.1). `now` — test uchun (standart Date.now()).
 * Status 200 + xato tanasi (oqim ichidagi xato) — tanadagi 3 xonali `code` bo'lsa shu status
 * deb olinadi, aks holda provayder tomonidagi uzilish (transient).
 */
export function classifyOpenAiCompat(status: number, body: string, headers: Headers, now = Date.now()): ClassifiedError {
  const parsed = parseErrorBody(body);
  const message = parsed.message.slice(0, 500);
  const text = `${parsed.code ?? ""} ${parsed.type ?? ""} ${parsed.message}`;
  const st = status >= 200 && status < 300 ? (parsed.numericCode ?? 500) : status;
  const retryAfterMs = retryAfterFromHeaders(headers, now);

  if (st === 0) return { kind: "transient", message };
  const clientSide = st >= 400 && st < 500;
  if (st === 413 || (clientSide && CONTEXT_RE.test(text))) return { kind: "context_length", message };

  const afford = /can only afford (\d+)/i.exec(parsed.message);
  if (st === 402 || CREDIT_RE.test(text)) {
    return {
      kind: "no_credit",
      ...(afford ? { affordTokens: Number(afford[1]) } : {}),
      ...(retryAfterMs != null ? { resetAt: now + retryAfterMs } : {}),
      message,
    };
  }
  if (st === 429) {
    if (DAILY_RE.test(text)) {
      return { kind: "quota_exhausted", ...(retryAfterMs != null ? { resetAt: now + retryAfterMs, retryAfterMs } : {}), message };
    }
    return { kind: "rate_limited", ...(retryAfterMs != null ? { retryAfterMs } : {}), message };
  }
  // Matn qoidalari faqat 4xx da: 5xx "model temporarily not available" — vaqtinchalik.
  if (st === 404 || (clientSide && MISSING_MODEL_RE.test(text))) return { kind: "unavailable", scope: "model", message };
  if (st === 401 || st === 403 || (clientSide && AUTH_RE.test(text))) return { kind: "auth", message };
  if (st === 408 || st === 409 || st === 425 || st === 499 || st >= 500) {
    return { kind: "transient", ...(retryAfterMs != null ? { retryAfterMs } : {}), message };
  }
  return { kind: "bad_request", message };
}

/**
 * Rescue shlyuzlar uchun tana (providers.ts streamFreeFallback bilan bir xil): faqat role +
 * matnli content, max_tokens ≤ 2048, vositalar yo'q.
 */
export function plainRescueBody(body: ChatBody, model: string): ChatBody {
  const { tools: _tools, tool_choice: _toolChoice, ...rest } = body;
  void _tools;
  void _toolChoice;
  const messages = (body.messages ?? []).map((m) => {
    const msg = (m ?? {}) as { role?: unknown; content?: unknown };
    return { role: msg.role, content: textOf(msg.content) };
  });
  return {
    ...rest,
    model,
    messages,
    ...(typeof body.max_tokens === "number" ? { max_tokens: Math.min(body.max_tokens, 2048) } : { max_tokens: 2048 }),
  };
}

/* ------------------------------------------------------------------ */
/* Adapter                                                             */
/* ------------------------------------------------------------------ */

function gatewayModel(): string {
  return process.env.GATEWAY_MODEL ?? "auto";
}

export const gatewayAdapter: ProviderAdapter = {
  id: "gateway",
  host: "gateway",
  enabled: () => !!(process.env.GATEWAY_BASE_URL && process.env.GATEWAY_API_KEY),
  endpoint: () => ({
    url: chatCompletionsUrl(process.env.GATEWAY_BASE_URL ?? ""),
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GATEWAY_API_KEY ?? ""}` },
  }),
  /**
   * Bitta taklif — sozlangan model (standart "auto"). Qaysi model ekanini bilmaymiz, shuning
   * uchun hech qaysi katalog modelining "aynan o'zi" emas (sovereignIds bo'sh) — faqat sinf
   * bo'yicha oxirgi chora. Tekin tarifga ham ochiq (hozirgi fallbackTargets kabi).
   */
  get offers(): ModelOffer[] {
    return [
      {
        sovereignIds: [],
        wire: gatewayModel(),
        class: "free",
        cost: "cheap",
        minTier: "free",
        caps: { stream: true, tools: false, vision: false, json: false },
      },
    ];
  },
  limits: {
    source: "codebase: providers.ts fallbackTargets — operator sozlagan OpenAI-mos shlyuz, hujjatlangan limit yo'q (2026-09-27)",
  },
  classifyError: (status, body, headers) => classifyOpenAiCompat(status, body, headers),
  transformBody: (body, offer) => plainRescueBody(body, offer.wire),
  readServedModel: reportedModel,
  rescue: true,
  aggregator: true,
};
