import type { Dict } from "@/lib/i18n";

/**
 * P23 — "O'ylab javob" (thinking / reasoning).
 *
 * Composer chipi, tarif darvozasi (Free'da yopiq), javob ustidagi yig'iladigan panel
 * ("O'ylayapti…" → "N soniya o'yladi") va hujjatlar bo'limi. Matnlar halol: model
 * fikrini ko'rsatamiz, lekin "aqlliroq javob" deb va'da bermaymiz.
 */
export const P23T = {
  // ---- Composer chipi ----
  p23ThinkChip: { uz: "O'ylab javob", "uz-cyrl": "Ўйлаб жавоб", ru: "С рассуждением", en: "Thinking" },
  p23ThinkChipTitle: {
    uz: "Model javobdan oldin fikr yuritadi va o'ylash jarayoni javob ustida ko'rsatiladi. Javob sekinroq keladi va ko'proq token sarflaydi.",
    "uz-cyrl": "Модел жавобдан олдин фикр юритади ва ўйлаш жараёни жавоб устида кўрсатилади. Жавоб секинроқ келади ва кўпроқ токен сарфлайди.",
    ru: "Модель рассуждает перед ответом, а ход рассуждений показывается над ответом. Ответ приходит медленнее и расходует больше токенов.",
    en: "The model reasons before answering, and the reasoning is shown above the answer. Answers take longer and use more tokens.",
  },
  p23ThinkLocked: {
    uz: "O'ylab javob berish Basic tarifidan boshlab mavjud. Free tarifida savollar tez modelga yo'naltiriladi.",
    "uz-cyrl": "Ўйлаб жавоб бериш Basic тарифидан бошлаб мавжуд. Free тарифида саволлар тез моделга йўналтирилади.",
    ru: "Ответ с рассуждением доступен начиная с тарифа Basic. На тарифе Free запросы идут к быстрой модели.",
    en: "Answers with thinking are available from the Basic plan. On Free, requests go to a fast model.",
  },

  // ---- Javob ustidagi panel ----
  p23ThinkStreaming: { uz: "O'ylayapti…", "uz-cyrl": "Ўйлаяпти…", ru: "Думает…", en: "Thinking…" },
  p23ThinkSecondsOne: { uz: "{n} soniya o'yladi", "uz-cyrl": "{n} сония ўйлади", ru: "Думал {n} секунду", en: "Thought for {n} second" },
  p23ThinkSecondsFew: { uz: "{n} soniya o'yladi", "uz-cyrl": "{n} сония ўйлади", ru: "Думал {n} секунды", en: "Thought for {n} seconds" },
  p23ThinkSecondsMany: { uz: "{n} soniya o'yladi", "uz-cyrl": "{n} сония ўйлади", ru: "Думал {n} секунд", en: "Thought for {n} seconds" },
  p23ThinkDone: { uz: "O'ylab bo'ldi", "uz-cyrl": "Ўйлаб бўлди", ru: "Рассуждение завершено", en: "Finished thinking" },
  p23ThinkExpand: { uz: "O'ylash jarayonini ochish", "uz-cyrl": "Ўйлаш жараёнини очиш", ru: "Показать ход рассуждений", en: "Show the thinking" },
  p23ThinkCollapse: { uz: "O'ylash jarayonini yopish", "uz-cyrl": "Ўйлаш жараёнини ёпиш", ru: "Скрыть ход рассуждений", en: "Hide the thinking" },

  // ---- Zaxira holati (fikrlaydigan model topilmadi) ----
  p23ThinkNoModel: {
    uz: "Bu javob uchun fikrlaydigan model topilmadi — oddiy model javob berdi.",
    "uz-cyrl": "Бу жавоб учун фикрлайдиган модел топилмади — оддий модел жавоб берди.",
    ru: "Для этого ответа не нашлось рассуждающей модели — ответила обычная.",
    en: "No reasoning model was available for this answer — a regular model replied.",
  },

  // ---- Hujjatlar ----
  p23DRowThinking: { uz: "O'ylab javob", "uz-cyrl": "Ўйлаб жавоб", ru: "Ответ с рассуждением", en: "Answers with thinking" },
  p23DThinkTitle: { uz: "O'ylab javob berish", "uz-cyrl": "Ўйлаб жавоб бериш", ru: "Ответ с рассуждением", en: "Answers with thinking" },
  p23DThinkBody: {
    uz: "Yozuv maydonidagi \"O'ylab javob\" chipi yoqilsa, so'rov fikrlaydigan modelga yo'naltirishga harakat qilinadi va model javobdan oldingi fikri javob ustidagi yig'iladigan panelda jonli ko'rsatiladi. Panel javob tugagach yopiladi — bosib qayta ochish mumkin. Fikr tokenlari ham javob tokenlari kabi hisobga yoziladi. Tarif ruxsat bergan fikrlaydigan model topilmasa, so'rov bekor qilinmaydi: oddiy model javob beradi va bu suhbatda aytiladi. Free tarifida bu rejim yo'q — so'rovlar tez modelga boradi va provayder yuborgan fikr matni serverda kesib tashlanadi.",
    "uz-cyrl": "Ёзув майдонидаги \"Ўйлаб жавоб\" чипи ёқилса, сўров фикрлайдиган моделга йўналтиришга ҳаракат қилинади ва модел жавобдан олдинги фикри жавоб устидаги йиғиладиган панелда жонли кўрсатилади. Панел жавоб тугагач ёпилади — босиб қайта очиш мумкин. Фикр токенлари ҳам жавоб токенлари каби ҳисобга ёзилади. Тариф рухсат берган фикрлайдиган модел топилмаса, сўров бекор қилинмайди: оддий модел жавоб беради ва бу суҳбатда айтилади. Free тарифида бу режим йўқ — сўровлар тез моделга боради ва провайдер юборган фикр матни серверда кесиб ташланади.",
    ru: "Если включить чип «С рассуждением» в поле ввода, запрос стараются направить рассуждающей модели, а её размышления показываются над ответом в сворачиваемой панели в реальном времени. После ответа панель сворачивается — её можно открыть снова. Токены рассуждений учитываются так же, как токены ответа. Если рассуждающей модели в пределах тарифа нет, запрос не отменяется: отвечает обычная модель, и об этом сообщается в чате. На тарифе Free режима нет — запросы идут к быстрой модели, а присланный провайдером текст рассуждений отсекается на сервере.",
    en: "Turn on the \"Thinking\" chip in the composer and the request is routed to a reasoning model where one is available; the model's reasoning streams live into a collapsible panel above the answer. The panel collapses once the answer is done and can be reopened. Reasoning tokens are billed the same way as answer tokens. If no reasoning model is available within your plan the request is not cancelled: a regular model answers and the chat says so. Free has no thinking mode — requests go to a fast model and any reasoning the provider sends is stripped on the server.",
  },
} satisfies Dict;
