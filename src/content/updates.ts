import type { L10n } from "@/lib/i18n";

/**
 * Mahsulot yangiliklari (changelog) — yagona manba.
 * /updates sahifasi, ilovadagi "Nima yangi" kartasi va tip emaillari shu ro'yxatdan o'qiydi.
 *
 * Qoidalar:
 *  - Eng yangisi BIRINCHI. Yangi yozuv ro'yxat boshiga qo'shiladi.
 *  - `id` o'zgarmaydi (foydalanuvchining "oxirgi ko'rgan" belgisi shunga bog'langan).
 *  - Faqat haqiqatan chiqarilgan narsa yoziladi (git log). Hali yoqilmagan imkoniyat —
 *    "yoqilganda" deb aniq aytiladi.
 */

export type UpdateTag = "new" | "improved" | "fixed";

export interface ProductUpdate {
  id: string;
  /** ISO sana (YYYY-MM-DD). */
  date: string;
  tag: UpdateTag;
  title: L10n;
  body: L10n;
}

export const UPDATES: readonly ProductUpdate[] = [
  {
    id: "2026-09-26-plan-reminders",
    date: "2026-09-26",
    tag: "new",
    title: {
      uz: "Tarif muddati haqida oldindan eslatma",
      "uz-cyrl": "Тариф муддати ҳақида олдиндан эслатма",
      ru: "Напоминание об окончании тарифа",
      en: "Plan expiry reminders",
    },
    body: {
      uz: "Bir martalik to'lovda tarif tugashiga 7, 3 va 1 kun qolganda ogohlantirish va \"Uzaytirish\" tugmasi chiqadi. Karta obunasida esa \"yangilanadi\" deb ko'rsatiladi — yolg'on ogohlantirish yo'q.",
      "uz-cyrl": "Бир марталик тўловда тариф тугашига 7, 3 ва 1 кун қолганда огоҳлантириш ва \"Узайтириш\" тугмаси чиқади. Карта обунасида эса \"янгиланади\" деб кўрсатилади — ёлғон огоҳлантириш йўқ.",
      ru: "При разовой оплате за 7, 3 и 1 день до окончания тарифа появится предупреждение и кнопка «Продлить». Для подписки по карте показываем «продлится автоматически» — без ложных тревог.",
      en: "With a one-time payment you now get a heads-up 7, 3 and 1 day before your plan ends, with a Renew button. Card subscriptions simply show that they renew — no false alarms.",
    },
  },
  {
    id: "2026-09-26-honesty-log",
    date: "2026-09-26",
    tag: "new",
    title: {
      uz: "CLI va desktop: \"Aslida nima bo'ldi\" jurnali",
      "uz-cyrl": "CLI ва desktop: \"Аслида нима бўлди\" журнали",
      ru: "CLI и десктоп: журнал «Что произошло на самом деле»",
      en: "CLI & desktop: \"What actually happened\" log",
    },
    body: {
      uz: "Har bir amalning haqiqiy holati — bajarildi, xato yoki rad etildi — sizga ham, modelga ham ko'rsatiladi. AI tasdiqlanmagan ishni \"qildim\" desa, ogohlantirish chiqadi.",
      "uz-cyrl": "Ҳар бир амалнинг ҳақиқий ҳолати — бажарилди, хато ёки рад этилди — сизга ҳам, моделга ҳам кўрсатилади. AI тасдиқланмаган ишни \"қилдим\" деса, огоҳлантириш чиқади.",
      ru: "Реальный статус каждого действия — выполнено, ошибка или отклонено — видите и вы, и модель. Если ИИ заявит о неподтверждённом действии, появится предупреждение.",
      en: "Every action now reports its real status — done, failed or declined — to both you and the model. If the AI claims something that didn't actually happen, you get a warning.",
    },
  },
  {
    id: "2026-09-26-image-quality",
    date: "2026-09-26",
    tag: "improved",
    title: {
      uz: "Sifatliroq rasmlar va to'g'ri nisbat",
      "uz-cyrl": "Сифатлироқ расмлар ва тўғри нисбат",
      ru: "Изображения лучше и в нужном формате",
      en: "Better images in the right shape",
    },
    body: {
      uz: "Rasm so'rovi kompozitsiya, yorug'lik va uslub bilan boyitiladi. Nisbat avtomatik aniqlanadi: kvadrat, keng (1344×768) yoki tik (768×1344).",
      "uz-cyrl": "Расм сўрови композиция, ёруғлик ва услуб билан бойитилади. Нисбат автоматик аниқланади: квадрат, кенг (1344×768) ёки тик (768×1344).",
      ru: "Запрос на картинку дополняется композицией, светом и стилем. Формат определяется автоматически: квадрат, широкий (1344×768) или вертикальный (768×1344).",
      en: "Image prompts are enriched with composition, lighting and style, and the aspect ratio is picked for you: square, wide (1344×768) or tall (768×1344).",
    },
  },
  {
    id: "2026-09-26-video",
    date: "2026-09-26",
    tag: "new",
    title: {
      uz: "Video yaratish (tez orada)",
      "uz-cyrl": "Видео яратиш (тез орада)",
      ru: "Создание видео (скоро)",
      en: "Video generation (rolling out)",
    },
    body: {
      uz: "Matndan ~5 soniyalik qisqa video. Serverda yoqilganda \"+\" → \"Video yaratish\" faollashadi; kunlik limit tarifga bog'liq. Yoqilmaguncha menyuda \"Tez orada\" deb turadi.",
      "uz-cyrl": "Матндан ~5 сониялик қисқа видео. Серверда ёқилганда \"+\" → \"Видео яратиш\" фаоллашади; кунлик лимит тарифга боғлиқ. Ёқилмагунча менюда \"Тез орада\" деб туради.",
      ru: "Короткие ролики (~5 с) из текста. Когда функция включена на сервере, в «+» появится «Создать видео»; дневной лимит зависит от тарифа. До этого пункт помечен «Скоро».",
      en: "Short ~5-second clips from a text prompt. When it's enabled on our side, \"+\" → Create video lights up, with a daily limit per plan. Until then the menu shows it as coming soon.",
    },
  },
  {
    id: "2026-09-26-docs-status",
    date: "2026-09-26",
    tag: "new",
    title: {
      uz: "Hujjatlar va xizmat holati sahifalari",
      "uz-cyrl": "Ҳужжатлар ва хизмат ҳолати саҳифалари",
      ru: "Документация и страница статуса",
      en: "Docs and a live status page",
    },
    body: {
      uz: "Tariflar, CLI, desktop, to'lovlar va savol-javoblar bir joyda (/docs). Xizmat ishlayaptimi — /status sahifasida. Sayt endi soveregn.xyz manzilida; eski havolalar yo'naltiriladi.",
      "uz-cyrl": "Тарифлар, CLI, desktop, тўловлар ва савол-жавоблар бир жойда (/docs). Хизмат ишлаяптими — /status саҳифасида. Сайт энди soveregn.xyz манзилида; эски ҳаволалар йўналтирилади.",
      ru: "Тарифы, CLI, десктоп, оплата и FAQ — в одном месте (/docs). Работает ли сервис — на странице /status. Сайт переехал на soveregn.xyz, старые ссылки перенаправляются.",
      en: "Plans, CLI, desktop app, payments and FAQ in one place (/docs), plus a live service health page (/status). The site now lives at soveregn.xyz — old links redirect.",
    },
  },
  {
    id: "2026-09-26-privacy-stability",
    date: "2026-09-26",
    tag: "fixed",
    title: {
      uz: "Maxfiylik va barqarorlik tuzatishlari",
      "uz-cyrl": "Махфийлик ва барқарорлик тузатишлари",
      ru: "Исправления приватности и стабильности",
      en: "Privacy and stability fixes",
    },
    body: {
      uz: "Blind Prompting endi to'liq ism-familiyani (kirillda ham), biriktirilgan fayl matnini va rasm so'rovini ham maskalaydi. Parolni tiklash oxirigacha ishlaydi, uzilgan javobni qayta urinish mumkin, xatolar tushunarli tilda.",
      "uz-cyrl": "Blind Prompting энди тўлиқ исм-фамилияни (кириллда ҳам), бириктирилган файл матнини ва расм сўровини ҳам маскалайди. Паролни тиклаш охиригача ишлайди, узилган жавобни қайта уриниш мумкин, хатолар тушунарли тилда.",
      ru: "Blind Prompting теперь маскирует полные имена (и на кириллице), текст прикреплённых файлов и запросы на изображения. Сброс пароля работает до конца, прерванный ответ можно повторить, ошибки — понятным языком.",
      en: "Blind Prompting now also masks full names (Cyrillic too), attached file text and image prompts. Password reset works end to end, interrupted answers can be retried, and errors are explained in plain language.",
    },
  },
  {
    id: "2026-09-25-image-generation",
    date: "2026-09-25",
    tag: "new",
    title: {
      uz: "Rasm yaratish",
      "uz-cyrl": "Расм яратиш",
      ru: "Создание изображений",
      en: "Image generation",
    },
    body: {
      uz: "\"+\" → \"Rasm yaratish\" ni tanlang yoki shunchaki \"… rasmini chizib ber\" deb yozing — rasm chatning o'zida paydo bo'ladi.",
      "uz-cyrl": "\"+\" → \"Расм яратиш\" ни танланг ёки шунчаки \"… расмини чизиб бер\" деб ёзинг — расм чатнинг ўзида пайдо бўлади.",
      ru: "Выберите «+» → «Создать изображение» или просто напишите «нарисуй …» — картинка появится прямо в чате.",
      en: "Pick \"+\" → Create image, or just type \"draw …\" — the picture appears right in the chat.",
    },
  },
  {
    id: "2026-09-25-feedback-cli-card",
    date: "2026-09-25",
    tag: "new",
    title: {
      uz: "Fikr bildirish va CLI o'rnatish kartasi",
      "uz-cyrl": "Фикр билдириш ва CLI ўрнатиш картаси",
      ru: "Обратная связь и карточка установки CLI",
      en: "Feedback button and CLI install card",
    },
    body: {
      uz: "Taklif, xato yoki shikoyatni to'g'ridan-to'g'ri ilovadan yuboring. Bosh ekrandagi karta CLI'ni PowerShell, CMD, macOS yoki Linux'da bitta buyruq bilan o'rnatishni ko'rsatadi.",
      "uz-cyrl": "Таклиф, хато ёки шикоятни тўғридан-тўғри иловадан юборинг. Бош экрандаги карта CLI'ни PowerShell, CMD, macOS ёки Linux'да битта буйруқ билан ўрнатишни кўрсатади.",
      ru: "Отправляйте предложения, баги и жалобы прямо из приложения. Карточка на главном экране показывает установку CLI одной командой для PowerShell, CMD, macOS и Linux.",
      en: "Send a suggestion, bug or complaint straight from the app. A card on the home screen shows the one-line CLI install for PowerShell, CMD, macOS and Linux.",
    },
  },
  {
    id: "2026-09-25-payments",
    date: "2026-09-25",
    tag: "new",
    title: {
      uz: "Kripto va СБП orqali to'lov",
      "uz-cyrl": "Крипто ва СБП орқали тўлов",
      ru: "Оплата криптовалютой и через СБП",
      en: "Pay with crypto or СБП",
    },
    body: {
      uz: "Karta (obuna)dan tashqari endi kripto va Rossiya uchun СБП/МИР orqali ham to'lash mumkin. Promokodlar barcha usullarda ishlaydi.",
      "uz-cyrl": "Карта (обуна)дан ташқари энди крипто ва Россия учун СБП/МИР орқали ҳам тўлаш мумкин. Промокодлар барча усулларда ишлайди.",
      ru: "Помимо карты (подписка) теперь можно платить криптовалютой, а в России — через СБП или картой МИР. Промокоды работают во всех способах.",
      en: "Besides card subscriptions you can now pay with crypto, or via СБП / МИР in Russia. Promo codes work with every method.",
    },
  },
  {
    id: "2026-09-24-voice",
    date: "2026-09-24",
    tag: "improved",
    title: {
      uz: "Tezroq ovozli kiritish",
      "uz-cyrl": "Тезроқ овозли киритиш",
      ru: "Быстрый голосовой ввод",
      en: "Faster voice input",
    },
    body: {
      uz: "Ovozni matnga aylantirish ~2 soniyada va interfeys tilingizda ishlaydi.",
      "uz-cyrl": "Овозни матнга айлантириш ~2 сонияда ва интерфейс тилингизда ишлайди.",
      ru: "Распознавание речи занимает ~2 секунды и работает на языке интерфейса.",
      en: "Speech-to-text now takes about 2 seconds and follows your interface language.",
    },
  },
  {
    id: "2026-09-23-yearly",
    date: "2026-09-23",
    tag: "new",
    title: {
      uz: "Yillik tariflar — 2 oy bepul",
      "uz-cyrl": "Йиллик тарифлар — 2 ой бепул",
      ru: "Годовые тарифы — 2 месяца бесплатно",
      en: "Yearly plans — 2 months free",
    },
    body: {
      uz: "Narxlar oynasida Oylik/Yillik almashtirgich: yiliga bir marta to'lab, 2 oyni tejaysiz.",
      "uz-cyrl": "Нархлар ойнасида Ойлик/Йиллик алмаштиргич: йилига бир марта тўлаб, 2 ойни тежайсиз.",
      ru: "В окне тарифов появился переключатель Месяц/Год: платите раз в год и экономите 2 месяца.",
      en: "A Monthly/Yearly switch in the pricing dialog: pay once a year and save two months.",
    },
  },
  {
    id: "2026-09-23-four-languages",
    date: "2026-09-23",
    tag: "new",
    title: {
      uz: "To'liq 4 tilda",
      "uz-cyrl": "Тўлиқ 4 тилда",
      ru: "Полностью на 4 языках",
      en: "Fully in 4 languages",
    },
    body: {
      uz: "Sayt, chat va panellar o'zbek (lotin va kirill), rus va ingliz tillarida. Tilni Sozlamalar'dan almashtiring — AI ham shu tilda javob beradi.",
      "uz-cyrl": "Сайт, чат ва панеллар ўзбек (лотин ва кирилл), рус ва инглиз тилларида. Тилни Созламалар'дан алмаштиринг — AI ҳам шу тилда жавоб беради.",
      ru: "Сайт, чат и панели — на узбекском (латиница и кириллица), русском и английском. Смените язык в Настройках — ИИ тоже ответит на нём.",
      en: "The site, chat and panels are available in Uzbek (Latin and Cyrillic), Russian and English. Switch in Settings — the AI answers in that language too.",
    },
  },
  {
    id: "2026-09-23-auto-router",
    date: "2026-09-23",
    tag: "improved",
    title: {
      uz: "SOVEREIGN Auto aqlliroq",
      "uz-cyrl": "SOVEREIGN Auto ақллироқ",
      ru: "SOVEREIGN Auto стал умнее",
      en: "Smarter SOVEREIGN Auto",
    },
    body: {
      uz: "Auto savol turiga (kod, ijod, matematika, umumiy) va tarifingizga qarab sinovdan o'tgan modellardan birini tanlaydi; biri band bo'lsa keyingisiga o'tadi.",
      "uz-cyrl": "Auto савол турига (код, ижод, математика, умумий) ва тарифингизга қараб синовдан ўтган моделлардан бирини танлайди; бири банд бўлса кейингисига ўтади.",
      ru: "Auto выбирает проверенную модель под тип задачи (код, творчество, математика, общее) и ваш тариф; если одна занята — переключается на следующую.",
      en: "Auto picks a tested model for the kind of task (code, creative, math, general) and your plan, and falls back to the next one if a model is busy.",
    },
  },
  {
    id: "2026-09-22-public-apis",
    date: "2026-09-22",
    tag: "new",
    title: {
      uz: "Ommaviy API'lar connectori",
      "uz-cyrl": "Оммавий API'лар коннектори",
      ru: "Коннектор «Открытые API»",
      en: "Public APIs connector",
    },
    body: {
      uz: "Kalitsiz real ma'lumot: ob-havo, valyuta kursi (UZS ham), kripto, vaqt va lug'at. Connectorlar panelida yoqing.",
      "uz-cyrl": "Калитсиз реал маълумот: об-ҳаво, валюта курси (UZS ҳам), крипто, вақт ва луғат. Коннекторлар панелида ёқинг.",
      ru: "Реальные данные без ключей: погода, курсы валют (и UZS), крипта, время и словарь. Включите в панели коннекторов.",
      en: "Live data with no API keys: weather, exchange rates (UZS included), crypto, time and dictionary. Turn it on in the Connectors panel.",
    },
  },
];

