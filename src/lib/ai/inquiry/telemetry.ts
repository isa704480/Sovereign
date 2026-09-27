import "server-only";
/**
 * Chuqur so'rash telemetriyasi (docs/INQUIRY.md §A.10). Jadval `inquiry_events`
 * (migratsiya 0037_inquiry_events.sql).
 *
 * Qoidalar:
 * - **Xom matn yo'q, user_id yo'q**: faqat enum, son va model id'si yoziladi. Savol, goal, assumptions,
 *   javoblar, slot nomlari yozilmaydi. Har qiymat whitelist/regex bilan tekshiriladi, shuning uchun
 *   chaqiruvchi xato bilan matn uzatsa ham u bazaga tushmaydi.
 * - Faqat service role yozadi (RLS yoqilgan, anon/authenticated'da grant yo'q).
 * - **Fail-silent**: Supabase sozlanmagan, kalit yo'q, tarmoq xatosi yoki taymaut — hech narsa
 *   tashlanmaydi, chat ishlayveradi. `INQUIRY_TELEMETRY=off` — butunlay o'chiradi.
 */
import { createServiceClient } from "@/lib/supabase/service";
import { isLang } from "@/lib/i18n";
import {
  INQUIRY_DECISIONS,
  INQUIRY_DOMAINS,
  INQUIRY_MODES,
  STAKES,
  type FinalDecision,
  type InquiryGate,
  type InquiryMode,
  type InquiryOutcome,
  type InquirySurface,
} from "./types";

export const INQUIRY_OUTCOMES = ["answered", "skipped", "ignored", "followup_clicked"] as const satisfies readonly InquiryOutcome[];
const SURFACES = ["web", "cli", "cowork"] as const satisfies readonly InquirySurface[];
const GATES = ["skip", "parallel", "blocking"] as const satisfies readonly InquiryGate[];

/** Karta natijasi shu muddatdan keyin yangilanmaydi (eski id'lar bilan o'ynashga yo'l qo'ymaslik). */
export const OUTCOME_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const WRITE_TIMEOUT_MS = 2500;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Mesh served model id'si: "groq/llama-3.1-8b-instant", "@cf/meta/llama-3.1-8b-instruct", "openai/gpt-oss-20b:free". */
const MODEL_ID_RE = /^[A-Za-z0-9@][A-Za-z0-9._:/@+-]{0,119}$/;

/** `recordInquiry` kirishi. `decision` — `decide()` natijasi (triage null bo'lsa ham, AC-6). */
export interface InquiryTelemetryInput {
  /** = InquiryEvent.inquiryId (server crypto.randomUUID()) */
  id: string;
  surface: InquirySurface;
  mode: InquiryMode;
  gate: InquiryGate;
  decision: Pick<
    FinalDecision,
    | "decision"
    | "decisionLlm"
    | "domain"
    | "stakes"
    | "clarity"
    | "round"
    | "nQuestions"
    | "nCritical"
    | "nDedupDropped"
    | "nSafetyDropped"
  >;
  /** interfeys tili (uz / uz-cyrl / ru / en); boshqasi → null */
  lang?: string | null;
  /** mesh qaytargan served model id'si (triage chaqirilmagan / yiqilgan bo'lsa null) */
  triageModel?: string | null;
  /** triage kechikishi, ms */
  latencyMs?: number | null;
}

/** `inquiry_events` qatori (snake_case, migratsiya bilan bir xil). */
export interface InquiryEventRow {
  id: string;
  surface: InquirySurface;
  mode: InquiryMode;
  gate: InquiryGate;
  domain: string | null;
  stakes: string | null;
  clarity: number | null;
  decision_llm: string | null;
  decision_final: string;
  n_questions: number;
  n_critical: number;
  n_dedup_dropped: number;
  n_safety_dropped: number;
  round: number;
  lang: string | null;
  triage_model: string | null;
  latency_ms: number | null;
}

function oneOf<T extends string>(list: readonly T[], v: unknown): T | null {
  return typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : null;
}

function smallInt(v: unknown, max = 20): number {
  const n = typeof v === "number" && Number.isFinite(v) ? Math.round(v) : 0;
  return Math.min(max, Math.max(0, n));
}

/**
 * Kirishni xavfsiz qatorga aylantiradi (pure). Yaroqsiz id / surface / mode / gate / decision bo'lsa null —
 * bunday qator yozilmaydi. Matn maydonlari faqat whitelist'dan yoki model id regex'idan o'tadi.
 */
