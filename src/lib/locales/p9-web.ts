import type { Dict } from "@/lib/i18n";

/**
 * Web chat og'riqlari (9-bosqich): javob modeli/token shaffofligi, rasmli suhbatlar
 * sinxroni, maxfiylik havolasi — 4 tilda (uz / uz-cyrl / ru / en).
 */
export const P9W = {
  /* ---- Rasm/video sinxroni: serverga data: URL o'rniga belgi ---- */
  p9wImageLocalOnly: {
    uz: "rasm: faqat yaratilgan qurilmada saqlangan",
    "uz-cyrl": "расм: фақат яратилган қурилмада сақланган",
    ru: "изображение: хранится только на устройстве, где создано",
    en: "image: stored only on the device where it was created",
  },
  p9wVideoLocalOnly: {
    uz: "video: faqat yaratilgan qurilmada saqlangan",
    "uz-cyrl": "видео: фақат яратилган қурилмада сақланган",
    ru: "видео: хранится только на устройстве, где создано",
    en: "video: stored only on the device where it was created",
  },

  /* ---- Javob ostidagi model/token belgisi ---- */
  p9wFallback: {
    uz: "so'ralgan: {req} → javob: {served}",
    "uz-cyrl": "сўралган: {req} → жавоб: {served}",
    ru: "запрошено: {req} → ответила: {served}",
    en: "requested: {req} → answered by: {served}",
  },
  p9wRescue: { uz: "zaxira shlyuz", "uz-cyrl": "захира шлюз", ru: "резервный шлюз", en: "backup gateway" },
  p9wRescueTitle: {
    uz: "Asosiy provayderlar javob bermadi — javobni tekin zaxira shlyuz orqali boshqa model berdi.",
    "uz-cyrl": "Асосий провайдерлар жавоб бермади — жавобни текин захира шлюз орқали бошқа модел берди.",
    ru: "Основные провайдеры не ответили — ответ дала другая модель через бесплатный резервный шлюз.",
    en: "The main providers did not respond — a different model answered through a free backup gateway.",
  },
  p9wAuto: { uz: "Auto", "uz-cyrl": "Авто", ru: "Авто", en: "Auto" },
  p9wUpstreamTitle: {
    uz: "Provayder qaytargan model: {id}",
    "uz-cyrl": "Провайдер қайтарган модел: {id}",
    ru: "Модель по данным провайдера: {id}",
    en: "Model reported by the provider: {id}",
  },
  p9wCachedTitle: {
    uz: "Javob keshdan qaytdi — model chaqirilmadi, token sarflanmadi.",
    "uz-cyrl": "Жавоб кешдан қайтди — модел чақирилмади, токен сарфланмади.",
    ru: "Ответ из кеша — модель не вызывалась, токены не списаны.",
    en: "Answer served from cache — no model call, no tokens used.",
  },
  p9wTokens: { uz: "≈{n} token", "uz-cyrl": "≈{n} токен", ru: "≈{n} токенов", en: "≈{n} tokens" },
  p9wTokensBilledTitle: {
    uz: "Token soni — server taxmini (~4 belgi = 1 token): aynan shu son oylik limitingizga yozildi.",
    "uz-cyrl": "Токен сони — сервер тахмини (~4 белги = 1 токен): айнан шу сон ойлик лимитингизга ёзилди.",
    ru: "Число токенов — серверная оценка (~4 символа = 1 токен): именно оно списано с месячного лимита.",
    en: "Token count is the server's estimate (~4 characters = 1 token): exactly this amount was counted against your monthly limit.",
  },
  p9wTokensNotBilledTitle: {
    uz: "Token soni — server taxmini (~4 belgi = 1 token). Hisobga yozilmadi (demo rejim).",
    "uz-cyrl": "Токен сони — сервер тахмини (~4 белги = 1 токен). Ҳисобга ёзилмади (демо режим).",
    ru: "Число токенов — серверная оценка (~4 символа = 1 токен). Не списано (демо-режим).",
    en: "Token count is the server's estimate (~4 characters = 1 token). Not counted (demo mode).",
  },
  p9wMonthPct: {
    uz: "Oylik token limitingizning {p}% qismi",
    "uz-cyrl": "Ойлик токен лимитингизнинг {p}% қисми",
    ru: "{p}% вашего месячного лимита токенов",
    en: "{p}% of your monthly token limit",
  },
  p9wMonthPctShort: { uz: "oylik limitning {p}%", "uz-cyrl": "ойлик лимитнинг {p}%", ru: "{p}% месячного лимита", en: "{p}% of monthly limit" },

  /* ---- Sozlamalar → Ma'lumot va maxfiylik ---- */
  p9wPrivacyWhere: {
    uz: "Suhbatlaringiz qayerda saqlanadi, qaysi AI provayderlar ko'radi va o'qitishda ishlatiladimi —",
    "uz-cyrl": "Суҳбатларингиз қаерда сақланади, қайси AI провайдерлар кўради ва ўқитишда ишлатиладими —",
    ru: "Где хранятся ваши чаты, какие AI-провайдеры их видят и используются ли они для обучения —",
    en: "Where your chats are stored, which AI providers see them and whether they are used for training —",
  },
  p9wPrivacyLink: { uz: "Maxfiylik siyosati", "uz-cyrl": "Махфийлик сиёсати", ru: "Политика конфиденциальности", en: "Privacy Policy" },
} satisfies Dict;
