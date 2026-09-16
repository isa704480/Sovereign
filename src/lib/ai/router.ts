import "server-only";
import { MODELS, MODEL_BY_ID, type SovereignModel } from "@/config/models";
import { planAllowsTier, type Plan } from "@/config/plans";

export interface RouteStep {
  modelId: string;
  /** "research" runs Perplexity; "answer" runs the chosen model. */
  kind: "research" | "answer";
  purpose: string;
}

export interface RoutePlan {
  steps: RouteStep[];
  reason: string;
}

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

/** Best model of a preferred id list that the plan allows; else best allowed overall. */
function pick(plan: Plan, preferred: string[]): SovereignModel {
  for (const id of preferred) {
    const m = MODEL_BY_ID[id];
    if (m && planAllowsTier(plan, m.tier)) return m;
  }
  // Fallback: highest-tier chat model the plan allows.
  const order = ["pro", "starter", "free"] as const;
  for (const tier of order) {
    const m = MODELS.find((x) => x.tier === tier && x.category !== "research" && planAllowsTier(plan, x.tier));
    if (m) return m;
  }
  return MODEL_BY_ID["gemma-4-31b:free"];
}

const RESEARCH_MODEL = "sonar-online";

/**
 * Deterministic "SOVEREIGN Auto" planner: reads the request and picks the best
 * model — or a research→answer pipeline when the task needs fresh facts first.
 */
export function planRoute(content: string | unknown[], plan: Plan): RoutePlan {
  const text = textOf(content);
  const needsResearch =
    plan.limits.research && RESEARCH_RE.some((re) => re.test(text));
  const isCode = CODE_RE.test(text);
  const isCreative = CREATIVE_RE.test(text);
  const isMath = MATH_RE.test(text);

  const codeModel = pick(plan, ["gpt-4o", "claude-sonnet-4-5", "gpt-4o-mini", "glm-5.2:free"]);
  const creativeModel = pick(plan, ["claude-sonnet-4-5", "claude-haiku-4-5", "gemma-4-31b:free"]);
  const mathModel = pick(plan, ["gemini-pro-1.5", "gpt-4o", "nemotron-3-super:free"]);
  const generalModel = pick(plan, ["claude-sonnet-4-5", "gpt-4o-mini", "glm-5.2:free"]);

  // Research + build → Perplexity first, then the coding model.
  if (needsResearch && isCode) {
    return {
      steps: [
        { modelId: RESEARCH_MODEL, kind: "research", purpose: "Internetdan dolzarb ma'lumot to'plash" },
        { modelId: codeModel.id, kind: "answer", purpose: "Topilgan ma'lumot asosida kod/sayt yozish" },
      ],
      reason: `Vazifa avval tadqiqot, keyin kod talab qiladi. Perplexity bilan qidiraman, so'ng ${codeModel.name} bilan yozaman.`,
    };
  }
  if (needsResearch) {
    return {
      steps: [{ modelId: RESEARCH_MODEL, kind: "research", purpose: "Manbalar bilan javob" }],
      reason: "Savol dolzarb/internet ma'lumot talab qiladi — Perplexity Research tanlandi.",
    };
  }
  if (isCode) {
    return {
      steps: [{ modelId: codeModel.id, kind: "answer", purpose: "Kod yozish" }],
      reason: `Kod vazifasi — ${codeModel.name} tanlandi (kod uchun eng kuchli).`,
    };
  }
  if (isMath) {
    return {
      steps: [{ modelId: mathModel.id, kind: "answer", purpose: "Matematik yechim" }],
      reason: `Matematik masala — ${mathModel.name} tanlandi.`,
    };
  }
  if (isCreative) {
    return {
      steps: [{ modelId: creativeModel.id, kind: "answer", purpose: "Ijodiy yozish" }],
      reason: `Ijodiy vazifa — ${creativeModel.name} tanlandi.`,
    };
  }
  return {
    steps: [{ modelId: generalModel.id, kind: "answer", purpose: "Umumiy javob" }],
    reason: `Umumiy savol — ${generalModel.name} tanlandi.`,
  };
}
