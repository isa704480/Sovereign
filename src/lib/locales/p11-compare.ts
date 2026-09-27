import type { Dict } from "@/lib/i18n";

/**
 * /compare — DeepSeek / Qwen va Claude'ni taqqoslash sahifasi (11-bosqich).
 * Raqamlar src/data/model-compare.json dan (scripts/eval/run.mjs o'lchaydi) —
 * bu yerda faqat matn shablonlari, 4 tilda (uz / uz-cyrl / ru / en).
 */
export const P11C = {
  p11cEyebrow: {
    uz: "Modellar taqqoslovi",
    "uz-cyrl": "Моделлар таққослови",
    ru: "Сравнение моделей",
    en: "Model comparison",
  },
  p11cTitle: {
    uz: "DeepSeek va Qwen Claude'ga qanchalik yaqin?",
    "uz-cyrl": "DeepSeek ва Qwen Claude'га қанчалик яқин?",
    ru: "Насколько DeepSeek и Qwen близки к Claude?",
    en: "How close are DeepSeek and Qwen to Claude?",
  },
  p11cLead: {
    uz: "Claude, GPT va Gemini mavjud bo'lmagan hududlarda SOVEREIGN DeepSeek va Qwen kabi modellarni taklif qiladi. Quyida — avtomatik tekshiriladigan 40 ta vazifada o'zimiz o'lchagan natijalar va ochiq benchmarklar, jumladan Claude hali ham kuchliroq bo'lgan joylar ham.",
    "uz-cyrl": "Claude, GPT ва Gemini мавжуд бўлмаган ҳудудларда SOVEREIGN DeepSeek ва Qwen каби моделларни таклиф қилади. Қуйида — автоматик текшириладиган 40 та вазифада ўзимиз ўлчаган натижалар ва очиқ бенчмарклар, жумладан Claude ҳали ҳам кучлироқ бўлган жойлар ҳам.",
    ru: "В регионах, где Claude, GPT и Gemini недоступны, SOVEREIGN предлагает такие модели, как DeepSeek и Qwen. Ниже — наши собственные измерения на 40 автоматически проверяемых задачах и публичные бенчмарки, включая то, в чём Claude пока сильнее.",
    en: "In regions where Claude, GPT and Gemini are unavailable, SOVEREIGN offers models such as DeepSeek and Qwen. Below are our own measurements on 40 automatically graded tasks and public benchmarks — including where Claude is still stronger.",
  },
  p11cRunDate: {
    uz: "O'lchov sanasi: {date}",
    "uz-cyrl": "Ўлчов санаси: {date}",
    ru: "Дата замера: {date}",
    en: "Measured on {date}",
  },
  p11cCta: {
    uz: "SOVEREIGN'ni ochish",
    "uz-cyrl": "SOVEREIGN'ни очиш",
    ru: "Открыть SOVEREIGN",
    en: "Open SOVEREIGN",
  },

  /* ---- Asosiy xulosa (faqat o'lchangan raqamlardan) ---- */
  p11cHeadlineTitle: {
    uz: "O'lchangan xulosa",
    "uz-cyrl": "Ўлчанган хулоса",
    ru: "Измеренный итог",
    en: "Measured result",
  },
  p11cHeadlineCheaper: {
    uz: "Bizning vazifalarda {model} {ref} natijasining {score} foizini ko'rsatdi ({pass} / {refPass} yechilgan) va taxminan {cost} baravar arzonroq.",
    "uz-cyrl": "Бизнинг вазифаларда {model} {ref} натижасининг {score} фоизини кўрсатди ({pass} / {refPass} ечилган) ва тахминан {cost} баравар арзонроқ.",
    ru: "{model}: {score}% от результата {ref} на наших задачах ({pass} против {refPass} решённых) при стоимости примерно в {cost}× ниже.",
    en: "{model} scored {score}% of {ref}'s result on our tasks ({pass} vs {refPass} solved) at about {cost}× lower cost.",
  },
  p11cHeadlinePricier: {
    uz: "Bizning vazifalarda {model} {ref} natijasining {score} foizini ko'rsatdi ({pass} / {refPass} yechilgan); narxi {ref} narxining {cost} baravariga teng.",
    "uz-cyrl": "Бизнинг вазифаларда {model} {ref} натижасининг {score} фоизини кўрсатди ({pass} / {refPass} ечилган); нархи {ref} нархининг {cost} бараварига тенг.",
    ru: "{model}: {score}% от результата {ref} на наших задачах ({pass} против {refPass} решённых); стоимость — {cost}× от {ref}.",
    en: "{model} scored {score}% of {ref}'s result on our tasks ({pass} vs {refPass} solved); cost {cost}× that of {ref}.",
  },
  p11cGapNote: {
    uz: "Bu tenglik emas: {ref} ko'proq vazifani yechdi. Farq qayerda ekanini quyidagi jadvalda ko'ring.",
    "uz-cyrl": "Бу тенглик эмас: {ref} кўпроқ вазифани ечди. Фарқ қаерда эканини қуйидаги жадвалда кўринг.",
    ru: "Это не паритет: {ref} решает больше задач. Где именно разница — смотрите в таблице ниже.",
    en: "This is not parity: {ref} solved more tasks. See the table below for where the gap is.",
  },
  p11cParityNote: {
    uz: "Bu 40 ta vazifada natija {ref} darajasida yoki undan yuqori — lekin bu kichik test, to'liq tenglikning isboti emas.",
    "uz-cyrl": "Бу 40 та вазифада натижа {ref} даражасида ёки ундан юқори — лекин бу кичик тест, тўлиқ тенгликнинг исботи эмас.",
    ru: "На этих 40 задачах результат на уровне {ref} или выше — но это небольшой тест, а не доказательство полного равенства.",
    en: "On these 40 tasks the result matched or exceeded {ref} — but this is a small test, not proof of full equivalence.",
  },
  p11cNotMeasuredList: {
    uz: "Hali o'lchanmagan: {models}. Bu o'lchov paytida ularga API yo'li mavjud bo'lmadi (kredit/kvota yo'q). O'lchov o'rniga taxminiy raqam chiqarmaymiz.",
    "uz-cyrl": "Ҳали ўлчанмаган: {models}. Бу ўлчов пайтида уларга API йўли мавжуд бўлмади (кредит/квота йўқ). Ўлчов ўрнига тахминий рақам чиқармаймиз.",
    ru: "Пока не измерены: {models}. Во время этого замера API-маршрут к ним был недоступен (нет кредитов/квоты). Оценки вместо измерений мы не публикуем.",
    en: "Not measured yet: {models}. Their API route was unavailable during this run (no credits/quota). We don't publish estimates in place of measurements.",
  },
  p11cClaudeAheadIn: {
    uz: "Bizning o'lchovda {ref} quyidagilarda oldinda: {cats}.",
    "uz-cyrl": "Бизнинг ўлчовда {ref} қуйидагиларда олдинда: {cats}.",
    ru: "В нашем замере {ref} впереди в категориях: {cats}.",
    en: "In our run {ref} was ahead in: {cats}.",
  },

  /* ---- O'z evalimiz jadvali ---- */
  p11cEvalTitle: {
    uz: "Bizning test: 40 ta vazifa, avtomatik baho",
    "uz-cyrl": "Бизнинг тест: 40 та вазифа, автоматик баҳо",
    ru: "Наш тест: 40 задач, автоматическая проверка",
    en: "Our eval: 40 tasks, graded automatically",
  },
  p11cEvalLead: {
    uz: "Har bir vazifani inson yoki boshqa AI emas, kod tekshiradi: dastur uchun unit-testlar, matematika uchun aniq javob, ko'rsatmalar va matn uchun qat'iy qoidalar. Asosan rus tilida, bir nechtasi o'zbek va ingliz tilida.",
    "uz-cyrl": "Ҳар бир вазифани инсон ёки бошқа AI эмас, код текширади: дастур учун юнит-тестлар, математика учун аниқ жавоб, кўрсатмалар ва матн учун қатъий қоидалар. Асосан рус тилида, бир нечтаси ўзбек ва инглиз тилида.",
    ru: "Каждую задачу проверяет код, а не человек или другой ИИ: unit-тесты для программ, точный ответ для математики, строгие правила для инструкций и текста. В основном на русском, несколько — на узбекском и английском.",
    en: "Every task is checked by code, not by a person or another AI: unit tests for programs, exact answers for math, strict rules for instructions and text. Mostly in Russian, a few in Uzbek and English.",
  },
  p11cTableAria: {
    uz: "Test natijalari jadvali",
    "uz-cyrl": "Тест натижалари жадвали",
    ru: "Таблица результатов теста",
    en: "Eval results table",
  },
  p11cColModel: { uz: "Model", "uz-cyrl": "Модель", ru: "Модель", en: "Model" },
  p11cCatCoding: { uz: "Dasturlash", "uz-cyrl": "Дастурлаш", ru: "Программирование", en: "Coding" },
  p11cCatMath: { uz: "Matematika va mantiq", "uz-cyrl": "Математика ва мантиқ", ru: "Математика и логика", en: "Math & logic" },
  p11cCatInstruction: {
    uz: "Ko'rsatmaga amal qilish",
    "uz-cyrl": "Кўрсатмага амал қилиш",
    ru: "Следование инструкциям",
    en: "Instruction following",
  },
  p11cCatWriting: {
    uz: "Rus tilida matn va tarjima",
    "uz-cyrl": "Рус тилида матн ва таржима",
    ru: "Русский текст и перевод",
    en: "Russian text & translation",
  },
  p11cColOverall: { uz: "Jami", "uz-cyrl": "Жами", ru: "Итого", en: "Overall" },
  p11cColLatency: { uz: "Median kechikish", "uz-cyrl": "Медиан кечикиш", ru: "Медианная задержка", en: "Median latency" },
  p11cColCost: { uz: "40 vazifa narxi", "uz-cyrl": "40 вазифа нархи", ru: "Стоимость 40 задач", en: "Cost of 40 tasks" },
  p11cColRoute: { uz: "Yo'l", "uz-cyrl": "Йўл", ru: "Маршрут", en: "Route" },
  p11cTasksN: { uz: "{n} ta", "uz-cyrl": "{n} та", ru: "{n} зад.", en: "{n} tasks" },
  p11cSeconds: { uz: "{n} s", "uz-cyrl": "{n} с", ru: "{n} с", en: "{n} s" },
  p11cNotMeasured: {
    uz: "hali o'lchanmagan",
    "uz-cyrl": "ҳали ўлчанмаган",
    ru: "пока не измерено",
    en: "not measured yet",
  },
  p11cReference: { uz: "asos", "uz-cyrl": "асос", ru: "эталон", en: "reference" },
  p11cCostNote: {
    uz: "Narx = sarflangan tokenlar × shu modelning OpenRouter ro'yxat narxi. Kechikish faqat modelga emas, provayder uskunasiga ham bog'liq (Groq juda tez).",
    "uz-cyrl": "Нарх = сарфланган токенлар × шу моделнинг OpenRouter рўйхат нархи. Кечикиш фақат моделга эмас, провайдер ускунасига ҳам боғлиқ (Groq жуда тез).",
    ru: "Стоимость = потраченные токены × прайс OpenRouter для той же модели. Задержка зависит не только от модели, но и от железа провайдера (Groq необычно быстрый).",
    en: "Cost = tokens used × the OpenRouter list price for the same model. Latency depends on the provider's hardware (Groq is unusually fast), not only on the model.",
  },
  p11cPerTaskTitle: {
    uz: "Har bir vazifa natijasi",
    "uz-cyrl": "Ҳар бир вазифа натижаси",
    ru: "Результат по каждой задаче",
    en: "Per-task results",
  },
  p11cPerTaskAria: {
    uz: "Vazifalar bo'yicha natijalar jadvali",
    "uz-cyrl": "Вазифалар бўйича натижалар жадвали",
    ru: "Таблица результатов по задачам",
    en: "Per-task results table",
  },
  p11cColTask: { uz: "Vazifa", "uz-cyrl": "Вазифа", ru: "Задача", en: "Task" },
  p11cPass: { uz: "o'tdi", "uz-cyrl": "ўтди", ru: "да", en: "pass" },
  p11cFail: { uz: "o'tmadi", "uz-cyrl": "ўтмади", ru: "нет", en: "fail" },
  p11cError: { uz: "API xatosi", "uz-cyrl": "API хатоси", ru: "ошибка API", en: "API error" },

  /* ---- Ochiq benchmarklar ---- */
  p11cPublicTitle: { uz: "Ochiq benchmarklar", "uz-cyrl": "Очиқ бенчмарклар", ru: "Публичные бенчмарки", en: "Public benchmarks" },
  p11cPublicLead: {
    uz: "Raqamlar havola qilingan sahifalardan {date} sanasida ko'chirilgan. Ba'zi joylarda model versiyalari biz o'lchaganlardan farq qiladi — har qatordagi aniq model nomini o'qing.",
    "uz-cyrl": "Рақамлар ҳавола қилинган саҳифалардан {date} санасида кўчирилган. Баъзи жойларда модель версиялари биз ўлчаганлардан фарқ қилади — ҳар қатордаги аниқ модель номини ўқинг.",
    ru: "Цифры взяты со страниц по ссылкам {date}. Местами версии моделей отличаются от тех, что измеряли мы, — смотрите точное название модели в каждой строке.",
    en: "Figures copied from the linked pages on {date}. In places the model versions differ from the ones we measured — check the exact model name in each row.",
  },
  p11cPublicAria: {
    uz: "Ochiq benchmarklar jadvali",
    "uz-cyrl": "Очиқ бенчмарклар жадвали",
    ru: "Таблица публичных бенчмарков",
    en: "Public benchmarks table",
  },
  p11cColScore: { uz: "Natija", "uz-cyrl": "Натижа", ru: "Результат", en: "Score" },
  p11cSource: { uz: "Manba", "uz-cyrl": "Манба", ru: "Источник", en: "Source" },
  p11cIndependent: { uz: "mustaqil", "uz-cyrl": "мустақил", ru: "независимый", en: "independent" },
  p11cVendor: {
    uz: "ishlab chiqaruvchilar o'zi e'lon qilgan",
    "uz-cyrl": "ишлаб чиқарувчилар ўзи эълон қилган",
    ru: "заявлено самими разработчиками",
    en: "self-reported by vendors",
  },
  p11cBenchAa: {
    uz: "Umumiy intellekt indeksi (10 ta test bo'yicha), ball.",
    "uz-cyrl": "Умумий интеллект индекси (10 та тест бўйича), балл.",
    ru: "Сводный индекс интеллекта (по 10 тестам), баллы.",
    en: "Composite intelligence index (10 evaluations), points.",
  },
  p11cBenchArena: {
    uz: "Odamlarning ko'r ovozlari asosidagi reyting (Elo), matn.",
    "uz-cyrl": "Одамларнинг кўр овозлари асосидаги рейтинг (Elo), матн.",
    ru: "Рейтинг по слепым голосам людей (Elo), текст.",
    en: "Rating from blind human votes (Elo), text.",
  },
  p11cBenchHle: {
    uz: "Eng qiyin ekspert savollari, to'g'ri javoblar %.",
    "uz-cyrl": "Энг қийин эксперт саволлари, тўғри жавоблар %.",
    ru: "Самые сложные экспертные вопросы, % верных ответов.",
    en: "Hardest expert questions, % correct.",
  },
  p11cBenchTerminal: {
    uz: "Terminalda agent sifatida dasturlash, yechilgan %.",
    "uz-cyrl": "Терминалда агент сифатида дастурлаш, ечилган %.",
    ru: "Агентное программирование в терминале, % решённых.",
    en: "Agentic coding in a terminal, % solved.",
  },
  p11cBenchSwe: {
    uz: "Haqiqiy GitHub xatolarini tuzatish, yechilgan %.",
    "uz-cyrl": "Ҳақиқий GitHub хатоларини тузатиш, ечилган %.",
    ru: "Исправление реальных задач с GitHub, % решённых.",
    en: "Fixing real GitHub issues, % resolved.",
  },

  /* ---- Metodologiya ---- */
  p11cMethodTitle: {
    uz: "Metodologiya va cheklovlar",
    "uz-cyrl": "Методология ва чекловлар",
    ru: "Методология и ограничения",
    en: "Methodology and limitations",
  },
  p11cMethod1: {
    uz: "{tasks} ta vazifa, har model uchun 1 marta, {date} sanasida. Qo'llab-quvvatlansa temperature 0.",
    "uz-cyrl": "{tasks} та вазифа, ҳар модель учун 1 марта, {date} санасида. Қўллаб-қувватланса температура 0.",
    ru: "{tasks} задач, 1 прогон на модель, {date}. Temperature 0, где поддерживается.",
    en: "{tasks} tasks, 1 run per model, on {date}. Temperature 0 where supported.",
  },
  p11cMethod2: {
    uz: "Modellar ilovaning o'zi ishlatadigan provayder yo'llari orqali chaqiriladi (OpenRouter, RSI, Groq, OmniRoute, Cloudflare Workers AI); aslida ishlatilgan yo'l jadvalda ko'rsatilgan. Barcha vazifalarni tugatmagan model \"hali o'lchanmagan\" deb qoladi.",
    "uz-cyrl": "Моделлар илованинг ўзи ишлатадиган провайдер йўллари орқали чақирилади (OpenRouter, RSI, Groq, OmniRoute, Cloudflare Workers AI); аслида ишлатилган йўл жадвалда кўрсатилган. Барча вазифаларни тугатмаган модель \"ҳали ўлчанмаган\" деб қолади.",
    ru: "Модели вызываются через те же маршруты провайдеров, что использует само приложение (OpenRouter, RSI, Groq, OmniRoute, Cloudflare Workers AI); фактический маршрут указан в таблице. Модель, не прошедшая все задачи, остаётся «пока не измерено».",
    en: "Models are called through the same provider routes the app itself uses (OpenRouter, RSI, Groq, OmniRoute, Cloudflare Workers AI); the route actually used is shown in the table. A model that did not finish every task stays \"not measured yet\".",
  },
  p11cCfNeurons: {
    uz: "Cloudflare Workers AI yo'li: bu o'lchovlarda taxminan {n} neuron sarflandi (tekin ulush — kuniga 10 000 neuron). Narx ustuni baribir OpenRouter ro'yxat narxida.",
    "uz-cyrl": "Cloudflare Workers AI йўли: бу ўлчовларда тахминан {n} нейрон сарфланди (текин улуш — кунига 10 000 нейрон). Нарх устуни барибир OpenRouter рўйхат нархида.",
    ru: "Маршрут Cloudflare Workers AI: в этих замерах израсходовано около {n} нейронов (бесплатно — 10 000 нейронов в день). Столбец стоимости всё равно указан по прайсу OpenRouter.",
    en: "Cloudflare Workers AI route: about {n} neurons were used for these measurements (free allowance: 10,000 neurons per day). The cost column still uses the OpenRouter list price.",
  },
  p11cMethod3: {
    uz: "Kod vazifalari yashirin unit-testlar bilan alohida jarayonda, vaqt chegarasi bilan (imkon bo'lsa — tarmoqsiz Docker konteynerida) tekshiriladi — barcha testlar o'tishi shart.",
    "uz-cyrl": "Код вазифалари яширин юнит-тестлар билан алоҳида жараёнда, вақт чегараси билан (имкон бўлса — тармоқсиз Docker контейнерида) текширилади — барча тестлар ўтиши шарт.",
    ru: "Код проверяется скрытыми unit-тестами в отдельном процессе с тайм-аутом (по возможности — в Docker-контейнере без сети) — должны пройти все тесты.",
    en: "Code is checked with hidden unit tests in a separate process with a timeout (in a network-less Docker container when available) — all tests must pass.",
  },
  p11cMethod4: {
    uz: "Matn vazifalarida faqat alifbo, uzunlik va majburiy atamalar tekshiriladi — uslub va ravonlik baholanmaydi.",
    "uz-cyrl": "Матн вазифаларида фақат алифбо, узунлик ва мажбурий атамалар текширилади — услуб ва равонлик баҳоланмайди.",
    ru: "В текстовых задачах проверяются только алфавит, длина и обязательные термины — стиль и естественность языка не оцениваются.",
    en: "Text tasks check only alphabet, length and required terms — style and fluency are not judged.",
  },
  p11cMethod5: {
    uz: "Bu kichik, maqsadli test, to'liq benchmark emas: bitta o'lchov o'zgarishi mumkin, 40 ta vazifa hamma narsani qamramaydi.",
    "uz-cyrl": "Бу кичик, мақсадли тест, тўлиқ бенчмарк эмас: битта ўлчов ўзгариши мумкин, 40 та вазифа ҳамма нарсани қамрамайди.",
    ru: "Это небольшой целевой тест, а не полноценный бенчмарк: один прогон может колебаться, 40 задач не покрывают всё.",
    en: "This is a small, focused test, not a full benchmark: a single run can vary, and 40 tasks cannot cover everything.",
  },
  p11cMethod6: {
    uz: "Ochiq benchmarklarga ko'ra, Claude'ning eng kuchli modellari terminalda agent sifatida dasturlash (Terminal-Bench) va eng qiyin ekspert savollarida (Humanity's Last Exam) hali ham oldinda.",
    "uz-cyrl": "Очиқ бенчмаркларга кўра, Claude'нинг энг кучли моделлари терминалда агент сифатида дастурлаш (Terminal-Bench) ва энг қийин эксперт саволларида (HLE) ҳали ҳам олдинда.",
    ru: "По публичным бенчмаркам топовые модели Claude по-прежнему впереди в агентном программировании в терминале (Terminal-Bench) и на самых сложных экспертных вопросах (Humanity's Last Exam).",
    en: "Per public benchmarks, Claude's top models are still ahead at agentic coding in a terminal (Terminal-Bench) and on the hardest expert questions (Humanity's Last Exam).",
  },
  p11cMethod7: {
    uz: "Narx va kechikish ma'lumot uchun: reseller va bepul tariflarda haqiqiy narx boshqacha bo'ladi.",
    "uz-cyrl": "Нарх ва кечикиш маълумот учун: реселлер ва бепул тарифларда ҳақиқий нарх бошқача бўлади.",
    ru: "Стоимость и задержка — для ориентира: у реселлеров и на бесплатных тарифах реальная цена другая.",
    en: "Cost and latency are indicative: real prices differ on resellers and free tiers.",
  },

  /* ---- FAQ ---- */
  p11cFaqTitle: { uz: "Savol-javob", "uz-cyrl": "Савол-жавоб", ru: "Вопросы и ответы", en: "FAQ" },
  p11cFaq1Q: {
    uz: "DeepSeek yoki Qwen Claude bilan aynan bir xil ishlaydimi?",
    "uz-cyrl": "DeepSeek ёки Qwen Claude билан айнан бир хил ишлайдими?",
    ru: "DeepSeek или Qwen работают точно так же, как Claude?",
    en: "Do DeepSeek or Qwen work exactly like Claude?",
  },
  p11cFaq1A: {
    uz: "Yo'q, va biz buni da'vo qilmaymiz. Ko'p kundalik vazifalarda ular yaqin — yuqoridagi o'lchangan raqamlarni ko'ring — lekin bir xil emas, ba'zi vazifalarda Claude oldinda.",
    "uz-cyrl": "Йўқ, ва биз буни даъво қилмаймиз. Кўп кундалик вазифаларда улар яқин — юқоридаги ўлчанган рақамларни кўринг — лекин бир хил эмас, баъзи вазифаларда Claude олдинда.",
    ru: "Нет, и мы этого не утверждаем. На многих повседневных задачах они близки — см. измеренные цифры выше, — но не идентичны, и в части задач Claude впереди.",
    en: "No, and we don't claim that. On many everyday tasks they are close — see the measured numbers above — but not identical, and Claude is ahead on some tasks.",
  },
  p11cFaq2Q: {
    uz: "Nega mening hududimda Claude'ni tanlab bo'lmaydi?",
    "uz-cyrl": "Нега менинг ҳудудимда Claude'ни танлаб бўлмайди?",
    ru: "Почему в моём регионе нельзя выбрать Claude?",
    en: "Why can't I choose Claude in my region?",
  },
  p11cFaq2A: {
    uz: "Model provayderlari ba'zi hududlarda xizmat ko'rsatmaydi. Biz faqat provayderi sizning hududingizga ruxsat bergan modellarni taklif qilamiz.",
    "uz-cyrl": "Модель провайдерлари баъзи ҳудудларда хизмат кўрсатмайди. Биз фақат провайдери сизнинг ҳудудингизга рухсат берган моделларни таклиф қиламиз.",
    ru: "Некоторые провайдеры моделей не обслуживают отдельные регионы. Мы предлагаем только те модели, провайдеры которых разрешают ваш регион.",
    en: "Some model providers don't serve certain regions. We only offer models whose providers allow your region.",
  },
  p11cFaq3Q: {
    uz: "Kod uchun qaysi modelni tanlash kerak?",
    "uz-cyrl": "Код учун қайси моделни танлаш керак?",
    ru: "Какую модель выбрать для кода?",
    en: "Which model should I use for code?",
  },
  p11cFaq3A: {
    uz: "\"Dasturlash\" ustuniga qarang va mavjud modellardan eng yuqori natijalisini tanlang. Uzoq agent ishlarida ochiq benchmarklarga ko'ra Claude bilan farq kattaroq.",
    "uz-cyrl": "\"Дастурлаш\" устунига қаранг ва мавжуд моделлардан энг юқори натижалисини танланг. Узоқ агент ишларида очиқ бенчмаркларга кўра Claude билан фарқ каттароқ.",
    ru: "Смотрите столбец «Программирование» и выбирайте доступную модель с лучшим результатом. В длинных агентных задачах, по публичным бенчмаркам, разрыв с Claude больше.",
    en: "Check the Coding column and pick the best-scoring model available to you. For long agentic work, public benchmarks show a larger gap to Claude.",
  },
  p11cFaq4Q: {
    uz: "Bu sahifa qanchalik tez-tez yangilanadi?",
    "uz-cyrl": "Бу саҳифа қанчалик тез-тез янгиланади?",
    ru: "Как часто обновляется эта страница?",
    en: "How often is this page updated?",
  },
  p11cFaq4A: {
    uz: "Modellar qo'shilganda yoki yangilanganda testni qayta ishga tushirib, yuqoridagi sanani yangilaymiz.",
    "uz-cyrl": "Моделлар қўшилганда ёки янгиланганда тестни қайта ишга тушириб, юқоридаги санани янгилаймиз.",
    ru: "Когда модели добавляются или обновляются, мы перезапускаем тест и обновляем дату выше.",
    en: "When models are added or updated, we rerun the eval and update the date above.",
  },

  /* ---- Havolalar (footer, docs) ---- */
  p11cFooterLink: {
    uz: "Modellar taqqoslovi",
    "uz-cyrl": "Моделлар таққослови",
    ru: "Сравнение моделей",
    en: "Model comparison",
  },
  p11cDocsLink: {
    uz: "DeepSeek va Qwen Claude'ga qanchalik yaqin? O'lchangan natijalar →",
    "uz-cyrl": "DeepSeek ва Qwen Claude'га қанчалик яқин? Ўлчанган натижалар →",
    ru: "Насколько DeepSeek и Qwen близки к Claude? Измеренные результаты →",
    en: "How close are DeepSeek and Qwen to Claude? Measured results →",
  },
} satisfies Dict;
