/**
 * Config ma'lumotlari (connectors / skills) uchun lokalizatsiya yon-xaritalari.
 * Config obyektlarining shakli o'zgarmaydi (server ularni ishlatadi) — bu yerda
 * faqat ko'rsatiladigan matnlar id bo'yicha tarjima qilinadi. Topilmasa asl matn.
 */

import { pick, type L10n, type Lang } from "@/lib/i18n";
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
      uz: "Xatlarni o'qish va yuborish.",
      "uz-cyrl": "Хатларни ўқиш ва юбориш.",
      ru: "Чтение и отправка писем.",
      en: "Read and send emails.",
    },
  },
  gdrive: {
    name: { uz: "Google Disk", "uz-cyrl": "Google Диск", ru: "Google Диск", en: "Google Drive" },
    description: {
      uz: "Fayllarni ko'rish va yuklash.",
      "uz-cyrl": "Файлларни кўриш ва юклаш.",
      ru: "Просмотр и загрузка файлов.",
      en: "View and upload files.",
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
      uz: "Taqdimotlarni o'qish va yaratish.",
      "uz-cyrl": "Тақдимотларни ўқиш ва яратиш.",
      ru: "Чтение и создание презентаций.",
      en: "Read and create presentations.",
    },
  },
  gdocs: {
    description: {
      uz: "Hujjatlarni o'qish va yozish.",
      "uz-cyrl": "Ҳужжатларни ўқиш ва ёзиш.",
      ru: "Чтение и написание документов.",
      en: "Read and write documents.",
    },
  },
  gcalendar: {
    name: { uz: "Google Kalendar", "uz-cyrl": "Google Календар", ru: "Google Календарь", en: "Google Calendar" },
    description: {
      uz: "Voqealarni ko'rish va qo'shish.",
      "uz-cyrl": "Воқеаларни кўриш ва қўшиш.",
      ru: "Просмотр и добавление событий.",
      en: "View and add events.",
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
      uz: "Repozitoriy, issue va PR'lar bilan ishlash.",
      "uz-cyrl": "Репозиторий, issue ва PR'лар билан ишлаш.",
      ru: "Работа с репозиториями, issue и PR.",
      en: "Work with repositories, issues and PRs.",
    },
  },
  mcp: {
    name: { uz: "MCP server", "uz-cyrl": "MCP сервер", ru: "MCP-сервер", en: "MCP server" },
    description: {
      uz: "Ixtiyoriy MCP serverni ulash (URL + ixtiyoriy token).",
      "uz-cyrl": "Ихтиёрий MCP серверни улаш (URL + ихтиёрий токен).",
      ru: "Подключение любого MCP-сервера (URL + необязательный токен).",
      en: "Connect any MCP server (URL + optional token).",
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
};

/** Skill nomlari brend sifatida (UI/UX Pro Max, Clean Code...) o'zgarmaydi. */
export const SKILL_TEXT: Record<string, { name?: L10n; description: L10n; details: L10n[] }> = {
  "ui-ux-pro-max": {
    description: {
      uz: "Premium interfeys dizayni: ierarxiya, spacing, rang, holatlar",
      "uz-cyrl": "Премиум интерфейс дизайни: иерархия, спейсинг, ранг, ҳолатлар",
      ru: "Премиальный дизайн интерфейсов: иерархия, отступы, цвет, состояния",
      en: "Premium interface design: hierarchy, spacing, color, states",
    },
    details: [
      {
        uz: "Accessibility: kontrast ≥4.5:1, alt matn, klaviatura navigatsiyasi, aria-label",
        "uz-cyrl": "Accessibility: контраст ≥4.5:1, alt матн, клавиатура навигацияси, aria-label",
        ru: "Доступность: контраст ≥4.5:1, alt-текст, навигация с клавиатуры, aria-label",
        en: "Accessibility: contrast ≥4.5:1, alt text, keyboard navigation, aria-label",
      },
      {
        uz: "Teginish: kamida 44×44px maydon, har amalga darhol javob",
        "uz-cyrl": "Тегиниш: камида 44×44px майдон, ҳар амалга дарҳол жавоб",
        ru: "Касание: зона не меньше 44×44px, мгновенный отклик на каждое действие",
        en: "Touch: targets at least 44×44px, instant feedback on every action",
      },
      {
        uz: "Layout: mobil-birinchi, 375/768/1024/1440px breakpointlar",
        "uz-cyrl": "Layout: мобил-биринчи, 375/768/1024/1440px брейкпоинтлар",
        ru: "Вёрстка: mobile-first, брейкпоинты 375/768/1024/1440px",
        en: "Layout: mobile-first, 375/768/1024/1440px breakpoints",
      },
      {
        uz: "Barcha holatlar: hover, focus, disabled, loading, empty, error",
        "uz-cyrl": "Барча ҳолатлар: hover, focus, disabled, loading, empty, error",
        ru: "Все состояния: hover, focus, disabled, loading, empty, error",
        en: "All states: hover, focus, disabled, loading, empty, error",
      },
    ],
  },
  "apple-design": {
    description: {
      uz: "Apple HIG uslubi: soddalik, aniqlik, liquid glass, chuqurlik",
      "uz-cyrl": "Apple HIG услуби: соддалик, аниқлик, liquid glass, чуқурлик",
      ru: "Стиль Apple HIG: простота, ясность, liquid glass, глубина",
      en: "Apple HIG style: simplicity, clarity, liquid glass, depth",
    },
    details: [
      {
        uz: "Apple HIG'ning 8 tamoyili: maqsad, soddalik, hunar, zavq",
        "uz-cyrl": "Apple HIG'нинг 8 тамойили: мақсад, соддалик, ҳунар, завқ",
        ru: "8 принципов Apple HIG: цель, простота, мастерство, удовольствие",
        en: "Apple HIG's 8 principles: purpose, simplicity, craft, delight",
      },
      {
        uz: "Accessibility: asosiy matn 17pt, boshqaruv kamida 44×44pt",
        "uz-cyrl": "Accessibility: асосий матн 17pt, бошқарув камида 44×44pt",
        ru: "Доступность: основной текст 17pt, элементы управления от 44×44pt",
        en: "Accessibility: 17pt body text, controls at least 44×44pt",
      },
      {
        uz: "Chuqurlik: qatlamlar, yumshoq soya, blur — liquid glass",
        "uz-cyrl": "Чуқурлик: қатламлар, юмшоқ соя, blur — liquid glass",
        ru: "Глубина: слои, мягкие тени, размытие — liquid glass",
        en: "Depth: layers, soft shadows, blur — liquid glass",
      },
      {
        uz: "Katta radiuslar va spring animatsiya",
        "uz-cyrl": "Катта радиуслар ва spring анимация",
        ru: "Крупные скругления и пружинная анимация",
        en: "Large corner radii and spring animation",
      },
    ],
  },
  "clean-code": {
    description: {
      uz: "Toza, xavfsiz, o'qiladigan kod; yaxshi amaliyotlar",
      "uz-cyrl": "Тоза, хавфсиз, ўқиладиган код; яхши амалиётлар",
      ru: "Чистый, безопасный, читаемый код; лучшие практики",
      en: "Clean, secure, readable code; best practices",
    },
    details: [
      {
        uz: "Ishlaydigan, to'liq va aniq kod; taxminlar aytiladi",
        "uz-cyrl": "Ишлайдиган, тўлиқ ва аниқ код; тахминлар айтилади",
        ru: "Рабочий, полный и точный код; допущения проговариваются",
        en: "Working, complete, precise code; assumptions are stated",
      },
      {
        uz: "Ma'noli nomlar, kichik funksiyalar, erta return",
        "uz-cyrl": "Маъноли номлар, кичик функциялар, эрта return",
        ru: "Осмысленные имена, небольшие функции, ранний return",
        en: "Meaningful names, small functions, early returns",
      },
      {
        uz: "Chegara holatlari va kiritmani validatsiya qilish",
        "uz-cyrl": "Чегара ҳолатлари ва киритмани валидация қилиш",
        ru: "Граничные случаи и валидация ввода",
        en: "Edge cases and input validation",
      },
      {
        uz: "Xavfsizlik: parametrlangan so'rovlar, sirlar kodda emas",
        "uz-cyrl": "Хавфсизлик: параметрланган сўровлар, сирлар кодда эмас",
        ru: "Безопасность: параметризованные запросы, никаких секретов в коде",
        en: "Security: parameterized queries, no secrets in code",
      },
    ],
  },
  cybersecurity: {
    description: {
      uz: "Har bir teshikni topadi: OWASP + auth + crypto + cloud + supply chain audit",
      "uz-cyrl": "Ҳар бир тешикни топади: OWASP + auth + crypto + cloud + supply chain аудит",
      ru: "Находит каждую уязвимость: аудит OWASP + auth + crypto + cloud + supply chain",
      en: "Finds every hole: OWASP + auth + crypto + cloud + supply chain audit",
    },
    details: [
      {
        uz: "OWASP Top 10, CWE va MITRE ATT&CK bo'yicha audit",
        "uz-cyrl": "OWASP Top 10, CWE ва MITRE ATT&CK бўйича аудит",
        ru: "Аудит по OWASP Top 10, CWE и MITRE ATT&CK",
        en: "Audit against OWASP Top 10, CWE and MITRE ATT&CK",
      },
      {
        uz: "Auth, JWT/OAuth, kriptografiya, sirlar va konfiguratsiya",
        "uz-cyrl": "Auth, JWT/OAuth, криптография, сирлар ва конфигурация",
        ru: "Аутентификация, JWT/OAuth, криптография, секреты и конфигурация",
        en: "Auth, JWT/OAuth, cryptography, secrets and configuration",
      },
      {
        uz: "Cloud, Kubernetes va supply chain xavfsizligi",
        "uz-cyrl": "Cloud, Kubernetes ва supply chain хавфсизлиги",
        ru: "Безопасность облака, Kubernetes и цепочки поставок",
        en: "Cloud, Kubernetes and supply chain security",
      },
      {
        uz: "DFIR, threat hunting va incident triage — faqat mudofaa maqsadida",
        "uz-cyrl": "DFIR, threat hunting ва incident triage — фақат мудофаа мақсадида",
        ru: "DFIR, threat hunting и разбор инцидентов — только в целях защиты",
        en: "DFIR, threat hunting and incident triage — defensive use only",
      },
    ],
  },
  "pro-writing": {
    description: {
      uz: "Aniq, ishonarli, professional matn va tahrir",
      "uz-cyrl": "Аниқ, ишонарли, профессионал матн ва таҳрир",
      ru: "Чёткие, убедительные, профессиональные тексты и редактура",
      en: "Clear, persuasive, professional writing and editing",
    },
    details: [
      {
        uz: "Asosiy fikr oldinda, qisqa gaplar, faol nisbat",
        "uz-cyrl": "Асосий фикр олдинда, қисқа гаплар, фаол нисбат",
        ru: "Главная мысль — в начале, короткие фразы, активный залог",
        en: "Main point first, short sentences, active voice",
      },
      {
        uz: "Auditoriya va ohangga moslashadi",
        "uz-cyrl": "Аудитория ва оҳангга мослашади",
        ru: "Подстраивается под аудиторию и тон",
        en: "Adapts to the audience and tone",
      },
      {
        uz: "Aniq tuzilma: sarlavha, bo'limlar, yakun",
        "uz-cyrl": "Аниқ тузилма: сарлавҳа, бўлимлар, якун",
        ru: "Чёткая структура: заголовок, разделы, вывод",
        en: "Clear structure: headline, sections, conclusion",
      },
      {
        uz: "Tahrirda: tuzatilgan variant + o'zgarishlar ro'yxati",
        "uz-cyrl": "Таҳрирда: тузатилган вариант + ўзгаришлар рўйхати",
        ru: "При правке: исправленный текст + список изменений",
        en: "When editing: revised version + list of changes",
      },
    ],
  },
  "data-viz": {
    description: {
      uz: "Grafik, jadval va ma'lumot vizualizatsiyasi tamoyillari",
      "uz-cyrl": "График, жадвал ва маълумот визуализацияси тамойиллари",
      ru: "Принципы графиков, таблиц и визуализации данных",
      en: "Principles of charts, tables and data visualization",
    },
    details: [
      {
        uz: "To'g'ri grafik turi: ustun, chiziq, gistogramma",
        "uz-cyrl": "Тўғри график тури: устун, чизиқ, гистограмма",
        ru: "Правильный тип графика: столбцы, линии, гистограмма",
        en: "The right chart type: bar, line, histogram",
      },
      {
        uz: "Chart-junk yo'q: ortiqcha to'r, 3D va gradientsiz",
        "uz-cyrl": "Chart-junk йўқ: ортиқча тўр, 3D ва градиентсиз",
        ru: "Без визуального мусора: лишней сетки, 3D и градиентов",
        en: "No chart junk: extra gridlines, 3D or gradients",
      },
      {
        uz: "Aniq o'qlar, birliklar, sarlavha va manba",
        "uz-cyrl": "Аниқ ўқлар, бирликлар, сарлавҳа ва манба",
        ru: "Чёткие оси, единицы, заголовок и источник",
        en: "Clear axes, units, title and source",
      },
      {
        uz: "Rang-ko'r foydalanuvchilar uchun xavfsiz palitra",
        "uz-cyrl": "Ранг-кўр фойдаланувчилар учун хавфсиз палитра",
        ru: "Палитра, безопасная для людей с дальтонизмом",
        en: "Colorblind-safe palette",
      },
    ],
  },
};

export function skillCategoryLabel(lang: Lang, cat: SkillCategory, fallback?: string): string {
  return pick(lang, SKILL_CATEGORY_TEXT[cat]) || fallback || cat;
}

/** Skill'ning ko'rsatiladigan matnlari. `details` bo'lmasa — null (komponent o'zi hisoblaydi). */
export function skillText(lang: Lang, s: Skill): { name: string; description: string; details: string[] | null } {
  const tx = SKILL_TEXT[s.id];
  return {
    name: (tx?.name && pick(lang, tx.name)) || s.name,
    description: (tx && pick(lang, tx.description)) || s.description,
    details: tx?.details?.length ? tx.details.map((d) => pick(lang, d)) : null,
  };
}
