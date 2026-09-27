import { z } from "zod";
import {
  fallbackModelIds,
  hasKeyFor,
  hostIdAvailable,
  GROUNDED_GENERATION,
  SIMPLE_CHAT_GUARDRAIL,
  streamCompletion,
  type SearchSource,
  type StreamEvent,
} from "@/lib/ai/providers";
import { lookupSemanticCache, saveSemanticCache } from "@/lib/ai/cache";
import { confirmActionClaims, formatSearchSources, verifyAnswer, type JudgeInfo, type VerifierIssue } from "@/lib/ai/verifier";
import { answerModelsFor } from "@/lib/ai/judge";
import { checkClaims, detectActionClaims, unsourcedMarkers, type ActionRecord, type ClaimReason, type UnsupportedClaim } from "@/lib/ai/claims";
import { isCodeRequest, planRouteLLM, type RouteStep } from "@/lib/ai/router";
import { modelAllowedIn, regionDecision } from "@/lib/ai/region";
import { resolveUserRegion } from "@/lib/ai/region-server";
import { freePlanCandidates } from "@/lib/ai/chain";
import { requiredPlanTier } from "@/lib/ai/mesh/tier";
import { MESH_TUNING } from "@/lib/ai/mesh/types";
import { AUTO_MODEL_ID, MODEL_BY_ID, RESEARCH_MODEL_ID } from "@/config/models";
import { PLAN_BY_ID, planAllowsTier, planForTier, TIER_LABEL, type Plan } from "@/config/plans";
import { resolveActiveSkills, skillsPrompt } from "@/config/skills";
import { AGENT_MODE_BY_ID } from "@/config/agent-modes";
import { getMemories, memoryPrompt } from "@/lib/ai/memory";
import { fetchMentionedDocs, knowledgePrompt, retrieveKnowledge } from "@/lib/ai/knowledge";
import { extractUrls, readPages } from "@/lib/ai/web-read";
import { captureSample } from "@/lib/ai/training";
import { scriptDrift } from "@/lib/ai/script-check";
import type { AnswerMeta } from "@/lib/chat/answer-meta";
import { contentHasAttachment } from "@/lib/chat/attachment-markers";
import { billableTotal, splitUsage } from "@/lib/chat/usage-chunks";
import { getEnabledConnectors, runConnectorTools } from "@/lib/ai/connector-tools";
import { fmt, LANG_FOR_AI, pick, translate, type TKey } from "@/lib/i18n";
import { getServerT } from "@/lib/i18n-server";
import { TIER_TEXT } from "@/lib/locales/plans";
import { effectivePlan, getProfile } from "@/lib/auth/profile";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { inferProvider } from "@/lib/econ/unit-economics";
import { detectImageIntent } from "@/lib/ai/image";
import { decide, preGateDetail } from "@/lib/ai/inquiry/policy";
import { inquiryAnswerAddendum } from "@/lib/ai/inquiry/prompt";
import { inquiryLang } from "@/lib/ai/inquiry/lang";
import { triageDetailed, type TriageOutcome } from "@/lib/ai/inquiry/triage";
import { recordInquiry } from "@/lib/ai/inquiry/telemetry";
import { markLimit } from "@/lib/ai/inquiry/limit-codes";
import {
  INQUIRY_DOMAINS,
  INQUIRY_MODES,
  INQUIRY_TUNING,
  PROFESSIONAL_FOR,
  SENSITIVE_DOMAINS,
  type FinalDecision,
  type InquiryDomain,
  type InquiryEvent,
  type InquiryGate,
} from "@/lib/ai/inquiry/types";
import { createServiceClient } from "@/lib/supabase/service";
import { createServerMaskSession, mask } from "@/lib/ai/blind-prompting";

export const runtime = "nodejs";
export const maxDuration = 120;

// SSRF/schema attack surface'ini kamaytirish uchun content-part
// diskriminated union sifatida qat'iy tekshiriladi. `image_url` faqat
// data: (bevosita yuklangan rasm) yoki https:// bo'lishi mumkin.
const contentPart = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string().max(20_000) }),
  z.object({
    type: z.literal("image_url"),
    image_url: z.object({
      url: z
        .string()
        .max(12_000_000) // ~11MB base64 data URL
        .refine((u) => /^data:image\/(png|jpe?g|gif|webp|bmp);base64,/i.test(u) || /^https:\/\//i.test(u), {
          message: "faqat data:image/* yoki https:// URL",
        }),
    }),
  }),
]);

/**
 * Chuqur so'rash (docs/INQUIRY.md §A.8). Mijoz har so'rovda yuboradi; eski mijoz yubormaydi — u holda
 * server `inquiry` hodisasini HECH QACHON yubormaydi (eski mijoz uni tanimaydi).
 * `reply.answers` faqat dedup/telemetriya uchun — model javobni user xabari matnidan o'qiydi.
 */
const inquirySchema = z.object({
  mode: z.enum(INQUIRY_MODES).default("auto"),
  skip: z.boolean().default(false),
  recentSkips: z.number().int().min(0).max(10).default(0),
  askedSlots: z.array(z.string().max(40)).max(20).default([]),
  reply: z
    .object({
      inquiryId: z.uuid(),
      round: z.number().int().min(1).max(3),
      answers: z.array(z.object({ slot: z.string().max(40), value: z.string().max(400) })).max(6),
      domain: z.enum(INQUIRY_DOMAINS).optional(),
    })
    .optional(),
});

const bodySchema = z.object({
  modelId: z.string().min(1).max(100),
  /**
   * Yaroqsiz `inquiry` butun chatni 400 qilmaydi — faqat chuqur so'rash o'chadi (undefined → eski mijoz
   * kabi: hodisa yo'q). Bu maydon xavfsizlik chegarasi emas (reply kvotasi serverda tekshiriladi).
   */
  inquiry: inquirySchema.optional().catch(undefined),
  research: z.boolean().optional().default(false),
  skills: z.array(z.string().max(64)).max(12).optional().default([]),
  /** Knowledge-base documents the user referenced with "@name". */
  docIds: z.array(z.uuid()).max(4).optional().default([]),
  /** Skills the user wrote themselves (stored on their device, sent per request). */
  customSkills: z
    .array(z.object({ name: z.string().max(40), instructions: z.string().max(2000) }))
    .max(3)
    .optional()
    .default([]),
  /** Cowork folder outline (file names only) so the model knows what it may ask for. */
  context: z.string().max(6000).optional().default(""),
  /** Blind Prompting yoqilgan — server qo'shadigan xotira/bilim bazasi/Cowork matni ham maskalanadi. */
  blind: z.boolean().optional().default(false),
  /** Interfeys tili — javob shu tilda (foydalanuvchi boshqa tilda yozmasa). */
  lang: z.enum(["uz", "uz-cyrl", "ru", "en"]).optional().default("uz"),
  agentMode: z.string().max(40).optional().default("general"),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant", "system"]),
        content: z.union([
          z.string().max(20_000),
          // Bitta xabardagi JAMI matn ham 20 000 belgigacha (satr bilan bir xil; mijoz bitta matn qismi +
          // rasmlar yuboradi). Oldin 12 × 20k qism ruxsat edilib, so'rov ~1M tokengacha borardi.
          z
            .array(contentPart)
            .max(12)
            .refine((parts) => parts.reduce((n, p) => n + (p.type === "text" ? p.text.length : 0), 0) <= 20_000, {
              message: "xabardagi jami matn 20 000 belgidan oshmasin",
            }),
        ]),
      }),
    )
    .min(1)
    .max(24),
});

/** Rasm qismi token hisobida ~1500 token (≈6000 belgi) deb olinadi — oldin umuman hisoblanmasdi. */
const IMAGE_PART_CHARS = 6000;

/** Xabarlar tarixining taxminiy "belgi" hajmi: matn + rasm qismlari (token hisobi uchun, ~4 belgi = 1 token). */
function historyInputChars(messages: { content: string | unknown[] }[]): number {
  return messages.reduce((n, m) => {
    if (typeof m.content === "string") return n + m.content.length;
    const images = m.content.filter((p) => !!p && typeof p === "object" && (p as { type?: unknown }).type === "image_url").length;
    return n + textOf(m.content).length + images * IMAGE_PART_CHARS;
  }, 0);
}

const UPGRADE = "[upgrade]";

/**
 * "Qildim" deb aytib, aslida qilmaslikka qarshi qoida. Javob modeli vositasiz
 * ishlaydi: tashqi amallarni faqat connector bosqichi bajaradi va ularning
 * haqiqiy holati "AMALLAR HOLATI" ro'yxatida beriladi.
 */
