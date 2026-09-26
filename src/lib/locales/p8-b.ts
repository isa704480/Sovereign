import type { Dict } from "@/lib/i18n";

/** 4-bosqich audit tuzatishlari (B guruhi) tarjimalari (uz / uz-cyrl / ru / en). */
export const P8B = {
  // ── Ko'plik shakllari (one / few / many) ──
  p8bCharsOne: { uz: "{n} belgi", "uz-cyrl": "{n} белги", ru: "{n} символ", en: "{n} char" },
  p8bCharsFew: { uz: "{n} belgi", "uz-cyrl": "{n} белги", ru: "{n} символа", en: "{n} chars" },
  p8bCharsMany: { uz: "{n} belgi", "uz-cyrl": "{n} белги", ru: "{n} символов", en: "{n} chars" },
  p8bFilesOne: { uz: "{n} fayl", "uz-cyrl": "{n} файл", ru: "{n} файл", en: "{n} file" },
  p8bFilesFew: { uz: "{n} fayl", "uz-cyrl": "{n} файл", ru: "{n} файла", en: "{n} files" },
  p8bFilesMany: { uz: "{n} fayl", "uz-cyrl": "{n} файл", ru: "{n} файлов", en: "{n} files" },
  p8bDocsOne: { uz: "{n} hujjat", "uz-cyrl": "{n} ҳужжат", ru: "{n} документ", en: "{n} document" },
  p8bDocsFew: { uz: "{n} hujjat", "uz-cyrl": "{n} ҳужжат", ru: "{n} документа", en: "{n} documents" },
  p8bDocsMany: { uz: "{n} hujjat", "uz-cyrl": "{n} ҳужжат", ru: "{n} документов", en: "{n} documents" },
  p8bNodesOne: { uz: "{n} tugun", "uz-cyrl": "{n} тугун", ru: "{n} узел", en: "{n} node" },
  p8bNodesFew: { uz: "{n} tugun", "uz-cyrl": "{n} тугун", ru: "{n} узла", en: "{n} nodes" },
  p8bNodesMany: { uz: "{n} tugun", "uz-cyrl": "{n} тугун", ru: "{n} узлов", en: "{n} nodes" },
  p8bPagesOne: { uz: "{n} sahifa o'qildi", "uz-cyrl": "{n} саҳифа ўқилди", ru: "{n} страница прочитана", en: "{n} page read" },
  p8bPagesFew: { uz: "{n} sahifa o'qildi", "uz-cyrl": "{n} саҳифа ўқилди", ru: "{n} страницы прочитаны", en: "{n} pages read" },
  p8bPagesMany: { uz: "{n} sahifa o'qildi", "uz-cyrl": "{n} саҳифа ўқилди", ru: "{n} страниц прочитано", en: "{n} pages read" },
  p8bSuspiciousOne: { uz: "{n} ta shubhali fakt", "uz-cyrl": "{n} та шубҳали факт", ru: "{n} сомнительный факт", en: "{n} suspicious fact" },
  p8bSuspiciousFew: { uz: "{n} ta shubhali fakt", "uz-cyrl": "{n} та шубҳали факт", ru: "{n} сомнительных факта", en: "{n} suspicious facts" },
  p8bSuspiciousMany: { uz: "{n} ta shubhali fakt", "uz-cyrl": "{n} та шубҳали факт", ru: "{n} сомнительных фактов", en: "{n} suspicious facts" },
  p8bClaimsOne: { uz: "{n} ta da'vo tekshirildi", "uz-cyrl": "{n} та даъво текширилди", ru: "{n} утверждение проверено", en: "{n} claim checked" },
  p8bClaimsFew: { uz: "{n} ta da'vo tekshirildi", "uz-cyrl": "{n} та даъво текширилди", ru: "{n} утверждения проверены", en: "{n} claims checked" },
  p8bClaimsMany: { uz: "{n} ta da'vo tekshirildi", "uz-cyrl": "{n} та даъво текширилди", ru: "{n} утверждений проверено", en: "{n} claims checked" },

  // ── Umumiy ──
  p8bDeleteNamed: {
    uz: "“{name}” ni o'chirish",
    "uz-cyrl": "“{name}” ни ўчириш",
    ru: "Удалить «{name}»",
    en: "Delete “{name}”",
  },
  p8bPersonalToken: {
    uz: "{name} shaxsiy kirish tokeni",
    "uz-cyrl": "{name} шахсий кириш токени",
    ru: "Персональный токен доступа {name}",
    en: "{name} personal access token",
  },
  p8bReplyReady: {
    uz: "Javob tayyor",
    "uz-cyrl": "Жавоб тайёр",
    ru: "Ответ готов",
    en: "Reply ready",
  },

  // ── To'lov oynasi ──
  p8bPayTimeout: {
    uz: "So'rov juda uzoq davom etdi. Qayta urinib ko'ring yoki boshqa to'lov usulini tanlang.",
    "uz-cyrl": "Сўров жуда узоқ давом этди. Қайта уриниб кўринг ёки бошқа тўлов усулини танланг.",
    ru: "Запрос занял слишком много времени. Попробуйте ещё раз или выберите другой способ оплаты.",
    en: "The request took too long. Please try again or choose another payment method.",
  },
  p8bPayByCardNoteYear: {
    uz: "Har yili avtomatik yangilanadi, istalgan vaqt bekor qilish mumkin.",
    "uz-cyrl": "Ҳар йили автоматик янгиланади, исталган вақт бекор қилиш мумкин.",
    ru: "Продлевается автоматически каждый год, можно отменить в любой момент.",
    en: "Renews automatically every year, cancel anytime.",
  },
  p8bCryptoFeeNote: {
    uz: "Narxga to'lov provayderining ~3% komissiyasi qo'shiladi; aniq summa to'lov sahifasida ko'rsatiladi.",
    "uz-cyrl": "Нархга тўлов провайдерининг ~3% комиссияси қўшилади; аниқ сумма тўлов саҳифасида кўрсатилади.",
    ru: "К цене добавляется комиссия платёжного провайдера ~3%; точная сумма будет на странице оплаты.",
    en: "A ~3% payment-provider fee is added; the exact amount is shown on the payment page.",
  },
  p8bPromoHint: {
    uz: "Promokodingiz bo'lsa, to'lov usulini tanlashdan oldin yozing.",
    "uz-cyrl": "Промокодингиз бўлса, тўлов усулини танлашдан олдин ёзинг.",
    ru: "Есть промокод? Введите его до выбора способа оплаты.",
    en: "Have a promo code? Enter it before choosing a payment method.",
  },

  // ── Cowork: rejim, papkasiz ishlash, yangi papka yaratish ──
  p8bModeLabel: { uz: "Ish rejimi", "uz-cyrl": "Иш режими", ru: "Режим работы", en: "Work mode" },
  p8bCwNoFolderShort: { uz: "papkasiz", "uz-cyrl": "папкасиз", ru: "без папки", en: "no folder" },
  p8bCwNoFolderActive: {
    uz: "Cowork papkasiz: kod chatda qaytadi, fayllar diskka yozilmaydi. Papka ulash uchun bosing.",
    "uz-cyrl": "Cowork папкасиз: код чатда қайтади, файллар дискка ёзилмайди. Папка улаш учун босинг.",
    ru: "Cowork без папки: код приходит в чат, файлы на диск не записываются. Нажмите, чтобы подключить папку.",
    en: "Cowork without a folder: code comes back in the chat, files aren't written to disk. Click to attach a folder.",
  },
  p8bCwNoFolderNote: {
    uz: "Siz papkasiz ishlayapsiz: chat odatdagidek ishlaydi, kod xabarda va artefakt panelida qaytadi, lekin fayllar diskka yozilmaydi. Istalgan payt quyidan papka ulashingiz mumkin.",
    "uz-cyrl": "Сиз папкасиз ишлаяпсиз: чат одатдагидек ишлайди, код хабарда ва артефакт панелида қайтади, лекин файллар дискка ёзилмайди. Исталган пайт қуйидан папка улашингиз мумкин.",
    ru: "Вы работаете без папки: чат работает как обычно, код приходит в сообщении и на панели артефактов, но файлы на диск не записываются. Папку можно подключить в любой момент ниже.",
    en: "You're working without a folder: the chat works as usual and code comes back in the message and the artifact panel, but files aren't written to disk. You can attach a folder below at any time.",
  },
  p8bCwContinueNoFolder: {
    uz: "Papkasiz davom etish",
    "uz-cyrl": "Папкасиз давом этиш",
    ru: "Продолжить без папки",
    en: "Continue without a folder",
  },
  p8bCwUseAgain: {
    uz: "“{name}” papkasidan yana foydalanish",
    "uz-cyrl": "“{name}” папкасидан яна фойдаланиш",
    ru: "Снова использовать папку «{name}»",
    en: "Use “{name}” again",
  },
  p8bCwCreate: { uz: "Yangi papka yaratish", "uz-cyrl": "Янги папка яратиш", ru: "Создать новую папку", en: "Create new folder" },
  p8bCwNewName: { uz: "Yangi papka nomi", "uz-cyrl": "Янги папка номи", ru: "Имя новой папки", en: "New folder name" },
  p8bCwNamePlaceholder: { uz: "mening-loyiham", "uz-cyrl": "менинг-лойиҳам", ru: "мой-проект", en: "my-project" },
  p8bCwCreateBtn: { uz: "Yaratish", "uz-cyrl": "Яратиш", ru: "Создать", en: "Create" },
  p8bCwCreateHint: {
    uz: "Keyin papka qayerda yaratilishini (ota papkani) tanlaysiz.",
    "uz-cyrl": "Кейин папка қаерда яратилишини (ота папкани) танлайсиз.",
    ru: "Затем выберите, где создать папку (родительскую папку).",
    en: "Next, you'll choose where to create it (the parent folder).",
  },
  p8bCwBadName: {
    uz: "Papka nomi noto'g'ri: / \\ : * ? \" < > | belgilari, nuqta yoki bo'sh joy bilan tugash va tizim nomlari (CON, NUL…) mumkin emas.",
    "uz-cyrl": "Папка номи нотўғри: / \\ : * ? \" < > | белгилари, нуқта ёки бўш жой билан тугаш ва тизим номлари (CON, NUL…) мумкин эмас.",
    ru: "Недопустимое имя папки: нельзя использовать символы / \\ : * ? \" < > |, точку или пробел в конце и системные имена (CON, NUL…).",
    en: "Invalid folder name: the characters / \\ : * ? \" < > |, a trailing dot or space, and system names (CON, NUL…) aren't allowed.",
  },
  p8bCwCreateUnsupported: {
    uz: "Bu brauzer papka yaratishni qo'llamaydi (Firefox, Safari). Chrome yoki Edge'dan foydalaning yoki papkani kompyuterda yaratib, keyin tanlang.",
    "uz-cyrl": "Бу браузер папка яратишни қўлламайди (Firefox, Safari). Chrome ёки Edge'дан фойдаланинг ёки папкани компьютерда яратиб, кейин танланг.",
    ru: "Этот браузер не умеет создавать папки (Firefox, Safari). Используйте Chrome или Edge либо создайте папку на компьютере и выберите её.",
    en: "This browser can't create folders (Firefox, Safari). Use Chrome or Edge, or create the folder on your computer and then choose it.",
  },
  p8bCwExists: {
    uz: "“{name}” papkasi allaqachon bor. Uni “Papkani tanlash” orqali oching yoki boshqa nom bering.",
    "uz-cyrl": "“{name}” папкаси аллақачон бор. Уни “Папкани танлаш” орқали очинг ёки бошқа ном беринг.",
    ru: "Папка «{name}» уже существует. Откройте её через «Выбрать папку» или укажите другое имя.",
    en: "A folder named “{name}” already exists. Open it with “Choose folder” or pick another name.",
  },
  p8bCwCreateFailed: {
    uz: "Papka yaratilmadi. Qayta urinib ko'ring yoki boshqa joyni tanlang.",
    "uz-cyrl": "Папка яратилмади. Қайта уриниб кўринг ёки бошқа жойни танланг.",
    ru: "Не удалось создать папку. Попробуйте ещё раз или выберите другое место.",
    en: "Couldn't create the folder. Try again or choose another location.",
  },
  p8bCwDisconnect: { uz: "Papkani uzish", "uz-cyrl": "Папкани узиш", ru: "Отключить папку", en: "Disconnect folder" },
  p8bCwDisconnectNamed: {
    uz: "“{name}” papkasini uzish",
    "uz-cyrl": "“{name}” папкасини узиш",
    ru: "Отключить папку «{name}»",
    en: "Disconnect folder “{name}”",
  },
  p8bCwWriteFailed: {
    uz: "{path} saqlanmadi: bu yo'lga yozib bo'lmadi.",
    "uz-cyrl": "{path} сақланмади: бу йўлга ёзиб бўлмади.",
    ru: "Не удалось сохранить {path}: запись по этому пути невозможна.",
    en: "Couldn't save {path}: this path can't be written.",
  },
} satisfies Dict;
