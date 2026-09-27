import type { Dict } from "@/lib/i18n";

/**
 * Chuqur so'rash (Deep Inquiry, docs/INQUIRY.md) — web mijoz matnlari. 4 tilda (uz / uz-cyrl / ru / en).
 * p14iCard*, p14iReply*, p14iSkip* — use-send-message.ts (savol kartasining oddiy matn ko'rinishi va
 * foydalanuvchi javobi xabari). Qolganlari (T5): InquiryCard va follow-up chip'lar, Settings'dagi
 * 3 holatli tanlov, limit xatosidagi "Cowork'da mahalliy model" CTA (PricingDialog).
 */
export const P14I = {
  p14iCardIntro: {
    uz: "Aniqroq javob berish uchun bir nechta savol:",
    "uz-cyrl": "Аниқроқ жавоб бериш учун бир нечта савол:",
    ru: "Чтобы ответить точнее, уточню несколько моментов:",
    en: "A few questions so I can answer more precisely:",
  },
  p14iCardWhy: {
    uz: "Nega: {why}",
    "uz-cyrl": "Нега: {why}",
    ru: "Зачем: {why}",
    en: "Why: {why}",
  },
  p14iCardOptions: {
    uz: "Variantlar: {options}",
    "uz-cyrl": "Вариантлар: {options}",
    ru: "Варианты: {options}",
    en: "Options: {options}",
  },
  p14iReplyHeading: {
    uz: "Aniqlashtirish:",
    "uz-cyrl": "Аниқлаштириш:",
    ru: "Уточнение:",
    en: "Clarification:",
  },
  p14iReplyAssumeRest: {
    uz: "Qolgan savollar bo'yicha taxmin qiling.",
    "uz-cyrl": "Қолган саволлар бўйича тахмин қилинг.",
    ru: "По остальным вопросам сделайте допущения.",
    en: "Make assumptions for the remaining questions.",
  },
  p14iSkipMessage: {
    uz: "Taxminlar bilan javob bering.",
    "uz-cyrl": "Тахминлар билан жавоб беринг.",
    ru: "Ответьте, исходя из допущений.",
    en: "Answer based on assumptions.",
  },
  // ── InquiryCard (savol kartasi) ────────────────────────────────────────────
  p14iGoal: {
    uz: "Maqsad: {goal}",
    "uz-cyrl": "Мақсад: {goal}",
    ru: "Цель: {goal}",
    en: "Goal: {goal}",
  },
  p14iCritical: {
    uz: "muhim",
    "uz-cyrl": "муҳим",
    ru: "важно",
    en: "important",
  },
  p14iCriticalHint: {
    uz: "Javob shu faktga kuchli bog'liq",
    "uz-cyrl": "Жавоб шу фактга кучли боғлиқ",
    ru: "Ответ сильно зависит от этого факта",
    en: "The answer depends heavily on this fact",
  },
  p14iChooseOne: {
    uz: "Bittasini tanlang",
    "uz-cyrl": "Биттасини танланг",
    ru: "Выберите один вариант",
    en: "Pick one",
  },
  p14iChooseMany: {
    uz: "Bir nechtasini tanlash mumkin",
    "uz-cyrl": "Бир нечтасини танлаш мумкин",
    ru: "Можно выбрать несколько",
    en: "You can pick several",
  },
  p14iOther: {
    uz: "Boshqa…",
    "uz-cyrl": "Бошқа…",
    ru: "Другое…",
    en: "Other…",
  },
  p14iOtherPlaceholder: {
    uz: "O'z javobingizni yozing",
    "uz-cyrl": "Ўз жавобингизни ёзинг",
    ru: "Напишите свой вариант",
    en: "Type your own answer",
  },
  p14iTextPlaceholder: {
    uz: "Javobingiz…",
    "uz-cyrl": "Жавобингиз…",
    ru: "Ваш ответ…",
    en: "Your answer…",
  },
  p14iSubmit: {
    uz: "Javob berish",
    "uz-cyrl": "Жавоб бериш",
    ru: "Ответить",
    en: "Submit answers",
  },
  p14iSubmitHint: {
    uz: "Kamida bitta savolga javob bering yoki taxmin bilan davom eting",
    "uz-cyrl": "Камида битта саволга жавоб беринг ёки тахмин билан давом этинг",
    ru: "Ответьте хотя бы на один вопрос или продолжите с допущениями",
    en: "Answer at least one question, or continue with assumptions",
  },
  p14iSkip: {
    uz: "Taxmin bilan javob ber",
    "uz-cyrl": "Тахмин билан жавоб бер",
    ru: "Ответить с допущениями",
    en: "Answer with assumptions",
  },
  p14iSkipTitle: {
    uz: "Savollarsiz javob beradi va qanday taxminlarga tayanganini ochiq aytadi",
    "uz-cyrl": "Саволларсиз жавоб беради ва қандай тахминларга таянганини очиқ айтади",
    ru: "Ответит без уточнений и прямо укажет, на какие допущения опирался",
    en: "Answers without clarification and states openly which assumptions it relied on",
  },
  p14iAssumptionsTitle: {
    uz: "Javobsiz qolsa nima taxmin qilinadi",
    "uz-cyrl": "Жавобсиз қолса нима тахмин қилинади",
    ru: "Что будет предположено без ответа",
    en: "What will be assumed if you skip",
  },
  p14iRemember: {
    uz: "Bu faktlarni eslab qol",
    "uz-cyrl": "Бу фактларни эслаб қол",
    ru: "Запомнить эти факты",
    en: "Remember these facts",
  },
  p14iRememberHint: {
    uz: "Keyingi suhbatlarda qayta so'ralmaydi. Telefon, karta, pasport kabi shaxsiy raqamlar saqlanmaydi.",
    "uz-cyrl": "Кейинги суҳбатларда қайта сўралмайди. Телефон, карта, паспорт каби шахсий рақамлар сақланмайди.",
    ru: "В следующих разговорах не придётся повторять. Телефон, номер карты, паспорт и другие личные номера не сохраняются.",
    en: "You won't be asked again in future chats. Personal numbers such as phone, card or passport are never stored.",
  },
  p14iRememberSensitive: {
    uz: "Diqqat: bu nozik mavzu (huquq, tibbiyot yoki moliya). Faqat eslab qolinishini xohlagan faktlaringizni saqlang.",
    "uz-cyrl": "Диққат: бу нозик мавзу (ҳуқуқ, тиббиёт ёки молия). Фақат эслаб қолинишини хоҳлаган фактларингизни сақланг.",
    ru: "Внимание: это чувствительная тема (право, медицина или финансы). Сохраняйте только те факты, которые хотите, чтобы я помнил.",
    en: "Note: this is a sensitive topic (legal, medical or financial). Only save facts you actually want remembered.",
  },
  p14iProLawyer: {
    uz: "Muhim qaror oldidan malakali advokat bilan maslahatlashing.",
    "uz-cyrl": "Муҳим қарор олдидан малакали адвокат билан маслаҳатлашинг.",
    ru: "Перед важным решением проконсультируйтесь с квалифицированным юристом.",
    en: "Consult a qualified lawyer before making an important decision.",
  },
  p14iProDoctor: {
    uz: "Tashxis va davolash uchun shifokorga murojaat qiling.",
    "uz-cyrl": "Ташхис ва даволаш учун шифокорга мурожаат қилинг.",
    ru: "Для диагноза и лечения обратитесь к врачу.",
    en: "See a doctor for diagnosis and treatment.",
  },
  p14iProFinancial: {
    uz: "Katta moliyaviy qaror oldidan litsenziyali moliyaviy maslahatchi bilan gaplashing.",
    "uz-cyrl": "Катта молиявий қарор олдидан лицензияли молиявий маслаҳатчи билан гаплашинг.",
    ru: "Перед крупным финансовым решением поговорите с лицензированным финансовым консультантом.",
    en: "Talk to a licensed financial advisor before a major financial decision.",
  },
  p14iStateAnswered: {
    uz: "Javob yuborildi",
    "uz-cyrl": "Жавоб юборилди",
    ru: "Ответ отправлен",
    en: "Answers sent",
  },
  p14iStateSkipped: {
    uz: "Taxminlar bilan davom etildi",
    "uz-cyrl": "Тахминлар билан давом этилди",
    ru: "Продолжено с допущениями",
    en: "Continued with assumptions",
  },
  p14iStateIgnored: {
    uz: "Savollar o'tkazib yuborildi",
    "uz-cyrl": "Саволлар ўтказиб юборилди",
    ru: "Вопросы пропущены",
    en: "Questions skipped",
  },
  // "Bu faktlarni eslab qol" natijasi (R2-8: xato jim qolmasin)
  p14iMemorySaved: {
    uz: "Faktlar xotiraga saqlandi",
    "uz-cyrl": "Фактлар хотирага сақланди",
    ru: "Факты сохранены в память",
    en: "Facts saved to memory",
  },
  p14iMemoryFailed: {
    uz: "Faktlarni xotiraga saqlab bo'lmadi — keyinroq Sozlamalar → Xotira'dan qo'shing",
    "uz-cyrl": "Фактларни хотирага сақлаб бўлмади — кейинроқ Созламалар → Хотирадан қўшинг",
    ru: "Не удалось сохранить факты в память — добавьте их позже в Настройки → Память",
    en: "Couldn't save the facts to memory — add them later in Settings → Memory",
  },
  // ── Follow-up chip'lar (javob ostida) ──────────────────────────────────────
  p14iFollowTitle: {
    uz: "Javobni aniqroq qilish uchun:",
    "uz-cyrl": "Жавобни аниқроқ қилиш учун:",
    ru: "Чтобы уточнить ответ:",
    en: "To refine the answer:",
  },
  p14iFollowSend: {
    uz: "Yuborish",
    "uz-cyrl": "Юбориш",
    ru: "Отправить",
    en: "Send",
  },
  // ── Sozlamalar: Chuqur so'rash (auto / always / off) ───────────────────────
  p14iSettingTitle: {
    uz: "Chuqur so'rash",
    "uz-cyrl": "Чуқур сўраш",
    ru: "Уточняющие вопросы",
    en: "Deep inquiry",
  },
  p14iSettingDesc: {
    uz: "Muhim mavzularda javobdan oldin aniqlashtiruvchi savol beradi",
    "uz-cyrl": "Муҳим мавзуларда жавобдан олдин аниқлаштирувчи савол беради",
    ru: "В важных темах задаёт уточняющие вопросы перед ответом",
    en: "Asks clarifying questions before answering on high-stakes topics",
  },
  p14iModeAuto: {
    uz: "Avto",
    "uz-cyrl": "Авто",
    ru: "Авто",
    en: "Auto",
  },
  p14iModeAlways: {
    uz: "Doim",
    "uz-cyrl": "Доим",
    ru: "Всегда",
    en: "Always",
  },
  p14iModeOff: {
    uz: "O'chiq",
    "uz-cyrl": "Ўчиқ",
    ru: "Выкл.",
    en: "Off",
  },
  p14iModeAutoAria: {
    uz: "Avto — faqat javob muhim faktga bog'liq bo'lsa so'raydi",
    "uz-cyrl": "Авто — фақат жавоб муҳим фактга боғлиқ бўлса сўрайди",
    ru: "Авто — спрашивает, только если ответ зависит от важного факта",
    en: "Auto — asks only when the answer depends on a key fact",
  },
  p14iModeAlwaysAria: {
    uz: "Doim — so'rov noaniq bo'lsa har doim so'raydi",
    "uz-cyrl": "Доим — сўров ноаниқ бўлса ҳар доим сўрайди",
    ru: "Всегда — спрашивает при любой неясности",
    en: "Always — asks whenever the request is unclear",
  },
  p14iModeOffAria: {
    uz: "O'chiq — savol bermaydi, taxminlar bilan javob beradi",
    "uz-cyrl": "Ўчиқ — савол бермайди, тахминлар билан жавоб беради",
    ru: "Выкл. — не спрашивает, отвечает с допущениями",
    en: "Off — never asks, answers with assumptions",
  },
  // ── Limit xatosi: "Cowork'da mahalliy model bilan davom eting" (PricingDialog) ──
  p14iLocalCtaTitle: {
    uz: "Limit tugadimi? Mahalliy model bilan davom eting",
    "uz-cyrl": "Лимит тугадими? Маҳаллий модел билан давом этинг",
    ru: "Лимит исчерпан? Продолжите с локальной моделью",
    en: "Out of quota? Continue with a local model",
  },
  p14iLocalCtaDesc: {
    uz: "Faqat Cowork va CLI (veb-chatda emas): SOVEREIGN Cowork va `sov` CLI kompyuteringizdagi Ollama modeli bilan ishlay oladi — so'rovlar kompyuteringizda bajariladi va tarif limitidan sarflanmaydi. Mahalliy modellar odatda bulutdagilardan zaifroq.",
    "uz-cyrl": "Фақат Cowork ва CLI (веб-чатда эмас): SOVEREIGN Cowork ва `sov` CLI компьютерингиздаги Ollama модели билан ишлай олади — сўровлар компьютерингизда бажарилади ва тариф лимитидан сарфланмайди. Маҳаллий моделлар одатда булутдагилардан заифроқ.",
    ru: "Только Cowork и CLI (не веб-чат): SOVEREIGN Cowork и CLI `sov` умеют работать с моделью Ollama на вашем компьютере — запросы выполняются локально и не расходуют лимит тарифа. Локальные модели обычно слабее облачных.",
    en: "Cowork and CLI only (not the web chat): SOVEREIGN Cowork and the `sov` CLI can run an Ollama model on your computer — requests are processed locally and don't use your plan quota. Local models are usually weaker than cloud ones.",
  },
  p14iLocalCtaBtn: {
    uz: "Cowork'ni yuklab olish",
    "uz-cyrl": "Cowork'ни юклаб олиш",
    ru: "Скачать Cowork",
    en: "Download Cowork",
  },
  p14iLocalCtaNewTab: {
    uz: "yangi oynada ochiladi",
    "uz-cyrl": "янги ойнада очилади",
    ru: "откроется в новой вкладке",
    en: "opens in a new tab",
  },
} satisfies Dict;
