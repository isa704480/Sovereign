import type { Dict } from "@/lib/i18n";

/** 4-bosqich (B guruhi) tarjimalari (uz / uz-cyrl / ru / en). */
export const P4B = {
  // ── Obuna muddati banneri (PlanStatusBanner) ──
  subEndsToday: {
    uz: "{plan} tarifingiz bugun tugaydi",
    "uz-cyrl": "{plan} тарифингиз бугун тугайди",
    ru: "Ваш тариф {plan} заканчивается сегодня",
    en: "Your {plan} plan ends today",
  },
  subEndsTomorrow: {
    uz: "{plan} tarifingiz ertaga tugaydi",
    "uz-cyrl": "{plan} тарифингиз эртага тугайди",
    ru: "Ваш тариф {plan} заканчивается завтра",
    en: "Your {plan} plan ends tomorrow",
  },
  subEndsInDays: {
    uz: "{plan} tarifingiz {n} kundan keyin tugaydi ({date})",
    "uz-cyrl": "{plan} тарифингиз {n} кундан кейин тугайди ({date})",
    ru: "Ваш тариф {plan} закончится через {n} дн. ({date})",
    en: "Your {plan} plan ends in {n} days ({date})",
  },
  subEndsDesc: {
    uz: "Bu bir martalik to'lov — avtomatik yangilanmaydi. Uzaytirmasangiz, Free tarifga o'tasiz.",
    "uz-cyrl": "Бу бир марталик тўлов — автоматик янгиланмайди. Узайтирмасангиз, Free тарифга ўтасиз.",
    ru: "Это разовая оплата — она не продлится автоматически. Без продления вы перейдёте на Free.",
    en: "This was a one-time payment and won't renew automatically. If you don't extend it, you'll move to Free.",
  },
  subEndedTitle: {
    uz: "{plan} tarifingiz muddati tugadi",
    "uz-cyrl": "{plan} тарифингиз муддати тугади",
    ru: "Срок тарифа {plan} истёк",
    en: "Your {plan} plan has ended",
  },
  subEndedDesc: {
    uz: "Endi Free tarifdasiz. {plan} imkoniyatlarini qaytarish uchun istalgan vaqt yangilang.",
    "uz-cyrl": "Энди Free тарифдасиз. {plan} имкониятларини қайтариш учун исталган вақт янгиланг.",
    ru: "Теперь у вас тариф Free. Продлите в любой момент, чтобы вернуть возможности {plan}.",
    en: "You're now on the Free plan. Renew anytime to get {plan} features back.",
  },
  subRenewsOn: {
    uz: "{plan} obunangiz {date} kuni avtomatik yangilanadi",
    "uz-cyrl": "{plan} обунангиз {date} куни автоматик янгиланади",
    ru: "Подписка {plan} продлится автоматически {date}",
    en: "Your {plan} subscription renews on {date}",
  },
  subRenewsDesc: {
    uz: "To'lov kartangizdan avtomatik yechiladi — hech narsa qilish shart emas.",
    "uz-cyrl": "Тўлов картангиздан автоматик ечилади — ҳеч нарса қилиш шарт эмас.",
    ru: "Оплата спишется с карты автоматически — ничего делать не нужно.",
    en: "Your card will be charged automatically — nothing to do.",
  },
  subExtend: { uz: "Uzaytirish", "uz-cyrl": "Узайтириш", ru: "Продлить", en: "Extend" },
  subRenew: { uz: "Yangilash", "uz-cyrl": "Янгилаш", ru: "Возобновить", en: "Renew" },
  subHideToday: {
    uz: "Bugunga yashirish",
    "uz-cyrl": "Бугунга яшириш",
    ru: "Скрыть на сегодня",
    en: "Hide for today",
  },
} satisfies Dict;
