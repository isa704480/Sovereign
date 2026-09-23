import type { AgentMode } from "@/config/agent-modes";
import type { SovereignModel } from "@/config/models";
import type { ModelThemeSpec } from "@/config/model-themes";
import { pick, type Lang, type L10n, type TKey } from "@/lib/i18n";

/**
 * Config (agent-modes, models, model-themes, OmniRoute tavsiyalari) ichidagi
 * o'zbekcha matnlarning tarjimalari. Config shakli o'zgarmaydi (server ham
 * ishlatadi) — komponentlar shu yordamchilar orqali ko'rsatadi. Tarjima
 * topilmasa asl matn qaytadi.
 */

// ---- Agent rejimlari ----
const AGENT_MODE_L10N: Record<string, { name: L10n; description: L10n }> = {
  general: {
    name: { uz: "Umumiy", "uz-cyrl": "Умумий", ru: "Общий", en: "General" },
    description: {
      uz: "Oddiy suhbat va yordam.",
      "uz-cyrl": "Оддий суҳбат ва ёрдам.",
      ru: "Обычный разговор и помощь.",
      en: "Everyday chat and help.",
    },
  },
  developer: {
    name: { uz: "Dasturchi", "uz-cyrl": "Дастурчи", ru: "Разработчик", en: "Developer" },
    description: {
      uz: "Kod yozadi, tuzatadi, test rejasini beradi.",
      "uz-cyrl": "Код ёзади, тузатади, тест режасини беради.",
      ru: "Пишет и исправляет код, даёт план тестирования.",
      en: "Writes and fixes code, gives a test plan.",
    },
  },
  researcher: {
    name: { uz: "Tadqiqotchi", "uz-cyrl": "Тадқиқотчи", ru: "Исследователь", en: "Researcher" },
    description: {
      uz: "Internetdan qidiradi, manba bilan javob beradi.",
      "uz-cyrl": "Интернетдан қидиради, манба билан жавоб беради.",
      ru: "Ищет в интернете, отвечает с источниками.",
      en: "Searches the web, answers with sources.",
    },
  },
  business: {
    name: { uz: "Biznes tahlil", "uz-cyrl": "Бизнес таҳлил", ru: "Бизнес-анализ", en: "Business analysis" },
    description: {
      uz: "Bozor tahlili, raqobat, hisobot va jadval.",
      "uz-cyrl": "Бозор таҳлили, рақобат, ҳисобот ва жадвал.",
      ru: "Анализ рынка, конкуренты, отчёты и таблицы.",
      en: "Market analysis, competition, reports and tables.",
    },
  },
  writer: {
    name: { uz: "Yozuvchi", "uz-cyrl": "Ёзувчи", ru: "Писатель", en: "Writer" },
    description: {
      uz: "Matn yozadi va tahrirlaydi.",
      "uz-cyrl": "Матн ёзади ва таҳрирлайди.",
      ru: "Пишет и редактирует тексты.",
      en: "Writes and edits text.",
    },
  },
};

export function agentModeName(lang: Lang, m: AgentMode): string {
  const l = AGENT_MODE_L10N[m.id];
  return l ? pick(lang, l.name) : m.name;
}

export function agentModeDescription(lang: Lang, m: AgentMode): string {
  const l = AGENT_MODE_L10N[m.id];
  return l ? pick(lang, l.description) : m.description;
}

// ---- Modellar: provider va narx yorlig'i (ModelSwitcher) ----
const PROVIDER_L10N: Record<string, L10n> = {
  "Aqlli yo'naltirish": { uz: "Aqlli yo'naltirish", "uz-cyrl": "Ақлли йўналтириш", ru: "Умная маршрутизация", en: "Smart routing" },
  "Meta AI (Ochiq)": { uz: "Meta AI (Ochiq)", "uz-cyrl": "Meta AI (Очиқ)", ru: "Meta AI (открытая)", en: "Meta AI (open)" },
};

const PRICE_L10N: Record<string, L10n> = {
  Tekin: { uz: "Tekin", "uz-cyrl": "Текин", ru: "Бесплатно", en: "Free" },
  Aqlli: { uz: "Aqlli", "uz-cyrl": "Ақлли", ru: "Умный", en: "Smart" },
  "O'zimizniki": { uz: "O'zimizniki", "uz-cyrl": "Ўзимизники", ru: "Собственная", en: "In-house" },
  "$0.001/qidiruv": { uz: "$0.001/qidiruv", "uz-cyrl": "$0.001/қидирув", ru: "$0.001/запрос", en: "$0.001/search" },
};

export function modelProvider(lang: Lang, m: SovereignModel): string {
  const l = PROVIDER_L10N[m.provider];
  return l ? pick(lang, l) : m.provider;
}

export function modelPrice(lang: Lang, m: SovereignModel): string {
  const l = PRICE_L10N[m.price];
  return l ? pick(lang, l) : m.price;
}

