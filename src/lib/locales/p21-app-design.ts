import type { Dict } from "@/lib/i18n";

/**
 * 21-bosqich (ilova dizayn auditi) — dashboard, onboarding, auth, share, admin va CLI
 * sahifalaridagi yangi matnlar, 4 tilda (uz / uz-cyrl / ru / en).
 */
export const P21A = {
  p21ShareNotFoundBody: {
    uz: "Havola o'chirilgan yoki noto'g'ri. Suhbat egasidan yangi havola so'rang.",
    "uz-cyrl": "Ҳавола ўчирилган ёки нотўғри. Суҳбат эгасидан янги ҳавола сўранг.",
    ru: "Ссылка удалена или неверна. Попросите автора чата прислать новую.",
    en: "This link was removed or is incorrect. Ask the person who shared it for a new one.",
  },
  p21AuthTrustLine: {
    uz: "Shifrlangan ulanish · Ismlar modelga yuborilishidan oldin yashiriladi",
    "uz-cyrl": "Шифрланган уланиш · Исмлар моделга юборилишидан олдин яширилади",
    ru: "Шифрованное соединение · Имена скрываются до отправки модели",
    en: "Encrypted in transit · Names are masked before the model sees them",
  },
  p21OnbPickOne: {
    uz: "Davom etish uchun kamida bitta variantni tanlang.",
    "uz-cyrl": "Давом этиш учун камида битта вариантни танланг.",
    ru: "Чтобы продолжить, выберите хотя бы один вариант.",
    en: "Choose at least one option to continue.",
  },
  p21CreditsLeft: { uz: "Qolgan kredit", "uz-cyrl": "Қолган кредит", ru: "Остаток кредитов", en: "Credits left" },
} satisfies Dict;
