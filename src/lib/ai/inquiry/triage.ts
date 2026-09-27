import "server-only";
/**
 * Chuqur so'rash — triage chaqiruvi (docs/INQUIRY.md §A.3). Provider mesh (`meshComplete`) orqali
 * "fast" sinf, rescue'siz, temperature 0, max_tokens 400, JSON.
 *
 * JSON rejimi: 1-bosqich — faqat `caps.json` takliflar, `response_format: json_object` bilan;
 * ular yo'q yoki hammasi yiqilsa (vaqt qolgan bo'lsa) 2-bosqich — qolgan takliflar, response_format'siz
 * (javobdagi birinchi {…} bloki ajratiladi — sanitize.parseTriage).
 *
 * Byudjet: qattiq taymaut (blocking 1200 ms, parallel 4000 ms) — mesh `deadline` + AbortSignal +
 * Promise.race (mesh abort'ni e'tiborsiz qoldirsa ham kutib qolmaymiz). Taymaut / mesh xatosi /
 * JSON yoki zod xatosi → `null` (fail-open: siyosat "answer"). HECH QACHON throw qilmaydi.
 * Bizning taymautimiz abort sifatida uzatiladi — mesh uni provayder xatosi deb sog'liqqa yozmaydi.
 *
 * Test: npx tsx --conditions=react-server src/lib/ai/inquiry/triage.test.ts
 */
import type { Lang } from "@/lib/i18n";
import { meshComplete, type MeshCompleteInput, type MeshCompleteResult, type MeshDeps, type MeshUsage } from "../mesh/execute";
import type { Candidate, PlanTier, ProviderId, RouteRequest } from "../mesh/types";
import { buildTriageInput, contentText, TRIAGE_SYSTEM, type TriageHistoryMessage } from "./prompt";
import { enforceUzCyrl, inquiryLang } from "./lang";
import { parseTriage } from "./sanitize";
import { INQUIRY_TUNING, type InquiryReplyAnswer, type InquirySurface, type TriageResult } from "./types";

/** Triage chiqishi ≤ 400 token (§A.3, SPARC). */
export const TRIAGE_MAX_TOKENS = 400;

/** Mesh `deadline` = triage taymauti + shu (qarang: meshDeadline izohi). */
export const MESH_DEADLINE_GRACE_MS = 250;

export interface TriageInput {
  /** oxirgi user xabari (Blind Prompting yoqiq bo'lsa — maskalangan) */
  text: string;
  /** oldingi xabarlar (eskidan yangiga), oxirgi 4 tasi olinadi */
  history?: TriageHistoryMessage[];
  lang: Lang;
  /** pre-gate natijasi: taymaut shunga bog'liq */
  gate: "blocking" | "parallel";
  planTier: PlanTier;
  /** serverda aniqlangan mamlakat (region-server.ts); mintaqa siyosati mesh ichida */
  country: string | null;
  memoryText?: string;
  fileNames?: string[];
  docTitles?: string[];
  answers?: InquiryReplyAnswer[];
  askedSlots?: string[];
  surface?: InquirySurface;
  agentMode?: "code" | "chat";
  fullAuto?: boolean;
  /** CLI/Cowork papka konteksti */
  context?: string;
  /** so'rov bekor qilinsa (mijoz uzildi) — darhol null */
  signal?: AbortSignal;
  /** standart: INQUIRY_TUNING.triageTimeoutMs[gate] */
  timeoutMs?: number;
}

export type TriageFailure = "timeout" | "aborted" | "no_candidates" | "mesh" | "parse";

export interface TriageOutcome {
  result: TriageResult | null;
  /** halol served model (telemetriya `triage_model`) */
  model: string | null;
  provider: ProviderId | null;
  /** triage tokenlari (meta va oylik hisob — halollik) */
  usage: MeshUsage | null;
  latencyMs: number;
  error?: TriageFailure;
}

export interface TriageDeps {
  /** standart: meshComplete */
  complete?: (input: MeshCompleteInput) => Promise<MeshCompleteResult>;
  /** meshComplete'ga uzatiladigan deps (testda soxta fetch/adapters/plan) */
  meshDeps?: Partial<MeshDeps>;
  now?: () => number;
}

type PlanFn = MeshDeps["plan"];

/** Faqat JSON rejimini qo'llaydigan (true) yoki qo'llamaydigan (false) nomzodlar — tartib saqlanadi. */
export function filterJsonCaps(cands: Candidate[], json: boolean): Candidate[] {
  return cands.filter((c) => (c.offer.caps?.json === true) === json);
}

let schedulerPlan: Promise<PlanFn> | null = null;
function defaultPlan(): Promise<PlanFn> {
  schedulerPlan ??= import("../mesh/scheduler").then((m) => (req, adapters, health) => m.planCandidates(req, adapters, health));
  return schedulerPlan;
}

function emptyOutcome(started: number, now: () => number, error: TriageFailure): TriageOutcome {
  return { result: null, model: null, provider: null, usage: null, latencyMs: Math.max(0, now() - started), error };
}

function addUsage(a: MeshUsage | null, b: MeshUsage | undefined): MeshUsage | null {
  if (!b) return a;
  if (!a) return { ...b };
  return {
    prompt_tokens: a.prompt_tokens + b.prompt_tokens,
    completion_tokens: a.completion_tokens + b.completion_tokens,
    total_tokens: (a.total_tokens ?? a.prompt_tokens + a.completion_tokens) + (b.total_tokens ?? b.prompt_tokens + b.completion_tokens),
  };
}

