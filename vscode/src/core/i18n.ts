/**
 * Ish vaqtidagi (runtime) matnlar — 4 tilda: uz (lotin), uz-cyrl, ru, en.
 * Standart til — `en` (loyiha qoidasi: CLAUDE.md § i18n).
 *
 * NEGA `vscode.l10n` EMAS? VS Code o'zining `bundle.l10n.<locale>.json` faylini faqat
 * muharrir ko'rsatish tili bo'yicha tanlaydi, o'zbek tili esa VS Code'ning ko'rsatish
 * tillari ro'yxatida YO'Q (en, zh-cn, zh-tw, fr, de, it, es, ja, ko, ru, pt-br, tr, pl,
 * cs, hu). Shu bois panel va bildirishnomalar matni shu modulda — `sovereign.language`
 * sozlamasi bilan boshqariladi, `auto` da muharrir tiliga ergashadi.
 * Manifest matnlari (buyruq nomlari, sozlama tavsiflari) esa `package.nls*.json` da.
 *
 * Bu modul `vscode` ni IMPORT QILMAYDI — shuning uchun `node --test` bilan sinaladi.
 */

export const LANGS = ["uz", "uz-cyrl", "ru", "en"] as const;
export type Lang = (typeof LANGS)[number];
export const DEFAULT_LANG: Lang = "en";

export function isLang(v: unknown): v is Lang {
  return typeof v === "string" && (LANGS as readonly string[]).includes(v);
}

type Entry = Record<Lang, string>;

