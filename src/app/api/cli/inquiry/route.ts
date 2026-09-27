import { createHash, randomUUID } from "node:crypto";
import { after } from "next/server";
import { z } from "zod";
import { createAnonClient } from "@/lib/supabase/anon";
import { createServiceClient } from "@/lib/supabase/service";
import { PLAN_BY_ID, isPlanId, type PlanId } from "@/config/plans";
import { clientIp, ipKey, rateLimit } from "@/lib/rate-limit";
import { resolveUserRegion } from "@/lib/ai/region-server";
import type { MeshUsage } from "@/lib/ai/mesh/execute";
import { decide, preGateDetail } from "@/lib/ai/inquiry/policy";
import { inquiryAnswerAddendum } from "@/lib/ai/inquiry/prompt";
import { inquiryLang } from "@/lib/ai/inquiry/lang";
import { triageDetailed, type TriageOutcome } from "@/lib/ai/inquiry/triage";
import { recordInquiry } from "@/lib/ai/inquiry/telemetry";
import {
  INQUIRY_MODES,
  INQUIRY_TUNING,
  type FinalDecision,
  type InquiryGate,
  type InquiryQuestion,
  type PreGateResult,
} from "@/lib/ai/inquiry/types";

export const runtime = "nodejs";
export const maxDuration = 15;

/**
 * POST /api/cli/inquiry — CLI / Cowork uchun "Chuqur so'rash" rejalashtirish bosqichi (docs/INQUIRY.md §A.9).
 *
 * Yangi vazifaning birinchi xabarida mijoz shu yerni chaqiradi: pre-gate (pure) → kerak bo'lsa triage
 * (mesh "fast", ≤ 1200 ms) → deterministik siyosat (`decide`). Javob **har doim 200**: har qanday xato,
 * limit, token yo'qligi, yaroqsiz so'rov → `{ decision: "answer" }` (fail-open — mijoz odatdagidek
 * davom etadi; token xatosini /api/cli/chat baribir aytadi).
 *
 * - Auth: Bearer CLI token → `cli_whoami` (boshqa /api/cli marshrutlari bilan bir xil). Pre-gate `skip`
 *   bo'lsa bazaga murojaat ham yo'q (hech narsa hisoblanmaydi, ma'lumot qaytmaydi).
 * - Rate limit `cli-inq:<sha256(token)>` 10/daq + IP 30/daq. Kunlik xabar hisobiga KIRMAYDI.
 * - Oylik token limiti tugagan foydalanuvchi triage tokenini sarflamaydi (web bilan bir xil tamoyil).
 * - Mintaqa: sanksiyadagi → triage yo'q; cheklangan → mamlakat mesh'ga (region.ts filtri).
 * - Full auto: triage faqat `blocking` ni tekshiradi (`decide({fullAuto})` → ko'pi bilan 1 savol).
 * - SSRF: so'rov URL qabul qilmaydi (`.strict()` sxema), server faqat env'dagi provayderlarga boradi.
 * - Telemetriya (`inquiry_events`, xom matnsiz) va triage tokenlari oylik hisobga — `after()` ichida.
 */

const MAX_BODY_CHARS = 100_000;

const messageSchema = z
  .object({
    role: z.enum(["user", "assistant"]),
    content: z.string().max(8_000),
  })
  .strict();

const schema = z
  .object({
    messages: z.array(messageSchema).min(1).max(8),
    surface: z.enum(["cli", "cowork"]).default("cli"),
    mode: z.enum(["code", "chat"]).default("chat"),
    fullAuto: z.boolean().default(false),
    lang: z.enum(["uz", "uz-cyrl", "ru", "en"]).default("en"),
    inquiryMode: z.enum(INQUIRY_MODES).default("auto"),
    round: z.number().int().min(0).max(3).default(0),
    askedSlots: z.array(z.string().max(40)).max(20).default([]),
    context: z.string().max(4_000).optional(),
  })
  .strict();

type Body = z.infer<typeof schema>;

/** Javob shakli (§A.9) + qo'shimcha maydonlar (eski mijozlar e'tiborsiz qoldiradi). */
interface InquiryResponse {
  decision: FinalDecision["decision"];
  inquiryId: string;
  domain: FinalDecision["domain"];
  stakes: FinalDecision["stakes"];
  clarity: number;
  goal: string;
  questions: InquiryQuestion[];
  assumptions: string[];
  blocking: boolean;
  latencyMs: number;
  /** qo'shimcha: InquiryEvent.round uchun (1 yoki 2) */
  round: number;
  /** qo'shimcha: favqulodda holat — javob EMERGENCY_FIRST bilan boshlanishi kerak */
  emergency: boolean;
  professional?: FinalDecision["professional"];
  /**
   * qo'shimcha: javob modeliga system xabar sifatida qo'shiladigan blok ("" — keraksiz).
   * `ask` bo'lsa — foydalanuvchi savollarni o'tkazib yuborgan ("taxmin bilan davom") holat uchun.
   */
  addendum: string;
  /** qo'shimcha: mashina o'qiydigan sabab kodi (diagnostika; foydalanuvchiga ko'rsatilmaydi) */
  reason: string;
}

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  const token = m ? m[1].trim() : "";
  return token && token.length <= 512 ? token : null;
}

