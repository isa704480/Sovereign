/**
 * Config ma'lumotlari (connectors / skills) uchun lokalizatsiya yon-xaritalari.
 * Config obyektlarining shakli o'zgarmaydi (server ularni ishlatadi) — bu yerda
 * faqat ko'rsatiladigan matnlar id bo'yicha tarjima qilinadi. Topilmasa asl matn.
 */

import { pick, translate, type L10n, type Lang } from "@/lib/i18n";
import type { ConnectorCategory, ConnectorSpec } from "@/config/connectors";
import type { Skill, SkillCategory } from "@/config/skills";

// ---------------------------------------------------------------------------
// Connectors
// ---------------------------------------------------------------------------

export const CONNECTOR_CATEGORY_TEXT: Record<ConnectorCategory, L10n> = {
  google: { uz: "Google", "uz-cyrl": "Google", ru: "Google", en: "Google" },
  design: { uz: "Dizayn", "uz-cyrl": "Дизайн", ru: "Дизайн", en: "Design" },
  dev: { uz: "Dasturlash", "uz-cyrl": "Дастурлаш", ru: "Разработка", en: "Development" },
  builtin: { uz: "Ichki", "uz-cyrl": "Ички", ru: "Встроенные", en: "Built-in" },
};

export const CONNECTOR_TEXT: Record<string, { name?: L10n; description: L10n }> = {
  gmail: {
    description: {
      uz: "Xatlarni o'qish.",
      "uz-cyrl": "Хатларни ўқиш.",
      ru: "Чтение писем.",
      en: "Read emails.",
    },
  },
  gdrive: {
    name: { uz: "Google Disk", "uz-cyrl": "Google Диск", ru: "Google Диск", en: "Google Drive" },
    description: {
      uz: "Fayllarni ko'rish.",
      "uz-cyrl": "Файлларни кўриш.",
      ru: "Просмотр файлов.",
      en: "View files.",
    },
  },
  gsheets: {
    description: {
      uz: "Jadvallarni o'qish va tahrirlash.",
      "uz-cyrl": "Жадвалларни ўқиш ва таҳрирлаш.",
      ru: "Чтение и редактирование таблиц.",
      en: "Read and edit spreadsheets.",
    },
  },
  gslides: {
    description: {
      uz: "Taqdimot yaratish.",
      "uz-cyrl": "Тақдимот яратиш.",
      ru: "Создание презентаций.",
      en: "Create presentations.",
    },
  },
  gdocs: {
    description: {
      uz: "Hujjatlarni o'qish.",
      "uz-cyrl": "Ҳужжатларни ўқиш.",
      ru: "Чтение документов.",
      en: "Read documents.",
    },
  },
  gcalendar: {
    name: { uz: "Google Kalendar", "uz-cyrl": "Google Календар", ru: "Google Календарь", en: "Google Calendar" },
    description: {
      uz: "Voqealarni ko'rish.",
      "uz-cyrl": "Воқеаларни кўриш.",
      ru: "Просмотр событий.",
      en: "View events.",
    },
  },
  figma: {
    description: {
      uz: "Fayl va freymlarni o'qish (dizayndan kod).",
      "uz-cyrl": "Файл ва фреймларни ўқиш (дизайндан код).",
      ru: "Чтение файлов и фреймов (код из дизайна).",
      en: "Read files and frames (design to code).",
    },
  },
  github: {
    description: {
      uz: "Repozitoriy va fayllarni o'qish.",
      "uz-cyrl": "Репозиторий ва файлларни ўқиш.",
      ru: "Чтение репозиториев и файлов.",
      en: "Read repositories and files.",
    },
  },
  mcp: {
    name: { uz: "MCP server", "uz-cyrl": "MCP сервер", ru: "MCP-сервер", en: "MCP server" },
    description: {
      uz: "Istalgan MCP serverni URL orqali ulash.",
      "uz-cyrl": "Исталган MCP серверни URL орқали улаш.",
      ru: "Подключение любого MCP-сервера по URL.",
      en: "Connect any MCP server by URL.",
    },
  },
  "cli-terminal": {
    name: { uz: "CLI terminal", "uz-cyrl": "CLI терминал", ru: "CLI-терминал", en: "CLI terminal" },
    description: {
      uz: "`sov` CLI kompyuterda buyruq ishga tushiradi (xavf tekshiruvi bilan).",
      "uz-cyrl": "`sov` CLI компьютерда буйруқ ишга туширади (хавф текшируви билан).",
      ru: "CLI `sov` запускает команды на компьютере (с проверкой рисков).",
      en: "The `sov` CLI runs commands on your computer (with risk checks).",
    },
  },
  browser: {
    name: { uz: "Brauzer", "uz-cyrl": "Браузер", ru: "Браузер", en: "Browser" },
    description: {
      uz: "Loyihani brauzerda ochib test qilish (preview).",
      "uz-cyrl": "Лойиҳани браузерда очиб тест қилиш (preview).",
      ru: "Открыть проект в браузере и протестировать (превью).",
      en: "Open the project in a browser and test it (preview).",
    },
  },
  "public-apis": {
    name: { uz: "Ommaviy API'lar", "uz-cyrl": "Оммавий API'лар", ru: "Публичные API", en: "Public APIs" },
    description: {
      uz: "Kalitsiz (loginsiz) API'lar: ob-havo, valyuta, davlat, kripto, vaqt, lug'at — AI real ma'lumot oladi.",
      "uz-cyrl": "Калитсиз (логинсиз) API'лар: об-ҳаво, валюта, давлат, крипто, вақт, луғат — AI реал маълумот олади.",
      ru: "API без ключей и входа: погода, валюты, страны, крипто, время, словарь — ИИ получает реальные данные.",
      en: "Keyless (no-login) APIs: weather, currency, countries, crypto, time, dictionary — AI gets real data.",
    },
  },
};

