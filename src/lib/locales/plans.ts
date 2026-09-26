import { pick, type L10n, type Lang } from "@/lib/i18n";
import type { CreditLevel, ModelTier, Plan, PlanId } from "@/config/plans";

/**
 * Tarif matnlarining tarjimalari. config/plans.ts shakli (server ham ishlatadi) o'zgarmaydi —
 * bu alohida xarita. features[] tartibi PLANS dagi features[] bilan bir xil.
 */
export const PLAN_TEXT: Record<PlanId, { tagline: L10n; description: L10n; features: L10n[] }> = {
  free: {
    tagline: { uz: "Sinab ko'rish uchun", "uz-cyrl": "Синаб кўриш учун", ru: "Чтобы попробовать", en: "To try it out" },
    description: {
      uz: "Ro'yxatdan o'ting va tekin modellarga darhol kiring.",
      "uz-cyrl": "Рўйхатдан ўтинг ва текин моделларга дарҳол киринг.",
      ru: "Зарегистрируйтесь и сразу получите доступ к бесплатным моделям.",
      en: "Sign up and get instant access to free models.",
    },
    features: [
      {
        uz: "Tekin modellar: Llama 3.3 70B (Groq), Gemini 2.0 Flash, DeepSeek R1",
        "uz-cyrl": "Текин моделлар: Llama 3.3 70B (Groq), Gemini 2.0 Flash, DeepSeek R1",
        ru: "Бесплатные модели: Llama 3.3 70B (Groq), Gemini 2.0 Flash, DeepSeek R1",
        en: "Free models: Llama 3.3 70B (Groq), Gemini 2.0 Flash, DeepSeek R1",
      },
      { uz: "Kunlik chegara bilan", "uz-cyrl": "Кунлик чегара билан", ru: "С дневным лимитом", en: "With a daily limit" },
      {
        uz: "O'rtacha kod va javoblar (3K token)",
        "uz-cyrl": "Ўртача код ва жавоблар (3K токен)",
        ru: "Код и ответы средней длины (3K токенов)",
        en: "Medium-length code and answers (3K tokens)",
      },
      { uz: "Suhbat tarixi", "uz-cyrl": "Суҳбат тарихи", ru: "История чатов", en: "Chat history" },
      { uz: "Xotira grafi", "uz-cyrl": "Хотира графи", ru: "Граф памяти", en: "Memory graph" },
    ],
  },
  starter: {
    tagline: { uz: "Har kuni ishlatasiz", "uz-cyrl": "Ҳар куни ишлатасиз", ru: "Для ежедневной работы", en: "For everyday use" },
    description: {
      uz: "3× ko'proq token, arzon flagman modellar bilan.",
      "uz-cyrl": "3× кўпроқ токен, арзон флагман моделлар билан.",
      ru: "В 3× больше токенов и доступные флагманские модели.",
      en: "3× more tokens, with affordable flagship models.",
    },
    features: [
      { uz: "Free rejimidagi hamma narsa", "uz-cyrl": "Free режимидаги ҳамма нарса", ru: "Всё из тарифа Free", en: "Everything in Free" },
      {
        uz: "Claude Haiku 4.5, GPT-4o mini qo'shildi",
        "uz-cyrl": "Claude Haiku 4.5, GPT-4o mini қўшилди",
        ru: "Добавлены Claude Haiku 4.5 и GPT-4o mini",
        en: "Adds Claude Haiku 4.5 and GPT-4o mini",
      },
      { uz: "3× ko'proq token / oy", "uz-cyrl": "3× кўпроқ токен / ой", ru: "В 3× больше токенов в месяц", en: "3× more tokens / month" },
      {
        uz: "Uzunroq javoblar (4K token)",
        "uz-cyrl": "Узунроқ жавоблар (4K токен)",
        ru: "Более длинные ответы (4K токенов)",
        en: "Longer answers (4K tokens)",
      },
      {
        uz: "Kod: to'liq o'rtacha misollar",
        "uz-cyrl": "Код: тўлиқ ўртача мисоллар",
        ru: "Код: полные примеры средней длины",
        en: "Code: complete medium-sized examples",
      },
    ],
  },
  pro: {
    tagline: { uz: "Professional darajaga", "uz-cyrl": "Профессионал даражага", ru: "Профессиональный уровень", en: "For pro-level work" },
    description: {
      uz: "10× ko'proq token, barcha flagman modellar va research.",
      "uz-cyrl": "10× кўпроқ токен, барча флагман моделлар ва research.",
      ru: "В 10× больше токенов, все флагманские модели и Research.",
      en: "10× more tokens, all flagship models and research.",
    },
    features: [
      { uz: "Basic'dagi hamma narsa", "uz-cyrl": "Basic'даги ҳамма нарса", ru: "Всё из тарифа Basic", en: "Everything in Basic" },
      {
        uz: "Claude Sonnet 4.5, GPT-4o, Gemini 2.5 Pro, Mistral Large",
        "uz-cyrl": "Claude Sonnet 4.5, GPT-4o, Gemini 2.5 Pro, Mistral Large",
        ru: "Claude Sonnet 4.5, GPT-4o, Gemini 2.5 Pro, Mistral Large",
        en: "Claude Sonnet 4.5, GPT-4o, Gemini 2.5 Pro, Mistral Large",
      },
      {
        uz: "Perplexity Research (manbalar bilan)",
        "uz-cyrl": "Perplexity Research (манбалар билан)",
        ru: "Perplexity Research (с источниками)",
        en: "Perplexity Research (with sources)",
      },
      { uz: "10× ko'proq token / oy", "uz-cyrl": "10× кўпроқ токен / ой", ru: "В 10× больше токенов в месяц", en: "10× more tokens / month" },
      {
        uz: "To'liq kod generatsiyasi (4K token)",
        "uz-cyrl": "Тўлиқ код генерацияси (4K токен)",
        ru: "Полная генерация кода (4K токенов)",
        en: "Full code generation (4K tokens)",
      },
      { uz: "CLI kod-agent to'liq", "uz-cyrl": "CLI код-агент тўлиқ", ru: "Полный доступ к CLI-агенту для кода", en: "Full CLI coding agent" },
    ],
  },
  ultra: {
    tagline: { uz: "Maksimal quvvat", "uz-cyrl": "Максимал қувват", ru: "Максимальная мощность", en: "Maximum power" },
    description: {
      uz: "20× ko'proq token, Opus/GPT-5, chuqur research, ustuvor navbat.",
      "uz-cyrl": "20× кўпроқ токен, Opus/GPT-5, чуқур research, устувор навбат.",
      ru: "В 20× больше токенов, Opus/GPT-5, глубокий Research, приоритетная очередь.",
      en: "20× more tokens, Opus/GPT-5, deep research, priority queue.",
    },
    features: [
      { uz: "Pro'dagi hamma narsa", "uz-cyrl": "Pro'даги ҳамма нарса", ru: "Всё из тарифа Pro", en: "Everything in Pro" },
      {
        uz: "Claude Opus, GPT-5 flagship modellari",
        "uz-cyrl": "Claude Opus, GPT-5 flagship моделлари",
        ru: "Флагманские модели Claude Opus, GPT-5",
        en: "Claude Opus, GPT-5 flagship models",
      },
      {
        uz: "Perplexity Sonar Pro (chuqur tadqiqot)",
        "uz-cyrl": "Perplexity Sonar Pro (чуқур тадқиқот)",
        ru: "Perplexity Sonar Pro (глубокое исследование)",
        en: "Perplexity Sonar Pro (deep research)",
      },
      { uz: "20× ko'proq token / oy", "uz-cyrl": "20× кўпроқ токен / ой", ru: "В 20× больше токенов в месяц", en: "20× more tokens / month" },
      {
        uz: "Eng uzun javoblar (8K token)",
        "uz-cyrl": "Энг узун жавоблар (8K токен)",
        ru: "Самые длинные ответы (8K токенов)",
        en: "Longest answers (8K tokens)",
      },
      {
        uz: "Ustuvor navbat — hech qachon kutmaysiz",
        "uz-cyrl": "Устувор навбат — ҳеч қачон кутмайсиз",
        ru: "Приоритетная очередь — никакого ожидания",
        en: "Priority queue — no more waiting",
      },
      { uz: "Erta-yangi modellar", "uz-cyrl": "Эрта-янги моделлар", ru: "Ранний доступ к новым моделям", en: "Early access to new models" },
    ],
  },
};

