import { z } from "zod";
import { GROUNDED_GENERATION, SIMPLE_CHAT_GUARDRAIL, streamCompletion, type StreamEvent } from "@/lib/ai/providers";
import { lookupSemanticCache, saveSemanticCache } from "@/lib/ai/cache";
import { verifyAnswer } from "@/lib/ai/verifier";
import { planRouteLLM } from "@/lib/ai/router";
import { AUTO_MODEL_ID, MODEL_BY_ID } from "@/config/models";
import { PLAN_BY_ID, planAllowsTier, planForTier, TIER_LABEL, type Plan } from "@/config/plans";
import { resolveActiveSkills, skillsPrompt } from "@/config/skills";
import { getMemories, memoryPrompt } from "@/lib/ai/memory";
import { knowledgePrompt, retrieveKnowledge } from "@/lib/ai/knowledge";
import { effectivePlan, getProfile } from "@/lib/auth/profile";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 120;

const bodySchema = z.object({
  modelId: z.string().min(1),
  research: z.boolean().optional().default(false),
  skills: z.array(z.string()).max(12).optional().default([]),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant", "system"]),
        content: z.union([z.string().max(200_000), z.array(z.any()).max(12)]),
      }),
    )
    .min(1)
    .max(60),
});

const UPGRADE = "[upgrade]";

async function resolveEntitlement(lastText: string): Promise<{
  plan: Plan;
  usedToday: number;
  memoryText: string;
  knowledgeText: string;
}> {
  if (!isSupabaseConfigured()) {
    return { plan: PLAN_BY_ID.ultra, usedToday: 0, memoryText: "", knowledgeText: "" };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      plan: process.env.NODE_ENV === "development" ? PLAN_BY_ID.ultra : PLAN_BY_ID.free,
      usedToday: 0,
      memoryText: "",
      knowledgeText: "",
    };
  }
  const profile = await getProfile(supabase, user.id);
  const { data: used } = await supabase.rpc("messages_today", { uid: user.id });
  const memoryText = profile?.memory_enabled === false ? "" : memoryPrompt(await getMemories(supabase, user.id));
  const knowledgeText = lastText
    ? knowledgePrompt(await retrieveKnowledge(supabase, user.id, lastText, 6))
    : "";
  return {
    plan: effectivePlan(profile),
    usedToday: typeof used === "number" ? used : 0,
    memoryText,
    knowledgeText,
  };
}

function textOf(content: string | unknown[]): string {
  if (typeof content === "string") return content;
  return content
    .map((p) => (p && typeof p === "object" && "text" in p ? String((p as { text?: string }).text ?? "") : ""))
    .join(" ");
}

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: "Noto'g'ri so'rov" }, { status: 400 });

  const { modelId, research, skills: enabledSkills, messages } = parsed.data;
  const isAuto = modelId === AUTO_MODEL_ID;
  if (!isAuto && !MODEL_BY_ID[modelId]) return Response.json({ error: "Noma'lum model" }, { status: 400 });

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
  const { plan, usedToday, memoryText, knowledgeText } = await resolveEntitlement(lastText);
  const activeSkills = resolveActiveSkills(enabledSkills, lastText);
  const skillText = skillsPrompt(activeSkills);

  if (usedToday >= plan.limits.messagesPerDay) {
    return refuse(`${UPGRADE} Kunlik limit tugadi (${plan.limits.messagesPerDay} ta xabar, ${plan.name}). Ertaga davom eting yoki tarifni oshiring.`);
  }

  // ---- Build the execution plan (single model, or Auto orchestration) ----
  const routePlan = isAuto ? await planRouteLLM(lastUser ?? "", plan) : null;
  const steps = routePlan
    ? routePlan.steps
    : [
        {
          modelId,
          kind: (research || MODEL_BY_ID[modelId].category === "research" ? "research" : "answer") as "research" | "answer",
          purpose: "",
        },
      ];
  const routeReason = routePlan?.reason ?? "";

  // Plan gating for a concrete (non-auto) model.
  if (!isAuto) {
    const model = MODEL_BY_ID[modelId];
    if (!planAllowsTier(plan, model.tier)) {
      const need = planForTier(model.tier);
      return refuse(`${UPGRADE} ${model.name} — ${TIER_LABEL[model.tier]} darajasidagi model. ${need.name} ($${need.price}/oy) tarifiga o'ting.`);
    }
    if ((research || model.category === "research") && !plan.limits.research) {
      return refuse(`${UPGRADE} Internet tadqiqot (Perplexity) Pro tarifida mavjud.`);
    }
    if (model.id === "sonar-pro-online" && !plan.limits.deepResearch) {
      return refuse(`${UPGRADE} Sonar Pro chuqur tadqiqot Ultra tarifida mavjud.`);
    }
  }

  // Semantic cache: faqat oddiy savol (RAG/xotira/attach yo'q, research emas)
  // — foydalanuvchi savoli o'xshash bo'lsa modelga bormay javob qaytariladi.
  const canCache =
    isSupabaseConfigured() &&
    !research &&
    !isAuto &&
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

        let researchContext = "";
        let cacheableAnswer = "";
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
            knowledgeText,
            knowledgeText ? GROUNDED_GENERATION : "",
            memoryText,
            skillText,
            plan.limits.fullCode ? "" : SIMPLE_CHAT_GUARDRAIL,
          ]
            .filter(Boolean)
            .join("\n\n");
          let stepText = "";
          for await (const ev of streamCompletion({
            modelId: step.modelId,
            research: step.kind === "research",
            messages: stepMessages,
            maxTokens: plan.limits.maxTokens,
            extraSystem: extra || undefined,
            signal: req.signal,
          })) {
            if (ev.type === "done") break;
            if (ev.type === "text") stepText += ev.text;
            // Separate visible sections when a second step begins.
            send(ev);
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
          send({ type: "error", message: err instanceof Error ? err.message : "Noma'lum xato" });
        }
      } finally {
        controller.enqueue(done);
        controller.close();
      }
    },
  });

  return new Response(stream, { headers });
}
