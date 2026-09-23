import type { Lang } from "@/lib/i18n";

/**
 * Huquqiy sahifalar (/terms, /privacy, /refund) matni — 4 tilda.
 * Ichki belgilash: **qalin** va [matn](havola) — LegalDoc shularni render qiladi.
 */

export type LegalDocId = "terms" | "privacy" | "refund";

export interface LegalSection {
  h: string;
  body?: string;
  list?: string[];
}

export interface LegalContent {
  title: string;
  metaDescription: string;
  sections: LegalSection[];
  note?: string;
}

export const LEGAL_UPDATED = "2026-09-22";
export const LEGAL_EMAIL = "isa704480@gmail.com";

const MAIL = `[${LEGAL_EMAIL}](mailto:${LEGAL_EMAIL})`;
const SITE = "[sovhq.vercel.app](https://sovhq.vercel.app)";

export const LEGAL_LABELS: Record<Lang, { eyebrow: string; updated: string }> = {
  uz: { eyebrow: "Huquqiy", updated: "Oxirgi yangilanish" },
  "uz-cyrl": { eyebrow: "Ҳуқуқий", updated: "Охирги янгиланиш" },
  ru: { eyebrow: "Правовая информация", updated: "Последнее обновление" },
  en: { eyebrow: "Legal", updated: "Last updated" },
};

