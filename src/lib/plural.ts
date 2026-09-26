import { fmt, LANGS, translate, type Lang, type TKey } from "@/lib/i18n";

/**
 * Sonli matnning ko'plik shakllari: one (1 file / 1 файл), few (2–4 файла), many (5 файлов / 5 files).
 * O'zbek tilida son bilan ot o'zgarmaydi — uchala kalit ham bir xil matnga ega bo'lishi mumkin.
 */
export interface PluralKeys {
  one: TKey;
  few: TKey;
  many: TKey;
}

const rulesCache = new Map<Lang, Intl.PluralRules>();

function rules(lang: Lang): Intl.PluralRules {
  let r = rulesCache.get(lang);
  if (!r) {
    const tag = LANGS.find((l) => l.id === lang)?.htmlLang ?? "en";
    r = new Intl.PluralRules(tag);
    rulesCache.set(lang, r);
  }
  return r;
}

/** plural("ru", 3, KEYS) → "3 строки"; matndagi {n} songa almashtiriladi (boshqa o'zgaruvchilar — vars). */
export function plural(lang: Lang, n: number, keys: PluralKeys, vars: Record<string, string | number> = {}): string {
  const cat = rules(lang).select(n);
  const key = cat === "one" ? keys.one : cat === "few" ? keys.few : keys.many;
  return fmt(translate(lang, key), { ...vars, n });
}
