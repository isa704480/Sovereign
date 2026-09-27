import type { Dict } from "@/lib/i18n";

/**
 * 21-bosqich (ilova dizayn auditi) — dashboard, onboarding, auth, share, admin va CLI
 * sahifalaridagi yangi matnlar, 4 tilda (uz / uz-cyrl / ru / en).
 */
export const P21A = {
  p21OnbPickOne: {
    uz: "Davom etish uchun kamida bitta variantni tanlang.",
    "uz-cyrl": "Давом этиш учун камида битта вариантни танланг.",
    ru: "Чтобы продолжить, выберите хотя бы один вариант.",
    en: "Choose at least one option to continue.",
  },
  p21CreditsLeft: { uz: "Qolgan kredit", "uz-cyrl": "Қолган кредит", ru: "Остаток кредитов", en: "Credits left" },
} satisfies Dict;
