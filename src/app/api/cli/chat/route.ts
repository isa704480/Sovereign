import { z } from "zod";
import { createAnonClient } from "@/lib/supabase/anon";
import { createServiceClient } from "@/lib/supabase/service";
import { PLAN_BY_ID, isPlanId, planAllowsTier, type PlanId } from "@/config/plans";
import { clientIp, ipKey, rateLimit } from "@/lib/rate-limit";
import { tokenKey } from "@/lib/cli/device";
import { healOmniRouteIfStuck } from "@/lib/omniroute-watchdog";
import { getServerT } from "@/lib/i18n-server";
import { fmt } from "@/lib/i18n";
import { hostAllowedIn, modelAllowedIn, REGION_SAFE, REGION_SAFE_CF } from "@/lib/ai/region";
import { CF, cfId, cfSameModel } from "@/lib/ai/cloudflare";
import { resolveUserRegion } from "@/lib/ai/region-server";
import { meshComplete } from "@/lib/ai/mesh/execute";
import { enabledAdapters } from "@/lib/ai/mesh/registry";
import { plan as meshPlan } from "@/lib/ai/mesh/scheduler";
import { cliRouteRequest, isGeneralAdapter, meshMode, requiredPlanTier } from "@/lib/ai/mesh/request";
import { limitErrorResponse } from "@/lib/ai/inquiry/limit-codes";
import { lastUserText, skillSystemMessage, withSkillMessage } from "@/config/skills";

export const runtime = "nodejs";
export const maxDuration = 60;

const OPENROUTER = "https://openrouter.ai/api/v1/chat/completions";
const GROQ = "https://api.groq.com/openai/v1/chat/completions";
const OPENAI = "https://api.openai.com/v1/chat/completions";

const OMNIROUTE = (process.env.OMNIROUTE_BASE_URL ?? "").replace(/\/$/, "");
const LLM7 = "https://api.llm7.io/v1/chat/completions";
const MISTRAL = "https://api.mistral.ai/v1/chat/completions";

/** CLI: bitta foydalanuvchi vazifasi bir necha model qadamidan iborat. */
const CLI_STEP_MULTIPLIER = 4;

/** `model` — SOVEREIGN id (hisob, mintaqa, javobdagi "model"); `wire` — provayderga yuboriladigan id. */
type Cand = { provider: string; model: string; url: string; auth: string; referer?: boolean; wire?: string };

/**
 * Cloudflare Workers AI (OpenAI-mos endpoint) — OpenRouter/OmniRoute krediti tugaganda ham
 * ishlaydi (alohida hisob, kuniga 10k neuron tekin). Kalitlar bo'lmasa — null.
 */
function cloudflareCand(model: string): Cand | null {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const token = process.env.CLOUDFLARE_AI_TOKEN?.trim();
  if (!account || !token) return null;
  return {
    provider: "cloudflare",
    model: cfId(model),
    wire: model,
    url: `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/ai/v1/chat/completions`,
    auth: token,
  };
}

/*
 * Yo'l tanlash — Provider Mesh (SOVEREIGN_MESH=on, standart): web chat bilan BIR XIL algoritm
 * (umumiy sog'liq, kvota, tool/mintaqa/tarif filtri, yukni yoyish) — mesh/execute.ts meshComplete.
 * Quyidagi candidates()/regionCandidates()/legacyComplete() — SOVEREIGN_MESH=off (favqulodda
 * qaytarish) uchun saqlangan eski zanjir.
 */

/**
 * Fallback zanjiri: bittasi band bo'lsa (rate-limit/5xx/kalit xatosi) —
 * navbatdagisiga avtomatik o'tamiz. Shu bois Groq TPM tugasa ish to'xtamaydi.
 *  [tanlangan] → OmniRoute auto → Mistral Codestral → Groq → Mistral Small → pullik (OpenAI/OpenRouter) → LLM7 (faqat vositasiz).
 */
