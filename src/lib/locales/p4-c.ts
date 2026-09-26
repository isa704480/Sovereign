import type { Dict } from "@/lib/i18n";

/** 4-bosqich (C guruhi) tarjimalari (uz / uz-cyrl / ru / en). */
export const P4C = {
  // VerifierPanel — baho nimaga asoslangani (halollik uchun)
  vfBasisSources: {
    uz: "Da'volar javob tayangan manbalarga (sahifa, hujjat, servis natijasi) solishtirildi.",
    "uz-cyrl": "Даъволар жавоб таянган манбаларга (саҳифа, ҳужжат, сервис натижаси) солиштирилди.",
    ru: "Утверждения сверены с источниками, на которые опирался ответ (страница, документ, результат сервиса).",
    en: "Claims were compared with the sources the answer used (page, document, service result).",
  },
  vfBasisModel: {
    uz: "Manba yo'q: bu boshqa AI modelining bahosi, kafolatlangan tekshiruv emas.",
    "uz-cyrl": "Манба йўқ: бу бошқа AI моделининг баҳоси, кафолатланган текширув эмас.",
    ru: "Без источников: это оценка другой ИИ-модели, а не гарантированная проверка.",
    en: "No sources: this is another AI model's opinion, not a guaranteed check.",
  },
  vfUnconfirmed: { uz: "tasdiqlanmadi", "uz-cyrl": "тасдиқланмади", ru: "не подтверждено", en: "unconfirmed" },
} satisfies Dict;
