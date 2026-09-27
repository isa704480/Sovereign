// Main jarayon matnlari (bildirishnoma, papka tanlash oynasi, macOS menyusi) — 4 tilda.
// Renderer matnlari ui/src/lib/i18n.js da; main o'zi ko'rsatadigan matnlar i18n-strings.mjs da.
// Til: settings.lang (renderer tanlagan), tanlanmagan bo'lsa — ingliz (renderer'dagi detectLang() bilan bir xil).

import { loadSettings } from "./settings.mjs";
import { MAIN_STRINGS } from "./i18n-strings.mjs";

/** Joriy UI tili: sozlamadagi tanlov, bo'lmasa ingliz tili (renderer'dagi detectLang() bilan bir xil). */
export function mainLang() {
  const chosen = loadSettings().lang;
  return chosen && MAIN_STRINGS[chosen] ? chosen : "en";
}

/** Main jarayon tarjimasi: tanlangan til → ingliz → o'zbek → kalit. */
export function mt(key) {
  const d = MAIN_STRINGS[mainLang()] ?? MAIN_STRINGS.en;
  return d[key] ?? MAIN_STRINGS.en[key] ?? MAIN_STRINGS.uz[key] ?? key;
}