function candidates(plan: string, chosen?: string, needsTools = false): Cand[] {
  const list: Cand[] = [];
  const groq = process.env.GROQ_API_KEY;
  const openai = process.env.OPENAI_API_KEY;
  const or = process.env.OPENROUTER_API_KEY;
  const omniKey = process.env.OMNIROUTE_API_KEY;
  const big = plan === "pro" || plan === "ultra";

  // Foydalanuvchi katalogdan model tanlagan bo'lsa — avval OmniRoute orqali shu model.
  // Tanlangan model Cloudflare'da ham bo'lsa (aynan shu og'irliklar) — avval Cloudflare,
  // OmniRoute/OpenRouter krediti o'rniga; neuron limiti tugasa keyingisi OmniRoute.
  const same = chosen ? cfSameModel(chosen) : null;
  const sameCand = same ? cloudflareCand(same) : null;
  if (sameCand) list.push(sameCand);
  if (chosen && OMNIROUTE && omniKey) {
    list.push({ provider: "omniroute", model: chosen, url: `${OMNIROUTE}/chat/completions`, auth: omniKey });
  }

  const mistral = process.env.MISTRAL_API_KEY;

  // OmniRoute — 1700+ model, o'zi kvotaga qarab provayder almashtiradi.
  // Kod-agent uchun kod/tool'ga kuchli "auto" to'plami.
  if (OMNIROUTE && omniKey) {
    const auto = process.env.OMNIROUTE_MODEL ?? "auto/coding:free"; // sinovda: gpt-oss-120b, tool-calling
    if (auto !== chosen) list.push({ provider: "omniroute", model: auto, url: `${OMNIROUTE}/chat/completions`, auth: omniKey });
  }
  // Mistral Codestral — kod uchun maxsus, tool-calling ishonchli (sinovda o'tdi).
  if (mistral) list.push({ provider: "mistral", model: "codestral-latest", url: MISTRAL, auth: mistral });
  // Groq — eng tez; ikki model = ikki alohida TPM bucket (tez to'ladi).
  if (groq) list.push({ provider: "groq", model: "openai/gpt-oss-120b", url: GROQ, auth: groq });
  if (mistral) list.push({ provider: "mistral", model: "mistral-small-latest", url: MISTRAL, auth: mistral });
  if (groq) list.push({ provider: "groq", model: "openai/gpt-oss-20b", url: GROQ, auth: groq });
  // Cloudflare — tool-calling qo'llaydigan kod modellari (Groq TPM tugasa, OpenRouter bo'sh bo'lsa ham).
  for (const m of big ? [CF.kimiCode, CF.deepseekPro, CF.glm] : [CF.qwen, CF.glm]) {
    const c = cloudflareCand(m);
    if (c && !list.some((x) => x.model === c.model)) list.push(c);
  }
  // Pullik zaxiralar (balans bo'lsa).
  if (big && openai) list.push({ provider: "openai", model: "gpt-4o", url: OPENAI, auth: openai });
  // OpenRouter.
  if (or) list.push({ provider: "openrouter", model: big ? "openai/gpt-4o" : "openai/gpt-4o-mini", url: OPENROUTER, auth: or, referer: true });
  // OpenAI mini (agar yuqorida ishlatilmagan bo'lsa).
  if (openai && !big) list.push({ provider: "openai", model: "gpt-4o-mini", url: OPENAI, auth: openai });
  // LLM7 — oxirgi tekin chora (anonim, kalitsiz). Tool-calling'ni qo'llamaydi —
  // agent (vositali) so'rovda uni sinash faqat chalg'ituvchi xato beradi.
  if (!needsTools) list.push({ provider: "llm7", model: "mistral-Nemo-Instruct-2407", url: LLM7, auth: process.env.LLM7_API_KEY ?? "unused" });

  return list;
}

/**
 * Mintaqa siyosati (region.ts): cheklangan mintaqada provayderi xizmat ko'rsatmaydigan
 * model/host (Claude/GPT/Gemini/Mistral, "auto/*" aralash kombo, LLM7) zanjirdan olib
 * tashlanadi va o'rniga ruxsat etilgan OmniRoute modellari (DeepSeek, Qwen, GLM, Kimi —
 * tool-calling qo'llaydi) qo'yiladi. `big` — Kimi (pullik) faqat Pro/Ultra'da.
 */