/* eslint-disable @typescript-eslint/naming-convention */
const DICT = {
  "panel.title": {
    uz: "SOVEREIGN",
    "uz-cyrl": "SOVEREIGN",
    ru: "SOVEREIGN",
    en: "SOVEREIGN",
  },
  "panel.placeholder": {
    uz: "Joriy fayl yoki belgilangan kod haqida so‘rang…",
    "uz-cyrl": "Жорий файл ёки белгиланган код ҳақида сўранг…",
    ru: "Спросите о текущем файле или выделении…",
    en: "Ask about the current file or selection…",
  },
  "panel.send": { uz: "Yuborish", "uz-cyrl": "Юбориш", ru: "Отправить", en: "Send" },
  "panel.stop": { uz: "To‘xtatish", "uz-cyrl": "Тўхтатиш", ru: "Остановить", en: "Stop" },
  "panel.newChat": { uz: "Yangi suhbat", "uz-cyrl": "Янги суҳбат", ru: "Новый чат", en: "New chat" },
  "panel.copy": { uz: "Nusxalash", "uz-cyrl": "Нусхалаш", ru: "Копировать", en: "Copy" },
  "panel.copied": { uz: "Nusxalandi", "uz-cyrl": "Нусхаланди", ru: "Скопировано", en: "Copied" },
  "panel.apply": {
    uz: "Muharrirga qo‘yish",
    "uz-cyrl": "Муҳаррирга қўйиш",
    ru: "Вставить в редактор",
    en: "Apply to editor",
  },
  "panel.applyHint": {
    uz: "Kursor joyiga qo‘yiladi yoki belgilangan matn almashtiriladi. Ctrl+Z bilan qaytariladi.",
    "uz-cyrl": "Курсор жойига қўйилади ёки белгиланган матн алмаштирилади. Ctrl+Z билан қайтарилади.",
    ru: "Вставится на место курсора или заменит выделение. Отменяется через Ctrl+Z.",
    en: "Inserted at the cursor or replaces the selection. Undo with Ctrl+Z.",
  },
  "panel.applied": {
    uz: "Muharrirga qo‘yildi — Ctrl+Z bilan qaytarasiz.",
    "uz-cyrl": "Муҳаррирга қўйилди — Ctrl+Z билан қайтарасиз.",
    ru: "Вставлено в редактор — отмена через Ctrl+Z.",
    en: "Applied to the editor — undo with Ctrl+Z.",
  },
  "panel.you": { uz: "Siz", "uz-cyrl": "Сиз", ru: "Вы", en: "You" },
  "panel.assistant": { uz: "SOVEREIGN", "uz-cyrl": "SOVEREIGN", ru: "SOVEREIGN", en: "SOVEREIGN" },
  "panel.thinking": { uz: "O‘ylayapti…", "uz-cyrl": "Ўйлаяпти…", ru: "Думает…", en: "Thinking…" },
  "panel.emptyTitle": {
    uz: "Kod haqida so‘rang",
    "uz-cyrl": "Код ҳақида сўранг",
    ru: "Спросите о коде",
    en: "Ask about your code",
  },
  "panel.emptyHint": {
    uz: "Faqat joriy fayl yo‘li, tili va belgilangan joy atrofidagi bir necha qator yuboriladi — butun loyiha emas.",
    "uz-cyrl": "Фақат жорий файл йўли, тили ва белгиланган жой атрофидаги бир неча қатор юборилади — бутун лойиҳа эмас.",
    ru: "Отправляются только путь и язык текущего файла и несколько строк вокруг выделения — не весь проект.",
    en: "Only the current file path, its language and a few lines around the selection are sent — never the whole workspace.",
  },
  "panel.contextOn": {
    uz: "Kontekst: {file}",
    "uz-cyrl": "Контекст: {file}",
    ru: "Контекст: {file}",
    en: "Context: {file}",
  },
  "panel.contextOff": {
    uz: "Ochiq fayl yo‘q — kontekstsiz so‘raladi.",
    "uz-cyrl": "Очиқ файл йўқ — контекстсиз сўралади.",
    ru: "Нет открытого файла — вопрос без контекста.",
    en: "No open file — asking without context.",
  },
  "panel.useContext": {
    uz: "Fayl kontekstini qo‘shish",
    "uz-cyrl": "Файл контекстини қўшиш",
    ru: "Добавлять контекст файла",
    en: "Include file context",
  },
  "panel.signIn": { uz: "Kirish", "uz-cyrl": "Кириш", ru: "Войти", en: "Sign in" },
  "panel.signInTitle": {
    uz: "SOVEREIGN hisobiga kiring",
    "uz-cyrl": "SOVEREIGN ҳисобига киринг",
    ru: "Войдите в аккаунт SOVEREIGN",
    en: "Sign in to SOVEREIGN",
  },
  "panel.signInHint": {
    uz: "Brauzer ochiladi, kodni tasdiqlaysiz. Yoki CLI’dagi mavjud kirishdan foydalaning.",
    "uz-cyrl": "Браузер очилади, кодни тасдиқлайсиз. Ёки CLI’даги мавжуд киришдан фойдаланинг.",
    ru: "Откроется браузер, вы подтвердите код. Либо используйте существующий вход из CLI.",
    en: "A browser opens and you approve the code. Or reuse your existing CLI login.",
  },
  "panel.useCli": {
    uz: "CLI’dagi kirishdan foydalanish",
    "uz-cyrl": "CLI’даги киришдан фойдаланиш",
    ru: "Использовать вход из CLI",
    en: "Use my existing CLI login",
  },
  "panel.stopped": { uz: "To‘xtatildi.", "uz-cyrl": "Тўхтатилди.", ru: "Остановлено.", en: "Stopped." },

  "auth.codeTitle": {
    uz: "Brauzerdagi sahifada shu kodni tasdiqlang",
    "uz-cyrl": "Браузердаги саҳифада шу кодни тасдиқланг",
    ru: "Подтвердите этот код на странице в браузере",
    en: "Approve this code on the page in your browser",
  },
  "auth.copyCode": { uz: "Kodni nusxalash", "uz-cyrl": "Кодни нусхалаш", ru: "Копировать код", en: "Copy code" },
  "auth.openPage": { uz: "Sahifani ochish", "uz-cyrl": "Саҳифани очиш", ru: "Открыть страницу", en: "Open page" },
  "auth.waiting": {
    uz: "Tasdiqlanishini kutmoqda…",
    "uz-cyrl": "Тасдиқланишини кутмоқда…",
    ru: "Ожидание подтверждения…",
    en: "Waiting for approval…",
  },
  "auth.success": {
    uz: "Ulandi — {email}",
    "uz-cyrl": "Уланди — {email}",
    ru: "Подключено — {email}",
    en: "Connected — {email}",
  },
  "auth.successNoEmail": { uz: "Ulandi.", "uz-cyrl": "Уланди.", ru: "Подключено.", en: "Connected." },
  "auth.expired": {
    uz: "Kod eskirdi. Qayta urinib ko‘ring.",
    "uz-cyrl": "Код эскирди. Қайта уриниб кўринг.",
    ru: "Код устарел. Попробуйте ещё раз.",
    en: "The code expired. Please try again.",
  },
  "auth.cancelled": { uz: "Bekor qilindi.", "uz-cyrl": "Бекор қилинди.", ru: "Отменено.", en: "Cancelled." },
  "auth.failed": {
    uz: "Kirish bajarilmadi: {reason}",
    "uz-cyrl": "Кириш бажарилмади: {reason}",
    ru: "Не удалось войти: {reason}",
    en: "Sign-in failed: {reason}",
  },
  "auth.cliFound": {
    uz: "CLI kirishi olindi ({path}). Token muharrirning maxfiy xotirasiga saqlandi.",
    "uz-cyrl": "CLI кириши олинди ({path}). Токен муҳаррирнинг махфий хотирасига сақланди.",
    ru: "Вход CLI импортирован ({path}). Токен сохранён в защищённом хранилище редактора.",
    en: "CLI login imported ({path}). The token is stored in the editor's secret storage.",
  },
  "auth.cliNotFound": {
    uz: "`~/.sovereign/config.json` da token topilmadi. Avval terminalda `sov login` bajaring.",
    "uz-cyrl": "`~/.sovereign/config.json` да токен топилмади. Аввал терминалда `sov login` бажаринг.",
    ru: "Токен не найден в `~/.sovereign/config.json`. Сначала выполните `sov login` в терминале.",
    en: "No token found in `~/.sovereign/config.json`. Run `sov login` in a terminal first.",
  },
  "auth.loggedOut": {
    uz: "Chiqildi — token o‘chirildi.",
    "uz-cyrl": "Чиқилди — токен ўчирилди.",
    ru: "Вы вышли — токен удалён.",
    en: "Signed out — the token was removed.",
  },
  "auth.needSignIn": {
    uz: "Avval SOVEREIGN hisobiga kiring.",
    "uz-cyrl": "Аввал SOVEREIGN ҳисобига киринг.",
    ru: "Сначала войдите в аккаунт SOVEREIGN.",
    en: "Sign in to SOVEREIGN first.",
  },

  "status.signedOut": { uz: "Kirilmagan", "uz-cyrl": "Кирилмаган", ru: "Не выполнен вход", en: "Signed out" },
  "status.tooltip": {
    uz: "SOVEREIGN — model: {model}, tarif: {plan}. Menyu uchun bosing.",
    "uz-cyrl": "SOVEREIGN — модель: {model}, тариф: {plan}. Меню учун босинг.",
    ru: "SOVEREIGN — модель: {model}, тариф: {plan}. Нажмите для меню.",
    en: "SOVEREIGN — model: {model}, plan: {plan}. Click for the menu.",
  },
  "status.tooltipSignedOut": {
    uz: "SOVEREIGN — kirilmagan. Kirish uchun bosing.",
    "uz-cyrl": "SOVEREIGN — кирилмаган. Кириш учун босинг.",
    ru: "SOVEREIGN — вход не выполнен. Нажмите, чтобы войти.",
    en: "SOVEREIGN — signed out. Click to sign in.",
  },
  "status.menuTitle": { uz: "SOVEREIGN", "uz-cyrl": "SOVEREIGN", ru: "SOVEREIGN", en: "SOVEREIGN" },

  "model.pickTitle": {
    uz: "Model tanlang",
    "uz-cyrl": "Модель танланг",
    ru: "Выберите модель",
    en: "Choose a model",
  },
  "model.auto": { uz: "`auto` — server tanlaydi", "uz-cyrl": "`auto` — сервер танлайди", ru: "`auto` — выбирает сервер", en: "`auto` — the server chooses" },
  "model.loading": { uz: "Katalog yuklanmoqda…", "uz-cyrl": "Каталог юкланмоқда…", ru: "Загрузка каталога…", en: "Loading the catalogue…" },
  "model.failed": {
    uz: "Model katalogini olib bo‘lmadi: {reason}",
    "uz-cyrl": "Модель каталогини олиб бўлмади: {reason}",
    ru: "Не удалось получить каталог моделей: {reason}",
    en: "Could not load the model catalogue: {reason}",
  },
  "model.manual": { uz: "Model id’sini qo‘lda kiritish…", "uz-cyrl": "Модель id’сини қўлда киритиш…", ru: "Ввести id модели вручную…", en: "Enter a model id manually…" },
  "model.manualPrompt": { uz: "Model id (masalan `auto/coding:free`)", "uz-cyrl": "Модель id (масалан `auto/coding:free`)", ru: "Id модели (например `auto/coding:free`)", en: "Model id (for example `auto/coding:free`)" },
  "model.saved": { uz: "Model: {model}", "uz-cyrl": "Модель: {model}", ru: "Модель: {model}", en: "Model: {model}" },

  "menu.openChat": { uz: "Suhbatni ochish", "uz-cyrl": "Суҳбатни очиш", ru: "Открыть чат", en: "Open chat" },
  "menu.pickModel": { uz: "Model tanlash", "uz-cyrl": "Модель танлаш", ru: "Выбрать модель", en: "Choose model" },
  "menu.settings": { uz: "Sozlamalar", "uz-cyrl": "Созламалар", ru: "Настройки", en: "Settings" },
  "menu.signIn": { uz: "Kirish", "uz-cyrl": "Кириш", ru: "Войти", en: "Sign in" },
  "menu.signOut": { uz: "Chiqish", "uz-cyrl": "Чиқиш", ru: "Выйти", en: "Sign out" },

  "prompt.explain": {
    uz: "Quyidagi kodni tushuntiring: nima qiladi, nega shunday yozilgan va qanday nozik joylari bor.",
    "uz-cyrl": "Қуйидаги кодни тушунтиринг: нима қилади, нега шундай ёзилган ва қандай нозик жойлари бор.",
    ru: "Объясните этот код: что он делает, почему написан так и какие у него тонкие места.",
    en: "Explain this code: what it does, why it is written this way and where the subtleties are.",
  },
  "prompt.fix": {
    uz: "Muharrir quyidagi xatoni ko‘rsatmoqda. Sababini tushuntiring va tuzatilgan kodni bering.",
    "uz-cyrl": "Муҳаррир қуйидаги хатони кўрсатмоқда. Сабабини тушунтиринг ва тузатилган кодни беринг.",
    ru: "Редактор показывает эту ошибку. Объясните причину и дайте исправленный код.",
    en: "The editor reports this problem. Explain the cause and give the corrected code.",
  },
  "prompt.test": {
    uz: "Quyidagi funksiya uchun test yozing. Loyihaning test uslubiga ergashing, chegaraviy holatlarni qamrang.",
    "uz-cyrl": "Қуйидаги функция учун тест ёзинг. Лойиҳанинг тест услубига эргашинг, чегаравий ҳолатларни қамранг.",
    ru: "Напишите тест для этой функции. Следуйте стилю тестов проекта, покройте граничные случаи.",
    en: "Write a test for this function. Follow the project's testing style and cover the edge cases.",
  },
  "prompt.file": {
    uz: "Bu fayl haqida so‘rayman: u nima qiladi va qanday tuzilgan?",
    "uz-cyrl": "Бу файл ҳақида сўрайман: у нима қилади ва қандай тузилган?",
    ru: "Вопрос об этом файле: что он делает и как устроен?",
    en: "About this file: what does it do and how is it structured?",
  },

  "err.noEditor": {
    uz: "Ochiq muharrir yo‘q.",
    "uz-cyrl": "Очиқ муҳаррир йўқ.",
    ru: "Нет открытого редактора.",
    en: "No open editor.",
  },
  "err.noSelection": {
    uz: "Avval kodni belgilang (yoki kursorni funksiya ichiga qo‘ying).",
    "uz-cyrl": "Аввал кодни белгиланг (ёки курсорни функция ичига қўйинг).",
    ru: "Сначала выделите код (или поставьте курсор внутрь функции).",
    en: "Select some code first (or put the cursor inside the function).",
  },
  "err.noDiagnostic": {
    uz: "Kursor ostida xato yoki ogohlantirish topilmadi.",
    "uz-cyrl": "Курсор остида хато ёки огоҳлантириш топилмади.",
    ru: "Под курсором нет ошибки или предупреждения.",
    en: "No error or warning under the cursor.",
  },
  "err.network": {
    uz: "Serverga ulanib bo‘lmadi. Manzil va internetni tekshiring.",
    "uz-cyrl": "Серверга уланиб бўлмади. Манзил ва интернетни текширинг.",
    ru: "Не удалось подключиться к серверу. Проверьте адрес и интернет.",
    en: "Could not reach the server. Check the address and your connection.",
  },
  "err.unauthorized": {
    uz: "Token yaroqsiz yoki muddati tugagan — qaytadan kiring.",
    "uz-cyrl": "Токен яроқсиз ёки муддати тугаган — қайтадан киринг.",
    ru: "Токен недействителен или истёк — войдите заново.",
    en: "The token is invalid or expired — sign in again.",
  },
  "err.rateLimited": {
    uz: "So‘rovlar juda tez. Biroz kuting.",
    "uz-cyrl": "Сўровлар жуда тез. Бироз кутинг.",
    ru: "Слишком много запросов. Подождите немного.",
    en: "Too many requests. Please wait a moment.",
  },
  "err.server": {
    uz: "Server xatosi ({status}).",
    "uz-cyrl": "Сервер хатоси ({status}).",
    ru: "Ошибка сервера ({status}).",
    en: "Server error ({status}).",
  },
  "err.badBaseUrl": {
    uz: "`sovereign.baseUrl` faqat https:// (yoki http://localhost) bo‘lishi mumkin — standart manzil ishlatildi.",
    "uz-cyrl": "`sovereign.baseUrl` фақат https:// (ёки http://localhost) бўлиши мумкин — стандарт манзил ишлатилди.",
    ru: "`sovereign.baseUrl` может быть только https:// (или http://localhost) — использован адрес по умолчанию.",
    en: "`sovereign.baseUrl` must be https:// (or http://localhost) — the default address was used.",
  },
  "err.linkBlocked": {
    uz: "Faqat https havolalar ochiladi.",
    "uz-cyrl": "Фақат https ҳаволалар очилади.",
    ru: "Открываются только https-ссылки.",
    en: "Only https links are opened.",
  },
  "err.empty": {
    uz: "Model bo‘sh javob qaytardi.",
    "uz-cyrl": "Модель бўш жавоб қайтарди.",
    ru: "Модель вернула пустой ответ.",
    en: "The model returned an empty answer.",
  },
} satisfies Record<string, Entry>;
/* eslint-enable @typescript-eslint/naming-convention */

