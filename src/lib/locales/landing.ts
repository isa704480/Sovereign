import type { Dict, L10n } from "@/lib/i18n";

/** landing bo'limi tarjimalari (uz / uz-cyrl / ru / en). Kalitlar global DICT ga qo'shiladi. */
export const LANDING = {
  // Hero
  ldHeroTitle1: { uz: "Barcha AI.", "uz-cyrl": "Барча AI.", ru: "Все ИИ.", en: "Every AI." },
  ldHeroTitle2: { uz: "Bitta oyna.", "uz-cyrl": "Битта ойна.", ru: "Одно окно.", en: "One window." },

  // ModelCompare
  ldCompareEyebrow: { uz: "Bitta joyda", "uz-cyrl": "Битта жойда", ru: "В одном месте", en: "All in one place" },
  /** {n} — modellar soni (alohida rangda chiqadi). */
  ldCompareModels: { uz: "{n} model.", "uz-cyrl": "{n} модел.", ru: "{n} моделей.", en: "{n} models." },
  ldCompareFamilies: {
    uz: "Har bir AI oilasidan.",
    "uz-cyrl": "Ҳар бир AI оиласидан.",
    ru: "Из каждого семейства ИИ.",
    en: "From every AI family.",
  },
  ldCompareSub: {
    uz: "Claude, GPT, Gemini, DeepSeek, Qwen, Kimi va boshqalar — hammasi bitta tanlagichda. Modelni bir zumda almashtiring, suhbat davom etadi.",
    "uz-cyrl": "Claude, GPT, Gemini, DeepSeek, Qwen, Kimi ва бошқалар — ҳаммаси битта танлагичда. Моделни бир зумда алмаштиринг, суҳбат давом этади.",
    ru: "Claude, GPT, Gemini, DeepSeek, Qwen, Kimi и другие — все в одном переключателе. Меняйте модель мгновенно, а разговор продолжается.",
    en: "Claude, GPT, Gemini, DeepSeek, Qwen, Kimi and more — all in one picker. Switch models instantly and the conversation carries on.",
  },
  ldLoading: { uz: "Yuklanyapti…", "uz-cyrl": "Юкланяпти…", ru: "Загрузка…", en: "Loading…" },
  ldCompareFootnote: {
    uz: "Yangi modellar chiqishi bilan avtomatik qo'shiladi — siz hech narsa qilmaysiz.",
    "uz-cyrl": "Янги моделлар чиқиши билан автоматик қўшилади — сиз ҳеч нарса қилмайсиз.",
    ru: "Новые модели добавляются автоматически сразу после выхода — вам ничего не нужно делать.",
    en: "New models are added automatically as soon as they launch — you don't lift a finger.",
  },

  // Features
  ldFeatEyebrow: { uz: "Nima uchun SOVEREIGN", "uz-cyrl": "Нима учун SOVEREIGN", ru: "Почему SOVEREIGN", en: "Why SOVEREIGN" },
  ldFeatTitle1: { uz: "AI kuchi.", "uz-cyrl": "AI кучи.", ru: "Сила ИИ.", en: "The power of AI." },
  ldFeatTitle2: {
    uz: "Sizning nazoratingiz.",
    "uz-cyrl": "Сизнинг назоратингиз.",
    ru: "Под вашим контролем.",
    en: "Under your control.",
  },
  ldFeat1Title: { uz: "Zero-Trust maxfiylik", "uz-cyrl": "Zero-Trust махфийлик", ru: "Приватность Zero-Trust", en: "Zero-Trust privacy" },
  ldFeat1Body: {
    uz: "AI kompaniyalari haqiqiy ma'lumotingizni ko'rmaydi — ism, raqam, kompaniya so'rovdan oldin maskalanadi.",
    "uz-cyrl": "AI компаниялари ҳақиқий маълумотингизни кўрмайди — исм, рақам, компания сўровдан олдин маскаланади.",
    ru: "AI-компании не видят ваших настоящих данных — имена, номера и названия компаний маскируются до отправки запроса.",
    en: "AI companies never see your real data — names, numbers and companies are masked before the request goes out.",
  },
  ldFeat2Title: { uz: "Umrbod xotira", "uz-cyrl": "Умрбод хотира", ru: "Пожизненная память", en: "Lifelong memory" },
  ldFeat2Body: {
    uz: "AI sizni yillar davomida o'rganadi. Bilim faqat sizda — shifrlangan, eksport qilinadigan, o'chiriladigan.",
    "uz-cyrl": "AI сизни йиллар давомида ўрганади. Билим фақат сизда — шифрланган, экспорт қилинадиган, ўчириладиган.",
    ru: "ИИ узнаёт вас годами. Знания остаются только у вас — зашифрованы, их можно экспортировать и удалить.",
    en: "AI gets to know you over the years. The knowledge stays with you — encrypted, exportable, deletable.",
  },
  ldFeat3Title: { uz: "Tekshirilgan javoblar", "uz-cyrl": "Текширилган жавоблар", ru: "Проверенные ответы", en: "Verified answers" },
  ldFeat3Body: {
    uz: "Qidiruv javoblari haqiqiy manba havolalari bilan keladi. Muhim da'volarni ikkinchi AI manbalarga solishtiradi va tasdiqlanmaganini belgilaydi.",
    "uz-cyrl": "Қидирув жавоблари ҳақиқий манба ҳаволалари билан келади. Муҳим даъволарни иккинчи AI манбаларга солиштиради ва тасдиқланмаганини белгилайди.",
    ru: "Ответы с поиском приходят с настоящими ссылками на источники. Второй ИИ сверяет ключевые утверждения с источниками и помечает неподтверждённые.",
    en: "Search answers come with real source links. A second AI checks key claims against those sources and flags anything it can't confirm.",
  },
  ldFeat4Tag: { uz: "1700+ model", "uz-cyrl": "1700+ модел", ru: "1700+ моделей", en: "1700+ models" },
  ldFeat4Title: { uz: "Barchasi bitta oynada", "uz-cyrl": "Барчаси битта ойнада", ru: "Всё в одном окне", en: "All in one window" },
  ldFeat4Body: {
    uz: "Claude, GPT, Gemini, DeepSeek — modelni bir zumda almashtiring, suhbat davom etadi.",
    "uz-cyrl": "Claude, GPT, Gemini, DeepSeek — моделни бир зумда алмаштиринг, суҳбат давом этади.",
    ru: "Claude, GPT, Gemini, DeepSeek — меняйте модель мгновенно, разговор продолжается.",
    en: "Claude, GPT, Gemini, DeepSeek — switch models instantly and the conversation continues.",
  },
  ldFeat5Title: {
    uz: "O'zi eng yaxshisini tanlaydi",
    "uz-cyrl": "Ўзи энг яхшисини танлайди",
    ru: "Сам выбирает лучшую",
    en: "Picks the best on its own",
  },
  ldFeat5Body: {
    uz: "SOVEREIGN Auto vazifaga qarab eng mos va tejamkor modelni o'zi yo'naltiradi.",
    "uz-cyrl": "SOVEREIGN Auto вазифага қараб энг мос ва тежамкор моделни ўзи йўналтиради.",
    ru: "SOVEREIGN Auto сам направляет задачу к самой подходящей и экономной модели.",
    en: "SOVEREIGN Auto routes each task to the best-fitting, most cost-efficient model by itself.",
  },
  ldFeat6Title: {
    uz: "Faqat sizning qurilmangizda",
    "uz-cyrl": "Фақат сизнинг қурилмангизда",
    ru: "Только на вашем устройстве",
    en: "Only on your device",
  },
  ldFeat6Body: {
    uz: "Xotira kaliti qurilmangizda ochiladi. Serverda ham shifrlangan holda turadi.",
    "uz-cyrl": "Хотира калити қурилмангизда очилади. Серверда ҳам шифрланган ҳолда туради.",
    ru: "Ключ памяти открывается на вашем устройстве. На сервере она тоже хранится в зашифрованном виде.",
    en: "Your memory key unlocks on your device. On the server, memory stays encrypted too.",
  },

  // ModelShowcase / ModelSwitcherDemo
  ldFree: { uz: "Tekin", "uz-cyrl": "Текин", ru: "Бесплатно", en: "Free" },
  ldShowcaseTitle: {
    uz: "Qaysi AI'ni tanlasangiz — biz qo'llab-quvvatlaymiz",
    "uz-cyrl": "Қайси AI'ни танласангиз — биз қўллаб-қувватлаймиз",
    ru: "Какой бы ИИ вы ни выбрали — мы его поддерживаем",
    en: "Whichever AI you choose — we support it",
  },
  ldShowcaseSub: {
    uz: "Har bir model o'z atmosferasi bilan keladi. Model almashganda butun interfeys unga moslashadi.",
    "uz-cyrl": "Ҳар бир модел ўз атмосфераси билан келади. Модел алмашганда бутун интерфейс унга мослашади.",
    ru: "Каждая модель приходит со своей атмосферой. При смене модели весь интерфейс подстраивается под неё.",
    en: "Every model brings its own atmosphere. Switch models and the whole interface adapts to it.",
  },
  ldPerRequest: { uz: "$0.001/so'rov", "uz-cyrl": "$0.001/сўров", ru: "$0.001/запрос", en: "$0.001/request" },
  ldActive: { uz: "Faol", "uz-cyrl": "Фаол", ru: "Активна", en: "Active" },

  // PrivacyBand
  ldPrivacyTitle1: {
    uz: "AI sizning so'rovingizni ko'radi.",
    "uz-cyrl": "AI сизнинг сўровингизни кўради.",
    ru: "ИИ видит ваш запрос.",
    en: "AI sees your request.",
  },
  ldPrivacyTitle2: { uz: "Sizni — hech qachon.", "uz-cyrl": "Сизни — ҳеч қачон.", ru: "Вас — никогда.", en: "You — never." },
  ldPrivacyBody: {
    uz: "Shaxsiy ma'lumotlar brauzeringizdan chiqishidan oldin tokenlarga almashtiriladi. Javob qaytgach, tokenlar faqat sizning qurilmangizda qayta tiklanadi.",
    "uz-cyrl": "Шахсий маълумотлар браузерингиздан чиқишидан олдин токенларга алмаштирилади. Жавоб қайтгач, токенлар фақат сизнинг қурилмангизда қайта тикланади.",
    ru: "Личные данные заменяются токенами ещё до того, как покинут ваш браузер. Когда приходит ответ, токены восстанавливаются только на вашем устройстве.",
    en: "Personal data is swapped for tokens before it ever leaves your browser. When the answer comes back, the tokens are restored only on your device.",
  },
  ldCreateAccount: { uz: "Hisob yaratish", "uz-cyrl": "Ҳисоб яратиш", ru: "Создать аккаунт", en: "Create account" },
  ldYouWrote: { uz: "Siz yozdingiz", "uz-cyrl": "Сиз ёздингиз", ru: "Вы написали", en: "You wrote" },
  ldTokenization: {
    uz: "↓ tokenizatsiya · < 50ms",
    "uz-cyrl": "↓ токенизация · < 50ms",
    ru: "↓ токенизация · < 50 мс",
    en: "↓ tokenization · < 50ms",
  },
  ldAiSees: { uz: "AI ko'radi", "uz-cyrl": "AI кўради", ru: "ИИ видит", en: "AI sees" },
  ldPrivacyExampleFrom: {
    uz: "Asilbek Yusupov, FayzInc, $50 000 byudjet",
    "uz-cyrl": "Асилбек Юсупов, FayzInc, $50 000 бюджет",
    ru: "Асилбек Юсупов, FayzInc, бюджет $50 000",
    en: "Asilbek Yusupov, FayzInc, $50,000 budget",
  },
  ldPrivacyExampleTo: {
    uz: "[PERSON_A], [ORG_A], [VAL_1] byudjet",
    "uz-cyrl": "[PERSON_A], [ORG_A], [VAL_1] бюджет",
    ru: "[PERSON_A], [ORG_A], бюджет [VAL_1]",
    en: "[PERSON_A], [ORG_A], [VAL_1] budget",
  },

  // Pricing
  ldPricingTitle1: { uz: "Tekin boshlang.", "uz-cyrl": "Текин бошланг.", ru: "Начните бесплатно.", en: "Start for free." },
  ldPricingTitle2: {
    uz: "Kerak bo'lganda oshiring.",
    "uz-cyrl": "Керак бўлганда оширинг.",
    ru: "Повышайте тариф, когда нужно.",
    en: "Upgrade when you need to.",
  },
  ldPricingSub: {
    uz: "Tekin rejimda saxiy modellar. Pullik tariflar flagman modellar, to'liq kod yozish va internet tadqiqotni ochadi.",
    "uz-cyrl": "Текин режимда сахий моделлар. Пуллик тарифлар флагман моделлар, тўлиқ код ёзиш ва интернет тадқиқотни очади.",
    ru: "Щедрый набор моделей в бесплатном режиме. Платные тарифы открывают флагманские модели, полноценное написание кода и веб-исследования.",
    en: "Generous models on the free tier. Paid plans unlock flagship models, full code generation and web research.",
  },
  /** {plan} — tarif nomi (Basic, Pro, Ultra). */
  ldSelectPlan: { uz: "{plan} tanlash", "uz-cyrl": "{plan} танлаш", ru: "Выбрать {plan}", en: "Choose {plan}" },

  // Footer
  ldFooterProduct: { uz: "Mahsulot", "uz-cyrl": "Маҳсулот", ru: "Продукт", en: "Product" },
  ldRegister: { uz: "Ro'yxatdan o'tish", "uz-cyrl": "Рўйхатдан ўтиш", ru: "Регистрация", en: "Sign up" },
  ldFooterLegal: { uz: "Huquqiy", "uz-cyrl": "Ҳуқуқий", ru: "Правовая информация", en: "Legal" },
  ldTerms: { uz: "Foydalanish shartlari", "uz-cyrl": "Фойдаланиш шартлари", ru: "Условия использования", en: "Terms of use" },
  ldRefund: { uz: "Pul qaytarish", "uz-cyrl": "Пул қайтариш", ru: "Возврат средств", en: "Refunds" },
  ldPrivacyPolicy: {
    uz: "Maxfiylik siyosati",
    "uz-cyrl": "Махфийлик сиёсати",
    ru: "Политика конфиденциальности",
    en: "Privacy policy",
  },

  // Navbar
  ldMenuOpen: { uz: "Menyuni ochish", "uz-cyrl": "Менюни очиш", ru: "Открыть меню", en: "Open menu" },
  ldMenuClose: { uz: "Menyuni yopish", "uz-cyrl": "Менюни ёпиш", ru: "Закрыть меню", en: "Close menu" },
  ldMonthly: { uz: "Oylik", "uz-cyrl": "Ойлик", ru: "Помесячно", en: "Monthly" },
  ldYearly: { uz: "Yillik", "uz-cyrl": "Йиллик", ru: "Годовой", en: "Yearly" },
  ldTwoMonthsFree: { uz: "2 oy bepul", "uz-cyrl": "2 ой бепул", ru: "2 мес. бесплатно", en: "2 months free" },
  ldPerYear: { uz: "yil", "uz-cyrl": "йил", ru: "год", en: "yr" },
  ldBilledYearly: {
    uz: "oyiga ${price} · yiliga bir marta to'lanadi",
    "uz-cyrl": "ойига ${price} · йилига бир марта тўланади",
    ru: "${price} в месяц · оплата раз в год",
    en: "${price}/mo · billed once a year",
  },
  ldBillingPeriod: { uz: "To'lov davri", "uz-cyrl": "Тўлов даври", ru: "Период оплаты", en: "Billing period" },
  ldPerDay: {
    uz: "kuniga atigi ~${price}",
    "uz-cyrl": "кунига атиги ~${price}",
    ru: "всего ~${price} в день",
    en: "just ~${price} a day",
  },
} satisfies Dict;