const ACTION_HONESTY = [
  "HARAKATLAR HAQIDA HAQQONIYLIK (QAT'IY): bu javobni yozayotib sen hech qanday tashqi amal bajarmaysan —",
  "xat yubormaysan, fayl/jadval/taqdimot yaratmaysan, kalendarga yozmaysan, kod ishga tushirmaysan, saytni tekshirmaysan.",
  "Faqat kontekstdagi 'AMALLAR HOLATI' ro'yxatida '✓ BAJARILDI' deb ko'rsatilgan amal haqiqatda bajarilgan;",
  "'✕ BAJARILMADI' yoki '◐ QISMAN' bo'lsa — buni foydalanuvchiga ochiq ayt.",
  "Boshqa hollarda 'yaratdim/yubordim/saqladim/ishga tushirdim/tekshirdim/sinab ko'rdim' dema — nima qilish kerakligini ayt.",
  "Cowork faylini sen saqlamaysan: sovereign-write blokini taklif qilasan, uni foydalanuvchi o'zi saqlaydi.",
  "Manba (URL, hujjat nomi, iqtibos) keltirsang — faqat kontekstda haqiqatan berilganini keltir, o'ylab topma.",
].join(" ");

async function resolveEntitlement(lastText: string, docIds: string[]): Promise<{
  authed: boolean;
  userId: string | null;
  plan: Plan;
  usedToday: number;
  tokensUsedMonth: number;
  memoryText: string;
  /**
   * Bilim bazasi konteksti — embedding (pullik) chaqiruvi bor, shuning uchun kunlik
   * kvota tekshiruvidan KEYIN chaqiriladi: limiti tugagan foydalanuvchi uni ishlatmaydi.
   * `similarity: false` — embedding (OpenAI text-embedding-3-small) chaqirilmaydi, faqat
   * "@hujjat" bilan aniq ko'rsatilganlari (mintaqa siyosati).
   */
  loadKnowledge: (similarity: boolean) => Promise<string>;
  trainingOptIn: boolean;
  /** profiles.onboarding (mintaqa signali: foydalanuvchi tanlagan mamlakat). */
  onboarding: Record<string, unknown> | null;
}> {
  const noKnowledge = async () => "";
  const none = {
    userId: null,
    usedToday: 0,
    tokensUsedMonth: 0,
    memoryText: "",
    loadKnowledge: noKnowledge,
    trainingOptIn: false,
    onboarding: null,
  };
  if (!isSupabaseConfigured()) {
    // Local development-only: Supabase sozlanmagan bo'lsa demo rejim.
    return { authed: false, plan: PLAN_BY_ID.ultra, ...none };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { authed: false, plan: PLAN_BY_ID.free, ...none };
  }
  const profile = await getProfile(supabase, user.id);
  // Oylik token sarfi (0015: record_token_usage yozadi). Yangi oy boshlangan
  // bo'lsa hisob hali nollanmagan — eski qiymat hisobga olinmaydi.
  const { data: usage } = await supabase
    .from("profiles")
    .select("tokens_used_month, tokens_month_start")
    .eq("id", user.id)
    .maybeSingle();
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const usageRow = usage as { tokens_used_month?: number | string | null; tokens_month_start?: string | null } | null;
  const tokensUsedMonth =
    usageRow?.tokens_month_start && new Date(usageRow.tokens_month_start) >= monthStart
      ? Number(usageRow.tokens_used_month ?? 0) || 0
      : 0;
  // Migration 0010 dan keyin messages_today() argumentsiz — auth.uid()'ni ishlatadi.
  // (Faqat zaxira: asosiy kunlik limit — consume_message, 0027.)
  const { data: used } = await supabase.rpc("messages_today");
  const memoryText = profile?.memory_enabled === false ? "" : memoryPrompt(await getMemories(supabase, user.id));
  const loadKnowledge = async (similarity: boolean) => {
    // "@hujjat" mentions win over similarity search: the user named the source.
    const hits = docIds.length
      ? await fetchMentionedDocs(supabase, docIds)
      : lastText && similarity
        ? await retrieveKnowledge(supabase, user.id, lastText, 6)
        : [];
    return knowledgePrompt(hits);
  };
  return {
    authed: true,
    userId: user.id,
    plan: effectivePlan(profile),
    usedToday: typeof used === "number" ? used : 0,
    tokensUsedMonth,
    memoryText,
    loadKnowledge,
    // Ustunsiz (eski) bazada ham xavfsiz: faqat aniq false bo'lsa o'chiq.
    trainingOptIn: profile?.training_opt_in !== false,
    onboarding: profile?.onboarding ?? null,
  };
}

/**
 * "verifier" SSE hodisasidagi yozuv. Mavjud mijoz (use-send-message) `issues`ni
 * xabarga to'g'ridan-to'g'ri saqlaydi, shuning uchun javobdan keyingi barcha
 * tekshiruvlar shu kanal orqali `kind` bilan ajratib yuboriladi:
 *  - "fact"     — verifier.ts fakt bahosi (VerifierPanel);
 *  - "action"   — javob "qildim" deydi, lekin connector jurnalida bunday bajarilgan amal yo'q;
 *  - "citation" — research javobidagi manbasiz [n] belgilari.
 * Hodisa bir necha marta kelishi mumkin — har safar TO'LIQ ro'yxat (mijoz almashtiradi).
 */
type WireIssue = {
  fact: string;
  verdict: VerifierIssue["verdict"];
  note?: string;
  basis?: VerifierIssue["basis"];
  kind: "fact" | "action" | "citation";
  reason?: ClaimReason;
  markers?: number[];
  /** Fakt bahosini bergan mustaqil hakam (javob kompaniyasidan boshqa kompaniya). */
  judge?: JudgeInfo;
};

function actionIssues(claims: UnsupportedClaim[]): WireIssue[] {
  return claims.map((c) => ({ kind: "action", fact: c.text, verdict: "suspicious", reason: c.reason }));
}

function citationIssues(markers: number[]): WireIssue[] {
  if (!markers.length) return [];
  return [{ kind: "citation", fact: markers.map((n) => `[${n}]`).join(" "), verdict: "unverifiable", markers }];
}

function textOf(content: string | unknown[]): string {
  if (typeof content === "string") return content;
  return content
    .map((p) => (p && typeof p === "object" && "text" in p ? String((p as { text?: string }).text ?? "") : ""))
    .join(" ");
}

// ── Chuqur so'rash yordamchilari (docs/INQUIRY.md §A.8) ─────────────────────

/** Kartaga javob navbati shu muddat ichida bepul (keyin oddiy xabar sifatida hisoblanadi). */
const INQUIRY_REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;

function isSensitiveDomain(d: string | null | undefined): boolean {
  return !!d && (SENSITIVE_DOMAINS as readonly string[]).includes(d);
}

/**
 * Kartaga javob (yoki "Taxmin bilan javob ber") navbati kunlik xabar hisobiga kirmaydimi — "bitta savol =
 * bitta xabar" (§A.8 4-band). Mijoz `reply` ni o'zi yozadi, shuning uchun HAR SHART serverda tekshiriladi:
 *  1) suiiste'mol chegarasi `inquiry:reply:${userId}` 20 / 10 daq;
 *  2) `inquiryId` — server yaqinda (24 soat) web'da `ask` qarori bilan bergan karta (telemetriya jadvali;
 *     id — tasodifiy UUID, boshqa foydalanuvchinikini topib bo'lmaydi);
 *  3) har karta faqat BIR marta bepul — bazada ATOMIK egallanadi (R1): `update … set reply_claimed_at = now()
 *     where … and reply_claimed_at is null returning id` (0037 trigger ham qayta yozishni to'sadi). Upstash
 *     yo'q/uzilgan bo'lsa ham har Vercel instansida takrorlab bo'lmaydi (oldingi xotiradagi rate-limit o'rniga).
 * Istalgan shart bajarilmasa yoki tekshirib bo'lmasa (Supabase/migratsiya yo'q, telemetriya o'chiq) —
 * `false`: navbat odatdagidek hisoblanadi (xavfsiz tomonga, hech narsa rad etilmaydi).
 */
async function freeInquiryReply(userId: string, inquiryId: string): Promise<boolean> {
  const id = inquiryId.toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) return false;
  const burst = await rateLimit(`inquiry:reply:${userId}`, 20, 10 * 60_000);
  if (!burst.ok) return false;
  try {
    const sb = createServiceClient();
    const { data, error } = await sb
      .from("inquiry_events")
      .update({ reply_claimed_at: new Date().toISOString() })
      .eq("id", id)
      .eq("surface", "web")
      .eq("decision_final", "ask")
      .is("reply_claimed_at", null)
      .gte("created_at", new Date(Date.now() - INQUIRY_REPLY_WINDOW_MS).toISOString())
      .select("id");
    return !error && Array.isArray(data) && data.length === 1;
  } catch {
    return false;
  }
}

/**
 * Triage'siz javob navbati (skip / round ≥ 2): kartaning sohasi mijozdan keladi — addendum mutaxassis
 * va soha qoidasini qo'shishi uchun. Karta faqat yuqori xavfda chiqqani uchun sezgir sohada "medium".
 */
