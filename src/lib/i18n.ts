/**
 * Interfeys tillari. O'zbek (lotin) — asosiy; kirill, rus va ingliz qo'shimcha.
 * Kalitlar qisqa, tarjimalar bir joyda — yangi til qo'shish = bitta ustun.
 */

import { LANDING } from "@/lib/locales/landing";
import { CHAT } from "@/lib/locales/chat";
import { PANELS } from "@/lib/locales/panels";
import { AUTH } from "@/lib/locales/auth";
import { SECURITY } from "@/lib/locales/security";
import { UX } from "@/lib/locales/ux";

export type Lang = "uz" | "uz-cyrl" | "ru" | "en";

export const LANGS: { id: Lang; label: string; short: string; htmlLang: string }[] = [
  { id: "uz", label: "O'zbekcha", short: "UZ", htmlLang: "uz" },
  { id: "uz-cyrl", label: "Ўзбекча", short: "ЎЗ", htmlLang: "uz-Cyrl" },
  { id: "ru", label: "Русский", short: "RU", htmlLang: "ru" },
  { id: "en", label: "English", short: "EN", htmlLang: "en" },
];

export const DEFAULT_LANG: Lang = "uz";

/** Bitta matnning 4 tildagi varianti. */
export type L10n = Record<Lang, string>;
export type Dict = Record<string, L10n>;

/** Server tanlangan tilni shu cookie orqali biladi (LangSync yozadi). */
export const LANG_COOKIE = "sov-lang";

/** Oddiy matn yoki L10n obyektdan kerakli tilni oladi. */
export function pick(lang: Lang, v: string | L10n | undefined | null): string {
  if (v == null) return "";
  return typeof v === "string" ? v : (v[lang] ?? v.uz);
}

