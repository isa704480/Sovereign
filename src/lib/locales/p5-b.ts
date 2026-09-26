import type { Dict } from "@/lib/i18n";

/** 5-bosqich (B guruhi) tarjimalari (uz / uz-cyrl / ru / en). */
export const P5B = {
  // Javobdan keyingi tekshiruv: tasdiqlanmagan amal da'volari (ClaimsWarning)
  clmTitle: {
    uz: "Tasdiqlanmagan amal",
    "uz-cyrl": "Тасдиқланмаган амал",
    ru: "Неподтверждённое действие",
    en: "Unconfirmed action",
  },
  clmIntro: {
    uz: "Javobda yordamchi quyidagini bajarganini aytmoqda, lekin tizim jurnalida bunday bajarilgan amal yo'q:",
    "uz-cyrl": "Жавобда ёрдамчи қуйидагини бажарганини айтмоқда, лекин тизим журналида бундай бажарилган амал йўқ:",
    ru: "Ассистент утверждает, что сделал это, но в системном журнале такого выполненного действия нет:",
    en: "The assistant says it did this, but no such action was performed according to the system log:",
  },
  clmReasonNoCalls: {
    uz: "bu so'rovda hech qanday ulangan servis chaqirilmadi",
    "uz-cyrl": "бу сўровда ҳеч қандай уланган сервис чақирилмади",
    ru: "в этом запросе не вызывался ни один подключённый сервис",
    en: "no connected service was called for this request",
  },
  clmReasonFailed: {
    uz: "servis chaqiruvi xato bilan tugadi",
    "uz-cyrl": "сервис чақируви хато билан тугади",
    ru: "вызов сервиса завершился ошибкой",
    en: "the service call failed",
  },
  clmReasonPartial: {
    uz: "amal faqat qisman bajarildi",
    "uz-cyrl": "амал фақат қисман бажарилди",
    ru: "действие выполнено лишь частично",
    en: "the action was only partially completed",
  },
  clmReasonNotPerformed: {
    uz: "bunday amal bajarilmagan",
    "uz-cyrl": "бундай амал бажарилмаган",
    ru: "такое действие не выполнялось",
    en: "no such action was performed",
  },
  // Research: manbasiz [n] belgilari
  clmUnsourcedTitle: {
    uz: "Manbasiz iqtibos belgilari",
    "uz-cyrl": "Манбасиз иқтибос белгилари",
    ru: "Ссылки без источника",
    en: "Unsourced citation markers",
  },
  clmUnsourcedBody: {
    uz: "{list} — qidiruv qaytargan manbalar ro'yxatida bunday raqam yo'q. Bu da'volarni manbali deb hisoblamang.",
    "uz-cyrl": "{list} — қидирув қайтарган манбалар рўйхатида бундай рақам йўқ. Бу даъволарни манбали деб ҳисобламанг.",
    ru: "{list} — в списке источников, найденных поиском, нет таких номеров. Не считайте эти утверждения подтверждёнными.",
    en: "{list} — no source with this number was returned by the search. Don't treat these claims as sourced.",
  },
  clmUnsourcedMark: {
    uz: "manbasiz: bu raqamga mos manba yo'q",
    "uz-cyrl": "манбасиз: бу рақамга мос манба йўқ",
    ru: "без источника: нет источника с этим номером",
    en: "unsourced: no source has this number",
  },
  // VerifierPanel — research, lekin qidiruv faqat sarlavha/URL qaytargan
  vfBasisAttribution: {
    uz: "Manbalarning faqat sarlavha va havolasi bor edi: mazmun emas, faqat iqtibos mosligi baholandi.",
    "uz-cyrl": "Манбаларнинг фақат сарлавҳа ва ҳаволаси бор эди: мазмун эмас, фақат иқтибос мослиги баҳоланди.",
    ru: "Были доступны только заголовки и ссылки источников: оценено лишь соответствие ссылок, а не содержание.",
    en: "Only source titles and links were available: citation attribution was checked, not the content.",
  },
} satisfies Dict;