/** Rate-limit kaliti: token o'zi Redis'ga/logga tushmasin. */
function tokenKey(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 32);
}

/** `after()` so'rov doirasidan tashqarida (test/skript) tashlaydi — unda oddiy fon vazifasi. */
function later(task: () => Promise<unknown>): void {
  const run = () => task().catch(() => undefined);
  try {
    after(run);
  } catch {
    void run();
  }
}

/** Fail-open javob: triage natijasisiz `decide(null)` (emergency bo'lsa EMERGENCY_FIRST addendum). */
function answerOnly(
  reason: string,
  opts: { started: number; lang?: Body["lang"]; emergency?: boolean; fullAuto?: boolean; round?: number },
): Response {
  const d = decide(null, { mode: "auto", gate: "skip", emergency: !!opts.emergency, round: opts.round ?? 0 });
  return respond(d, randomUUID(), opts.started, reason, opts.lang ?? "en", !!opts.fullAuto);
}

function respond(d: FinalDecision, inquiryId: string, started: number, reason: string, lang: Body["lang"], fullAuto: boolean): Response {
  const ask = d.decision === "ask";
  const addendum = inquiryAnswerAddendum(null, null, d, lang, {
    ...(ask ? { skipped: true } : {}),
    ...(fullAuto ? { fullAuto: true } : {}),
  });
  const body: InquiryResponse = {
    decision: d.decision,
    inquiryId,
    domain: d.domain,
    stakes: d.stakes,
    clarity: d.clarity,
    goal: d.goal,
    questions: d.decision === "answer" ? [] : d.questions,
    assumptions: d.assumptions,
    blocking: d.blocking,
    latencyMs: Math.max(0, Date.now() - started),
    round: d.round,
    emergency: d.emergency,
    ...(d.professional ? { professional: d.professional } : {}),
    addendum,
    reason,
  };
  return Response.json(body, { status: 200, headers: { "Cache-Control": "no-store" } });
}

/** Oylik token limiti tugaganmi (web/cli chat bilan bir xil hisob). Xato → false (fail-open). */
async function monthlyLimitReached(userId: string, planId: PlanId): Promise<boolean> {
  try {
    const { data } = await createServiceClient()
      .from("profiles")
      .select("tokens_used_month, tokens_month_start")
      .eq("id", userId)
      .maybeSingle();
    const u = data as { tokens_used_month?: number | string | null; tokens_month_start?: string | null } | null;
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const used = u?.tokens_month_start && new Date(u.tokens_month_start) >= monthStart ? Number(u.tokens_used_month ?? 0) || 0 : 0;
    const plan = PLAN_BY_ID[planId] ?? PLAN_BY_ID.free;
    return used >= plan.limits.tokensPerMonth;
  } catch {
    return false;
  }
}

/** Mintaqa: servis kaliti bo'lmasa — faqat IP sarlavhasi. */
async function region(req: Request, userId: string): Promise<{ sanctioned: boolean; country: string | null }> {
  try {
    const r = await resolveUserRegion({ headers: req.headers, supabase: createServiceClient(), userId });
    return { sanctioned: r.sanctioned, country: r.restricted ? r.country : null };
  } catch {
    try {
      const r = await resolveUserRegion({ headers: req.headers });
      return { sanctioned: r.sanctioned, country: r.restricted ? r.country : null };
    } catch {
      return { sanctioned: false, country: null };
    }
  }
}

/** Triage tokenlari oylik hisobga (halollik, §A.8). */
async function recordTriageUsage(userId: string, model: string, usage: MeshUsage): Promise<void> {
  const input = Math.max(0, Math.round(Number(usage.prompt_tokens) || 0));
  const output = Math.max(0, Math.round(Number(usage.completion_tokens) || 0));
  if (!input && !output) return;
  const { error } = await createServiceClient().rpc("record_token_usage_for", {
    p_user: userId,
    p_input_tokens: input,
    p_output_tokens: output,
    p_model: model,
  });
  if (error) console.error("[cli/inquiry] record_token_usage_for:", error.message);
}