function regionCandidates(list: Cand[], country: string | null, big: boolean): Cand[] {
  if (!country) return list;
  const allowed = list.filter((c) => modelAllowedIn(c.model, country) && hostAllowedIn(c.provider, country));
  const omniKey = process.env.OMNIROUTE_API_KEY;
  const safe: Cand[] =
    OMNIROUTE && omniKey
      ? [...(big ? [REGION_SAFE.kimi] : []), REGION_SAFE.deepseek, REGION_SAFE.qwen, REGION_SAFE.glm]
          .filter((m) => !allowed.some((c) => c.model === m))
          .map((model) => ({ provider: "omniroute", model, url: `${OMNIROUTE}/chat/completions`, auth: omniKey }))
      : [];
  // OmniRoute/OpenRouter bo'sh bo'lsa ham mintaqa foydalanuvchisi modelsiz qolmasin — Cloudflare'dagi xuddi shu oilalar.
  const cfSafe = (big ? [REGION_SAFE_CF.kimiCode, REGION_SAFE_CF.deepseekPro, REGION_SAFE_CF.glm] : [REGION_SAFE_CF.qwen, REGION_SAFE_CF.glm])
    .map((id) => cloudflareCand(id.replace(/^cloudflare\//, "")))
    .filter((c): c is Cand => !!c && !allowed.some((a) => a.model === c.model) && modelAllowedIn(c.model, country));
  // Foydalanuvchi o'zi tanlagan (ruxsat etilgan) model birinchi qoladi.
  const [first, ...rest] = allowed;
  return first?.provider === "omniroute" ? [first, ...safe, ...rest, ...cfSafe] : [...safe, ...allowed, ...cfSafe];
}

// Cost-DoS'ni to'sish: strict schema. Provider'ga o'zboshimchalik parametrlar
// (response_format, logprobs, stream=false, top_p ...) uzatilishini bekor qiladi.
// Kontent qismlari qat'iy: matn yoki faqat data:image (CLI mahalliy fayllarni data URL
// qilib yuboradi). http(s) rasm URL'lari OmniRoute tarmog'idan yuklanishi mumkin (SSRF) — rad.
const contentPart = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string().max(40_000) }),
  z.object({
    type: z.literal("image_url"),
    image_url: z.object({
      url: z.string().max(12_000_000).regex(/^data:image\/(png|jpe?g|gif|webp|bmp);base64,/i),
      detail: z.enum(["auto", "low", "high"]).optional(),
    }),
  }),
]);
const messageSchema = z.object({
  role: z.enum(["user", "assistant", "system", "tool"]),
  content: z.union([z.string().max(40_000), z.array(contentPart).max(12), z.null()]).optional(),
  tool_call_id: z.string().max(200).optional(),
  // Model bitta javobda bir nechta faylni parallel yozishi mumkin (9+ chaqiruv) — 8 chegarasi
  // keyingi so'rovni 400 bilan buzardi. Chiqishda MAX_TOOL_CALLS_OUT ga kesiladi, kirish zaxira bilan.
  tool_calls: z.array(z.any()).max(32).optional(),
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
  // Foydalanuvchi tanlagan model (OmniRoute katalogidan). Berilsa — avval
  // OmniRoute orqali shu model sinaladi, keyin odatdagi zaxira zanjiri.
  model: z.string().max(120).regex(/^[\w./:-]+$/).optional(),
}).strict();

/**
 * Oylik token hisobiga yozish (0035 record_token_usage_for — faqat service_role).
 * Provayder `usage` bersa — aniq son, aks holda taxmin (~4 belgi = 1 token; so'rov
 * tanasi base64 rasmlarni ham o'z ichiga oladi, shuning uchun 200k belgida cheklanadi).
 */
