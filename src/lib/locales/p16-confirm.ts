import type { Dict } from "@/lib/i18n";

/**
 * 16-bosqich: connector yozish amallarini tasdiqlash kartasi (ConnectorConfirmCard.tsx) — 4 tilda
 * (uz / uz-cyrl / ru / en). Amal (Sheets/Slides yaratish, qator qo'shish, MCP tool) model tool
 * siklida bajarilmaydi — foydalanuvchi shu kartada tasdiqlasagina bajariladi.
 */
export const P16C = {
  p16cGroupAria: {
    uz: "Tasdiqlanishi kerak bo'lgan amallar",
    "uz-cyrl": "Тасдиқланиши керак бўлган амаллар",
    ru: "Действия, ожидающие подтверждения",
    en: "Actions awaiting confirmation",
  },
  p16cTitle: { uz: "Tasdiqlash kerak", "uz-cyrl": "Тасдиқлаш керак", ru: "Нужно подтверждение", en: "Confirmation needed" },
  p16cIntro: {
    uz: "Siz tasdiqlamaguningizcha hech narsa o'zgarmaydi.",
    "uz-cyrl": "Сиз тасдиқламагунингизча ҳеч нарса ўзгармайди.",
    ru: "Пока вы не подтвердите, ничего не изменится.",
    en: "Nothing changes until you confirm.",
  },
  p16cWhat: { uz: "Nima bo'ladi", "uz-cyrl": "Нима бўлади", ru: "Что произойдёт", en: "What will happen" },
  p16cWhere: { uz: "Qayerda", "uz-cyrl": "Қаерда", ru: "Где", en: "Where" },

  p16cActSheetsCreate: {
    uz: "Yangi jadval yaratiladi",
    "uz-cyrl": "Янги жадвал яратилади",
    ru: "Будет создана новая таблица",
    en: "A new spreadsheet will be created",
  },
  p16cActSheetsCreateRows: {
    uz: "Yangi jadval yaratiladi va unga {n} ta qator yoziladi",
    "uz-cyrl": "Янги жадвал яратилади ва унга {n} та қатор ёзилади",
    ru: "Будет создана новая таблица, строк будет записано: {n}",
    en: "A new spreadsheet will be created with {n} row(s)",
  },
  p16cActSheetsAppend: {
    uz: "Mavjud jadvalga {n} ta qator qo'shiladi",
    "uz-cyrl": "Мавжуд жадвалга {n} та қатор қўшилади",
    ru: "В существующую таблицу будет добавлено строк: {n}",
    en: "{n} row(s) will be added to an existing spreadsheet",
  },
  p16cActSlidesCreate: {
    uz: "Yangi taqdimot yaratiladi",
    "uz-cyrl": "Янги тақдимот яратилади",
    ru: "Будет создана новая презентация",
    en: "A new presentation will be created",
  },
  p16cActMcp: {
    uz: "Tashqi MCP vositasi chaqiriladi: {tool}",
    "uz-cyrl": "Ташқи MCP воситаси чақирилади: {tool}",
    ru: "Будет вызван внешний MCP-инструмент: {tool}",
    en: "An external MCP tool will be called: {tool}",
  },

  p16cWhereSheets: {
    uz: "Google Sheets — sizning hisobingiz",
    "uz-cyrl": "Google Sheets — сизнинг ҳисобингиз",
    ru: "Google Sheets — ваш аккаунт",
    en: "Google Sheets — your account",
  },
  p16cWhereSlides: {
    uz: "Google Slides — sizning hisobingiz",
    "uz-cyrl": "Google Slides — сизнинг ҳисобингиз",
    ru: "Google Slides — ваш аккаунт",
    en: "Google Slides — your account",
  },
  p16cWhereMcp: { uz: "MCP server: {host}", "uz-cyrl": "MCP сервер: {host}", ru: "MCP-сервер: {host}", en: "MCP server: {host}" },

  p16cName: { uz: "Nomi", "uz-cyrl": "Номи", ru: "Название", en: "Name" },
  p16cSheetId: { uz: "Jadval ID", "uz-cyrl": "Жадвал ID", ru: "ID таблицы", en: "Spreadsheet ID" },
  p16cUntitled: { uz: "(nomsiz)", "uz-cyrl": "(номсиз)", ru: "(без названия)", en: "(untitled)" },
  p16cSize: {
    uz: "{n} qator × {c} ustun",
    "uz-cyrl": "{n} қатор × {c} устун",
    ru: "Строк: {n} × столбцов: {c}",
    en: "{n} rows × {c} columns",
  },
  p16cPreview: { uz: "Oldindan ko'rish", "uz-cyrl": "Олдиндан кўриш", ru: "Предпросмотр", en: "Preview" },
  p16cPreviewAria: {
    uz: "Yoziladigan qatorlarning birinchilari",
    "uz-cyrl": "Ёзиладиган қаторларнинг биринчилари",
    ru: "Первые строки, которые будут записаны",
    en: "First rows that will be written",
  },
  p16cMoreRows: { uz: "yana {n} ta qator", "uz-cyrl": "яна {n} та қатор", ru: "ещё строк: {n}", en: "{n} more row(s)" },
  p16cArgs: { uz: "Yuboriladigan ma'lumot", "uz-cyrl": "Юбориладиган маълумот", ru: "Передаваемые данные", en: "Data to be sent" },
  p16cFormulas: {
    uz: "Diqqat: {n} ta katak formula bilan boshlanadi — Sheets ularni formula sifatida hisoblaydi.",
    "uz-cyrl": "Диққат: {n} та катак формула билан бошланади — Sheets уларни формула сифатида ҳисоблайди.",
    ru: "Внимание: ячеек с формулами: {n} — Sheets вычислит их как формулы.",
    en: "Heads-up: {n} cell(s) start with a formula — Sheets will evaluate them.",
  },
  p16cExpiresIn: {
    uz: "{m} daqiqa ichida tasdiqlang",
    "uz-cyrl": "{m} дақиқа ичида тасдиқланг",
    ru: "Подтвердите в течение {m} мин.",
    en: "Confirm within {m} min",
  },

  p16cConfirm: { uz: "Tasdiqlash", "uz-cyrl": "Тасдиқлаш", ru: "Подтвердить", en: "Confirm" },
  p16cReject: { uz: "Bekor qilish", "uz-cyrl": "Бекор қилиш", ru: "Отменить", en: "Cancel" },
  p16cConfirmAria: {
    uz: "Amalni tasdiqlash va bajarish",
    "uz-cyrl": "Амални тасдиқлаш ва бажариш",
    ru: "Подтвердить и выполнить действие",
    en: "Confirm and run this action",
  },
  p16cRejectAria: {
    uz: "Amalni bekor qilish — hech narsa o'zgarmaydi",
    "uz-cyrl": "Амални бекор қилиш — ҳеч нарса ўзгармайди",
    ru: "Отменить действие — ничего не изменится",
    en: "Cancel this action — nothing will change",
  },

  p16cRunning: { uz: "Bajarilmoqda…", "uz-cyrl": "Бажарилмоқда…", ru: "Выполняется…", en: "Running…" },
  p16cDone: { uz: "Bajarildi", "uz-cyrl": "Бажарилди", ru: "Выполнено", en: "Done" },
  p16cPartial: {
    uz: "Qisman bajarildi: jadval yaratildi, lekin qatorlar qo'shilmadi",
    "uz-cyrl": "Қисман бажарилди: жадвал яратилди, лекин қаторлар қўшилмади",
    ru: "Выполнено частично: таблица создана, но строки не добавлены",
    en: "Partly done: the spreadsheet was created, but the rows were not added",
  },
  p16cRejected: {
    uz: "Bekor qilindi — hech narsa o'zgarmadi",
    "uz-cyrl": "Бекор қилинди — ҳеч нарса ўзгармади",
    ru: "Отменено — ничего не изменилось",
    en: "Cancelled — nothing was changed",
  },
  p16cExpired: {
    uz: "Muddati o'tdi — hech narsa o'zgarmadi. Kerak bo'lsa, so'rovni qayta yuboring.",
    "uz-cyrl": "Муддати ўтди — ҳеч нарса ўзгармади. Керак бўлса, сўровни қайта юборинг.",
    ru: "Срок истёк — ничего не изменилось. Если нужно, отправьте запрос ещё раз.",
    en: "Expired — nothing was changed. Send the request again if you still need it.",
  },
  p16cError: { uz: "Bajarib bo'lmadi", "uz-cyrl": "Бажариб бўлмади", ru: "Не удалось выполнить", en: "Couldn't complete" },
  p16cErrAuth: {
    uz: "Hisobingizga kiring va qayta urinib ko'ring.",
    "uz-cyrl": "Ҳисобингизга киринг ва қайта уриниб кўринг.",
    ru: "Войдите в аккаунт и попробуйте снова.",
    en: "Sign in and try again.",
  },
  p16cErrInvalid: {
    uz: "So'rov yaroqsiz yoki allaqachon ishlatilgan.",
    "uz-cyrl": "Сўров яроқсиз ёки аллақачон ишлатилган.",
    ru: "Запрос недействителен или уже использован.",
    en: "This request is invalid or has already been used.",
  },
  p16cErrRate: {
    uz: "Juda ko'p urinish. Birozdan keyin qayta urinib ko'ring.",
    "uz-cyrl": "Жуда кўп уриниш. Бироздан кейин қайта уриниб кўринг.",
    ru: "Слишком много попыток. Попробуйте чуть позже.",
    en: "Too many attempts. Try again in a moment.",
  },
  p16cErrNotConnected: {
    uz: "Connector ulanmagan yoki o'chirilgan. Sozlamalarda qayta ulang.",
    "uz-cyrl": "Коннектор уланмаган ёки ўчирилган. Созламаларда қайта уланг.",
    ru: "Коннектор не подключён или отключён. Подключите его снова в настройках.",
    en: "This connector is disconnected or turned off. Reconnect it in Settings.",
  },
  p16cErrFailed: {
    uz: "Servis xato qaytardi.",
    "uz-cyrl": "Сервис хато қайтарди.",
    ru: "Сервис вернул ошибку.",
    en: "The service returned an error.",
  },
  p16cOpen: { uz: "Ochish", "uz-cyrl": "Очиш", ru: "Открыть", en: "Open" },
  p16cOpenAria: {
    uz: "Natijani yangi varaqda ochish (Google)",
    "uz-cyrl": "Натижани янги варақда очиш (Google)",
    ru: "Открыть результат в новой вкладке (Google)",
    en: "Open the result in a new tab (Google)",
  },
  p16cOutput: { uz: "Server javobi", "uz-cyrl": "Сервер жавоби", ru: "Ответ сервера", en: "Server response" },
} satisfies Dict;