/** Eng yangi yozuv id'si (bo'sh ro'yxatda null). */
export const LATEST_UPDATE_ID: string | null = UPDATES[0]?.id ?? null;

/** "Nima yangi" oxirgi ko'rilgan yozuv — localStorage kaliti. */
export const UPDATES_SEEN_KEY = "sov-updates-seen";

/** Kartada ko'rsatiladigan eng ko'p yozuv soni. */
export const WHATS_NEW_MAX = 3;

/**
 * `lastSeenId` dan keyingi (yangiroq) yozuvlar. Hech narsa ko'rilmagan yoki id noma'lum
 * bo'lsa — eng yangi `max` ta.
 */
export function unseenUpdates(lastSeenId: string | null, max = WHATS_NEW_MAX): ProductUpdate[] {
  const idx = lastSeenId ? UPDATES.findIndex((u) => u.id === lastSeenId) : -1;
  const fresh = idx === -1 ? UPDATES : UPDATES.slice(0, idx);
  return fresh.slice(0, max);
}

/** Brauzerda oxirgi ko'rilgan id (localStorage yopiq bo'lsa null). */
export function readSeenUpdate(): string | null {
  try {
    return localStorage.getItem(UPDATES_SEEN_KEY);
  } catch {
    return null;
  }
}

/** Hozir ko'rsatiladigan yangilik bormi — TipCard shu paytda chiqmaydi (ikkita karta ustma-ust bo'lmasin). */
export function hasUnseenUpdates(): boolean {
  return LATEST_UPDATE_ID !== null && readSeenUpdate() !== LATEST_UPDATE_ID;
}
