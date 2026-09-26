// Main jarayon matnlari (bildirishnoma, papka tanlash oynasi, macOS menyusi) — 4 tilda.
// Renderer matnlari ui/src/lib/i18n.js da; main o'zi ko'rsatadigan matnlar i18n-strings.mjs da.
// Til: settings.lang (renderer tanlagan) yoki tizim tili — renderer'dagi detectLang() bilan bir xil.

import { app } from "electron";
import { loadSettings } from "./settings.mjs";
import { MAIN_STRINGS } from "./i18n-strings.mjs";

/** Joriy UI tili: sozlamadagi tanlov, bo'lmasa tizim tili (uz-Cyrl → kirill, aks holda o'zbek lotin). */
export function mainLang() {
  const chosen = loadSettings().lang;
  if (chosen && MAIN_STRINGS[chosen]) return chosen;
  let locale = "";
  try {
    locale = (app.getPreferredSystemLanguages?.()[0] || app.getLocale() || "").toLowerCase();
  } catch {
    locale = "";
  }
  return locale.startsWith("uz-cyrl") ? "uz-cyrl" : "uz";
}

/** Main jarayon tarjimasi: tanlangan til → ingliz → o'zbek → kalit. */
export function mt(key) {
  const d = MAIN_STRINGS[mainLang()] ?? MAIN_STRINGS.uz;
  return d[key] ?? MAIN_STRINGS.en[key] ?? MAIN_STRINGS.uz[key] ?? key;
}