export async function POST(req: Request) {
  const started = Date.now();

  const token = bearer(req);
  if (!token) return answerOnly("auth", { started });

  const rl = await rateLimit(`cli-inq:${tokenKey(token)}`, 10, 60_000);
  if (!rl.ok) return answerOnly("rate_limited", { started });
  const ipRl = await rateLimit(`cli-inq:ip:${ipKey(clientIp(req))}`, 30, 60_000);
  if (!ipRl.ok) return answerOnly("rate_limited", { started });

  const raw = await req.text().catch(() => "");
  if (raw.length > MAX_BODY_CHARS) return answerOnly("too_large", { started });
  let json: unknown = null;
  try {
    json = JSON.parse(raw);
  } catch {
    /* sxema rad etadi */
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) return answerOnly("invalid", { started });
  const body = parsed.data;

  // Oxirgi user xabari — triage matni; undan oldingilari — qisqa tarix.
  const lastUserIdx = body.messages.map((m) => m.role).lastIndexOf("user");
  if (lastUserIdx < 0) return answerOnly("no_user_message", { started, lang: body.lang, round: body.round });
  const text = body.messages[lastUserIdx].content;
  const history = body.messages.slice(0, lastUserIdx);
  const userTurns = body.messages.filter((m) => m.role === "user").length;

  // 0-bosqich: pre-gate (pure, tarmoqsiz).
  const gateInfo: PreGateResult = preGateDetail({
    text,
    mode: body.inquiryMode,
    round: body.round,
    isFirstMessage: userTurns <= 1,
    surface: body.surface,
    fullAuto: body.fullAuto,
  });
  // Full auto: pre-gate "skip" (savol bilan to'xtatmaslik), lekin triage faqat `blocking` uchun ishlaydi (§A.9).
  const fullAutoTriage = gateInfo.gate === "skip" && gateInfo.reason === "full_auto";
  // Addendum sarlavhalari va telemetriya tili — UI tili + xabar yozuvi (R2-2/3; triage ham shunday hisoblaydi).
  const inqLang = inquiryLang(body.lang, text);
  if (gateInfo.gate === "skip" && !fullAutoTriage) {
    return answerOnly(`gate:${gateInfo.reason}`, {
      started,
      lang: inqLang,
      emergency: gateInfo.emergency,
      fullAuto: body.fullAuto,
      round: body.round,
    });
  }
  const opts = { started, lang: inqLang, fullAuto: body.fullAuto, round: body.round };

  // Token → foydalanuvchi + tarif (muddati o'tgan pullik tarif = free).
  let userId: string;
  let planId: PlanId = "free";
  try {
    const { data, error } = await createAnonClient().rpc("cli_whoami", { p_token: token });
    const row = (Array.isArray(data) ? data[0] : data) as
      | { user_id?: string | null; plan?: string | null; plan_expires_at?: string | null }
      | null;
    if (error || !row?.user_id) return answerOnly("auth", opts);
    userId = row.user_id;
    const rawPlan: PlanId = isPlanId(row.plan) ? row.plan : "free";
    const expired = rawPlan !== "free" && !!row.plan_expires_at && new Date(row.plan_expires_at) < new Date();
    planId = expired ? "free" : rawPlan;
  } catch {
    return answerOnly("auth_error", opts);
  }

  const [where, overLimit] = await Promise.all([region(req, userId), monthlyLimitReached(userId, planId)]);
  if (where.sanctioned) return answerOnly("region", opts);
  if (overLimit) return answerOnly("user_limit", opts);

  // Siyosat uchun gate: full auto → blocking (faqat blocking savol, decide({fullAuto}) cheklaydi).
  const gate: Exclude<InquiryGate, "skip"> = fullAutoTriage ? "blocking" : gateInfo.gate === "blocking" ? "blocking" : "parallel";
  const inquiryId = randomUUID();

  // 1-bosqich: triage. CLI javobni kutadi — "parallel" gate'da ham blocking byudjeti (1200 ms);
  // siyosat baribir gate=parallel bo'yicha ask'ni answer_then_ask ga tushiradi.
  let outcome: TriageOutcome;
  try {
    outcome = await triageDetailed({
      text,
      history,
      lang: body.lang,
      gate,
      timeoutMs: INQUIRY_TUNING.triageTimeoutMs.blocking,
      planTier: planId,
      country: where.country,
      askedSlots: body.askedSlots,
      surface: body.surface,
      agentMode: body.mode,
      fullAuto: body.fullAuto,
      context: body.context,
      signal: req.signal,
    });
  } catch {
    // triageDetailed throw qilmaydi — bu faqat himoya qatlami.
    outcome = { result: null, model: null, provider: null, usage: null, latencyMs: Date.now() - started, error: "mesh" };
  }

  // 2-bosqich: deterministik qaror. Dedup — suhbatdagi user matni + papka konteksti.
  const knownText = [...body.messages.filter((m) => m.role === "user").map((m) => m.content), body.context ?? ""]
    .filter(Boolean)
    .join("\n");
  const d = decide(outcome.result, {
    mode: body.inquiryMode,
    gate,
    round: body.round,
    knownText,
    askedSlots: body.askedSlots,
    emergency: gateInfo.emergency,
    fullAuto: body.fullAuto,
  });

  const lang = inqLang;
  const surface = body.surface;
  const mode = body.inquiryMode;
  later(async () => {
    await Promise.all([
      recordInquiry({
        id: inquiryId,
        surface,
        mode,
        gate,
        decision: d,
        lang,
        triageModel: outcome.model,
        latencyMs: outcome.latencyMs,
      }),
      outcome.usage && outcome.model ? recordTriageUsage(userId, outcome.model, outcome.usage) : Promise.resolve(),
    ]);
  });

  const reason = outcome.result ? d.reason : `triage:${outcome.error ?? "none"}`;
  return respond(d, inquiryId, started, reason, lang, body.fullAuto);
}
