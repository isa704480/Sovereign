import type { Dict } from "@/lib/i18n";

/** 4-bosqich audit tuzatishlari (C guruhi) tarjimalari (uz / uz-cyrl / ru / en). */
export const P8C = {
  /** PrivacyBand bo'limi ustidagi kichik sarlavha (avval inglizcha qattiq yozilgan edi). */
  p8cPrivacyEyebrow: {
    uz: "Yashirin prompt",
    "uz-cyrl": "Яширин промпт",
    ru: "Слепой промптинг",
    en: "Blind Prompting",
  },
  /** ldCompareModels ning birlik shakli (Intl.PluralRules "one"): 1 / 21 / 1731 … */
  p8cCompareModelsOne: { uz: "{n} model.", "uz-cyrl": "{n} модел.", ru: "{n} модель.", en: "{n} model." },
  /** Ruscha "few" shakli: 2–4, 22–24, 1732 … (boshqa tillarda ishlatilmaydi). */
  p8cCompareModelsFew: { uz: "{n} model.", "uz-cyrl": "{n} модел.", ru: "{n} модели.", en: "{n} models." },
} satisfies Dict;
