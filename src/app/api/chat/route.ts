import { z } from "zod";
import {
  fallbackModelIds,
  GROUNDED_GENERATION,
  SIMPLE_CHAT_GUARDRAIL,
  streamCompletion,
  type SearchSource,
  type StreamEvent,
} from "@/lib/ai/providers";
import { lookupSemanticCache, saveSemanticCache } from "@/lib/ai/cache";
import { confirmActionClaims, formatSearchSources, verifyAnswer, type VerifierIssue } from "@/lib/ai/verifier";
import { checkClaims, detectActionClaims, unsourcedMarkers, type ActionRecord, type ClaimReason, type UnsupportedClaim } from "@/lib/ai/claims";
import { planRouteLLM } from "@/lib/ai/router";
import { AUTO_MODEL_ID, MODEL_BY_ID } from "@/config/models";
import { PLAN_BY_ID, planAllowsTier, planForTier, TIER_LABEL, type Plan } from "@/config/plans";
import { resolveActiveSkills, skillsPrompt } from "@/config/skills";
import { AGENT_MODE_BY_ID } from "@/config/agent-modes";
import { getMemories, memoryPrompt } from "@/lib/ai/memory";
import { fetchMentionedDocs, knowledgePrompt, retrieveKnowledge } from "@/lib/ai/knowledge";
import { extractUrls, readPages } from "@/lib/ai/web-read";
import { captureSample } from "@/lib/ai/training";
import { getEnabledConnectors, runConnectorTools } from "@/lib/ai/connector-tools";
import { fmt, LANG_FOR_AI, pick, translate, type TKey } from "@/lib/i18n";
import { getServerT } from "@/lib/i18n-server";
import { TIER_TEXT } from "@/lib/locales/plans";
import { effectivePlan, getProfile } from "@/lib/auth/profile";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";

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

