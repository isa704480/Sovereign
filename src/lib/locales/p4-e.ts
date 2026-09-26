import type { Dict } from "@/lib/i18n";

/** 4-bosqich (E guruhi) tarjimalari (uz / uz-cyrl / ru / en). */
export const P4E = {
  p4eCreateVideoHint: {
    uz: "Matndan ~5 soniyalik video",
    "uz-cyrl": "Матндан ~5 сониялик видео",
    ru: "Видео ~5 секунд по описанию",
    en: "A ~5-second clip from text",
  },
  p4eVideoMode: { uz: "Video", "uz-cyrl": "Видео", ru: "Видео", en: "Video" },
  p4eVideoModeOff: {
    uz: "Video rejimini o'chirish",
    "uz-cyrl": "Видео режимини ўчириш",
    ru: "Выключить режим видео",
    en: "Turn off video mode",
  },
  p4eVideoPlaceholder: {
    uz: "Qanday video yaratay? Masalan: dengiz ustida quyosh botishi, sekin dron kadri",
    "uz-cyrl": "Қандай видео яратай? Масалан: денгиз устида қуёш ботиши, секин дрон кадри",
    ru: "Какое видео создать? Например: закат над морем, медленный пролёт дрона",
    en: "What video should I make? E.g. sunset over the sea, slow drone shot",
  },
  p4eVideoRendering: {
    uz: "Video tayyorlanyapti...",
    "uz-cyrl": "Видео тайёрланяпти...",
    ru: "Создаю видео...",
    en: "Rendering the video...",
  },
  p4eVideoElapsed: {
    uz: "{s} s · odatda 30–120 soniya",
    "uz-cyrl": "{s} с · одатда 30–120 сония",
    ru: "{s} с · обычно 30–120 секунд",
    en: "{s}s · usually 30–120s",
  },
  p4eVideoHere: { uz: "Mana tayyor video:", "uz-cyrl": "Мана тайёр видео:", ru: "Вот готовое видео:", en: "Here's your video:" },
  p4eVideoFailed: {
    uz: "Video yaratib bo'lmadi. Birozdan keyin qayta urinib ko'ring.",
    "uz-cyrl": "Видео яратиб бўлмади. Бироздан кейин қайта уриниб кўринг.",
    ru: "Не удалось создать видео. Попробуйте чуть позже.",
    en: "Couldn't create the video. Please try again a bit later.",
  },
  p4eVideoStopped: { uz: "Video yaratish to'xtatildi.", "uz-cyrl": "Видео яратиш тўхтатилди.", ru: "Создание видео остановлено.", en: "Video generation stopped." },
  p4eVideoUnavailable: {
    uz: "Video yaratish hozircha mavjud emas.",
    "uz-cyrl": "Видео яратиш ҳозирча мавжуд эмас.",
    ru: "Создание видео пока недоступно.",
    en: "Video generation isn't available yet.",
  },
  p4eVideoPlanRequired: {
    uz: "Video yaratish Starter va undan yuqori tariflarda ochiladi.",
    "uz-cyrl": "Видео яратиш Starter ва ундан юқори тарифларда очилади.",
    ru: "Создание видео доступно на тарифе Starter и выше.",
    en: "Video generation unlocks on Starter and higher plans.",
  },
  p4eVideoDailyLimit: {
    uz: "Bugungi video limiti tugadi ({n} ta). Ertaga davom eting yoki tarifni oshiring.",
    "uz-cyrl": "Бугунги видео лимити тугади ({n} та). Эртага давом этинг ёки тарифни оширинг.",
    ru: "Дневной лимит видео исчерпан ({n}). Продолжите завтра или повысьте тариф.",
    en: "Today's video limit is used up ({n}). Continue tomorrow or upgrade your plan.",
  },
  p4eVideoTooMany: {
    uz: "Juda ko'p video so'rovi. Bir daqiqadan keyin urinib ko'ring.",
    "uz-cyrl": "Жуда кўп видео сўрови. Бир дақиқадан кейин уриниб кўринг.",
    ru: "Слишком много запросов на видео. Попробуйте через минуту.",
    en: "Too many video requests. Try again in a minute.",
  },
  p4eVideoBlocked: {
    uz: "Bu so'rov bo'yicha video yaratib bo'lmaydi (xavfsizlik filtri). Tavsifni o'zgartiring.",
    "uz-cyrl": "Бу сўров бўйича видео яратиб бўлмайди (хавфсизлик фильтри). Тавсифни ўзгартиринг.",
    ru: "Это видео нельзя создать (фильтр безопасности). Измените описание.",
    en: "This video can't be created (safety filter). Please change the description.",
  },
  p4eVideoBusy: {
    uz: "Video xizmati hozir band. Birozdan keyin qayta urinib ko'ring.",
    "uz-cyrl": "Видео хизмати ҳозир банд. Бироздан кейин қайта уриниб кўринг.",
    ru: "Сервис видео сейчас перегружен. Попробуйте чуть позже.",
    en: "The video service is busy right now. Please try again shortly.",
  },
  p4eVideoLabel: { uz: "Yaratilgan video", "uz-cyrl": "Яратилган видео", ru: "Сгенерированное видео", en: "Generated video" },
} satisfies Dict;