/** Javob xabaridan matn: content (string yoki qismlar); bo'sh bo'lsa reasoning (ba'zi modellar JSON'ni shu yerga yozadi). */
function messageText(message: unknown): string {
  if (!message || typeof message !== "object") return "";
  const m = message as { content?: unknown; reasoning_content?: unknown; reasoning?: unknown };
  const text = contentText(m.content).trim();
  if (text) return text;
  for (const r of [m.reasoning_content, m.reasoning]) if (typeof r === "string" && r.includes("{")) return r;
  return "";
}

/** Batafsil natija (T3/T7 telemetriya va meta uchun). Hech qachon throw qilmaydi. */
export async function triageDetailed(input: TriageInput, deps: TriageDeps = {}): Promise<TriageOutcome> {
  const now = deps.now ?? Date.now;
  const started = now();
  const timeoutMs = Math.max(1, input.timeoutMs ?? INQUIRY_TUNING.triageTimeoutMs[input.gate]);
  if (input.signal?.aborted) return emptyOutcome(started, now, "aborted");

  const timer = new AbortController();
  const signal = input.signal ? AbortSignal.any([input.signal, timer.signal]) : timer.signal;
  let timedOut = false;
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">((resolve) => {
    timeoutHandle = setTimeout(() => {
      timedOut = true;
      timer.abort(new DOMException("inquiry triage timeout", "TimeoutError"));
      resolve("timeout");
    }, timeoutMs);
  });
  const deadline = started + timeoutMs;
  // Mesh muddati bizning taymautdan biroz keyin: taymaut AbortSignal orqali (foydalanuvchi to'xtatgandek)
  // yetib boradi — sekin, lekin sog'lom provayder triage byudjeti uchun circuit breaker'da jazolanmaydi.
  const meshDeadline = deadline + MESH_DEADLINE_GRACE_MS;

  const work = (async (): Promise<TriageOutcome> => {
    const complete = deps.complete ?? meshComplete;
    const basePlan = deps.meshDeps?.plan ?? (await defaultPlan());
    const req: RouteRequest = {
      class: "fast",
      needs: {},
      planTier: input.planTier,
      country: input.country,
      allowRescue: false,
    };
    // Karta tili: UI tili + xabar yozuvi (R2-2: UI "uz" + kirillcha xabar → "uz-cyrl" va aksincha).
    const lang = inquiryLang(input.lang, input.text);
    const messages = [
      { role: "system", content: TRIAGE_SYSTEM },
      { role: "user", content: buildTriageInput({ ...input, lang }) },
    ];
    let usage: MeshUsage | null = null;
    let sawCandidates = false;

    for (const json of [true, false]) {
      if (signal.aborted) break;
      if (now() >= deadline) break;
      const plan: PlanFn = (r, adapters, health) => filterJsonCaps(basePlan(r, adapters, health), json);
      const res = await complete({
        req,
        body: {
          messages,
          temperature: 0,
          max_tokens: TRIAGE_MAX_TOKENS,
          ...(json ? { response_format: { type: "json_object" } } : {}),
        },
        signal,
        deadline: meshDeadline,
        maxAttempts: input.gate === "blocking" ? 2 : 3,
        deps: { ...deps.meshDeps, plan },
      });
      if (!res.ok) {
        if (res.attempts.length) sawCandidates = true;
        continue; // JSON takliflar yo'q / yiqildi → qolganlari (vaqt bo'lsa)
      }
      usage = addUsage(usage, res.usage);
      // R2-4: "uz-cyrl" kartada model lotinga og'ib ketsa — kirillga (texnik nomlar saqlanadi).
      const result = enforceUzCyrl(parseTriage(messageText(res.message)), lang);
      return {
        result,
        model: res.model,
        provider: res.provider,
        usage,
        latencyMs: Math.max(0, now() - started),
        ...(result ? {} : { error: "parse" as const }),
      };
    }
    if (signal.aborted) return emptyOutcome(started, now, timedOut ? "timeout" : "aborted");
    if (now() >= deadline) return emptyOutcome(started, now, "timeout");
    return emptyOutcome(started, now, sawCandidates ? "mesh" : "no_candidates");
  })().catch((err: unknown): TriageOutcome => {
    if (timedOut) return emptyOutcome(started, now, "timeout");
    if (input.signal?.aborted) return emptyOutcome(started, now, "aborted");
    console.warn("[inquiry] triage xatosi:", err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200));
    return emptyOutcome(started, now, "mesh");
  });

  try {
    const winner = await Promise.race([work, timeout]);
    if (winner === "timeout") {
      // Kechikkan mesh natijasi kutilmaydi; rad etish (abort) work ichida ushlanadi.
      return emptyOutcome(started, now, "timeout");
    }
    return winner;
  } finally {
    clearTimeout(timeoutHandle);
    if (!timer.signal.aborted) timer.abort(new DOMException("inquiry triage done", "AbortError"));
  }
}

/** §A.3 imzosi: `TriageResult` yoki `null` (fail-open). */
export async function triage(input: TriageInput, deps?: TriageDeps): Promise<TriageResult | null> {
  return (await triageDetailed(input, deps)).result;
}
