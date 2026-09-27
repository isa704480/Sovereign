import type { Dict } from "@/lib/i18n";

/**
 * 17 — CLI / Cowork device-login: terib kiritiladigan kod (RFC 8628 user code, phishing'ga qarshi).
 * p17d* — /cli/connect tasdiqlash sahifasi va approveCliDevice xatolari, 4 tilda.
 */
export const P17D = {
  p17dTypeTitle: {
    uz: "Ilovangizdagi kodni kiriting",
    "uz-cyrl": "Иловангиздаги кодни киритинг",
    ru: "Введите код из вашего приложения",
    en: "Enter the code from your app",
  },
  p17dTypeDesc: {
    uz: "Terminalda (`sov login`) yoki SOVEREIGN Cowork'da ko'rsatilgan 8 belgili kodni kiriting.",
    "uz-cyrl": "Терминалда (`sov login`) ёки SOVEREIGN Cowork'да кўрсатилган 8 белгили кодни киритинг.",
    ru: "Введите 8-символьный код, который показан в терминале (`sov login`) или в SOVEREIGN Cowork.",
    en: "Type the 8-character code shown in your terminal (`sov login`) or in SOVEREIGN Cowork.",
  },
  p17dTypeDescLegacy: {
    uz: "Ilovaning eski versiyasi: SOVEREIGN Cowork'da ko'rsatilgan kodning birinchi 8 belgisini kiriting. Eski CLI kodni ko'rsatmaydi — u shu sahifa manzilida “code=” dan keyin turadi. Yaxshisi, ilovani yangilang.",
    "uz-cyrl": "Илованинг эски версияси: SOVEREIGN Cowork'да кўрсатилган коднинг биринчи 8 белгисини киритинг. Эски CLI кодни кўрсатмайди — у шу саҳифа манзилида “code=” дан кейин туради. Яхшиси, иловани янгиланг.",
    ru: "Старая версия приложения: введите первые 8 символов кода, показанного в SOVEREIGN Cowork. Старый CLI код не показывает — он есть в адресе этой страницы после “code=”. Лучше обновите приложение.",
    en: "Older app version: type the first 8 characters of the code shown in SOVEREIGN Cowork. The old CLI doesn't show a code — it's in this page's address after “code=”. Better: update the app.",
  },
  p17dUpdateHint: {
    uz: "CLI'ni yangilash: `npm i -g @islombekrrr/sov-cli`",
    "uz-cyrl": "CLI'ни янгилаш: `npm i -g @islombekrrr/sov-cli`",
    ru: "Обновить CLI: `npm i -g @islombekrrr/sov-cli`",
    en: "Update the CLI: `npm i -g @islombekrrr/sov-cli`",
  },
  p17dPlaceholder: { uz: "ABCD-1234", "uz-cyrl": "ABCD-1234", ru: "ABCD-1234", en: "ABCD-1234" },
  p17dPlaceholderLegacy: { uz: "8 ta belgi", "uz-cyrl": "8 та белги", ru: "8 символов", en: "8 characters" },
  p17dWarnTitle: {
    uz: "Faqat O'Z ekraningizda ko'rsatilgan kodni kiriting",
    "uz-cyrl": "Фақат ЎЗ экранингизда кўрсатилган кодни киритинг",
    ru: "Вводите только код, показанный на ВАШЕМ экране",
    en: "Only enter a code shown on YOUR screen",
  },
  p17dWarnBody: {
    uz: "Bu havolani yoki kodni sizga kimdir yuborgan bo'lsa (xabar, qo'ng'iroq, e-mail orqali) — «Bekor qilish»ni bosing. Kirishni boshlagan odam hisobingizga to'liq kirish huquqini oladi.",
    "uz-cyrl": "Бу ҳаволани ёки кодни сизга кимдир юборган бўлса (хабар, қўнғироқ, электрон почта орқали) — «Бекор қилиш»ни босинг. Киришни бошлаган одам ҳисобингизга тўлиқ кириш ҳуқуқини олади.",
    ru: "Если эту ссылку или код вам кто-то прислал (в сообщении, по телефону, по почте) — нажмите «Отмена». Тот, кто начал вход, получит полный доступ к вашему аккаунту.",
    en: "If someone sent you this link or told you a code (by message, phone or email), press Cancel. Whoever started this sign-in gets full access to your account.",
  },
  p17dValidUntil: {
    uz: "{time} gacha amal qiladi",
    "uz-cyrl": "{time} гача амал қилади",
    ru: "действует до {time}",
    en: "valid until {time}",
  },
  p17dIpApprox: { uz: "taxminiy IP {ip}", "uz-cyrl": "тахминий IP {ip}", ru: "примерный IP {ip}", en: "approx. IP {ip}" },
  p17dStartAgain: {
    uz: "Terminalda `sov login` ni qayta ishga tushiring yoki Cowork'da qayta kiring.",
    "uz-cyrl": "Терминалда `sov login` ни қайта ишга туширинг ёки Cowork'да қайта киринг.",
    ru: "Запустите `sov login` в терминале ещё раз или снова войдите в Cowork.",
    en: "Run `sov login` again in your terminal, or sign in again from Cowork.",
  },
  p17dLegacyDisabled: {
    uz: "Bu kirish havolasi ilovaning eski versiyasidan. SOVEREIGN CLI yoki Cowork'ni yangilab, qayta kiring.",
    "uz-cyrl": "Бу кириш ҳаволаси илованинг эски версиясидан. SOVEREIGN CLI ёки Cowork'ни янгилаб, қайта киринг.",
    ru: "Эта ссылка для входа — от устаревшей версии приложения. Обновите SOVEREIGN CLI или Cowork и войдите снова.",
    en: "This sign-in link comes from an outdated app version. Update SOVEREIGN CLI or Cowork and sign in again.",
  },
  p17dErrMalformed: {
    uz: "Kodni ilovadagidek to'liq kiriting (8 ta belgi).",
    "uz-cyrl": "Кодни иловадагидек тўлиқ киритинг (8 та белги).",
    ru: "Введите код полностью, как в приложении (8 символов).",
    en: "Enter the full code exactly as shown in your app (8 characters).",
  },
  p17dErrMismatch: {
    uz: "Kod mos kelmadi. Qolgan urinishlar: {n}.",
    "uz-cyrl": "Код мос келмади. Қолган уринишлар: {n}.",
    ru: "Код не совпадает. Осталось попыток: {n}.",
    en: "That code doesn't match. Attempts left: {n}.",
  },
  p17dErrLocked: {
    uz: "Juda ko'p noto'g'ri kod — xavfsizlik uchun bu kirish bekor qilindi. Ilovada kirishni qaytadan boshlang.",
    "uz-cyrl": "Жуда кўп нотўғри код — хавфсизлик учун бу кириш бекор қилинди. Иловада киришни қайтадан бошланг.",
    ru: "Слишком много неверных кодов — этот вход отменён в целях безопасности. Начните вход в приложении заново.",
    en: "Too many wrong codes — this sign-in was cancelled for your safety. Start the sign-in again in your app.",
  },
  p17dErrRateLimited: {
    uz: "Juda ko'p noto'g'ri urinish. 15 daqiqadan keyin qayta urinib ko'ring.",
    "uz-cyrl": "Жуда кўп нотўғри уриниш. 15 дақиқадан кейин қайта уриниб кўринг.",
    ru: "Слишком много неверных попыток. Повторите через 15 минут.",
    en: "Too many wrong attempts. Try again in 15 minutes.",
  },
  p17dErrUsed: {
    uz: "Bu kirish allaqachon boshqa hisob bilan tasdiqlangan.",
    "uz-cyrl": "Бу кириш аллақачон бошқа ҳисоб билан тасдиқланган.",
    ru: "Этот вход уже подтверждён другим аккаунтом.",
    en: "This sign-in was already approved by another account.",
  },
} satisfies Dict;
