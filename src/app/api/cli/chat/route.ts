import { z } from "zod";
import { createAnonClient } from "@/lib/supabase/anon";
import { PLAN_BY_ID, isPlanId } from "@/config/plans";

export const runtime = "nodejs";
export const maxDuration = 60;

const OPENROUTER = "https://openrouter.ai/api/v1/chat/completions";

/** A capable tool-calling model per plan (CLI needs function calling). */
const MODEL_FOR_PLAN: Record<string, string> = {
  free: "openai/gpt-4o-mini",
  starter: "openai/gpt-4o-mini",
  pro: "openai/gpt-4o",
  ultra: "openai/gpt-4o",
};

const schema = z.object({
  messages: z.array(z.object({ role: z.string(), content: z.any().optional() }).passthrough()).min(1).max(80),
  tools: z.array(z.any()).optional(),
});

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : null;
}

/**
 * POST /api/cli/chat — account-authenticated CLI proxy to OpenRouter.
 * One model round-trip (messages + tools → assistant message). The CLI
 * executes tools locally and calls again. Plan picks the model.
 */
export async function POST(req: Request) {
  const token = bearer(req);
  if (!token) return Response.json({ error: "Token yo'q. `sovereign login` qiling." }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) return Response.json({ error: "Noto'g'ri so'rov" }, { status: 400 });

  if (!process.env.OPENROUTER_API_KEY) {
    return Response.json({ error: "Serverda OPENROUTER_API_KEY sozlanmagan" }, { status: 503 });
  }

  // Resolve the token → user + plan.
  let planId = "free";
  try {
    const supabase = createAnonClient();
    const { data, error } = await supabase.rpc("cli_whoami", { p_token: token });
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row?.user_id) {
      return Response.json({ error: "Token yaroqsiz. Qayta `sovereign login` qiling." }, { status: 401 });
    }
    planId = isPlanId(row.plan) ? row.plan : "free";
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Server xatosi" }, { status: 500 });
  }

  const plan = (isPlanId(planId) && PLAN_BY_ID[planId]) || PLAN_BY_ID.free;
  const model = MODEL_FOR_PLAN[planId] ?? MODEL_FOR_PLAN.free;

  const res = await fetch(OPENROUTER, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL ?? "https://sovereign.ai",
      "X-Title": "SOVEREIGN CLI",
    },
    body: JSON.stringify({
      model,
      messages: parsed.data.messages,
      tools: parsed.data.tools,
      tool_choice: parsed.data.tools?.length ? "auto" : undefined,
      temperature: 0.4,
      max_tokens: Math.min(plan.limits.maxTokens, 4096),
    }),
  });

  if (!res.ok) {
    let message = `${res.status}`;
    try {
      const j = (await res.json()) as { error?: { message?: string } };
      message = j.error?.message ?? message;
    } catch {
      /* keep */
    }
    return Response.json({ error: message }, { status: 502 });
  }

  const data = (await res.json()) as { choices?: { message?: unknown }[] };
  const message = data.choices?.[0]?.message ?? { role: "assistant", content: "" };
  return Response.json({ message, plan: planId, model });
}