export type TKey = keyof typeof DICT;

/**
 * Muharrir tilidan (`vscode.env.language`, mas. "ru", "pt-br", "en-US") bizning tilimiz.
 * VS Code o'zbekchani qo'llamaydi — "uz"/"uz-cyrl" faqat sozlama orqali tanlanadi
 * (yoki VS Code forki shunday til bersa).
 */
export function resolveLang(setting: string | undefined, editorLanguage: string | undefined): Lang {
  if (isLang(setting)) return setting;
  const raw = (editorLanguage ?? "").trim().toLowerCase();
  if (!raw) return DEFAULT_LANG;
  if (raw === "uz-cyrl" || raw === "uz-cyrl-uz" || raw === "uz-uz-cyrl") return "uz-cyrl";
  const base = raw.split(/[-_]/)[0];
  if (base === "uz") return "uz";
  if (base === "ru") return "ru";
  if (base === "en") return "en";
  return DEFAULT_LANG;
}

/** `{name}` o'rniga qiymat qo'yadi; berilmagan o'rin egallari o'z holicha qoladi. */
export function fmt(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));
}

export function translate(lang: Lang, key: TKey, params?: Record<string, string | number>): string {
  const entry = DICT[key] as Entry | undefined;
  const value = entry?.[lang] || entry?.[DEFAULT_LANG] || key;
  return fmt(value, params);
}

export function makeT(lang: Lang) {
  return (key: TKey, params?: Record<string, string | number>) => translate(lang, key, params);
}

/** Webview'ga bitta xabarda yuboriladigan lug'at (panel o'z matnini shu yerdan oladi). */
export function bundleFor(lang: Lang): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of Object.keys(DICT) as TKey[]) {
    if (key.startsWith("panel.") || key.startsWith("auth.")) out[key] = translate(lang, key);
  }
  return out;
}

/** Test/tekshiruv uchun: har kalitda 4 til bor va bo'sh emas. */
export function dictKeys(): TKey[] {
  return Object.keys(DICT) as TKey[];
}

export function dictEntry(key: TKey): Entry {
  return DICT[key];
}
