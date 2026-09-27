// Terminalga ko'p satrli qo'yish (paste) himoyasi. Toza funksiyalar —
// desktop/scripts/test-terminal.mjs ularni to'g'ridan-to'g'ri sinaydi.

/**
 * Qo'yilayotgan matn tasdiq so'raydimi? Klassik "paste injection" himoyasi:
 * ichida satr ko'chirish (CR/LF) bo'lsa — shell uni DARHOL bajaradi, shuning
 * uchun bir marta so'raymiz.
 */
export function needsPasteConfirm(text) {
  return typeof text === "string" && text.length > 0 && /[\r\n]/.test(text);
}

/** Qo'yiladigan buyruqlar (satrlar) soni — tasdiq oynasida ko'rsatiladi. */
export function pasteLineCount(text) {
  if (typeof text !== "string" || !text) return 0;
  return text.replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n").length;
}

/** Ko'rinmas/xavfli belgilar: boshqaruv belgilari, bidi va nol-kenglikdagilar. */
function isHidden(code) {
  if (code === 0x0a) return false; // yangi satr — ko'rinadi
  if (code <= 0x08 || (code >= 0x0b && code <= 0x1f) || (code >= 0x7f && code <= 0x9f)) return true;
  if (code >= 0x200b && code <= 0x200f) return true; // nol-kenglik, LRM/RLM
  if (code >= 0x202a && code <= 0x202e) return true; // bidi override
  if (code >= 0x2066 && code <= 0x2069) return true; // bidi izolyatsiya
  return code === 0x2028 || code === 0x2029 || code === 0xfeff;
}

/**
 * Tasdiq oynasidagi xavfsiz ko'rinish: ko'rinmas boshqaruv belgilari
 * (ANSI ketma-ketliklari, bidi/nol-kenglik) matnni boshqacha ko'rsatmasin.
 */
export function pastePreview(text, { maxChars = 2000 } = {}) {
  const s = String(text ?? "")
    .slice(0, maxChars)
    .replace(/\r\n?/g, "\n");
  let out = "";
  for (const ch of s) {
    const code = ch.codePointAt(0);
    out += isHidden(code) ? `\\u${code.toString(16).padStart(4, "0")}` : ch;
  }
  return out;
}
