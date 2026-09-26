/**
 * Javobdan keyingi deterministik tekshiruvlar (LLM'siz, bepul, ~1 ms):
 *
 *  1. AMAL DA'VOLARI — javob "yubordim / yaratdim / saqladim / отправил / I've sent"
 *     deb, tashqi amalni bajarganini aytadimi? Aytsa, shu so'rovdagi connector
 *     jurnalida (connector-tools.ts → ActionRecord) bu amal haqiqatan ✓ bajarilganmi?
 *  2. IQTIBOS BELGILARI — research javobidagi [n] raqamlari qidiruv qaytargan
 *     manbalar ro'yxatiga mos keladimi?
 *
 * Toza modul ("server-only" emas): route.ts va lokal tsx testlar import qiladi.
 * Uz (lotin + kirill), ru, en. Kirill o'zbekcha matn lotinga o'giriladi va
 * o'zbekcha naqshlar ikkala yozuvga ham ishlaydi.
 */

export type ActionVerb = "send" | "create" | "save" | "delete" | "add" | "schedule" | "book" | "upload" | "run";
export type ActionObject =
  | "email"
  | "message"
  | "sheet"
  | "table"
  | "presentation"
  | "document"
  | "file"
  | "event"
  | "row"
  | "repo"
  | "code";

export interface ActionEffect {
  verb: ActionVerb | "any";
  object: ActionObject | "any";
}

/** Connector jurnalidagi bitta chaqiruv: nimaga urinildi va nima haqiqatan bajarildi. */
export interface ActionRecord {
  tool: string;
  status: "ok" | "partial" | "failed";
  /** Chaqiruv urinib ko'rgan ta'sirlar (o'qish toollarida bo'sh). */
  attempted: ActionEffect[];
  /** Haqiqatan bajarilgan ta'sirlar (xato bo'lsa bo'sh; qisman bo'lsa — faqat bajarilgan qismi). */
  done: ActionEffect[];
}

export interface ActionClaim {
  verb: ActionVerb;
  object?: ActionObject;
  /** Da'vo qilingan gap (asl matndan, qisqartirilgan). */
  text: string;
  /** strong — 1-shaxs ("yubordim", "I sent"); borderline — majhul/3-shaxs ("yuborildi", "was sent"). */
  strength: "strong" | "borderline";
}

export type ClaimReason = "no_calls" | "failed" | "partial" | "not_performed";

export interface UnsupportedClaim extends ActionClaim {
  reason: ClaimReason;
}

const MAX_CLAIMS = 5;
const SNIPPET = 180;

/* ------------------------------ Normallashtirish ------------------------------ */

const APOS_RE = /[‘’ʻʼ`´ʹ′]/g;

const UZ_CYRL: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "j", з: "z", и: "i", й: "y", к: "k",
  л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "x", ц: "ts",
  ч: "ch", ш: "sh", щ: "sh", ъ: "'", ы: "i", ь: "", э: "e", ю: "yu", я: "ya", ў: "o'", қ: "q",
  ғ: "g'", ҳ: "h",
};

function normalize(s: string): string {
  return s.replace(APOS_RE, "'").toLowerCase();
}

/** O'zbek kirill → lotin (rus so'zlari ham o'giriladi, lekin o'zbekcha naqshlarga tushmaydi). */
function uzLatin(s: string): string {
  let out = "";
  for (const ch of s) out += UZ_CYRL[ch] ?? ch;
  return out;
}

/** Kod, havola, iqtibos (blockquote) va qisqa qo'shtirnoqli bo'laklar — da'vo emas. */
function stripNonProse(text: string): string {
  return text
    .replace(/```[\s\S]*?(?:```|$)/g, "\n")
    .replace(/`[^`\n]*`/g, " ")
    .replace(/^\s*>.*$/gm, "\n")
    .replace(/\]\([^)\s]*\)/g, "]")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/["“”«»„][^"“”«»„\n]{0,80}["“”«»„]/g, " ");
}

