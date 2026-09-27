import type { Dict } from "@/lib/i18n";

/**
 * 18-skills — SOVEREIGN Skills katalogi matnlari, 4 tilda (uz / uz-cyrl / ru / en).
 * Kalitlar src/config/skills.ts dagi `nameKey` / `descKey` / `detailKeys` orqali ishlatiladi.
 * p18Sk<Skill>Name — ko'rsatiladigan nom (brend nomlari barcha tillarda bir xil),
 * p18Sk<Skill>Desc — bir qatorli tavsif, p18Sk<Skill>D1..D4 — bozorda ochiladigan bandlar.
 * p18SkAuto* / p18SkManual* / p18SkLimitNote — SkillsMarket belgilari.
 */
export const P18S = {
  // ── UI/UX Pro Max ──
  p18SkUiuxName: { uz: "UI/UX Pro Max", "uz-cyrl": "UI/UX Pro Max", ru: "UI/UX Pro Max", en: "UI/UX Pro Max" },
  p18SkUiuxDesc: {
    uz: "Premium interfeys: qulaylik, barcha holatlar, moslashuvchan tartib",
    "uz-cyrl": "Премиум интерфейс: қулайлик, барча ҳолатлар, мослашувчан тартиб",
    ru: "Премиальный интерфейс: доступность, все состояния, адаптивная вёрстка",
    en: "Premium interfaces: accessibility, every state, responsive layout",
  },
  p18SkUiuxD1: {
    uz: "Kontrast ≥4.5:1, ko'rinadigan fokus, klaviatura va ekran o'quvchi qo'llovi",
    "uz-cyrl": "Контраст ≥4.5:1, кўринадиган фокус, клавиатура ва экран ўқувчи қўллови",
    ru: "Контраст ≥4.5:1, видимый фокус, поддержка клавиатуры и скринридеров",
    en: "Contrast ≥4.5:1, visible focus, keyboard and screen-reader support",
  },
  p18SkUiuxD2: {
    uz: "Teginish maydoni ≥44px, 100 ms ichida javob, faqat hover'ga tayanmaydi",
    "uz-cyrl": "Тегиниш майдони ≥44px, 100 мс ичида жавоб, фақат сичқонча устига келтиришга таянмайди",
    ru: "Зона касания ≥44px, отклик за 100 мс, без опоры только на наведение",
    en: "Touch targets ≥44px, feedback within 100 ms, never hover-only",
  },
  p18SkUiuxD3: {
    uz: "Mobil-birinchi, 375–1440px breakpointlar, gorizontal scroll yo'q",
    "uz-cyrl": "Мобил-биринчи, 375–1440px нуқталар, горизонтал айланиш йўқ",
    ru: "Mobile-first, брейкпоинты 375–1440px, без горизонтального скролла",
    en: "Mobile-first, 375–1440px breakpoints, no horizontal scroll",
  },
  p18SkUiuxD4: {
    uz: "Emoji-ikonlar, “AI” gradientlari va kulrang ustiga kulrang matn taqiqlanadi",
    "uz-cyrl": "Эможи-иконкалар, «AI» градиентлари ва кулранг устига кулранг матн тақиқланади",
    ru: "Запрещены эмодзи-иконки, «AI»-градиенты и серый текст на сером",
    en: "No emoji icons, “AI” gradients or gray-on-gray text",
  },

  // ── Apple Liquid Glass (id: apple-design) ──
  p18SkAppleName: { uz: "Apple Liquid Glass", "uz-cyrl": "Apple Liquid Glass", ru: "Apple Liquid Glass", en: "Apple Liquid Glass" },
  p18SkAppleDesc: {
    uz: "Apple uslubi: yagona oq panellar, ingichka chiziqlar, shisha faqat qatlamlarda",
    "uz-cyrl": "Apple услуби: ягона оқ панеллар, ингичка чизиқлар, шиша фақат қатламларда",
    ru: "Стиль Apple: единые белые панели, тонкие разделители, стекло только на слоях",
    en: "Apple style: unified white panels, hairlines, glass only on overlapping layers",
  },
  p18SkAppleD1: {
    uz: "5 tamoyil: yagona sirt, shisha — ziravor, cheklov — hashamat",
    "uz-cyrl": "5 тамойил: ягона сирт, шиша — зиравор, чеклов — ҳашамат",
    ru: "5 принципов: единая поверхность, стекло как приправа, сдержанность как роскошь",
    en: "5 rules: one surface, glass as seasoning, restraint as luxury",
  },
  p18SkAppleD2: {
    uz: "Tokenlar: #f5f5f7 fon, oq sirtlar, 7% qora ingichka chiziqlar",
    "uz-cyrl": "Токенлар: #f5f5f7 фон, оқ сиртлар, 7% қора ингичка чизиқлар",
    ru: "Токены: фон #f5f5f7, белые поверхности, разделители 7% чёрного",
    en: "Tokens: #f5f5f7 ground, white surfaces, 7% black hairlines",
  },
  p18SkAppleD3: {
    uz: "Radius va soya bosqichlari, sarlavhalarda manfiy interval, bir xil kenglikdagi raqamlar",
    "uz-cyrl": "Радиус ва соя босқичлари, сарлавҳаларда манфий интервал, бир хил кенгликдаги рақамлар",
    ru: "Ступени радиусов и теней, отрицательный трекинг заголовков, табличные цифры",
    en: "Radius and shadow tiers, negative title tracking, tabular numbers",
  },
  p18SkAppleD4: {
    uz: "Prujinali harakat, to'xtatib bo'ladigan animatsiya, kamaytirilgan harakat sozlamasi",
    "uz-cyrl": "Пружинали ҳаракат, тўхтатиб бўладиган анимация, камайтирилган ҳаракат созламаси",
    ru: "Пружинная анимация, прерываемые переходы, поддержка «уменьшения движения»",
    en: "Spring motion, interruptible transitions, reduced-motion support",
  },

  // ── Clean Code ──
  p18SkCleanName: { uz: "Clean Code", "uz-cyrl": "Clean Code", ru: "Clean Code", en: "Clean Code" },
  p18SkCleanDesc: {
    uz: "Toza, xavfsiz, o'qiladigan kod; yaxshi amaliyotlar",
    "uz-cyrl": "Тоза, хавфсиз, ўқиладиган код; яхши амалиётлар",
    ru: "Чистый, безопасный, читаемый код; лучшие практики",
    en: "Clean, secure, readable code; best practices",
  },
  p18SkCleanD1: {
    uz: "Ishlaydigan, to'liq kod; taxminlar va loyiha qoidalari hisobga olinadi",
    "uz-cyrl": "Ишлайдиган, тўлиқ код; тахминлар ва лойиҳа қоидалари ҳисобга олинади",
    ru: "Рабочий, полный код; допущения и соглашения проекта учитываются",
    en: "Working, complete code that follows the project's conventions",
  },
  p18SkCleanD2: {
    uz: "Ma'noli nomlar, kichik funksiyalar, erta qaytish, ortiqcha abstraksiyasiz",
    "uz-cyrl": "Маъноли номлар, кичик функциялар, эрта қайтиш, ортиқча абстракциясиз",
    ru: "Осмысленные имена, небольшие функции, ранний выход, без лишних абстракций",
    en: "Meaningful names, small functions, early returns, no speculative abstractions",
  },
  p18SkCleanD3: {
    uz: "Chegara holatlari, xatolarni to'g'ri ishlash va qat'iy tiplar",
    "uz-cyrl": "Чегара ҳолатлари, хатоларни тўғри ишлаш ва қатъий типлар",
    ru: "Граничные случаи, корректная обработка ошибок и строгие типы",
    en: "Edge cases, proper error handling and strong types",
  },
  p18SkCleanD4: {
    uz: "Mavjud bo'lmagan API o'ylab topilmaydi; muhim mantiq uchun testlar",
    "uz-cyrl": "Мавжуд бўлмаган API ўйлаб топилмайди; муҳим мантиқ учун тестлар",
    ru: "Никаких выдуманных API; тесты для важной логики",
    en: "No invented APIs; tests for non-trivial logic",
  },

  // ── Cybersecurity Pro ──
  p18SkSecName: { uz: "Cybersecurity Pro", "uz-cyrl": "Cybersecurity Pro", ru: "Cybersecurity Pro", en: "Cybersecurity Pro" },
  p18SkSecDesc: {
    uz: "Himoya: xavfsiz kod va audit — OWASP, ruxsatlar, injeksiya, sirlar",
    "uz-cyrl": "Ҳимоя: хавфсиз код ва аудит — OWASP, рухсатлар, инъекция, сирлар",
    ru: "Защита: безопасный код и аудит — OWASP, доступ, инъекции, секреты",
    en: "Defensive secure coding and review: OWASP, access control, injection, secrets",
  },
  p18SkSecD1: {
    uz: "OWASP Top 10 va CWE bo'yicha tekshiruv ro'yxati",
    "uz-cyrl": "OWASP Top 10 ва CWE бўйича текширув рўйхати",
    ru: "Чек-лист по OWASP Top 10 и CWE",
    en: "Checklist mapped to OWASP Top 10 and CWE",
  },
  p18SkSecD2: {
    uz: "Ruxsat (IDOR), injeksiya, SSRF, autentifikatsiya va kriptografiya",
    "uz-cyrl": "Рухсат (IDOR), инъекция, SSRF, аутентификация ва криптография",
    ru: "Доступ (IDOR), инъекции, SSRF, аутентификация и криптография",
    en: "Access control (IDOR), injection, SSRF, authentication and crypto",
  },
  p18SkSecD3: {
    uz: "Sirlar, sozlamalar, bog'liqliklar zanjiri va jurnallar",
    "uz-cyrl": "Сирлар, созламалар, боғлиқликлар занжири ва журналлар",
    ru: "Секреты, конфигурация, цепочка поставок и логи",
    en: "Secrets, configuration, supply chain and logging",
  },
  p18SkSecD4: {
    uz: "Topilmalar: jiddiylik, fayl:qator, CWE, tuzatish — faqat mudofaa maqsadida",
    "uz-cyrl": "Топилмалар: жиддийлик, файл:қатор, CWE, тузатиш — фақат мудофаа мақсадида",
    ru: "Находки: критичность, файл:строка, CWE, исправление — только для защиты",
    en: "Findings with severity, file:line, CWE and a fix — defensive use only",
  },

  // ── No AI Slop (eski "pro-writing" shu skillga o'tdi) ──
  p18SkSlopName: { uz: "No AI Slop", "uz-cyrl": "No AI Slop", ru: "No AI Slop", en: "No AI Slop" },
  p18SkSlopDesc: {
    uz: "Jonli, aniq matn: sun'iy intellekt qoliplarisiz yozish va tahrir",
    "uz-cyrl": "Жонли, аниқ матн: сунъий интеллект қолипларисиз ёзиш ва таҳрир",
    ru: "Живой, точный текст: письмо и редактура без шаблонов ИИ",
    en: "Sharp, human writing and editing without AI patterns",
  },
  p18SkSlopD1: {
    uz: "Muallif ovozini saqlaydi, minimal tahrir, “Nima o'zgardi” ro'yxati",
    "uz-cyrl": "Муаллиф овозини сақлайди, минимал таҳрир, «Нима ўзгарди» рўйхати",
    ru: "Сохраняет голос автора, минимальная правка, список «Что изменилось»",
    en: "Keeps the writer's voice, minimal edits, a “What changed” list",
  },
  p18SkSlopD2: {
    uz: "“Bu X emas, Y” kabi qoliplar va bo'sh so'zlarni olib tashlaydi",
    "uz-cyrl": "«Бу X эмас, Y» каби қолиплар ва бўш сўзларни олиб ташлайди",
    ru: "Убирает шаблоны вроде «это не X, а Y» и пустые слова",
    en: "Cuts “it's not X, it's Y” patterns and empty filler words",
  },
  p18SkSlopD3: {
    uz: "Konkret faktlar, raqamlar va faol nisbat",
    "uz-cyrl": "Аниқ фактлар, рақамлар ва фаол нисбат",
    ru: "Конкретные факты, цифры и активный залог",
    en: "Concrete facts, numbers and active voice",
  },
  p18SkSlopD4: {
    uz: "Tekshirish rejimi: qoliplarni iqtibos bilan ko'rsatadi, qayta yozmaydi",
    "uz-cyrl": "Текшириш режими: қолипларни иқтибос билан кўрсатади, қайта ёзмайди",
    ru: "Режим проверки: цитирует шаблоны, не переписывая текст",
    en: "Detect mode: quotes each pattern without rewriting",
  },

  // ── Data Viz ──
  p18SkVizName: { uz: "Data Viz", "uz-cyrl": "Data Viz", ru: "Data Viz", en: "Data Viz" },
  p18SkVizDesc: {
    uz: "Grafik, jadval va ma'lumot vizualizatsiyasi tamoyillari",
    "uz-cyrl": "График, жадвал ва маълумот визуализацияси тамойиллари",
    ru: "Принципы графиков, таблиц и визуализации данных",
    en: "Principles of charts, tables and data visualization",
  },
  p18SkVizD1: {
    uz: "Savolga mos grafik turi: ustun, chiziq, gistogramma, jadval",
    "uz-cyrl": "Саволга мос график тури: устун, чизиқ, гистограмма, жадвал",
    ru: "Тип графика под вопрос: столбцы, линии, гистограмма, таблица",
    en: "The right form for the question: bar, line, histogram, table",
  },
  p18SkVizD2: {
    uz: "Ortiqcha bezaksiz: 3D, gradient va qalin to'r yo'q",
    "uz-cyrl": "Ортиқча безаксиз: 3D, градиент ва қалин тўр йўқ",
    ru: "Без визуального мусора: никакого 3D, градиентов и жирной сетки",
    en: "No chart junk: no 3D, gradients or heavy gridlines",
  },
  p18SkVizD3: {
    uz: "Aniq o'qlar, birliklar, xulosa sarlavhasi va manba",
    "uz-cyrl": "Аниқ ўқлар, бирликлар, хулоса сарлавҳаси ва манба",
    ru: "Чёткие оси, единицы, заголовок-вывод и источник",
    en: "Clear axes, units, a takeaway title and the source",
  },
  p18SkVizD4: {
    uz: "Rang-ko'rlar uchun xavfsiz palitra, yorug' va qorong'i mavzuda tekshiriladi",
    "uz-cyrl": "Ранг-кўрлар учун хавфсиз палитра, ёруғ ва қоронғи мавзуда текширилади",
    ru: "Палитра, безопасная при дальтонизме, проверка в светлой и тёмной теме",
    en: "Colorblind-safe palette, checked in light and dark themes",
  },

  // ── Focus mode (i-have-adhd) ──
  p18SkFocusName: {
    uz: "Fokus / DEHB uchun qulay javoblar",
    "uz-cyrl": "Фокус / ДЕҲБ учун қулай жавоблар",
    ru: "Фокус / ответы с учётом СДВГ",
    en: "Focus / ADHD-friendly answers",
  },
  p18SkFocusDesc: {
    uz: "Avval harakat, raqamlangan qadamlar, bitta keyingi qadam — kirish va xulosa so'zlarisiz",
    "uz-cyrl": "Аввал ҳаракат, рақамланган қадамлар, битта кейинги қадам — кириш ва хулоса сўзларисиз",
    ru: "Сначала действие, нумерованные шаги, один следующий шаг — без вступлений и дежурных фраз",
    en: "Action first, numbered steps, one next action — no preamble or closers",
  },
  p18SkFocusD1: {
    uz: "Birinchi qator — bajariladigan harakat yoki to'g'ridan-to'g'ri javob",
    "uz-cyrl": "Биринчи қатор — бажариладиган ҳаракат ёки тўғридан-тўғри жавоб",
    ru: "Первая строка — действие или прямой ответ",
    en: "The first line is an action or the direct answer",
  },
  p18SkFocusD2: {
    uz: "Ko'p qadamli ish — raqamlangan ro'yxat, ro'yxatda 5 tadan ko'p emas",
    "uz-cyrl": "Кўп қадамли иш — рақамланган рўйхат, рўйхатда 5 тадан кўп эмас",
    ru: "Многошаговые задачи — нумерованный список, не больше 5 пунктов",
    en: "Multi-step work as a numbered list, at most 5 items",
  },
  p18SkFocusD3: {
    uz: "Aniq vaqt baholari va joriy holat: “5 dan 3-qadam tayyor”",
    "uz-cyrl": "Аниқ вақт баҳолари ва жорий ҳолат: «5 дан 3-қадам тайёр»",
    ru: "Конкретные оценки времени и статус: «шаг 3 из 5 готов»",
    en: "Concrete time estimates and status: “step 3 of 5 done”",
  },
  p18SkFocusD4: {
    uz: "Faqat qo'lda yoqiladi — o'zi avtomatik ishga tushmaydi",
    "uz-cyrl": "Фақат қўлда ёқилади — ўзи автоматик ишга тушмайди",
    ru: "Включается только вручную — сам не активируется",
    en: "Manual toggle only — never switches on by itself",
  },

  // ── SkillsMarket belgilari ──
  p18SkAutoBadge: { uz: "Avto", "uz-cyrl": "Авто", ru: "Авто", en: "Auto" },
  p18SkAutoTitle: {
    uz: "Mavzuga mos xabarlarda avtomatik yoqiladi",
    "uz-cyrl": "Мавзуга мос хабарларда автоматик ёқилади",
    ru: "Включается автоматически для подходящих сообщений",
    en: "Turns on automatically for relevant messages",
  },
  p18SkManualBadge: { uz: "Qo'lda", "uz-cyrl": "Қўлда", ru: "Вручную", en: "Manual" },
  p18SkManualTitle: {
    uz: "Faqat siz yoqsangiz ishlaydi",
    "uz-cyrl": "Фақат сиз ёқсангиз ишлайди",
    ru: "Работает, только если вы его включили",
    en: "Works only when you switch it on",
  },
  p18SkLimitNote: {
    uz: "Bitta javobda ko'pi bilan {n} ta skill qo'llanadi — eng moslari tanlanadi.",
    "uz-cyrl": "Битта жавобда кўпи билан {n} та скилл қўлланади — энг мослари танланади.",
    ru: "В одном ответе применяется не более {n} навыков — выбираются самые подходящие.",
    en: "At most {n} skills apply to one answer — the most relevant ones are picked.",
  },
} satisfies Dict;
