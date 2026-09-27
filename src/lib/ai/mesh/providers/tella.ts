import type { ChatBody, ClassifiedError, ModelOffer, ProviderAdapter } from "../types";
import { chatCompletionsUrl, classifyOpenAiCompat, parseErrorBody, reportedModel, retryAfterFromHeaders } from "./gateway";

/**
 * Tella adapteri — SOVEREIGN'ning o'z modeli (Tella 2: Qwen2.5-7B-Instruct asosida, D:\My_apps\tella2
 * Modelfile). O'z serverimizda Ollama yoki vLLM, OpenAI-mos: TELLA_BASE_URL (masalan
 * "http://localhost:11434/v1"), TELLA_MODEL (standart "tella2"), TELLA_API_KEY (ixtiyoriy —
 * Ollama kalit so'ramaydi, vLLM/proksi orqasida bo'lsa qo'yiladi). providers.ts
 * `providerEndpoint("tella")` / `DIRECT_ROUTES["tella-2"]` / `hasKeyFor` ning aynan nusxasi.
 *
 * QOIDA: Tella FAQAT o'z modelimizni beradi (providers.ts `isOwnModel`). Boshqa model hech qachon
 * "Tella" nomi bilan ko'rinmaydi — route Tella uchun `sameModelOnly: true` beradi (docs/MESH.md §8),
 * Tella rescue emas, aggregator emas. Aksincha, Tella ham boshqa modellar o'rniga ishlatilmasin
 * (hozirgi FREE_FALLBACKS/streamFreeFallback uni chiqarib tashlaydi; server bitta, NUM_PARALLEL=1) —
 * quyidagi `minTier` izohiga qarang.
 */

/** Katalog id (config/models.ts) va uning providerModel'i — ikkalasi "tella-2". */
export const TELLA_CATALOG_ID = "tella-2";

/** Ollama'dagi model nomi (`ollama create tella2 -f Modelfile`) — .env.example TELLA_MODEL standarti. */
export function tellaWire(): string {
  return process.env.TELLA_MODEL?.trim() || "tella2";
}

function tellaBase(): string {
  return process.env.TELLA_BASE_URL?.trim() ?? "";
}

/**
 * Ollama navbati to'lgan ("server busy, please try again. maximum pending requests exceeded", 503)
 * va Retry-After yo'q bo'lsa — qisqa kutish. Server o'zimizniki va zaxirasi yo'q (sameModelOnly),
 * shuning uchun standart 60 s (MESH_TUNING.defaultRetryAfterMs) o'rniga 5 s: foydalanuvchi bir daqiqa
 * "Tella ishlamayapti" ko'rmasin, lekin to'lib turgan navbatga darhol qayta yuklanmasin.
 */
export const TELLA_BUSY_RETRY_MS = 5_000;

/** Ollama "server busy" / vLLM-proksi "overloaded" — navbat to'la (vaqtinchalik, lekin qayta urinish befoyda). */
const BUSY_RE = /server busy|maximum pending requests|server is overloaded|too many pending requests/i;
/**
 * Model shu imkoniyatni qo'llamaydi (Ollama: "... does not support tools|images|insert|thinking").
 * Bu so'rov aybi (caps filtri o'tkazib yuborgan bo'lsa) — zanjir to'xtaydi, sog'liq buzilmaydi.
 * Umumiy MISSING_MODEL_RE ("model ... not supported") uni "model yo'q" deb 6 soat yopmasin.
 */
const UNSUPPORTED_CAP_RE = /does not support (tools|images|vision|insert|thinking|generate|chat|embedding)/i;

/**
 * Tella xatolari (Ollama + vLLM, OpenAI-mos qatlam):
 *  - Ollama OpenAI-mos: { error: { message, type: "api_error" | "invalid_request_error", code: null } };
 *    native/oqim ichida: { error: "..." } (status 200 da qoladi — https://docs.ollama.com/api/errors).
 *  - vLLM: { object: "error", message, type: "BadRequestError" | "NotFoundError", code: 400 | 404 }.
 *  - 404 "model \"tella2\" not found, try pulling it first" / vLLM "The model `x` does not exist." → unavailable.
 *  - 400 vLLM "This model's maximum context length is 8192 tokens..." → context_length.
 *  - 503 "server busy ... maximum pending requests exceeded" (OLLAMA_MAX_QUEUE) → rate_limited (qisqa).
 *  - 500 "llama runner process has terminated" / xotira yetmadi, 502/504/52x (proksi/tunnel) → transient.
 *  - 401/403 — proksi TELLA_API_KEY ni rad etdi → auth.
 * Kunlik kvota yo'q (o'z serverimiz) — resetAt faqat proksi sarlavha bersa (umumiy qoida).
 */