async function recordCliUsage(
  userId: string,
  model: string,
  usage: { prompt_tokens?: number; completion_tokens?: number } | undefined,
  requestChars: number,
  message: unknown,
): Promise<void> {
  const input = Number(usage?.prompt_tokens) || Math.round(Math.min(requestChars, 200_000) / 4);
  const output = Number(usage?.completion_tokens) || Math.round(JSON.stringify(message ?? "").length / 4);
  try {
    const { error } = await createServiceClient().rpc("record_token_usage_for", {
      p_user: userId,
      p_input_tokens: input,
      p_output_tokens: output,
      p_model: model,
    });
    if (error) console.error("[cli/chat] record_token_usage_for:", error.message);
  } catch (e) {
    console.error("[cli/chat] record_token_usage_for:", e instanceof Error ? e.message : e);
  }
}

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
  const t = await getServerT();
  const token = bearer(req);
  if (!token) return Response.json({ error: t("p7cCliNoToken") }, { status: 401 });

  // Rate limit: har bir token uchun daqiqasiga 20 chaqiruv (tool-loop hisobga olib).
  const tokenHash = tokenKey(token); // sha256 — token o'zi (yoki prefiksi) Redis'ga/logga tushmasin
  const rl = await rateLimit(`cli:${tokenHash}`, 20, 60_000);
  if (!rl.ok) {
    return limitErrorResponse(t("secTooManyRequests"), "rate_limited", 429, rl.retryAfterMs / 1000);
  }
  // Qo'shimcha IP-bazasidagi tekshiruv (agar bitta token ko'p mijozdan foydalanilsa).
  const ipRl = await rateLimit(`cli:ip:${ipKey(clientIp(req))}`, 60, 60_000);
  if (!ipRl.ok) {
    return limitErrorResponse(t("secTooManyRequests"), "rate_limited", 429, ipRl.retryAfterMs / 1000);
  }

  const raw = await req.text().catch(() => "");
  // Cost-DoS cap on the whole payload (attachments are base64, so allow headroom).
  if (raw.length > 1_500_000) {
    return Response.json({ error: t("p7cCliTooLarge") }, { status: 413 });
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
    return Response.json({ error: `${t("chBadRequest")} (${where})` }, { status: 400 });
  }

  // Kamida bitta provider kaliti kerak (mesh: umumiy chatga yaraydigan, rescue bo'lmagan adapter).
  const mesh = meshMode() === "on";
  const hasProvider = mesh
    ? enabledAdapters().some(isGeneralAdapter)
    : !!(
        process.env.GROQ_API_KEY ||
        process.env.OPENAI_API_KEY ||
        process.env.OPENROUTER_API_KEY ||
        process.env.MISTRAL_API_KEY ||
        process.env.OMNIROUTE_API_KEY
      );
  if (!hasProvider) {
    return Response.json({ error: t("p7cCliNoProvider") }, { status: 503 });
  }

  // Resolve the token → user + plan. Tarif serverda hisoblanadi: muddati
  // o'tgan pullik tarif (plan_expires_at < hozir) = free.
  let planId: PlanId = "free";
  let userId: string;
  let enabledSkills: unknown[] = [];
  try {
    const supabase = createAnonClient();
    const { data, error } = await supabase.rpc("cli_whoami", { p_token: token });
    const row = (Array.isArray(data) ? data[0] : data) as
      | { user_id?: string | null; plan?: string | null; plan_expires_at?: string | null; enabled_skills?: unknown }
      | null;
    if (error || !row?.user_id) {
      return Response.json({ error: t("p7cCliBadToken") }, { status: 401 });
    }
    userId = row.user_id;
    // Akkauntda yoqilgan skillar (web/CLI/Cowork uchun umumiy — profiles.enabled_skills).
    if (Array.isArray(row.enabled_skills)) enabledSkills = row.enabled_skills;
    const rawPlan: PlanId = isPlanId(row.plan) ? row.plan : "free";
    const expired = rawPlan !== "free" && !!row.plan_expires_at && new Date(row.plan_expires_at) < new Date();
    planId = expired ? "free" : rawPlan;
  } catch (e) {
    console.error("[cli/chat] whoami:", e);
    return Response.json({ error: t("secServerError") }, { status: 500 });
  }

  const plan = PLAN_BY_ID[planId] ?? PLAN_BY_ID.free;

  // Oylik token limiti — veb chat bilan bir xil (profiles.tokens_used_month, 0015).
  // Servis kaliti/ustun bo'lmasa — tekshiruv o'tkazib yuboriladi (kunlik limit baribir bor).
  try {
    const { data: usage } = await createServiceClient()
      .from("profiles")
      .select("tokens_used_month, tokens_month_start")
      .eq("id", userId)
      .maybeSingle();
    const u = usage as { tokens_used_month?: number | string | null; tokens_month_start?: string | null } | null;
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const used = u?.tokens_month_start && new Date(u.tokens_month_start) >= monthStart ? Number(u.tokens_used_month ?? 0) || 0 : 0;
    if (used >= plan.limits.tokensPerMonth) {
      return limitErrorResponse(fmt(t("secMonthlyTokenLimit"), { plan: plan.name }), "user_limit", 429);
    }
  } catch (e) {
    console.error("[cli/chat] token usage:", e instanceof Error ? e.message : e);
  }

  // Katalogdan tanlangan aniq model — faqat Pro+ tarifda VA model tarifi ruxsat bergan bo'lsa
  // (web chat route bilan bir xil funksiya — requiredPlanTier: upstream nomi bilan so'ralgan Ultra
  // model Pro'ga berilmaydi). "auto/*" kombolari (tekin yo'naltirish) hammaga ochiq.
  // Ruxsat yo'q bo'lsa tanlov e'tiborsiz (standart kod-agent zanjiri).
  const reqModel = parsed.data.model;
  const chosen =
    reqModel &&
    (reqModel.startsWith("auto/") || (planAllowsTier(plan, "pro") && planAllowsTier(plan, requiredPlanTier(reqModel))))
      ? reqModel
      : undefined;

  // Mintaqa (IP + SBP to'lovi + onboarding mamlakati) — serverda; CLI/Cowork ham shu yo'ldan.
  let country: string | null = null;
  try {
    const region = await resolveUserRegion({ headers: req.headers, supabase: createServiceClient(), userId });
    if (region.sanctioned) return limitErrorResponse(t("p10RegionNoModels"), "region", 451);
    country = region.restricted ? region.country : null;
  } catch (e) {
    // Servis kaliti yo'q — faqat IP sarlavhasi.
    console.error("[cli/chat] region:", e instanceof Error ? e.message : e);
    const region = await resolveUserRegion({ headers: req.headers });
    if (region.sanctioned) return limitErrorResponse(t("p10RegionNoModels"), "region", 451);
    country = region.restricted ? region.country : null;
  }
  const regionSwapped = Boolean(country && chosen && !modelAllowedIn(chosen, country));

  // SOVEREIGN Skills — server tomonida (CLI/Cowork endi faqat nomlarni emas, haqiqiy qo'llanmani oladi):
  // akkauntda yoqilganlar + oxirgi foydalanuvchi xabaridan avto-aniqlanganlar (limit: MAX_ACTIVE_SKILLS).
  // Bitta system xabar mijozning boshlang'ich system blokidan keyin qo'shiladi. Mijoz system xabarlari
  // baribir foydalanuvchi nazoratida — bu yerda ular ustidan hech narsa "ishonchli" deb hisoblanmaydi.
  const skill = skillSystemMessage(enabledSkills, lastUserText(parsed.data.messages));
  const messages = skill ? withSkillMessage(parsed.data.messages, skill.content) : parsed.data.messages;
  const needsTools = Boolean(parsed.data.tools?.length);
  const routeReq = cliRouteRequest({ chosen, planTier: planId, country, tools: needsTools, messages });
  const cands = mesh ? [] : regionCandidates(candidates(planId, chosen, needsTools), country, planId === "pro" || planId === "ultra");
  // Mintaqa/tarif/imkoniyat bo'yicha birorta ham nomzod yo'q — kunlik hisob yoqilmasdan rad etiladi.
  // (Mesh: sog'liq hisobga olinmaydi — vaqtincha yopiq provayder bu yerda "bor" deb sanaladi.)
  const routable = mesh ? meshPlan(routeReq, { adapters: enabledAdapters(), health: new Map() }).length > 0 : cands.length > 0;
  if (!routable) {
    return country
      ? limitErrorResponse(t("p10RegionNoModels"), "region", 451)
      : Response.json({ error: t("p7cCliNoProvider") }, { status: 503 });
  }

  // CLI ham veb chat bilan bir xil kunlik chegaraga bo'ysunadi. Har bir model
  // chaqiruvi server tomonida atomik hisoblanadi (0027 consume_message_for —
  // faqat service_role). Tool-natija qadamlari ham hisoblanadi: aks holda
  // soxta "tool" xabari bilan limitni chetlab o'tish mumkin bo'lardi.
  // Bitta agent vazifasi odatda 3-5 model chaqiruvi (reja → fayl → fayl → xulosa),
  // shuning uchun CLI qadamlari uchun kunlik chegara veb xabarlardan 4 baravar katta.
  const cliLimit = plan.limits.messagesPerDay * CLI_STEP_MULTIPLIER;
  const limitMsg = fmt(t("p7cCliDailyLimit"), { n: cliLimit, plan: plan.name });
  let counted = false;
  try {
    const admin = createServiceClient();
    const { data: allowed, error } = await admin.rpc("consume_message_for", {
      p_user: userId,
      p_limit: cliLimit,
    });
    if (error) console.error("[cli/chat] consume_message_for:", error.message);
    else if (allowed !== true) return limitErrorResponse(limitMsg, "user_limit", 429);
    else counted = true;
  } catch (e) {
    console.error("[cli/chat] consume_message_for:", e);
  }
  if (!counted) {
    // Zaxira (migratsiya yoki servis kaliti hali yo'q bo'lsa): eski hisob.
    try {
      const supabase = createAnonClient();
      const { data: used } = await supabase.rpc("cli_messages_today", { p_token: token });
      const usedToday = typeof used === "number" ? used : 0;
      if (usedToday >= cliLimit) {
        return limitErrorResponse(limitMsg, "user_limit", 429);
      }
    } catch {
      /* limit tekshiruvi xato bo'lsa fail-open — chunki rate-limit yuqorida allaqachon bor */
    }
  }

  const maxTokens = Math.min(plan.limits.maxTokens, 4096);
  const outcome = mesh
    ? await meshCliComplete(routeReq, messages, parsed.data.tools, maxTokens, req.signal)
    : await legacyComplete(cands, messages, parsed.data.tools, maxTokens);

  if (!outcome.ok) {
    if (outcome.status === 400) return Response.json({ error: t("chBadRequest") }, { status: 400 });
    if (outcome.status === 413) return Response.json({ error: t("p7cCliTooLarge") }, { status: 413 });
    if (outcome.status === 499) return new Response(null, { status: 499 }); // mijoz uzildi
    // Provayder/model zanjiri tafsiloti faqat server logida — mijozga umumiy xabar.
    console.error(`[cli/chat] barcha providerlar xato:\n  - ${outcome.failures.join("\n  - ")}`);
    return Response.json({ error: t("secAllProvidersBusy") }, { status: 502 });
  }

  const message = capToolCalls(outcome.message ?? { role: "assistant", content: "" });
  await recordCliUsage(userId, outcome.model, outcome.usage, raw.length + (skill?.content.length ?? 0), message);
  // `usage` — mijoz (CLI/Cowork) har vazifa qancha token sarflaganini ko'rsatadi va
  // --budget'ni tekshiradi. Qo'shimcha maydon: eski mijozlar e'tiborsiz qoldiradi.
  const pt = Number(outcome.usage?.prompt_tokens);
  const ct = Number(outcome.usage?.completion_tokens);
  const usage =
    Number.isFinite(pt) && Number.isFinite(ct) ? { prompt_tokens: pt, completion_tokens: ct, total_tokens: pt + ct } : undefined;
  return Response.json({
    message,
    plan: planId,
    model: outcome.model,
    provider: outcome.provider,
    ...(usage ? { usage } : {}),
    // Shu qadamda qo'llangan skillar (mijoz chip ko'rsatadi). Doim massiv — maydon borligi = yangi server.
    skills: skill?.ids ?? [],
    // Shaffoflik: tanlangan model mintaqada yopiq edi — boshqa model javob berdi (eski mijozlar e'tiborsiz qoldiradi).
    ...(regionSwapped && chosen ? { requested: chosen, region: country, notice: t("p10RegionUnavailable") } : {}),
  });
}

