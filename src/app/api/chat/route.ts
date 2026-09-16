import { z } from "zod";
import { SIMPLE_CHAT_GUARDRAIL, streamCompletion } from "@/lib/ai/providers";
import { MODEL_BY_ID } from "@/config/models";
import { resolveActiveSkills, skillsPrompt } from "@/config/skills";
import { PLAN_BY_ID, planAllowsTier, planForTier, TIER_LABEL, type Plan } from "@/config/plans";
import { effectivePlan, getProfile } from "@/lib/auth/profile";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  modelId: z.string().min(1),
  research: z.boolean().optional().default(false),
  skills: z.array(z.string()).max(12).optional().default([]),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant", "system"]),
        content: z.string().min(1).max(32_000),
      }),
    )
    .min(1)
    .max(60),
});

/** Marker the client uses to open the pricing dialog. */
const UPGRADE = "[upgrade]";

async function resolveEntitlement(): Promise<{ plan: Plan; usedToday: number; userId: string | null }> {
  if (!isSupabaseConfigured()) {
    // Local preview without Supabase: full access.
    return { plan: PLAN_BY_ID.ultra, usedToday: 0, userId: null };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    // No session (e.g. /dev/chat in development): free tier.
    return {
      plan: process.env.NODE_ENV === "development" ? PLAN_BY_ID.ultra : PLAN_BY_ID.free,
      usedToday: 0,
      userId: null,
    };
  }
  const profile = await getProfile(supabase, user.id);
  const { data: used } = await supabase.rpc("messages_today", { uid: user.id });
  return { plan: effectivePlan(profile), usedToday: typeof used === "number" ? used : 0, userId: user.id };
}

/**
 * POST /api/chat — Server-Sent Events stream.
 * Events: {text} | {citations} | {error} | [DONE]
 */
export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: "Noto'g'ri so'rov" }, { status: 400 });
  }
  const { modelId, research, skills: enabledSkills, messages } = parsed.data;
  const model = MODEL_BY_ID[modelId];
  if (!model) {
    return Response.json({ error: "Noma'lum model" }, { status: 400 });
  }

  // Resolve SOVEREIGN skills: user-enabled ∪ auto-detected from the last message.
  const lastUserText = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const activeSkills = resolveActiveSkills(enabledSkills, lastUserText);

  const encoder = new TextEncoder();
  const sse = (payload: unknown) => encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);
  const done = encoder.encode("data: [DONE]\n\n");
  const headers = {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  };
  const refuse = (message: string) =>
    new Response(new Blob([sse({ type: "error", message }), done]), { headers });

  // ---- plan enforcement -------------------------------------------------
  const { plan, usedToday } = await resolveEntitlement();

  if (!planAllowsTier(plan, model.tier)) {
    const need = planForTier(model.tier);
    return refuse(
      `${UPGRADE} ${model.name} — ${TIER_LABEL[model.tier]} darajasidagi model. ${need.name} ($${need.price}/oy) tarifiga o'ting.`,
    );
  }
  if ((research || model.category === "research") && !plan.limits.research) {
    return refuse(`${UPGRADE} Internet tadqiqot (Perplexity) Pro tarifida mavjud.`);
  }
  if (model.id === "sonar-pro-online" && !plan.limits.deepResearch) {
    return refuse(`${UPGRADE} Sonar Pro chuqur tadqiqot Ultra tarifida mavjud.`);
  }
  if (usedToday >= plan.limits.messagesPerDay) {
    return refuse(
      `${UPGRADE} Kunlik limit tugadi (${plan.limits.messagesPerDay} ta xabar, ${plan.name}). Ertaga davom eting yoki tarifni oshiring.`,
    );
  }

  const extraSystem = [skillsPrompt(activeSkills), plan.limits.fullCode ? "" : SIMPLE_CHAT_GUARDRAIL]
    .filter(Boolean)
    .join("\n\n");

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Tell the client which skills ended up active (for the "used skills" chip).
      if (activeSkills.length) {
        controller.enqueue(sse({ type: "skills", skills: activeSkills.map((s) => s.id) }));
      }
      try {
        for await (const ev of streamCompletion({
          modelId,
          research,
          messages,
          maxTokens: plan.limits.maxTokens,
          extraSystem: extraSystem || undefined,
          signal: req.signal,
        })) {
          if (ev.type === "done") break;
          controller.enqueue(sse(ev));
        }
      } catch (err) {
        if (!(err instanceof Error && err.name === "AbortError")) {
          controller.enqueue(sse({ type: "error", message: err instanceof Error ? err.message : "Noma'lum xato" }));
        }
      } finally {
        controller.enqueue(done);
        controller.close();
      }
    },
  });

  return new Response(stream, { headers });
}