function sentences(text: string): string[] {
  return text
    .split(/\n+|(?<=[.!?…])\s+/)
    .map((s) => s.replace(/^[\s\-*•·#>\d.)]+/, "").replace(/^[✅✔✓☑\u{1F4E7}\u{1F4E8}\u{1F4E9}\u{1F4C5}\u{1F5D1}\u{1F4BE}\s]+/u, "").trim())
    .filter((s) => s.length >= 4);
}

/* --------------------------------- Leksikon --------------------------------- */

const L = "(?<![\\p{L}\\p{N}'])";
const R = "(?![\\p{L}\\p{N}])";
const rx = (body: string, flags = "gu") => new RegExp(`${L}(?:${body})${R}`, flags);

interface VerbSpec {
  verb: ActionVerb;
  /** Qaysi obyekt bilan birga kelsa — da'vo (obyektsiz "yubordim" noaniq). */
  objects: ActionObject[];
  /** Obyektsiz ham da'vo (mas. "bron qildim", "I booked"). */
  objectless?: boolean;
  en: string;
  uz: string;
  uzPassive: string;
  ru: string;
  ruPassive: string;
}

const VERBS: VerbSpec[] = [
  {
    verb: "send",
    objects: ["email", "message", "file", "document", "event", "sheet", "presentation"],
    en: "sent|emailed|mailed|forwarded|delivered",
    uz: "yubord(?:im|ik)|jo'natd(?:im|ik)",
    uzPassive: "yuborildi|jo'natildi",
    ru: "отправил[аи]?|отослал[аи]?|переслал[аи]?|выслал[аи]?",
    ruPassive: "отправлен[аоы]?|отослан[аоы]?|переслан[аоы]?",
  },
  {
    verb: "create",
    objects: ["sheet", "table", "presentation", "document", "file", "event", "repo"],
    en: "created|generated|set up",
    uz: "yaratd(?:im|ik)|tuzd(?:im|ik)",
    uzPassive: "yaratildi|tuzildi",
    ru: "создал[аи]?",
    ruPassive: "создан[аоы]?",
  },
  {
    verb: "save",
    objects: ["file", "document", "sheet", "table", "presentation", "email", "event", "row", "code"],
    en: "saved|stored|exported",
    uz: "saqlad(?:im|ik)|saqlab qo'yd(?:im|ik)",
    uzPassive: "saqlandi|saqlab qo'yildi",
    ru: "сохранил[аи]?",
    ruPassive: "сохран[её]н[аоы]?",
  },
  {
    verb: "delete",
    objects: ["email", "message", "file", "document", "sheet", "table", "presentation", "event", "row", "repo"],
    en: "deleted|removed|erased|trashed|archived",
    uz: "o'chird(?:im|ik)|o'chirib tashlad(?:im|ik)",
    uzPassive: "o'chirildi|o'chirib tashlandi",
    ru: "удалил[аи]?|ст[её]р(?:ла|ли)?",
    ruPassive: "удал[её]н[аоы]?",
  },
  {
    verb: "add",
    objects: ["row", "sheet", "table", "event", "document", "presentation"],
    en: "added|appended|inserted",
    uz: "qo'shd(?:im|ik)|kiritd(?:im|ik)",
    uzPassive: "qo'shildi|kiritildi",
    ru: "добавил[аи]?|вн[её]с(?:ла|ли)?",
    ruPassive: "добавлен[аоы]?|внес[её]н[аоы]?",
  },
  {
    verb: "schedule",
    objects: ["event"],
    en: "scheduled",
    uz: "rejalashtird(?:im|ik)|belgilad(?:im|ik)",
    uzPassive: "rejalashtirildi|belgilandi",
    ru: "запланировал[аи]?|назначил[аи]?",
    ruPassive: "запланирован[аоы]?|назначен[аоы]?",
  },
  {
    verb: "book",
    objects: ["event"],
    objectless: true,
    en: "booked|reserved",
    uz: "bron qild(?:im|ik)|band qild(?:im|ik)",
    uzPassive: "bron qilindi",
    ru: "забронировал[аи]?|зарезервировал[аи]?",
    ruPassive: "забронирован[аоы]?|зарезервирован[аоы]?",
  },
  {
    verb: "upload",
    objects: ["file", "document", "repo", "message", "presentation", "sheet", "code"],
    en: "uploaded|posted|published|pushed|committed|deployed",
    uz: "yuklad(?:im|ik)|joylad(?:im|ik)|joylashtird(?:im|ik)|e'lon qild(?:im|ik)",
    uzPassive: "yuklandi|joylandi|joylashtirildi|e'lon qilindi",
    ru: "загрузил[аи]?|опубликовал[аи]?|выложил[аи]?|закоммитил[аи]?|запушил[аи]?",
    ruPassive: "загружен[аоы]?|опубликован[аоы]?|выложен[аоы]?",
  },
  {
    verb: "run",
    objects: ["code"],
    en: "ran|executed|tested",
    uz: "ishga tushird(?:im|ik)|sinab ko'rd(?:im|ik)|sinovdan o'tkazd(?:im|ik)|ishlatib ko'rd(?:im|ik)",
    uzPassive: "ishga tushirildi|sinovdan o'tkazildi",
    ru: "запустил[аи]?|протестировал[аи]?|выполнил[аи]?",
    ruPassive: "запущен[аоы]?|протестирован[аоы]?",
  },
];

/** Obyektlar (en + ru asl matnda, uz — lotinlashtirilgan matnda ham). */
const OBJECTS: [ActionObject, RegExp][] = [
  ["email", rx("e-?mails?|gmail|mails?|inbox|letters?|xat(?:ni|ga|lar\\p{L}*|ingiz\\p{L}*|ingizni)?|maktub\\p{L}*|elektron pochta\\p{L}*|pochta\\p{L}*|письм\\p{L}*|имейл\\p{L}*|емейл\\p{L}*|почт\\p{L}*")],
  ["message", rx("messages?|dms?|sms|xabar\\p{L}*|сообщени\\p{L}*|смс")],
  ["sheet", rx("spreadsheets?|google sheets?|sheets?\\p{L}*|электронн\\p{L}* таблиц\\p{L}*")],
  ["table", rx("tables?|jadval\\p{L}*|таблиц\\p{L}*")],
  ["presentation", rx("presentations?|slides?|slide decks?|decks?|taqdimot\\p{L}*|slayd\\p{L}*|презентаци\\p{L}*|слайд\\p{L}*")],
  ["document", rx("documents?|docs?|google docs|hujjat\\p{L}*|документ\\p{L}*")],
  ["file", rx("files?|folders?|pdf|csv|xlsx|docx|fayl\\p{L}*|papka\\p{L}*|файл\\p{L}*|папк\\p{L}*")],
  ["event", rx("events?|meetings?|appointments?|calendar|invites?|invitations?|reminders?|reservations?|bookings?|tickets?|tadbir\\p{L}*|uchrashuv\\p{L}*|kalendar\\p{L}*|taqvim\\p{L}*|eslatma\\p{L}*|taklifnoma\\p{L}*|bron\\p{L}*|chipta\\p{L}*|встреч\\p{L}*|событи\\p{L}*|календар\\p{L}*|напоминани\\p{L}*|приглашени\\p{L}*|брон\\p{L}*|билет\\p{L}*|мероприяти\\p{L}*")],
  ["row", rx("rows?|records?|entries|entry|qator\\p{L}*|yozuv\\p{L}*|строк\\p{L}*|запис(?:ь|и|ей|ям)")],
  ["repo", rx("repo(?:s|sitory|sitories)?|pull requests?|prs?|github issues?|commits?|branch(?:es)?|repozitoriy\\p{L}*|репозитори\\p{L}*|коммит\\p{L}*|ветк\\p{L}*|пулл?-?реквест\\p{L}*")],
  ["code", rx("code|scripts?|tests?|program|quer(?:y|ies)|commands?|kod\\p{L}*|skript\\p{L}*|test\\p{L}*|dastur\\p{L}*|buyruq\\p{L}*|код\\p{L}*|скрипт\\p{L}*|тест\\p{L}*|программ\\p{L}*|команд\\p{L}*")],
];

/** Obyekt so'zi bo'lib ko'rinadigan, lekin tashqi obyekt bo'lmagan iboralar. */
const OBJECT_NOISE = rx(
  "e-?mail address(?:es)?|e-?mail manzil\\p{L}*|elektron pochta manzil\\p{L}*|адрес\\p{L}* (?:электронной )?почты|error messages?|xato xabar\\p{L}*|сообщени\\p{L}* об ошибк\\p{L}*",
);

/** Javob matni ichidagi narsaga ishora ("quyidagi jadval", "ниже", "here") — tashqi amal emas. */
const DEICTIC = rx(
  "below|above|here|following|this answer|this chat|in (?:the|your) (?:text|code)|quyida|quyidagi|yuqorida|yuqoridagi|mana|shu yerda|matn\\p{L}*|ниже|выше|вот|здесь|следующ\\p{L}*|в тексте|в коде",
  "u",
);
/** DEICTIC faqat shu obyektlarda amal qiladi (xat/kalendar/jadval-servis — javob ichida bo'lmaydi). */
const DEICTIC_OBJECTS = new Set<ActionObject>(["table", "row", "file", "document", "code", "message"]);
/** Matn tahrirlash fe'llari (javob ichidagi jadval/kodni "yaratdim/qo'shdim/o'chirdim"). */
const EDIT_VERBS = new Set<ActionVerb>(["create", "add", "delete"]);

const EN_NEG = /(?:\b(?:not|never|unable|cannot|failed|without|if|once|when|after|unless|until|would|could|should|will|can|might)\b|n't)[^,;]*$/;
const RU_NEG = /(?:^|\s)(?:не|ни|нельзя|невозможно|если|когда|вы|ты)(?:\s+\p{L}+)?\s+$/u;
const RU_FIRST = /(?:^|[\s,])(?:я|мы)\s/u;
/** Rus gap boshidagi to'ldiruvchi so'zlar — bulardan keyingi fe'l 1-shaxs deb olinadi ("Готово, отправил"). */
const RU_FILLER = new Set(["готово", "итак", "хорошо", "отлично", "сделано", "ок", "окей", "уже", "также", "только", "что", "успешно", "и", "а", "затем", "потом", "сейчас", "теперь", "всё", "все"]);
const UZ_COND = /(?:^|\s)agar\s/;
const YEAR = /(?<!\d)(?:1[5-9]\d\d|20\d\d)(?!\d)/;

function nearestObject(sentence: string, at: number, allowed: ActionObject[]): { object: ActionObject; match: string } | null {
  const cleaned = sentence.replace(OBJECT_NOISE, (m) => " ".repeat(m.length));
  let best: { object: ActionObject; match: string; dist: number } | null = null;
  for (const [object, re] of OBJECTS) {
    if (!allowed.includes(object)) continue;
    for (const m of cleaned.matchAll(re)) {
      const dist = Math.abs(m.index - at);
      if (!best || dist < best.dist) best = { object, match: m[0], dist };
    }
  }
  // Juda uzoq (boshqa gapdagi) obyekt — bog'lanmagan.
  return best && best.dist <= 90 ? { object: best.object, match: best.match } : null;
}

interface Hit {
  spec: VerbSpec;
  index: number;
  strength: ActionClaim["strength"];
  /** Indeks qaysi matnga tegishli: asl (en/ru) yoki lotinlashtirilgan (uz). */
  src: "orig" | "latin";
}

const UZ_QUOTE_AFTER = /^\s*(?:deb|desam|deya|demay)/;

/** Har fe'l uchun naqshlar bir marta kompilyatsiya qilinadi (matchAll lastIndex'ga bog'liq emas). */
const COMPILED = VERBS.map((spec) => ({
  spec,
  // English: faqat 1-shaxs ("I/we (have) ... sent") yoki gap boshida ("Sent the email ...").
  enFirst: new RegExp(
    `(?:^|[\\s,;:(])(?:i|we)(?:'ve|'d| have| had)?(?:\\s+(?:just|already|now|also|successfully|finally|gone ahead and|went ahead and))*\\s+(?:${spec.en})${R}`,
    "gu",
  ),
  enStart: new RegExp(`^(?:done[!.,:]?\\s+|all set[!.,:]?\\s+)?(?:${spec.en})${R}`, "u"),
  enPassive: new RegExp(
    `(?:(?:has|have)\\s+been\\s+(?:successfully\\s+)?(?:${spec.en})|(?:was|were)\\s+(?:${spec.en})\\s+successfully|successfully\\s+(?:${spec.en}))${R}`,
    "gu",
  ),
  uz: [
    [rx(spec.uz), "strong"],
    [rx(spec.uzPassive), "borderline"],
  ] as const,
  ru: rx(spec.ru),
  ruPassive: rx(spec.ruPassive),
}));

function findHits(orig: string, latin: string): Hit[] {
  const hits: Hit[] = [];
  for (const c of COMPILED) {
    const { spec } = c;
    for (const m of orig.matchAll(c.enFirst)) {
      if (!EN_NEG.test(orig.slice(0, m.index + 1))) hits.push({ spec, index: m.index, strength: "strong", src: "orig" });
    }
    if (c.enStart.test(orig)) hits.push({ spec, index: 0, strength: "borderline", src: "orig" });
    for (const m of orig.matchAll(c.enPassive)) {
      if (!EN_NEG.test(orig.slice(0, m.index))) hits.push({ spec, index: m.index, strength: "borderline", src: "orig" });
    }

    // O'zbek (lotin yoki kirill → lotin): -dim/-dik — 1-shaxs; -ildi — majhul.
    for (const [re, strength] of c.uz) {
      for (const m of latin.matchAll(re)) {
        const after = latin.slice(m.index + m[0].length, m.index + m[0].length + 10);
        if (UZ_QUOTE_AFTER.test(after) || UZ_COND.test(latin.slice(0, m.index))) continue;
        hits.push({ spec, index: m.index, strength, src: "latin" });
      }
    }

    // Rus: o'tgan zamon fe'lida shaxs yo'q — "я/мы" bo'lsa yoki gap boshida (to'ldiruvchi
    // so'zlardan keyin) kelsa strong; aks holda ("Колумб отправил") borderline.
    for (const m of orig.matchAll(c.ru)) {
      const before = orig.slice(0, m.index);
      if (RU_NEG.test(before)) continue;
      const leading = before
        .split(/[^\p{L}]+/u)
        .filter(Boolean)
        .every((w) => RU_FILLER.has(w));
      hits.push({ spec, index: m.index, strength: RU_FIRST.test(before) || leading ? "strong" : "borderline", src: "orig" });
    }
    for (const m of orig.matchAll(c.ruPassive)) {
      const before = orig.slice(0, m.index);
      if (RU_NEG.test(before) || /(?:^|\s)не\s+(?:был[аио]?\s+)?$/u.test(before)) continue;
      hits.push({ spec, index: m.index, strength: "borderline", src: "orig" });
    }
  }
  // Kuchli dalil birinchi — bir xil fe'l+obyekt uchun u saqlanadi.
  return hits.sort((a, b) => (a.strength === b.strength ? 0 : a.strength === "strong" ? -1 : 1));
}

/**
 * Javob matnidan tashqi amal da'volarini topadi. Faqat "fe'l + tashqi obyekt"
 * juftligi da'vo hisoblanadi; savol, inkor, shart, kod, iqtibos va javob
 * ichidagi jadval/kodga ishora qiluvchi gaplar tashlab yuboriladi.
 */
export function detectActionClaims(answer: string): ActionClaim[] {
  if (!answer) return [];
  const hasTable = /^\s*\|.*\|\s*$/m.test(answer) && /\|\s*:?-{3,}/.test(answer);
  const hasCode = /```/.test(answer);
  const out: ActionClaim[] = [];
  const seen = new Set<string>();

  for (const raw of sentences(stripNonProse(answer))) {
    if (out.length >= MAX_CLAIMS) break;
    if (/\?\s*$/.test(raw)) continue;
    const orig = normalize(raw);
    const latin = uzLatin(orig);
    const hits = findHits(orig, latin);
    for (const hit of hits) {
      // Majhul/3-shaxs gapda yil bo'lsa — tarixiy fakt ("1991-yilda yaratildi").
      if (hit.strength === "borderline" && YEAR.test(orig)) continue;
      // Obyekt fe'l topilgan matnda qidiriladi (en/ru — asl, uz — lotinlashtirilgan).
      const obj = nearestObject(hit.src === "orig" ? orig : latin, hit.index, hit.spec.objects);
      if (!obj && !hit.spec.objectless) continue;
      if (obj && DEICTIC_OBJECTS.has(obj.object)) {
        if (DEICTIC.test(orig) || DEICTIC.test(latin)) continue;
        if (EDIT_VERBS.has(hit.spec.verb) && (hasTable || hasCode)) continue;
      }
      const key = `${hit.spec.verb}:${obj?.object ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        verb: hit.spec.verb,
        ...(obj ? { object: obj.object } : {}),
        text: raw.length > SNIPPET ? `${raw.slice(0, SNIPPET - 1)}…` : raw,
        strength: hit.strength,
      });
      if (out.length >= MAX_CLAIMS) break;
    }
  }
  return out;
}

/* ------------------------------- Jurnal bilan ------------------------------- */

const VERB_FAMILY: Record<ActionVerb, ActionVerb[]> = {
  send: ["send"],
  create: ["create"],
  save: ["save", "add", "create", "upload"],
  delete: ["delete"],
  add: ["add"],
  schedule: ["schedule", "book", "create", "add"],
  book: ["book", "schedule", "create"],
  upload: ["upload", "save"],
  run: ["run"],
};

const OBJECT_FAMILY: Partial<Record<ActionObject, ActionObject[]>> = {
  table: ["sheet", "row"],
  sheet: ["table", "row"],
  row: ["sheet", "table"],
  file: ["sheet", "presentation", "document"],
  document: ["sheet", "presentation", "file"],
};

function effectCovers(claim: ActionClaim, eff: ActionEffect): boolean {
  const verbOk = eff.verb === "any" || VERB_FAMILY[claim.verb].includes(eff.verb);
  if (!verbOk) return false;
  if (eff.object === "any" || !claim.object) return true;
  return claim.object === eff.object || (OBJECT_FAMILY[claim.object]?.includes(eff.object) ?? false);
}

/**
 * Da'volarni connector jurnaliga solishtiradi. `ledger` — shu so'rovdagi barcha
 * connector chaqiruvlari (bo'sh — hech narsa chaqirilmagan). Tasdiqlanmaganlar qaytadi.
 */
export function checkClaims(claims: ActionClaim[], ledger: ActionRecord[]): UnsupportedClaim[] {
  const out: UnsupportedClaim[] = [];
  for (const claim of claims) {
    const confirmed = ledger.some((r) => r.done.some((e) => effectCovers(claim, e)));
    if (confirmed) continue;
    const tried = ledger.filter((r) => r.attempted.some((e) => effectCovers(claim, e)));
    const reason: ClaimReason = !ledger.length
      ? "no_calls"
      : tried.some((r) => r.status === "partial")
        ? "partial"
        : tried.some((r) => r.status === "failed")
          ? "failed"
          : "not_performed";
    out.push({ ...claim, reason });
  }
  return out;
}

/* ------------------------------ Iqtibos [n] ------------------------------ */

const MARKER_RE = /(?<![\p{L}\p{N}_)])\[(\d{1,3}(?:\s*,\s*\d{1,3})*)\](?![(:])/gu;

/** Javobdagi [n] / [n, m] iqtibos belgilari (kod bloklari hisobga olinmaydi), takrorsiz. */
export function citationMarkers(text: string): number[] {
  const prose = text.replace(/```[\s\S]*?(?:```|$)/g, "\n").replace(/`[^`\n]*`/g, " ");
  const found: number[] = [];
  for (const m of prose.matchAll(MARKER_RE)) {
    for (const n of m[1].split(",").map((x) => Number(x.trim()))) {
      if (Number.isFinite(n) && !found.includes(n)) found.push(n);
    }
  }
  return found;
}

/**
 * Manbasi yo'q belgilar: n < 1, n > manbalar soni, yoki manbalar umuman yo'q.
 * `citationCount` — mijozga yuborilgan citations ro'yxati uzunligi.
 */
export function unsourcedMarkers(text: string, citationCount: number): number[] {
  return citationMarkers(text)
    .filter((n) => n < 1 || n > citationCount)
    .sort((a, b) => a - b);
}
