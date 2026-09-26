// O'zbek lotin → kirill transliteratsiyasi (UI matnlari uchun, qoida asosida).
// {placeholder}, klaviatura/brend nomlari va raqamli so'zlar o'zgarmaydi.

// Bu fallback: aniq (qo'lda tekshirilgan) kirill matni i18n.js dagi `uzCyrl` lug'atida.
// Translit faqat uzCyrl'da yo'q kalitlar uchun ishlatiladi.
const PROTECT = new Set([
  "Ctrl", "Shift", "Enter", "Esc", "Tab", "Alt", "Backspace", "Windows", "GitHub", "SmartScreen",
  "Cowork", "Explorer", "OmniRoute", "Undo", "Auto", "Claude", "Mac", "Linux", "Chromium", "Electron",
  "Full", "auto", "push", "publish", "deploy", "sudo", "build",
  // Texnik atamalar, buyruq va mahsulot nomlari — kirillda ham lotinda yoziladi.
  "diff", "Diff", "src", "npm", "git", "Git", "rebase", "merge", "hook", "hooks", "tasks", "Code",
  "React", "Express", "Node", "Vite", "Releases", "preload", "sovereign", "exit", "EXIT",
  "claude", "gemini", "deepseek", "Gemini", "DeepSeek", "Llama", "Qwen", "tools", "vision", "reasoning",
]);

/** Translit qoidasiga bo'ysunmaydigan o'zlashma so'zlar (kichik harf asos → kirill asos). */
const STEMS = [["kompyuter", "компьютер"]];

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
    // "-tsiya/-tsion" (operatsiya, integratsiya) → "ц".
    if (lo === "t" && nlo === "s" && /^(iya|io)/i.test(w.slice(i + 2))) { out += up("ц", ch); i++; continue; }
    // "Is’hoq": tutuq belgisi s+h ni ajratadi — kirillda "сҳ", ъ yozilmaydi.
    if (isApos(ch) && (w[i - 1] ?? "").toLowerCase() === "s" && nlo === "h") continue;
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
    // Fayl/yo'l bo'laklari (.ssh, ~/.sovereign) va tugma birikmalari (Ctrl+O) o'zgarmaydi.
    if (/[.~\\+]/.test(all[offset - 1] ?? "")) return tok;
    const lower = tok.toLowerCase();
    for (const [lat, cyr] of STEMS) {
      if (lower.startsWith(lat)) {
        const rest = word(tok.slice(lat.length));
        return (tok[0] === tok[0].toUpperCase() ? cyr[0].toUpperCase() + cyr.slice(1) : cyr) + rest;
      }
    }
    // "Cowork’ga" — himoyalangan asos + o'zbekcha qo'shimcha.
    const m = /^([A-Za-z]+)[’'`]([A-Za-z]+)$/.exec(tok);
    if (m && (PROTECT.has(m[1]) || CAPS.has(m[1]))) return `${m[1]}’${word(m[2])}`;
    if (PROTECT.has(tok) || CAPS.has(tok)) return tok;
    return word(tok); // "YOZILMADI" → "ЁЗИЛМАДИ" (katta harf saqlanadi)
  });
}
