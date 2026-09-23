import type { Dict } from "@/lib/i18n";

/** panels bo'limi tarjimalari (uz / uz-cyrl / ru / en). Kalitlar global DICT ga qo'shiladi. */
export const PANELS = {
  // ConnectorsPanel
  pnConnectorsTitle: { uz: "Ulanishlar", "uz-cyrl": "Уланишлар", ru: "Подключения", en: "Connectors" },
  pnConnectorsIntro: {
    uz: "Servislarni ulang va xohlaganda vaqtincha o'chirib qo'ying. Tokenlar maxfiy saqlanadi.",
    "uz-cyrl": "Сервисларни уланг ва хоҳлаганда вақтинча ўчириб қўйинг. Токенлар махфий сақланади.",
    ru: "Подключайте сервисы и временно отключайте их, когда нужно. Токены хранятся конфиденциально.",
    en: "Connect services and pause them whenever you like. Tokens are stored securely.",
  },
  pnConnected: { uz: "Ulangan", "uz-cyrl": "Уланган", ru: "Подключено", en: "Connected" },
  pnConnect: { uz: "Ulash", "uz-cyrl": "Улаш", ru: "Подключить", en: "Connect" },
  pnDisconnect: { uz: "Uzish", "uz-cyrl": "Узиш", ru: "Отключить", en: "Disconnect" },
  pnToken: { uz: "Token", "uz-cyrl": "Токен", ru: "Токен", en: "Token" },
  pnTokenWhere: {
    uz: "Token qayerdan olinadi?",
    "uz-cyrl": "Токен қаердан олинади?",
    ru: "Где взять токен?",
    en: "Where do I get a token?",
  },
  pnConnectGoogle: { uz: "Google bilan ulash", "uz-cyrl": "Google билан улаш", ru: "Подключить через Google", en: "Connect with Google" },
  pnGoogleOauthNote: {
    uz: "Google Cloud'da OAuth scope va consent sozlangan bo'lishi kerak{extra}.",
    "uz-cyrl": "Google Cloud'да OAuth scope ва consent созланган бўлиши керак{extra}.",
    ru: "В Google Cloud должны быть настроены OAuth scope и экран согласия{extra}.",
    en: "OAuth scopes and consent must be configured in Google Cloud{extra}.",
  },
  pnGoogleReviewNote: {
    uz: " (Google tekshiruvi talab qilinadi)",
    "uz-cyrl": " (Google текшируви талаб қилинади)",
    ru: " (требуется проверка Google)",
    en: " (requires Google verification)",
  },

  // SkillPicker / SkillsMarket
  pnSkillsTooltip: {
    uz: "SOVEREIGN Skills — ekspert rejimlar",
    "uz-cyrl": "SOVEREIGN Skills — эксперт режимлар",
    ru: "Навыки SOVEREIGN — экспертные режимы",
    en: "SOVEREIGN Skills — expert modes",
  },
  pnSovSkills: { uz: "SOVEREIGN Skills", "uz-cyrl": "SOVEREIGN Skills", ru: "Навыки SOVEREIGN", en: "SOVEREIGN Skills" },

  // CoworkPanel
  pnCwError: { uz: "Xato", "uz-cyrl": "Хато", ru: "Ошибка", en: "Error" },
  pnCwChanges: { uz: "O'zgarishlar", "uz-cyrl": "Ўзгаришлар", ru: "Изменения", en: "Changes" },
  pnCwApplyAll: { uz: "Barchasini qo'llash", "uz-cyrl": "Барчасини қўллаш", ru: "Применить все", en: "Apply all" },
  pnCwLines: { uz: "{n} qator", "uz-cyrl": "{n} қатор", ru: "строк: {n}", en: "{n} lines" },
  pnCwApplied: { uz: "qo'llandi", "uz-cyrl": "қўлланди", ru: "применено", en: "applied" },
  pnCwApply: { uz: "Qo'llash", "uz-cyrl": "Қўллаш", ru: "Применить", en: "Apply" },
  pnCwApplyAria: { uz: "{path} — qo'llash", "uz-cyrl": "{path} — қўллаш", ru: "{path} — применить", en: "{path} — apply" },
  pnCwDownload: { uz: "Yuklab", "uz-cyrl": "Юклаб", ru: "Скачать", en: "Download" },
  pnCwDownloadAria: { uz: "{path} — yuklab olish", "uz-cyrl": "{path} — юклаб олиш", ru: "{path} — скачать", en: "{path} — download" },
  pnCwConnectHint: {
    uz: "To'g'ridan-to'g'ri saqlash uchun quyida papkani Chrome/Edge orqali ulang.",
    "uz-cyrl": "Тўғридан-тўғри сақлаш учун қуйида папкани Chrome/Edge орқали уланг.",
    ru: "Чтобы сохранять напрямую, подключите папку ниже через Chrome/Edge.",
    en: "To save directly, connect the folder below via Chrome/Edge.",
  },
  pnCwExampleFile: { uz: "@rasm.png", "uz-cyrl": "@расм.png", ru: "@фото.png", en: "@image.png" },
  pnCwNoFolder: { uz: "Papka ulanmagan.", "uz-cyrl": "Папка уланмаган.", ru: "Папка не подключена.", en: "No folder connected." },
  pnCwNoWritePerm: {
    uz: "Yozish ruxsati berilmadi.",
    "uz-cyrl": "Ёзиш рухсати берилмади.",
    ru: "Разрешение на запись не предоставлено.",
    en: "Write permission was not granted.",
  },

  // KnowledgePanel
  pnKbNoText: {
    uz: "{name}: matn ajratib olinmadi.",
    "uz-cyrl": "{name}: матн ажратиб олинмади.",
    ru: "{name}: не удалось извлечь текст.",
    en: "{name}: couldn't extract text.",
  },

  // Server actions — xato xabarlari
  pnErrLoginFirst: { uz: "Avval tizimga kiring.", "uz-cyrl": "Аввал тизимга киринг.", ru: "Сначала войдите в систему.", en: "Please sign in first." },
  pnErrNoSession: { uz: "Sessiya topilmadi", "uz-cyrl": "Сессия топилмади", ru: "Сессия не найдена", en: "Session not found" },
  pnErrBadRequest: { uz: "Noto'g'ri so'rov.", "uz-cyrl": "Нотўғри сўров.", ru: "Неверный запрос.", en: "Invalid request." },
  pnErrFigmaToken: {
    uz: "Figma token noto'g'ri yoki muddati o'tgan.",
    "uz-cyrl": "Figma токен нотўғри ёки муддати ўтган.",
    ru: "Токен Figma неверен или истёк.",
    en: "Figma token is invalid or expired.",
  },
  pnErrGithubToken: {
    uz: "GitHub token noto'g'ri yoki ruxsat yetarli emas.",
    "uz-cyrl": "GitHub токен нотўғри ёки рухсат етарли эмас.",
    ru: "Токен GitHub неверен или у него недостаточно прав.",
    en: "GitHub token is invalid or lacks permissions.",
  },
  pnErrVerifyNetwork: {
    uz: "Tekshirishda tarmoq xatosi.",
    "uz-cyrl": "Текширишда тармоқ хатоси.",
    ru: "Сетевая ошибка при проверке.",
    en: "Network error during verification.",
  },
  pnErrBadToken: { uz: "Token noto'g'ri.", "uz-cyrl": "Токен нотўғри.", ru: "Неверный токен.", en: "Invalid token." },
  pnErrNoConnector: { uz: "Bunday connector yo'q.", "uz-cyrl": "Бундай коннектор йўқ.", ru: "Такого коннектора нет.", en: "No such connector." },
  pnErrMcpUrl: {
    uz: "MCP server URL noto'g'ri (https://...).",
    "uz-cyrl": "MCP сервер URL нотўғри (https://...).",
    ru: "Неверный URL MCP-сервера (https://...).",
    en: "Invalid MCP server URL (https://...).",
  },
  pnErrNoTokenAuth: {
    uz: "Bu connector token bilan ulanmaydi.",
    "uz-cyrl": "Бу коннектор токен билан уланмайди.",
    ru: "Этот коннектор не подключается по токену.",
    en: "This connector doesn't connect with a token.",
  },
  pnErrNotGoogle: { uz: "Bu Google connector emas.", "uz-cyrl": "Бу Google коннектор эмас.", ru: "Это не коннектор Google.", en: "This is not a Google connector." },
  pnErrNoOauthUrl: {
    uz: "OAuth havolasi olinmadi.",
    "uz-cyrl": "OAuth ҳаволаси олинмади.",
    ru: "Не удалось получить ссылку OAuth.",
    en: "Couldn't get the OAuth link.",
  },
  pnErrBadFileData: { uz: "Noto'g'ri fayl ma'lumoti", "uz-cyrl": "Нотўғри файл маълумоти", ru: "Некорректные данные файла", en: "Invalid file data" },
  pnErrFileEmpty: { uz: "Fayl bo'sh", "uz-cyrl": "Файл бўш", ru: "Файл пуст", en: "File is empty" },
  pnErrFileNotSaved: { uz: "Fayl saqlanmadi", "uz-cyrl": "Файл сақланмади", ru: "Не удалось сохранить файл", en: "File was not saved" },
  pnErrIndexing: { uz: "Indekslash xato", "uz-cyrl": "Индекслаш хатоси", ru: "Ошибка индексации", en: "Indexing error" },
  pnErrBadPlan: { uz: "Noto'g'ri tarif", "uz-cyrl": "Нотўғри тариф", ru: "Неверный тариф", en: "Invalid plan" },
  pnErrPlanPaymentOnly: {
    uz: "Tarif faqat to'lov orqali ochiladi.",
    "uz-cyrl": "Тариф фақат тўлов орқали очилади.",
    ru: "Тариф открывается только после оплаты.",
    en: "Plans unlock only through payment.",
  },
  pnErrSupabaseMissing: { uz: "Supabase sozlanmagan", "uz-cyrl": "Supabase созланмаган", ru: "Supabase не настроен", en: "Supabase is not configured" },
  pnErrNoServiceKey: {
    uz: "SUPABASE_SERVICE_ROLE_KEY yo'q (tarif serverdan o'zgartiriladi)",
    "uz-cyrl": "SUPABASE_SERVICE_ROLE_KEY йўқ (тариф сервердан ўзгартирилади)",
    ru: "Нет SUPABASE_SERVICE_ROLE_KEY (тариф меняется на сервере)",
    en: "SUPABASE_SERVICE_ROLE_KEY is missing (the plan is changed server-side)",
  },
  pnErrPlanNotSaved: {
    uz: "Tarif saqlanmadi ({status})",
    "uz-cyrl": "Тариф сақланмади ({status})",
    ru: "Не удалось сохранить тариф ({status})",
    en: "Plan was not saved ({status})",
  },
} satisfies Dict;