export function buildInquiryRow(input: InquiryTelemetryInput): InquiryEventRow | null {
  if (!input || typeof input !== "object") return null;
  const id = typeof input.id === "string" && UUID_RE.test(input.id) ? input.id.toLowerCase() : null;
  const surface = oneOf(SURFACES, input.surface);
  const mode = oneOf(INQUIRY_MODES, input.mode);
  const gate = oneOf(GATES, input.gate);
  const d = input.decision;
  const decisionFinal = oneOf(INQUIRY_DECISIONS, d?.decision);
  if (!id || !surface || !mode || !gate || !decisionFinal) return null;

  const clarity =
    typeof d.clarity === "number" && Number.isFinite(d.clarity) ? Math.round(Math.min(1, Math.max(0, d.clarity)) * 1000) / 1000 : null;
  const model = typeof input.triageModel === "string" ? input.triageModel.trim() : "";
  const latency =
    typeof input.latencyMs === "number" && Number.isFinite(input.latencyMs)
      ? Math.min(600_000, Math.max(0, Math.round(input.latencyMs)))
      : null;

  return {
    id,
    surface,
    mode,
    gate,
    domain: oneOf(INQUIRY_DOMAINS, d.domain),
    stakes: oneOf(STAKES, d.stakes),
    clarity,
    decision_llm: oneOf(INQUIRY_DECISIONS, d.decisionLlm),
    decision_final: decisionFinal,
    n_questions: smallInt(d.nQuestions),
    n_critical: smallInt(d.nCritical),
    n_dedup_dropped: smallInt(d.nDedupDropped),
    n_safety_dropped: smallInt(d.nSafetyDropped),
    round: Math.max(1, smallInt(d.round, 5)),
    lang: isLang(input.lang) ? input.lang : null,
    triage_model: MODEL_ID_RE.test(model) ? model : null,
    latency_ms: latency,
  };
}

function telemetryDisabled(): boolean {
  return process.env.INQUIRY_TELEMETRY === "off";
}

/** Service client yoki null (sozlanmagan). Hech qachon tashlamaydi. */
function serviceOrNull(): ReturnType<typeof createServiceClient> | null {
  try {
    return createServiceClient();
  } catch {
    return null;
  }
}

async function withTimeout<T>(p: PromiseLike<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(p),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Bitta inquiry navbatini yozadi (triage chaqirilgan har navbat, shu jumladan `answer`).
 * Hech qachon tashlamaydi va ≤ 2.5 s da qaytadi — chaqiruvchi `void recordInquiry(...)` yoki `after()`
 * ichida ishlatishi mumkin. Yozildimi — `true`.
 */
export async function recordInquiry(input: InquiryTelemetryInput): Promise<boolean> {
  if (telemetryDisabled()) return false;
  const row = buildInquiryRow(input);
  if (!row) return false;
  const db = serviceOrNull();
  if (!db) return false;
  try {
    const res = await withTimeout(db.from("inquiry_events").insert(row), WRITE_TIMEOUT_MS);
    if (!res) return false;
    // 23505 — shu id allaqachon yozilgan (qayta urinish); 42P01 — migratsiya hali qo'llanmagan.
    if (res.error) {
      if (res.error.code !== "23505" && res.error.code !== "42P01") {
        console.warn("[inquiry-telemetry] insert failed:", res.error.code ?? "unknown");
      }
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Karta natijasini yozadi — faqat bir marta (`outcome is null`, EC-3) va faqat OUTCOME_WINDOW_MS ichida.
 * Server action (`logInquiryOutcome`) chaqiradi; auth va rate limit o'sha yerda. Yangilandimi — `true`.
 */
export async function setInquiryOutcome(id: string, outcome: InquiryOutcome): Promise<boolean> {
  if (telemetryDisabled()) return false;
  if (typeof id !== "string" || !UUID_RE.test(id)) return false;
  const value = oneOf(INQUIRY_OUTCOMES, outcome);
  if (!value) return false;
  const db = serviceOrNull();
  if (!db) return false;
  try {
    const since = new Date(Date.now() - OUTCOME_WINDOW_MS).toISOString();
    const res = await withTimeout(
      db
        .from("inquiry_events")
        .update({ outcome: value })
        .eq("id", id.toLowerCase())
        .is("outcome", null)
        .gte("created_at", since)
        .select("id"),
      WRITE_TIMEOUT_MS,
    );
    if (!res || res.error) return false;
    return Array.isArray(res.data) && res.data.length === 1;
  } catch {
    return false;
  }
}