// ---- OmniRoute "Tekin — tavsiya" ro'yxati (id bo'yicha) ----
const FEATURED_L10N: Record<string, { label?: L10n; note: L10n }> = {
  "auto/best-free": {
    label: { uz: "Eng yaxshi tekin", "uz-cyrl": "Энг яхши текин", ru: "Лучшая бесплатная", en: "Best free" },
    note: {
      uz: "har safar eng saxiy tekin model",
      "uz-cyrl": "ҳар сафар энг сахий текин модел",
      ru: "каждый раз самая щедрая бесплатная модель",
      en: "the most generous free model every time",
    },
  },
  "auto/coding:free": {
    label: { uz: "Kod — tekin", "uz-cyrl": "Код — текин", ru: "Код — бесплатно", en: "Code — free" },
    note: {
      uz: "kod uchun eng yaxshi tekin",
      "uz-cyrl": "код учун энг яхши текин",
      ru: "лучшая бесплатная для кода",
      en: "best free model for code",
    },
  },
  "auto/claude-sonnet": {
    note: {
      uz: "Anthropic — tekin yo'naltirish",
      "uz-cyrl": "Anthropic — текин йўналтириш",
      ru: "Anthropic — бесплатная маршрутизация",
      en: "Anthropic — free routing",
    },
  },
  "auto/gemini": { note: { uz: "Google — 60M/oy", "uz-cyrl": "Google — 60M/ой", ru: "Google — 60M/мес", en: "Google — 60M/mo" } },
  "auto/llama": { note: { uz: "Meta — 30M/oy", "uz-cyrl": "Meta — 30M/ой", ru: "Meta — 30M/мес", en: "Meta — 30M/mo" } },
  "auto/glm": { note: { uz: "Zhipu — 30M/oy", "uz-cyrl": "Zhipu — 30M/ой", ru: "Zhipu — 30M/мес", en: "Zhipu — 30M/mo" } },
  "auto/gemma": { note: { uz: "Google — 20M/oy", "uz-cyrl": "Google — 20M/ой", ru: "Google — 20M/мес", en: "Google — 20M/mo" } },
  "auto/minimax": { note: { uz: "20M/oy", "uz-cyrl": "20M/ой", ru: "20M/мес", en: "20M/mo" } },
};

export function featuredLabel(lang: Lang, id: string, fallback: string): string {
  const l = FEATURED_L10N[id]?.label;
  return l ? pick(lang, l) : fallback;
}

export function featuredNote(lang: Lang, id: string, fallback: string): string {
  const l = FEATURED_L10N[id]?.note;
  return l ? pick(lang, l) : fallback;
}

// ---- Welcome takliflari (faqat SOVEREIGN temasi ishlatiladi) ----
const SOVEREIGN_SUGGESTIONS: L10n[] = [
  {
    uz: "Bugungi vazifalarimni rejalashtir",
    "uz-cyrl": "Бугунги вазифаларимни режалаштир",
    ru: "Спланируй мои задачи на сегодня",
    en: "Plan my tasks for today",
  },
  {
    uz: "Bu matnni professional ohangda qayta yoz",
    "uz-cyrl": "Бу матнни профессионал оҳангда қайта ёз",
    ru: "Перепиши этот текст в профессиональном тоне",
    en: "Rewrite this text in a professional tone",
  },
  {
    uz: "Python'da fayl o'qish misolini ko'rsat",
    "uz-cyrl": "Python'да файл ўқиш мисолини кўрсат",
    ru: "Покажи пример чтения файла на Python",
    en: "Show an example of reading a file in Python",
  },
  {
    uz: "Startap uchun pitch tuzish yordam ber",
    "uz-cyrl": "Стартап учун питч тузишга ёрдам бер",
    ru: "Помоги составить питч для стартапа",
    en: "Help me build a pitch for a startup",
  },
];

export function themeSuggestions(lang: Lang, theme: ModelThemeSpec): string[] {
  return theme.id === "sovereign" ? SOVEREIGN_SUGGESTIONS.map((s) => pick(lang, s)) : theme.suggestions;
}

// ---- Suhbat sarlavhasi ----
/** Store yangi suhbatga shu sarlavhani beradi (src/store/chat.ts). */
const DEFAULT_CONV_TITLE = "Yangi suhbat";

/** Standart sarlavhani joriy tilda ko'rsatadi; foydalanuvchi/AI bergan sarlavha o'zgarmaydi. */
export function convTitle(title: string | null | undefined, t: (key: TKey) => string): string {
  return !title || title === DEFAULT_CONV_TITLE ? t("newChat") : title;
}

// ---- Sana/vaqt formati ----
const LOCALE: Record<Lang, string> = { uz: "uz-UZ", "uz-cyrl": "uz-Cyrl-UZ", ru: "ru-RU", en: "en-US" };

export function localeOf(lang: Lang): string {
  return LOCALE[lang];
}
