/**
 * SOVEREIGN AI — token-based subscription tiers.
 *
 * Falsafa: foydalanuvchiga aynan token sonini KO'RSATMAYMIZ (Claude uslubi).
 * Faqat "ko'p / o'rtacha / kam" indikator. Aniq matematika:
 *
 *  Free (registered):   150k token/oy  = X
 *  Basic  $5.99:        450k token/oy  = 3X
 *  Pro    $21.99:       1.5M token/oy  = 10X
 *  Ultra  $109.99:      3M   token/oy  = 20X
 *
 * Narx = mijoz to'laydigan summa (karta ham, kripto ham bir xil). Provayder
 * komissiyasidan keyin ham maqsadli daromad ($4.99 / $19.99 / $99.99) qoladi:
 *   Dodo (karta): 4% + $0.40, +1.5% xalqaro karta, +0.5% obuna = 6% + $0.40
 *     (https://dodopayments.com/pricing) → sof $5.23 / $20.27 / $102.99
 *   ZenoBank (kripto): 0.1% (https://docs.zenobank.io/fees)
 * Soliq (VAT) Dodo tomonidan mijozga ustidan qo'shiladi (tax_inclusive=false).
 * Narxni o'zgartirsangiz — Dodo'dagi mahsulot narxini ham moslang.
 *
 * Har xabar (savol + javob) o'rtacha ~2k token deb hisoblanadi.
 * Ya'ni Free 75 xabar, Basic 225, Pro 750, Ultra 1500 xabar/oy.
 */

export type PlanId = "free" | "starter" | "pro" | "ultra";
export type ModelTier = "free" | "starter" | "pro" | "ultra";

export interface Plan {
  id: PlanId;
  name: string;
  /** USD per month, 0 = free. */
  price: number;
  /** USD per year (yillik obuna) — 10× oylik = "2 oy bepul". */
  yearlyPrice?: number;
  /**
   * Rossiya uchun СБП (RollyPay) narxi, rublda. RollyPay 10.5% oladi — narx shuni
   * hisobga olib qo'yilgan: sof daromad dollardagi maqsaddan kam emas (~94 ₽/$).
   */
  rubPrice?: number;
  tagline: string;
  description: string;
  /** Model tiers this plan can use. */
  tiers: ModelTier[];
  limits: {
    /** Oylik token butlashi. Server tomonida hisoblab boradi. */
    tokensPerMonth: number;
    /** Har javob uchun maksimal chiqish tokeni. */
    maxTokens: number;
    /** Har xabarga o'rtacha rate-limit (kunlik burst uchun; oy jami tokensPerMonth bo'ysunadi). */
    messagesPerDay: number;
    /** To'liq kod generatsiyasi (false = qisqa qismlar). */
    fullCode: boolean;
    /** Perplexity Research (manbalar bilan). */
    research: boolean;
    /** Perplexity Sonar Pro chuqur tadqiqot. */
    deepResearch: boolean;
    /** Ustuvor navbat (Groq → OpenAI premium marshrutga o'tadi). */
    priority: boolean;
  };
  features: string[];
  highlight?: boolean;
  color: string;
}

export type BillingPeriod = "month" | "year";

export function isBillingPeriod(v: unknown): v is BillingPeriod {
  return v === "month" || v === "year";
}

/** Tanlangan davr uchun to'lov summasi (USD). */
export function planPrice(plan: Plan, period: BillingPeriod): number {
  return period === "year" ? (plan.yearlyPrice ?? plan.price * 10) : plan.price;
}

/** СБП (rubl) summasi: yillik = 10 × oylik ("2 oy bepul"). 0 — rublda sotilmaydi. */
export function planPriceRub(plan: Plan, period: BillingPeriod): number {
  const m = plan.rubPrice ?? 0;
  return period === "year" ? m * 10 : m;
}

/** "10 990 ₽" */
export function formatRub(n: number): string {
  return `${n.toLocaleString("ru-RU").replace(/\s/g, " ")} ₽`;
}

