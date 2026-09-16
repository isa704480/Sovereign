/**
 * Subscription tiers. Enforced server-side in /api/chat and reflected in the UI.
 * Payment integration (Payme / Click / Stripe) is a later phase — for now the
 * plan is a column on `profiles`.
 */

export type PlanId = "free" | "starter" | "pro" | "ultra";
export type ModelTier = "free" | "starter" | "pro" | "ultra";

export interface Plan {
  id: PlanId;
  name: string;
  /** USD per month, 0 = free */
  price: number;
  tagline: string;
  description: string;
  /** Model tiers this plan can use. */
  tiers: ModelTier[];
  limits: {
    /** User messages per day. */
    messagesPerDay: number;
    /** Max completion tokens per answer. */
    maxTokens: number;
    /** Full code generation allowed (false = short, simple snippets only). */
    fullCode: boolean;
    research: boolean;
    /** Perplexity Sonar Pro (deep research). */
    deepResearch: boolean;
  };
  features: string[];
  highlight?: boolean;
  color: string;
}

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    price: 0,
    tagline: "Sinab ko'rish uchun",
    description: "3 ta ochiq model, kunlik chegara bilan.",
    tiers: ["free"],
    limits: { messagesPerDay: 20, maxTokens: 1024, fullCode: false, research: false, deepResearch: false },
    features: ["3 ta tekin model (Gemma, GLM, Nemotron)", "Kuniga 20 ta xabar", "Qisqa javoblar", "Suhbat tarixi"],
    color: "#9BA3CC",
  },
  {
    id: "starter",
    name: "Starter",
    price: 5,
    tagline: "Oddiy kundalik chat",
    description: "Yengil modellar, oddiy savol-javob uchun. Katta kod loyihalari uchun emas.",
    tiers: ["free", "starter"],
    limits: { messagesPerDay: 150, maxTokens: 1500, fullCode: false, research: false, deepResearch: false },
    features: [
      "Tekin modellar + Claude Haiku, GPT-4o mini, LLaMA",
      "Kuniga 150 ta xabar",
      "Oddiy va qisqa javoblar",
      "Kod: faqat kichik, oddiy misollar",
      "Model temalari",
    ],
    color: "#10D4A0",
  },
  {
    id: "pro",
    name: "Pro",
    price: 15,
    tagline: "Ish va tadqiqot uchun",
    description: "Barcha flagman modellar, to'liq kod yozish va internet tadqiqot.",
    tiers: ["free", "starter", "pro"],
    limits: { messagesPerDay: 1000, maxTokens: 4096, fullCode: true, research: true, deepResearch: false },
    features: [
      "Claude Sonnet 4.5, GPT-4o, Gemini Pro, Mistral Large",
      "Perplexity Research (manbalar bilan)",
      "To'liq kod yozish va tahlil",
      "Kuniga 1000 ta xabar",
      "Uzun javoblar (4K token)",
    ],
    highlight: true,
    color: "#5B50F0",
  },
  {
    id: "ultra",
    name: "Ultra",
    price: 29,
    tagline: "Maksimal quvvat",
    description: "Hamma narsa + chuqur tadqiqot va eng yuqori limitlar.",
    tiers: ["free", "starter", "pro", "ultra"],
    limits: { messagesPerDay: 5000, maxTokens: 8192, fullCode: true, research: true, deepResearch: true },
    features: [
      "Pro'dagi hamma narsa",
      "Perplexity Sonar Pro (chuqur tadqiqot)",
      "Kuniga 5000 ta xabar",
      "Eng uzun javoblar (8K token)",
      "Ustuvor navbat",
    ],
    color: "#FF7000",
  },
];

export const PLAN_BY_ID: Record<PlanId, Plan> = Object.fromEntries(PLANS.map((p) => [p.id, p])) as Record<PlanId, Plan>;

export const TIER_LABEL: Record<ModelTier, string> = {
  free: "Tekin",
  starter: "Starter",
  pro: "Pro",
  ultra: "Ultra",
};

export const TIER_ORDER: ModelTier[] = ["free", "starter", "pro", "ultra"];

export function isPlanId(v: unknown): v is PlanId {
  return typeof v === "string" && v in PLAN_BY_ID;
}

export function planAllowsTier(plan: Plan, tier: ModelTier): boolean {
  return plan.tiers.includes(tier);
}

/** Cheapest plan that unlocks the tier. */
export function planForTier(tier: ModelTier): Plan {
  return PLANS.find((p) => p.tiers.includes(tier)) ?? PLANS[PLANS.length - 1];
}
