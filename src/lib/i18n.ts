/**
 * Interfeys tillari. O'zbek (lotin) — asosiy; kirill, rus va ingliz qo'shimcha.
 * Kalitlar qisqa, tarjimalar bir joyda — yangi til qo'shish = bitta ustun.
 */

export type Lang = "uz" | "uz-cyrl" | "ru" | "en";

export const LANGS: { id: Lang; label: string; short: string; htmlLang: string }[] = [
  { id: "uz", label: "O'zbekcha", short: "UZ", htmlLang: "uz" },
  { id: "uz-cyrl", label: "Ўзбекча", short: "ЎЗ", htmlLang: "uz-Cyrl" },
  { id: "ru", label: "Русский", short: "RU", htmlLang: "ru" },
  { id: "en", label: "English", short: "EN", htmlLang: "en" },
];

export const DEFAULT_LANG: Lang = "uz";

/** AI javob berishi kerak bo'lgan til nomi (system prompt uchun). */
export const LANG_FOR_AI: Record<Lang, string> = {
  uz: "o'zbek tilida (lotin alifbosida)",
  "uz-cyrl": "ўзбек тилида (кирилл алифбосида)",
  ru: "на русском языке",
  en: "in English",
};

const DICT = {
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
} as const;

export type TKey = keyof typeof DICT;

export function translate(lang: Lang, key: TKey): string {
  const row = DICT[key] as Record<Lang, string>;
  return row[lang] ?? row.uz;
}

export function isLang(v: unknown): v is Lang {
  return typeof v === "string" && LANGS.some((l) => l.id === v);
}