/** Bitta javobdagi vosita chaqiruvlari soni. Qolganini model keyingi qadamda qayta so'raydi. */
const MAX_TOOL_CALLS_OUT = 16;
function capToolCalls(message: unknown): unknown {
  const m = message as { tool_calls?: unknown } | null;
  if (!m || !Array.isArray(m.tool_calls) || m.tool_calls.length <= MAX_TOOL_CALLS_OUT) return message;
  return { ...m, tool_calls: m.tool_calls.slice(0, MAX_TOOL_CALLS_OUT) };
}

type CliMessages = z.infer<typeof schema>["messages"];
type CliTools = z.infer<typeof schema>["tools"];
type CliUsage = { prompt_tokens?: number; completion_tokens?: number };

/** Bitta model chaqiruvi natijasi (mesh yoki eski zanjir). `status` — 400 / 413 / 499 / 502. */
type CliOutcome =
  | { ok: true; message: unknown; usage?: CliUsage; model: string; provider: string }
  | { ok: false; status: number; failures: string[] };

const short = (m: string) => m.replace(/\s+/g, " ").slice(0, 90);

/** Mesh zanjirining umumiy muddati — maxDuration (60 s) dan oldin tugaydi (hisob yozuvi uchun zaxira). */
const CLI_DEADLINE_MS = 55_000;

