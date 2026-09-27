import type { Dict } from "@/lib/i18n";

/** Mustaqil hakam (judge.ts) — tekshiruv har doim javobni yaratgan kompaniyadan boshqa kompaniya modeli bilan. */
export const P12J = {
  // VerifierPanel — kim tekshirdi
  p12JudgeLine: {
    uz: "Mustaqil tekshiruv: {judge} (javob: {answer})",
    "uz-cyrl": "Мустақил текширув: {judge} (жавоб: {answer})",
    ru: "Независимая проверка: {judge} (ответ: {answer})",
    en: "Independent check: {judge} (answer: {answer})",
  },
  p12JudgeLineNoAnswer: {
    uz: "Mustaqil tekshiruv: {judge}",
    "uz-cyrl": "Мустақил текширув: {judge}",
    ru: "Независимая проверка: {judge}",
    en: "Independent check: {judge}",
  },
  p12JudgeTitle: {
    uz: "Javobni boshqa kompaniyaning modeli tekshirdi — model yaratuvchisi o'zini tekshirmaydi. Hakam: {model}",
    "uz-cyrl": "Жавобни бошқа компаниянинг модели текширди — модел яратувчиси ўзини текширмайди. Ҳакам: {model}",
    ru: "Ответ проверила модель другой компании — разработчик модели не проверяет сам себя. Судья: {model}",
    en: "A model from a different company checked this answer — a model's maker never audits itself. Judge: {model}",
  },
  // Hujjatlar (Docs) — funksiyalar bo'limi
  p12DocsVerifyTitle: {
    uz: "Mustaqil tekshiruv",
    "uz-cyrl": "Мустақил текширув",
    ru: "Независимая проверка",
    en: "Independent verification",
  },
  p12DocsVerifyBody: {
    uz: "Model yaratuvchisi o'zini tekshira olmaydi. Shuning uchun SOVEREIGN javobdagi faktlarni, \"bajardim\" da'volarini va CLI/Cowork jurnalini **har doim javobni yaratgan kompaniyadan boshqa kompaniyaning modeli** bilan tekshiradi: GPT javobini Qwen yoki GLM, Qwen javobini gpt-oss yoki GLM tekshiradi va hokazo. Hakam mintaqa qoidalariga ham bo'ysunadi. Kim tekshirgani javob ostidagi fakt-tekshiruv panelida va CLI jurnalida ko'rsatiladi.",
    "uz-cyrl": "Модель яратувчиси ўзини текшира олмайди. Шунинг учун SOVEREIGN жавобдаги фактларни, \"бажардим\" даъволарини ва CLI/Cowork журналини **ҳар доим жавобни яратган компаниядан бошқа компаниянинг модели** билан текширади: GPT жавобини Qwen ёки GLM, Qwen жавобини GPT-OSS ёки GLM текширади ва ҳоказо. Ҳакам минтақа қоидаларига ҳам бўйсунади. Ким текширгани жавоб остидаги факт-текширув панелида ва CLI журналида кўрсатилади.",
    ru: "Разработчик модели не может проверять сам себя. Поэтому SOVEREIGN проверяет факты в ответе, заявления «я сделал» и журнал CLI/Cowork **всегда моделью другой компании, чем та, что создала ответ**: ответ GPT проверяет Qwen или GLM, ответ Qwen — gpt-oss или GLM и так далее. Судья также соблюдает региональные правила. Кто проверил, видно в панели проверки фактов под ответом и в журнале CLI.",
    en: "A model's maker can't audit itself. So SOVEREIGN checks the facts in an answer, \"I did it\" claims and the CLI/Cowork ledger **always with a model from a different company than the one that produced the answer**: a GPT answer is checked by Qwen or GLM, a Qwen answer by gpt-oss or GLM, and so on. The judge also follows regional rules. Who checked is shown in the fact-check panel under the answer and in the CLI ledger.",
  },
  // Hakam kompaniyasi aniqlanmadi (yorliq)
  p12VendorUnknown: {
    uz: "noma'lum",
    "uz-cyrl": "номаълум",
    ru: "неизвестно",
    en: "unknown",
  },
} satisfies Dict;