/**
 * Landing'dagi model kartalari uchun tarjimalar (config/models.ts shaklini o'zgartirmaslik uchun
 * alohida xarita). Kalit — model id. Topilmasa asl o'zbekcha matn ko'rsatiladi.
 */
export const LD_MODEL_TEXT: Record<string, { description: L10n; demoUser?: L10n; demoAi?: L10n }> = {
  "claude-sonnet-4-5": {
    description: {
      uz: "Chuqur fikrlash, uzun matnlar, nozik tahrir. Yaxshi fikrlar uchun suhbat.",
      "uz-cyrl": "Чуқур фикрлаш, узун матнлар, нозик таҳрир. Яхши фикрлар учун суҳбат.",
      ru: "Глубокое мышление, длинные тексты, тонкая редактура. Собеседник для хороших идей.",
      en: "Deep thinking, long texts, careful editing. A conversation partner for good ideas.",
    },
    demoUser: {
      uz: "Investor uchun 3 gapli pitch yozib ber.",
      "uz-cyrl": "Инвестор учун 3 гапли питч ёзиб бер.",
      ru: "Напиши питч для инвестора в 3 предложениях.",
      en: "Write a 3-sentence pitch for an investor.",
    },
    demoAi: {
      uz: "SOVEREIGN — barcha AI'lar bitta joyda, ma'lumotlaringiz esa faqat sizda...",
      "uz-cyrl": "SOVEREIGN — барча AI'лар битта жойда, маълумотларингиз эса фақат сизда...",
      ru: "SOVEREIGN — все ИИ в одном месте, а ваши данные остаются только у вас...",
      en: "SOVEREIGN — every AI in one place, while your data stays only with you...",
    },
  },
  "gpt-4o": {
    description: {
      uz: "Tez, aniq, ko'p qirrali. Kod yozish va texnik masalalar uchun.",
      "uz-cyrl": "Тез, аниқ, кўп қиррали. Код ёзиш ва техник масалалар учун.",
      ru: "Быстрый, точный, универсальный. Для кода и технических задач.",
      en: "Fast, precise, versatile. For coding and technical tasks.",
    },
    demoUser: {
      uz: "Python'da JWT tekshiradigan funksiya yoz.",
      "uz-cyrl": "Python'да JWT текширадиган функция ёз.",
      ru: "Напиши функцию на Python для проверки JWT.",
      en: "Write a Python function that verifies a JWT.",
    },
  },
  "gemini-pro-1.5": {
    description: {
      uz: "Rasm, video, katta kontekst. Vizual va ko'p formatli ish uchun.",
      "uz-cyrl": "Расм, видео, катта контекст. Визуал ва кўп форматли иш учун.",
      ru: "Изображения, видео, большой контекст. Для визуальной и мультиформатной работы.",
      en: "Images, video, huge context. For visual and multi-format work.",
    },
    demoUser: {
      uz: "Bu grafikdagi trendni tushuntir.",
      "uz-cyrl": "Бу графикдаги трендни тушунтир.",
      ru: "Объясни тренд на этом графике.",
      en: "Explain the trend in this chart.",
    },
    demoAi: {
      uz: "Q3 da o'sish 34%, asosiy sabab — mobil foydalanuvchilar oqimi...",
      "uz-cyrl": "Q3 да ўсиш 34%, асосий сабаб — мобил фойдаланувчилар оқими...",
      ru: "В Q3 рост 34%, главная причина — приток мобильных пользователей...",
      en: "Q3 growth is 34%, driven mainly by an influx of mobile users...",
    },
  },
  "sonar-online": {
    description: {
      uz: "Har bir javob manbalar bilan. Yangiliklar, faktlar, ilmiy maqolalar.",
      "uz-cyrl": "Ҳар бир жавоб манбалар билан. Янгиликлар, фактлар, илмий мақолалар.",
      ru: "Каждый ответ — с источниками. Новости, факты, научные статьи.",
      en: "Every answer comes with sources. News, facts, research papers.",
    },
    demoUser: {
      uz: "2026 da AI maxfiylik qonunlari qanday o'zgardi?",
      "uz-cyrl": "2026 да AI махфийлик қонунлари қандай ўзгарди?",
      ru: "Как изменились законы о приватности ИИ в 2026 году?",
      en: "How did AI privacy laws change in 2026?",
    },
    demoAi: {
      uz: "EU AI Act to'liq kuchga kirdi [1], AQShda 12 shtat yangi qonun qabul qildi [2]...",
      "uz-cyrl": "EU AI Act тўлиқ кучга кирди [1], АҚШда 12 штат янги қонун қабул қилди [2]...",
      ru: "EU AI Act полностью вступил в силу [1], в США 12 штатов приняли новые законы [2]...",
      en: "The EU AI Act took full effect [1], and 12 US states passed new laws [2]...",
    },
  },
  "mistral-large": {
    description: {
      uz: "Fransuz, nemis, ispan — Evropa tillari uchun kuchli. Professional ohang.",
      "uz-cyrl": "Француз, немис, испан — Европа тиллари учун кучли. Профессионал оҳанг.",
      ru: "Французский, немецкий, испанский — силён в европейских языках. Профессиональный тон.",
      en: "French, German, Spanish — strong in European languages. Professional tone.",
    },
    demoUser: {
      uz: "Bu xatni fransuzchaga tarjima qil.",
      "uz-cyrl": "Бу хатни французчага таржима қил.",
      ru: "Переведи это письмо на французский.",
      en: "Translate this letter into French.",
    },
  },
  "llama-3.1-8b:free": {
    description: {
      uz: "Meta'ning ochiq modeli. Eng arzon variant — kundalik savollar uchun yetarli.",
      "uz-cyrl": "Meta'нинг очиқ модели. Энг арзон вариант — кундалик саволлар учун етарли.",
      ru: "Открытая модель от Meta. Самый дешёвый вариант — хватает для повседневных вопросов.",
      en: "Meta's open model. The cheapest option — enough for everyday questions.",
    },
    demoUser: {
      uz: "Bugun nima pishirsam bo'ladi?",
      "uz-cyrl": "Бугун нима пиширсам бўлади?",
      ru: "Что мне сегодня приготовить?",
      en: "What should I cook today?",
    },
    demoAi: {
      uz: "Tez va oson: sabzavotli osh yoki tovuqli salat. Qaysi masalliqlar bor?",
      "uz-cyrl": "Тез ва осон: сабзавотли ош ёки товуқли салат. Қайси масаллиқлар бор?",
      ru: "Быстро и просто: овощной плов или салат с курицей. Какие продукты есть?",
      en: "Quick and easy: vegetable plov or a chicken salad. What ingredients do you have?",
    },
  },
};