/**
 * Provider Mesh: web chat bilan bir xil algoritm (docs/MESH.md §10). `model` — halol served model
 * (aggregator ichida almashtirgan bo'lsa ham haqiqiysi), `provider` — javob bergan mesh provayder.
 * Kunlik birlik va sog'liq (circuit breaker) mesh ichida yoziladi.
 */
async function meshCliComplete(
  routeReq: ReturnType<typeof cliRouteRequest>,
  messages: CliMessages,
  tools: CliTools,
  maxTokens: number,
  signal: AbortSignal,
): Promise<CliOutcome> {
  // Funksiya maxDuration (60 s) ichida javob qaytsin: umumiy muddat tugasa — 502, osilib qolmaydi.
  // Mesh ham shu muddatni biladi: har urinish taymauti = min(taymaut, qolgan vaqt), muddat tugagach yangi urinish yo'q.
  const deadlineAt = Date.now() + CLI_DEADLINE_MS;
  const deadline = AbortSignal.timeout(CLI_DEADLINE_MS);
  let result: Awaited<ReturnType<typeof meshComplete>>;
  try {
    result = await meshComplete({
      req: routeReq,
      body: {
        messages,
        ...(tools?.length ? { tools, tool_choice: "auto" } : {}),
        temperature: 0.4,
        max_tokens: maxTokens,
      },
      signal: AbortSignal.any([signal, deadline]),
      deadline: deadlineAt,
    });
  } catch (e) {
    // Mijoz ulanishni uzdi (AbortSignal) — xato emas, sog'liq yozilmagan.
    if (signal.aborted) return { ok: false, status: 499, failures: [] };
    if (deadline.aborted) return { ok: false, status: 502, failures: [`umumiy muddat (${CLI_DEADLINE_MS} ms) tugadi`] };
    throw e;
  }
  if (result.ok) {
    return { ok: true, message: result.message, usage: result.usage, model: result.model, provider: result.provider };
  }
  const failures = result.attempts.map((a) => `${a.provider}/${a.wire}: ${a.error?.kind ?? "?"} ${short(a.error?.message ?? "")}`);
  if (!failures.length) failures.push("nomzod yo'q (hammasi sog'liq bo'yicha yopiq)");
  const status = result.status === 400 || result.status === 413 ? result.status : 502;
  return { ok: false, status, failures };
}