export function classifyTella(status: number, body: string, headers: Headers, now = Date.now()): ClassifiedError {
  const parsed = parseErrorBody(body);
  const text = `${parsed.code ?? ""} ${parsed.type ?? ""} ${parsed.message}`;
  const message = parsed.message.slice(0, 500);

  if (status !== 0 && BUSY_RE.test(text)) {
    return { kind: "rate_limited", retryAfterMs: retryAfterFromHeaders(headers, now) ?? TELLA_BUSY_RETRY_MS, message };
  }
  const st = status >= 200 && status < 300 ? (parsed.numericCode ?? 500) : status;
  if (st >= 400 && st < 500 && st !== 404 && UNSUPPORTED_CAP_RE.test(text)) {
    return { kind: "bad_request", message };
  }
  return classifyOpenAiCompat(status, body, headers, now);
}

/** Ollama "tella2:latest" ↔ "tella2" — teg farqi bir xil og'irliklar. */
function stripTag(id: string): string {
  return id.trim().toLowerCase().replace(/:latest$/, "");
}

/**
 * Upstream qaytargan model. Sozlangan wire (yoki "tella-2") bo'lsa — katalog id "tella-2"
 * (badge/served shu bilan). Boshqa nom kelsa (masalan operator vaqtincha boshqa modelni qo'ygan
 * yoki proksi yo'naltirgan) — xom nom qaytadi: served.isSubstitution uni halol "almashtirildi" deydi.
 */
export function readTellaServedModel(chunkOrJson: unknown): string | null {
  const m = reportedModel(chunkOrJson);
  if (!m) return null;
  const s = stripTag(m);
  if (s === stripTag(tellaWire()) || s === TELLA_CATALOG_ID) return TELLA_CATALOG_ID;
  return m;
}

export const tellaAdapter: ProviderAdapter = {
  id: "tella",
  // region.ts HOST_POLICY.tella = [] (o'z serverimiz); model egasi "sovereign" — cheklov yo'q.
  host: "tella",
  enabled: () => !!tellaBase(),
  endpoint: () => ({
    url: chatCompletionsUrl(tellaBase()),
    headers: {
      "Content-Type": "application/json",
      // Ollama kalit talab qilmaydi (providers.ts: TELLA_API_KEY ?? "ollama").
      Authorization: `Bearer ${process.env.TELLA_API_KEY?.trim() || "ollama"}`,
    },
  }),
  /** Bitta taklif — o'z modelimiz. wire TELLA_MODEL'ga bog'liq, shuning uchun getter. */
  get offers(): ModelOffer[] {
    return [
      {
        sovereignIds: [TELLA_CATALOG_ID],
        wire: tellaWire(),
        // Katalog: category "free", tier "free", cost "free".
        class: "free",
        cost: "free",
        /**
         * Tella boshqa modellar o'rniga (G1 o'rinbosar) ishlatilmaydi (bitta server, NUM_PARALLEL=1):
         * `substitutable: false`. `minTier: "ultra"` — qo'shimcha himoya. sameModel (tella-2 tanlangan)
         * bunga bog'liq emas — katalog tarifi (free) amal qiladi.
         */
        substitutable: false,
        minTier: "ultra",
        // Qwen2.5-7B: matn; oqim — ha; tool-calling tasdiqlanmagan (CLI Tella'ni ishlatmaydi),
        // rasm yo'q (Qwen2.5 matnli); JSON — Ollama/vLLM response_format qo'llaydi.
        caps: { stream: true, tools: false, vision: false, json: true },
      },
    ];
  },
  limits: {
    // O'z serverimiz: provayder kvotasi/RPM/kunlik limit yo'q (dailyUnits yo'q → R = 1).
    // Ollama standartlari: OLLAMA_NUM_PARALLEL=1, OLLAMA_MAX_QUEUE=512 (to'lsa 503 "overloaded"),
    // kontekst standarti 4096 — Tella Modelfile'da num_ctx 8192.
    source: "https://docs.ollama.com/faq , https://docs.ollama.com/api/errors (2026-09-27); D:\\My_apps\\tella2\\Modelfile num_ctx 8192",
  },
  classifyError: (status, body, headers) => classifyTella(status, body, headers),
  /** Faqat o'z modelimiz: model = sozlangan wire; vositalar olib tashlanadi (caps.tools=false). */
  transformBody: (body: ChatBody, offer: ModelOffer): ChatBody => {
    const { tools: _tools, tool_choice: _toolChoice, ...rest } = body;
    void _tools;
    void _toolChoice;
    return { ...rest, model: offer.wire };
  },
  readServedModel: readTellaServedModel,
  /** Region/served/badge id — har doim katalog id "tella-2" (region.ts OWNER_RULES → "sovereign"). */
  displayId: () => TELLA_CATALOG_ID,
};