/** Model imkoniyat yorliqlari (config/models.ts dagi o'zbekcha label → 4 til). */
export const LD_CAPABILITY_LABEL: Record<string, L10n> = {
  Aqlli: { uz: "Aqlli", "uz-cyrl": "Ақлли", ru: "Умный", en: "Smart" },
  Ijodiy: { uz: "Ijodiy", "uz-cyrl": "Ижодий", ru: "Творческий", en: "Creative" },
  Tez: { uz: "Tez", "uz-cyrl": "Тез", ru: "Быстрый", en: "Fast" },
  Kod: { uz: "Kod", "uz-cyrl": "Код", ru: "Код", en: "Code" },
  Multimodal: { uz: "Multimodal", "uz-cyrl": "Мультимодал", ru: "Мультимедиа", en: "Multimodal" },
  Kontekst: { uz: "Kontekst", "uz-cyrl": "Контекст", ru: "Контекст", en: "Context" },
  Internet: { uz: "Internet", "uz-cyrl": "Интернет", ru: "Интернет", en: "Web" },
  Manbalar: { uz: "Manbalar", "uz-cyrl": "Манбалар", ru: "Источники", en: "Sources" },
  Tillar: { uz: "Tillar", "uz-cyrl": "Тиллар", ru: "Языки", en: "Languages" },
  Tekin: { uz: "Tekin", "uz-cyrl": "Текин", ru: "Бесплатно", en: "Free" },
  Ochiq: { uz: "Ochiq", "uz-cyrl": "Очиқ", ru: "Открытый", en: "Open" },
  Chuqurlik: { uz: "Chuqurlik", "uz-cyrl": "Чуқурлик", ru: "Глубина", en: "Depth" },
  "Ko'p modal": { uz: "Ko'p modal", "uz-cyrl": "Кўп модал", ru: "Мультимедиа", en: "Multimodal" },
  Maxfiy: { uz: "Maxfiy", "uz-cyrl": "Махфий", ru: "Приватный", en: "Private" },
  "O'zbekcha": { uz: "O'zbekcha", "uz-cyrl": "Ўзбекча", ru: "Узбекский", en: "Uzbek" },
  Reasoning: { uz: "Reasoning", "uz-cyrl": "Reasoning", ru: "Рассуждение", en: "Reasoning" },
  Avto: { uz: "Avto", "uz-cyrl": "Авто", ru: "Авто", en: "Auto" },
};
