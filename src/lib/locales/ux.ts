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
  uxCreateImage: { uz: "Rasm yaratish", "uz-cyrl": "Расм яратиш", ru: "Создать изображение", en: "Create image" },
  uxCreateImageHint: { uz: "Matndan rasm · ~30 soniya", "uz-cyrl": "Матндан расм · ~30 сония", ru: "Картинка по тексту · ~30 с", en: "Image from text · ~30s" },
  uxCreateMusic: { uz: "Musiqa yaratish", "uz-cyrl": "Мусиқа яратиш", ru: "Создать музыку", en: "Create music" },
  uxCreateVideo: { uz: "Video yaratish", "uz-cyrl": "Видео яратиш", ru: "Создать видео", en: "Create video" },
  uxComingSoon: { uz: "Tez orada", "uz-cyrl": "Тез орада", ru: "Скоро", en: "Coming soon" },
  uxImageMode: { uz: "Rasm", "uz-cyrl": "Расм", ru: "Картинка", en: "Image" },
  uxImageModeOff: { uz: "Rasm rejimini o'chirish", "uz-cyrl": "Расм режимини ўчириш", ru: "Выключить режим картинки", en: "Turn off image mode" },
  uxImagePlaceholder: {
    uz: "Qanday rasm yaratay? Masalan: tog'lar ortidan chiqayotgan quyosh, akvarel",
    "uz-cyrl": "Қандай расм яратай? Масалан: тоғлар ортидан чиқаётган қуёш, акварел",
    ru: "Какую картинку создать? Например: рассвет над горами, акварель",
    en: "What should I draw? e.g. sunrise over mountains, watercolor",
  },
  uxImageDailyLimit: {
    uz: "Bugungi rasm limiti tugadi ({n} ta). Ertaga davom eting yoki tarifni oshiring.",
    "uz-cyrl": "Бугунги расм лимити тугади ({n} та). Эртага давом этинг ёки тарифни оширинг.",
    ru: "Дневной лимит картинок исчерпан ({n}). Продолжите завтра или повысьте тариф.",
    en: "Today's image limit is used up ({n}). Continue tomorrow or upgrade your plan.",
  },

  // Fikr-mulohaza (taklif / xato / shikoyat)
  fbButton: { uz: "Fikr bildirish", "uz-cyrl": "Фикр билдириш", ru: "Оставить отзыв", en: "Send feedback" },
  fbTitle: { uz: "Fikringizni yozing", "uz-cyrl": "Фикрингизни ёзинг", ru: "Напишите нам", en: "Tell us what you think" },
  fbSub: {
    uz: "Taklif, xato yoki shikoyat — hammasini o'qiymiz.",
    "uz-cyrl": "Таклиф, хато ёки шикоят — ҳаммасини ўқиймиз.",
    ru: "Идея, ошибка или жалоба — мы читаем всё.",
    en: "Ideas, bugs or complaints — we read every one.",
  },
  fbKindIdea: { uz: "Taklif", "uz-cyrl": "Таклиф", ru: "Идея", en: "Idea" },
  fbKindBug: { uz: "Xato", "uz-cyrl": "Хато", ru: "Ошибка", en: "Bug" },
  fbKindComplaint: { uz: "Shikoyat", "uz-cyrl": "Шикоят", ru: "Жалоба", en: "Complaint" },
  fbKindOther: { uz: "Boshqa", "uz-cyrl": "Бошқа", ru: "Другое", en: "Other" },
  fbPlaceholder: {
    uz: "Nima yoqdi, nima yoqmadi yoki nima ishlamadi?",
    "uz-cyrl": "Нима ёқди, нима ёқмади ёки нима ишламади?",
    ru: "Что понравилось, что нет или что не работает?",
    en: "What do you like, what don't you, or what's broken?",
  },
  fbSend: { uz: "Yuborish", "uz-cyrl": "Юбориш", ru: "Отправить", en: "Send" },
  fbSent: {
    uz: "Rahmat! Fikringiz yetib keldi.",
    "uz-cyrl": "Раҳмат! Фикрингиз етиб келди.",
    ru: "Спасибо! Ваш отзыв получен.",
    en: "Thank you! We got your feedback.",
  },
  fbTooShort: {
    uz: "Kamida 3 ta belgi yozing.",
    "uz-cyrl": "Камида 3 та белги ёзинг.",
    ru: "Напишите хотя бы 3 символа.",
    en: "Please write at least 3 characters.",
  },
  fbFailed: {
    uz: "Yuborib bo'lmadi. Birozdan keyin qayta urinib ko'ring.",
    "uz-cyrl": "Юбориб бўлмади. Бироздан кейин қайта уриниб кўринг.",
    ru: "Не удалось отправить. Попробуйте чуть позже.",
    en: "Couldn't send. Please try again in a moment.",
  },

  // CLI o'rnatish
  cliButton: { uz: "Terminalda ishlatish", "uz-cyrl": "Терминалда ишлатиш", ru: "В терминале", en: "Use in terminal" },
  cliTitle: { uz: "SOVEREIGN CLI", "uz-cyrl": "SOVEREIGN CLI", ru: "SOVEREIGN CLI", en: "SOVEREIGN CLI" },
  cliSub: {
    uz: "Kod yozadigan AI agent — to'g'ridan-to'g'ri terminalingizda. Node.js 20+ kerak.",
    "uz-cyrl": "Код ёзадиган AI агент — тўғридан-тўғри терминалингизда. Node.js 20+ керак.",
    ru: "AI-агент для кода прямо в вашем терминале. Нужен Node.js 20+.",
    en: "A coding AI agent right in your terminal. Requires Node.js 20+.",
  },
  cliThenRun: { uz: "So'ng ishga tushiring:", "uz-cyrl": "Сўнг ишга туширинг:", ru: "Затем запустите:", en: "Then run:" },
  cliOrNpm: { uz: "Yoki npm orqali:", "uz-cyrl": "Ёки npm орқали:", ru: "Или через npm:", en: "Or with npm:" },

  // To'lov: tarif darajasi (0033)
  chLowerPlanActive: {
    uz: "Sizda yuqoriroq tarif faol. Pastroq tarifni u tugagach oling — yoki joriy tarifingizni uzaytiring.",
    "uz-cyrl": "Сизда юқорироқ тариф фаол. Пастроқ тарифни у тугагач олинг — ёки жорий тарифингизни узайтиринг.",
    ru: "У вас активен тариф выше. Купите более дешёвый после его окончания — или продлите текущий.",
    en: "You already have a higher plan active. Buy a lower one after it ends — or extend your current plan.",
  },
  chCardSubActive: {
    uz: "Karta obunangiz faol. Ikkinchi obuna ikki marta pul yechardi: tarifni almashtirish uchun avval joriy obunani bekor qiling (Dodo xatidagi havola) yoki kripto/СБП orqali to'lang — qolgan muddat avtomatik hisoblanadi.",
    "uz-cyrl": "Карта обунангиз фаол. Иккинчи обуна икки марта пул ечарди: тарифни алмаштириш учун аввал жорий обунани бекор қилинг (Dodo хатидаги ҳавола) ёки крипто/СБП орқали тўланг — қолган муддат автоматик ҳисобланади.",
    ru: "У вас активна подписка по карте. Вторая списывала бы деньги дважды: чтобы сменить тариф, сначала отмените текущую (ссылка в письме Dodo) или оплатите криптой/СБП — остаток срока пересчитается автоматически.",
    en: "Your card subscription is active. A second one would charge you twice: to change plans, cancel the current subscription first (link in your Dodo email) or pay by crypto/SBP — your remaining time is converted automatically.",
  },
  uxExtendPlan: { uz: "Uzaytirish", "uz-cyrl": "Узайтириш", ru: "Продлить", en: "Extend" },
  uxHigherPlanActive: { uz: "Yuqoriroq tarif faol", "uz-cyrl": "Юқорироқ тариф фаол", ru: "Активен тариф выше", en: "Higher plan active" },
} satisfies Dict;
