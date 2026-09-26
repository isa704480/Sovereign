import type { L10n } from "@/lib/i18n";

/**
 * Kompaniya ma'lumotlari — landing (About, Contact, Footer) va JSON-LD shu yerdan o'qiydi.
 * Asoschi tahrirlashi uchun hammasi bitta joyda. Server va klient komponentlar ikkalasi ham
 * import qila oladi ("use client" yo'q).
 */

/** Aloqa pochtasi (o'z domenimizda). Pochta qutisini ochishni unutmang. */
export const CONTACT_EMAIL = "hello@soveregn.xyz";

/** Ro'yxatdan o'tgan yuridik shaxs nomi (masalan, "FayzInc MChJ"). Bo'sh bo'lsa — ko'rsatilmaydi. */
export const LEGAL_ENTITY = "";

export const FOUNDER_NAME = "Islombek";

/** Asoschi lavozimi (4 tilda). */
export const FOUNDER_TITLE: L10n = {
  uz: "Asoschi va dasturchi",
  "uz-cyrl": "Асосчи ва дастурчи",
  ru: "Основатель и разработчик",
  en: "Founder & developer",
};

/** Joylashuv (4 tilda). JSON-LD uchun LOCATION_SCHEMA ni ham moslang. */
export const LOCATION: L10n = {
  uz: "Toshkent, O'zbekiston",
  "uz-cyrl": "Тошкент, Ўзбекистон",
  ru: "Ташкент, Узбекистан",
  en: "Tashkent, Uzbekistan",
};
export const LOCATION_SCHEMA = { city: "Tashkent", countryCode: "UZ" } as const;

export const SITE_HOST = "soveregn.xyz";
export const APP_URL = "https://app.soveregn.xyz";
export const DOCS_URL = "https://docs.soveregn.xyz";
export const STATUS_URL = "https://status.soveregn.xyz";

/** Ochiq repo manzili. package.json/README'da ko'rsatilmagan — shuning uchun bo'sh (havola chiqmaydi). */
export const GITHUB_URL = "";
