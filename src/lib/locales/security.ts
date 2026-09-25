import type { Dict } from "@/lib/i18n";

/** security tuzatishlari uchun tarjimalar (uz / uz-cyrl / ru / en). */
export const SECURITY = {
  secMonthlyTokenLimit: {
    uz: "Oylik token limiti tugadi ({plan}). Keyingi oy davom eting yoki tarifni oshiring.",
    "uz-cyrl": "Ойлик токен лимити тугади ({plan}). Кейинги ой давом этинг ёки тарифни оширинг.",
    ru: "Месячный лимит токенов исчерпан ({plan}). Продолжите в следующем месяце или повысьте тариф.",
    en: "Monthly token limit reached ({plan}). Continue next month or upgrade your plan.",
  },
  secServerError: {
    uz: "Server xatosi. Birozdan keyin qayta urinib ko'ring.",
    "uz-cyrl": "Сервер хатоси. Бироздан кейин қайта уриниб кўринг.",
    ru: "Ошибка сервера. Попробуйте ещё раз чуть позже.",
    en: "Server error. Please try again shortly.",
  },
  secAllProvidersBusy: {
    uz: "AI modellar hozir band. Birozdan keyin qayta urinib ko'ring.",
    "uz-cyrl": "AI моделлар ҳозир банд. Бироздан кейин қайта уриниб кўринг.",
    ru: "AI-модели сейчас заняты. Попробуйте ещё раз чуть позже.",
    en: "AI models are busy right now. Please try again shortly.",
  },
  secTooManyRequests: {
    uz: "Juda ko'p so'rov. Bir oz kuting.",
    "uz-cyrl": "Жуда кўп сўров. Бир оз кутинг.",
    ru: "Слишком много запросов. Подождите немного.",
    en: "Too many requests. Please wait a moment.",
  },
  secShowImage: {
    uz: "Rasmni ko'rsatish ({host})",
    "uz-cyrl": "Расмни кўрсатиш ({host})",
    ru: "Показать изображение ({host})",
    en: "Show image ({host})",
  },
  secSyncFailed: {
    uz: "Suhbatni saqlab bo'lmadi. Keyinroq qayta urinib ko'ring.",
    "uz-cyrl": "Суҳбатни сақлаб бўлмади. Кейинроқ қайта уриниб кўринг.",
    ru: "Не удалось сохранить диалог. Попробуйте позже.",
    en: "Couldn't save the conversation. Please try again later.",
  },
} satisfies Dict;
