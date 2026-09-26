import type { Lang } from "@/lib/i18n";

/**
 * Huquqiy sahifalar (/terms, /privacy, /refund) matni — 4 tilda.
 * Ichki belgilash: **qalin** va [matn](havola) — LegalDoc shularni render qiladi.
 */

export type LegalDocId = "terms" | "privacy" | "refund";

export interface LegalSection {
  /** Havola uchun langar (/privacy#chat-data). */
  id?: string;
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

export const LEGAL_UPDATED = "2026-09-26";
export const LEGAL_EMAIL = "isa704480@gmail.com";

const MAIL = `[${LEGAL_EMAIL}](mailto:${LEGAL_EMAIL})`;
const SITE = "[soveregn.xyz](https://soveregn.xyz)";

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
          body: "Suhbat va xotirangiz ma'lumotlar bazamizda hisobingizga bog'langan holda saqlanadi va javob berish uchun AI provayderlarga yuboriladi. Nima saqlanishi, qaysi provayderlar qayta ishlashi va ma'lumotni qanday o'chirish — [Maxfiylik siyosati](/privacy#chat-data)da. Xizmat ma'lumotlaringizni uchinchi tomonlarga sotmaydi.",
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
          body: "Суҳбат ва хотирангиз маълумотлар базамизда ҳисобингизга боғланган ҳолда сақланади ва жавоб бериш учун AI провайдерларга юборилади. Нима сақланиши, қайси провайдерлар қайта ишлаши ва маълумотни қандай ўчириш — [Махфийлик сиёсати](/privacy#chat-data)да. Хизмат маълумотларингизни учинчи томонларга сотмайди.",
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
          body: "Ваши чаты и память хранятся в нашей базе данных с привязкой к аккаунту и отправляются AI-провайдерам для получения ответа. Что хранится, какие провайдеры обрабатывают запросы и как удалить данные — в [Политике конфиденциальности](/privacy#chat-data). Сервис не продаёт ваши данные третьим лицам.",
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
          body: "Your chats and memory are stored in our database linked to your account and are sent to AI providers to generate answers. What is stored, which providers process requests and how to delete your data is described in the [Privacy Policy](/privacy#chat-data). The Service does not sell your data to third parties.",
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
            "**Suhbatlar va xotira:** suhbatlaringiz, xotira saqlagan faktlar va bilim bazasi hujjatlari ma'lumotlar bazamizda (Supabase) hisobingizga bog'langan holda saqlanadi. Ularni faqat sizning hisobingiz o'qiy oladi va baza provayderi ularni diskda shifrlaydi, lekin ular **uchidan-uchiga (end-to-end) shifrlanmagan** — sizga javob berish uchun serverimiz ularni o'qiydi.",
            "**To'lov:** to'lov shlyuzi (Dodo Payments / kripto / RollyPay СБП) tomonidan qayta ishlanadi; biz karta ma'lumotlaringizni saqlamaymiz.",
          ],
        },
        {
          id: "chat-data",
          h: "Suhbatlaringiz va AI modellar",
          list: [
            "**Qayerga yuboriladi:** har bir xabar serverimizdan siz tanlagan modelni ishlatadigan AI provayderga yuboriladi. Model va mavjudlikka qarab: OpenRouter, OmniRoute, Perplexity, Groq, Cerebras, SambaNova, Mistral, OpenAI, NVIDIA NIM, RSI AI. OmniRoute — bizning yo'naltirish shlyuzimiz, u so'rovni o'ziga ulangan provayderlarga uzatadi. Asosiy provayderlar ishlamasa — tekin zaxira shlyuzlar (LLM7, Experiential Labs). Bilim bazasi va javob keshi uchun matn embedding'i OpenRouter orqali hisoblanadi.",
            "**Qaysi model javob berdi:** har javob ostida haqiqatda javob bergan model va shu javob uchun hisoblangan token ko'rsatiladi. Tanlangan model ishlamay, boshqasi javob bergan bo'lsa — buni ochiq yozamiz (\"so'ralgan: X → javob: Y\").",
            "**Provayderlar siyosati:** bu provayderlar so'rovlarni o'z shartlari va maxfiylik siyosatlari asosida qayta ishlaydi; ba'zilari so'rovlarni saqlashi yoki jurnalga yozishi mumkin. Biz buni nazorat qilmaymiz va ular ma'lumotdan o'qitishda foydalanmasligiga kafolat bera olmaymiz. Maxfiy ma'lumot uchun maxfiy rejimni (Blind Prompting) yoqing.",
            "**O'qitish:** SOVEREIGN suhbatlaringizni sotmaydi va provayderlarga o'qitish uchun bermaydi. Yagona istisno — o'z modelimiz Tella: Sozlamalardagi \"Tella 2 ni o'rgatish\" yoqilgan bo'lsa (standart holatda yoqilgan), oddiy suhbatlardagi qisqa savol-javoblar hisob identifikatorisiz saqlanishi mumkin. Hech qachon saqlanmaydi: fayl, bilim bazasi, xotira, ulangan servis, siz yuborgan havola, o'z skilingiz yoki maxfiy rejim ishlatilgan suhbatlar, shuningdek email, telefon, karta raqami yoki API kalit topilgan matn. Sozlamalar → Ma'lumotlar va maxfiylik bo'limida o'chirsangiz, yangi namunalar yig'ilmaydi.",
            "**Javob keshi:** shaxsiy kontekstsiz oddiy savollar (xotira, fayl, havola, bilim bazasi yo'q) savol va javob matni sifatida, hisob identifikatorisiz umumiy keshga yoziladi va 24 soat davomida xuddi shunday savollarga — boshqa foydalanuvchilarga ham — tezroq javob berish uchun ishlatiladi.",
            "**Yaratilgan rasmlar:** yaratilgan rasm va videolar faqat brauzeringizda saqlanadi; serverga (va boshqa qurilmalaringizga) ular o'rniga faqat belgi sinxronlanadi.",
            "**O'chirish:** suhbatni ro'yxatdan alohida o'chirishingiz mumkin; Sozlamalar → Ma'lumotlar va maxfiylik → \"Barcha ma'lumotni o'chirish\" barcha suhbatlar (xabarlari bilan) va xotirangizni bazamizdan o'chiradi. Hisob identifikatorisiz saqlangan o'qitish namunalari va kesh yozuvlarini sizga bog'lab topib bo'lmaydi, shuning uchun ular bu yo'l bilan o'chmaydi. Hisobni butunlay o'chirish uchun bizga yozing.",
          ],
        },
        {
          h: "Blind Prompting",
          body: "Maxfiy rejim (Blind Prompting) yoqilganda AI modelga so'rov yuborilishidan oldin ism, raqam, kompaniya kabi maxfiy bo'laklar brauzeringizda maskalanadi, shuning uchun AI provayderlari ularni ko'rmaydi. Maskalash avtomatik va namunaga asoslangan — ba'zi tafsilotlarni o'tkazib yuborishi mumkin. Rejim o'chiq bo'lsa, so'rov matni provayderga o'zgarishsiz yuboriladi.",
        },
        {
          h: "Ma'lumotdan qanday foydalanamiz",
          body: "Ma'lumotni faqat xizmatni ta'minlash, hisobingizni boshqarish, xavfsizlik va qonuniy majburiyatlar uchun ishlatamiz. **Biz ma'lumotingizni sotmaymiz** va reklama uchun uchinchi tomonlarga bermaymiz.",
        },
        {
          h: "Uchinchi tomon xizmatlari",
          body: "Xizmat ishlashi uchun: AI model provayderlari (so'rovlaringizni qayta ishlash uchun — ro'yxati yuqorida), hosting (Vercel), ma'lumotlar bazasi (Supabase) va to'lov shlyuzlari (Dodo Payments, kripto). Har biri o'z maxfiylik siyosatiga ega.",
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
            "**Суҳбатлар ва хотира:** суҳбатларингиз, хотира сақлаган фактлар ва билимлар базаси ҳужжатлари маълумотлар базамизда (Supabase) ҳисобингизга боғланган ҳолда сақланади. Уларни фақат сизнинг ҳисобингиз ўқий олади ва база провайдери уларни дискда шифрлайди, лекин улар **учидан-учига (end-to-end) шифрланмаган** — сизга жавоб бериш учун серверимиз уларни ўқийди.",
            "**Тўлов:** тўлов шлюзи (Dodo Payments / крипто / RollyPay СБП) томонидан қайта ишланади; биз карта маълумотларингизни сақламаймиз.",
          ],
        },
        {
          id: "chat-data",
          h: "Суҳбатларингиз ва AI моделлар",
          list: [
            "**Қаерга юборилади:** ҳар бир хабар серверимиздан сиз танлаган моделни ишлатадиган AI провайдерга юборилади. Модел ва мавжудликка қараб: OpenRouter, OmniRoute, Perplexity, Groq, Cerebras, SambaNova, Mistral, OpenAI, NVIDIA NIM, RSI AI. OmniRoute — бизнинг йўналтириш шлюзимиз, у сўровни ўзига уланган провайдерларга узатади. Асосий провайдерлар ишламаса — текин захира шлюзлар (LLM7, Experiential Labs). Билимлар базаси ва жавоб кеши учун матн эмбеддинги OpenRouter орқали ҳисобланади.",
            "**Қайси модел жавоб берди:** ҳар жавоб остида ҳақиқатда жавоб берган модел ва шу жавоб учун ҳисобланган токен кўрсатилади. Танланган модел ишламай, бошқаси жавоб берган бўлса — буни очиқ ёзамиз (\"сўралган: X → жавоб: Y\").",
            "**Провайдерлар сиёсати:** бу провайдерлар сўровларни ўз шартлари ва махфийлик сиёсатлари асосида қайта ишлайди; баъзилари сўровларни сақлаши ёки журналга ёзиши мумкин. Биз буни назорат қилмаймиз ва улар маълумотдан ўқитишда фойдаланмаслигига кафолат бера олмаймиз. Махфий маълумот учун махфий режимни (Blind Prompting) ёқинг.",
            "**Ўқитиш:** SOVEREIGN суҳбатларингизни сотмайди ва провайдерларга ўқитиш учун бермайди. Ягона истисно — ўз моделимиз Tella: Созламалардаги \"Tella 2 ни ўргатиш\" ёқилган бўлса (стандарт ҳолатда ёқилган), оддий суҳбатлардаги қисқа савол-жавоблар ҳисоб идентификаторисиз сақланиши мумкин. Ҳеч қачон сақланмайди: файл, билимлар базаси, хотира, уланган сервис, сиз юборган ҳавола, ўз скилингиз ёки махфий режим ишлатилган суҳбатлар, шунингдек email, телефон, карта рақами ёки API калит топилган матн. Созламалар → Маълумотлар ва махфийлик бўлимида ўчирсангиз, янги намуналар йиғилмайди.",
            "**Жавоб кеши:** шахсий контекстсиз оддий саволлар (хотира, файл, ҳавола, билимлар базаси йўқ) савол ва жавоб матни сифатида, ҳисоб идентификаторисиз умумий кешга ёзилади ва 24 соат давомида худди шундай саволларга — бошқа фойдаланувчиларга ҳам — тезроқ жавоб бериш учун ишлатилади.",
            "**Яратилган расмлар:** яратилган расм ва видеолар фақат браузерингизда сақланади; серверга (ва бошқа қурилмаларингизга) улар ўрнига фақат белги синхронланади.",
            "**Ўчириш:** суҳбатни рўйхатдан алоҳида ўчиришингиз мумкин; Созламалар → Маълумотлар ва махфийлик → \"Барча маълумотни ўчириш\" барча суҳбатлар (хабарлари билан) ва хотирангизни базамиздан ўчиради. Ҳисоб идентификаторисиз сақланган ўқитиш намуналари ва кеш ёзувларини сизга боғлаб топиб бўлмайди, шунинг учун улар бу йўл билан ўчмайди. Ҳисобни бутунлай ўчириш учун бизга ёзинг.",
          ],
        },
        {
          h: "Blind Prompting",
          body: "Махфий режим (Blind Prompting) ёқилганда AI моделга сўров юборилишидан олдин исм, рақам, компания каби махфий бўлаклар браузерингизда маскаланади, шунинг учун AI провайдерлари уларни кўрмайди. Маскалаш автоматик ва намунага асосланган — баъзи тафсилотларни ўтказиб юбориши мумкин. Режим ўчиқ бўлса, сўров матни провайдерга ўзгаришсиз юборилади.",
        },
        {
          h: "Маълумотдан қандай фойдаланамиз",
          body: "Маълумотни фақат хизматни таъминлаш, ҳисобингизни бошқариш, хавфсизлик ва қонуний мажбуриятлар учун ишлатамиз. **Биз маълумотингизни сотмаймиз** ва реклама учун учинчи томонларга бермаймиз.",
        },
        {
          h: "Учинчи томон хизматлари",
          body: "Хизмат ишлаши учун: AI модел провайдерлари (сўровларингизни қайта ишлаш учун — рўйхати юқорида), хостинг (Vercel), маълумотлар базаси (Supabase) ва тўлов шлюзлари (Dodo Payments, крипто). Ҳар бири ўз махфийлик сиёсатига эга.",
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
            "**Чаты и память:** ваши чаты, факты, сохранённые памятью, и документы базы знаний хранятся в нашей базе данных (Supabase) с привязкой к аккаунту. Читать их может только ваш аккаунт, провайдер базы шифрует их на диске, но они **не зашифрованы сквозным (end-to-end) шифрованием** — наш сервер читает их, чтобы ответить вам.",
            "**Оплата:** обрабатывается платёжным шлюзом (Dodo Payments / крипто / RollyPay СБП); мы не храним данные вашей карты.",
          ],
        },
        {
          id: "chat-data",
          h: "Ваши чаты и AI-модели",
          list: [
            "**Куда отправляются:** каждое сообщение отправляется с нашего сервера AI-провайдеру, который обслуживает выбранную модель. В зависимости от модели и доступности: OpenRouter, OmniRoute, Perplexity, Groq, Cerebras, SambaNova, Mistral, OpenAI, NVIDIA NIM, RSI AI. OmniRoute — наш шлюз маршрутизации, он передаёт запрос подключённым к нему провайдерам. Если основные провайдеры недоступны — бесплатные резервные шлюзы (LLM7, Experiential Labs). Эмбеддинги текста для базы знаний и кеша ответов вычисляются через OpenRouter.",
            "**Какая модель ответила:** под каждым ответом показаны модель, которая на самом деле ответила, и число токенов, посчитанное за этот ответ. Если выбранная модель не сработала и ответила другая — мы пишем это открыто («запрошено: X → ответила: Y»).",
            "**Политики провайдеров:** провайдеры обрабатывают запросы по своим условиям и политикам конфиденциальности; некоторые могут хранить или журналировать запросы. Мы это не контролируем и не можем гарантировать, что они не используют данные для обучения. Для конфиденциальных данных включайте приватный режим (Blind Prompting).",
            "**Обучение:** SOVEREIGN не продаёт ваши чаты и не передаёт их провайдерам для обучения. Единственное исключение — наша собственная модель Tella: если в Настройках включено «Обучать Tella 2» (по умолчанию включено), короткие пары «вопрос-ответ» из обычных чатов могут сохраняться без идентификатора аккаунта. Никогда не сохраняются: чаты с файлами, базой знаний, памятью, подключёнными сервисами, присланными ссылками, собственными навыками или в приватном режиме, а также текст, в котором найдены email, телефон, номер карты или API-ключ. Если отключить это в Настройках → Данные и приватность, новые примеры не собираются.",
            "**Кеш ответов:** простые вопросы без личного контекста (без памяти, файлов, ссылок и базы знаний) записываются в общий кеш как текст вопроса и ответа, без идентификатора аккаунта, и 24 часа используются для быстрого ответа на такие же вопросы — в том числе другим пользователям.",
            "**Созданные изображения:** созданные изображения и видео хранятся только в вашем браузере; на сервер (и на другие ваши устройства) вместо них синхронизируется только отметка.",
            "**Удаление:** чат можно удалить из списка по отдельности; Настройки → Данные и приватность → «Удалить все данные» удаляет из нашей базы все чаты (вместе с сообщениями) и память. Примеры для обучения и записи кеша хранятся без идентификатора аккаунта, поэтому их нельзя найти по вашему аккаунту, и так они не удаляются. Чтобы полностью удалить аккаунт, напишите нам.",
          ],
        },
        {
          h: "Blind Prompting",
          body: "Когда включён приватный режим (Blind Prompting), конфиденциальные фрагменты — имена, номера, названия компаний и т. п. — маскируются в вашем браузере до отправки запроса модели, поэтому AI-провайдеры их не видят. Маскирование автоматическое и основано на шаблонах — отдельные детали могут быть пропущены. Если режим выключен, текст запроса отправляется провайдеру без изменений.",
        },
        {
          h: "Как мы используем данные",
          body: "Мы используем данные только для предоставления сервиса, управления вашим аккаунтом, обеспечения безопасности и выполнения законных обязательств. **Мы не продаём ваши данные** и не передаём их третьим лицам для рекламы.",
        },
        {
          h: "Сторонние сервисы",
          body: "Для работы Сервиса используются: поставщики моделей ИИ (для обработки ваших запросов — список выше), хостинг (Vercel), база данных (Supabase) и платёжные шлюзы (Dodo Payments, крипто). У каждого из них своя политика конфиденциальности.",
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
            "**Chats and memory:** your chats, the facts saved by memory and your knowledge-base documents are stored in our database (Supabase), linked to your account. Only your account can read them and the database provider encrypts them at rest, but they are **not end-to-end encrypted** — our server reads them in order to answer you.",
            "**Payment:** processed by the payment gateway (Dodo Payments / crypto / RollyPay SBP); we do not store your card details.",
          ],
        },
        {
          id: "chat-data",
          h: "Your chats and AI models",
          list: [
            "**Where they go:** each message is sent from our server to the AI provider that runs the model you chose. Depending on the model and availability: OpenRouter, OmniRoute, Perplexity, Groq, Cerebras, SambaNova, Mistral, OpenAI, NVIDIA NIM, RSI AI. OmniRoute is our routing gateway; it forwards the request to the providers connected to it. If the main providers fail, free backup gateways are used (LLM7, Experiential Labs). Text embeddings for the knowledge base and answer cache are computed via OpenRouter.",
            "**Which model answered:** under every reply we show the model that actually answered and the tokens counted for that reply. If the model you chose failed and a different one answered, we say so openly (\"requested: X → answered by: Y\").",
            "**Provider policies:** these providers process requests under their own terms and privacy policies; some may store or log requests. We do not control this and cannot guarantee that they do not use data for training. For sensitive data, turn on private mode (Blind Prompting).",
            "**Training:** SOVEREIGN does not sell your chats or give them to providers for training. The only exception is our own model, Tella: if \"Train Tella 2\" is on in Settings (it is on by default), short question-answer pairs from ordinary chats may be saved without your account ID. Never saved: chats that used files, the knowledge base, memory, connected services, links you sent, your own skills or private mode, and any text where an email, phone number, card number or API key was detected. Turn it off in Settings → Data & privacy and no new samples are collected.",
            "**Answer cache:** simple questions without personal context (no memory, files, links or knowledge base) are written to a shared cache as question and answer text, without your account ID, and are used for 24 hours to answer identical questions faster — including for other users.",
            "**Generated images:** generated images and videos are kept only in your browser; only a placeholder is synced to our server (and your other devices) in their place.",
            "**Deletion:** you can delete a single chat from the list; Settings → Data & privacy → \"Delete all data\" deletes all your chats (with their messages) and memory from our database. Training samples and cache entries are stored without an account ID, so they cannot be traced back to you and are not removed this way. To delete your account completely, email us.",
          ],
        },
        {
          h: "Blind Prompting",
          body: "When private mode (Blind Prompting) is on, sensitive fragments such as names, numbers and company names are masked in your browser before the request is sent to an AI model, so AI providers do not see them. Masking is automatic and pattern-based and may miss some details. When the mode is off, the request text is sent to the provider unchanged.",
        },
        {
          h: "How we use data",
          body: "We use data only to provide the service, manage your account, ensure security and meet legal obligations. **We do not sell your data** and do not share it with third parties for advertising.",
        },
        {
          h: "Third-party services",
          body: "To operate the Service we use: AI model providers (to process your requests — listed above), hosting (Vercel), a database (Supabase) and payment gateways (Dodo Payments, crypto). Each has its own privacy policy.",
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
