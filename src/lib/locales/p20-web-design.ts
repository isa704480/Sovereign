import type { Dict } from "@/lib/i18n";

/**
 * 20-bosqich (web dizayn auditi: landing, marketing sahifalari) — yangi matnlar, 4 tilda
 * (uz / uz-cyrl / ru / en).
 * p20wModels* — landing "Modellar" paneli (har laboratoriyaning hozirgi flagmani, tarif belgisi).
 */
export const P20W = {
  p20wModelsPlanSr: { uz: "Tarif:", "uz-cyrl": "Тариф:", ru: "Тариф:", en: "Plan:" },
  p20wModelsPlanNote: {
    uz: "Belgi modelni o'z ichiga olgan eng arzon tarifni ko'rsatadi.",
    "uz-cyrl": "Белги моделни ўз ичига олган энг арзон тарифни кўрсатади.",
    ru: "Метка показывает самый дешёвый тариф, в который входит модель.",
    en: "The tag shows the lowest plan that includes the model.",
  },
  p20wModelsCompare: {
    uz: "O'lchangan taqqoslashlar",
    "uz-cyrl": "Ўлчанган таққослашлар",
    ru: "Сравнение с замерами",
    en: "See measured comparisons",
  },
} satisfies Dict;