/** "{n} ta model" → fmt(s, { n: 5 }) */
export function fmt(s: string, vars: Record<string, string | number>): string {
  return s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

/** AI javob berishi kerak bo'lgan til nomi (system prompt uchun). */
export const LANG_FOR_AI: Record<Lang, string> = {
  uz: "o'zbek tilida (lotin alifbosida)",
  "uz-cyrl": "ўзбек тилида (кирилл алифбосида)",
  ru: "на русском языке",
  en: "in English",
};

const CORE = {
  // Umumiy
  newChat: { uz: "Yangi suhbat", "uz-cyrl": "Янги суҳбат", ru: "Новый чат", en: "New chat" },
  searchChats: { uz: "Suhbatlarni qidirish", "uz-cyrl": "Суҳбатларни қидириш", ru: "Поиск по чатам", en: "Search chats" },
  noChats: { uz: "Hali suhbatlar yo'q", "uz-cyrl": "Ҳали суҳбатлар йўқ", ru: "Пока нет чатов", en: "No chats yet" },
  nothingFound: { uz: "Hech narsa topilmadi", "uz-cyrl": "Ҳеч нарса топилмади", ru: "Ничего не найдено", en: "Nothing found" },
  projects: { uz: "Loyihalar", "uz-cyrl": "Лойиҳалар", ru: "Проекты", en: "Projects" },
  newProject: { uz: "Yangi loyiha", "uz-cyrl": "Янги лойиҳа", ru: "Новый проект", en: "New project" },
  projectName: { uz: "Loyiha nomi ↵", "uz-cyrl": "Лойиҳа номи ↵", ru: "Название проекта ↵", en: "Project name ↵" },
  projectInstructions: { uz: "Loyiha ko'rsatmasi", "uz-cyrl": "Лойиҳа кўрсатмаси", ru: "Инструкция проекта", en: "Project instructions" },
  memory: { uz: "Xotira", "uz-cyrl": "Хотира", ru: "Память", en: "Memory" },
  knowledgeBase: { uz: "Knowledge Base", "uz-cyrl": "Билимлар базаси", ru: "База знаний", en: "Knowledge Base" },
  coworkFolder: { uz: "Cowork papka", "uz-cyrl": "Cowork папка", ru: "Папка Cowork", en: "Cowork folder" },
  skills: { uz: "Skills", "uz-cyrl": "Skills", ru: "Навыки", en: "Skills" },
  researchMode: { uz: "Research rejim", "uz-cyrl": "Research режим", ru: "Режим Research", en: "Research mode" },
  privateMode: { uz: "Maxfiy rejim", "uz-cyrl": "Махфий режим", ru: "Приватный режим", en: "Private mode" },
  settings: { uz: "Sozlamalar", "uz-cyrl": "Созламалар", ru: "Настройки", en: "Settings" },
  upgrade: { uz: "Oshirish", "uz-cyrl": "Ошириш", ru: "Улучшить", en: "Upgrade" },
  logout: { uz: "Chiqish", "uz-cyrl": "Чиқиш", ru: "Выйти", en: "Log out" },
  close: { uz: "Yopish", "uz-cyrl": "Ёпиш", ru: "Закрыть", en: "Close" },
  send: { uz: "Yuborish", "uz-cyrl": "Юбориш", ru: "Отправить", en: "Send" },
  stop: { uz: "To'xtatish", "uz-cyrl": "Тўхтатиш", ru: "Остановить", en: "Stop" },
  typeMessage: { uz: "Xabar yozing...", "uz-cyrl": "Хабар ёзинг...", ru: "Напишите сообщение...", en: "Type a message..." },
  attachFile: { uz: "Fayl biriktirish", "uz-cyrl": "Файл бириктириш", ru: "Прикрепить файл", en: "Attach file" },
  addSource: { uz: "Manba qo'shish", "uz-cyrl": "Манба қўшиш", ru: "Добавить источник", en: "Add source" },
  share: { uz: "Ulashish", "uz-cyrl": "Улашиш", ru: "Поделиться", en: "Share" },
  linkCopied: { uz: "Havola nusxalandi", "uz-cyrl": "Ҳавола нусхаланди", ru: "Ссылка скопирована", en: "Link copied" },
  copy: { uz: "Nusxa olish", "uz-cyrl": "Нусха олиш", ru: "Копировать", en: "Copy" },
  copied: { uz: "Nusxalandi", "uz-cyrl": "Нусхаланди", ru: "Скопировано", en: "Copied" },
  edit: { uz: "Tahrirlash", "uz-cyrl": "Таҳрирлаш", ru: "Изменить", en: "Edit" },
  cancel: { uz: "Bekor", "uz-cyrl": "Бекор", ru: "Отмена", en: "Cancel" },
  regenerate: { uz: "Qayta yaratish", "uz-cyrl": "Қайта яратиш", ru: "Сгенерировать заново", en: "Regenerate" },
  aiDisclaimer: {
    uz: "AI xato qilishi mumkin, muhim ma'lumotlarni tekshiring.",
    "uz-cyrl": "AI хато қилиши мумкин, муҳим маълумотларни текширинг.",
    ru: "ИИ может ошибаться, проверяйте важную информацию.",
    en: "AI can make mistakes. Check important information.",
  },
  // Welcome
  greeting: { uz: "SOVEREIGN'ga xush kelibsiz.", "uz-cyrl": "SOVEREIGN'га хуш келибсиз.", ru: "Добро пожаловать в SOVEREIGN.", en: "Welcome to SOVEREIGN." },
  subGreeting: {
    uz: "Barcha modellar. Bitta interfeys. Ma'lumotlar sizda.",
    "uz-cyrl": "Барча моделлар. Битта интерфейс. Маълумотлар сизда.",
    ru: "Все модели. Один интерфейс. Данные у вас.",
    en: "Every model. One interface. Your data stays yours.",
  },
  // Sozlamalar
  language: { uz: "Til", "uz-cyrl": "Тил", ru: "Язык", en: "Language" },
  languageHint: { uz: "Interfeys va AI javoblari tili.", "uz-cyrl": "Интерфейс ва AI жавоблари тили.", ru: "Язык интерфейса и ответов ИИ.", en: "Interface and AI answer language." },
  appearance: { uz: "Ko'rinish", "uz-cyrl": "Кўриниш", ru: "Внешний вид", en: "Appearance" },
  chatBehavior: { uz: "Chat xatti-harakati", "uz-cyrl": "Чат хатти-ҳаракати", ru: "Поведение чата", en: "Chat behavior" },
  dataPrivacy: { uz: "Ma'lumotlar va maxfiylik", "uz-cyrl": "Маълумотлар ва махфийлик", ru: "Данные и приватность", en: "Data & privacy" },
  plan: { uz: "Tarif", "uz-cyrl": "Тариф", ru: "Тариф", en: "Plan" },
  // Landing
  navFeatures: { uz: "Imkoniyatlar", "uz-cyrl": "Имкониятлар", ru: "Возможности", en: "Features" },
  navModels: { uz: "Modellar", "uz-cyrl": "Моделлар", ru: "Модели", en: "Models" },
  navPricing: { uz: "Narxlar", "uz-cyrl": "Нархлар", ru: "Цены", en: "Pricing" },
  navPrivacy: { uz: "Maxfiylik", "uz-cyrl": "Махфийлик", ru: "Приватность", en: "Privacy" },
  login: { uz: "Kirish", "uz-cyrl": "Кириш", ru: "Войти", en: "Log in" },
  startFree: { uz: "Bepul boshlash", "uz-cyrl": "Бепул бошлаш", ru: "Начать бесплатно", en: "Start free" },
  backToChat: { uz: "Chatbotga qaytish", "uz-cyrl": "Чатботга қайтиш", ru: "Вернуться в чат", en: "Back to chat" },

  // Umumiy amallar
  delete: { uz: "O'chirish", "uz-cyrl": "Ўчириш", ru: "Удалить", en: "Delete" },
  refresh: { uz: "Yangilash", "uz-cyrl": "Янгилаш", ru: "Обновить", en: "Refresh" },
  save: { uz: "Saqlash", "uz-cyrl": "Сақлаш", ru: "Сохранить", en: "Save" },
  confirm: { uz: "Tasdiqlash", "uz-cyrl": "Тасдиқлаш", ru: "Подтвердить", en: "Confirm" },
  notFound: { uz: "Topilmadi", "uz-cyrl": "Топилмади", ru: "Ничего не найдено", en: "Not found" },
  menu: { uz: "Menyu", "uz-cyrl": "Меню", ru: "Меню", en: "Menu" },

  // Sana guruhlari (sidebar)
  dateToday: { uz: "Bugun", "uz-cyrl": "Бугун", ru: "Сегодня", en: "Today" },
  dateYesterday: { uz: "Kecha", "uz-cyrl": "Кеча", ru: "Вчера", en: "Yesterday" },
  dateThisWeek: { uz: "Bu hafta", "uz-cyrl": "Бу ҳафта", ru: "На этой неделе", en: "This week" },
  dateEarlier: { uz: "Oldinroq", "uz-cyrl": "Олдинроқ", ru: "Ранее", en: "Earlier" },

  // Sidebar — loyihalar
  present: { uz: "bor", "uz-cyrl": "бор", ru: "есть", en: "set" },
  projectInstrHint: {
    uz: "Masalan: Bu loyiha Next.js 16 va Tailwind v4. Har doim TypeScript'da yoz.",
    "uz-cyrl": "Масалан: Бу лойиҳа Next.js 16 ва Tailwind v4. Ҳар доим TypeScript'да ёз.",
    ru: "Например: этот проект на Next.js 16 и Tailwind v4. Всегда пиши на TypeScript.",
    en: "For example: this project uses Next.js 16 and Tailwind v4. Always write TypeScript.",
  },
  projectAppliesNote: {
    uz: "Shu loyihadagi har suhbatga qo'shiladi",
    "uz-cyrl": "Шу лойиҳадаги ҳар суҳбатга қўшилади",
    ru: "Добавляется к каждому чату в этом проекте",
    en: "Added to every chat in this project",
  },

  // ChatHeader
  sourcesPanel: { uz: "Manbalar paneli", "uz-cyrl": "Манбалар панели", ru: "Панель источников", en: "Sources panel" },

  // ModelSwitcher
  selectModel: { uz: "Model tanlang", "uz-cyrl": "Модел танланг", ru: "Выберите модель", en: "Select a model" },
  autoSmart: { uz: "Aqlli", "uz-cyrl": "Ақлли", ru: "Умный", en: "Smart" },
  autoModelDesc: {
    uz: "Savolga mos modelni o'zi tanlaydi",
    "uz-cyrl": "Саволга мос моделни ўзи танлайди",
    ru: "Сам выбирает подходящую модель",
    en: "Picks the right model for your question",
  },
  lockedModel: {
    uz: "Bu model yuqoriroq tarifda ochiladi",
    "uz-cyrl": "Бу модел юқорироқ тарифда очилади",
    ru: "Эта модель доступна на более высоком тарифе",
    en: "This model unlocks on a higher plan",
  },

  // Welcome
  hello: { uz: "Salom", "uz-cyrl": "Салом", ru: "Привет", en: "Hello" },

  // TypingIndicator
  typing: { uz: "Yozmoqda", "uz-cyrl": "Ёзмоқда", ru: "Печатает", en: "Typing" },
  searchingWeb: {
    uz: "Internetdan qidirmoqda...",
    "uz-cyrl": "Интернетдан қидирмоқда...",
    ru: "Ищу в интернете...",
    en: "Searching the web...",
  },

  // SourcesPanel
  sources: { uz: "Manbalar", "uz-cyrl": "Манбалар", ru: "Источники", en: "Sources" },
  searchQuery: { uz: "Qidiruv so'zi", "uz-cyrl": "Қидирув сўзи", ru: "Поисковый запрос", en: "Search query" },
  lastUpdate: { uz: "Oxirgi yangilash", "uz-cyrl": "Охирги янгилаш", ru: "Последнее обновление", en: "Last updated" },
  justNow: { uz: "hozirgina", "uz-cyrl": "ҳозиргина", ru: "только что", en: "just now" },
  minutesAgo: { uz: "daqiqa oldin", "uz-cyrl": "дақиқа олдин", ru: "мин. назад", en: "min ago" },
  hoursAgo: { uz: "soat oldin", "uz-cyrl": "соат олдин", ru: "ч. назад", en: "h ago" },

  // VerifierPanel
  verdictCorrect: { uz: "To'g'ri", "uz-cyrl": "Тўғри", ru: "Верно", en: "Correct" },
  verdictSuspicious: { uz: "Shubhali", "uz-cyrl": "Шубҳали", ru: "Сомнительно", en: "Suspicious" },
  verdictUnverifiable: { uz: "Tekshirib bo'lmaydi", "uz-cyrl": "Текшириб бўлмайди", ru: "Невозможно проверить", en: "Unverifiable" },
  factCheck: { uz: "Fakt-tekshirish", "uz-cyrl": "Факт-текшириш", ru: "Проверка фактов", en: "Fact-check" },
  suspiciousFacts: { uz: "ta shubhali fakt", "uz-cyrl": "та шубҳали факт", ru: "сомнительных фактов", en: "suspicious facts" },
  claimsChecked: { uz: "ta da'vo tekshirildi", "uz-cyrl": "та даъво текширилди", ru: "утверждений проверено", en: "claims checked" },

  // MemoryPanel
  memoryKindFact: { uz: "Fakt", "uz-cyrl": "Факт", ru: "Факт", en: "Fact" },
  memoryKindPreference: { uz: "Afzallik", "uz-cyrl": "Афзаллик", ru: "Предпочтение", en: "Preference" },
  memoryKindProject: { uz: "Loyiha", "uz-cyrl": "Лойиҳа", ru: "Проект", en: "Project" },
  memoryKindPerson: { uz: "Shaxs", "uz-cyrl": "Шахс", ru: "Человек", en: "Person" },
  memoryNodes: { uz: "tugun", "uz-cyrl": "тугун", ru: "узлов", en: "nodes" },
  memoryQuestion: { uz: "AI sizni eslab qolsinmi?", "uz-cyrl": "AI сизни эслаб қолсинми?", ru: "Разрешить ИИ запоминать вас?", en: "Let AI remember you?" },
  memoryQuestionDesc: {
    uz: "Ism, loyiha va uslubingizni suhbatlar orasida eslaydi.",
    "uz-cyrl": "Исм, лойиҳа ва услубингизни суҳбатлар орасида эслайди.",
    ru: "Запоминает ваше имя, проекты и стиль между чатами.",
    en: "Remembers your name, projects and style across chats.",
  },
  memoryEmpty: {
    uz: "Hali xotira yo'q. Suhbatlashsangiz, AI muhim faktlarni eslab qoladi.",
    "uz-cyrl": "Ҳали хотира йўқ. Суҳбатлашсангиз, AI муҳим фактларни эслаб қолади.",
    ru: "Пока нет памяти. По мере общения ИИ запомнит важные факты.",
    en: "No memory yet. As you chat, AI will remember key facts.",
  },
  memoryClearAll: { uz: "Barcha xotirani o'chirish", "uz-cyrl": "Барча хотирани ўчириш", ru: "Очистить всю память", en: "Clear all memory" },

  // KnowledgePanel
  kbDocs: { uz: "hujjat", "uz-cyrl": "ҳужжат", ru: "документов", en: "documents" },
  kbIntro: {
    uz: "Hujjatlaringizni (PDF, matn, kod) yuklang. AI shu ma'lumotlar asosida javob beradi.",
    "uz-cyrl": "Ҳужжатларингизни (PDF, матн, код) юкланг. AI шу маълумотлар асосида жавоб беради.",
    ru: "Загрузите документы (PDF, текст, код). ИИ будет отвечать на их основе.",
    en: "Upload your documents (PDF, text, code). AI will answer based on them.",
  },
  kbUpload: { uz: "Fayl yuklash", "uz-cyrl": "Файл юклаш", ru: "Загрузить файл", en: "Upload file" },
  kbUploading: { uz: "Yuklanmoqda", "uz-cyrl": "Юкланмоқда", ru: "Загрузка", en: "Uploading" },
  kbEmpty: {
    uz: "Hali hujjatlar yo'q. Yuqoridan fayl yuklang.",
    "uz-cyrl": "Ҳали ҳужжатлар йўқ. Юқоридан файл юкланг.",
    ru: "Пока нет документов. Загрузите файл выше.",
    en: "No documents yet. Upload a file above.",
  },
  kbIndexing: { uz: "indekslanyapti", "uz-cyrl": "индексланяпти", ru: "индексируется", en: "indexing" },
  kbErrorState: { uz: "xato", "uz-cyrl": "хато", ru: "ошибка", en: "error" },

  // CoworkPanel
  coworkIntro1: {
    uz: "Kompyuteringizdagi papkani oching — AI fayllarni o'zi ko'radi.",
    "uz-cyrl": "Компьютерингиздаги папкани очинг — AI файлларни ўзи кўради.",
    ru: "Откройте папку на компьютере — ИИ сам увидит файлы.",
    en: "Open a folder on your computer — AI sees the files itself.",
  },
  coworkIntro2a: {
    uz: "Rasmni ham qo'lda yuklamaysiz: chatda",
    "uz-cyrl": "Расмни ҳам қўлда юкламайсиз: чатда",
    ru: "Картинку тоже не загружаете вручную: в чате пишете",
    en: "No manual image uploads either: in chat you type",
  },
  coworkIntro2b: {
    uz: "deb yozasiz.",
    "uz-cyrl": "деб ёзасиз.",
    ru: "",
    en: "",
  },
  coworkPickFolder: { uz: "Papkani tanlash", "uz-cyrl": "Папкани танлаш", ru: "Выбрать папку", en: "Choose folder" },
  coworkNoLiveFolder: {
    uz: "Brauzeringiz jonli papkani qo'llamaydi — nusxasi olinadi. Chrome yoki Edge to'liq ishlaydi.",
    "uz-cyrl": "Браузерингиз жонли папкани қўлламайди — нусхаси олинади. Chrome ёки Edge тўлиқ ишлайди.",
    ru: "Ваш браузер не поддерживает живую папку — берётся копия. Chrome или Edge работают полностью.",
    en: "Your browser doesn't support a live folder — a copy is taken. Chrome or Edge work fully.",
  },
  coworkPrivacyNote: {
    uz: "Papka serverga yuklanmaydi. Faqat siz biriktirgan fayl AI'ga boradi.",
    "uz-cyrl": "Папка серверга юкланмайди. Фақат сиз бириктирган файл AI'га боради.",
    ru: "Папка не загружается на сервер. К ИИ идёт только прикреплённый вами файл.",
    en: "The folder isn't uploaded to the server. Only the file you attach goes to the AI.",
  },
  coworkFilesSuffix: { uz: "fayl", "uz-cyrl": "файл", ru: "файлов", en: "files" },
  coworkCopyLabel: { uz: "nusxa", "uz-cyrl": "нусха", ru: "копия", en: "copy" },
  searchFile: { uz: "Fayl qidirish", "uz-cyrl": "Файл қидириш", ru: "Поиск файла", en: "Search file" },
  coworkShowOutline: {
    uz: "AI fayl ro'yxatini ko'rsin",
    "uz-cyrl": "AI файл рўйхатини кўрсин",
    ru: "Показать ИИ список файлов",
    en: "Let AI see the file list",
  },
  coworkShowOutlineDesc: {
    uz: "Faqat nomlar yuboriladi — mazmun emas. AI kerakli faylni o'zi so'raydi.",
    "uz-cyrl": "Фақат номлар юборилади — мазмун эмас. AI керакли файлни ўзи сўрайди.",
    ru: "Отправляются только имена — не содержимое. ИИ сам запросит нужный файл.",
    en: "Only names are sent — not contents. AI will request the file it needs.",
  },
  coworkAtHint_a: { uz: "Chatda", "uz-cyrl": "Чатда", ru: "В чате наберите", en: "In chat, type" },
  coworkAtHint_b: {
    uz: "yozib fayl nomini tanlang — AI o'sha faylni ko'radi.",
    "uz-cyrl": "ёзиб файл номини танланг — AI ўша файлни кўради.",
    ru: "и выберите имя файла — ИИ увидит этот файл.",
    en: "and pick a file name — AI will see that file.",
  },

  // SkillsMarket / SkillPicker
  skillsEnabled: { uz: "yoqilgan", "uz-cyrl": "ёқилган", ru: "включено", en: "enabled" },
  skillsSearch: { uz: "Skill qidirish", "uz-cyrl": "Skill қидириш", ru: "Поиск навыка", en: "Search skill" },
  catAll: { uz: "Barchasi", "uz-cyrl": "Барчаси", ru: "Все", en: "All" },
  catMine: { uz: "Mening skillarim", "uz-cyrl": "Менинг skillарим", ru: "Мои навыки", en: "My skills" },
  skillCustomDesc: { uz: "Siz yaratgan skill", "uz-cyrl": "Сиз яратган skill", ru: "Навык, созданный вами", en: "A skill you created" },
  skillNamePlaceholder: {
    uz: "Skill nomi (masalan: Huquqiy tahlil)",
    "uz-cyrl": "Skill номи (масалан: Ҳуқуқий таҳлил)",
    ru: "Название навыка (например: Юридический анализ)",
    en: "Skill name (e.g. Legal analysis)",
  },
  skillInstrPlaceholder: {
    uz: "AI shu skill yoqilganda nimaga amal qilsin? Aniq qoidalar yozing.",
    "uz-cyrl": "AI шу skill ёқилганда нимага амал қилсин? Аниқ қоидалар ёзинг.",
    ru: "Чему должен следовать ИИ при включённом навыке? Опишите чёткие правила.",
    en: "What should the AI follow when this skill is on? Write clear rules.",
  },
  createSkill: { uz: "O'z skilingizni yarating", "uz-cyrl": "Ўз skilингизни яратинг", ru: "Создайте свой навык", en: "Create your own skill" },
  skillPickerSubtitle: {
    uz: "Ekspert rejimlar. Yoqilganlar har javobga qo'shiladi; mos so'rovlar avtomatik ham faollashadi.",
    "uz-cyrl": "Эксперт режимлар. Ёқилганлар ҳар жавобга қўшилади; мос сўровлар автоматик ҳам фаоллашади.",
    ru: "Экспертные режимы. Включённые добавляются к каждому ответу; подходящие запросы включают их автоматически.",
    en: "Expert modes. Enabled ones apply to every answer; relevant requests trigger them automatically.",
  },

  // MessageItem
  answer: { uz: "Javob", "uz-cyrl": "Жавоб", ru: "Ответ", en: "Answer" },
  sourceWord: { uz: "manba", "uz-cyrl": "манба", ru: "источник(ов)", en: "sources" },
  pageRead: { uz: "Sahifa o'qildi", "uz-cyrl": "Саҳифа ўқилди", ru: "Прочитана страница", en: "Page read" },
  pagesRead: { uz: "sahifa o'qildi", "uz-cyrl": "саҳифа ўқилди", ru: "страниц прочитано", en: "pages read" },
  modelSwitched: { uz: "Model almashtirildi", "uz-cyrl": "Модел алмаштирилди", ru: "Модель заменена", en: "Model switched" },
  fromCache: { uz: "Keshdan", "uz-cyrl": "Кешдан", ru: "Из кэша", en: "From cache" },
  cacheMatch: { uz: "mos", "uz-cyrl": "мос", ru: "совпадение", en: "match" },
  answerError: {
    uz: "Javob olishda xato yuz berdi.",
    "uz-cyrl": "Жавоб олишда хато юз берди.",
    ru: "Произошла ошибка при получении ответа.",
    en: "An error occurred while getting the answer.",
  },
  readAloud: { uz: "Ovozda o'qish", "uz-cyrl": "Овозда ўқиш", ru: "Читать вслух", en: "Read aloud" },
  helpful: { uz: "Foydali", "uz-cyrl": "Фойдали", ru: "Полезно", en: "Helpful" },
  notHelpful: { uz: "Foydasiz", "uz-cyrl": "Фойдасиз", ru: "Бесполезно", en: "Not helpful" },

  // ArtifactPanel
  view: { uz: "Ko'rinish", "uz-cyrl": "Кўриниш", ru: "Просмотр", en: "Preview" },
  editTab: { uz: "Tahrir", "uz-cyrl": "Таҳрир", ru: "Правка", en: "Edit" },
  download: { uz: "Yuklab olish", "uz-cyrl": "Юклаб олиш", ru: "Скачать", en: "Download" },
  artifactDocument: { uz: "Hujjat", "uz-cyrl": "Ҳужжат", ru: "Документ", en: "Document" },
  artifactSvg: { uz: "SVG rasm", "uz-cyrl": "SVG расм", ru: "SVG-изображение", en: "SVG image" },
  artifactSite: { uz: "Sayt", "uz-cyrl": "Сайт", ru: "Сайт", en: "Site" },
  artifactAutoUpdate: {
    uz: "Tahrir qilinganda Ko'rinish o'z-o'zidan yangilanadi",
    "uz-cyrl": "Таҳрир қилинганда Кўриниш ўз-ўзидан янгиланади",
    ru: "При правке предпросмотр обновляется автоматически",
    en: "The preview updates automatically as you edit",
  },
  artifactChars: { uz: "belgi", "uz-cyrl": "белги", ru: "символов", en: "chars" },

  // CreditIndicator / PlanStatusBanner
  yourPlan: { uz: "Tarifingiz", "uz-cyrl": "Тарифингиз", ru: "Ваш тариф", en: "Your plan" },
  planExpiredSuffix: { uz: "muddati tugagan", "uz-cyrl": "муддати тугаган", ru: "истёк", en: "has expired" },
  planExpiresToday: { uz: "Tarif bugun tugaydi", "uz-cyrl": "Тариф бугун тугайди", ru: "Тариф заканчивается сегодня", en: "Plan expires today" },
  planExpiresInPrefix: { uz: "Tarif", "uz-cyrl": "Тариф", ru: "Тариф закончится через", en: "Plan expires in" },
  planExpiresInSuffix: { uz: "kundan keyin tugaydi", "uz-cyrl": "кундан кейин тугайди", ru: "дн.", en: "days" },
  reactivate: { uz: "Qayta yoqish", "uz-cyrl": "Қайта ёқиш", ru: "Возобновить", en: "Reactivate" },
  planExpiredDesc: {
    uz: "Free tarifga tushdingiz. Muddatni qayta yoqish uchun tarifni tanlang.",
    "uz-cyrl": "Free тарифга тушдингиз. Муддатни қайта ёқиш учун тарифни танланг.",
    ru: "Вы перешли на тариф Free. Чтобы возобновить срок, выберите тариф.",
    en: "You've dropped to the Free plan. Choose a plan to reactivate.",
  },
  planExpiringDesc: {
    uz: "Muddat tugagach avtomatik Free tarifga tushasiz.",
    "uz-cyrl": "Муддат тугагач автоматик Free тарифга тушасиз.",
    ru: "По истечении срока вы автоматически перейдёте на Free.",
    en: "When it expires you'll automatically drop to Free.",
  },

  // PricingDialog
  pricingPlans: { uz: "Tariflar", "uz-cyrl": "Тарифлар", ru: "Тарифы", en: "Plans" },
  pricingHeadline: {
    uz: "O'zingizga mos rejani tanlang",
    "uz-cyrl": "Ўзингизга мос режани танланг",
    ru: "Выберите подходящий план",
    en: "Choose the plan that fits you",
  },
  planNeeded: { uz: "Kerakli tarif", "uz-cyrl": "Керакли тариф", ru: "Нужный тариф", en: "Required plan" },
  planPopular: { uz: "Mashhur", "uz-cyrl": "Машҳур", ru: "Популярный", en: "Popular" },
  perMonth: { uz: "oy", "uz-cyrl": "ой", ru: "мес", en: "mo" },
  currentPlan: { uz: "Joriy tarif", "uz-cyrl": "Жорий тариф", ru: "Текущий тариф", en: "Current plan" },
  selectSuffix: { uz: "tanlash", "uz-cyrl": "танлаш", ru: "выбрать", en: "select" },
  choosePayment: { uz: "To'lov usulini tanlang", "uz-cyrl": "Тўлов усулини танланг", ru: "Выберите способ оплаты", en: "Choose a payment method" },
  paymentMethod: { uz: "To'lov usuli", "uz-cyrl": "Тўлов усули", ru: "Способ оплаты", en: "Payment method" },
  payByCard: { uz: "Karta orqali", "uz-cyrl": "Карта орқали", ru: "Картой", en: "By card" },
  payByCardNote: {
    uz: "Har oy avtomatik yangilanadi, istalgan vaqt bekor qilish mumkin.",
    "uz-cyrl": "Ҳар ой автоматик янгиланади, исталган вақт бекор қилиш мумкин.",
    ru: "Продлевается автоматически каждый месяц, можно отменить в любой момент.",
    en: "Renews automatically each month, cancel anytime.",
  },
  payByCrypto: { uz: "Kripto orqali", "uz-cyrl": "Крипто орқали", ru: "Криптовалютой", en: "By crypto" },
  payByCryptoNote: {
    uz: "Bir martalik to'lov — 30 kunga faollashadi.",
    "uz-cyrl": "Бир марталик тўлов — 30 кунга фаоллашади.",
    ru: "Разовый платёж — активируется на 30 дней.",
    en: "One-time payment — activates for 30 days.",
  },
  pricingSecureNote: {
    uz: "Xavfsiz to'lov sahifasiga o'tasiz. Karta ma'lumotlari SOVEREIGN'da saqlanmaydi.",
    "uz-cyrl": "Хавфсиз тўлов саҳифасига ўтасиз. Карта маълумотлари SOVEREIGN'да сақланмайди.",
    ru: "Вы перейдёте на защищённую страницу оплаты. Данные карты не хранятся в SOVEREIGN.",
    en: "You'll go to a secure payment page. Card details aren't stored in SOVEREIGN.",
  },
  redirectingToPayment: {
    uz: "To'lov sahifasiga o'tilmoqda...",
    "uz-cyrl": "Тўлов саҳифасига ўтилмоқда...",
    ru: "Переход на страницу оплаты...",
    en: "Redirecting to payment...",
  },
  paymentNotCreated: { uz: "To'lov yaratilmadi", "uz-cyrl": "Тўлов яратилмади", ru: "Не удалось создать платёж", en: "Payment could not be created" },
  serverUnreachable: { uz: "Serverga ulanib bo'lmadi", "uz-cyrl": "Серверга уланиб бўлмади", ru: "Не удалось подключиться к серверу", en: "Could not reach the server" },

  // SettingsPanel
  planWord: { uz: "tarif", "uz-cyrl": "тариф", ru: "тариф", en: "plan" },
  planUpgradeDesc: {
    uz: "Ko'proq model va imkoniyatlar uchun oshiring.",
    "uz-cyrl": "Кўпроқ модел ва имкониятлар учун оширинг.",
    ru: "Повысьте для доступа к большему числу моделей и возможностей.",
    en: "Upgrade for more models and capabilities.",
  },
  fontSizeTitle: { uz: "Matn o'lchami", "uz-cyrl": "Матн ўлчами", ru: "Размер текста", en: "Text size" },
  fontSizeDesc: { uz: "Chat matni katta-kichikligi.", "uz-cyrl": "Чат матни катта-кичиклиги.", ru: "Размер текста в чате.", en: "Chat text size." },
  densityTitle: { uz: "Zichlik", "uz-cyrl": "Зичлик", ru: "Плотность", en: "Density" },
  densityDesc: { uz: "Xabarlar orasidagi masofa.", "uz-cyrl": "Хабарлар орасидаги масофа.", ru: "Расстояние между сообщениями.", en: "Spacing between messages." },
  densityCompact: { uz: "Zich", "uz-cyrl": "Зич", ru: "Плотно", en: "Compact" },
  densityComfortable: { uz: "Bo'sh", "uz-cyrl": "Бўш", ru: "Свободно", en: "Comfortable" },
  reducedMotionTitle: { uz: "Animatsiyani kamaytirish", "uz-cyrl": "Анимацияни камайтириш", ru: "Уменьшить анимацию", en: "Reduce motion" },
  reducedMotionDesc: {
    uz: "Kichikroq harakatlar, batarey uchun.",
    "uz-cyrl": "Кичикроқ ҳаракатлар, батарея учун.",
    ru: "Меньше движения, экономит батарею.",
    en: "Smaller motion, saves battery.",
  },
  enterToSendTitle: { uz: "Enter — yuborish", "uz-cyrl": "Enter — юбориш", ru: "Enter — отправить", en: "Enter to send" },
  enterToSendDesc: {
    uz: "O'chirilganda Ctrl+Enter bilan yuboriladi.",
    "uz-cyrl": "Ўчирилганда Ctrl+Enter билан юборилади.",
    ru: "Когда выключено, отправка по Ctrl+Enter.",
    en: "When off, send with Ctrl+Enter.",
  },
  streamingTitle: { uz: "Streaming tezligi", "uz-cyrl": "Streaming тезлиги", ru: "Скорость стриминга", en: "Streaming speed" },
  streamingDesc: {
    uz: "Naturali — bo'lakli; Darhol — butun javob birga.",
    "uz-cyrl": "Натурали — бўлакли; Дарҳол — бутун жавоб бирга.",
    ru: "Натуральный — по частям; Мгновенно — весь ответ сразу.",
    en: "Natural — in chunks; Instant — the whole answer at once.",
  },
  streamingNatural: { uz: "Natural", "uz-cyrl": "Натурал", ru: "Натурально", en: "Natural" },
  streamingInstant: { uz: "Darhol", "uz-cyrl": "Дарҳол", ru: "Мгновенно", en: "Instant" },
  autoScrollTitle: { uz: "Avto-scroll", "uz-cyrl": "Авто-скролл", ru: "Автопрокрутка", en: "Auto-scroll" },
  autoScrollDesc: {
    uz: "Javob kelganda pastga o'zi tushadi.",
    "uz-cyrl": "Жавоб келганда пастга ўзи тушади.",
    ru: "При ответе прокручивает вниз автоматически.",
    en: "Scrolls down automatically when a reply arrives.",
  },
  trainingTitle: { uz: "Tella 2 ni o'rgatish", "uz-cyrl": "Tella 2 ни ўргатиш", ru: "Обучать Tella 2", en: "Train Tella 2" },
  trainingDesc: {
    uz: "Savol-javoblaringiz o'z modelimizni yaxshilashda ishlatiladi. Fayl, bilim bazasi va maxfiy rejim hech qachon olinmaydi.",
    "uz-cyrl": "Савол-жавобларингиз ўз моделимизни яхшилашда ишлатилади. Файл, билимлар базаси ва махфий режим ҳеч қачон олинмайди.",
    ru: "Ваши вопросы-ответы помогают улучшать нашу модель. Файлы, база знаний и приватный режим никогда не используются.",
    en: "Your Q&A helps improve our own model. Files, knowledge base and private mode are never used.",
  },
  exportTitle: { uz: "Ma'lumotlarni eksport", "uz-cyrl": "Маълумотларни экспорт", ru: "Экспорт данных", en: "Export data" },
  exportDesc: {
    uz: "Barcha suhbat, xotira va profil — JSON (GDPR).",
    "uz-cyrl": "Барча суҳбат, хотира ва профил — JSON (GDPR).",
    ru: "Все чаты, память и профиль — JSON (GDPR).",
    en: "All chats, memory and profile — JSON (GDPR).",
  },
  exportBtn: { uz: "Eksport", "uz-cyrl": "Экспорт", ru: "Экспорт", en: "Export" },
  deleteAllTitle: { uz: "Barcha ma'lumotni o'chirish", "uz-cyrl": "Барча маълумотни ўчириш", ru: "Удалить все данные", en: "Delete all data" },
  deleteAllDesc: {
    uz: "Suhbatlar va xotira butunlay o'chiriladi.",
    "uz-cyrl": "Суҳбатлар ва хотира бутунлай ўчирилади.",
    ru: "Чаты и память будут удалены полностью.",
    en: "Chats and memory are permanently deleted.",
  },
  confirmDelete: { uz: "Tasdiqlash — o'chirish", "uz-cyrl": "Тасдиқлаш — ўчириш", ru: "Подтвердить — удалить", en: "Confirm — delete" },
  preparing: { uz: "Tayyorlanmoqda...", "uz-cyrl": "Тайёрланмоқда...", ru: "Подготовка...", en: "Preparing..." },
  downloaded: { uz: "Yuklab olindi.", "uz-cyrl": "Юклаб олинди.", ru: "Загружено.", en: "Downloaded." },

  // Onboarding
  onbBack: { uz: "Orqaga", "uz-cyrl": "Орқага", ru: "Назад", en: "Back" },
  onbNext: { uz: "Keyingisi", "uz-cyrl": "Кейингиси", ru: "Далее", en: "Next" },
  onbFinish: { uz: "Yakunlash", "uz-cyrl": "Якунлаш", ru: "Завершить", en: "Finish" },
  onbOther: { uz: "Boshqa", "uz-cyrl": "Бошқа", ru: "Другое", en: "Other" },
  onbOtherDots: { uz: "Boshqa ...", "uz-cyrl": "Бошқа ...", ru: "Другое ...", en: "Other ..." },
  onbAddOther: { uz: "Boshqa qo'shish", "uz-cyrl": "Бошқа қўшиш", ru: "Добавить другое", en: "Add other" },
  onbIndustryPlaceholder: { uz: "Sohangizni yozing", "uz-cyrl": "Соҳангизни ёзинг", ru: "Укажите вашу сферу", en: "Type your field" },
  onbLangPlaceholder: { uz: "Masalan: Turk, Koreys", "uz-cyrl": "Масалан: Турк, Корейс", ru: "Например: турецкий, корейский", en: "e.g. Turkish, Korean" },
  onbCountryPlaceholder: {
    uz: "Davlat nomini yozing — masalan: Ger, Kor, Emi",
    "uz-cyrl": "Давлат номини ёзинг — масалан: Гер, Кор, Эми",
    ru: "Введите название страны — например: Гер, Кор, ОАЭ",
    en: "Type a country name — e.g. Ger, Kor, UAE",
  },
  onbCountryEmpty: {
    uz: "Topilmadi — boshqacha yozib ko'ring.",
    "uz-cyrl": "Топилмади — бошқача ёзиб кўринг.",
    ru: "Не найдено — попробуйте иначе.",
    en: "Not found — try a different spelling.",
  },
  onbSelected: { uz: "Tanlandi", "uz-cyrl": "Танланди", ru: "Выбрано", en: "Selected" },
  onbFirstTime: { uz: "Birinchi marta", "uz-cyrl": "Биринчи марта", ru: "Впервые", en: "First time" },
  onbEveryDay: { uz: "Har kuni", "uz-cyrl": "Ҳар куни", ru: "Каждый день", en: "Every day" },
  onbComplete: { uz: "Ajoyib! Sozlamalaringiz tayyor", "uz-cyrl": "Ажойиб! Созламаларингиз тайёр", ru: "Отлично! Настройки готовы", en: "Great! Your setup is ready" },
  onbRecommendation: { uz: "Siz uchun tavsiya", "uz-cyrl": "Сиз учун тавсия", ru: "Рекомендация для вас", en: "Recommended for you" },
  onbEnter: { uz: "SOVEREIGN'ga kirish", "uz-cyrl": "SOVEREIGN'га кириш", ru: "Войти в SOVEREIGN", en: "Enter SOVEREIGN" },
} as const;

const DICT = { ...CORE, ...LANDING, ...CHAT, ...PANELS, ...AUTH, ...SECURITY, ...UX };

export type TKey = keyof typeof DICT;

export function translate(lang: Lang, key: TKey): string {
  const row = DICT[key] as Record<Lang, string>;
  return row[lang] ?? row.uz;
}

export function isLang(v: unknown): v is Lang {
  return typeof v === "string" && LANGS.some((l) => l.id === v);
}
