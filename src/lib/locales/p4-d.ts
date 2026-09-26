import type { Dict } from "@/lib/i18n";

/** 4-bosqich (D guruhi) tarjimalari (uz / uz-cyrl / ru / en) — landing: startap-grant talablari. */
export const P4D = {
  // Navbar
  p4dSkip: { uz: "Asosiy mazmunga o'tish", "uz-cyrl": "Асосий мазмунга ўтиш", ru: "Перейти к содержимому", en: "Skip to content" },
  p4dNavMain: { uz: "Asosiy navigatsiya", "uz-cyrl": "Асосий навигация", ru: "Основная навигация", en: "Main navigation" },
  p4dNavHow: { uz: "Qanday ishlaydi", "uz-cyrl": "Қандай ишлайди", ru: "Как это работает", en: "How it works" },
  p4dNavRoadmap: { uz: "Yo'l xaritasi", "uz-cyrl": "Йўл харитаси", ru: "Дорожная карта", en: "Roadmap" },
  p4dNavAbout: { uz: "Biz haqimizda", "uz-cyrl": "Биз ҳақимизда", ru: "О нас", en: "About" },
  p4dNavDocs: { uz: "Hujjatlar", "uz-cyrl": "Ҳужжатлар", ru: "Документация", en: "Docs" },
  p4dNavContact: { uz: "Aloqa", "uz-cyrl": "Алоқа", ru: "Контакты", en: "Contact" },

  // Hero
  p4dHeroValue: {
    uz: "SOVEREIGN AI — Claude, GPT, Gemini, DeepSeek va yana 1700+ AI modeli uchun bitta xavfsiz ish maydoni: xotira shifrlangan, shaxsiy ma'lumotlaringiz esa provayderga yetib borishidan oldin maskalanadi.",
    "uz-cyrl":
      "SOVEREIGN AI — Claude, GPT, Gemini, DeepSeek ва яна 1700+ AI модели учун битта хавфсиз иш майдони: хотира шифрланган, шахсий маълумотларингиз эса провайдерга етиб боришидан олдин маскаланади.",
    ru: "SOVEREIGN AI — единое приватное рабочее пространство для Claude, GPT, Gemini, DeepSeek и ещё 1700+ моделей ИИ: память зашифрована, а личные данные маскируются до отправки провайдеру.",
    en: "SOVEREIGN AI is one private workspace for Claude, GPT, Gemini, DeepSeek and 1700+ other AI models — with encrypted memory, and your personal data masked before it reaches any provider.",
  },
  p4dHeroAudience: {
    uz: "O'zbekiston va MDHdagi talabalar, dasturchilar va bizneslar uchun — o'zbek, rus va ingliz tillarida; karta, kripto yoki SBP orqali to'lov.",
    "uz-cyrl":
      "Ўзбекистон ва МДҲдаги талабалар, дастурчилар ва бизнеслар учун — ўзбек, рус ва инглиз тилларида; карта, крипто ёки СБП орқали тўлов.",
    ru: "Для студентов, разработчиков и бизнеса в Узбекистане и СНГ — на узбекском, русском и английском, с оплатой картой, криптовалютой или через СБП.",
    en: "Built for students, developers and businesses in Uzbekistan and the CIS — in Uzbek, Russian and English, paid by card, crypto or SBP.",
  },
  p4dHeroDocs: { uz: "Hujjatlarni ko'rish", "uz-cyrl": "Ҳужжатларни кўриш", ru: "Открыть документацию", en: "View docs" },
  p4dHeroLive: {
    uz: "app.soveregn.xyz da ishlamoqda",
    "uz-cyrl": "app.soveregn.xyz да ишламоқда",
    ru: "Работает на app.soveregn.xyz",
    en: "Live at app.soveregn.xyz",
  },

  // Mahsulot ko'rinishi (hero ostidagi chat maketi)
  p4dPvLabel: {
    uz: "SOVEREIGN AI veb-ilovasi: model tanlagich, chat, xotira va Blind Prompting.",
    "uz-cyrl": "SOVEREIGN AI веб-иловаси: модел танлагич, чат, хотира ва Blind Prompting.",
    ru: "Веб-приложение SOVEREIGN AI: выбор модели, чат, память и Blind Prompting.",
    en: "The SOVEREIGN AI web app: model switcher, chat, memory and Blind Prompting.",
  },
  p4dPvRecent: { uz: "Oxirgilar", "uz-cyrl": "Охиргилар", ru: "Недавние", en: "Recent" },
  p4dPvChat1: { uz: "Mijozga xat qoralamasi", "uz-cyrl": "Мижозга хат қораламаси", ru: "Черновик письма клиенту", en: "Client email draft" },
  p4dPvChat2: { uz: "Python: CSV o'qish", "uz-cyrl": "Python: CSV ўқиш", ru: "Python: разбор CSV", en: "Python: parse a CSV" },
  p4dPvChat3: {
    uz: "Imtihonga tayyorlov: fizika",
    "uz-cyrl": "Имтиҳонга тайёрлов: физика",
    ru: "Подготовка к экзамену: физика",
    en: "Exam prep: physics",
  },
  p4dPvUser: {
    uz: "Orion MCHJ'dan Akmalga qisqa xat yozing: hisob-faktura juma kuni tayyor bo'ladi.",
    "uz-cyrl": "Orion МЧЖ'дан Акмалга қисқа хат ёзинг: ҳисоб-фактура жума куни тайёр бўлади.",
    ru: "Напиши короткое письмо Акмалю из ООО «Орион»: счёт будет готов к пятнице.",
    en: "Write a short email to Akmal at Orion LLC: the invoice will be ready by Friday.",
  },
  p4dPvMasked: {
    uz: "Blind Prompting: yuborishdan oldin 2 ta ma'lumot maskalandi",
    "uz-cyrl": "Blind Prompting: юборишдан олдин 2 та маълумот маскаланди",
    ru: "Blind Prompting: 2 элемента скрыты перед отправкой",
    en: "Blind Prompting: 2 items masked before sending",
  },
  p4dPvAiIntro: { uz: "Mana qoralama:", "uz-cyrl": "Мана қоралама:", ru: "Вот черновик:", en: "Here's a draft:" },
  p4dPvAiSubject: {
    uz: "Mavzu: Hisob-faktura holati",
    "uz-cyrl": "Мавзу: Ҳисоб-фактура ҳолати",
    ru: "Тема: Статус счёта",
    en: "Subject: Invoice update",
  },
  p4dPvAiBody: {
    uz: "Assalomu alaykum, Akmal! Sabringiz uchun rahmat. Orion MCHJ uchun hisob-faktura juma kunigacha tayyor bo'lib, sizga yuboriladi.",
    "uz-cyrl":
      "Ассалому алайкум, Акмал! Сабрингиз учун раҳмат. Orion МЧЖ учун ҳисоб-фактура жума кунигача тайёр бўлиб, сизга юборилади.",
    ru: "Здравствуйте, Акмаль! Спасибо за терпение. Счёт для ООО «Орион» будет готов и отправлен вам до пятницы.",
    en: "Hi Akmal, thank you for your patience. The invoice for Orion LLC will be ready and sent to you by Friday.",
  },
  p4dPvComposer: { uz: "SOVEREIGN'ga yozing…", "uz-cyrl": "SOVEREIGN'га ёзинг…", ru: "Напишите SOVEREIGN…", en: "Message SOVEREIGN…" },

  // Qanday ishlaydi
  p4dStep: { uz: "{n}-qadam", "uz-cyrl": "{n}-қадам", ru: "Шаг {n}", en: "Step {n}" },
  p4dHowTitle: {
    uz: "Ro'yxatdan o'tishdan birinchi javobgacha — bir daqiqa.",
    "uz-cyrl": "Рўйхатдан ўтишдан биринчи жавобгача — бир дақиқа.",
    ru: "От регистрации до первого ответа — за минуту.",
    en: "From sign-up to your first answer in a minute.",
  },
  p4dHowS1Title: { uz: "Bepul hisob oching", "uz-cyrl": "Бепул ҳисоб очинг", ru: "Создайте бесплатный аккаунт", en: "Create a free account" },
  p4dHowS1Body: {
    uz: "Email yoki Google orqali ro'yxatdan o'ting. Karta kerak emas — Free rejimida Llama 3.3, Gemini 2.5 Flash va DeepSeek R1 bor.",
    "uz-cyrl":
      "Email ёки Google орқали рўйхатдан ўтинг. Карта керак эмас — Free режимида Llama 3.3, Gemini 2.5 Flash ва DeepSeek R1 бор.",
    ru: "Зарегистрируйтесь по email или через Google. Карта не нужна — в тарифе Free есть Llama 3.3, Gemini 2.5 Flash и DeepSeek R1.",
    en: "Sign up with email or Google. No card needed — the Free plan includes Llama 3.3, Gemini 2.5 Flash and DeepSeek R1.",
  },
  p4dHowS2Title: {
    uz: "Modelni tanlang — yoki Auto'ga ishoning",
    "uz-cyrl": "Моделни танланг — ёки Auto'га ишонинг",
    ru: "Выберите модель — или доверьтесь Auto",
    en: "Pick a model — or let Auto choose",
  },
  p4dHowS2Body: {
    uz: "Suhbat o'rtasida Claude, GPT, Gemini va boshqalar orasida almashing. Kontekst va xotira saqlanib qoladi.",
    "uz-cyrl": "Суҳбат ўртасида Claude, GPT, Gemini ва бошқалар орасида алмашинг. Контекст ва хотира сақланиб қолади.",
    ru: "Переключайтесь между Claude, GPT, Gemini и другими прямо посреди диалога. Контекст и память сохраняются.",
    en: "Switch between Claude, GPT, Gemini and others mid-conversation. Context and memory carry over.",
  },
  p4dHowS3Title: {
    uz: "Veb, desktop yoki CLI'da ishlang",
    "uz-cyrl": "Веб, десктоп ёки CLI'да ишланг",
    ru: "Работайте в вебе, десктопе или CLI",
    en: "Work on web, desktop or CLI",
  },
  p4dHowS3Body: {
    uz: "Bitta hisobni brauzerda, desktop ilovada va terminaldagi kod-agentda ishlating. Ko'proq kerak bo'lgandagina tarifni oshiring.",
    "uz-cyrl":
      "Битта ҳисобни браузерда, десктоп иловада ва терминалдаги код-агентда ишлатинг. Кўпроқ керак бўлгандагина тарифни оширинг.",
    ru: "Один аккаунт — в браузере, в десктоп-приложении и в терминальном код-агенте. Повышайте тариф, только когда нужно больше.",
    en: "Use one account in the browser, the desktop app and the terminal code agent. Upgrade only when you need more.",
  },

  // Kimlar uchun
  p4dAudEyebrow: { uz: "Kimlar uchun", "uz-cyrl": "Кимлар учун", ru: "Для кого", en: "Who it's for" },
  p4dAudTitle: {
    uz: "O'zbekiston va MDH uchun yaratilgan.",
    "uz-cyrl": "Ўзбекистон ва МДҲ учун яратилган.",
    ru: "Создано для Узбекистана и СНГ.",
    en: "Made for Uzbekistan and the CIS.",
  },
  p4dAudSub: {
    uz: "Jahon AI modellari — mahalliy tillar va bu yerda haqiqatan ishlaydigan to'lov usullari bilan.",
    "uz-cyrl": "Жаҳон AI моделлари — маҳаллий тиллар ва бу ерда ҳақиқатан ишлайдиган тўлов усуллари билан.",
    ru: "Мировые модели ИИ — на местных языках и со способами оплаты, которые здесь действительно работают.",
    en: "World-class AI models, with local languages and payment methods that actually work here.",
  },
  p4dAudStudentsTitle: { uz: "Talabalar", "uz-cyrl": "Талабалар", ru: "Студенты", en: "Students" },
  p4dAudStudentsBody: {
    uz: "Free rejimidan boshlang. O'zbek yoki rus tilida so'rang — tushuntirish, qisqacha mazmun va imtihonga tayyorgarlikni o'z tilingizda oling.",
    "uz-cyrl":
      "Free режимидан бошланг. Ўзбек ёки рус тилида сўранг — тушунтириш, қисқача мазмун ва имтиҳонга тайёргарликни ўз тилингизда олинг.",
    ru: "Начните с тарифа Free. Спрашивайте на узбекском или русском — объяснения, конспекты и подготовка к экзаменам на вашем языке.",
    en: "Start on the Free plan. Ask in Uzbek or Russian and get explanations, summaries and exam prep in your own language.",
  },
  p4dAudDevsTitle: { uz: "Dasturchilar", "uz-cyrl": "Дастурчилар", ru: "Разработчики", en: "Developers" },
  p4dAudDevsBody: {
    uz: "Terminal kod-agenti, desktop ilova va bitta hisob ortida 1700+ model — bitta vazifada modellarni soniyalarda solishtiring.",
    "uz-cyrl":
      "Терминал код-агенти, десктоп илова ва битта ҳисоб ортида 1700+ модел — битта вазифада моделларни сонияларда солиштиринг.",
    ru: "Терминальный код-агент, десктоп-приложение и 1700+ моделей за одним аккаунтом — сравнивайте модели на одной задаче за секунды.",
    en: "A terminal code agent, a desktop app and 1700+ models behind one account — compare models on the same task in seconds.",
  },
  p4dAudBizTitle: { uz: "Bizneslar", "uz-cyrl": "Бизнеслар", ru: "Бизнес", en: "Businesses" },
  p4dAudBizBody: {
    uz: "Blind Prompting mijoz ismlari, raqamlar va kompaniya nomlarini so'rov SOVEREIGN'dan chiqishidan oldin maskalaydi; xotira AES-256-GCM bilan shifrlanadi.",
    "uz-cyrl":
      "Blind Prompting мижоз исмлари, рақамлар ва компания номларини сўров SOVEREIGN'дан чиқишидан олдин маскалайди; хотира AES-256-GCM билан шифрланади.",
    ru: "Blind Prompting скрывает имена клиентов, номера и названия компаний до того, как запрос покинет SOVEREIGN; память шифруется AES-256-GCM.",
    en: "Blind Prompting masks client names, numbers and companies before a request leaves SOVEREIGN; memory is encrypted with AES-256-GCM.",
  },
  p4dAudLangs: { uz: "Interfeys tillari", "uz-cyrl": "Интерфейс тиллари", ru: "Языки интерфейса", en: "Interface languages" },
  p4dAudPay: { uz: "To'lov usullari", "uz-cyrl": "Тўлов усуллари", ru: "Способы оплаты", en: "Payment methods" },
  p4dPayCard: {
    uz: "Bank kartasi (Visa, Mastercard, Amex, JCB, UnionPay)",
    "uz-cyrl": "Банк картаси (Visa, Mastercard, Amex, JCB, UnionPay)",
    ru: "Банковская карта (Visa, Mastercard, Amex, JCB, UnionPay)",
    en: "Bank card (Visa, Mastercard, Amex, JCB, UnionPay)",
  },
  p4dPayCrypto: { uz: "Kripto (USDT, BTC)", "uz-cyrl": "Крипто (USDT, BTC)", ru: "Криптовалюта (USDT, BTC)", en: "Crypto (USDT, BTC)" },
  p4dPaySbp: { uz: "SBP (₽, Rossiya)", "uz-cyrl": "СБП (₽, Россия)", ru: "СБП (₽, Россия)", en: "SBP (₽, Russia)" },

  // Yo'l xaritasi
  p4dRoadTitle: {
    uz: "Nima tayyor va nima keyingi.",
    "uz-cyrl": "Нима тайёр ва нима кейинги.",
    ru: "Что уже работает и что дальше.",
    en: "What's live, and what's next.",
  },
  p4dRoadSub: {
    uz: "Mahsulotning bugungi holati — halol. Bajara olmaydigan sanalarni va'da qilmaymiz.",
    "uz-cyrl": "Маҳсулотнинг бугунги ҳолати — ҳалол. Бажара олмайдиган саналарни ваъда қилмаймиз.",
    ru: "Честный срез продукта на сегодня. Без сроков, которые мы не можем гарантировать.",
    en: "An honest snapshot of the product today. No dates we can't keep.",
  },
  p4dRoadShipped: { uz: "Ishga tushgan", "uz-cyrl": "Ишга тушган", ru: "Уже работает", en: "Shipped" },
  p4dRoadNext: { uz: "Keyingi", "uz-cyrl": "Кейинги", ru: "Дальше", en: "Next" },
  p4dRoadLive: { uz: "Ishlamoqda", "uz-cyrl": "Ишламоқда", ru: "Работает", en: "Live" },
  p4dRoadPlanned: { uz: "Rejada", "uz-cyrl": "Режада", ru: "В планах", en: "Planned" },
  p4dRoadWeb: { uz: "Veb-ilova", "uz-cyrl": "Веб-илова", ru: "Веб-приложение", en: "Web app" },
  p4dRoadCli: { uz: "CLI kod-agenti", "uz-cyrl": "CLI код-агенти", ru: "CLI код-агент", en: "CLI code agent" },
  p4dRoadDesktop: { uz: "Desktop ilova", "uz-cyrl": "Десктоп илова", ru: "Десктоп-приложение", en: "Desktop app" },
  p4dRoadImages: { uz: "Rasm generatsiyasi", "uz-cyrl": "Расм генерацияси", ru: "Генерация изображений", en: "Image generation" },
  p4dRoadBlind: {
    uz: "Blind Prompting (shaxsiy ma'lumotni maskalash)",
    "uz-cyrl": "Blind Prompting (шахсий маълумотни маскалаш)",
    ru: "Blind Prompting (маскирование личных данных)",
    en: "Blind Prompting (personal data masking)",
  },
  p4dRoadLangs: { uz: "4 ta interfeys tili", "uz-cyrl": "4 та интерфейс тили", ru: "4 языка интерфейса", en: "4 interface languages" },
  p4dRoadPay: {
    uz: "Karta, kripto va SBP to'lovlari",
    "uz-cyrl": "Карта, крипто ва СБП тўловлари",
    ru: "Оплата картой, криптовалютой и через СБП",
    en: "Card, crypto and SBP payments",
  },
  p4dRoadVideo: { uz: "Video generatsiyasi", "uz-cyrl": "Видео генерацияси", ru: "Генерация видео", en: "Video generation" },
  p4dRoadMusic: { uz: "Musiqa generatsiyasi", "uz-cyrl": "Мусиқа генерацияси", ru: "Генерация музыки", en: "Music generation" },
  p4dRoadTella: {
    uz: "Tella — o'zimizning fine-tune qilingan modelimiz",
    "uz-cyrl": "Tella — ўзимизнинг файн-тюн қилинган моделимиз",
    ru: "Tella — собственная дообученная модель",
    en: "Tella — our own fine-tuned model",
  },
  p4dRoadMobile: { uz: "Mobil ilova", "uz-cyrl": "Мобил илова", ru: "Мобильное приложение", en: "Mobile app" },

  // Biz haqimizda
  p4dAboutTitle: {
    uz: "Mustaqil. Maxfiylik birinchi o'rinda.",
    "uz-cyrl": "Мустақил. Махфийлик биринчи ўринда.",
    ru: "Независимые. Приватность — прежде всего.",
    en: "Independent. Privacy-first.",
  },
  p4dAboutMission: {
    uz: "Maqsadimiz — dunyoning eng yaxshi AI modellarini O'zbekiston va MDH aholisi uchun foydali va hamyonbop qilish: o'z tilida, mahalliy ishlaydigan to'lov usullari bilan va shaxsiy ma'lumotlarni AI kompaniyalariga bermasdan. SOVEREIGN mustaqil ravishda loyihalangan, qurilgan va boshqariladi.",
    "uz-cyrl":
      "Мақсадимиз — дунёнинг энг яхши AI моделларини Ўзбекистон ва МДҲ аҳолиси учун фойдали ва ҳамёнбоп қилиш: ўз тилида, маҳаллий ишлайдиган тўлов усуллари билан ва шахсий маълумотларни AI компанияларига бермасдан. SOVEREIGN мустақил равишда лойиҳаланган, қурилган ва бошқарилади.",
    ru: "Наша миссия — сделать лучшие модели ИИ полезными и доступными для людей в Узбекистане и СНГ: на родном языке, со способами оплаты, которые работают на месте, и без передачи личных данных AI-компаниям. SOVEREIGN спроектирован, создан и развивается независимо.",
    en: "Our mission is to make the world's best AI useful and affordable for people in Uzbekistan and the CIS — in their own language, with payment methods that work locally, and without handing personal data to AI companies. SOVEREIGN is designed, built and operated independently.",
  },
  p4dAboutFounderBio: {
    uz: "SOVEREIGN'ni boshidan oxirigacha loyihalaydi va quradi — veb-ilova, CLI, desktop ilova, to'lovlar va infratuzilma.",
    "uz-cyrl": "SOVEREIGN'ни бошидан охиригача лойиҳалайди ва қуради — веб-илова, CLI, десктоп илова, тўловлар ва инфратузилма.",
    ru: "Проектирует и разрабатывает SOVEREIGN целиком — веб-приложение, CLI, десктоп-приложение, платежи и инфраструктуру.",
    en: "Designs and builds SOVEREIGN end to end — web app, CLI, desktop app, payments and infrastructure.",
  },
  p4dAboutTeam: { uz: "Jamoa", "uz-cyrl": "Жамоа", ru: "Команда", en: "Team" },
  p4dAboutCompany: { uz: "Kompaniya", "uz-cyrl": "Компания", ru: "Компания", en: "Company" },
  p4dAboutLegal: { uz: "Yuridik shaxs", "uz-cyrl": "Юридик шахс", ru: "Юридическое лицо", en: "Legal entity" },
  p4dAboutLocation: { uz: "Joylashuv", "uz-cyrl": "Жойлашув", ru: "Местоположение", en: "Location" },
  p4dAboutEmail: { uz: "Elektron pochta", "uz-cyrl": "Электрон почта", ru: "Эл. почта", en: "Email" },
  p4dAboutWebsite: { uz: "Veb-sayt", "uz-cyrl": "Веб-сайт", ru: "Сайт", en: "Website" },

  // Aloqa
  p4dContactTitle: {
    uz: "Savollar bormi? Bizga yozing.",
    "uz-cyrl": "Саволлар борми? Бизга ёзинг.",
    ru: "Есть вопросы? Напишите нам.",
    en: "Questions? Write to us.",
  },
  p4dContactBody: {
    uz: "Yordam, to'lov, hamkorlik yoki matbuot — bizga yozing, har bir xatni asoschi o'zi o'qiydi.",
    "uz-cyrl": "Ёрдам, тўлов, ҳамкорлик ёки матбуот — бизга ёзинг, ҳар бир хатни асосчи ўзи ўқийди.",
    ru: "Поддержка, оплата, партнёрство или пресса — напишите нам, основатель читает каждое письмо.",
    en: "Support, billing, partnerships or press — email us and the founder reads every message.",
  },
  p4dContactStatus: { uz: "Tizim holati", "uz-cyrl": "Тизим ҳолати", ru: "Статус системы", en: "System status" },

  // Footer
  p4dFooterCompany: { uz: "Kompaniya", "uz-cyrl": "Компания", ru: "Компания", en: "Company" },
  p4dFooterResources: { uz: "Resurslar", "uz-cyrl": "Ресурслар", ru: "Ресурсы", en: "Resources" },
  p4dRights: {
    uz: "Barcha huquqlar himoyalangan.",
    "uz-cyrl": "Барча ҳуқуқлар ҳимояланган.",
    ru: "Все права защищены.",
    en: "All rights reserved.",
  },
  /** {entity} — yuridik shaxs nomi (LEGAL_ENTITY). */
  p4dOperatedBy: {
    uz: "Operator: {entity}",
    "uz-cyrl": "Оператор: {entity}",
    ru: "Оператор: {entity}",
    en: "Operated by {entity}",
  },
} satisfies Dict;
