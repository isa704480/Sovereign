import type { Dict } from "@/lib/i18n";

/** Audit 3-bosqich (C guruhi) tarjimalari (uz / uz-cyrl / ru / en). */
export const P3C = {
  // ── Parolni tiklash sahifasi (/reset-password) ──
  auResetMetaTitle: { uz: "Yangi parol", "uz-cyrl": "Янги парол", ru: "Новый пароль", en: "New password" },
  auResetTitle: { uz: "Yangi parol o'rnating", "uz-cyrl": "Янги парол ўрнатинг", ru: "Задайте новый пароль", en: "Set a new password" },
  auResetSubtitle: {
    uz: "Hisobingiz uchun yangi parol kiriting",
    "uz-cyrl": "Ҳисобингиз учун янги парол киритинг",
    ru: "Введите новый пароль для аккаунта",
    en: "Enter a new password for your account",
  },
  auNewPassword: { uz: "Yangi parol", "uz-cyrl": "Янги парол", ru: "Новый пароль", en: "New password" },
  auSaveNewPassword: { uz: "Parolni saqlash", "uz-cyrl": "Паролни сақлаш", ru: "Сохранить пароль", en: "Save password" },
  auErrResetExpired: {
    uz: "Parolni tiklash havolasi eskirgan yoki yaroqsiz. Yangi havola so'rang.",
    "uz-cyrl": "Паролни тиклаш ҳаволаси эскирган ёки яроқсиз. Янги ҳавола сўранг.",
    ru: "Ссылка для сброса пароля устарела или недействительна. Запросите новую.",
    en: "The password reset link has expired or is invalid. Please request a new one.",
  },
  auErrSamePassword: {
    uz: "Yangi parol eskisidan farq qilishi kerak.",
    "uz-cyrl": "Янги парол эскисидан фарқ қилиши керак.",
    ru: "Новый пароль должен отличаться от старого.",
    en: "The new password must be different from the old one.",
  },
  auErrLinkOtherBrowser: {
    uz: "Havolani so'rov yuborgan brauzerning o'zida oching yoki qayta kiring.",
    "uz-cyrl": "Ҳаволани сўров юборган браузернинг ўзида очинг ёки қайта киринг.",
    ru: "Откройте ссылку в том же браузере, где отправляли запрос, или войдите снова.",
    en: "Open the link in the same browser you used to request it, or sign in again.",
  },
  auErrPopupBlocked: {
    uz: "Brauzer Google oynasini to'sib qo'ydi. Qalqib chiquvchi oynalarga ruxsat bering va qayta urinib ko'ring.",
    "uz-cyrl": "Браузер Google ойнасини тўсиб қўйди. Қалқиб чиқувчи ойналарга рухсат беринг ва қайта уриниб кўринг.",
    ru: "Браузер заблокировал окно Google. Разрешите всплывающие окна и попробуйте снова.",
    en: "Your browser blocked the Google window. Allow pop-ups and try again.",
  },

  // ── Sozlamalar paneli ──
  stLoadFailed: {
    uz: "Sozlamani yuklab bo'lmadi. Keyinroq qayta urinib ko'ring.",
    "uz-cyrl": "Созламани юклаб бўлмади. Кейинроқ қайта уриниб кўринг.",
    ru: "Не удалось загрузить настройку. Попробуйте позже.",
    en: "Couldn't load this setting. Please try again later.",
  },
  stSaveFailed: {
    uz: "Saqlanmadi. Internetni tekshirib, qayta urinib ko'ring.",
    "uz-cyrl": "Сақланмади. Интернетни текшириб, қайта уриниб кўринг.",
    ru: "Не сохранилось. Проверьте интернет и попробуйте снова.",
    en: "Not saved. Check your connection and try again.",
  },
  stDeleteFailed: {
    uz: "Ma'lumotlar o'chirilmadi. Qayta urinib ko'ring.",
    "uz-cyrl": "Маълумотлар ўчирилмади. Қайта уриниб кўринг.",
    ru: "Данные не удалены. Попробуйте ещё раз.",
    en: "Your data wasn't deleted. Please try again.",
  },
  stFontSmall: { uz: "Kichik", "uz-cyrl": "Кичик", ru: "Мелкий", en: "Small" },
  stFontMedium: { uz: "O'rtacha", "uz-cyrl": "Ўртача", ru: "Средний", en: "Medium" },
  stFontLarge: { uz: "Katta", "uz-cyrl": "Катта", ru: "Крупный", en: "Large" },

  // ── Kiritish maydoni: @-eslatma manbasi (Bilimlar bazasi qisqartmasi) ──
  kbShort: { uz: "BB", "uz-cyrl": "ББ", ru: "БЗ", en: "KB" },
} satisfies Dict;
