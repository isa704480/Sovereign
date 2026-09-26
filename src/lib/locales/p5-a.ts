import type { Dict } from "@/lib/i18n";

/** 5-bosqich (A guruhi) tarjimalari (uz / uz-cyrl / ru / en). Yangiliklar, maslahatlar, tip emaillari. */
export const P5A = {
  // "Nima yangi" kartasi (WhatsNew)
  wnTitle: { uz: "Nima yangi", "uz-cyrl": "Нима янги", ru: "Что нового", en: "What's new" },
  wnSeeAll: { uz: "Barcha yangiliklar", "uz-cyrl": "Барча янгиликлар", ru: "Все обновления", en: "All updates" },
  wnGotIt: { uz: "Tushunarli", "uz-cyrl": "Тушунарли", ru: "Понятно", en: "Got it" },
  wnTagNew: { uz: "Yangi", "uz-cyrl": "Янги", ru: "Новое", en: "New" },
  wnTagImproved: { uz: "Yaxshilandi", "uz-cyrl": "Яхшиланди", ru: "Улучшено", en: "Improved" },
  wnTagFixed: { uz: "Tuzatildi", "uz-cyrl": "Тузатилди", ru: "Исправлено", en: "Fixed" },

  // Maslahat kartasi (TipCard)
  tipEyebrow: { uz: "Maslahat", "uz-cyrl": "Маслаҳат", ru: "Совет", en: "Tip" },
  tipTry: { uz: "Sinab ko'rish", "uz-cyrl": "Синаб кўриш", ru: "Попробовать", en: "Try it" },
  tipCopy: { uz: "Buyruqni nusxalash", "uz-cyrl": "Буйруқни нусхалаш", ru: "Скопировать команду", en: "Copy command" },
  tipBlindOn: { uz: "Maxfiy rejim yoqildi", "uz-cyrl": "Махфий режим ёқилди", ru: "Приватный режим включён", en: "Private mode is on" },
  tipDismiss: { uz: "Maslahatni yopish", "uz-cyrl": "Маслаҳатни ёпиш", ru: "Скрыть совет", en: "Dismiss tip" },

  // Sozlamalar — tip emaillari
  stEmailTipsTitle: {
    uz: "Maslahat va yangiliklarni emailga yuborish",
    "uz-cyrl": "Маслаҳат ва янгиликларни emailга юбориш",
    ru: "Присылать советы и новости на email",
    en: "Email me tips & updates",
  },
  stEmailTipsDesc: {
    uz: "Faqat 30 soatdan ko'p kirmasangiz, ko'pi bilan 30 soatda bir marta. Istalgan payt o'chirasiz.",
    "uz-cyrl": "Фақат 30 соатдан кўп кирмасангиз, кўпи билан 30 соатда бир марта. Исталган пайт ўчирасиз.",
    ru: "Только если вы не заходили больше 30 часов, не чаще раза в 30 часов. Отключается в любой момент.",
    en: "Only when you've been away 30+ hours, at most once every 30 hours. Turn off anytime.",
  },

  // /updates sahifasi
  updEyebrow: { uz: "Yangiliklar", "uz-cyrl": "Янгиликлар", ru: "Обновления", en: "Changelog" },
  updTitle: { uz: "Mahsulot yangiliklari", "uz-cyrl": "Маҳсулот янгиликлари", ru: "Обновления продукта", en: "Product updates" },
  updLead: {
    uz: "SOVEREIGN'da nima o'zgargani — yangi imkoniyatlar, yaxshilanishlar va tuzatishlar.",
    "uz-cyrl": "SOVEREIGN'да нима ўзгаргани — янги имкониятлар, яхшиланишлар ва тузатишлар.",
    ru: "Что изменилось в SOVEREIGN — новые возможности, улучшения и исправления.",
    en: "What changed in SOVEREIGN — new features, improvements and fixes.",
  },
  updOpenApp: { uz: "Ilovani ochish", "uz-cyrl": "Иловани очиш", ru: "Открыть приложение", en: "Open the app" },
  p5aFooterUpdates: { uz: "Yangiliklar", "uz-cyrl": "Янгиликлар", ru: "Обновления", en: "Updates" },
  p5aPayNote: {
    uz: "Karta — Dodo Payments orqali: Visa, Mastercard, American Express, Discover, JCB, UnionPay, Apple Pay va Google Pay; oylik/yillik obuna. Humo va Uzcard hozircha qabul qilinmaydi — xalqaro to'lovga yoqilgan Visa/Mastercard kerak. Kripto va СБП — RollyPay orqali, bir martalik to'lov.",
    "uz-cyrl": "Карта — Dodo Payments орқали: Visa, Mastercard, American Express, Discover, JCB, UnionPay, Apple Pay ва Google Pay; ойлик/йиллик обуна. Humo ва Uzcard ҳозирча қабул қилинмайди — халқаро тўловга ёқилган Visa/Mastercard керак. Крипто ва СБП — RollyPay орқали, бир марталик тўлов.",
    ru: "Карта — через Dodo Payments: Visa, Mastercard, American Express, Discover, JCB, UnionPay, Apple Pay и Google Pay; подписка на месяц/год. Humo и Uzcard пока не принимаются — нужна Visa/Mastercard с включёнными международными платежами. Крипта и СБП — через RollyPay, разовый платёж.",
    en: "Card — via Dodo Payments: Visa, Mastercard, American Express, Discover, JCB, UnionPay, Apple Pay and Google Pay; monthly/yearly subscription. Humo and Uzcard aren't supported yet — use a Visa/Mastercard enabled for international payments. Crypto and SBP — via RollyPay, one-time payment.",
  },
} satisfies Dict;
