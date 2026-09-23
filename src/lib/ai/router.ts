import "server-only";
import type { Plan } from "@/config/plans";
import { DEFAULT_LANG, fmt, LANG_FOR_AI, translate, type Lang, type TKey } from "@/lib/i18n";
import { autoCandidates, autoModelLabel, type AutoCategory } from "@/lib/ai/auto-pools";

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
const CREATIVE_RE = /\b(yoz|matn|maqola|she'r|hikoya|ssenariy|scenariy|reklama|slogan|blog|post|kontent|content|tarjima|translate)\b/i;
const MATH_RE = /\b(hisobla|matematik|math|tenglama|equation|formula|integral|hosila|statistik|ehtimol)\b/i;
const RESEARCH_RE = [
  /\bso'nggi|so'ngi|yangi|bugun|hozir|kecha|2024|2025|2026\b/i,
  /\bnarx|qiymat|statistika|kurs\b/i,
  /\bkim|qachon|qayerda|nima bo'ldi|necha\b/i,
  /\byangilik|xabar|hodisa|voqea\b/i,
  /\btadqiqot|research|maqola|manba|ilmiy\b/i,
  /\bob-havo|weather\b/i,
];

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
function choose(plan: Plan, category: AutoCategory): Choice {
  const list = autoCandidates(plan, category);
  return { id: list[0], name: autoModelLabel(list[0]), fallbacks: list };
}

const RESEARCH_MODEL = "sonar-online";

/**
 * Deterministic "SOVEREIGN Auto" planner: reads the request and picks the best
 * model — or a research→answer pipeline when the task needs fresh facts first.
 */
export function planRoute(content: string | unknown[], plan: Plan, lang: Lang = DEFAULT_LANG): RoutePlan {
  // reason/purpose foydalanuvchiga ko'rinadi (MessageItem) — interfeys tilida.
  const t = (key: TKey) => translate(lang, key);
  const text = textOf(content);
  const needsResearch =
    plan.limits.research && RESEARCH_RE.some((re) => re.test(text));
  const isCode = CODE_RE.test(text);
  const isCreative = CREATIVE_RE.test(text);
  const isMath = MATH_RE.test(text);

  const codeModel = choose(plan, "code");
  const creativeModel = choose(plan, "creative");
  const mathModel = choose(plan, "math");
  const generalModel = choose(plan, "general");

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
export async function planRouteLLM(content: string | unknown[], plan: Plan, lang: Lang = DEFAULT_LANG): Promise<RoutePlan> {
  const t = (key: TKey) => translate(lang, key);
  const text = textOf(content).slice(0, 2000);
  if (!text || !process.env.OPENROUTER_API_KEY) return planRoute(content, plan, lang);

  const codeModel = choose(plan, "code");
  const creativeModel = choose(plan, "creative");
  const mathModel = choose(plan, "math");
  const generalModel = choose(plan, "general");

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
    const res = await fetch(OPENROUTER, {
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
    return planRoute(content, plan, lang);
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