/** Narxni ko'rsatish: 59.9 → "59.90", 5.99 → "5.99", 0 → "0". */
export function formatPrice(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    price: 0,
    tagline: "Sinab ko'rish uchun",
    description: "Ro'yxatdan o'ting va tekin modellarga darhol kirishing.",
    tiers: ["free"],
    limits: {
      tokensPerMonth: 150_000,
      maxTokens: 3072,
      messagesPerDay: 30,
      fullCode: false,
      research: false,
      deepResearch: false,
      priority: false,
    },
    features: [
      "Tekin modellar: Llama 3.3 70B (Groq), Gemini 2.5 Flash, DeepSeek R1",
      "Kunlik chegara bilan",
      "O'rtacha kod va javoblar (3K token)",
      "Suhbat tarixi",
      "Xotira grafi",
    ],
    color: "#9BA3CC",
  },
  {
    id: "starter",
    name: "Basic",
    price: 5.99,
    yearlyPrice: 59.9,
    rubPrice: 590,
    tagline: "Har kuni ishlatasiz",
    description: "3× ko'proq token, arzon flagman modellar bilan.",
    tiers: ["free", "starter"],
    limits: {
      tokensPerMonth: 450_000,
      maxTokens: 4096,
      messagesPerDay: 150,
      fullCode: false,
      research: false,
      deepResearch: false,
      priority: false,
    },
    features: [
      "Free rejimidagi hamma narsa",
      "Claude 3.5 Haiku, GPT-4o mini qo'shildi",
      "3× ko'proq token / oy",
      "Uzunroq javoblar (4K token)",
      "Kod: to'liq o'rtacha misollar",
    ],
    color: "#10D4A0",
  },
  {
    id: "pro",
    name: "Pro",
    price: 21.99,
    yearlyPrice: 219.9,
    rubPrice: 2190,
    tagline: "Professional darajaga",
    description: "10× ko'proq token, barcha flagman modellar va research.",
    tiers: ["free", "starter", "pro"],
    limits: {
      tokensPerMonth: 1_500_000,
      maxTokens: 4096,
      messagesPerDay: 1000,
      fullCode: true,
      research: true,
      deepResearch: false,
      priority: false,
    },
    features: [
      "Basic'dagi hamma narsa",
      "Claude Sonnet 4.5, GPT-4o, Gemini 2.5 Pro, Mistral Large",
      "Perplexity Research (manbalar bilan)",
      "10× ko'proq token / oy",
      "To'liq kod generatsiyasi (4K token)",
      "CLI kod-agent to'liq",
    ],
    highlight: true,
    color: "#5B50F0",
  },
  {
    id: "ultra",
    name: "Ultra",
    price: 109.99,
    yearlyPrice: 1099.9,
    rubPrice: 10990,
    tagline: "Maksimal quvvat",
    description: "20× ko'proq token, Opus/GPT-5, chuqur research, ustuvor navbat.",
    tiers: ["free", "starter", "pro", "ultra"],
    limits: {
      tokensPerMonth: 3_000_000,
      maxTokens: 8192,
      messagesPerDay: 5000,
      fullCode: true,
      research: true,
      deepResearch: true,
      priority: true,
    },
    features: [
      "Pro'dagi hamma narsa",
      "Claude Opus, GPT-5 flagship modellari",
      "Perplexity Sonar Pro (chuqur tadqiqot)",
      "20× ko'proq token / oy",
      "Eng uzun javoblar (8K token)",
      "Ustuvor navbat — hech qachon kutmayapsiz",
      "Erta-yangi modellar",
    ],
    color: "#FF7000",
  },
];

export const PLAN_BY_ID: Record<PlanId, Plan> = Object.fromEntries(PLANS.map((p) => [p.id, p])) as Record<PlanId, Plan>;

export const TIER_LABEL: Record<ModelTier, string> = {
  free: "Tekin",
  starter: "Basic",
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

/**
 * Foydalanuvchiga aniq son ko'rsatmasdan qat'iy indikator qaytaradi:
 * "Ko'p" · "O'rtacha" · "Kam" · "Tugadi"
 *
 * Aniq foizni yashiramiz. Faqat bucketni chiqaramiz.
 */
export type CreditLevel = "full" | "high" | "mid" | "low" | "empty";

export function creditLevel(usedTokens: number, plan: Plan): CreditLevel {
  const limit = plan.limits.tokensPerMonth;
  if (limit === 0) return "full";
  const used = Math.max(0, usedTokens);
  const remaining = Math.max(0, limit - used);
  const ratio = remaining / limit;
  if (ratio <= 0) return "empty";
  if (ratio <= 0.1) return "low";
  if (ratio <= 0.4) return "mid";
  if (ratio <= 0.75) return "high";
  return "full";
}

export const CREDIT_LABEL: Record<CreditLevel, string> = {
  full: "Ko'p qoldi",
  high: "Ko'p",
  mid: "O'rtacha",
  low: "Kam qoldi",
  empty: "Tugadi",
};

export const CREDIT_COLOR: Record<CreditLevel, string> = {
  full: "#10D4A0",
  high: "#10D4A0",
  mid: "#F5AA3C",
  low: "#F97316",
  empty: "#EB5A64",
};
