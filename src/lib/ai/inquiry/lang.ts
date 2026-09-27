/**
 * Chuqur so'rash — til va yozuv (R2 i18n ko'rigi 2, 3, 4-band). Pure: tarmoq yo'q, server-only yo'q.
 *
 * - `inquiryLang(uiLang, text)` — savol kartasi va javob sarlavhalari uchun til: UI tili asos, lekin xabar
 *   aniq boshqa yozuvda/tilda bo'lsa (UI "uz", xabar kirillcha o'zbekcha → "uz-cyrl"; UI "uz-cyrl", xabar
 *   lotincha → "uz"; UI "uz", xabar inglizcha → "en") — xabarniki. Belgilar kam yoki noaniq — UI tili.
 * - `enforceUzCyrl(result)` — "uz-cyrl" kartada model lotin yozuviga og'ib ketsa, o'zbekcha lotin satrlar
 *   kirillga o'giriladi (texnik nomlar, kod, mask tokenlari saqlanadi). Inglizcha texnik satr tegilmaydi.
 */
import type { Lang } from "@/lib/i18n";
import { uzLatinToCyrillic } from "@/lib/locales/uz-translit";
import type { MissingFact, TriageResult } from "./types";

const CYR_RE = /[Ѐ-ӿ]/g;
const LAT_RE = /[A-Za-z]/g;

function counts(text: string): { cyr: number; lat: number } {
  return { cyr: (text.match(CYR_RE) ?? []).length, lat: (text.match(LAT_RE) ?? []).length };
}

/** So'zlar soni (chegara: harf bo'lmagan belgi; o'zbekcha tutuq belgisi so'z ichida). */
function score(text: string, words: string): number {
  const re = new RegExp(`(?<![\\p{L}'ʻʼ’])(?:${words})(?![\\p{L}'ʻʼ’])`, "giu");
  return (text.match(re) ?? []).length;
}

const UZ_CYR_WORDS =
  "бу|ва|учун|керак|нима|нега|қандай|қайси|қачон|қаерда|билан|ёки|эмас|бор|йўқ|салом|менга|мен|сиз|сизнинг|қилиб|бериб|ёзиб|бер|қил|ёз|ҳам|лекин|агар|жуда|яна|шу|бирор|борми|керакми|қилинг|беринг|ёзинг";
const RU_WORDS =
  "и|не|что|как|это|для|мне|или|пожалуйста|вы|ваш|какой|какая|какие|нужно|надо|есть|у|меня|мой|моя|если|почему|когда|где|сделай|напиши|помоги|можно|ли|по|на|в|с|за|из|от|до";
const UZ_LAT_WORDS =
  "va|uchun|kerak|nima|nega|qanday|qaysi|qachon|qayerda|bilan|yoki|emas|bor|yo'q|salom|menga|men|siz|sizning|qilib|berib|yozib|ber|qil|yoz|ham|lekin|agar|juda|yana|shu|bormi|kerakmi|qiling|bering|yozing|iltimos|haqida|bo'yicha|mumkin|qilish|kerakli";
const EN_WORDS =
  "the|and|is|are|what|how|which|why|when|where|do|does|you|your|my|for|with|to|of|please|should|can|could|would|this|that|write|create|build|explain|help|need|want|it|in|on|a|an";

function uzCyrScore(t: string): number {
  return score(t, UZ_CYR_WORDS) + 2 * (t.match(/[ўқғҳЎҚҒҲ]/g) ?? []).length;
}
function ruScore(t: string): number {
  return score(t, RU_WORDS) + 2 * (t.match(/[ыщЫЩ]/g) ?? []).length;
}
function uzLatScore(t: string): number {
  return score(t, UZ_LAT_WORDS) + 2 * (t.match(/(?:[oOgG]['ʻʼ’‘`])|\b\p{L}+(?:ingiz|imiz|lari|larni|dagi|ning)\b/gu) ?? []).length;
}
function enScore(t: string): number {
  return score(t, EN_WORDS);
}

/** Karta/sarlavha tili: UI tili + xabar yozuvi/tili (R2-2). */
export function inquiryLang(uiLang: Lang, text: string): Lang {
  const t = String(text ?? "").normalize("NFC");
  const { cyr, lat } = counts(t);
  if (cyr + lat < 4) return uiLang;
  if (cyr > lat) {
    const uz = uzCyrScore(t);
    const ru = ruScore(t);
    if (uz > ru) return "uz-cyrl";
    if (ru > uz) return "ru";
    if (uiLang === "uz-cyrl" || uiLang === "ru") return uiLang;
    return uiLang === "uz" ? "uz-cyrl" : "ru";
  }
  const uz = uzLatScore(t);
  const en = enScore(t);
  if (!uz && !en) return uiLang === "uz-cyrl" ? "uz" : uiLang;
  if (uiLang === "uz" || uiLang === "uz-cyrl") return en > uz ? "en" : "uz";
  if (uiLang === "en") return uz > en ? "uz" : "en";
  // ru UI, lotin xabar
  return uz > en ? "uz" : en > uz ? "en" : uiLang;
}

/**
 * Texnik bo'lak — o'girilmaydi: raqam, nuqta, pastki chiziq, qavs/slesh, 2+ bosh harf (API, iOS, JShShIR),
 * o'zbek lotinida yo'q birikmalar (c — "ch" dan tashqari, w, th, ph, ee, oo) — "React", "Python", "Docker".
 */
const PROTECT_RE = /[0-9._/\\@#:=+[\]{}()<>$%&*|~^"-]|c(?!h)|w|th|ph|ee|oo/i;
const PROTECT_CASE_RE = /\p{Lu}.*\p{Lu}/u;

function toCyrToken(tok: string): string {
  if (!/[A-Za-z]/.test(tok)) return tok;
  const core = tok.replace(/[?!,;.:]+$/u, "");
  const tail = tok.slice(core.length);
  if (PROTECT_CASE_RE.test(core) || PROTECT_RE.test(core.replace(/^['ʻʼ’‘`]+|['ʻʼ’‘`]+$/g, ""))) return tok;
  return uzLatinToCyrillic(core) + tail;
}

/** Bitta satr: lotin ko'p va o'zbekcha ko'rinadi → kirill (texnik bo'laklar saqlanadi). */
export function toUzCyrlIfLatin(s: string): string {
  if (!s) return s;
  const { cyr, lat } = counts(s);
  if (lat < 3 || lat <= cyr) return s;
  if (enScore(s) > uzLatScore(s)) return s; // inglizcha texnik ibora — tegilmaydi
  return s
    .split(/(\s+)/)
    .map((part) => (/^\s+$/.test(part) ? part : toCyrToken(part)))
    .join("");
}

/** "uz-cyrl" kartasi: model lotin yozuvida yozgan o'zbekcha satrlar kirillga (R2-4). Boshqa tillarda — o'zgarishsiz. */
export function enforceUzCyrl(result: TriageResult | null, lang: Lang): TriageResult | null {
  if (!result || lang !== "uz-cyrl") return result;
  const fix = toUzCyrlIfLatin;
  const facts: MissingFact[] = result.missing_facts.map((f) => ({
    ...f,
    question: fix(f.question),
    why: fix(f.why),
    ...(f.options ? { options: f.options.map(fix) } : {}),
  }));
  return {
    ...result,
    goal: fix(result.goal),
    missing_facts: facts,
    hidden_assumptions: result.hidden_assumptions.map(fix),
    risks: result.risks.map(fix),
  };
}