export const LEGAL: Record<LegalDocId, Record<Lang, LegalContent>> = {
  // ─────────────────────────────── Foydalanish shartlari ───────────────────────────────
  terms: {
    uz: {
      title: "Foydalanish shartlari",
      metaDescription: "SOVEREIGN AI xizmatidan foydalanish shartlari.",
      sections: [
        {
          h: "Xizmat haqida",
          body: `SOVEREIGN AI ("Xizmat") — bitta interfeys orqali ko'plab AI modellariga kirish beruvchi obunaga asoslangan dasturiy xizmat (SaaS). Xizmat ${SITE} veb-ilovasi va buyruq qatori (CLI) vositasi orqali taqdim etiladi. Ushbu shartlarni qabul qilib, siz ular bilan bog'lanishga rozilik bildirasiz.`,
        },
        {
          h: "Hisob",
          body: "Xizmatdan foydalanish uchun hisob yaratasiz. Hisobingiz ma'lumotlari (parol, kirish) maxfiyligini saqlash sizning zimmangizda. Hisobingiz orqali amalga oshirilgan barcha harakatlar uchun siz javobgarsiz. 18 yoshdan katta bo'lishingiz yoki qonuniy vakilingiz roziligiga ega bo'lishingiz kerak.",
        },
        {
          h: "Obuna va to'lov",
          body: "Xizmat bepul (Free) va pullik (Basic, Pro, Ultra) tariflarni taklif qiladi. Pullik tariflar **oylik yoki yillik** to'lanadi: karta orqali — avtomatik yangilanadigan obuna, kripto va СБП orqali — tanlangan muddatga bir martalik to'lov. To'lov muvaffaqiyatli o'tgach, tegishli tarif imkoniyatlari darhol ochiladi. Narxlar oldindan ogohlantirilib o'zgartirilishi mumkin. To'lovlar Dodo Payments (karta), kripto shlyuzi yoki RollyPay (СБП, rublda) orqali qayta ishlanadi.",
        },
        {
          h: "Ruxsat etilgan foydalanish",
          body: "Xizmatdan qonunga zid, boshqalarning huquqlarini buzuvchi, zararli yoki firibgar maqsadlarda foydalanmaslikka rozisiz. AI javoblari ma'lumot xarakteriga ega bo'lib, professional (tibbiy, huquqiy, moliyaviy) maslahat o'rnini bosmaydi. Xizmatni suiiste'mol qilish hisob to'xtatilishiga olib kelishi mumkin.",
        },
        {
          h: "Maxfiylik va ma'lumotlar",
          body: "Xotira va shaxsiy ma'lumotlaringiz AES-256-GCM bilan shifrlanadi va faqat sizning qurilmangizda ochiladi (zero-knowledge). Batafsil ma'lumot [Maxfiylik siyosati](/privacy)da. Xizmat ma'lumotlaringizni uchinchi tomonlarga sotmaydi.",
        },
        {
          h: "Intellektual mulk",
          body: "Xizmat, uning dizayni, kodi va brendi bizga tegishli. AI yordamida yaratgan chiqishlaringiz sizniki; biz ularga egalik da'vo qilmaymiz. Uchinchi tomon AI modellari o'z provayderlarining shartlariga bo'ysunadi.",
        },
        {
          h: "Kafolatlar cheklovi",
          body: `Xizmat "boricha" (as is) taqdim etiladi. Biz uzluksiz yoki xatosiz ishlashni kafolatlamaymiz. Qonun ruxsat bergan darajada, bilvosita zararlar uchun javobgarligimiz siz oxirgi 12 oyda to'lagan summadan oshmaydi.`,
        },
        {
          h: "Bekor qilish va to'xtatish",
          body: "Obunani istalgan vaqtda hisobingizdan bekor qilishingiz mumkin; kirish to'langan davr oxirigacha saqlanadi. Shartlarni buzsangiz, hisobingizni to'xtatishimiz mumkin.",
        },
        {
          h: "O'zgarishlar",
          body: "Ushbu shartlarni vaqti-vaqti bilan yangilashimiz mumkin. Muhim o'zgarishlar haqida xabar beramiz. Yangilanishdan keyin foydalanishda davom etsangiz — yangi shartlarni qabul qilgan hisoblanasiz.",
        },
        { h: "Aloqa", body: `Savollar bo'yicha: ${MAIL}.` },
      ],
    },
    "uz-cyrl": {
      title: "Фойдаланиш шартлари",
      metaDescription: "SOVEREIGN AI хизматидан фойдаланиш шартлари.",
      sections: [
        {
          h: "Хизмат ҳақида",
          body: `SOVEREIGN AI («Хизмат») — битта интерфейс орқали кўплаб AI моделларига кириш берувчи обунага асосланган дастурий хизмат (SaaS). Хизмат ${SITE} веб-иловаси ва буйруқ қатори (CLI) воситаси орқали тақдим этилади. Ушбу шартларни қабул қилиб, сиз улар билан боғланишга розилик билдирасиз.`,
        },
        {
          h: "Ҳисоб",
          body: "Хизматдан фойдаланиш учун ҳисоб яратасиз. Ҳисобингиз маълумотлари (парол, кириш) махфийлигини сақлаш сизнинг зиммангизда. Ҳисобингиз орқали амалга оширилган барча ҳаракатлар учун сиз жавобгарсиз. 18 ёшдан катта бўлишингиз ёки қонуний вакилингиз розилигига эга бўлишингиз керак.",
        },
        {
          h: "Обуна ва тўлов",
          body: "Хизмат бепул (Free) ва пуллик (Basic, Pro, Ultra) тарифларни таклиф қилади. Пуллик тарифлар **ойлик ёки йиллик** тўланади: карта орқали — автоматик янгиланадиган обуна, крипто ва СБП орқали — танланган муддатга бир марталик тўлов. Тўлов муваффақиятли ўтгач, тегишли тариф имкониятлари дарҳол очилади. Нархлар олдиндан огоҳлантирилиб ўзгартирилиши мумкин. Тўловлар Dodo Payments (карта), крипто шлюзи ёки RollyPay (СБП, рублда) орқали қайта ишланади.",
        },
        {
          h: "Рухсат этилган фойдаланиш",
          body: "Хизматдан қонунга зид, бошқаларнинг ҳуқуқларини бузувчи, зарарли ёки фирибгар мақсадларда фойдаланмасликка розисиз. AI жавоблари маълумот характерига эга бўлиб, профессионал (тиббий, ҳуқуқий, молиявий) маслаҳат ўрнини босмайди. Хизматни суиистеъмол қилиш ҳисоб тўхтатилишига олиб келиши мумкин.",
        },
        {
          h: "Махфийлик ва маълумотлар",
          body: "Хотира ва шахсий маълумотларингиз AES-256-GCM билан шифрланади ва фақат сизнинг қурилмангизда очилади (zero-knowledge). Батафсил маълумот [Махфийлик сиёсати](/privacy)да. Хизмат маълумотларингизни учинчи томонларга сотмайди.",
        },
        {
          h: "Интеллектуал мулк",
          body: "Хизмат, унинг дизайни, коди ва бренди бизга тегишли. AI ёрдамида яратган чиқишларингиз сизники; биз уларга эгалик даъво қилмаймиз. Учинчи томон AI моделлари ўз провайдерларининг шартларига бўйсунади.",
        },
        {
          h: "Кафолатлар чеклови",
          body: "Хизмат «борича» (as is) тақдим этилади. Биз узлуксиз ёки хатосиз ишлашни кафолатламаймиз. Қонун рухсат берган даражада, билвосита зарарлар учун жавобгарлигимиз сиз охирги 12 ойда тўлаган суммадан ошмайди.",
        },
        {
          h: "Бекор қилиш ва тўхтатиш",
          body: "Обунани исталган вақтда ҳисобингиздан бекор қилишингиз мумкин; кириш тўланган давр охиригача сақланади. Шартларни бузсангиз, ҳисобингизни тўхтатишимиз мумкин.",
        },
        {
          h: "Ўзгаришлар",
          body: "Ушбу шартларни вақти-вақти билан янгилашимиз мумкин. Муҳим ўзгаришлар ҳақида хабар берамиз. Янгиланишдан кейин фойдаланишда давом этсангиз — янги шартларни қабул қилган ҳисобланасиз.",
        },
        { h: "Алоқа", body: `Саволлар бўйича: ${MAIL}.` },
      ],
    },
    ru: {
      title: "Условия использования",
      metaDescription: "Условия использования сервиса SOVEREIGN AI.",
      sections: [
        {
          h: "О Сервисе",
          body: `SOVEREIGN AI («Сервис») — программный сервис по подписке (SaaS), предоставляющий доступ ко множеству моделей ИИ через единый интерфейс. Сервис предоставляется через веб-приложение ${SITE} и инструмент командной строки (CLI). Принимая настоящие условия, вы соглашаетесь соблюдать их.`,
        },
        {
          h: "Аккаунт",
          body: "Для использования Сервиса вы создаёте аккаунт. Вы несёте ответственность за конфиденциальность данных своего аккаунта (пароль, данные для входа). Вы несёте ответственность за все действия, совершённые через ваш аккаунт. Вам должно быть больше 18 лет, либо у вас должно быть согласие законного представителя.",
        },
        {
          h: "Подписка и оплата",
          body: "Сервис предлагает бесплатный (Free) и платные (Basic, Pro, Ultra) тарифы. Платные тарифы оплачиваются **помесячно или за год**: картой — подписка с автоматическим продлением, криптовалютой и через СБП — разовый платёж за выбранный срок. После успешной оплаты возможности соответствующего тарифа открываются сразу. Цены могут изменяться с предварительным уведомлением. Платежи обрабатываются через Dodo Payments (карта), криптошлюз или RollyPay (СБП, в рублях).",
        },
        {
          h: "Допустимое использование",
          body: "Вы соглашаетесь не использовать Сервис в незаконных, нарушающих права других лиц, вредоносных или мошеннических целях. Ответы ИИ носят информационный характер и не заменяют профессиональную (медицинскую, юридическую, финансовую) консультацию. Злоупотребление Сервисом может привести к приостановке аккаунта.",
        },
        {
          h: "Конфиденциальность и данные",
          body: "Ваша память и персональные данные шифруются с помощью AES-256-GCM и расшифровываются только на вашем устройстве (zero-knowledge). Подробнее — в [Политике конфиденциальности](/privacy). Сервис не продаёт ваши данные третьим лицам.",
        },
        {
          h: "Интеллектуальная собственность",
          body: "Сервис, его дизайн, код и бренд принадлежат нам. Результаты, созданные вами с помощью ИИ, принадлежат вам; мы не претендуем на право собственности на них. Сторонние модели ИИ регулируются условиями их поставщиков.",
        },
        {
          h: "Ограничение гарантий",
          body: "Сервис предоставляется «как есть» (as is). Мы не гарантируем бесперебойную или безошибочную работу. В пределах, допускаемых законом, наша ответственность за косвенные убытки не превышает суммы, уплаченной вами за последние 12 месяцев.",
        },
        {
          h: "Отмена и приостановка",
          body: "Вы можете отменить подписку в своём аккаунте в любое время; доступ сохраняется до конца оплаченного периода. При нарушении условий мы можем приостановить ваш аккаунт.",
        },
        {
          h: "Изменения",
          body: "Мы можем время от времени обновлять настоящие условия. О существенных изменениях мы сообщим. Продолжая пользоваться Сервисом после обновления, вы считаетесь принявшими новые условия.",
        },
        { h: "Контакты", body: `По вопросам: ${MAIL}.` },
      ],
    },
    en: {
      title: "Terms of Use",
      metaDescription: "Terms of use for the SOVEREIGN AI service.",
      sections: [
        {
          h: "About the Service",
          body: `SOVEREIGN AI (the "Service") is a subscription-based software service (SaaS) that provides access to many AI models through a single interface. The Service is provided through the ${SITE} web app and a command-line (CLI) tool. By accepting these terms, you agree to be bound by them.`,
        },
        {
          h: "Account",
          body: "To use the Service, you create an account. You are responsible for keeping your account credentials (password, login) confidential. You are responsible for all actions taken through your account. You must be over 18 years old or have the consent of your legal guardian.",
        },
        {
          h: "Subscription and payment",
          body: "The Service offers a free plan (Free) and paid plans (Basic, Pro, Ultra). Paid plans are billed **monthly or yearly**: by card as an auto-renewing subscription; by crypto or SBP as a one-time payment for the chosen period. Once payment succeeds, the features of the corresponding plan are unlocked immediately. Prices may change with prior notice. Payments are processed via Dodo Payments (card), a crypto gateway or RollyPay (SBP, in rubles).",
        },
        {
          h: "Acceptable use",
          body: "You agree not to use the Service for purposes that are unlawful, infringe the rights of others, or are harmful or fraudulent. AI answers are informational in nature and do not replace professional (medical, legal, financial) advice. Abuse of the Service may result in suspension of your account.",
        },
        {
          h: "Privacy and data",
          body: "Your memory and personal data are encrypted with AES-256-GCM and are decrypted only on your device (zero-knowledge). See the [Privacy Policy](/privacy) for details. The Service does not sell your data to third parties.",
        },
        {
          h: "Intellectual property",
          body: "The Service, including its design, code and brand, belongs to us. The outputs you create with AI are yours; we claim no ownership of them. Third-party AI models are subject to their providers' terms.",
        },
        {
          h: "Disclaimer of warranties",
          body: `The Service is provided "as is". We do not guarantee uninterrupted or error-free operation. To the extent permitted by law, our liability for indirect damages shall not exceed the amount you paid in the last 12 months.`,
        },
        {
          h: "Cancellation and suspension",
          body: "You can cancel your subscription from your account at any time; access remains until the end of the paid period. If you violate these terms, we may suspend your account.",
        },
        {
          h: "Changes",
          body: "We may update these terms from time to time. We will notify you of material changes. If you continue to use the Service after an update, you are deemed to have accepted the new terms.",
        },
        { h: "Contact", body: `For questions: ${MAIL}.` },
      ],
    },
  },

  // ─────────────────────────────── Maxfiylik siyosati ───────────────────────────────
  privacy: {
    uz: {
      title: "Maxfiylik siyosati",
      metaDescription: "SOVEREIGN AI qanday ma'lumot to'playdi, saqlaydi va himoya qiladi.",
      sections: [
        {
          h: "Qanday ma'lumot to'playmiz",
          list: [
            "**Hisob:** email, ism (ixtiyoriy), autentifikatsiya identifikatori.",
            "**Foydalanish:** so'rovlar soni, tanlangan model, tarif holati — xizmatni ta'minlash uchun.",
            "**Xotira/suhbatlar:** siz saqlagan kontent — **shifrlangan** holda (quyida).",
            "**To'lov:** to'lov shlyuzi (Dodo Payments / kripto / RollyPay СБП) tomonidan qayta ishlanadi; biz karta ma'lumotlaringizni saqlamaymiz.",
          ],
        },
        {
          h: "Zero-knowledge shifrlash",
          body: "Xotira va shaxsiy kontentingiz **AES-256-GCM** bilan shifrlanadi. Shifrlash kaliti sizning qurilmangizda ochiladi — biz uni ko'ra olmaymiz (zero-knowledge). Serverda ma'lumot faqat shifrlangan ko'rinishda turadi.",
        },
        {
          h: "Blind Prompting",
          body: "AI modelga so'rov yuborilishidan oldin ism, raqam, kompaniya kabi maxfiy bo'laklar maskalanadi. Shu tufayli AI provayderlari sizning haqiqiy ma'lumotingizni ko'rmaydi.",
        },
        {
          h: "Ma'lumotdan qanday foydalanamiz",
          body: "Ma'lumotni faqat xizmatni ta'minlash, hisobingizni boshqarish, xavfsizlik va qonuniy majburiyatlar uchun ishlatamiz. **Biz ma'lumotingizni sotmaymiz** va reklama uchun uchinchi tomonlarga bermaymiz.",
        },
        {
          h: "Uchinchi tomon xizmatlari",
          body: "Xizmat ishlashi uchun: AI model provayderlari (maskalangan so'rov qayta ishlash uchun), hosting (Vercel), ma'lumotlar bazasi (Supabase) va to'lov shlyuzlari (Dodo Payments, kripto). Har biri o'z maxfiylik siyosatiga ega.",
        },
        {
          h: "Saqlash muddati",
          body: "Ma'lumotingiz hisobingiz faol bo'lganicha saqlanadi. Hisobingizni yoki alohida yozuvlarni istalgan vaqtda o'chirishingiz mumkin — o'chirilgach, ular tizimdan olib tashlanadi.",
        },
        {
          h: "Sizning huquqlaringiz (GDPR)",
          body: "Ma'lumotingizga kirish, tuzatish, eksport qilish va o'chirishni so'rash huquqiga egasiz. Xotira grafi to'liq eksport qilinadi va istalgan vaqtda o'chiriladi.",
        },
        {
          h: "Cookie va mahalliy saqlash",
          body: "Faqat zarur cookie'lar (sessiya, autentifikatsiya) va brauzer mahalliy xotirasi (afzalliklar) ishlatiladi. Kuzatuv/reklama cookie'lari yo'q.",
        },
        {
          h: "Bolalar",
          body: "Xizmat 18 yoshdan katta foydalanuvchilar uchun. Biz bilib turib bolalardan ma'lumot to'plamaymiz.",
        },
        {
          h: "Aloqa",
          body: `Maxfiylik bo'yicha savollar: ${MAIL}. Batafsil: [Foydalanish shartlari](/terms).`,
        },
      ],
    },
    "uz-cyrl": {
      title: "Махфийлик сиёсати",
      metaDescription: "SOVEREIGN AI қандай маълумот тўплайди, сақлайди ва ҳимоя қилади.",
      sections: [
        {
          h: "Қандай маълумот тўплаймиз",
          list: [
            "**Ҳисоб:** email, исм (ихтиёрий), аутентификация идентификатори.",
            "**Фойдаланиш:** сўровлар сони, танланган модел, тариф ҳолати — хизматни таъминлаш учун.",
            "**Хотира/суҳбатлар:** сиз сақлаган контент — **шифрланган** ҳолда (қуйида).",
            "**Тўлов:** тўлов шлюзи (Dodo Payments / крипто / RollyPay СБП) томонидан қайта ишланади; биз карта маълумотларингизни сақламаймиз.",
          ],
        },
        {
          h: "Zero-knowledge шифрлаш",
          body: "Хотира ва шахсий контентингиз **AES-256-GCM** билан шифрланади. Шифрлаш калити сизнинг қурилмангизда очилади — биз уни кўра олмаймиз (zero-knowledge). Серверда маълумот фақат шифрланган кўринишда туради.",
        },
        {
          h: "Blind Prompting",
          body: "AI моделга сўров юборилишидан олдин исм, рақам, компания каби махфий бўлаклар маскаланади. Шу туфайли AI провайдерлари сизнинг ҳақиқий маълумотингизни кўрмайди.",
        },
        {
          h: "Маълумотдан қандай фойдаланамиз",
          body: "Маълумотни фақат хизматни таъминлаш, ҳисобингизни бошқариш, хавфсизлик ва қонуний мажбуриятлар учун ишлатамиз. **Биз маълумотингизни сотмаймиз** ва реклама учун учинчи томонларга бермаймиз.",
        },
        {
          h: "Учинчи томон хизматлари",
          body: "Хизмат ишлаши учун: AI модел провайдерлари (маскаланган сўров қайта ишлаш учун), хостинг (Vercel), маълумотлар базаси (Supabase) ва тўлов шлюзлари (Dodo Payments, крипто). Ҳар бири ўз махфийлик сиёсатига эга.",
        },
        {
          h: "Сақлаш муддати",
          body: "Маълумотингиз ҳисобингиз фаол бўлганича сақланади. Ҳисобингизни ёки алоҳида ёзувларни исталган вақтда ўчиришингиз мумкин — ўчирилгач, улар тизимдан олиб ташланади.",
        },
        {
          h: "Сизнинг ҳуқуқларингиз (GDPR)",
          body: "Маълумотингизга кириш, тузатиш, экспорт қилиш ва ўчиришни сўраш ҳуқуқига эгасиз. Хотира графи тўлиқ экспорт қилинади ва исталган вақтда ўчирилади.",
        },
        {
          h: "Cookie ва маҳаллий сақлаш",
          body: "Фақат зарур cookie'лар (сессия, аутентификация) ва браузер маҳаллий хотираси (афзалликлар) ишлатилади. Кузатув/реклама cookie'лари йўқ.",
        },
        {
          h: "Болалар",
          body: "Хизмат 18 ёшдан катта фойдаланувчилар учун. Биз билиб туриб болалардан маълумот тўпламаймиз.",
        },
        {
          h: "Алоқа",
          body: `Махфийлик бўйича саволлар: ${MAIL}. Батафсил: [Фойдаланиш шартлари](/terms).`,
        },
      ],
    },
    ru: {
      title: "Политика конфиденциальности",
      metaDescription: "Как SOVEREIGN AI собирает, хранит и защищает данные.",
      sections: [
        {
          h: "Какие данные мы собираем",
          list: [
            "**Аккаунт:** email, имя (необязательно), идентификатор аутентификации.",
            "**Использование:** количество запросов, выбранная модель, статус тарифа — для предоставления сервиса.",
            "**Память/чаты:** сохранённый вами контент — в **зашифрованном** виде (см. ниже).",
            "**Оплата:** обрабатывается платёжным шлюзом (Dodo Payments / крипто / RollyPay СБП); мы не храним данные вашей карты.",
          ],
        },
        {
          h: "Шифрование zero-knowledge",
          body: "Ваша память и личный контент шифруются с помощью **AES-256-GCM**. Ключ шифрования открывается на вашем устройстве — мы не можем его увидеть (zero-knowledge). На сервере данные хранятся только в зашифрованном виде.",
        },
        {
          h: "Blind Prompting",
          body: "Перед отправкой запроса модели ИИ конфиденциальные фрагменты — имена, номера, названия компаний и т. п. — маскируются. Благодаря этому поставщики ИИ не видят ваши реальные данные.",
        },
        {
          h: "Как мы используем данные",
          body: "Мы используем данные только для предоставления сервиса, управления вашим аккаунтом, обеспечения безопасности и выполнения законных обязательств. **Мы не продаём ваши данные** и не передаём их третьим лицам для рекламы.",
        },
        {
          h: "Сторонние сервисы",
          body: "Для работы Сервиса используются: поставщики моделей ИИ (для обработки замаскированных запросов), хостинг (Vercel), база данных (Supabase) и платёжные шлюзы (Dodo Payments, крипто). У каждого из них своя политика конфиденциальности.",
        },
        {
          h: "Срок хранения",
          body: "Ваши данные хранятся, пока ваш аккаунт активен. Вы можете в любое время удалить аккаунт или отдельные записи — после удаления они удаляются из системы.",
        },
        {
          h: "Ваши права (GDPR)",
          body: "Вы вправе запросить доступ к своим данным, их исправление, экспорт и удаление. Граф памяти экспортируется полностью и может быть удалён в любое время.",
        },
        {
          h: "Cookie и локальное хранилище",
          body: "Используются только необходимые cookie (сессия, аутентификация) и локальное хранилище браузера (настройки). Отслеживающих и рекламных cookie нет.",
        },
        {
          h: "Дети",
          body: "Сервис предназначен для пользователей старше 18 лет. Мы сознательно не собираем данные детей.",
        },
        {
          h: "Контакты",
          body: `Вопросы о конфиденциальности: ${MAIL}. Подробнее: [Условия использования](/terms).`,
        },
      ],
    },
    en: {
      title: "Privacy Policy",
      metaDescription: "How SOVEREIGN AI collects, stores and protects data.",
      sections: [
        {
          h: "What data we collect",
          list: [
            "**Account:** email, name (optional), authentication identifier.",
            "**Usage:** number of requests, selected model, plan status — to provide the service.",
            "**Memory/chats:** content you save — stored **encrypted** (see below).",
            "**Payment:** processed by the payment gateway (Dodo Payments / crypto / RollyPay SBP); we do not store your card details.",
          ],
        },
        {
          h: "Zero-knowledge encryption",
          body: "Your memory and personal content are encrypted with **AES-256-GCM**. The encryption key is unlocked on your device — we cannot see it (zero-knowledge). On the server, data is stored only in encrypted form.",
        },
        {
          h: "Blind Prompting",
          body: "Before a request is sent to an AI model, sensitive fragments such as names, numbers and company names are masked. As a result, AI providers do not see your real data.",
        },
        {
          h: "How we use data",
          body: "We use data only to provide the service, manage your account, ensure security and meet legal obligations. **We do not sell your data** and do not share it with third parties for advertising.",
        },
        {
          h: "Third-party services",
          body: "To operate the Service we use: AI model providers (to process masked requests), hosting (Vercel), a database (Supabase) and payment gateways (Dodo Payments, crypto). Each has its own privacy policy.",
        },
        {
          h: "Retention period",
          body: "Your data is kept for as long as your account is active. You can delete your account or individual records at any time — once deleted, they are removed from the system.",
        },
        {
          h: "Your rights (GDPR)",
          body: "You have the right to request access to, correction, export and deletion of your data. The memory graph can be exported in full and deleted at any time.",
        },
        {
          h: "Cookies and local storage",
          body: "Only essential cookies (session, authentication) and the browser's local storage (preferences) are used. There are no tracking or advertising cookies.",
        },
        {
          h: "Children",
          body: "The Service is intended for users over 18. We do not knowingly collect data from children.",
        },
        {
          h: "Contact",
          body: `Privacy questions: ${MAIL}. More details: [Terms of Use](/terms).`,
        },
      ],
    },
  },

  // ─────────────────────────────── Pul qaytarish siyosati ───────────────────────────────
  refund: {
    uz: {
      title: "Pul qaytarish siyosati",
      metaDescription: "SOVEREIGN AI obunalari uchun pul qaytarish va bekor qilish siyosati.",
      sections: [
        {
          h: "Obuna modeli",
          body: "SOVEREIGN AI — oylik avtomatik yangilanadigan raqamli obuna. To'lov muvaffaqiyatli o'tgach, tarif imkoniyatlari darhol va avtomatik ochiladi (inson aralashuvisiz).",
        },
        {
          h: "7 kunlik qaytarish (birinchi to'lov)",
          body: "Har qanday pullik tarifning **birinchi to'lovi** uchun, agar xizmatdan sezilarli darajada foydalanmagan bo'lsangiz, **7 kun ichida** to'liq pul qaytarishni so'rashingiz mumkin. So'rov ko'rib chiqilib, mos bo'lsa summa dastlabki to'lov usuliga qaytariladi.",
        },
        {
          h: "Bekor qilish",
          body: "Obunani istalgan vaqtda hisobingizdan bekor qilishingiz mumkin. Bekor qilinganda keyingi to'lov olinmaydi; kirish esa joriy to'langan davr oxirigacha saqlanadi. Yangilanish sanasidan oldin bekor qiling — shunda keyingi davr uchun hisoblanmaysiz.",
        },
        {
          h: "Qaytarilmaydigan holatlar",
          body: "Quyidagilar qaytarilmaydi: (a) 7 kunlik muddat o'tgan yangilanish davrlari; (b) xizmat sezilarli darajada ishlatilgan davrlar; (c) shartlar buzilishi sababli to'xtatilgan hisoblar. Ishlatilgan token/kvota qismli qaytarishga asos bo'lmaydi.",
        },
        {
          h: "Kripto to'lovlari",
          body: "Kripto shlyuzi orqali qilingan to'lovlar blokcheyn tabiati tufayli qaytarilmasligi mumkin. Bunday holatlar alohida, individual asosda ko'rib chiqiladi.",
        },
        {
          h: "Qanday so'rash kerak",
          body: `Pul qaytarish yoki bekor qilish uchun ${MAIL} ga hisobingiz emaili va to'lov sanasi bilan murojaat qiling. So'rovlar odatda 3–5 ish kuni ichida ko'rib chiqiladi.`,
        },
      ],
      note: "Batafsil shartlar: [Foydalanish shartlari](/terms).",
    },
    "uz-cyrl": {
      title: "Пул қайтариш сиёсати",
      metaDescription: "SOVEREIGN AI обуналари учун пул қайтариш ва бекор қилиш сиёсати.",
      sections: [
        {
          h: "Обуна модели",
          body: "SOVEREIGN AI — ойлик автоматик янгиланадиган рақамли обуна. Тўлов муваффақиятли ўтгач, тариф имкониятлари дарҳол ва автоматик очилади (инсон аралашувисиз).",
        },
        {
          h: "7 кунлик қайтариш (биринчи тўлов)",
          body: "Ҳар қандай пуллик тарифнинг **биринчи тўлови** учун, агар хизматдан сезиларли даражада фойдаланмаган бўлсангиз, **7 кун ичида** тўлиқ пул қайтаришни сўрашингиз мумкин. Сўров кўриб чиқилиб, мос бўлса сумма дастлабки тўлов усулига қайтарилади.",
        },
        {
          h: "Бекор қилиш",
          body: "Обунани исталган вақтда ҳисобингиздан бекор қилишингиз мумкин. Бекор қилинганда кейинги тўлов олинмайди; кириш эса жорий тўланган давр охиригача сақланади. Янгиланиш санасидан олдин бекор қилинг — шунда кейинги давр учун ҳисобланмайсиз.",
        },
        {
          h: "Қайтарилмайдиган ҳолатлар",
          body: "Қуйидагилар қайтарилмайди: (а) 7 кунлик муддат ўтган янгиланиш даврлари; (б) хизмат сезиларли даражада ишлатилган даврлар; (в) шартлар бузилиши сабабли тўхтатилган ҳисоблар. Ишлатилган токен/квота қисмли қайтаришга асос бўлмайди.",
        },
        {
          h: "Крипто тўловлари",
          body: "Крипто шлюзи орқали қилинган тўловлар блокчейн табиати туфайли қайтарилмаслиги мумкин. Бундай ҳолатлар алоҳида, индивидуал асосда кўриб чиқилади.",
        },
        {
          h: "Қандай сўраш керак",
          body: `Пул қайтариш ёки бекор қилиш учун ${MAIL} га ҳисобингиз email'и ва тўлов санаси билан мурожаат қилинг. Сўровлар одатда 3–5 иш куни ичида кўриб чиқилади.`,
        },
      ],
      note: "Батафсил шартлар: [Фойдаланиш шартлари](/terms).",
    },
    ru: {
      title: "Политика возврата средств",
      metaDescription: "Политика возврата средств и отмены подписок SOVEREIGN AI.",
      sections: [
        {
          h: "Модель подписки",
          body: "SOVEREIGN AI — цифровая подписка с ежемесячным автоматическим продлением. После успешной оплаты возможности тарифа открываются сразу и автоматически (без участия человека).",
        },
        {
          h: "Возврат в течение 7 дней (первый платёж)",
          body: "По **первому платежу** за любой платный тариф, если вы не пользовались сервисом в значительной мере, вы можете запросить полный возврат средств **в течение 7 дней**. Запрос будет рассмотрен, и при соответствии условиям сумма будет возвращена на исходный способ оплаты.",
        },
        {
          h: "Отмена",
          body: "Вы можете отменить подписку в своём аккаунте в любое время. После отмены следующий платёж не списывается; доступ сохраняется до конца текущего оплаченного периода. Отмените подписку до даты продления — тогда оплата за следующий период не будет списана.",
        },
        {
          h: "Случаи, не подлежащие возврату",
          body: "Возврату не подлежат: (а) периоды продления, по которым истёк 7-дневный срок; (б) периоды, в которые сервис использовался в значительной мере; (в) аккаунты, приостановленные из-за нарушения условий. Использованные токены/квота не являются основанием для частичного возврата.",
        },
        {
          h: "Криптоплатежи",
          body: "Платежи, совершённые через криптошлюз, могут быть невозвратными в силу природы блокчейна. Такие случаи рассматриваются отдельно, в индивидуальном порядке.",
        },
        {
          h: "Как подать запрос",
          body: `Для возврата средств или отмены напишите на ${MAIL}, указав email аккаунта и дату платежа. Запросы обычно рассматриваются в течение 3–5 рабочих дней.`,
        },
      ],
      note: "Подробные условия: [Условия использования](/terms).",
    },
    en: {
      title: "Refund Policy",
      metaDescription: "Refund and cancellation policy for SOVEREIGN AI subscriptions.",
      sections: [
        {
          h: "Subscription model",
          body: "SOVEREIGN AI is a monthly auto-renewing digital subscription. Once payment succeeds, plan features are unlocked immediately and automatically (without human intervention).",
        },
        {
          h: "7-day refund (first payment)",
          body: "For the **first payment** of any paid plan, if you have not made significant use of the service, you may request a full refund **within 7 days**. The request will be reviewed and, if eligible, the amount will be returned to the original payment method.",
        },
        {
          h: "Cancellation",
          body: "You can cancel your subscription from your account at any time. Once cancelled, no further payment is taken; access remains until the end of the current paid period. Cancel before the renewal date so that you are not charged for the next period.",
        },
        {
          h: "Non-refundable cases",
          body: "The following are not refundable: (a) renewal periods after the 7-day window has passed; (b) periods in which the service was used significantly; (c) accounts suspended for violating the terms. Used tokens/quota are not grounds for a partial refund.",
        },
        {
          h: "Crypto payments",
          body: "Payments made through the crypto gateway may be non-refundable due to the nature of the blockchain. Such cases are reviewed separately, on an individual basis.",
        },
        {
          h: "How to request",
          body: `To request a refund or cancellation, contact ${MAIL} with your account email and the payment date. Requests are usually reviewed within 3–5 business days.`,
        },
      ],
      note: "Full terms: [Terms of Use](/terms).",
    },
  },
};