/** Tarifning tagline / description / features matnlarini joriy tilda qaytaradi (topilmasa — asl o'zbekcha). */
export function planText(lang: Lang, plan: Plan): { tagline: string; description: string; features: string[] } {
  const tx = PLAN_TEXT[plan.id];
  return {
    tagline: tx ? pick(lang, tx.tagline) : plan.tagline,
    description: tx ? pick(lang, tx.description) : plan.description,
    features: plan.features.map((f, i) => (tx?.features[i] ? pick(lang, tx.features[i]) : f)),
  };
}

/** TIER_LABEL ning tarjimasi (config/plans.ts dagi TIER_LABEL o'zgarmaydi). */
export const TIER_TEXT: Record<ModelTier, L10n> = {
  free: { uz: "Tekin", "uz-cyrl": "Текин", ru: "Бесплатно", en: "Free" },
  starter: { uz: "Basic", "uz-cyrl": "Basic", ru: "Basic", en: "Basic" },
  pro: { uz: "Pro", "uz-cyrl": "Pro", ru: "Pro", en: "Pro" },
  ultra: { uz: "Ultra", "uz-cyrl": "Ultra", ru: "Ultra", en: "Ultra" },
};

/** CREDIT_LABEL ning tarjimasi. */
export const CREDIT_TEXT: Record<CreditLevel, L10n> = {
  full: { uz: "Ko'p qoldi", "uz-cyrl": "Кўп қолди", ru: "Осталось много", en: "Plenty left" },
  high: { uz: "Ko'p", "uz-cyrl": "Кўп", ru: "Много", en: "Plenty" },
  mid: { uz: "O'rtacha", "uz-cyrl": "Ўртача", ru: "Средне", en: "Moderate" },
  low: { uz: "Kam qoldi", "uz-cyrl": "Кам қолди", ru: "Осталось мало", en: "Running low" },
  empty: { uz: "Tugadi", "uz-cyrl": "Тугади", ru: "Закончилось", en: "Used up" },
};
