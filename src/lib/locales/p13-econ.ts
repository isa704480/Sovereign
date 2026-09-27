import type { Dict } from "@/lib/i18n";

/**
 * Admin paneli — "Unit economics" kartasi (13-bosqich): har javob xarajati bizda va
 * bitta vendor flagmanida, tekin tarif ulushi, taqsimotlar. 4 tilda (uz / uz-cyrl / ru / en).
 */
export const P13E = {
  p13eTitle: {
    uz: "Unit economics — javob narxi",
    "uz-cyrl": "Юнит-экономика — жавоб нархи",
    ru: "Юнит-экономика — стоимость ответа",
    en: "Unit economics — cost per answer",
  },
  p13eRangeAria: {
    uz: "Sanalar oralig'i",
    "uz-cyrl": "Саналар оралиғи",
    ru: "Период",
    en: "Date range",
  },
  p13eRangeDays: {
    uz: "{n} kun",
    "uz-cyrl": "{n} кун",
    ru: "{n} дн.",
    en: "{n} days",
  },
  p13ePeriod: {
    uz: "{from} — {to} (UTC)",
    "uz-cyrl": "{from} — {to} (UTC)",
    ru: "{from} — {to} (UTC)",
    en: "{from} — {to} (UTC)",
  },
  p13eMethodAria: {
    uz: "Metodika",
    "uz-cyrl": "Методика",
    ru: "Методика",
    en: "Methodology",
  },
  p13eMethod: {
    uz: "Ro'yxat narxlari bo'yicha taxmin: har javob tokenlari × shu javobni haqiqatda bergan modelning ro'yxat narxi, bir xil tokenlar bitta vendor flagmanining ro'yxat narxi bilan solishtiriladi. Tekin tarifdagi foydalanish ham ro'yxat narxida hisoblanadi va alohida ko'rsatiladi. Reseller chegirmalari, kesh va qidiruv to'lovlari kiritilmagan; tokenlar qisman taxminiy (~4 belgi = 1 token).",
    "uz-cyrl": "Рўйхат нархлари бўйича тахмин: ҳар жавоб токенлари × шу жавобни ҳақиқатда берган моделнинг рўйхат нархи, бир хил токенлар битта вендор флагманининг рўйхат нархи билан солиштирилади. Текин тарифдаги фойдаланиш ҳам рўйхат нархида ҳисобланади ва алоҳида кўрсатилади. Реселлер чегирмалари, кеш ва қидирув тўловлари киритилмаган; токенлар қисман тахминий (~4 белги = 1 токен).",
    ru: "Оценка по прайс-листам: токены каждого ответа × прайс модели, которая реально дала ответ, в сравнении с теми же токенами по прайсу флагмана одного вендора. Использование бесплатных тарифов тоже считается по прайсу и показано отдельно. Скидки реселлеров, кеш и плата за поиск не учтены; токены частично оценочные (~4 символа = 1 токен).",
    en: "Estimates at list prices: each answer's tokens × the list price of the model that actually served it, compared with the same tokens at a single-vendor flagship's list price. Free-tier usage is priced at list price and shown separately. Reseller discounts, caching and search fees are not included; token counts are partly estimated (~4 characters = 1 token).",
  },
  p13eOurPerAnswer: {
    uz: "Bizda / javob",
    "uz-cyrl": "Бизда / жавоб",
    ru: "У нас / ответ",
    en: "Ours / answer",
  },
  p13eBaselinePerAnswer: {
    uz: "Faqat {model} / javob",
    "uz-cyrl": "Фақат {model} / жавоб",
    ru: "Только {model} / ответ",
    en: "{model} only / answer",
  },
  p13eSavingsVs: {
    uz: "{model}ga nisbatan tejash",
    "uz-cyrl": "{model}га нисбатан тежаш",
    ru: "Экономия против {model}",
    en: "Savings vs {model}",
  },
  p13eTotals: {
    uz: "Jami: bizda {ours} · {model} bilan {base}",
    "uz-cyrl": "Жами: бизда {ours} · {model} билан {base}",
    ru: "Итого: у нас {ours} · с {model} {base}",
    en: "Total: ours {ours} · with {model} {base}",
  },
  p13eFreeShare: {
    uz: "Tekin tarifdagi javoblar",
    "uz-cyrl": "Текин тарифдаги жавоблар",
    ru: "Ответы на бесплатных тарифах",
    en: "Answers on free tiers",
  },
  p13eFreeShareSub: {
    uz: "{n} ta javob · ro'yxat narxida {cost} (yuqoridagi xarajatga kiritilgan)",
    "uz-cyrl": "{n} та жавоб · рўйхат нархида {cost} (юқоридаги харажатга киритилган)",
    ru: "{n} ответов · {cost} по прайсу (включено в расходы выше)",
    en: "{n} answers · {cost} at list price (included in the cost above)",
  },
  p13eCoverage: {
    uz: "Narxlangan: {priced} / {total} javob · {tokens} token · haqiqiy model saqlangan: {verified}",
    "uz-cyrl": "Нархланган: {priced} / {total} жавоб · {tokens} токен · ҳақиқий модел сақланган: {verified}",
    ru: "Оценено: {priced} из {total} ответов · {tokens} токенов · реальная модель записана: {verified}",
    en: "Priced: {priced} of {total} answers · {tokens} tokens · served model recorded: {verified}",
  },
  p13eExcluded: {
    uz: "Chiqarilgan: {noModel} ta javobda model yo'q, {unpriced} tasida ro'yxat narxi yo'q {models}",
    "uz-cyrl": "Чиқарилган: {noModel} та жавобда модел йўқ, {unpriced} тасида рўйхат нархи йўқ {models}",
    ru: "Исключено: {noModel} ответов без модели, {unpriced} без прайса {models}",
    en: "Excluded: {noModel} answers without a served model, {unpriced} with no list price {models}",
  },
  p13eNoServedCols: {
    uz: "0036 migratsiyasi qo'llanmagan: provayder va haqiqiy model saqlanmaydi — xarajat marshrut model id'si bo'yicha, tekin tarif ulushi esa quyi chegara.",
    "uz-cyrl": "0036 миграцияси қўлланмаган: провайдер ва ҳақиқий модел сақланмайди — харажат маршрут модели бўйича, текин тариф улуши эса қуйи чегара.",
    ru: "Миграция 0036 не применена: провайдер и реальная модель не сохраняются — стоимость считается по модели маршрута, а доля бесплатных тарифов — нижняя граница.",
    en: "Migration 0036 not applied: provider and served model are not stored — cost uses the routed model id and the free-tier share is a lower bound.",
  },
  p13eUnavailable: {
    uz: "Ma'lumot yo'q: service role kaliti sozlanmagan yoki token_usage_daily jadvali mavjud emas (0035).",
    "uz-cyrl": "Маълумот йўқ: сервис калити созланмаган ёки токенлар жадвали мавжуд эмас (0035).",
    ru: "Нет данных: не настроен сервисный ключ или нет таблицы token_usage_daily (0035).",
    en: "No data: service role key not configured or the token_usage_daily table is missing (0035).",
  },
  p13eNoData: {
    uz: "Bu davrda yozilgan sarf yo'q.",
    "uz-cyrl": "Бу даврда ёзилган сарф йўқ.",
    ru: "За этот период нет записанного расхода.",
    en: "No recorded usage in this period.",
  },
  p13eByProvider: {
    uz: "Provayder bo'yicha",
    "uz-cyrl": "Провайдер бўйича",
    ru: "По провайдерам",
    en: "By provider",
  },
  p13eByModel: {
    uz: "Model bo'yicha",
    "uz-cyrl": "Модел бўйича",
    ru: "По моделям",
    en: "By model",
  },
  p13eByPlan: {
    uz: "Tarif bo'yicha (joriy)",
    "uz-cyrl": "Тариф бўйича (жорий)",
    ru: "По тарифам (текущим)",
    en: "By plan (current)",
  },
  p13eColName: {
    uz: "Nomi",
    "uz-cyrl": "Номи",
    ru: "Название",
    en: "Name",
  },
  p13eColAnswers: {
    uz: "Javoblar",
    "uz-cyrl": "Жавоблар",
    ru: "Ответы",
    en: "Answers",
  },
  p13eColCost: {
    uz: "Xarajat",
    "uz-cyrl": "Харажат",
    ru: "Расход",
    en: "Cost",
  },
  p13eUnknown: {
    uz: "noma'lum",
    "uz-cyrl": "номаълум",
    ru: "неизвестно",
    en: "unknown",
  },
  p13ePricesAsOf: {
    uz: "Ro'yxat narxlari {date} holatiga (manbalar: src/config/model-prices.ts)",
    "uz-cyrl": "Рўйхат нархлари {date} ҳолатига (манбалар: src/config/model-prices.ts)",
    ru: "Прайсы на {date} (источники: src/config/model-prices.ts)",
    en: "List prices as of {date} (sources: src/config/model-prices.ts)",
  },

  /* ---- API byudjeti (50% qoidasi) — admin kartasi ---- */
  p13eBudgetTitle: {
    uz: "API byudjeti — joriy oy (sarf daromadning ulushi sifatida)",
    "uz-cyrl": "API бюджети — жорий ой (сарф даромаднинг улуши сифатида)",
    ru: "Бюджет API — текущий месяц (расход как доля выручки)",
    en: "API budget — this month (spend as a share of revenue)",
  },
  p13eBudgetUnavailable: {
    uz: "Byudjet ma'lumoti yo'q (Supabase service role kaliti sozlanmagan yoki xato).",
    "uz-cyrl": "Бюджет маълумоти йўқ (Supabase сервис калити созланмаган ёки хато).",
    ru: "Нет данных бюджета (не настроен сервисный ключ Supabase или ошибка).",
    en: "Budget data unavailable (Supabase service role key missing or error).",
  },
  p13eBudgetRevenue: {
    uz: "Daromad (to'langan buyurtmalar)",
    "uz-cyrl": "Даромад (тўланган буюртмалар)",
    ru: "Выручка (оплаченные заказы)",
    en: "Revenue (paid orders)",
  },
  p13eBudgetSpend: {
    uz: "API sarfi (taxmin)",
    "uz-cyrl": "API сарфи (тахмин)",
    ru: "Расход на API (оценка)",
    en: "API spend (estimate)",
  },
  p13eBudgetFreeTier: {
    uz: "Tekin tarif ro'yxat narxida: {cost} (hisobga kirmaydi)",
    "uz-cyrl": "Текин тариф рўйхат нархида: {cost} (ҳисобга кирмайди)",
    ru: "Бесплатные тарифы по прайсу: {cost} (не учитываются)",
    en: "Free tier at list price: {cost} (not counted)",
  },
  p13eBudgetRatio: {
    uz: "Sarf / daromad",
    "uz-cyrl": "Сарф / даромад",
    ru: "Расход / выручка",
    en: "Spend / revenue",
  },
  p13eBudgetRatioSub: {
    uz: "ogohlantirish {warn} · chegara {cap}",
    "uz-cyrl": "огоҳлантириш {warn} · чегара {cap}",
    ru: "предупреждение {warn} · лимит {cap}",
    en: "warn {warn} · cap {cap}",
  },
  p13eBudgetGuard: {
    uz: "Byudjet himoyasi",
    "uz-cyrl": "Бюджет ҳимояси",
    ru: "Защита бюджета",
    en: "Budget guard",
  },
  p13eBudgetGuardOn: {
    uz: "Faqat tekin modellar",
    "uz-cyrl": "Фақат текин моделлар",
    ru: "Только бесплатные модели",
    en: "Free models only",
  },
  p13eBudgetGuardWarn: {
    uz: "Chegaraga yaqin",
    "uz-cyrl": "Чегарага яқин",
    ru: "Близко к лимиту",
    en: "Near the cap",
  },
  p13eBudgetGuardOff: {
    uz: "O'chiq",
    "uz-cyrl": "Ўчиқ",
    ru: "Выключена",
    en: "Off",
  },
  p13eBudgetOpenrouter: {
    uz: "OpenRouter balansi",
    "uz-cyrl": "OpenRouter баланси",
    ru: "Баланс OpenRouter",
    en: "OpenRouter balance",
  },
  p13eBudgetOpenrouterNa: {
    uz: "noma'lum",
    "uz-cyrl": "номаълум",
    ru: "нет данных",
    en: "unknown",
  },
  p13eBudgetOpenrouterMonth: {
    uz: "shu oy sarf: {usd}",
    "uz-cyrl": "шу ой сарф: {usd}",
    ru: "расход за месяц: {usd}",
    en: "spent this month: {usd}",
  },
  p13eBudgetAllowance: {
    uz: "Ruxsat: {allowance} = max(minimum {floor}, daromad × {cap}). Undan oshsa — faqat tekin provayderlar (Groq, Cloudflare va h.k.).",
    "uz-cyrl": "Рухсат: {allowance} = МАКС(минимум {floor}, даромад × {cap}). Ундан ошса — фақат текин провайдерлар (Groq, Cloudflare ва ҳ.к.).",
    ru: "Лимит: {allowance} = max(минимум {floor}, выручка × {cap}). Выше — только бесплатные провайдеры (Groq, Cloudflare и т. д.).",
    en: "Allowance: {allowance} = max(floor {floor}, revenue × {cap}). Above it — free providers only (Groq, Cloudflare, etc.).",
  },
  p13eBudgetOrders: {
    uz: "Buyurtmalar: {n} (yillik — oyiga 1/12 dan: {yearly})",
    "uz-cyrl": "Буюртмалар: {n} (йиллик — ойига 1/12 дан: {yearly})",
    ru: "Заказы: {n} (годовые — по 1/12 в месяц: {yearly})",
    en: "Orders: {n} (yearly counted at 1/12 per month: {yearly})",
  },
  p13eBudgetRubRate: {
    uz: "RUB kursi: {rate} ({source})",
    "uz-cyrl": "RUB курси: {rate} ({source})",
    ru: "Курс RUB: {rate} ({source})",
    en: "RUB rate: {rate} ({source})",
  },
  p13eBudgetRubNone: {
    uz: "Kurs yo'qligi sababli hisoblanmagan RUB buyurtmalar: {n} (BUDGET_RUB_PER_USD ni qo'ying)",
    "uz-cyrl": "Курс йўқлиги сабабли ҳисобланмаган RUB буюртмалар: {n} (BUDGET_RUB_PER_USD ни қўйинг)",
    ru: "RUB-заказы без курса (не учтены): {n} (задайте BUDGET_RUB_PER_USD)",
    en: "RUB orders not counted (no rate): {n} (set BUDGET_RUB_PER_USD)",
  },
  p13eBudgetAsOf: {
    uz: "Hisoblangan: {time} UTC (5 daqiqa keshlanadi)",
    "uz-cyrl": "Ҳисобланган: {time} UTC (5 дақиқа кешланади)",
    ru: "Рассчитано: {time} UTC (кеш 5 минут)",
    en: "Computed: {time} UTC (cached for 5 minutes)",
  },

  /* ---- Byudjet alertlari (Telegram / email, ALERT_LANG tilida) ---- */
  p13eAlertTitle: {
    uz: "SOVEREIGN — API byudjeti",
    "uz-cyrl": "SOVEREIGN — API бюджети",
    ru: "SOVEREIGN — бюджет API",
    en: "SOVEREIGN — API budget",
  },
  p13eAlertOpenrouterLow: {
    uz: "OpenRouter balansi kam: {balance} (chegara {min}). Kreditni to'ldiring.",
    "uz-cyrl": "OpenRouter баланси кам: {balance} (чегара {min}). Кредитни тўлдиринг.",
    ru: "Мало средств на OpenRouter: {balance} (порог {min}). Пополните баланс.",
    en: "OpenRouter balance is low: {balance} (threshold {min}). Please top up.",
  },
  p13eAlertWarn: {
    uz: "{month}: API sarfi {spend} — daromad {revenue} ning {ratio} i (ogohlantirish {warn}, ruxsat {allowance}).",
    "uz-cyrl": "{month}: API сарфи {spend} — даромад {revenue} нинг {ratio} и (огоҳлантириш {warn}, рухсат {allowance}).",
    ru: "{month}: расход на API {spend} — {ratio} от выручки {revenue} (предупреждение {warn}, лимит {allowance}).",
    en: "{month}: API spend {spend} is {ratio} of revenue {revenue} (warning at {warn}, allowance {allowance}).",
  },
  p13eAlertCap: {
    uz: "{month}: API sarfi {spend} ruxsatga ({allowance}, daromad {revenue} × {cap}) yetdi. Pullik modellar to'xtatildi — faqat tekin provayderlar ishlaydi.",
    "uz-cyrl": "{month}: API сарфи {spend} рухсатга ({allowance}, даромад {revenue} × {cap}) етди. Пуллик моделлар тўхтатилди — фақат текин провайдерлар ишлайди.",
    ru: "{month}: расход на API {spend} достиг лимита ({allowance}, выручка {revenue} × {cap}). Платные модели приостановлены — работают только бесплатные провайдеры.",
    en: "{month}: API spend {spend} reached the allowance ({allowance}, revenue {revenue} × {cap}). Paid models are paused — free providers only.",
  },
  p13eAlertGuardOn: {
    uz: "Byudjet himoyasi YOQILDI: sarf {spend} ≥ ruxsat {allowance}. Daromad oshsa yoki yangi oy boshlansa o'zi o'chadi.",
    "uz-cyrl": "Бюджет ҳимояси ЁҚИЛДИ: сарф {spend} ≥ рухсат {allowance}. Даромад ошса ёки янги ой бошланса ўзи ўчади.",
    ru: "Защита бюджета ВКЛЮЧЕНА: расход {spend} ≥ лимит {allowance}. Выключится сама при росте выручки или в новом месяце.",
    en: "Budget guard ON: spend {spend} ≥ allowance {allowance}. It turns off by itself when revenue grows or a new month starts.",
  },
  p13eAlertGuardOff: {
    uz: "Byudjet himoyasi O'CHDI: sarf {spend}, ruxsat {allowance}. Pullik modellar yana ishlaydi.",
    "uz-cyrl": "Бюджет ҳимояси ЎЧДИ: сарф {spend}, рухсат {allowance}. Пуллик моделлар яна ишлайди.",
    ru: "Защита бюджета ВЫКЛЮЧЕНА: расход {spend}, лимит {allowance}. Платные модели снова доступны.",
    en: "Budget guard OFF: spend {spend}, allowance {allowance}. Paid models are available again.",
  },
} satisfies Dict;
