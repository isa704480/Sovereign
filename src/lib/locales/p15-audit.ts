import type { Dict } from "@/lib/i18n";

/**
 * 15-audit (i18n tuzatishlari) — yangi matnlar, 4 tilda (uz / uz-cyrl / ru / en).
 * p15aTokens*  — AnswerMetaBadge: 1000 dan kichik token sonining ko'plik shakllari (plural()).
 * p15aSources* — MessageItem: manbalar soni (plural(); eski "sourceWord" o'rniga).
 * p15aUse*     — DocsContent: CLI buyruqlari kod blokidagi izohlar (buyruq o'zi tarjima qilinmaydi).
 * stCliDevices* — SettingsPanel: "Ulangan qurilmalar" qatori (/cli/sessions sahifasiga havola).
 */
export const P15A = {
  p15aTokensOne: { uz: "≈{n} token", "uz-cyrl": "≈{n} токен", ru: "≈{n} токен", en: "≈{n} token" },
  p15aTokensFew: { uz: "≈{n} token", "uz-cyrl": "≈{n} токен", ru: "≈{n} токена", en: "≈{n} tokens" },
  p15aTokensMany: { uz: "≈{n} token", "uz-cyrl": "≈{n} токен", ru: "≈{n} токенов", en: "≈{n} tokens" },

  p15aSourcesOne: { uz: "{n} ta manba", "uz-cyrl": "{n} та манба", ru: "{n} источник", en: "{n} source" },
  p15aSourcesFew: { uz: "{n} ta manba", "uz-cyrl": "{n} та манба", ru: "{n} источника", en: "{n} sources" },
  p15aSourcesMany: { uz: "{n} ta manba", "uz-cyrl": "{n} та манба", ru: "{n} источников", en: "{n} sources" },

  p15aUseInteractive: {
    uz: "interaktiv rejim (chat + agent)",
    "uz-cyrl": "интерактив режим (чат + агент)",
    ru: "интерактивный режим (чат + агент)",
    en: "interactive mode (chat + agent)",
  },
  p15aUseOneTask: { uz: "bitta vazifa, keyin chiqadi", "uz-cyrl": "битта вазифа, кейин чиқади", ru: "одна задача, затем выход", en: "one task, then exit" },
  p15aUseAttach: { uz: "fayl biriktirish (yoki --file)", "uz-cyrl": "файл бириктириш (ёки --file)", ru: "прикрепить файлы (или --file)", en: "attach files (or --file)" },
  p15aUseYes: {
    uz: "xavfsiz amallarni avtomatik tasdiqlash (yoki -y)",
    "uz-cyrl": "хавфсиз амалларни автоматик тасдиқлаш (ёки -y)",
    ru: "автоподтверждение безопасных действий (или -y)",
    en: "auto-confirm safe actions (or -y)",
  },
  p15aUseFullAuto: {
    uz: "To'liq avto: hech narsa so'ralmaydi (push/deploy rad etiladi)",
    "uz-cyrl": "Тўлиқ авто: ҳеч нарса сўралмайди (push/deploy рад этилади)",
    ru: "Полный авто: без вопросов (push/deploy запрещены)",
    en: "Full auto: nothing asked (push/deploy refused)",
  },
  p15aUseLogin: { uz: "hisobni brauzerda ulash", "uz-cyrl": "ҳисобни браузерда улаш", ru: "подключить аккаунт в браузере", en: "connect your account in the browser" },
  p15aUseLogout: { uz: "hisobdan chiqish", "uz-cyrl": "ҳисобдан чиқиш", ru: "выйти из аккаунта", en: "log out" },
  p15aUseWhoami: { uz: "ulanish holati", "uz-cyrl": "уланиш ҳолати", ru: "статус подключения", en: "connection status" },
  p15aUseKey: {
    uz: "o'z OpenRouter kalitingizdan foydalanish",
    "uz-cyrl": "ўз OpenRouter калитингиздан фойдаланиш",
    ru: "использовать свой ключ OpenRouter",
    en: "use your own OpenRouter key",
  },
  p15aUseInitAi: {
    uz: "SOVEREIGN.md: jamoa uchun umumiy loyiha xotirasi",
    "uz-cyrl": "SOVEREIGN.md: жамоа учун умумий лойиҳа хотираси",
    ru: "SOVEREIGN.md: общая память проекта для команды",
    en: "SOVEREIGN.md: shared project memory for the team",
  },
  p15aUseAudit: {
    uz: "deploydan oldingi xavfsizlik auditi (oflayn)",
    "uz-cyrl": "деплойдан олдинги хавфсизлик аудити (офлайн)",
    ru: "аудит безопасности перед деплоем (офлайн)",
    en: "pre-deploy security audit (offline)",
  },
  p15aUseModels: { uz: "modellar ro'yxati", "uz-cyrl": "моделлар рўйхати", ru: "список моделей", en: "list models" },
  p15aUseHelp: { uz: "yordam", "uz-cyrl": "ёрдам", ru: "справка", en: "help" },
  p15aUseInitTpl: { uz: "SOVEREIGN.md shabloni", "uz-cyrl": "SOVEREIGN.md шаблони", ru: "шаблон SOVEREIGN.md", en: "SOVEREIGN.md template" },
  p15aUseInitFill: { uz: "agent o'zi to'ldirsin", "uz-cyrl": "агент ўзи тўлдирсин", ru: "агент заполнит сам", en: "let the agent fill it in" },

  stCliDevicesTitle: { uz: "Ulangan qurilmalar", "uz-cyrl": "Уланган қурилмалар", ru: "Подключённые устройства", en: "Connected devices" },
  stCliDevicesDesc: {
    uz: "SOVEREIGN CLI va Cowork ilovasi kirgan qurilmalar. Tanimagan qurilmani darhol bekor qiling.",
    "uz-cyrl": "SOVEREIGN CLI ва Cowork иловаси кирган қурилмалар. Танимаган қурилмани дарҳол бекор қилинг.",
    ru: "Устройства, на которых выполнен вход в SOVEREIGN CLI и Cowork. Незнакомое устройство сразу отключите.",
    en: "Devices signed in to SOVEREIGN CLI and the Cowork app. Revoke any device you don't recognize.",
  },
  stCliDevicesManage: { uz: "Boshqarish", "uz-cyrl": "Бошқариш", ru: "Управлять", en: "Manage" },
} satisfies Dict;