/** SOVEREIGN_MESH=off: eski qattiq zanjir (candidates → regionCandidates → ketma-ket fetch). */
async function legacyComplete(cands: Cand[], messages: CliMessages, tools: CliTools, maxTokens: number): Promise<CliOutcome> {
  const body = (model: string) =>
    JSON.stringify({
      model,
      messages,
      tools,
      tool_choice: tools?.length ? "auto" : undefined,
      temperature: 0.4,
      max_tokens: maxTokens,
    });

  // Har provayder xatosi yig'iladi — butun zanjir server logiga yoziladi.
  const failures: string[] = [];
  for (const cand of cands) {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cand.auth}`,
    };
    if (cand.referer) {
      headers["HTTP-Referer"] = process.env.NEXT_PUBLIC_SITE_URL ?? "https://soveregn.xyz";
      headers["X-Title"] = "SOVEREIGN CLI";
    }

    let res: Response;
    try {
      res = await fetch(cand.url, { method: "POST", headers, body: body(cand.wire ?? cand.model) });
    } catch (e) {
      if (cand.provider === "omniroute") healOmniRouteIfStuck(502, "network");
      failures.push(`${cand.provider}/${cand.model}: ${short(e instanceof Error ? e.message : "ulanish xatosi")}`);
      continue; // tarmoq xatosi — keyingi providerga
    }

    if (res.ok) {
      const data = (await res.json()) as { choices?: { message?: unknown }[]; usage?: CliUsage };
      return { ok: true, message: data.choices?.[0]?.message, usage: data.usage, model: cand.model, provider: cand.provider };
    }

    let message = `${res.status}`;
    try {
      const j = (await res.json()) as { error?: { message?: string } };
      message = j.error?.message ?? message;
    } catch {
      /* keep */
    }
    if (cand.provider === "omniroute") healOmniRouteIfStuck(res.status, message);
    failures.push(`${cand.provider}/${cand.model}: ${res.status} ${short(message)}`);
    // Xato bo'lsa (429 TPM, 5xx, kalit) — keyingi providerga o'tamiz; maqsad: ish
    // to'xtamasin. Zanjir oxirigacha muvaffaqiyat bo'lmasa, 502 qaytadi.
  }
  return { ok: false, status: 502, failures };
}
