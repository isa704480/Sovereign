import type { Dict } from "@/lib/i18n";

/** Audit 3-bosqich (B guruhi) tarjimalari (uz / uz-cyrl / ru / en). */
export const P3B = {
  // sse-client — server xatolari
  p3bTooLarge: {
    uz: "Fayl juda katta — server qabul qilmadi. Kichikroq faylni biriktiring yoki uni siqing (taxminan 4 MB gacha).",
    "uz-cyrl": "Файл жуда катта — сервер қабул қилмади. Кичикроқ файлни бириктиринг ёки уни сиқинг (тахминан 4 МБ гача).",
    ru: "Файл слишком большой — сервер его не принял. Прикрепите файл поменьше или сожмите его (примерно до 4 МБ).",
    en: "The file is too large for the server. Attach a smaller file or compress it (about 4 MB max).",
  },
  p3bServerError: {
    uz: "Server xatosi ({status}). Birozdan so'ng qayta urinib ko'ring.",
    "uz-cyrl": "Сервер хатоси ({status}). Бироздан сўнг қайта уриниб кўринг.",
    ru: "Ошибка сервера ({status}). Попробуйте ещё раз чуть позже.",
    en: "Server error ({status}). Please try again in a moment.",
  },
  p3bStopped: {
    uz: "Javob to'xtatildi",
    "uz-cyrl": "Жавоб тўхтатилди",
    ru: "Ответ остановлен",
    en: "Answer stopped",
  },

  // /app?paid=1 | ?paid=0 — to'lovdan qaytish
  p3bPaidOk: {
    uz: "To'lov qabul qilindi — tarif faollashtirilmoqda. Bu bir daqiqagacha vaqt olishi mumkin.",
    "uz-cyrl": "Тўлов қабул қилинди — тариф фаоллаштирилмоқда. Бу бир дақиқагача вақт олиши мумкин.",
    ru: "Оплата получена — тариф активируется. Это может занять до минуты.",
    en: "Payment received — your plan is being activated. This can take up to a minute.",
  },
  p3bPaidActive: {
    uz: "Tarif faollashtirildi. Rahmat!",
    "uz-cyrl": "Тариф фаоллаштирилди. Раҳмат!",
    ru: "Тариф активирован. Спасибо!",
    en: "Your plan is active. Thank you!",
  },
  p3bPaidFail: {
    uz: "To'lov yakunlanmadi. Qayta urinib ko'rishingiz yoki boshqa usulni tanlashingiz mumkin.",
    "uz-cyrl": "Тўлов якунланмади. Қайта уриниб кўришингиз ёки бошқа усулни танлашингиз мумкин.",
    ru: "Оплата не завершена. Можно попробовать снова или выбрать другой способ.",
    en: "Payment was not completed. You can try again or choose another method.",
  },
  p3bPaidRetry: {
    uz: "Tariflar",
    "uz-cyrl": "Тарифлар",
    ru: "Тарифы",
    en: "View plans",
  },
  p3bDismiss: {
    uz: "Yopish",
    "uz-cyrl": "Ёпиш",
    ru: "Закрыть",
    en: "Dismiss",
  },

  // Ulashish xatosi
  p3bShareFailed: {
    uz: "Havola yaratilmadi. Internetni tekshirib, qayta urinib ko'ring.",
    "uz-cyrl": "Ҳавола яратилмади. Интернетни текшириб, қайта уриниб кўринг.",
    ru: "Не удалось создать ссылку. Проверьте интернет и попробуйте снова.",
    en: "Couldn't create the link. Check your connection and try again.",
  },

  // GenerativeUI — buzilgan blok
  p3bGenUiBroken: {
    uz: "Bu blokni chizib bo'lmadi — xom ma'lumot ko'rsatilmoqda.",
    "uz-cyrl": "Бу блокни чизиб бўлмади — хом маълумот кўрсатилмоқда.",
    ru: "Не удалось отобразить блок — показаны исходные данные.",
    en: "This block couldn't be displayed — showing the raw data.",
  },

  // error.tsx / not-found.tsx
  p3bErrTitle: {
    uz: "Nimadir noto'g'ri ketdi",
    "uz-cyrl": "Нимадир нотўғри кетди",
    ru: "Что-то пошло не так",
    en: "Something went wrong",
  },
  p3bErrBody: {
    uz: "Kutilmagan xato yuz berdi. Qayta urinib ko'ring — suhbatlaringiz saqlangan.",
    "uz-cyrl": "Кутилмаган хато юз берди. Қайта уриниб кўринг — суҳбатларингиз сақланган.",
    ru: "Произошла непредвиденная ошибка. Попробуйте снова — ваши чаты сохранены.",
    en: "An unexpected error occurred. Please try again — your chats are safe.",
  },
  p3bErrRetry: {
    uz: "Qayta urinish",
    "uz-cyrl": "Қайта уриниш",
    ru: "Повторить",
    en: "Try again",
  },
  p3bErrHome: {
    uz: "Bosh sahifa",
    "uz-cyrl": "Бош саҳифа",
    ru: "На главную",
    en: "Go home",
  },
  p3bErrChat: {
    uz: "Chatga qaytish",
    "uz-cyrl": "Чатга қайтиш",
    ru: "Вернуться в чат",
    en: "Back to chat",
  },
  p3bNotFoundTitle: {
    uz: "Sahifa topilmadi",
    "uz-cyrl": "Саҳифа топилмади",
    ru: "Страница не найдена",
    en: "Page not found",
  },
  p3bNotFoundBody: {
    uz: "Bu sahifa mavjud emas yoki boshqa joyga ko'chirilgan.",
    "uz-cyrl": "Бу саҳифа мавжуд эмас ёки бошқа жойга кўчирилган.",
    ru: "Такой страницы нет или она была перемещена.",
    en: "This page doesn't exist or has been moved.",
  },
} satisfies Dict;
