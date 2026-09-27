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
} satisfies Dict;
