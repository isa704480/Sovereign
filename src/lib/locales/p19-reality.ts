import type { Dict } from "@/lib/i18n";

/**
 * 19-bosqich (da'vo va haqiqat auditi) — yangi matnlar, 4 tilda (uz / uz-cyrl / ru / en).
 * p19Conn* — connector saqlanmadi (CONNECTOR_TOKEN_KEY sozlanmagan / boshqa xato).
 */
export const P19R = {
  p19ConnKeyMissing: {
    uz: "Connector saqlanmadi: serverda tokenlarni shifrlash sozlanmagan. Keyinroq urinib ko'ring yoki qo'llab-quvvatlashga yozing.",
    "uz-cyrl": "Connector сақланмади: серверда токенларни шифрлаш созланмаган. Кейинроқ уриниб кўринг ёки қўллаб-қувватлашга ёзинг.",
    ru: "Коннектор не сохранён: на сервере не настроено шифрование токенов. Попробуйте позже или напишите в поддержку.",
    en: "Connector not saved: token encryption is not configured on the server. Try again later or contact support.",
  },
  p19ConnSaveFailed: {
    uz: "Connector saqlanmadi. Qaytadan urinib ko'ring.",
    "uz-cyrl": "Connector сақланмади. Қайтадан уриниб кўринг.",
    ru: "Коннектор не сохранён. Попробуйте ещё раз.",
    en: "Connector not saved. Please try again.",
  },
} satisfies Dict;
