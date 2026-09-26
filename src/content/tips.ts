import type { L10n } from "@/lib/i18n";

/**
 * "Platformani shunday ishlatib ko'ring" maslahatlari — ilovadagi 30 soatlik karta
 * (TipCard) va opt-in tip emaillari shu ro'yxatdan navbat bilan oladi.
 *
 * Har bir maslahat HAQIQIY imkoniyatga mos (kodda tekshirilgan):
 *  - image       — InputArea "+" menyu → uxCreateImage; detectImageIntent ("draw …")
 *  - blind       — InputArea "Maxfiy rejim" chip → setBlindPrompting (Blind Prompting)
 *  - mention     — KnowledgePanel + InputArea "@" mention (chKbHint)
 *  - research    — InputArea research chip; Pro/Ultra (plans.limits.research)
 *  - cli         — CliInstall: `irm …/install.ps1 | iex`, `curl -fsSL …/install.sh | sh`
 *  - memory      — MemoryPanel
 *  - skills      — SkillsMarket / SkillPicker
 *  - shortcuts   — Dashboard: Ctrl+K, Ctrl+N, Ctrl+/, Esc (oqimni to'xtatadi)
 *  - projects    — Sidebar "Yangi loyiha" + loyiha ko'rsatmasi
 *  - connectors  — ConnectorsPanel "public-apis" (kalitsiz)
 *  - cowork      — CoworkPanel (Chrome/Edge jonli papka)
 *  - agent-modes — InputArea agent rejimi (Dasturchi / Tadqiqotchi / Biznes / Yozuvchi)
 *  - artifact    — Dashboard HTML/SVG javobni ArtifactPanel'da avtomatik ochadi
 *  - share       — ChatHeader "Ulashish" (faqat o'qish uchun havola)
 *  - auto        — ModelSwitcher "SOVEREIGN Auto"
 */

/** "Sinab ko'rish" tugmasi nima qiladi. Yo'q bo'lsa — faqat matn. */
export type TipAction =
  | { kind: "draft"; text: L10n }
  | { kind: "open"; panel: "memory" | "knowledge" | "skills" | "connectors" | "cowork" }
  | { kind: "research" }
  | { kind: "blind" }
  | { kind: "model" }
  | { kind: "copy"; text: string };

export interface Tip {
  id: string;
  title: L10n;
  body: L10n;
  action?: TipAction;
}

const SITE = "https://soveregn.xyz";

