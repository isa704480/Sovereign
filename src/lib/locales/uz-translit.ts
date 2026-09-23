/**
 * O'zbek lotin → kirill transliteratsiyasi (davlat nomlari kabi ro'yxatlar uchun).
 * Qoidalar: o'→ў, g'→ғ, sh→ш, ch→ч, yo→ё, yu→ю, ya→я, ye→е, ts→ц,
 * so'z boshidagi e→э, x→х, h→ҳ, q→қ, j→ж, y→й, tutuq belgisi→ъ.
 */

const APOS = "['ʻʼ‘’`]";

const PAIRS: [RegExp, string][] = [
  [new RegExp(`o${APOS}`, "g"), "ў"],
  [new RegExp(`O${APOS}`, "g"), "Ў"],
  [new RegExp(`g${APOS}`, "g"), "ғ"],
  [new RegExp(`G${APOS}`, "g"), "Ғ"],
  [/sh/g, "ш"],
  [/S[hH]/g, "Ш"],
  [/ch/g, "ч"],
  [/C[hH]/g, "Ч"],
  [/yo/g, "ё"],
  [/Y[oO]/g, "Ё"],
  [/yu/g, "ю"],
  [/Y[uU]/g, "Ю"],
  [/ya/g, "я"],
  [/Y[aA]/g, "Я"],
  [/ye/g, "е"],
  [/Y[eE]/g, "Е"],
  [/ts/g, "ц"],
  [/T[sS]/g, "Ц"],
  // So'z boshidagi "e" → "э"
  [/(^|[^A-Za-zА-Яа-яЁёЎўҚқҒғҲҳ])e/g, "$1э"],
  [/(^|[^A-Za-zА-Яа-яЁёЎўҚқҒғҲҳ])E/g, "$1Э"],
];

const SINGLE: Record<string, string> = {
  a: "а", b: "б", c: "ц", d: "д", e: "е", f: "ф", g: "г", h: "ҳ", i: "и", j: "ж", k: "к", l: "л", m: "м",
  n: "н", o: "о", p: "п", q: "қ", r: "р", s: "с", t: "т", u: "у", v: "в", w: "в", x: "х", y: "й", z: "з",
  A: "А", B: "Б", C: "Ц", D: "Д", E: "Е", F: "Ф", G: "Г", H: "Ҳ", I: "И", J: "Ж", K: "К", L: "Л", M: "М",
  N: "Н", O: "О", P: "П", Q: "Қ", R: "Р", S: "С", T: "Т", U: "У", V: "В", W: "В", X: "Х", Y: "Й", Z: "З",
  "ʼ": "ъ",
};

export function uzLatinToCyrillic(text: string): string {
  let s = text;
  for (const [re, to] of PAIRS) s = s.replace(re, to);
  return s.replace(/[A-Za-zʼ]/g, (ch) => SINGLE[ch] ?? ch);
}
