import { z } from "zod";
import { createAnonClient } from "@/lib/supabase/anon";
import { PLAN_BY_ID, isPlanId } from "@/config/plans";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

const OPENROUTER = "https://openrouter.ai/api/v1/chat/completions";
const GROQ = "https://api.groq.com/openai/v1/chat/completions";
const OPENAI = "https://api.openai.com/v1/chat/completions";

/**
 * Kod-agent uchun har tarif eng mos providerni oladi:
 * - Free/Starter: Groq (dunyodagi eng tez, tekin sxema, tool-calling kuchli)
 * - Pro/Ultra: OpenAI direct (gpt-4o eng kuchli agentcha)
 * Groq kaliti yo'q bo'lsa OpenRouter'ga fallback.
 */
type Route = { provider: "groq" | "openai" | "openrouter"; model: string };

function pickRoute(plan: string): Route {
  const hasGroq = !!process.env.GROQ_API_KEY;
  const hasOpenAI = !!process.env.OPENAI_API_KEY;

  if (plan === "free" || plan === "starter") {
    if (hasGroq) return { provider: "groq", model: "openai/gpt-oss-120b" };
    if (hasOpenAI) return { provider: "openai", model: "gpt-4o-mini" };
    return { provider: "openrouter", model: "openai/gpt-4o-mini" };
  }
  // Pro / Ultra
  if (hasOpenAI) return { provider: "openai", model: "gpt-4o" };
  if (hasGroq) return { provider: "groq", model: "openai/gpt-oss-120b" };
  return { provider: "openrouter", model: "openai/gpt-4o" };
}

function endpointFor(r: Route): { url: string; auth: string } {
  if (r.provider === "groq") return { url: GROQ, auth: process.env.GROQ_API_KEY! };
  if (r.provider === "openai") return { url: OPENAI, auth: process.env.OPENAI_API_KEY! };
  return { url: OPENROUTER, auth: process.env.OPENROUTER_API_KEY! };
}

// Cost-DoS'ni to'sish: strict schema. Provider'ga o'zboshimchalik parametrlar
// (response_format, logprobs, stream=false, top_p ...) uzatilishini bekor qiladi.
const messageSchema = z.object({
  role: z.enum(["user", "assistant", "system", "tool"]),
  content: z.union([z.string().max(40_000), z.array(z.any()).max(12), z.null()]).optional(),
  tool_call_id: z.string().max(200).optional(),
  tool_calls: z.array(z.any()).max(8).optional(),
  name: z.string().max(100).optional(),
});
const toolSchema = z.object({
  type: z.literal("function"),
  function: z.object({
    name: z.string().max(80),
    description: z.string().max(2000).optional(),
    parameters: z.any().optional(),
  }),
});
const schema = z.object({
  // An agent task is many tool round-trips (assistant call + tool result each).
  messages: z.array(messageSchema).min(1).max(60),
  tools: z.array(toolSchema).max(8).optional(),
}).strict();

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

  // Rate limit: har bir token uchun daqiqasiga 20 chaqiruv (tool-loop hisobga olib).
  const tokenHash = token.slice(0, 24); // token o'zi kalit sifatida — logga tushmasin
  const rl = rateLimit(`cli:${tokenHash}`, 20, 60_000);
  if (!rl.ok) {
    return Response.json(
      { error: "Juda ko'p so'rov. Bir oz kuting." },
      { status: 429, headers: { "Retry-After": Math.ceil(rl.retryAfterMs / 1000).toString() } },
    );
  }
  // Qo'shimcha IP-bazasidagi tekshiruv (agar bitta token ko'p mijozdan foydalanilsa).
  const ipRl = rateLimit(`cli:ip:${clientIp(req)}`, 60, 60_000);
  if (!ipRl.ok) {
    return Response.json({ error: "Juda ko'p so'rov (IP)." }, { status: 429 });
  }

  const raw = await req.text().catch(() => "");
  // Cost-DoS cap on the whole payload (attachments are base64, so allow headroom).
  if (raw.length > 1_500_000) {
    return Response.json({ error: "So'rov juda katta. Suhbatni /clear qilib qayta urinib ko'ring." }, { status: 413 });
  }
  let json: unknown = null;
  try {
    json = JSON.parse(raw);
  } catch {
    /* handled by schema */
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.join(".") || "body";
    return Response.json({ error: `Noto'g'ri so'rov (${where}: ${issue?.message ?? "format"})` }, { status: 400 });
  }

  // Kamida bitta provider kaliti kerak.
  if (!process.env.GROQ_API_KEY && !process.env.OPENAI_API_KEY && !process.env.OPENROUTER_API_KEY) {
    return Response.json({ error: "Serverda hech qanday AI provider kaliti sozlanmagan" }, { status: 503 });
  }

  // Resolve the token → user + plan.
  let planId = "free";
  let userId: string | null = null;
  try {
    const supabase = createAnonClient();
    const { data, error } = await supabase.rpc("cli_whoami", { p_token: token });
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row?.user_id) {
      return Response.json({ error: "Token yaroqsiz. Qayta `sovereign login` qiling." }, { status: 401 });
    }
    userId = row.user_id;
    planId = isPlanId(row.plan) ? row.plan : "free";
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Server xatosi" }, { status: 500 });
  }

  const plan = (isPlanId(planId) && PLAN_BY_ID[planId]) || PLAN_BY_ID.free;
  const route = pickRoute(planId);

  // CLI ham veb chat bilan bir xil kunlik chegaraga bo'ysunadi.
  try {
    const supabase = createAnonClient();
    const { data: used } = await supabase.rpc("cli_messages_today", { p_token: token });
    const usedToday = typeof used === "number" ? used : 0;
    if (usedToday >= plan.limits.messagesPerDay) {
      return Response.json(
        { error: `Kunlik limit tugadi (${plan.limits.messagesPerDay}, ${plan.name}). Ertaga davom eting.` },
        { status: 429 },
      );
    }
  } catch {
    /* limit tekshiruvi xato bo'lsa fail-open — chunki rate-limit yuqorida allaqachon bor */
  }
  void userId; // hozircha faqat log/attribute uchun

  const ep = endpointFor(route);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${ep.auth}`,
  };
  if (route.provider === "openrouter") {
    headers["HTTP-Referer"] = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sovhq.vercel.app";
    headers["X-Title"] = "SOVEREIGN CLI";
  }

  const res = await fetch(ep.url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: route.model,
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
    return Response.json({ error: `${route.provider}: ${message}` }, { status: 502 });
  }

  const data = (await res.json()) as { choices?: { message?: unknown }[] };
  const message = data.choices?.[0]?.message ?? { role: "assistant", content: "" };
  return Response.json({ message, plan: planId, model: route.model, provider: route.provider });
}
