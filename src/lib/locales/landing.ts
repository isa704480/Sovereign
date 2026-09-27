import type { Dict } from "@/lib/i18n";

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
    uz: "Yangi modellar chiqqan kuniyoq shu yerda paydo bo'ladi.",
    "uz-cyrl": "Янги моделлар чиққан кунийоқ шу ерда пайдо бўлади.",
    ru: "Новые модели появляются здесь в день выхода.",
    en: "New models appear here the day they launch.",
  },

  // Features
  ldFeatEyebrow: { uz: "Nima uchun SOVEREIGN", "uz-cyrl": "Нима учун SOVEREIGN", ru: "Почему SOVEREIGN", en: "Why SOVEREIGN" },
  ldFeatTitle1: {
    uz: "Maxfiylik, xotira va manbalar",
    "uz-cyrl": "Махфийлик, хотира ва манбалар",
    ru: "Приватность, память и источники",
    en: "Privacy, memory and sources",
  },
  ldFeatTitle2: {
    uz: "bitta hisobda.",
    "uz-cyrl": "битта ҳисобда.",
    ru: "в одном аккаунте.",
    en: "in one account.",
  },
  ldFeat1Title: {
    uz: "Ismlar yuborishdan oldin yashiriladi",
    "uz-cyrl": "Исмлар юборишдан олдин яширилади",
    ru: "Имена скрываются до отправки",
    en: "Names masked before sending",
  },
  ldFeat1Body: {
    uz: "Blind Prompting'ni yoqsangiz, xabarlaringizdagi ism, raqam va kompaniya nomlari so'rov yuborilishidan oldin brauzeringizda maskalanadi.",
    "uz-cyrl": "Blind Prompting'ни ёқсангиз, хабарларингиздаги исм, рақам ва компания номлари сўров юборилишидан олдин браузерингизда маскаланади.",
    ru: "Включите Blind Prompting — и имена, номера и названия компаний в ваших сообщениях будут маскироваться в браузере до отправки запроса.",
    en: "Turn on Blind Prompting and names, numbers and companies in your messages are masked in your browser before the request goes out.",
  },
  ldFeat2Title: {
    uz: "Tahrirlanadigan xotira",
    "uz-cyrl": "Таҳрирланадиган хотира",
    ru: "Память, которую можно править",
    en: "Memory you can edit",
  },
  ldFeat2Body: {
    uz: "AI siz aytganlarni eslab qoladi. Istalgan yozuvni ko'rish, eksport qilish yoki o'chirish mumkin.",
    "uz-cyrl": "AI сиз айтганларни эслаб қолади. Исталган ёзувни кўриш, экспорт қилиш ёки ўчириш мумкин.",
    ru: "ИИ запоминает то, что вы рассказываете. Любую запись можно посмотреть, экспортировать или удалить.",
    en: "It remembers what you tell it. You can view, export or delete any of it.",
  },
  ldFeat3Title: { uz: "Tekshirilgan javoblar", "uz-cyrl": "Текширилган жавоблар", ru: "Проверенные ответы", en: "Verified answers" },
  ldFeat3Body: {
    uz: "Qidiruv javoblari haqiqiy manba havolalari bilan keladi. Muhim da'volarni ikkinchi AI manbalarga solishtiradi va tasdiqlanmaganini belgilaydi.",
    "uz-cyrl": "Қидирув жавоблари ҳақиқий манба ҳаволалари билан келади. Муҳим даъволарни иккинчи AI манбаларга солиштиради ва тасдиқланмаганини белгилайди.",
    ru: "Ответы с поиском приходят с настоящими ссылками на источники. Второй ИИ сверяет ключевые утверждения с источниками и помечает неподтверждённые.",
    en: "Search answers come with real source links. A second AI checks key claims against those sources and flags anything it can't confirm.",
  },
  ldFeat2Tag: { uz: "Xotira", "uz-cyrl": "Хотира", ru: "Память", en: "Memory" },
  ldFeat3Tag: { uz: "Tekshirilgan", "uz-cyrl": "Текширилган", ru: "Проверено", en: "Verified" },
  ldFeat5Title: {
    uz: "Modelni avtomatik tanlash",
    "uz-cyrl": "Моделни автоматик танлаш",
    ru: "Автовыбор модели",
    en: "Auto model choice",
  },
  ldFeat5Body: {
    uz: "Auto har bir so'rov uchun sifat va narxni hisobga olib model tanlaydi.",
    "uz-cyrl": "Auto ҳар бир сўров учун сифат ва нархни ҳисобга олиб модел танлайди.",
    ru: "Auto подбирает модель под каждый запрос с учётом качества и цены.",
    en: "Auto picks a model for each request, balancing quality and price.",
  },

  // ModelShowcase
  ldShowcaseTitle: {
    uz: "Suhbat o'rtasida modelni almashtiring. Kontekst saqlanadi.",
    "uz-cyrl": "Суҳбат ўртасида моделни алмаштиринг. Контекст сақланади.",
    ru: "Меняйте модель посреди разговора. Контекст сохраняется.",
    en: "Switch models mid-conversation. Context carries over.",
  },
  ldShowcaseSub: {
    uz: "Har bir yirik laboratoriyaning hozirgi flagmani. Model tanlagichda yana {n}+ model bor.",
    "uz-cyrl": "Ҳар бир йирик лабораториянинг ҳозирги флагмани. Модел танлагичда яна {n}+ модел бор.",
    ru: "Актуальный флагман каждой крупной лаборатории. В списке моделей ещё {n}+.",
    en: "A current flagship from each major lab. The model picker has {n}+ more.",
  },

  // PrivacyBand
  ldPrivacyTitle1: {
    uz: "Ismlar va raqamlar",
    "uz-cyrl": "Исмлар ва рақамлар",
    ru: "Имена и цифры скрываются",
    en: "Names and numbers are masked",
  },
  ldPrivacyTitle2: {
    uz: "model ko'rishidan oldin yashiriladi.",
    "uz-cyrl": "модел кўришидан олдин яширилади.",
    ru: "до того, как их увидит модель.",
    en: "before the model sees them.",
  },
  ldPrivacyBody: {
    uz: "Blind Prompting yoqilganda (Sozlamalar) shaxsiy ma'lumotlar brauzeringizdan chiqishidan oldin tokenlarga almashtiriladi. Javob qaytgach, tokenlar faqat sizning qurilmangizda qayta tiklanadi.",
    "uz-cyrl": "Blind Prompting ёқилганда (Созламалар) шахсий маълумотлар браузерингиздан чиқишидан олдин токенларга алмаштирилади. Жавоб қайтгач, токенлар фақат сизнинг қурилмангизда қайта тикланади.",
    ru: "Когда Blind Prompting включён (Настройки), личные данные заменяются токенами ещё до того, как покинут ваш браузер. Когда приходит ответ, токены восстанавливаются только на вашем устройстве.",
    en: "With Blind Prompting on (Settings), personal data is swapped for tokens before it leaves your browser. When the answer comes back, the tokens are restored only on your device.",
  },
  ldCreateAccount: { uz: "Hisob yaratish", "uz-cyrl": "Ҳисоб яратиш", ru: "Создать аккаунт", en: "Create account" },
  ldYouWrote: { uz: "Siz yozdingiz", "uz-cyrl": "Сиз ёздингиз", ru: "Вы написали", en: "You wrote" },
  ldTokenization: {
    uz: "Brauzeringizda yashiriladi",
    "uz-cyrl": "Браузерингизда яширилади",
    ru: "Скрывается в вашем браузере",
    en: "Masked in your browser",
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
  ldPricingTitle1: { uz: "Bepul boshlang.", "uz-cyrl": "Бепул бошланг.", ru: "Начните бесплатно.", en: "Start for free." },
  ldPricingTitle2: {
    uz: "Kerak bo'lganda oshiring.",
    "uz-cyrl": "Керак бўлганда оширинг.",
    ru: "Повышайте тариф, когда нужно.",
    en: "Upgrade when you need to.",
  },
  ldPricingSub: {
    uz: "Free tarif: Llama 3.3 70B, Gemini 2.0 Flash va DeepSeek R1, kuniga {n} tagacha xabar. Pullik tariflar flagman modellar, to'liq kod yozish va manbali internet tadqiqotini qo'shadi.",
    "uz-cyrl": "Free тариф: Llama 3.3 70B, Gemini 2.0 Flash ва DeepSeek R1, кунига {n} тагача хабар. Пуллик тарифлар флагман моделлар, тўлиқ код ёзиш ва манбали интернет тадқиқотини қўшади.",
    ru: "Тариф Free: Llama 3.3 70B, Gemini 2.0 Flash и DeepSeek R1, до {n} сообщений в день. Платные тарифы добавляют флагманские модели, полную генерацию кода и веб-исследования с источниками.",
    en: "Free plan: Llama 3.3 70B, Gemini 2.0 Flash and DeepSeek R1, up to {n} messages a day. Paid plans add flagship models, full code generation and web research with sources.",
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
  ldMonthly: { uz: "Oylik", "uz-cyrl": "Ойлик", ru: "Ежемесячно", en: "Monthly" },
  ldYearly: { uz: "Yillik", "uz-cyrl": "Йиллик", ru: "Ежегодно", en: "Yearly" },
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
    uz: "≈ ${price}/kun",
    "uz-cyrl": "≈ ${price}/кун",
    ru: "≈ ${price}/день",
    en: "≈ ${price}/day",
  },
} satisfies Dict;
