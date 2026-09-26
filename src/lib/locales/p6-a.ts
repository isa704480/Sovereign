import type { Dict } from "@/lib/i18n";

/** 6-bosqich (A guruhi) tarjimalari (uz / uz-cyrl / ru / en). Landing "Yuklab olish" bo'limi (desktop + CLI). */
export const P6A = {
  dlNav: { uz: "Yuklab olish", "uz-cyrl": "Юклаб олиш", ru: "Скачать", en: "Download" },
  dlTitle: {
    uz: "SOVEREIGN kompyuteringizda",
    "uz-cyrl": "SOVEREIGN компютерингизда",
    ru: "SOVEREIGN на вашем компьютере",
    en: "SOVEREIGN on your computer",
  },
  dlSub: {
    uz: "Kundalik ish uchun desktop ilova yoki to'g'ridan-to'g'ri terminalda sov CLI. Bepul — Windows, macOS va Linux uchun.",
    "uz-cyrl": "Кундалик иш учун десктоп илова ёки тўғридан-тўғри терминалда sov CLI. Бепул — Windows, macOS ва Linux учун.",
    ru: "Десктоп-приложение для ежедневной работы или CLI sov прямо в терминале. Бесплатно — для Windows, macOS и Linux.",
    en: "A desktop app for everyday work, or the sov CLI right in your terminal. Free for Windows, macOS and Linux.",
  },
  dlChoose: {
    uz: "Nimani o'rnatishni tanlang",
    "uz-cyrl": "Нимани ўрнатишни танланг",
    ru: "Выберите, что установить",
    en: "Choose what to install",
  },

  // Tanlov kartalari
  dlDesktopTitle: { uz: "Desktop ilova", "uz-cyrl": "Десктоп илова", ru: "Десктоп-приложение", en: "Desktop app" },
  dlDesktopDesc: {
    uz: "Alohida oynadagi AI koding hamkori — chat, fayllar va agentlar.",
    "uz-cyrl": "Алоҳида ойнадаги AI кодинг ҳамкори — чат, файллар ва агентлар.",
    ru: "AI-напарник для кода в отдельном окне — чат, файлы и агенты.",
    en: "An AI coding coworker in its own window — chat, files and agents.",
  },
  dlCliTitle: { uz: "Buyruq qatori (CLI)", "uz-cyrl": "Буйруқ қатори (CLI)", ru: "Командная строка (CLI)", en: "Command line (CLI)" },
  dlCliDesc: {
    uz: "sov — terminaldagi AI koding agenti. Bitta buyruq bilan o'rnatiladi.",
    "uz-cyrl": "sov — терминалдаги AI кодинг агенти. Битта буйруқ билан ўрнатилади.",
    ru: "sov — AI-агент для кода в терминале. Установка одной командой.",
    en: "sov — an AI coding agent in your terminal. One command to install.",
  },
  dlRecommended: { uz: "Sizga mos", "uz-cyrl": "Сизга мос", ru: "Для вашей системы", en: "Recommended for you" },

  // Desktop variantlari
  dlWinMeta: {
    uz: "Windows 10 / 11 · 64-bit o'rnatuvchi",
    "uz-cyrl": "Windows 10 / 11 · 64-бит ўрнатувчи",
    ru: "Windows 10 / 11 · 64-бит установщик",
    en: "Windows 10 / 11 · 64-bit installer",
  },
  dlMacMeta: { uz: "macOS 12+ · disk obrazi", "uz-cyrl": "macOS 12+ · диск образи", ru: "macOS 12+ · образ диска", en: "macOS 12+ · disk image" },
  dlLinuxMeta: {
    uz: "x86_64 · o'rnatishsiz ishlaydi",
    "uz-cyrl": "x86_64 · ўрнатишсиз ишлайди",
    ru: "x86_64 · портативно, без установки",
    en: "x86_64 · portable, no install",
  },
  dlDownloadExt: { uz: "{ext} yuklab olish", "uz-cyrl": "{ext} юклаб олиш", ru: "Скачать {ext}", en: "Download {ext}" },
  dlDownloadFor: {
    uz: "{what} — {os} uchun yuklab olish",
    "uz-cyrl": "{what} — {os} учун юклаб олиш",
    ru: "Скачать {what} для {os}",
    en: "Download {what} for {os}",
  },
  dlMacHint: {
    uz: "Qaysi biri? Apple menyusi → About This Mac → Chip.",
    "uz-cyrl": "Қайси бири? Apple менюси → About This Mac → Chip.",
    ru: "Какой у вас? Меню Apple → Об этом Mac → Чип.",
    en: "Not sure? Apple menu → About This Mac → Chip.",
  },
  dlUnsignedTitle: {
    uz: "Ilova hali raqamli imzolanmagan — birinchi ishga tushirishda:",
    "uz-cyrl": "Илова ҳали рақамли имзоланмаган — биринчи ишга туширишда:",
    ru: "Сборки пока без цифровой подписи — при первом запуске:",
    en: "Builds aren't code-signed yet — on first launch:",
  },
  dlUnsignedWin: {
    uz: "Windows SmartScreen: “More info” → “Run anyway” ni bosing.",
    "uz-cyrl": "Windows SmartScreen: “More info” → “Run anyway” ни босинг.",
    ru: "Windows SmartScreen: «Подробнее» → «Выполнить в любом случае».",
    en: "Windows SmartScreen: click “More info” → “Run anyway”.",
  },
  dlUnsignedMac: {
    uz: "macOS: ilovani o'ng tugma bilan bosing → Open.",
    "uz-cyrl": "macOS: иловани ўнг тугма билан босинг → Open.",
    ru: "macOS: правый клик по приложению → «Открыть».",
    en: "macOS: right-click the app → Open.",
  },
  dlUnsignedLinux: {
    uz: "Linux: .AppImage faylga chmod +x bering va ishga tushiring.",
    "uz-cyrl": "Linux: .AppImage файлга chmod +x беринг ва ишга туширинг.",
    ru: "Linux: выполните chmod +x для .AppImage и запустите.",
    en: "Linux: chmod +x the .AppImage, then run it.",
  },

  // CLI variantlari
  dlCliWinMeta: {
    uz: "PowerShell · admin huquqi kerak emas",
    "uz-cyrl": "PowerShell · админ ҳуқуқи керак эмас",
    ru: "PowerShell · права администратора не нужны",
    en: "PowerShell · no admin rights needed",
  },
  dlCliUnixMeta: { uz: "Terminal · bash / zsh", "uz-cyrl": "Терминал · bash / zsh", ru: "Терминал · bash / zsh", en: "Terminal · bash / zsh" },
  dlNpmMeta: {
    uz: "Istalgan OS · Node.js 20+ kerak",
    "uz-cyrl": "Исталган OS · Node.js 20+ керак",
    ru: "Любая ОС · нужен Node.js 20+",
    en: "Any OS · needs Node.js 20+",
  },
  dlOrExe: { uz: "yoki sov.exe ni yuklab oling", "uz-cyrl": "ёки sov.exe ни юклаб олинг", ru: "или скачайте sov.exe", en: "or download sov.exe" },
  dlOrBinary: {
    uz: "yoki tayyor faylni yuklab oling:",
    "uz-cyrl": "ёки тайёр файлни юклаб олинг:",
    ru: "или скачайте готовый файл:",
    en: "or download the binary:",
  },
  dlCopyCmd: { uz: "Buyruqni nusxalash", "uz-cyrl": "Буйруқни нусхалаш", ru: "Скопировать команду", en: "Copy command" },

  // Pastki havolalar
  dlDocs: { uz: "O'rnatish qo'llanmasi", "uz-cyrl": "Ўрнатиш қўлланмаси", ru: "Инструкция по установке", en: "Installation guide" },
  dlAllReleases: {
    uz: "GitHub'dagi barcha relizlar",
    "uz-cyrl": "GitHub'даги барча релизлар",
    ru: "Все релизы на GitHub",
    en: "All releases on GitHub",
  },
  dlChatButton: { uz: "Cowork desktop", "uz-cyrl": "Cowork десктоп", ru: "Cowork для компьютера", en: "Cowork desktop" },
} satisfies Dict;
