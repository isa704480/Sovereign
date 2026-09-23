import { z } from "zod";
import {
  fallbackModelIds,
  GROUNDED_GENERATION,
  SIMPLE_CHAT_GUARDRAIL,
  streamCompletion,
  type StreamEvent,
} from "@/lib/ai/providers";
import { lookupSemanticCache, saveSemanticCache } from "@/lib/ai/cache";
import { verifyAnswer } from "@/lib/ai/verifier";
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

async function resolveEntitlement(lastText: string, docIds: string[]): Promise<{
  authed: boolean;
  plan: Plan;
  usedToday: number;
  memoryText: string;
  knowledgeText: string;
  trainingOptIn: boolean;
}> {
  if (!isSupabaseConfigured()) {
    // Local development-only: Supabase sozlanmagan bo'lsa demo rejim.
    return { authed: false, plan: PLAN_BY_ID.ultra, usedToday: 0, memoryText: "", knowledgeText: "", trainingOptIn: false };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { authed: false, plan: PLAN_BY_ID.free, usedToday: 0, memoryText: "", knowledgeText: "", trainingOptIn: false };
  }
  const profile = await getProfile(supabase, user.id);
  // Migration 0010 dan keyin messages_today() argumentsiz — auth.uid()'ni ishlatadi.
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
    memoryText,
    knowledgeText,
    // Ustunsiz (eski) bazada ham xavfsiz: faqat aniq false bo'lsa o'chiq.
    trainingOptIn: profile?.training_opt_in !== false,
  };
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
  const ipRl = rateLimit(`chat:ip:${ip}`, 30, 60_000); // 30/min per IP
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
    messages,
    docIds,
    customSkills,
    context: coworkContext,
    lang,
    agentMode,
  } = parsed.data;
  // Foydalanuvchiga ko'rinadigan xabarlar — interfeys tilida.
  const t = (key: TKey) => translate(lang, key);
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
  const { authed, plan, usedToday, memoryText, knowledgeText, trainingOptIn } = await resolveEntitlement(
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

  if (usedToday >= plan.limits.messagesPerDay) {
    return refuse(`${UPGRADE} ${fmt(t("chDailyLimit"), { n: plan.limits.messagesPerDay, plan: plan.name })}`);
  }

  // ---- Build the execution plan (single model, or Auto orchestration) ----
  const routePlan = isAuto ? await planRouteLLM(lastUser ?? "", plan, lang) : null;
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
        if (urls.length) {
          send({ type: "reading", urls });
          const { pages, prompt } = await readPages(urls);
          webContext = prompt;
          if (pages.length) send({ type: "citations", citations: pages.map((p) => p.url) });
          else send({ type: "text", text: `${fmt(t("chPageOpenFailed"), { urls: urls.join(", ") })}\n\n` });
        }

        let researchContext = "";
        let cacheableAnswer = "";

        // Connector tool bosqichi — AI ulangan Figma/GitHub'dan ma'lumot oladi,
        // natija javob konteksti sifatida qo'shiladi (streaming'ga tegmaydi).
        let connectorContext = "";
        try {
          if (isSupabaseConfigured()) {
            const sbc = await createClient();
            const { data: { user: cu } } = await sbc.auth.getUser();
            if (cu) {
              const enabled = await getEnabledConnectors(sbc, cu.id);
              if (enabled.length) {
                const answerStep = steps.find((s) => s.kind === "answer") ?? steps[steps.length - 1];
                const pm = MODEL_BY_ID[answerStep.modelId]?.providerModel ?? answerStep.modelId;
                const ctx = await runConnectorTools({ supabase: sbc, userId: cu.id, providerModel: pm, messages, enabled, signal: req.signal });
                if (ctx) connectorContext = ctx;
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
              ? `ULANGAN SERVICE MA'LUMOTLARI (connector natijalari — javobda ishlat):
${connectorContext}`
              : "",
            step.kind === "answer" && mode?.prompt ? mode.prompt : "",
          ]
            .filter(Boolean)
            .join("\n\n");
          let stepText = "";
          // Model band yoki krediti tugagan bo'lsa — javobsiz qoldirmay, ruxsat
          // etilgan boshqa modelga o'tamiz va buni foydalanuvchiga aytamiz.
          const candidates = [
            step.modelId,
            ...fallbackModelIds(step.modelId, (tier) => planAllowsTier(plan, tier)),
          ];
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
            })) {
              if (ev.type === "done") break;
              if (ev.type === "error") {
                failure = ev.message;
                break;
              }
              if (ev.type === "text") stepText += ev.text;
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
          if (step.kind === "research") {
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
        if (authed && cacheableAnswer) {
          try {
            const supabase = await createClient();
            const inputEstimate = Math.round(lastText.length / 4);
            const outputEstimate = Math.round(cacheableAnswer.length / 4);
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
            hasPrivateContext: Boolean(docIds.length || coworkContext || knowledgeText),
            optedIn: trainingOptIn,
          });
        }

        // Verifier: uzun faktual javoblarni haiku bilan tekshirish.
        // Streaming tugagandan keyin qo'shimcha "verifier" eventi keladi.
        if (cacheableAnswer.length >= 300 && !research) {
          try {
            const issues = await verifyAnswer(lastText, cacheableAnswer);
            if (issues.length > 0) send({ type: "verifier", issues });
          } catch {
            /* verifier ixtiyoriy — xato bo'lsa jim */
          }
        }
      } catch (err) {
        if (!(err instanceof Error && err.name === "AbortError")) {
          send({ type: "error", message: err instanceof Error ? err.message : t("chUnknownError") });
        }
      } finally {
        controller.enqueue(done);
        controller.close();
      }
    },
  });

  return new Response(stream, { headers });
}
