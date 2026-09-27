import "server-only";
import type { Plan } from "@/config/plans";
import { DEFAULT_LANG, fmt, LANG_FOR_AI, translate, type Lang, type TKey } from "@/lib/i18n";
import { autoCandidates, autoModelLabel, type AutoCategory } from "@/lib/ai/auto-pools";
import { modelAllowedIn, restrictedRegion } from "@/lib/ai/region";

export interface RouteStep {
  modelId: string;
  /** "research" runs Perplexity; "answer" runs the chosen model. */
  kind: "research" | "answer";
  purpose: string;
  /** Auto: shu qadam uchun zaxira navbati ([modelId, ...]); chat route shu tartibda sinaydi. */
  fallbacks?: string[];
}

export interface RoutePlan {
  steps: RouteStep[];
  reason: string;
}

const OPENROUTER = "https://openrouter.ai/api/v1/chat/completions";

const CODE_RE =
  /\b(kod|code|dastur|program|funksiya|function|api|component|komponent|react|next|typescript|javascript|python|java|c\+\+|css|html|sql|debug|xato|error|refactor|algoritm|script|backend|frontend|sayt|website|app|ilova|bot)\b/i;
/** So'rov kod vazifasimi (qoidaviy) — mintaqa almashtirishida kod ekvivalentini tanlash uchun. */
export function isCodeRequest(text: string): boolean {
  return CODE_RE.test(text);
}
const CREATIVE_RE = /\b(yoz|matn|maqola|she'r|hikoya|ssenariy|scenariy|reklama|slogan|blog|post|kontent|content|tarjima|translate)\b/i;
const MATH_RE = /\b(hisobla|matematik|math|tenglama|equation|formula|integral|hosila|statistik|ehtimol)\b/i;
// Alternativalar guruhda: aks holda \b faqat birinchi/oxirgi so'zga tegardi va
// "kimyo", "hakim", "yangilash" kabi so'zlar ham research deb topilardi.
// O'zbekcha qo'shimchalar (narxi, yangiliklar, manbalar) uchun ko'p qatorlarda
// faqat so'z boshi chegarasi qo'yilgan.
const RESEARCH_RE = [
  /\b(so'nggi|so'ngi|yangi|bugun(gi)?|hozir(gi)?|kecha(gi)?|2024|2025|2026)\b/i,
  /\b(narx|qiymat|statistika|kurs)/i,
  /\b(kim(ning|ga|dan|ni|lar)?|qachon|qayer(da|dan|ga)?|nima bo'ldi|necha)\b/i,
  /\b(yangilik|xabar|hodisa|voqea)/i,
  /\b(tadqiqot|research|maqola|manba|ilmiy)/i,
  /\b(ob-havo|weather)/i,
];

/** Auto planner LLM chaqiruvi uchun chegara — o'tsa qoidaviy planRoute. */
const PLANNER_TIMEOUT_MS = 4_000;

function textOf(content: string | unknown[]): string {
  if (typeof content === "string") return content;
  return content
    .map((p) => (p && typeof p === "object" && "text" in p ? String((p as { text?: string }).text ?? "") : ""))
    .join(" ");
}

/** Auto tanlovi: tarif × vazifa navbatidan asosiy model + zaxiralar. */
interface Choice {
  id: string;
  name: string;
  fallbacks: string[];
}
function choose(plan: Plan, category: AutoCategory, country?: string | null): Choice {
  const list = autoCandidates(plan, category, country);
  // Bo'sh ro'yxat (faqat OFAC embargosi mintaqasida) — chat route rad etadi.
  const first = list[0] ?? "";
  return { id: first, name: first ? autoModelLabel(first) : "", fallbacks: list };
}

const RESEARCH_MODEL = "sonar-online";

/**
 * Deterministic "SOVEREIGN Auto" planner: reads the request and picks the best
 * model — or a research→answer pipeline when the task needs fresh facts first.
 */
export function planRoute(
  content: string | unknown[],
  plan: Plan,
  lang: Lang = DEFAULT_LANG,
  country?: string | null,
): RoutePlan {
  // reason/purpose foydalanuvchiga ko'rinadi (MessageItem) — interfeys tilida.
  const t = (key: TKey) => translate(lang, key);
  const text = textOf(content);
  // Research (Perplexity) mintaqada yopiq bo'lsa — bu bosqich rejaga kirmaydi.
  const needsResearch =
    plan.limits.research && modelAllowedIn(RESEARCH_MODEL, country) && RESEARCH_RE.some((re) => re.test(text));
  const isCode = CODE_RE.test(text);
  const isCreative = CREATIVE_RE.test(text);
  const isMath = MATH_RE.test(text);

  const codeModel = choose(plan, "code", country);
  const creativeModel = choose(plan, "creative", country);
  const mathModel = choose(plan, "math", country);
  const generalModel = choose(plan, "general", country);

  // Research + build → Perplexity first, then the coding model.
  if (needsResearch && isCode) {
    return {
      steps: [
        { modelId: RESEARCH_MODEL, kind: "research", purpose: t("chRoutePurposeResearchFacts") },
        { modelId: codeModel.id, kind: "answer", purpose: t("chRoutePurposeBuildFromResearch"), fallbacks: codeModel.fallbacks },
      ],
      reason: fmt(t("chRouteReasonResearchCode"), { model: codeModel.name }),
    };
  }
  if (needsResearch) {
    return {
      steps: [{ modelId: RESEARCH_MODEL, kind: "research", purpose: t("chRoutePurposeSourced") }],
      reason: t("chRouteReasonResearch"),
    };
  }
  if (isCode) {
    return {
      steps: [{ modelId: codeModel.id, kind: "answer", purpose: t("chRoutePurposeCode"), fallbacks: codeModel.fallbacks }],
      reason: fmt(t("chRouteReasonCode"), { model: codeModel.name }),
    };
  }
  if (isMath) {
    return {
      steps: [{ modelId: mathModel.id, kind: "answer", purpose: t("chRoutePurposeMath"), fallbacks: mathModel.fallbacks }],
      reason: fmt(t("chRouteReasonMath"), { model: mathModel.name }),
    };
  }
  if (isCreative) {
    return {
      steps: [{ modelId: creativeModel.id, kind: "answer", purpose: t("chRoutePurposeCreative"), fallbacks: creativeModel.fallbacks }],
      reason: fmt(t("chRouteReasonCreative"), { model: creativeModel.name }),
    };
  }
  return {
    steps: [{ modelId: generalModel.id, kind: "answer", purpose: t("chRoutePurposeGeneral"), fallbacks: generalModel.fallbacks }],
    reason: fmt(t("chRouteReasonGeneral"), { model: generalModel.name }),
  };
}

/* ------------------------------------------------------------------ */
/* LLM-based planner (cheap gpt-4o-mini) — better intent understanding */
/* ------------------------------------------------------------------ */

interface RawPlan {
  intent?: string;
  needs_research?: boolean;
  category?: "code" | "creative" | "math" | "general" | "research";
  reason?: string;
}

/**
 * Uses a cheap LLM to classify the intent, then maps the decision to a plan
 * that respects the current subscription. Falls back to the rules-based
 * router on any error, so Auto never fails.
 */
export async function planRouteLLM(
  content: string | unknown[],
  plan: Plan,
  lang: Lang = DEFAULT_LANG,
  signal?: AbortSignal,
  country?: string | null,
): Promise<RoutePlan> {
  const t = (key: TKey) => translate(lang, key);
  const text = textOf(content).slice(0, 2000);
  // Planner LLM — openai/gpt-4o-mini: cheklangan mintaqadagi foydalanuvchi matni
  // OpenAI'ga yuborilmaydi, qoidaviy planner ishlaydi.
  if (!text || !process.env.OPENROUTER_API_KEY || restrictedRegion(country)) return planRoute(content, plan, lang, country);

  const codeModel = choose(plan, "code", country);
  const creativeModel = choose(plan, "creative", country);
  const mathModel = choose(plan, "math", country);
  const generalModel = choose(plan, "general", country);

  const sys = [
    "Sen SOVEREIGN Auto planner'san. Foydalanuvchi so'rovini tahlil qilib, uni qanday bajarish kerakligini aniqla.",
    "JSON qaytar: {\"intent\":\"qisqa tavsif\",\"needs_research\":true|false,\"category\":\"code|creative|math|general|research\",\"reason\":\"qisqa sabab\"}.",
    // intent/reason foydalanuvchiga ko'rsatiladi — interfeys tilida bo'lsin.
    `intent va reason maydonlarini ${LANG_FOR_AI[lang]} yoz.`,
    "needs_research = true agar internet'dan yangi/dolzarb ma'lumot (yangiliklar, narxlar, faktlar, sana) kerak bo'lsa.",
    "category kod = dastur/sayt/skript yozish; creative = matn yozish/tarjima/ijodiy; math = matematika; general = umumiy suhbat; research = faqat internet qidiruv.",
    "Faqat JSON qaytar, boshqa hech narsa.",
  ].join(" ");

  let raw: RawPlan = {};
  try {
    // Planner javob bermasa ham Auto kutib qolmasin: PLANNER_TIMEOUT_MS dan keyin
    // (yoki mijoz so'rovni to'xtatsa) catch → qoidaviy planRoute.
    const timeout = AbortSignal.timeout(PLANNER_TIMEOUT_MS);
    const res = await fetch(OPENROUTER, {
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "X-Title": "SOVEREIGN Auto",
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        temperature: 0,
        max_tokens: 200,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: sys },
          { role: "user", content: text },
        ],
      }),
    });
    if (!res.ok) throw new Error(`planner ${res.status}`);
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    raw = JSON.parse(data.choices?.[0]?.message?.content ?? "{}");
  } catch {
    return planRoute(content, plan, lang, country);
  }

  const needsResearch = plan.limits.research && (raw.needs_research === true || raw.category === "research");
  const cat = raw.category;
  const answerModel =
    cat === "code" ? codeModel : cat === "math" ? mathModel : cat === "creative" ? creativeModel : generalModel;
  const intent = raw.intent?.trim() || t("chRouteUserRequest");
  const reason = raw.reason?.trim() || intent;

  if (needsResearch && cat === "code") {
    return {
      steps: [
        { modelId: RESEARCH_MODEL, kind: "research", purpose: t("chRoutePurposeSearchFacts") },
        { modelId: answerModel.id, kind: "answer", purpose: t("chRoutePurposeBuild"), fallbacks: answerModel.fallbacks },
      ],
      reason: `${reason} — Perplexity + ${answerModel.name}.`,
    };
  }
  if (needsResearch) {
    return {
      steps: [{ modelId: RESEARCH_MODEL, kind: "research", purpose: t("chRoutePurposeWebAnswer") }],
      reason: `${reason} — Perplexity Research.`,
    };
  }
  return {
    steps: [{ modelId: answerModel.id, kind: "answer", purpose: intent, fallbacks: answerModel.fallbacks }],
    reason: `${reason} — ${answerModel.name}.`,
  };
}
