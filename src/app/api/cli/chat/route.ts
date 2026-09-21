import { z } from "zod";
import { createAnonClient } from "@/lib/supabase/anon";
import { PLAN_BY_ID, isPlanId } from "@/config/plans";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

const OPENROUTER = "https://openrouter.ai/api/v1/chat/completions";
const GROQ = "https://api.groq.com/openai/v1/chat/completions";
const OPENAI = "https://api.openai.com/v1/chat/completions";

const OMNIROUTE = (process.env.OMNIROUTE_BASE_URL ?? "").replace(/\/$/, "");
const LLM7 = "https://api.llm7.io/v1/chat/completions";

type Cand = { provider: string; model: string; url: string; auth: string; referer?: boolean };

/**
 * Fallback zanjiri: bittasi band bo'lsa (rate-limit/5xx/kalit xatosi) —
 * navbatdagisiga avtomatik o'tamiz. Shu bois Groq TPM tugasa ish to'xtamaydi.
 *  Groq 120b → Groq 20b (alohida TPM) → OmniRoute → OpenRouter/OpenAI → LLM7 (tekin).
 */
function candidates(plan: string): Cand[] {
  const list: Cand[] = [];
  const groq = process.env.GROQ_API_KEY;
  const openai = process.env.OPENAI_API_KEY;
  const or = process.env.OPENROUTER_API_KEY;
  const omniKey = process.env.OMNIROUTE_API_KEY;
  const big = plan === "pro" || plan === "ultra";

  // Pro/Ultra uchun avval eng kuchlisi (OpenAI gpt-4o).
  if (big && openai) list.push({ provider: "openai", model: "gpt-4o", url: OPENAI, auth: openai });

  // Groq — eng tez; ikki model = ikki alohida TPM bucket.
  if (groq) {
    list.push({ provider: "groq", model: "openai/gpt-oss-120b", url: GROQ, auth: groq });
    list.push({ provider: "groq", model: "openai/gpt-oss-20b", url: GROQ, auth: groq });
  }
  // OmniRoute — arzon/tekin reseller (sozlangan bo'lsa).
  if (OMNIROUTE && omniKey) {
    list.push({ provider: "omniroute", model: process.env.OMNIROUTE_MODEL ?? "auto/gemini", url: `${OMNIROUTE}/chat/completions`, auth: omniKey });
  }
  // OpenRouter.
  if (or) list.push({ provider: "openrouter", model: big ? "openai/gpt-4o" : "openai/gpt-4o-mini", url: OPENROUTER, auth: or, referer: true });
  // OpenAI mini (agar yuqorida ishlatilmagan bo'lsa).
  if (openai && !big) list.push({ provider: "openai", model: "gpt-4o-mini", url: OPENAI, auth: openai });
  // LLM7 — oxirgi tekin chora (anonim, kalitsiz ishlaydi).
  list.push({ provider: "llm7", model: "mistral-Nemo-Instruct-2407", url: LLM7, auth: process.env.LLM7_API_KEY ?? "unused" });

  return list;
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
  const cands = candidates(planId);

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

  const maxTokens = Math.min(plan.limits.maxTokens, 4096);
  const body = (model: string) =>
    JSON.stringify({
      model,
      messages: parsed.data.messages,
      tools: parsed.data.tools,
      tool_choice: parsed.data.tools?.length ? "auto" : undefined,
      temperature: 0.4,
      max_tokens: maxTokens,
    });

  let lastProvider = "";
  let lastErr = "noma'lum";
  for (const cand of cands) {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cand.auth}`,
    };
    if (cand.referer) {
      headers["HTTP-Referer"] = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sovhq.vercel.app";
      headers["X-Title"] = "SOVEREIGN CLI";
    }

    let res: Response;
    try {
      res = await fetch(cand.url, { method: "POST", headers, body: body(cand.model) });
    } catch (e) {
      lastProvider = cand.provider;
      lastErr = e instanceof Error ? e.message : "ulanish xatosi";
      continue; // tarmoq xatosi — keyingi providerga
    }

    if (res.ok) {
      const data = (await res.json()) as { choices?: { message?: unknown }[] };
      const message = data.choices?.[0]?.message ?? { role: "assistant", content: "" };
      return Response.json({ message, plan: planId, model: cand.model, provider: cand.provider });
    }

    let message = `${res.status}`;
    try {
      const j = (await res.json()) as { error?: { message?: string } };
      message = j.error?.message ?? message;
    } catch {
      /* keep */
    }
    lastProvider = cand.provider;
    lastErr = message;
    // Xato bo'lsa (429 TPM, 5xx, kalit) — keyingi providerga o'tamiz; maqsad: ish
    // to'xtamasin. Zanjir oxirigacha muvaffaqiyat bo'lmasa, quyida xato qaytadi.
  }

  return Response.json(
    { error: `Barcha providerlar band yoki xato. Oxirgi (${lastProvider}): ${lastErr}` },
    { status: 502 },
  );
}
