import type { Dict } from "@/lib/i18n";

/** ux tuzatishlari uchun tarjimalar (uz / uz-cyrl / ru / en). */
export const UX = {
  // Sidebar — o'chirish + qaytarish
  uxDeleted: { uz: "Suhbat o'chirildi", "uz-cyrl": "Суҳбат ўчирилди", ru: "Чат удалён", en: "Chat deleted" },
  uxUndo: { uz: "Qaytarish", "uz-cyrl": "Қайтариш", ru: "Отменить", en: "Undo" },
  uxDeleteChatNamed: {
    uz: "“{name}” suhbatini o'chirish",
    "uz-cyrl": "“{name}” суҳбатини ўчириш",
    ru: "Удалить чат «{name}»",
    en: "Delete chat “{name}”",
  },

  // MessageItem — xato / uzilish / qayta urinish
  uxRetry: { uz: "Qayta urinish", "uz-cyrl": "Қайта уриниш", ru: "Повторить", en: "Retry" },
  uxInterrupted: { uz: "Javob uzilib qoldi", "uz-cyrl": "Жавоб узилиб қолди", ru: "Ответ прерван", en: "Answer was interrupted" },

  // Rasm yaratish
  uxImageElapsed: {
    uz: "{s} s · odatda 20–60 soniya",
    "uz-cyrl": "{s} с · одатда 20–60 сония",
    ru: "{s} с · обычно 20–60 секунд",
    en: "{s}s · usually 20–60s",
  },
  uxImageStopped: {
    uz: "Rasm yaratish to'xtatildi",
    "uz-cyrl": "Расм яратиш тўхтатилди",
    ru: "Генерация изображения остановлена",
    en: "Image generation stopped",
  },

  // ModelSwitcher
  uxFreePlanBanner: {
    uz: "Free: Auto + tekin modellar · Pro 1700+ modelni ochadi",
    "uz-cyrl": "Free: Auto + текин моделлар · Pro 1700+ моделни очади",
    ru: "Free: Auto + бесплатные модели · Pro открывает 1700+ моделей",
    en: "Free: Auto + free models · Pro unlocks 1700+ models",
  },
  uxCapTools: { uz: "Asboblarni chaqiradi", "uz-cyrl": "Асбобларни чақиради", ru: "Вызывает инструменты", en: "Tool calling" },
  uxCapVision: { uz: "Rasmni tushunadi", "uz-cyrl": "Расмни тушунади", ru: "Понимает изображения", en: "Understands images" },
  uxCapReasoning: { uz: "Fikrlaydi (reasoning)", "uz-cyrl": "Фикрлайди (reasoning)", ru: "Рассуждает (reasoning)", en: "Reasoning" },
  uxCatalogModel: { uz: "Katalog modeli", "uz-cyrl": "Каталог модели", ru: "Модель из каталога", en: "Catalog model" },
  uxFreeModel: { uz: "Tekin model", "uz-cyrl": "Текин модел", ru: "Бесплатная модель", en: "Free model" },

  // RegisterForm — shartlar
  uxAnd: { uz: " va ", "uz-cyrl": " ва ", ru: " и ", en: " and " },
  uxPrivacyAccept: {
    uz: "Maxfiylik siyosatiga",
    "uz-cyrl": "Махфийлик сиёсатига",
    ru: "политику конфиденциальности",
    en: "Privacy Policy",
  },

  // Onboarding
  uxSkip: { uz: "O'tkazib yuborish", "uz-cyrl": "Ўтказиб юбориш", ru: "Пропустить", en: "Skip" },

  // Qolgan qattiq yozilgan matnlar
  uxResearch: { uz: "Tadqiqot", "uz-cyrl": "Тадқиқот", ru: "Исследование", en: "Research" },
  uxFree: { uz: "Bepul", "uz-cyrl": "Бепул", ru: "Бесплатно", en: "Free" },

  // Metadata (layout)
  uxMetaDescription: {
    uz: "Claude, GPT, Gemini, DeepSeek va 1700+ AI model bitta oynada. Suhbatlaringiz sizniki.",
    "uz-cyrl": "Claude, GPT, Gemini, DeepSeek ва 1700+ AI модел битта ойнада. Суҳбатларингиз сизники.",
    ru: "Claude, GPT, Gemini, DeepSeek и 1700+ моделей ИИ в одном окне. Ваши чаты принадлежат вам.",
    en: "Claude, GPT, Gemini, DeepSeek and 1700+ AI models in one window. Your chats stay yours.",
  },
  uxOgDescription: {
    uz: "Barcha AI. Bitta oyna.",
    "uz-cyrl": "Барча AI. Битта ойна.",
    ru: "Все ИИ. Одно окно.",
    en: "Every AI. One window.",
  },
} satisfies Dict;
