import type { ChatBody, ClassifiedError, ModelOffer, ProviderAdapter } from "../types";
import { classifyOpenAiCompat, parseErrorBody, reportedModel, retryAfterFromHeaders, textOf } from "./gateway";

/**
 * Experiential Labs adapteri — zero-markup OpenAI-mos shlyuz (platform.experientiallabs.ai).
 * providers.ts `fallbackTargets()` dagi "experiential" zaxirasining nusxasi: EXPERIENTIAL_API_KEY,
 * https://api.experientiallabs.ai/v1/chat/completions, model EXPERIENTIAL_MODEL ?? "claude-3-haiku",
 * max_tokens ≤ 2048, stream: true. Faqat oxirgi chora (rescue).
 *
 * Hujjat (2026-09-27): /docs/openai-compatibility — streaming, tools, response_format (json_object /
 * json_schema) qo'llanadi; rasm kiritish hujjatlanmagan. /docs/errors — xato kodlari (pastda).
 */

const EXPERIENTIAL_URL = "https://api.experientiallabs.ai/v1/chat/completions";

function experientialModel(): string {
  return process.env.EXPERIENTIAL_MODEL ?? "claude-3-haiku";
}

/**
 * https://platform.experientiallabs.ai/docs/errors — { error: { message, type, code, param } }.
 * Barqaror `code` bo'yicha aniq tasnif; noma'lum kod — umumiy OpenAI-mos qoidalar.
 */
export function classifyExperiential(status: number, body: string, headers: Headers, now = Date.now()): ClassifiedError {
  // 200 + x-gateway-warning: empty_completion — model bo'sh javob bilan tugatdi: keyingi nomzod.
  if (status >= 200 && status < 300 && /empty_completion/i.test(headers.get("x-gateway-warning") ?? "")) {
    return { kind: "transient", message: "empty_completion" };
  }
  const { code, message: raw } = parseErrorBody(body);
  const message = raw.slice(0, 500);
  const retryAfterMs = retryAfterFromHeaders(headers, now);
  const withRetry = retryAfterMs != null ? { retryAfterMs } : {};
  switch (code) {
    case "invalid_key":
    case "org_under_review": // tashkilot karantinda — kalit ishlamaydi
      return { kind: "auth", message };
    case "model_not_granted":
    case "model_location_not_supported":
      return { kind: "unavailable", scope: "model", message };
    case "insufficient_quota": {
      // "Spend limit, free-tier allowance, or credits exhausted" — tekin soatlik/kunlik oyna yoki kredit.
      const freeWindow = /free[- ]tier|allowance|hour|daily|per day/i.test(raw);
      const resetAt = retryAfterMs != null ? { resetAt: now + retryAfterMs } : {};
      return { kind: freeWindow ? "quota_exhausted" : "no_credit", ...resetAt, message };
    }
    case "unavailable_route": // throttled yoki sog'lom yo'l yo'q (429/503)
    case "gateway_overloaded": // replay oynasi to'lgan (429)
      return { kind: "rate_limited", ...withRetry, message };
    case "provider_internal":
    case "all_routes_failed":
    case "provider_output_too_large":
    case "gateway_draining":
    case "deadline_exceeded":
    case "internal_error":
    case "request_cancelled":
    case "idempotency_conflict":
    case "idempotency_replay_unavailable":
      return { kind: "transient", ...withRetry, message };
    case "invalid_json":
    case "invalid_request":
    case "invalid_parameter":
    case "unsupported_capability":
    case "unsupported_parameter":
    case "refusal":
    case "previous_response_not_found":
      // Kontekst xatosi ham invalid_request bo'lib kelishi mumkin — umumiy qoidada ajratiladi.
      return classifyOpenAiCompat(400, body, headers, now).kind === "context_length"
        ? { kind: "context_length", message }
        : { kind: "bad_request", message };
    default:
      return classifyOpenAiCompat(status, body, headers, now);
  }
}

/**
 * Tana: rasm qismlari tekislanadi (vision hujjatlanmagan), max_tokens ≤ 2048 (fallbackTargets bilan
 * bir xil). tool_calls / tool xabarlari o'zgarmaydi — tools hujjatda qo'llanadi.
 */
function experientialBody(body: ChatBody, model: string): ChatBody {
  const messages = (body.messages ?? []).map((m) => {
    const msg = (m ?? {}) as Record<string, unknown>;
    return Array.isArray(msg.content) ? { ...msg, content: textOf(msg.content) } : msg;
  });
  return {
    ...body,
    model,
    messages,
    max_tokens: typeof body.max_tokens === "number" ? Math.min(body.max_tokens, 2048) : 2048,
  };
}

export const experientialAdapter: ProviderAdapter = {
  id: "experiential",
  host: "experiential",
  enabled: () => !!process.env.EXPERIENTIAL_API_KEY,
  endpoint: () => ({
    url: EXPERIENTIAL_URL,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.EXPERIENTIAL_API_KEY ?? ""}` },
  }),
  /**
   * Bitta taklif — sozlangan model (standart claude-3-haiku, katalogda yo'q). Katalog modelining
   * aynan o'zi emas (sovereignIds bo'sh) — faqat sinf bo'yicha oxirgi chora. Pullik (kredit), lekin
   * hozirgi zaxira kabi tekin tarifga ham ochiq.
   */
  get offers(): ModelOffer[] {
    return [
      {
        sovereignIds: [],
        wire: experientialModel(),
        class: "free",
        cost: "cheap",
        minTier: "free",
        caps: { stream: true, tools: true, vision: false, json: true },
      },
    ];
  },
  limits: {
    // Raqamlar e'lon qilinmagan: tarifga bog'liq RPM/TPM, tekin soatlik/kunlik token oynalari, kalit kunlik sarf chegarasi.
    unit: "tokens",
    source: "https://platform.experientiallabs.ai/docs/errors (2026-09-27) — limitlar tarifga bog'liq, raqamlar e'lon qilinmagan",
  },
  classifyError: (status, body, headers) => classifyExperiential(status, body, headers),
  transformBody: (body, offer) => experientialBody(body, offer.wire),
  readServedModel: reportedModel,
  rescue: true,
};