export function connectorCategoryLabel(lang: Lang, cat: { id: ConnectorCategory; label: string }): string {
  return pick(lang, CONNECTOR_CATEGORY_TEXT[cat.id]) || cat.label;
}

export function connectorText(lang: Lang, c: ConnectorSpec): { name: string; description: string } {
  const tx = CONNECTOR_TEXT[c.id];
  return {
    name: (tx?.name && pick(lang, tx.name)) || c.name,
    description: (tx && pick(lang, tx.description)) || c.description,
  };
}

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

export const SKILL_CATEGORY_TEXT: Record<SkillCategory, L10n> = {
  code: { uz: "Kod", "uz-cyrl": "Код", ru: "Код", en: "Code" },
  design: { uz: "Dizayn", "uz-cyrl": "Дизайн", ru: "Дизайн", en: "Design" },
  security: { uz: "Xavfsizlik", "uz-cyrl": "Хавфсизлик", ru: "Безопасность", en: "Security" },
  writing: { uz: "Yozish", "uz-cyrl": "Ёзиш", ru: "Тексты", en: "Writing" },
  data: { uz: "Ma'lumot", "uz-cyrl": "Маълумот", ru: "Данные", en: "Data" },
  style: { uz: "Javob uslubi", "uz-cyrl": "Жавоб услуби", ru: "Стиль ответа", en: "Answer style" },
};

export function skillCategoryLabel(lang: Lang, cat: SkillCategory): string {
  return pick(lang, SKILL_CATEGORY_TEXT[cat]) || cat;
}

/**
 * Skill'ning ko'rsatiladigan matnlari — src/config/skills.ts dagi i18n kalitlaridan
 * (src/lib/locales/p18-skills.ts). Nom topilmasa — brend nomi.
 */
export function skillText(lang: Lang, s: Skill): { name: string; description: string; details: string[] } {
  return {
    name: translate(lang, s.nameKey) || s.name,
    description: translate(lang, s.descKey),
    details: s.detailKeys.map((k) => translate(lang, k)),
  };
}