export const TIPS: readonly Tip[] = [
  {
    id: "image",
    title: {
      uz: "Matndan rasm yarating",
      "uz-cyrl": "Матндан расм яратинг",
      ru: "Создавайте картинки из текста",
      en: "Turn words into images",
    },
    body: {
      uz: "\"+\" → \"Rasm yaratish\" ni bosing yoki shunchaki \"… logotipini chizib ber\" deb yozing. Nisbat (kvadrat, keng, tik) o'zi tanlanadi.",
      "uz-cyrl": "\"+\" → \"Расм яратиш\" ни босинг ёки шунчаки \"… логотипини чизиб бер\" деб ёзинг. Нисбат (квадрат, кенг, тик) ўзи танланади.",
      ru: "Нажмите «+» → «Создать изображение» или просто напишите «нарисуй логотип …». Формат (квадрат, широкий, вертикальный) подберётся сам.",
      en: "Tap \"+\" → Create image, or just type \"draw a logo for …\". The shape (square, wide, tall) is picked for you.",
    },
    action: {
      kind: "draft",
      text: {
        uz: "Nur nomli qahvaxona uchun minimalistik logotip chizib ber",
        "uz-cyrl": "Нур номли қаҳвахона учун минималистик логотип чизиб бер",
        ru: "Нарисуй минималистичный логотип для кофейни «Нур»",
        en: "Draw a minimalist logo for a coffee shop called Nur",
      },
    },
  },
  {
    id: "blind",
    title: {
      uz: "Shaxsiy ma'lumotni AI'dan yashiring",
      "uz-cyrl": "Шахсий маълумотни AI'дан яширинг",
      ru: "Скрывайте личные данные от ИИ",
      en: "Keep personal data away from the AI",
    },
    body: {
      uz: "\"Maxfiy rejim\" (Blind Prompting) ism, telefon, email va boshqa shaxsiy ma'lumotlarni model ko'rmasidan oldin maskalaydi — javobda esa asl holiga qaytaradi.",
      "uz-cyrl": "\"Махфий режим\" (Blind Prompting) исм, телефон, email ва бошқа шахсий маълумотларни модел кўрмасидан олдин маскалайди — жавобда эса асл ҳолига қайтаради.",
      ru: "«Приватный режим» (Blind Prompting) маскирует имена, телефоны, email и другие личные данные до того, как их увидит модель, а в ответе возвращает их обратно.",
      en: "Private mode (Blind Prompting) masks names, phone numbers, emails and other personal data before the model sees them, then puts them back in the answer.",
    },
    action: { kind: "blind" },
  },
  {
    id: "mention",
    title: {
      uz: "Hujjatingizni @ bilan chaqiring",
      "uz-cyrl": "Ҳужжатингизни @ билан чақиринг",
      ru: "Ссылайтесь на документы через @",
      en: "Pull in a document with @",
    },
    body: {
      uz: "PDF, matn yoki kodni Bilimlar bazasiga yuklang, keyin chatda @ yozib hujjatni tanlang — AI shu hujjat asosida javob beradi.",
      "uz-cyrl": "PDF, матн ёки кодни Билимлар базасига юкланг, кейин чатда @ ёзиб ҳужжатни танланг — AI шу ҳужжат асосида жавоб беради.",
      ru: "Загрузите PDF, текст или код в Базу знаний, затем наберите @ в чате и выберите документ — ИИ ответит на его основе.",
      en: "Upload a PDF, text or code file to the Knowledge Base, then type @ in the chat and pick it — the AI answers from that document.",
    },
    action: { kind: "open", panel: "knowledge" },
  },
  {
    id: "research",
    title: {
      uz: "Manbali javob uchun Research",
      "uz-cyrl": "Манбали жавоб учун Research",
      ru: "Research — ответы с источниками",
      en: "Research mode for sourced answers",
    },
    body: {
      uz: "Research rejimi internetdan qidiradi va har da'voni manba havolasi bilan beradi. Yangiliklar, narxlar va faktlar uchun qulay (Pro va Ultra).",
      "uz-cyrl": "Research режими интернетдан қидиради ва ҳар даъвони манба ҳаволаси билан беради. Янгиликлар, нархлар ва фактлар учун қулай (Pro ва Ultra).",
      ru: "Режим Research ищет в интернете и подкрепляет утверждения ссылками на источники. Удобно для новостей, цен и фактов (Pro и Ultra).",
      en: "Research mode searches the web and backs claims with source links — great for news, prices and facts (Pro and Ultra).",
    },
    action: { kind: "research" },
  },
  {
    id: "cli",
    title: {
      uz: "Terminalda SOVEREIGN CLI",
      "uz-cyrl": "Терминалда SOVEREIGN CLI",
      ru: "SOVEREIGN CLI в терминале",
      en: "SOVEREIGN in your terminal",
    },
    body: {
      uz: "CLI agent kodingizni o'qiydi, fayl yozadi va buyruq ishlatadi — har xavfli amal oldidan so'raydi. Windows: irm https://soveregn.xyz/install.ps1 | iex · macOS/Linux: curl -fsSL https://soveregn.xyz/install.sh | sh",
      "uz-cyrl": "CLI агент кодингизни ўқийди, файл ёзади ва буйруқ ишлатади — ҳар хавфли амал олдидан сўрайди. Windows: irm https://soveregn.xyz/install.ps1 | iex · macOS/Linux: curl -fsSL https://soveregn.xyz/install.sh | sh",
      ru: "CLI-агент читает код, пишет файлы и запускает команды — перед каждым рискованным действием спрашивает. Windows: irm https://soveregn.xyz/install.ps1 | iex · macOS/Linux: curl -fsSL https://soveregn.xyz/install.sh | sh",
      en: "The CLI agent reads your code, writes files and runs commands — asking before anything risky. Windows: irm https://soveregn.xyz/install.ps1 | iex · macOS/Linux: curl -fsSL https://soveregn.xyz/install.sh | sh",
    },
    action: { kind: "copy", text: `irm ${SITE}/install.ps1 | iex` },
  },
  {
    id: "memory",
    title: {
      uz: "AI sizni eslab qolsin",
      "uz-cyrl": "AI сизни эслаб қолсин",
      ru: "Пусть ИИ вас помнит",
      en: "Let the AI remember you",
    },
    body: {
      uz: "Xotira ismingiz, loyihalaringiz va uslubingizni suhbatlar orasida eslaydi. Xotira panelida nimani eslaganini ko'rib, keraksizini o'chirasiz.",
      "uz-cyrl": "Хотира исмингиз, лойиҳаларингиз ва услубингизни суҳбатлар орасида эслайди. Хотира панелида нимани эслаганини кўриб, кераксизини ўчирасиз.",
      ru: "Память хранит ваше имя, проекты и стиль между чатами. В панели «Память» видно, что запомнено, и лишнее можно удалить.",
      en: "Memory keeps your name, projects and style across chats. Open the Memory panel to see what it remembers and delete anything you don't want kept.",
    },
    action: { kind: "open", panel: "memory" },
  },
  {
    id: "skills",
    title: {
      uz: "Skills — tayyor ko'nikmalar",
      "uz-cyrl": "Skills — тайёр кўникмалар",
      ru: "Навыки — готовые умения",
      en: "Add skills to every answer",
    },
    body: {
      uz: "Skills bozorida UI/UX, toza kod va boshqa ko'nikmalarni yoqing yoki o'zingiznikini yozing — ular har javobga qo'shiladi.",
      "uz-cyrl": "Skills бозорида UI/UX, тоза код ва бошқа кўникмаларни ёқинг ёки ўзингизникини ёзинг — улар ҳар жавобга қўшилади.",
      ru: "В маркете навыков включите UI/UX, чистый код и другие — или напишите свой. Они применяются к каждому ответу.",
      en: "Turn on skills like UI/UX or clean code in the Skills market — or write your own. They apply to every answer.",
    },
    action: { kind: "open", panel: "skills" },
  },
  {
    id: "shortcuts",
    title: {
      uz: "Klaviatura tezkor tugmalari",
      "uz-cyrl": "Клавиатура тезкор тугмалари",
      ru: "Горячие клавиши",
      en: "Keyboard shortcuts",
    },
    body: {
      uz: "Ctrl+K — model tanlash, Ctrl+N — yangi suhbat, Ctrl+/ — yozish maydoni, Esc — javobni to'xtatish. Mac'da Ctrl o'rniga ⌘.",
      "uz-cyrl": "Ctrl+K — модел танлаш, Ctrl+N — янги суҳбат, Ctrl+/ — ёзиш майдони, Esc — жавобни тўхтатиш. Mac'да Ctrl ўрнига ⌘.",
      ru: "Ctrl+K — выбор модели, Ctrl+N — новый чат, Ctrl+/ — поле ввода, Esc — остановить ответ. На Mac вместо Ctrl — ⌘.",
      en: "Ctrl+K picks a model, Ctrl+N starts a new chat, Ctrl+/ jumps to the input, Esc stops an answer. On a Mac use ⌘ instead of Ctrl.",
    },
    action: { kind: "model" },
  },
  {
    id: "projects",
    title: {
      uz: "Loyihalar bilan tartib",
      "uz-cyrl": "Лойиҳалар билан тартиб",
      ru: "Порядок с проектами",
      en: "Organize work into projects",
    },
    body: {
      uz: "Yon paneldagi \"Yangi loyiha\" bilan suhbatlarni guruhlang va loyiha ko'rsatmasini yozing (masalan, \"har doim TypeScript'da yoz\") — u shu loyihadagi har suhbatga qo'shiladi.",
      "uz-cyrl": "Ён панелдаги \"Янги лойиҳа\" билан суҳбатларни гуруҳланг ва лойиҳа кўрсатмасини ёзинг (масалан, \"ҳар доим TypeScript'да ёз\") — у шу лойиҳадаги ҳар суҳбатга қўшилади.",
      ru: "Создайте «Новый проект» в боковой панели, сгруппируйте чаты и добавьте инструкцию (например, «всегда пиши на TypeScript») — она применится к каждому чату проекта.",
      en: "Create a New project in the sidebar to group chats and add project instructions (e.g. \"always write TypeScript\") — they're added to every chat in it.",
    },
  },
  {
    id: "connectors",
    title: {
      uz: "Real vaqt ma'lumotlari",
      "uz-cyrl": "Реал вақт маълумотлари",
      ru: "Данные в реальном времени",
      en: "Live data, no keys needed",
    },
    body: {
      uz: "\"Ommaviy API'lar\" connectorini yoqing — AI ob-havo, valyuta kursi, kripto narxi va vaqtni real manbadan oladi.",
      "uz-cyrl": "\"Оммавий API'лар\" коннекторини ёқинг — AI об-ҳаво, валюта курси, крипто нархи ва вақтни реал манбадан олади.",
      ru: "Включите коннектор «Открытые API» — ИИ будет брать погоду, курсы валют, цены криптовалют и время из реальных источников.",
      en: "Switch on the Public APIs connector and the AI fetches real weather, exchange rates, crypto prices and time.",
    },
    action: { kind: "open", panel: "connectors" },
  },
  {
    id: "cowork",
    title: {
      uz: "Cowork: papkangiz bilan ishlang",
      "uz-cyrl": "Cowork: папкангиз билан ишланг",
      ru: "Cowork: работа с вашей папкой",
      en: "Cowork with a local folder",
    },
    body: {
      uz: "Kompyuteringizdagi papkani oching va kerakli faylni chatda @ bilan biriktiring; xohlasangiz AI fayllar ro'yxatini ham ko'radi. Papka serverga yuklanmaydi (Chrome yoki Edge).",
      "uz-cyrl": "Компьютерингиздаги папкани очинг ва керакли файлни чатда @ билан бириктиринг; хоҳласангиз AI файллар рўйхатини ҳам кўради. Папка серверга юкланмайди (Chrome ёки Edge).",
      ru: "Откройте папку на компьютере и прикрепляйте нужные файлы в чате через @; по желанию ИИ увидит и список файлов. Папка не загружается на сервер (Chrome или Edge).",
      en: "Open a folder from your computer and attach files in the chat with @; optionally let the AI see the file list. The folder is never uploaded (Chrome or Edge).",
    },
    action: { kind: "open", panel: "cowork" },
  },
  {
    id: "agent-modes",
    title: {
      uz: "Vazifaga mos agent rejimi",
      "uz-cyrl": "Вазифага мос агент режими",
      ru: "Режим агента под задачу",
      en: "Pick an agent mode",
    },
    body: {
      uz: "Yozish maydonidagi rejim tanlagichda Dasturchi, Tadqiqotchi, Biznes tahlil yoki Yozuvchi rejimini tanlang — AI shu rolda to'liq ishlaydi.",
      "uz-cyrl": "Ёзиш майдонидаги режим танлагичда Дастурчи, Тадқиқотчи, Бизнес таҳлил ёки Ёзувчи режимини танланг — AI шу ролда тўлиқ ишлайди.",
      ru: "В переключателе режимов у поля ввода выберите «Разработчик», «Исследователь», «Бизнес-анализ» или «Автор» — ИИ будет работать в этой роли.",
      en: "Use the mode picker by the input to choose Developer, Researcher, Business analysis or Writer — the AI works the task in that role.",
    },
  },
  {
    id: "artifact",
    title: {
      uz: "Sayt so'rang — darhol ko'ring",
      "uz-cyrl": "Сайт сўранг — дарҳол кўринг",
      ru: "Попросите сайт — и сразу смотрите",
      en: "Ask for a page, see it live",
    },
    body: {
      uz: "AI HTML sahifa yozsa, u yon panelda jonli preview sifatida ochiladi — nusxalash yoki yuklab olish mumkin.",
      "uz-cyrl": "AI HTML саҳифа ёзса, у ён панелда жонли preview сифатида очилади — нусхалаш ёки юклаб олиш мумкин.",
      ru: "Если ИИ пишет HTML-страницу, она открывается в боковой панели как живое превью — можно скопировать или скачать.",
      en: "When the AI writes an HTML page it opens as a live preview in the side panel — ready to copy or download.",
    },
    action: {
      kind: "draft",
      text: {
        uz: "Novvoyxona uchun bir sahifali landing saytni HTML'da yarat",
        "uz-cyrl": "Новвойхона учун бир саҳифали лендинг сайтни HTML'да ярат",
        ru: "Сделай одностраничный лендинг для пекарни на HTML",
        en: "Build a one-page landing site for a bakery in HTML",
      },
    },
  },
  {
    id: "auto",
    title: {
      uz: "Modelni Auto'ga qo'ying",
      "uz-cyrl": "Моделни Auto'га қўйинг",
      ru: "Доверьте выбор модели Auto",
      en: "Let Auto choose the model",
    },
    body: {
      uz: "SOVEREIGN Auto har savolga mos modelni o'zi tanlaydi: kod, ijod, matematika yoki umumiy. Aniq model kerak bo'lsa — Ctrl+K.",
      "uz-cyrl": "SOVEREIGN Auto ҳар саволга мос моделни ўзи танлайди: код, ижод, математика ёки умумий. Аниқ модел керак бўлса — Ctrl+K.",
      ru: "SOVEREIGN Auto сам подбирает модель под вопрос: код, творчество, математика или общее. Нужна конкретная — Ctrl+K.",
      en: "SOVEREIGN Auto picks the right model for each question — code, creative, math or general. Want a specific one? Ctrl+K.",
    },
    action: { kind: "model" },
  },
];

/** Ilovadagi maslahat kartasi oralig'i. */
export const TIP_INTERVAL_MS = 30 * 60 * 60 * 1000;

/** localStorage: oxirgi maslahat ko'rsatilgan vaqt (ms) va navbatdagi indeks. */
export const TIP_LAST_AT_KEY = "sov-tip-last-at";
export const TIP_INDEX_KEY = "sov-tip-index";

/** `n`-maslahat (navbat aylanadi, manfiy/NaN → 0). */
export function tipAt(n: number): Tip {
  const i = Number.isFinite(n) && n >= 0 ? Math.floor(n) % TIPS.length : 0;
  return TIPS[i];
}

/** Maslahat ko'rsatish vaqti keldimi (oxirgi ko'rsatilgandan ≥ 30 soat). */
export function tipDue(lastShownAt: number | null, now: number): boolean {
  if (lastShownAt == null || !Number.isFinite(lastShownAt)) return false;
  // Soat orqaga surilgan bo'lsa (kelajakdagi vaqt) — hisobni qayta boshlaymiz, kartani chiqarmaymiz.
  if (lastShownAt > now) return false;
  return now - lastShownAt >= TIP_INTERVAL_MS;
}
