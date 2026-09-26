// O'zbek lotin → kirill transliteratsiyasi (UI matnlari uchun, qoida asosida).
// {placeholder}, klaviatura/brend nomlari va raqamli so'zlar o'zgarmaydi.

const PROTECT = new Set([
  "Ctrl", "Shift", "Enter", "Esc", "Tab", "Alt", "Backspace", "Windows", "GitHub", "SmartScreen",
  "Cowork", "Explorer", "OmniRoute", "Undo", "Auto", "Claude", "Mac", "Linux", "Chromium", "Electron",
]);

/** Qisqartma va brendlar — lotinda qoladi. */
const CAPS = new Set(["SOVEREIGN", "CLI", "OK", "AI", "SQL", "VS", "CI", "README", "API", "URL", "UNC", "JSON", "HTML", "CSS", "UI", "UX", "PC", "GUI"]);

const MAP = {
  a: "а", b: "б", c: "с", d: "д", f: "ф", g: "г", h: "ҳ", i: "и", j: "ж", k: "к", l: "л", m: "м",
  n: "н", o: "о", p: "п", q: "қ", r: "р", s: "с", t: "т", u: "у", v: "в", w: "в", x: "х", y: "й", z: "з",
};
const APOS = "‘’'ʻ`";
const VOWELS = "aeiouAEIOU";

function up(cyr, srcFirst, srcSecond) {
  if (srcFirst !== srcFirst.toLowerCase()) {
    // "Sh" → "Ш", "SH" → "Ш"
    return cyr.toUpperCase();
  }
  if (srcSecond && srcSecond !== srcSecond.toLowerCase()) return cyr.toUpperCase();
  return cyr;
}

function word(w) {
  let out = "";
  for (let i = 0; i < w.length; i++) {
    const ch = w[i];
    const lo = ch.toLowerCase();
    const next = w[i + 1] ?? "";
    const nlo = next.toLowerCase();
    if ((lo === "o" || lo === "g") && isApos(next)) {
      out += up(lo === "o" ? "ў" : "ғ", ch);
      i++;
      continue;
    }
    if (lo === "s" && nlo === "h") { out += up("ш", ch); i++; continue; }
    if (lo === "c" && nlo === "h") { out += up("ч", ch); i++; continue; }
    if (lo === "y" && "oaue".includes(nlo) && nlo && !(nlo === "o" && isApos(w[i + 2]))) {
      const m = { o: "ё", a: "я", u: "ю", e: "е" }[nlo];
      if (m) { out += up(m, ch); i++; continue; }
    }
    if (lo === "e") {
      const prev = w[i - 1];
      out += up(i === 0 || (prev && VOWELS.includes(prev)) ? "э" : "е", ch);
      continue;
    }
    if (isApos(ch)) { out += "ъ"; continue; }
    const m = MAP[lo];
    out += m ? up(m, ch) : ch;
  }
  return out;
}

const isApos = (ch) => !!ch && APOS.includes(ch);

export function toCyrillic(text) {
  return String(text).replace(/\{\w+\}|[A-Za-z][A-Za-z‘’'ʻ`]*/g, (tok, offset, all) => {
    if (tok.startsWith("{")) return tok;
    // Fayl/yo'l bo'laklari (.ssh, ~/.sovereign, src/x) o'zgarmaydi.
    if (/[.~\\]/.test(all[offset - 1] ?? "")) return tok;
    // "Cowork’ga" — himoyalangan asos + o'zbekcha qo'shimcha.
    const m = /^([A-Za-z]+)[’'`]([A-Za-z]+)$/.exec(tok);
    if (m && (PROTECT.has(m[1]) || CAPS.has(m[1]))) return `${m[1]}’${word(m[2])}`;
    if (PROTECT.has(tok) || CAPS.has(tok)) return tok;
    return word(tok); // "YOZILMADI" → "ЁЗИЛМАДИ" (katta harf saqlanadi)
  });
}
