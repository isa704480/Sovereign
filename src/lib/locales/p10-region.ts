import type { Dict } from "@/lib/i18n";

/**
 * Mintaqa bo'yicha model siyosati (10-bosqich): provayderi foydalanuvchi mintaqasiga
 * xizmat ko'rsatmaydigan modellar (Claude, GPT, Gemini ...) yopiq — 4 tilda.
 */
export const P10R = {
  /* ---- Model tanlagich: yopiq model yonida ---- */
  p10RegionUnavailable: {
    uz: "Mintaqangizda provayder qoidasiga ko'ra mavjud emas",
    "uz-cyrl": "Минтақангизда провайдер қоидасига кўра мавжуд эмас",
    ru: "Недоступно в вашем регионе по правилам провайдера",
    en: "Unavailable in your region under the provider's rules",
  },
  p10RegionBanner: {
    uz: "Mintaqangizda ({country}) faqat provayderi shu mintaqaga xizmat ko'rsatadigan modellar ishlaydi: DeepSeek, Qwen, GLM, Kimi, MiniMax va ochiq modellar.",
    "uz-cyrl":
      "Минтақангизда ({country}) фақат провайдери шу минтақага хизмат кўрсатадиган моделлар ишлайди: DeepSeek, Qwen, GLM, Kimi, MiniMax ва очиқ моделлар.",
    ru: "В вашем регионе ({country}) доступны только модели, провайдеры которых его обслуживают: DeepSeek, Qwen, GLM, Kimi, MiniMax и открытые модели.",
    en: "In your region ({country}) only models whose providers serve it are available: DeepSeek, Qwen, GLM, Kimi, MiniMax and open models.",
  },

  /* ---- Javob ostidagi belgi: so'ralgan → javob bergan ---- */
  p10RegionSwapTitle: {
    uz: "{model} provayderi mintaqangizga ({country}) xizmat ko'rsatmaydi — javobni ruxsat etilgan model berdi.",
    "uz-cyrl": "{model} провайдери минтақангизга ({country}) хизмат кўрсатмайди — жавобни рухсат этилган модел берди.",
    ru: "Провайдер {model} не обслуживает ваш регион ({country}) — ответила разрешённая модель.",
    en: "The provider of {model} does not serve your region ({country}) — an allowed model answered instead.",
  },

  /* ---- Server xatolari ---- */
  p10RegionModelBlocked: {
    uz: "{model} mintaqangizda provayder qoidasiga ko'ra mavjud emas.",
    "uz-cyrl": "{model} минтақангизда провайдер қоидасига кўра мавжуд эмас.",
    ru: "{model} недоступна в вашем регионе по правилам провайдера.",
    en: "{model} is unavailable in your region under the provider's rules.",
  },
  p10RegionNoModels: {
    uz: "Mintaqangizda provayderlar qoidasiga ko'ra hech bir AI modeli mavjud emas.",
    "uz-cyrl": "Минтақангизда провайдерлар қоидасига кўра ҳеч бир AI модели мавжуд эмас.",
    ru: "В вашем регионе по правилам провайдеров нет доступных AI-моделей.",
    en: "No AI model is available in your region under the providers' rules.",
  },
  p10RegionKbUnavailable: {
    uz: "Bilim bazasi mintaqangizda mavjud emas: matnni vektorlash provayderi bu mintaqaga xizmat ko'rsatmaydi.",
    "uz-cyrl": "Билим базаси минтақангизда мавжуд эмас: матнни векторлаш провайдери бу минтақага хизмат кўрсатмайди.",
    ru: "База знаний недоступна в вашем регионе: провайдер векторизации текста его не обслуживает.",
    en: "The knowledge base is unavailable in your region: the text-embedding provider does not serve it.",
  },

  /* ---- Tariflar oynasi ---- */
  p10RegionPlanNote: {
    uz: "Mintaqangizda tariflarga provayderi shu mintaqaga xizmat ko'rsatadigan modellar kiradi (DeepSeek, Qwen, GLM, Kimi, ochiq modellar); Claude, GPT va Gemini mavjud emas.",
    "uz-cyrl":
      "Минтақангизда тарифларга провайдери шу минтақага хизмат кўрсатадиган моделлар киради (DeepSeek, Qwen, GLM, Kimi, очиқ моделлар); Claude, GPT ва Gemini мавжуд эмас.",
    ru: "В вашем регионе тарифы включают модели, провайдеры которых его обслуживают (DeepSeek, Qwen, GLM, Kimi, открытые модели); Claude, GPT и Gemini недоступны.",
    en: "In your region, plans include the models whose providers serve it (DeepSeek, Qwen, GLM, Kimi, open models); Claude, GPT and Gemini are not available.",
  },
  p10RegionSbpNote: {
    uz: "SBP bilan to'langan tarifga Rossiyada ruxsat etilgan modellar kiradi: DeepSeek, Qwen, GLM, Kimi va ochiq modellar (Claude, GPT, Gemini'siz).",
    "uz-cyrl":
      "СБП билан тўланган тарифга Россияда рухсат этилган моделлар киради: DeepSeek, Qwen, GLM, Kimi ва очиқ моделлар (Claude, GPT, Gemini'сиз).",
    ru: "Тариф, оплаченный через СБП, включает модели, разрешённые в России: DeepSeek, Qwen, GLM, Kimi и открытые модели (без Claude, GPT, Gemini).",
    en: "A plan paid via SBP includes the models allowed in Russia: DeepSeek, Qwen, GLM, Kimi and open models (no Claude, GPT, Gemini).",
  },
} satisfies Dict;