function withReplyDomain(d: FinalDecision, domain: InquiryDomain | undefined): FinalDecision {
  if (!domain) return d;
  const sensitive = isSensitiveDomain(domain);
  const professional = sensitive ? PROFESSIONAL_FOR[domain] : undefined;
  return { ...d, domain, stakes: sensitive ? "medium" : d.stakes, ...(professional ? { professional } : {}) };
}

/** `decide()` natijasidan SSE hodisasi (matnlar sanitize.ts/decide() da allaqachon tozalangan). */
function inquiryEventOf(d: FinalDecision, phase: InquiryEvent["phase"], inquiryId: string): InquiryEvent {
  return {
    type: "inquiry",
    inquiryId,
    phase,
    round: d.round,
    domain: d.domain,
    stakes: d.stakes,
    goal: d.goal,
    questions: phase === "followup" ? d.questions.slice(0, INQUIRY_TUNING.maxFollowups) : d.questions,
    assumptions: d.assumptions,
    ...(d.professional ? { professional: d.professional } : {}),
  };
}

export async function POST(req: Request) {
  // Butun so'rovning umumiy muddati (maxDuration 120 s dan oldin): mesh har urinish taymautini
  // qolgan vaqtga moslaydi, route esa muddat tugagach keyingi nomzodga o'tmaydi.
  const requestDeadline = Date.now() + MESH_TUNING.webDeadlineMs;
  // IP-bazasidagi umumiy anti-abuse — auth kelib chiqishidan qat'i nazar
  // burst hujumni to'sadi. Auth foydalanuvchilarga alohida tokened bucket.
  const ip = clientIp(req);
  const ipRl = await rateLimit(`chat:ip:${ip}`, 30, 60_000); // 30/min per IP
  if (!ipRl.ok) {
    const st = await getServerT();
    return Response.json({ error: st("chTooManyRequests") }, {
      status: 429,
      headers: { "Retry-After": Math.ceil(ipRl.retryAfterMs / 1000).toString() },
    });
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: (await getServerT())("chBadRequest") }, { status: 400 });

  const {
    modelId,
    research: reqResearch,
    skills: enabledSkills,
    messages: rawMessages,
    docIds,
    customSkills,
    context: rawCoworkContext,
    lang,
    agentMode,
    inquiry: inquiryReq,
    blind,
  } = parsed.data;
  // Foydalanuvchiga ko'rinadigan xabarlar — interfeys tilida.
  const t = (key: TKey) => translate(lang, key);
  // System xabarlarni faqat server qo'shadi — mijoz yuborgan role:"system"
  // (prompt-injection / guardrail'ni chetlash) tashlab yuboriladi.
  const messages = rawMessages.filter((m) => m.role !== "system");
  if (!messages.some((m) => m.role === "user")) return Response.json({ error: t("chBadRequest") }, { status: 400 });
  const mode = AGENT_MODE_BY_ID[agentMode];
  let research = reqResearch || !!mode?.autoResearch;
  const langText = `JAVOB TILI: foydalanuvchi boshqa tilda yozmasa, ${LANG_FOR_AI[lang]} javob ber.`;
  const isAuto = modelId === AUTO_MODEL_ID;
  // OmniRoute katalog modeli — id da "/" bor va curated ro'yxatda yo'q.
  const isOmni = !isAuto && modelId.includes("/") && !MODEL_BY_ID[modelId];
  if (!isAuto && !isOmni && !MODEL_BY_ID[modelId]) return Response.json({ error: t("chUnknownModel") }, { status: 400 });

  const encoder = new TextEncoder();
  const sse = (payload: unknown) => encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);
  const done = encoder.encode("data: [DONE]\n\n");
  const headers = {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  };
  const refuse = (message: string) => new Response(new Blob([sse({ type: "error", message }), done]), { headers });

  // Skills (user-enabled ∪ auto-detected).
  const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content;
  const lastText = lastUser ? textOf(lastUser) : "";
  // Suhbatda biriktirilgan fayl/transkript/rasm bormi (mijoz fayl matnini user xabariga "[Fayl: …]"
  // bilan qo'shadi — attachments.ts). Bunday suhbat trening bazasiga va umumiy keshga YOZILMAYDI.
  const hasAttachment = messages.some((m) => m.role === "user" && contentHasAttachment(m.content));
  const { authed, userId, plan, usedToday, tokensUsedMonth, memoryText: rawMemoryText, loadKnowledge, trainingOptIn, onboarding } =
    await resolveEntitlement(lastText, docIds);
  // Blind Prompting: server qo'shadigan kontekst (xotira, bilim bazasi, Cowork ro'yxati) ham mijoz
  // bilan bir xil qoidalar bilan maskalanadi ([CTX_…] tokenlari); xaritasi faqat mijozga ("blind-map").
  const ctxMask = blind ? createServerMaskSession() : null;
  const blindCtx = (s: string) => (ctxMask && s ? mask(s, ctxMask).masked : s);
  const memoryText = blindCtx(rawMemoryText);
  const coworkContext = blindCtx(rawCoworkContext);
  const activeSkills = resolveActiveSkills(enabledSkills, lastText);
  const customText = customSkills
    .filter((s) => s.name.trim() && s.instructions.trim())
    .map((s) => `SKILL "${s.name}":\n${s.instructions}`)
    .join("\n\n");
  const skillText = [skillsPrompt(activeSkills), customText].filter(Boolean).join("\n\n");

  // Auth majburiy (prod'da Supabase sozlangan bo'lsa) — anonim cost-DoS ni to'sish.
  if (!authed && isSupabaseConfigured()) {
    return refuse(`${UPGRADE} ${t("chLoginRequired")}`);
  }

  // ---- Mintaqa siyosati (region.ts) ----
  // Provayderi foydalanuvchi mintaqasiga xizmat ko'rsatmaydigan model (Claude/GPT/Gemini ...)
  // HECH QACHON chaqirilmaydi: ruxsat etilgan ekvivalentga o'tiladi va bu ochiq aytiladi.
  const region = await resolveUserRegion({
    headers: req.headers,
    supabase: authed && isSupabaseConfigured() ? await createClient() : null,
    userId,
    onboarding,
  });
  const country = region.restricted ? region.country : null;
  if (region.sanctioned) return refuse(t("p10RegionNoModels"));
  const tierAllowed = (tier: Parameters<typeof planAllowsTier>[1]) => planAllowsTier(plan, tier);
  const available = (id: string) => {
    const m = MODEL_BY_ID[id];
    // "groq/..." / "cloudflare/@cf/..." — to'g'ridan-to'g'ri kalit; boshqa "host/..." — OmniRoute.
    return m ? hasKeyFor(m) : hostIdAvailable(id);
  };
  // So'ralgan model mintaqada yopiq — ekvivalentlar (tarif ruxsat bergan) oldindan tanlanadi,
  // shuning uchun "Pro'ga o'ting" taklifi foydalanuvchi baribir ishlata olmaydigan model uchun chiqmaydi.
  let regionSwapFrom: string | null = null;
  let regionCandidates: string[] | null = null;
  if (country && !isAuto && !modelAllowedIn(modelId, country)) {
    const dec = regionDecision({
      requested: modelId,
      candidates: [modelId],
      country,
      tier: MODEL_BY_ID[modelId]?.tier,
      code: isCodeRequest(lastText),
      tierAllowed,
      available,
    });
    if (!dec.candidates.length) return refuse(t("p10RegionNoModels"));
    regionSwapFrom = modelId;
    regionCandidates = dec.candidates;
  }
  // Research (Perplexity) ham mintaqa siyosatiga bo'ysunadi — yopiq bo'lsa oddiy javob.
  const regionDroppedResearch = !!country && research && !modelAllowedIn(RESEARCH_MODEL_ID, country);
  if (regionDroppedResearch) research = false;

  // "[limit]" — foydalanuvchi tarifi tugagan (T14 limit-codes): mijoz "Cowork'da mahalliy model" CTA'sini ko'rsatadi.
  // Mintaqa va tarif darajasi rad etishlari belgilanmaydi (mahalliy model ularning yechimi emas).
  const dailyLimitMsg = markLimit(`${UPGRADE} ${fmt(t("chDailyLimit"), { n: plan.limits.messagesPerDay, plan: plan.name })}`);
  // Chuqur so'rash: kartaga javob navbati (server tasdiqlasa) kunlik xabar hisobiga kirmaydi (§A.8).
  const inquiryReply = inquiryReq?.reply;
  const freeReply = authed && userId && inquiryReply ? await freeInquiryReply(userId, inquiryReply.inquiryId) : false;
  if (!freeReply && usedToday >= plan.limits.messagesPerDay) {
    return refuse(dailyLimitMsg);
  }
  // Oylik token limiti (0015 tokens_used_month) — endi majburiy (javob navbatida ham).
  // Shu so'rovning kirish hajmi ham hisobga olinadi: faqat o'tgan sarf tekshirilsa, limitga yaqin
  // foydalanuvchi bitta katta so'rov (uzun tarix + rasmlar) bilan limitdan ancha oshib ketardi.
  const requestInputTokens = Math.round((historyInputChars(messages) + coworkContext.length) / 4);
  if (authed && (tokensUsedMonth >= plan.limits.tokensPerMonth || tokensUsedMonth + requestInputTokens > plan.limits.tokensPerMonth)) {
    return refuse(markLimit(`${UPGRADE} ${fmt(t("secMonthlyTokenLimit"), { plan: plan.name })}`));
  }

  // OmniRoute/upstream katalog gating (CLI route bilan bir xil funksiya — requiredPlanTier): aniq
  // modellar (mas. "dva/claude-opus-5-high") kamida Pro'da; katalogdagi Ultra modelning upstream
  // nomi ("anthropic/claude-opus-5") — Ultra'da. "auto/*" kombolari (tekin yo'naltirish) hammaga ochiq.
  if (isOmni && !regionSwapFrom && !modelId.startsWith("auto/")) {
    const need = requiredPlanTier(modelId);
    if (!planAllowsTier(plan, need)) {
      if (need === "pro") return refuse(`${UPGRADE} ${t("chOmniProOnly")}`);
      const upPlan = planForTier(need);
      const tierText = pick(lang, TIER_TEXT[need]) || TIER_LABEL[need];
      return refuse(
        `${UPGRADE} ${fmt(t("chModelTierUpgrade"), { model: modelId, tier: tierText, plan: upPlan.name, price: upPlan.price })}`,
      );
    }
  }

  // Research (Perplexity) — Starter/Free'da yopiq. Aniq model tekshiruvidan tashqari
  // auto/* va OmniRoute modellarida ham: aks holda `research:true` bilan chetlab o'tilardi.
  if ((isAuto || isOmni) && research && !plan.limits.research) {
    return refuse(`${UPGRADE} ${t("chResearchPro")}`);
  }

  // Plan gating for a concrete (non-auto) model. Mintaqa almashtirgan model — ekvivalentlar
  // allaqachon tarif bo'yicha tanlangan.
  if (!isAuto && !isOmni && !regionSwapFrom) {
    const model = MODEL_BY_ID[modelId];
    if (!planAllowsTier(plan, model.tier)) {
      const need = planForTier(model.tier);
      const tier = pick(lang, TIER_TEXT[model.tier]) || TIER_LABEL[model.tier];
      return refuse(`${UPGRADE} ${fmt(t("chModelTierUpgrade"), { model: model.name, tier, plan: need.name, price: need.price })}`);
    }
    if ((research || model.category === "research") && !plan.limits.research) {
      return refuse(`${UPGRADE} ${t("chResearchPro")}`);
    }
    if (model.id === "sonar-pro-online" && !plan.limits.deepResearch) {
      return refuse(`${UPGRADE} ${t("chDeepResearchUltra")}`);
    }
  }

  // Kunlik limit — server tomonida atomik hisob (0027 consume_message). Barcha
  // rad etish tekshiruvlaridan KEYIN: rad etilgan so'rov limitni yemaydi.
  // (Eski messages_today brauzer yozadigan `messages`ni sanardi — to'g'ridan-
  // to'g'ri POST bilan chetlab o'tilardi.)
  // Pullik planner LLM va embedding shu tekshiruvdan KEYIN — limiti tugagan
  // foydalanuvchi ularni har so'rovda ishga tushirmaydi.
  // Tasdiqlangan kartaga javob navbati (freeReply) hisoblanmaydi — karta chiqqan navbat allaqachon hisoblangan.
  if (authed && !freeReply) {
    let counted = false;
    try {
      const supabase = await createClient();
      const { data: allowed, error } = await supabase.rpc("consume_message", {
        p_limit: plan.limits.messagesPerDay,
      });
      if (error) console.error("[chat] consume_message:", error.message);
      else if (allowed !== true) return refuse(dailyLimitMsg);
      else counted = true;
    } catch (e) {
      console.error("[chat] consume_message:", e);
    }
    // DB hisobi ishlamasa (timeout, migratsiya yo'q) limit ochiq qolmasin:
    // foydalanuvchi bo'yicha kunlik zaxira hisob (Upstash, bo'lmasa mahalliy).
    if (!counted && userId) {
      const day = await rateLimit(`chat:day:${userId}`, plan.limits.messagesPerDay, 24 * 60 * 60 * 1000);
      if (!day.ok) return refuse(dailyLimitMsg);
    }
  }

  // ---- Chuqur so'rash (docs/INQUIRY.md §A.2–A.8): kvotadan KEYIN (limiti tugagan foydalanuvchi triage
  // tokenini sarflamaydi). Pre-gate — sinxron, tarmoqsiz. ----
  const emitInquiry = !!inquiryReq; // eski mijoz `inquiry` hodisasini tanimaydi
  const inquiryMode = inquiryReq?.mode ?? "auto";
  const replyAnswers = inquiryReply?.answers ?? [];
  const inquiryRound = inquiryReply?.round ?? 0;
  const lastUserIdx = messages.map((m) => m.role).lastIndexOf("user");
  const pre = preGateDetail({
    text: lastText,
    mode: inquiryMode,
    skip: inquiryReq?.skip,
    recentSkips: inquiryReq?.recentSkips,
    round: inquiryRound,
    isFirstMessage: messages.filter((m) => m.role === "user").length === 1,
    mediaIntent: detectImageIntent(lastText),
    research,
    mediaOnly: Array.isArray(lastUser) && !lastText.trim(),
    surface: "web",
  });
  // Eski mijozda parallel triage foydasiz (follow-up chip'ni ko'rsata olmaydi) — faqat token sarfi.
  const inquiryGate: InquiryGate = !emitInquiry && pre.gate === "parallel" ? "skip" : pre.gate;
  // Deterministik dedup matni: suhbatdagi user xabarlari + xotira + karta javoblari + Cowork papka konteksti.
  const knownText = [
    ...messages.filter((m) => m.role === "user").map((m) => textOf(m.content)),
    memoryText,
    ...replyAnswers.map((a) => `${a.slot}: ${a.value}`),
    coworkContext.slice(0, 4000),
  ]
    .filter(Boolean)
    .join("\n");
  const decideCtx = (gate: InquiryGate) => ({
    mode: inquiryMode,
    gate,
    round: inquiryRound,
    knownText,
    askedSlots: inquiryReq?.askedSlots ?? [],
    emergency: pre.emergency,
  });
  // Triage hech qachon throw qilmaydi va o'z taymautiga ega (blocking 1200 ms, parallel 4000 ms) — fail-open.
  const runTriage = (gate: "blocking" | "parallel"): Promise<TriageOutcome> =>
    triageDetailed({
      text: lastText,
      history: messages.slice(0, Math.max(0, lastUserIdx)),
      lang,
      gate,
      planTier: plan.id,
      country,
      memoryText,
      answers: replyAnswers,
      askedSlots: inquiryReq?.askedSlots ?? [],
      surface: "web",
      context: coworkContext || undefined,
      signal: req.signal,
    });
  // Blocking: triage Auto planner va bilim bazasi bilan PARALLEL (qo'shimcha kechikish ≈ max(0, triage − planner)).
  const blockingTriage = inquiryGate === "blocking" ? runTriage("blocking") : null;

  // Bilim bazasi (embedding) — kvota o'tgandan keyin.
  // Mintaqa cheklangan bo'lsa embedding (OpenAI) chaqirilmaydi — faqat "@hujjat".
  const knowledgeText = blindCtx(await loadKnowledge(!region.restricted));

  // ---- Build the execution plan (single model, or Auto orchestration) ----
  const routePlan = isAuto ? await planRouteLLM(lastUser ?? "", plan, lang, req.signal, country) : null;

  const steps: RouteStep[] = routePlan
    ? routePlan.steps
    : regionCandidates
      ? [{ modelId: regionCandidates[0], kind: "answer", purpose: "", fallbacks: regionCandidates }]
      : [
          {
            modelId,
            kind: research || (!isOmni && MODEL_BY_ID[modelId].category === "research") ? "research" : "answer",
            purpose: "",
          },
        ];
  // Auto mintaqada hech bir ruxsat etilgan model topa olmadi (kalitlar yo'q) — jim xato emas.
  if (steps.some((s) => !s.modelId)) return refuse(t("p10RegionNoModels"));
  const routeReason = routePlan?.reason ?? "";

  const blockingOutcome = blockingTriage ? await blockingTriage : null;
  // Yakuniy qaror — deterministik siyosat. Eski mijozda "ask" ko'rsatib bo'lmaydi → parallel kabi
  // (answer_then_ask: javob taxminlar bilan, chip'siz).
  const blockingDecision: FinalDecision | null = blockingOutcome
    ? decide(blockingOutcome.result, decideCtx(emitInquiry ? "blocking" : "parallel"))
    : null;
  const askNow = emitInquiry && blockingDecision?.decision === "ask";
  // Triage'siz, lekin baribir kontekst kerak: favqulodda (EMERGENCY_FIRST) yoki kartaga javob / skip navbati.
  const addendumDecision: FinalDecision | null =
    blockingDecision ??
    (pre.emergency || inquiryReply
      ? withReplyDomain(decide(null, decideCtx("skip")), inquiryReply?.domain)
      : null);
  const inquiryAddendum = askNow
    ? ""
    : inquiryAnswerAddendum(blockingOutcome?.result ?? null, replyAnswers, addendumDecision, inquiryLang(lang, lastText), {
        skipped: inquiryReq?.skip === true,
      });

  // Semantic cache: faqat oddiy savol (RAG/xotira/attach yo'q, research emas)
  // — foydalanuvchi savoli o'xshash bo'lsa modelga bormay javob qaytariladi.
  // Havolali savol keshlanmaydi — sahifa mazmuni o'zgarib turadi.
  const urls = extractUrls(lastText);
  const canCache =
    isSupabaseConfigured() &&
    // Chuqur so'rash: yuqori xavfli (blocking) navbatda generik keshlangan javob noto'g'ri bo'lishi mumkin;
    // favqulodda, kartaga javob va addendum'li javoblar shaxsiy kontekstga bog'liq — keshga ham yozilmaydi.
    inquiryGate !== "blocking" &&
    !pre.emergency &&
    !inquiryReply &&
    !inquiryAddendum &&
    // Semantik kesh embedding'i — OpenAI (text-embedding-3-small): cheklangan mintaqada yo'q.
    !region.restricted &&
    !research &&
    !isAuto &&
    urls.length === 0 &&
    !knowledgeText &&
    !memoryText &&
    // Kesh BARCHA foydalanuvchilar uchun umumiy: fayl, Cowork papkasi yoki shaxsiy skill konteksti
    // bilan yozilgan javob boshqa foydalanuvchiga qaytmasin.
    !hasAttachment &&
    !coworkContext &&
    !customText &&
    typeof lastUser === "string" &&
    lastText.length >= 12;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (ev: StreamEvent | Record<string, unknown>) => controller.enqueue(sse(ev));

      /**
       * Javobdan keyingi tekshiruvlar. Deterministik qism (amal da'volari ↔ connector
       * jurnali, manbasiz [n]) — darhol va bepul. LLM qismi (fakt-verifier, chegaradagi
       * da'volarni tasdiqlash) — faqat kerak bo'lganda, parallel. Topilmasa — hodisa yo'q.
       */
      const postChecks = async (p: {
        text: string;
        ledger: ActionRecord[];
        unsourced: number[];
        verify: (() => Promise<VerifierIssue[]>) | null;
        /** Javobni yaratgan model(lar) — mustaqil hakam boshqa kompaniyadan tanlanadi. */
        answerModels: string[];
      }) => {
        const unsupported = checkClaims(detectActionClaims(p.text), p.ledger);
        const strong = unsupported.filter((c) => c.strength === "strong");
        const borderline = unsupported.filter((c) => c.strength === "borderline");
        const cites = citationIssues(p.unsourced);
        const early: WireIssue[] = [...actionIssues(strong), ...cites];
        if (early.length) send({ type: "verifier", issues: early });
        if (!borderline.length && !p.verify) return;
        const [facts, confirmed] = await Promise.all([
          p.verify ? p.verify().catch((): VerifierIssue[] => []) : Promise.resolve<VerifierIssue[]>([]),
          // Tasdiqlovchi — mustaqil hakam (judge.ts): javob kompaniyasidan boshqa, mintaqada
          // ruxsat etilgan model. Hakam topilmasa null → ogohlantirish saqlanadi (xavfsiz tomonga).
          borderline.length
            ? confirmActionClaims(
                borderline.map((c) => c.text),
                req.signal,
                { answerModel: p.answerModels, country },
              ).catch(() => null)
            : Promise.resolve<boolean[] | null>([]),
        ]);
        // Tasdiqlab bo'lmasa (kalit yo'q / xato) — ogohlantirish saqlanadi (xavfsiz tomonga).
        const kept = confirmed === null ? borderline : borderline.filter((_, i) => confirmed[i]);
        if (!facts.length && !kept.length) return;
        const all: WireIssue[] = [
          ...facts.map((f): WireIssue => ({ ...f, kind: "fact" })),
          ...actionIssues([...strong, ...kept]),
          ...cites,
        ];
        // Kim tekshirdi (har doim javob kompaniyasidan boshqa) — mijoz VerifierPanel'da ko'rsatadi.
        const judge = facts.find((f) => f.judge)?.judge;
        send({ type: "verifier", issues: all, ...(judge ? { judge } : {}) });
      };

      // Oylik token hisobi uchun (finally'da yoziladi — oqim uzilsa/bekor qilinsa ham).
      let webContext = "";
      let connectorContext = "";
      // Connector tool bosqichi modelining sarfi — alohida yoziladi (triage kabi).
      let connectorUsage: { input: number; output: number; model: string; provider: string } | null = null;
      // BARCHA qadamlar (research ham) va barcha nomzodlar chiqishi — kelgan har bo'lak.
      let billedOutChars = 0;
      // Modelga haqiqatan yuborilgan qadam/nomzod chaqiruvlari soni (kirish har safar qayta yuboriladi).
      let modelCalls = 0;
      // Shu so'rovda butunlay yiqilgan mesh provayderlari (auth, 5xx, provayder limiti) — keyingi
      // nomzodlar (streamCompletion chaqiruvlari) ularni qayta sinamaydi.
      const meshFailed = new Set<string>();

      // Shaffoflik: javob qadamini haqiqatda qaysi nomzod va qaysi upstream model bergani.
      const answerStep = steps.find((s) => s.kind === "answer") ?? steps[steps.length - 1];
      let servedId = answerStep?.modelId ?? modelId;
      let servedUpstream: string | undefined;
      // Mesh aytgan haqiqiy provayder (groq, cloudflare ...) — unit economics uchun.
      let servedProvider: string | undefined;
      let servedSubstituted = false;
      let servedRescue = false;
      let cachedFrom: string | null = null;

      // Chuqur so'rash holati: triage natijalari (token hisobi/telemetriya), parallel triage, kutilayotgan yozuvlar.
      const triageOutcomes: { outcome: TriageOutcome; gate: InquiryGate; decision: FinalDecision; id: string }[] = [];
      let parallelTriage: Promise<TriageOutcome> | null = null;
      let parallelNoted = false;
      let blockingInquiryId = "";
      let askSent = false;
      const inquiryJobs: Promise<unknown>[] = [];
      /** Triage natijasini qayd etadi: telemetriya (xom matnsiz) — triage ishlagan HAR navbat, `answer` ham. */
      const noteTriage = (outcome: TriageOutcome, gate: InquiryGate, decision: FinalDecision): string => {
        const id = crypto.randomUUID();
        triageOutcomes.push({ outcome, gate, decision, id });
        inquiryJobs.push(
          recordInquiry({
            id,
            surface: "web",
            mode: inquiryMode,
            gate,
            decision,
            lang,
            triageModel: outcome.model,
            latencyMs: outcome.latencyMs,
          }).catch(() => false),
        );
        return id;
      };
      /** Triage tokenlari (mesh qaytargan haqiqiy son) — meta va oylik hisob (halollik, §A.8). */
      const triageUsage = () =>
        triageOutcomes.reduce(
          (acc, x) => ({
            input: acc.input + (x.outcome.usage?.prompt_tokens ?? 0),
            output: acc.output + (x.outcome.usage?.completion_tokens ?? 0),
          }),
          { input: 0, output: 0 },
        );

      /** Taxminiy token hisobi (~4 belgi = 1 token): butun tarix + kontekst har chaqiruvda. */
      const usageEstimate = () => {
        if (modelCalls === 0) return { input: 0, output: 0 };
        const historyChars = historyInputChars(messages);
        const contextChars = [webContext, coworkContext, knowledgeText, memoryText, skillText, connectorContext, inquiryAddendum].join("")
          .length;
        return {
          input: Math.round(((historyChars + contextChars) * modelCalls) / 4),
          output: Math.round(billedOutChars / 4),
        };
      };

      /** `who` — javob modelidan boshqa chaqiruv (triage): o'z modeli/provayderi bilan alohida yoziladi. */
      const recordUsage = async (
        u: { input: number; output: number },
        who?: { model: string; provider: string | null },
      ) => {
        if (!authed) return;
        if (who ? u.input + u.output <= 0 : modelCalls === 0) return;
        const supabase = await createClient();
        // record_token_usage bitta chaqiruvda ≤100k yozadi — katta sarf bo'laklab yoziladi (usage-chunks.ts).
        for (const chunk of splitUsage(u)) await recordUsageChunk(supabase, chunk, who);
      };
      const recordUsageChunk = async (
        supabase: Awaited<ReturnType<typeof createClient>>,
        u: { input: number; output: number },
        who?: { model: string; provider: string | null },
      ) => {
        const base = {
          p_input_tokens: u.input,
          p_output_tokens: u.output,
          // Haqiqatda javob bergan model (zaxiraga o'tilgan bo'lsa — o'sha).
          p_model: who ? who.model : servedId,
          // Unit economics (0036): provayder faqat id'dan ishonchli aniqlansa, aks holda null.
          p_provider: who
            ? who.provider
            : cachedFrom
              ? null
              : (servedProvider || inferProvider(servedUpstream ?? "") || inferProvider(servedId) || null),
        };
        const p_upstream_model = who ? who.model : cachedFrom ? null : (servedUpstream ?? null);
        // database-1: server tekshirgan userId bilan service_role orqali yoziladi (record_token_usage_for,
        // /api/cli/chat bilan bir xil) — foydalanuvchi JWT'si bilan chaqiriladigan RPC'ga tayanmaymiz.
        // Service kaliti yo'q / xato bo'lsa — eski yo'l (record_token_usage, foydalanuvchi JWT).
        if (userId) {
          try {
            const svc = createServiceClient();
            let { error: svcErr } = await svc.rpc("record_token_usage_for", { p_user: userId, ...base, p_upstream_model });
            // 0036 hali qo'llanmagan — eski imzo.
            if (svcErr?.code === "PGRST202") ({ error: svcErr } = await svc.rpc("record_token_usage_for", { p_user: userId, ...base }));
            if (!svcErr) return;
            console.error("[chat] record_token_usage_for:", svcErr.message);
          } catch (e) {
            console.error("[chat] record_token_usage_for:", e instanceof Error ? e.message : e);
          }
        }
        let { error } = await supabase.rpc("record_token_usage", { ...base, p_upstream_model });
        // 0036 hali qo'llanmagan — eski imzo (p_upstream_model yo'q).
        if (error?.code === "PGRST202") ({ error } = await supabase.rpc("record_token_usage", base));
        if (error) console.error("[chat] record_token_usage:", error.message);
      };

      /**
       * Javob ostidagi belgi uchun: so'ralgan ↔ haqiqiy model va shu javob uchun
       * hisobga yozilgan token. Raqamlar faqat server hisoblagani (recordUsage bo'laklab
       * yozadigan jami — usage-chunks.ts chegarasi bu yerda ham).
       */
      const answerMeta = (u: { input: number; output: number }): AnswerMeta => {
        const tokens = billableTotal(u);
        const billed = authed && modelCalls > 0 && tokens > 0;
        const requested = regionSwapFrom ?? (isAuto ? (answerStep?.modelId ?? modelId) : modelId);
        return {
          requested,
          served: cachedFrom ?? servedId,
          ...(servedUpstream && !cachedFrom ? { upstream: servedUpstream } : {}),
          fallback: !cachedFrom && (servedId !== requested || servedSubstituted || servedRescue),
          ...(servedRescue && !cachedFrom ? { rescue: true } : {}),
          ...(isAuto ? { auto: true } : {}),
          ...(cachedFrom ? { cached: true } : {}),
          tokens,
          billed,
          ...(billed && plan.limits.tokensPerMonth > 0
            ? { monthPct: Math.round((tokens / plan.limits.tokensPerMonth) * 10_000) / 100 }
            : {}),
          ...((regionSwapFrom || regionDroppedResearch) && country ? { region: country } : {}),
        };
      };

      /**
       * Savol kartasi navbati (javob modeli chaqirilmagan): kartani triage modeli tuzdi — `served` shu model,
       * token — triage'ning haqiqiy tokeni (halollik). Zaxira emas (boshqa bosqich), shuning uchun fallback yo'q.
       */
      const askMeta = (u: { input: number; output: number }): AnswerMeta => {
        const tokens = billableTotal(u);
        const billed = authed && tokens > 0;
        const requested = regionSwapFrom ?? (isAuto ? (answerStep?.modelId ?? modelId) : modelId);
        const triageModel = triageOutcomes.find((x) => x.outcome.model)?.outcome.model;
        return {
          requested,
          served: triageModel ?? requested,
          fallback: false,
          ...(isAuto ? { auto: true } : {}),
          tokens,
          billed,
          ...(billed && plan.limits.tokensPerMonth > 0
            ? { monthPct: Math.round((tokens / plan.limits.tokensPerMonth) * 10_000) / 100 }
            : {}),
          ...(regionSwapFrom && country ? { region: country } : {}),
        };
      };

      try {
        // ---- Chuqur so'rash: blocking triage natijasi (route boshida, planner bilan parallel olingan) ----
        if (blockingOutcome && blockingDecision) {
          const inquiryId = noteTriage(blockingOutcome, "blocking", blockingDecision);
          blockingInquiryId = inquiryId;
          if (askNow) {
            // "ask" qisqa tutashuvi: javob modeli, semantik kesh, connector, training capture va verifier YO'Q.
            // Keyingi navbat (kartaga javob) kunlik hisobga kirmaydi — freeInquiryReply (telemetriya id = inquiryId).
            send(inquiryEventOf(blockingDecision, "ask", inquiryId));
            askSent = true;
            send({ type: "done" });
            return; // meta, token hisobi, telemetriya, [DONE] — finally'da
          }
        }

        if (ctxMask && Object.keys(ctxMask.tokenMap).length) send({ type: "blind-map", tokens: ctxMask.tokenMap });
        if (activeSkills.length) send({ type: "skills", skills: activeSkills.map((s) => s.id) });
        if (isAuto) send({ type: "route", reason: routeReason, steps });
        // Mintaqa almashtiruvi darhol ko'rinsin (javob ostidagi belgi ham "so'ralgan → javob" deydi).
        if (regionSwapFrom) send({ type: "switch", from: regionSwapFrom, to: steps[0].modelId, reason: t("p10RegionUnavailable") });

        // Semantik keshdan tekshirish.
        if (canCache) {
          try {
            const supabase = await createClient();
            const hit = await lookupSemanticCache(supabase, lastText, lang);
            if (hit) {
              cachedFrom = hit.model;
              send({ type: "cache", model: hit.model, similarity: hit.similarity });
              // Javobni bo'laklab yuborish — foydalanuvchi streaming his qiladi.
              const parts = hit.answer.match(/\S+\s*|\s+/g) ?? [hit.answer];
              for (const p of parts) {
                send({ type: "text", text: p });
                await new Promise((r) => setTimeout(r, 5));
              }
              // Keshdagi javob ham "yubordim" deyishi mumkin — bu so'rovda hech qanday
              // connector chaqirilmagan (jurnal bo'sh).
              await postChecks({ text: hit.answer, ledger: [], unsourced: [], verify: null, answerModels: [hit.model] }).catch(() => {});
              send({ type: "done" });
              return; // [DONE] va close — finally'da (ikki marta yopilmasin)
            }
          } catch {
            /* kesh xatosi indamay o'tadi */
          }
        }

        // Parallel triage: javob darhol oqadi, triage fonda (TTFT o'zgarmaydi). Kesh urilsa — boshlanmaydi.
        if (inquiryGate === "parallel") parallelTriage = runTriage("parallel");

        // Havola yuborilgan bo'lsa — sahifani o'qib, kontekstga qo'shamiz.
        // Mijozdagi citations ro'yxati (oxirgi yuborilgani) — [n] belgilari shunga solishtiriladi.
        let clientCitations: string[] = [];
        // Research qidiruv natijalari (sarlavha/snippet) — faqat server ichida, verifier uchun.
        let searchSources: SearchSource[] = [];
        if (urls.length) {
          send({ type: "reading", urls });
          const { pages, prompt } = await readPages(urls);
          webContext = prompt;
          if (pages.length) {
            clientCitations = pages.map((p) => p.url);
            send({ type: "citations", citations: clientCitations });
          } else send({ type: "text", text: `${fmt(t("chPageOpenFailed"), { urls: urls.join(", ") })}\n\n` });
        }

        let researchContext = "";
        let cacheableAnswer = "";
        // Modellar yozgan barcha matn (research + answer) — da'vo va [n] tekshiruvi uchun.
        let modelText = "";
        let researchRan = false;

        // Connector tool bosqichi — AI ulangan Figma/GitHub'dan ma'lumot oladi,
        // natija javob konteksti sifatida qo'shiladi (streaming'ga tegmaydi).
        // Tizim jurnali: bu so'rovda haqiqatan chaqirilgan connector toollari va natijasi.
        let actionLedger: ActionRecord[] = [];
        try {
          if (isSupabaseConfigured()) {
            const sbc = await createClient();
            const { data: { user: cu } } = await sbc.auth.getUser();
            if (cu) {
              const enabled = await getEnabledConnectors(sbc, cu.id);
              if (enabled.length) {
                // Tool bosqichi DOIM arzon standart model (TOOL_MODEL / mintaqa zaxirasi) — javob modeli
                // (mas. Opus) har navbatda 3 martagacha platforma kalitida chaqirilmaydi.
                const run = await runConnectorTools({ supabase: sbc, userId: cu.id, providerModel: null, messages, enabled, signal: req.signal, country });
                if (run.context) connectorContext = run.context;
                actionLedger = run.actions;
                connectorUsage = run.usage;
                // Yozish amallari bajarilmadi — foydalanuvchi kartada tasdiqlaydi (connector-confirm).
                // Hodisada faqat server qurgan xulosa va shaffof ref bor (argumentlar serverda).
                for (const p of run.proposals) send(p);
              }
            }
          }
        } catch {
          // Connector ishlamasa javob baribir davom etadi.
        }

        for (let i = 0; i < steps.length; i++) {
          const step = steps[i];
          if (isAuto || steps.length > 1) send({ type: "step", modelId: step.modelId, kind: step.kind, purpose: step.purpose, index: i });

          // Feed prior research into the answer step. streamCompletion role:"system"
          // xabarlarni tashlab yuboradi — shuning uchun extraSystem orqali beriladi.
          const stepMessages = [...messages];
          const researchBlock =
            step.kind === "answer" && researchContext
              ? `Quyidagi TADQIQOT NATIJALARIDAN foydalanib to'liq javob/kod yoz. Manba raqamlarini [n] saqlab qol.\n\n${researchContext.slice(0, 12_000)}`
              : "";

          const extra = [
            researchBlock,
            langText,
            webContext,
            coworkContext,
            knowledgeText,
            knowledgeText ? GROUNDED_GENERATION : "",
            memoryText,
            skillText,
            plan.limits.fullCode ? "" : SIMPLE_CHAT_GUARDRAIL,
            step.kind === "answer" && connectorContext
              ? `ULANGAN SERVICE MA'LUMOTLARI (connector natijalari — javobda ishlat; "AMALLAR HOLATI"ga zid gapirma):
${connectorContext}`
              : "",
            step.kind === "answer" ? ACTION_HONESTY : "",
            // Chuqur so'rash: taxminlar / "javobni nima o'zgartiradi" / mutaxassis / EMERGENCY_FIRST.
            step.kind === "answer" ? inquiryAddendum : "",
            step.kind === "answer" && mode?.prompt ? mode.prompt : "",
          ]
            .filter(Boolean)
            .join("\n\n");
          let stepText = "";
          // Model band yoki krediti tugagan bo'lsa — javobsiz qoldirmay, ruxsat
          // etilgan boshqa modelga o'tamiz va buni foydalanuvchiga aytamiz.
          // Auto qadami o'z navbatini olib keladi (tarif × vazifa); qo'lda tanlangan
          // model uchun esa — shu turdagi, tarif ruxsat bergan zaxiralar.
          const manualFallbacks = () => fallbackModelIds(step.modelId, (tier) => planAllowsTier(plan, tier));
          // Tekin tarif: tanlangan model yiqilsa avval Groq → Cloudflare (chain.ts), keyin eski zaxiralar.
          // Research (Perplexity) qadami bundan mustasno — u boshqa turdagi model.
          const freeChain = !planAllowsTier(plan, "starter") && step.kind !== "research";
          const baseCandidates = step.fallbacks?.length
            ? step.fallbacks
            : freeChain
              ? freePlanCandidates(step.modelId, manualFallbacks(), available)
              : [step.modelId, ...manualFallbacks()];
          // Mintaqa siyosati: zaxiralar ham faqat ruxsat etilgan provayderlardan.
          const candidates = country
            ? regionDecision({
                requested: step.modelId,
                candidates: baseCandidates,
                country,
                tier: MODEL_BY_ID[step.modelId]?.tier,
                code: isCodeRequest(lastText),
                tierAllowed,
                available,
              }).candidates
            : baseCandidates;
          if (!candidates.length) {
            send({ type: "error", message: t("p10RegionNoModels") });
            break;
          }
          for (let ci = 0; ci < candidates.length; ci++) {
            const candidate = candidates[ci];
            let failure = "";
            modelCalls++;
            // Bu nomzod upstream'dan qaysi model bilan javob berdi ("served" — faqat server ichida).
            let candServed: { model: string; substituted: boolean; rescue?: boolean; provider?: string } | null = null;
            for await (const ev of streamCompletion({
              modelId: candidate,
              research: step.kind === "research",
              messages: stepMessages,
              maxTokens: plan.limits.maxTokens,
              extraSystem: extra || undefined,
              signal: req.signal,
              lang,
              // Bepul "rescue" gateway faqat oxirgi nomzodda — avval o'z zaxiralarimiz.
              freeRescue: ci === candidates.length - 1,
              country,
              planTier: plan.id,
              deadline: requestDeadline,
              exclude: [...meshFailed],
              onProviderFailed: (p) => meshFailed.add(p),
            })) {
              if (ev.type === "done") break;
              if (ev.type === "served") {
                candServed = { model: ev.model, substituted: ev.substituted, rescue: ev.rescue, provider: ev.provider };
                continue;
              }
              if (ev.type === "error") {
                failure = ev.message;
                break;
              }
              if (ev.type === "text") {
                stepText += ev.text;
                billedOutChars += ev.text.length;
              }
              if (ev.type === "citations") {
                // Qidiruv snippetlari faqat verifier uchun — mijozga faqat URL ro'yxati.
                clientCitations = ev.citations;
                if (ev.sources?.length) searchSources = ev.sources;
                send({ type: "citations", citations: ev.citations });
                continue;
              }
              // Separate visible sections when a second step begins.
              send(ev);
            }
            if (step === answerStep && (candServed || !failure)) {
              servedId = candidate;
              servedUpstream = candServed?.model;
              servedProvider = candServed?.provider;
              servedSubstituted = candServed?.substituted ?? false;
              servedRescue = candServed?.rescue ?? false;
            }
            if (!failure) break;
            const next = candidates[ci + 1];
            if (!next || stepText || Date.now() >= requestDeadline) {
              // Nothing left to try (or we already showed part of an answer, or the overall deadline passed).
              send({ type: "error", message: failure });
              break;
            }
            send({ type: "switch", from: candidate, to: next, reason: failure });
          }
          modelText += `${stepText}\n\n`;
          if (step.kind === "research") {
            researchRan = true;
            researchContext = stepText;
            if (steps.length > 1) send({ type: "text", text: "\n\n---\n\n" });
          } else if (step.kind === "answer") {
            cacheableAnswer = stepText;
          }
        }

        // Yozuv izchilligi (lotin/kirill aralash, o'zbekcha kirill o'rniga ruscha) — faqat log.
        if (cacheableAnswer) {
          const drift = scriptDrift(lastText, cacheableAnswer);
          if (drift) console.warn("[chat] yozuv siljishi:", JSON.stringify({ ...drift, model: servedId, lang }));
        }

        // Muvaffaqiyatli tugagach — yangi javobni keshga yozamiz. Zaxira (boshqa model)
        // javobi keshlanmaydi: keyin u tanlangan model nomi bilan qaytmasin.
        // Ulangan servis (Gmail/GitHub …) yoki o'qilgan sahifa ma'lumoti bilan yozilgan javob — shaxsiy:
        // umumiy (foydalanuvchilararo) keshga tushmaydi.
        if (canCache && cacheableAnswer && steps.length === 1 && !servedSubstituted && !servedRescue && !connectorContext && !webContext) {
          try {
            const supabase = await createClient();
            void saveSemanticCache(supabase, lastText, cacheableAnswer, servedId, lang);
          } catch {
            /* ignore */
          }
        }

        // ---- Chuqur so'rash: follow-up chip'lar (answer_then_ask) — javob tugagach (§A.8 5–6) ----
        // Parallel triage o'z taymautiga ega (4 s, so'rov boshidan): tayyor bo'lmasa null → chip yo'q.
        // Verifier bilan bir vaqtda — [DONE] qo'shimcha kutmaydi (odatda triage javobdan oldin tugaydi).
        const followupDone = (async (): Promise<FinalDecision | null> => {
          let fd: FinalDecision | null = null;
          let fid = "";
          if (blockingDecision) {
            fd = blockingDecision;
            fid = blockingInquiryId;
          } else if (parallelTriage && !parallelNoted) {
            parallelNoted = true;
            const out = await parallelTriage;
            fd = decide(out.result, decideCtx("parallel"));
            fid = noteTriage(out, "parallel", fd);
          }
          if (
            fd &&
            fid &&
            emitInquiry &&
            cacheableAnswer &&
            !req.signal.aborted &&
            fd.decision === "answer_then_ask" &&
            fd.questions.length
          ) {
            send(inquiryEventOf(fd, "followup", fid));
          }
          return fd;
        })().catch((): FinalDecision | null => null);

        // Javobdan keyingi tekshiruvlar (streaming tugagandan keyin "verifier" hodisasi):
        //  1) Amal da'volari: javob "yubordim/yaratdim/saqladim" desa — connector jurnalida
        //     shu amal ✓ bajarilganmi? (deterministik; faqat chegaradagi gap arzon modelga).
        //  2) Research [n]: manbalar ro'yxatidan tashqaridagi belgilar — "manbasiz".
        //  3) Fakt-verifier (arzon model): javob modeli ko'rgan manbalar (o'qilgan sahifa,
        //     bilim bazasi, research qidiruv natijalari) bo'lsa — SHU manbalarga solishtiriladi;
        //     aks holda faqat modelning o'z bilimi (UI buni alohida belgilaydi).
        const checksDone = (async () => {
          try {
            const verifyText = cacheableAnswer || researchContext;
            const searchCtx = formatSearchSources(searchSources);
            // connectorContext (Gmail/Sheets/GitHub ma'lumotlari) atayin YO'Q: maxfiylik —
            // shaxsiy servis ma'lumotlari tekshiruvchi uchun qo'shimcha modelga yuborilmaydi.
            const sources = [searchCtx.text, webContext, knowledgeText].filter(Boolean).join("\n\n");
            // Qidiruv faqat sarlavha/URL qaytargan va boshqa manba yo'q — faqat atributsiya.
            const attributionOnly = Boolean(searchCtx.text) && !searchCtx.withContent && !webContext && !knowledgeText;
            // Manbali tekshiruv qisqa javobga ham arziydi; manbasiz "ikkinchi fikr" — faqat uzun javobga.
            const minChars = sources ? 150 : 300;
            // Fakt-verifier — mustaqil hakam (judge.ts): javobni yaratgan kompaniyadan BOSHQA
            // kompaniyaning modeli; mintaqa siyosati hakamga ham qo'llanadi (cheklangan mintaqada
            // faqat u yerda ruxsat etilgan kompaniyalar).
            const shouldVerify = verifyText.length >= minChars && isFactualProse(verifyText);
            // Javob muallifi: upstream qaytargan haqiqiy model + nomzod id + reja qadamlari
            // (research — Perplexity). Hammasining kompaniyasi hakamlikdan chiqariladi.
            // Aralash auto/* (auto/best-free ...) served model ma'lum bo'lsa unga yechiladi, aks holda
            // hakam u yo'naltira oladigan barcha kompaniyalardan tanlanmaydi (judge.ts answerModelsFor).
            const answerModels = answerModelsFor(
              cacheableAnswer ? [servedUpstream, cachedFrom ?? servedId] : [],
              steps.map((s) => s.modelId),
            );
            await postChecks({
              text: modelText,
              ledger: actionLedger,
              unsourced: researchRan || clientCitations.length ? unsourcedMarkers(modelText, clientCitations.length) : [],
              answerModels,
              verify: shouldVerify
                ? () =>
                    verifyAnswer(lastText, verifyText, sources, {
                      attributionOnly,
                      numbered: Boolean(searchCtx.text),
                      lang,
                      signal: req.signal,
                      answerModel: answerModels,
                      country,
                    })
                : null,
            });
          } catch {
            /* tekshiruvlar ixtiyoriy — xato bo'lsa jim */
          }
        })();

        const followDecision = await followupDone;

        // Tella 2 uchun trening namunasi (distillation). Maxfiy manbali
        // suhbatlar va rozilik bermaganlar training.ts ichida rad etiladi.
        // Chuqur so'rash (§A.8 8-band): inquiry navbati (karta javobi/skip, taxminli javob, favqulodda) va
        // legal/medical/financial sohadagi javoblar trening bazasiga YOZILMAYDI.
        const inquiryPrivate =
          !!inquiryReply ||
          inquiryReq?.skip === true ||
          pre.emergency ||
          !!pre.highStakesDomain ||
          [blockingDecision, followDecision].some(
            (d) => !!d && (d.decision !== "answer" || d.emergency || isSensitiveDomain(d.domain)),
          );
        if (cacheableAnswer && typeof lastUser === "string" && !inquiryPrivate) {
          void captureSample({
            question: lastText,
            answer: cacheableAnswer,
            model: servedUpstream ?? servedId,
            // Xotira, ulangan servis (GitHub/Figma), o'qilgan sahifalar va biriktirilgan
            // fayl/transkript ham shaxsiy kontekst — bunday javob trening bazasiga tushmaydi.
            hasPrivateContext: Boolean(
              hasAttachment ||
                docIds.length ||
                coworkContext ||
                knowledgeText ||
                memoryText ||
                connectorContext ||
                webContext ||
                customText,
            ),
            optedIn: trainingOptIn,
          });
        }

        await checksDone;
      } catch (err) {
        if (!(err instanceof Error && err.name === "AbortError")) {
          // Xom xato (provayder/infra tafsiloti) foydalanuvchiga emas — logga.
          console.error("[chat] stream xato:", err);
          send({ type: "error", message: t("chUnknownError") });
        }
      } finally {
        // Xato sabab follow-up bosqichiga yetmagan parallel triage ham hisobga olinadi (token + telemetriya).
        if (parallelTriage && !parallelNoted) {
          parallelNoted = true;
          const out = await parallelTriage.catch(() => null);
          if (out) noteTriage(out, "parallel", decide(out.result, decideCtx("parallel")));
        }
        // Bekor qilingan / uzilgan oqim ham hisobga olinadi (oylik token limiti).
        const usage = usageEstimate();
        const triU = triageUsage();
        // Connector tool bosqichi sarfi belgidagi tokenga ham qo'shiladi (foydalanuvchi limitidan yechiladi).
        const connU = connectorUsage ? { input: connectorUsage.input, output: connectorUsage.output } : { input: 0, output: 0 };
        // R1-4: sezgir navbat (favqulodda, yuqori xavf regex'i, sezgir soha karta/triage) — mijoz avtomatik
        // xotiraga yozmaydi (kartasiz "answer", mode "off" va triage taymauti holatlari ham).
        const sensitive =
          pre.emergency ||
          !!pre.highStakesDomain ||
          isSensitiveDomain(inquiryReply?.domain) ||
          triageOutcomes.some((x) => x.decision.emergency || isSensitiveDomain(x.decision.domain));
        const sens = sensitive ? { sensitive: true } : {};
        try {
          if (modelCalls > 0 || cachedFrom) {
            // Belgidagi token — javob + triage (halollik: foydalanuvchi limitidan ikkalasi ham yechiladi).
            send({
              type: "meta",
              ...answerMeta({ input: usage.input + triU.input + connU.input, output: usage.output + triU.output + connU.output }),
              ...sens,
            });
          } else if (askSent) {
            send({ type: "meta", ...askMeta(triU), ...sens });
          }
        } catch {
          /* mijoz uzilgan */
        }
        // Telemetriya ask navbatida [DONE] dan OLDIN yozilishi shart: keyingi reply navbati shu qatorni tekshiradi.
        await Promise.all([
          recordUsage(usage).catch((e) => console.error("[chat] record_token_usage:", e)),
          ...triageOutcomes.map(({ outcome }) =>
            outcome.usage && outcome.model
              ? recordUsage(
                  { input: outcome.usage.prompt_tokens, output: outcome.usage.completion_tokens },
                  { model: outcome.model, provider: outcome.provider },
                ).catch((e) => console.error("[chat] record_token_usage (triage):", e))
              : Promise.resolve(),
          ),
          connectorUsage
            ? recordUsage(
                { input: connectorUsage.input, output: connectorUsage.output },
                { model: connectorUsage.model, provider: connectorUsage.provider },
              ).catch((e) => console.error("[chat] record_token_usage (connector):", e))
            : Promise.resolve(),
          ...inquiryJobs,
        ]);
        try {
          controller.enqueue(done);
          controller.close();
        } catch {
          /* mijoz uzilgan — oqim allaqachon yopiq */
        }
      }
    },
  });

  return new Response(stream, { headers });
}

/**
 * Fakt-tekshiruv faqat faktlarga boy oddiy matnga arziydi: asosan kod,
 * jonli komponent yoki aniqlashtiruvchi savollardan iborat javobni tekshirish
 * foydasiz (oldin savollar "da'vo" sifatida tekshirilib chiqardi).
 */
function isFactualProse(answer: string): boolean {
  const code = (answer.match(/```[\s\S]*?```/g) ?? []).reduce((n, b) => n + b.length, 0);
  if (code / answer.length >= 0.3) return false;
  if (answer.includes("```sovereign-ui")) return false;
  const questions = answer.split("\n").filter((l) => l.trim().endsWith("?")).length;
  return questions < 3;
}