const bodySchema = z.object({
  modelId: z.string().min(1).max(100),
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
  /** Interfeys tili — javob shu tilda (foydalanuvchi boshqa tilda yozmasa). */
  lang: z.enum(["uz", "uz-cyrl", "ru", "en"]).optional().default("uz"),
  agentMode: z.string().max(40).optional().default("general"),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant", "system"]),
        content: z.union([z.string().max(20_000), z.array(contentPart).max(12)]),
      }),
    )
    .min(1)
    .max(24),
});

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
  plan: Plan;
  usedToday: number;
  tokensUsedMonth: number;
  memoryText: string;
  knowledgeText: string;
  trainingOptIn: boolean;
}> {
  const none = { usedToday: 0, tokensUsedMonth: 0, memoryText: "", knowledgeText: "", trainingOptIn: false };
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
  // "@hujjat" mentions win over similarity search: the user named the source.
  const hits = docIds.length
    ? await fetchMentionedDocs(supabase, docIds)
    : lastText
      ? await retrieveKnowledge(supabase, user.id, lastText, 6)
      : [];
  const knowledgeText = knowledgePrompt(hits);
  return {
    authed: true,
    plan: effectivePlan(profile),
    usedToday: typeof used === "number" ? used : 0,
    tokensUsedMonth,
    memoryText,
    knowledgeText,
    // Ustunsiz (eski) bazada ham xavfsiz: faqat aniq false bo'lsa o'chiq.
    trainingOptIn: profile?.training_opt_in !== false,
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

export async function POST(req: Request) {
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
    context: coworkContext,
    lang,
    agentMode,
  } = parsed.data;
  // Foydalanuvchiga ko'rinadigan xabarlar — interfeys tilida.
  const t = (key: TKey) => translate(lang, key);
  // System xabarlarni faqat server qo'shadi — mijoz yuborgan role:"system"
  // (prompt-injection / guardrail'ni chetlash) tashlab yuboriladi.
  const messages = rawMessages.filter((m) => m.role !== "system");
  if (!messages.some((m) => m.role === "user")) return Response.json({ error: t("chBadRequest") }, { status: 400 });
  const mode = AGENT_MODE_BY_ID[agentMode];
  const research = reqResearch || !!mode?.autoResearch;
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
  const { authed, plan, usedToday, tokensUsedMonth, memoryText, knowledgeText, trainingOptIn } = await resolveEntitlement(
    lastText,
    docIds,
  );
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

  const dailyLimitMsg = `${UPGRADE} ${fmt(t("chDailyLimit"), { n: plan.limits.messagesPerDay, plan: plan.name })}`;
  if (usedToday >= plan.limits.messagesPerDay) {
    return refuse(dailyLimitMsg);
  }
  // Oylik token limiti (0015 tokens_used_month) — endi majburiy.
  if (authed && tokensUsedMonth >= plan.limits.tokensPerMonth) {
    return refuse(`${UPGRADE} ${fmt(t("secMonthlyTokenLimit"), { plan: plan.name })}`);
  }

  // ---- Build the execution plan (single model, or Auto orchestration) ----
  const routePlan = isAuto ? await planRouteLLM(lastUser ?? "", plan, lang, req.signal) : null;
  const steps = routePlan
    ? routePlan.steps
    : [
        {
          modelId,
          kind: (research || (!isOmni && MODEL_BY_ID[modelId].category === "research") ? "research" : "answer") as
            | "research"
            | "answer",
          purpose: "",
        },
      ];
  const routeReason = routePlan?.reason ?? "";

  // OmniRoute katalog gating: aniq modellar (mas. "dva/claude-opus-5-high") Pro+
  // tarifda ochiladi. "auto/*" kombolari (tekin yo'naltirish) barcha tarifda ochiq.
  if (isOmni && !modelId.startsWith("auto/") && !planAllowsTier(plan, "pro")) {
    return refuse(`${UPGRADE} ${t("chOmniProOnly")}`);
  }

  // Research (Perplexity) — Starter/Free'da yopiq. Aniq model tekshiruvidan tashqari
  // auto/* va OmniRoute modellarida ham: aks holda `research:true` bilan chetlab o'tilardi.
  if ((isAuto || isOmni) && research && !plan.limits.research) {
    return refuse(`${UPGRADE} ${t("chResearchPro")}`);
  }

  // Plan gating for a concrete (non-auto) model.
  if (!isAuto && !isOmni) {
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
  if (authed) {
    try {
      const supabase = await createClient();
      const { data: allowed, error } = await supabase.rpc("consume_message", {
        p_limit: plan.limits.messagesPerDay,
      });
      if (error) console.error("[chat] consume_message:", error.message);
      else if (allowed !== true) return refuse(dailyLimitMsg);
    } catch (e) {
      // Migratsiya hali qo'llanmagan bo'lsa — yuqoridagi messages_today zaxira.
      console.error("[chat] consume_message:", e);
    }
  }

  // Semantic cache: faqat oddiy savol (RAG/xotira/attach yo'q, research emas)
  // — foydalanuvchi savoli o'xshash bo'lsa modelga bormay javob qaytariladi.
  // Havolali savol keshlanmaydi — sahifa mazmuni o'zgarib turadi.
  const urls = extractUrls(lastText);
  const canCache =
    isSupabaseConfigured() &&
    !research &&
    !isAuto &&
    urls.length === 0 &&
    !knowledgeText &&
    !memoryText &&
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
          borderline.length
            ? confirmActionClaims(borderline.map((c) => c.text), req.signal).catch(() => null)
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
        send({ type: "verifier", issues: all });
      };

      try {
        if (activeSkills.length) send({ type: "skills", skills: activeSkills.map((s) => s.id) });
        if (isAuto) send({ type: "route", reason: routeReason, steps });

        // Semantik keshdan tekshirish.
        if (canCache) {
          try {
            const supabase = await createClient();
            const hit = await lookupSemanticCache(supabase, lastText);
            if (hit) {
              send({ type: "cache", model: hit.model, similarity: hit.similarity });
              // Javobni bo'laklab yuborish — foydalanuvchi streaming his qiladi.
              const parts = hit.answer.match(/\S+\s*|\s+/g) ?? [hit.answer];
              for (const p of parts) {
                send({ type: "text", text: p });
                await new Promise((r) => setTimeout(r, 5));
              }
              // Keshdagi javob ham "yubordim" deyishi mumkin — bu so'rovda hech qanday
              // connector chaqirilmagan (jurnal bo'sh).
              await postChecks({ text: hit.answer, ledger: [], unsourced: [], verify: null }).catch(() => {});
              send({ type: "done" });
              controller.enqueue(done);
              controller.close();
              return;
            }
          } catch {
            /* kesh xatosi indamay o'tadi */
          }
        }

        // Havola yuborilgan bo'lsa — sahifani o'qib, kontekstga qo'shamiz.
        let webContext = "";
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
        // Oylik token hisobi uchun: BARCHA qadamlar (research ham) chiqishi.
        let billedOutChars = 0;

        // Connector tool bosqichi — AI ulangan Figma/GitHub'dan ma'lumot oladi,
        // natija javob konteksti sifatida qo'shiladi (streaming'ga tegmaydi).
        let connectorContext = "";
        // Tizim jurnali: bu so'rovda haqiqatan chaqirilgan connector toollari va natijasi.
        let actionLedger: ActionRecord[] = [];
        try {
          if (isSupabaseConfigured()) {
            const sbc = await createClient();
            const { data: { user: cu } } = await sbc.auth.getUser();
            if (cu) {
              const enabled = await getEnabledConnectors(sbc, cu.id);
              if (enabled.length) {
                const answerStep = steps.find((s) => s.kind === "answer") ?? steps[steps.length - 1];
                // Faqat katalog modeli (tarif tekshiruvidan o'tgan); OmniRoute/xom id → null (standart model).
                const pm = MODEL_BY_ID[answerStep.modelId]?.providerModel ?? null;
                const run = await runConnectorTools({ supabase: sbc, userId: cu.id, providerModel: pm, messages, enabled, signal: req.signal });
                if (run.context) connectorContext = run.context;
                actionLedger = run.actions;
              }
            }
          }
        } catch {
          // Connector ishlamasa javob baribir davom etadi.
        }

        for (let i = 0; i < steps.length; i++) {
          const step = steps[i];
          if (isAuto || steps.length > 1) send({ type: "step", modelId: step.modelId, kind: step.kind, purpose: step.purpose, index: i });

          // Feed prior research into the answer step.
          const stepMessages = [...messages];
          if (step.kind === "answer" && researchContext) {
            stepMessages.push({
              role: "system",
              content: `Quyidagi TADQIQOT NATIJALARIDAN foydalanib to'liq javob/kod yoz. Manba raqamlarini [n] saqlab qol.\n\n${researchContext.slice(0, 12_000)}`,
            });
          }

          const extra = [
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
            step.kind === "answer" && mode?.prompt ? mode.prompt : "",
          ]
            .filter(Boolean)
            .join("\n\n");
          let stepText = "";
          // Model band yoki krediti tugagan bo'lsa — javobsiz qoldirmay, ruxsat
          // etilgan boshqa modelga o'tamiz va buni foydalanuvchiga aytamiz.
          // Auto qadami o'z navbatini olib keladi (tarif × vazifa); qo'lda tanlangan
          // model uchun esa — shu turdagi, tarif ruxsat bergan zaxiralar.
          const candidates = step.fallbacks?.length
            ? step.fallbacks
            : [step.modelId, ...fallbackModelIds(step.modelId, (tier) => planAllowsTier(plan, tier))];
          for (let ci = 0; ci < candidates.length; ci++) {
            const candidate = candidates[ci];
            let failure = "";
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
            })) {
              if (ev.type === "done") break;
              if (ev.type === "error") {
                failure = ev.message;
                break;
              }
              if (ev.type === "text") stepText += ev.text;
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
            if (!failure) break;
            const next = candidates[ci + 1];
            if (!next || stepText) {
              // Nothing left to try (or we already showed part of an answer).
              send({ type: "error", message: failure });
              break;
            }
            send({ type: "switch", from: candidate, to: next, reason: failure });
          }
          billedOutChars += stepText.length;
          modelText += `${stepText}\n\n`;
          if (step.kind === "research") {
            researchRan = true;
            researchContext = stepText;
            if (steps.length > 1) send({ type: "text", text: "\n\n---\n\n" });
          } else if (step.kind === "answer") {
            cacheableAnswer = stepText;
          }
        }

        // Muvaffaqiyatli tugagach — yangi javobni keshga yozamiz.
        if (canCache && cacheableAnswer && steps.length === 1) {
          try {
            const supabase = await createClient();
            void saveSemanticCache(supabase, lastText, cacheableAnswer, steps[0].modelId);
          } catch {
            /* ignore */
          }
        }

        // Token hisobini yozib qo'yamiz (billing va admin analytics uchun).
        // Aniq son hisob qilinmaydi — modelning javob uzunligi asosida taxminlaymiz
        // (~4 char = 1 token).
        if (authed && billedOutChars > 0) {
          try {
            const supabase = await createClient();
            // Kirish: butun tarix + qo'shimcha kontekst (xotira, bilim bazasi, web, connector)
            // har qadamda qayta yuboriladi — faqat oxirgi savol emas.
            const historyChars = messages.reduce((n, m) => n + textOf(m.content).length, 0);
            const contextChars = [webContext, coworkContext, knowledgeText, memoryText, skillText, connectorContext].join("").length;
            const inputEstimate = Math.round(((historyChars + contextChars) * steps.length) / 4);
            const outputEstimate = Math.round(billedOutChars / 4);
            void supabase.rpc("record_token_usage", {
              p_input_tokens: inputEstimate,
              p_output_tokens: outputEstimate,
              p_model: steps[steps.length - 1]?.modelId ?? modelId,
              p_provider: null,
            });
          } catch {
            /* jim */
          }
        }

        // Tella 2 uchun trening namunasi (distillation). Maxfiy manbali
        // suhbatlar va rozilik bermaganlar training.ts ichida rad etiladi.
        if (cacheableAnswer && typeof lastUser === "string") {
          void captureSample({
            question: lastText,
            answer: cacheableAnswer,
            model: steps[steps.length - 1]?.modelId ?? modelId,
            // Xotira, ulangan servis (GitHub/Figma) va o'qilgan sahifalar ham
            // shaxsiy kontekst — bunday javob trening bazasiga tushmaydi.
            hasPrivateContext: Boolean(
              docIds.length || coworkContext || knowledgeText || memoryText || connectorContext || webContext || customText,
            ),
            optedIn: trainingOptIn,
          });
        }

        // Javobdan keyingi tekshiruvlar (streaming tugagandan keyin "verifier" hodisasi):
        //  1) Amal da'volari: javob "yubordim/yaratdim/saqladim" desa — connector jurnalida
        //     shu amal ✓ bajarilganmi? (deterministik; faqat chegaradagi gap arzon modelga).
        //  2) Research [n]: manbalar ro'yxatidan tashqaridagi belgilar — "manbasiz".
        //  3) Fakt-verifier (arzon model): javob modeli ko'rgan manbalar (o'qilgan sahifa,
        //     bilim bazasi, research qidiruv natijalari) bo'lsa — SHU manbalarga solishtiriladi;
        //     aks holda faqat modelning o'z bilimi (UI buni alohida belgilaydi).
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
          const shouldVerify = verifyText.length >= minChars && isFactualProse(verifyText);
          await postChecks({
            text: modelText,
            ledger: actionLedger,
            unsourced: researchRan || clientCitations.length ? unsourcedMarkers(modelText, clientCitations.length) : [],
            verify: shouldVerify
              ? () =>
                  verifyAnswer(lastText, verifyText, sources, {
                    attributionOnly,
                    numbered: Boolean(searchCtx.text),
                    signal: req.signal,
                  })
              : null,
          });
        } catch {
          /* tekshiruvlar ixtiyoriy — xato bo'lsa jim */
        }
      } catch (err) {
        if (!(err instanceof Error && err.name === "AbortError")) {
          // Xom xato (provayder/infra tafsiloti) foydalanuvchiga emas — logga.
          console.error("[chat] stream xato:", err);
          send({ type: "error", message: t("chUnknownError") });
        }
      } finally {
        controller.enqueue(done);
        controller.close();
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
