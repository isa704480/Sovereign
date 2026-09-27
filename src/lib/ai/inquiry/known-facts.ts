/**
 * "Allaqachon aytilganini so'rama" — deterministik post-filter (docs/INQUIRY.md §A.4, 2-3 qatlam). Pure.
 *
 * Har slot uchun detektor (regex, 4 tilda: uz lotin, uz-cyrl, ru, en) suhbat matni + xotira + fayl nomlari
 * ustida ishlaydi. Detektor topsa — o'sha slotdagi savol olib tashlanadi. `askedSlots` (shu suhbatda
 * allaqachon so'ralgan) ham qayta so'ralmaydi — o'rniga taxmin qilinadi.
 *
 * Detektorlar ataylab "ehtiyotkor": noto'g'ri urilish = kerakli savol so'ralmaydi (javob baribir taxmin
 * bilan keladi), shuning uchun faqat aniq naqshlar (raqam + valyuta, sana, mamlakat nomi...).
 */
import { normalizeForMatch } from "./playbooks";
import type { MissingFact } from "./types";

const W = (src: string) => new RegExp(`(?<![\\p{L}\\p{N}'])(?:${src.replace(/ё/g, "е")})`, "iu");
/** O'ng chegara ham (qisqa inglizcha so'zlar uchun). */
const WB = (src: string) => new RegExp(`(?<![\\p{L}\\p{N}'])(?:${src.replace(/ё/g, "е")})(?![\\p{L}\\p{N}])`, "iu");

// ── Mamlakat / shahar (jurisdiction) ───────────────────────────────────────

const PLACES_LATN =
  "o'zbekiston|uzbekistan|toshkent|tashkent|samarqand|samarkand|buxoro|bukhara|andijon|andijan|farg'ona|fergana|namangan|qashqadaryo|qarshi|surxondaryo|termiz|xorazm|khorezm|urganch|navoiy|navoi|jizzax|jizzakh|sirdaryo|guliston|qoraqalpog'iston|karakalpakstan|nukus|qo'qon|kokand|marg'ilon|chirchiq|olmaliq|" +
  "qozog'iston|kazakhstan|almaty|olmaota|astana|rossiya|russia|moskva|moscow|sankt-peterburg|saint petersburg|qirg'iziston|kyrgyzstan|bishkek|tojikiston|tajikistan|dushanbe|turkmaniston|turkmenistan|" +
  "turkiya|turkey|türkiye|istanbul|germaniya|germany|buyuk britaniya|united kingdom|england|angliya|london|aqsh|amerika|united states|america|koreya|korea(?!n)|seul|seoul|xitoy|china|yaponiya|japan(?!ese)|" +
  "birlashgan arab amirliklari|uae|dubay|dubai|kanada|canada|polsha|poland|yevropa|european union|europe|latviya|latvia|litva|lithuania|chexiya|czech|italiya|italy|ispaniya|spain|fransiya|france|avstraliya|australia|hindiston|india|ozarbayjon|azerbaijan|gruziya|georgia|ukraina|ukraine|belarus";
const PLACES_CYRL =
  "ўзбекистон|узбекистан|тошкент|ташкент|самарқанд|самарканд|бухоро|бухар|андижон|андижан|фарғона|фергана|наманган|қашқадарё|кашкадарь|қарши|сурхондарё|сурхандарь|термиз|термез|хоразм|хорезм|урганч|ургенч|навоий|навои|жиззах|джизак|сирдарё|сырдарь|гулистон|қорақалпоғистон|каракалпак|нукус|қўқон|коканд|марғилон|маргилан|чирчиқ|чирчик|олмалиқ|алмалык|" +
  "қозоғистон|казахстан|алматы|олмаота|астана|россия|росси[июе]|москв|санкт-петербург|петербург|қирғизистон|кыргызстан|киргизи|бишкек|тожикистон|таджикистан|душанбе|туркманистон|туркменистан|" +
  "туркия|турци|стамбул|германи|буюк британия|великобритани|англи[яиюе](?!\\p{L})|лондон|ақш|сша|америк|корея|коре[июе]|сеул|хитой|китай(?!ск)|китае|япони|бааа|оаэ|дубай|дубае|канад|польш|полша|европ|евросоюз|латви|литв|чехи|итали|испани|франци|австрали|ҳиндистон|инди[ия]|озарбайжон|азербайджан|грузи|украин|беларус";

const JURISDICTION_RE: RegExp[] = [W(PLACES_LATN), W(PLACES_CYRL), WB("usa|u\\.s\\.a?\\.?|the us|uk|eu")];

// ── Pul miqdori va valyuta ─────────────────────────────────────────────────

/** Uzun valyuta so'zlari — o'zbekcha qo'shimchalar bilan ("so'mlik", "dollarga"). */
const CURRENCY_LONG = "so'm|сўм|dollar|доллар|евро|yevro|euro|рубл|rubl|тенге|tenge|funt|фунт|dirham|дирҳам|дирхам";
/** Qisqa / noaniq tokenlar — faqat o'ng chegara bilan ("som" ≠ "something", "сум" ≠ "сумка"). */
const CURRENCY_SHORT =
  "(?:som|uzs|usd|eur|rub|kzt|gbp|сум|pounds?|lira|лира)(?:lik|ga|dan|лик|га|дан)?(?![\\p{L}\\p{N}])";
const CURRENCY_ANY = `(?:${CURRENCY_LONG}|${CURRENCY_SHORT})`;
const AMOUNT_RE: RegExp[] = [
  // raqam (+ mln/ming/тыс/k) + valyuta: "12 mln so'm", "500 000 сум", "1000 usd", "2.5k dollars"
  new RegExp(
    `(?<![\\p{L}])\\d[\\d\\s.,]*\\s*(?:k|m|ming|mln|million|milliard|mlrd|тыс\\.?|тысяч\\p{L}*|млн|миллион\\p{L}*|млрд|минг|thousand|billion|bn)?\\.?\\s*${CURRENCY_ANY}`,
    "iu",
  ),
  // valyuta belgisi: "$500", "€ 20", "500$", "300 ₽"
  /[$€£₽₸]\s*\d|\d\s*[$€£₽₸]/u,
];
const CURRENCY_RE: RegExp[] = [W(CURRENCY_ANY), /[$€£₽₸]/u];

// ── Sana / muddat ─────────────────────────────────────────────────────────

/** Oy nomlari: to'liq nomlar har qanday qo'shimcha bilan; qisqa/noaniq ("may", "mart" ≠ "marta") — chegara bilan. */
const MONTHS_EN_ABBR = "(?:jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\\.?(?![\\p{L}])";
const MONTHS_EN_FULL = "january|february|march|april|june|july|august|september|october|november|december";
const MONTHS_LATN =
  `yanvar|fevral|aprel|iyun|iyul|avgust|sentabr|sentyabr|oktabr|oktyabr|noyabr|dekabr|${MONTHS_EN_FULL}|` +
  `(?:mart|may)(?:da|ga|dan|gacha|ning)?(?![\\p{L}])|${MONTHS_EN_ABBR}`;
const MONTHS_CYRL = "январ|феврал|март|апрел|июн|июл|август|сентябр|октябр|ноябр|декабр|ма[йя](?:да|га|дан|гача)?(?![\\p{L}])";
const WEEKDAYS =
  "dushanba|seshanba|chorshanba|payshanba|juma|shanba|yakshanba|душанба|сешанба|чоршанба|пайшанба|жума|шанба|якшанба|понедельник|вторник|сред[аы]|четверг|пятниц|суббот|воскресень|monday|tuesday|wednesday|thursday|friday|saturday|sunday";
const RELATIVE_DAYS =
  "bugun|ertaga|indinga|kecha(?!si)|o'tgan hafta|keyingi hafta|kelasi hafta|o'tgan oy|keyingi oy|бугун|эртага|индинга|кеча(?!си)|ўтган ҳафта|кейинги ҳафта|келаси ҳафта|сегодня|завтра|послезавтра|вчера|позавчера|на прошлой неделе|на следующей неделе|в прошлом месяце|today|tomorrow|yesterday|last week|next week|last month|next month|this week";

const DATE_RE: RegExp[] = [
  /(?<!\d)\d{4}-\d{1,2}-\d{1,2}(?!\d)/u, // 2026-09-03
  /(?<!\d)\d{1,2}[./]\d{1,2}[./]\d{2,4}(?!\d)/u, // 03.09.2026
  new RegExp(`(?<!\\d)\\d{1,2}(?:-|\\s)?(?:${MONTHS_LATN})`, "iu"), // 3-sentabr, 3 september
  new RegExp(`(?<![\\p{L}])(?:${MONTHS_EN_FULL}|${MONTHS_EN_ABBR})\\s+\\d{1,2}(?!\\d)`, "iu"), // Sept 3
  new RegExp(`(?<!\\d)\\d{1,2}(?:-|\\s)?(?:${MONTHS_CYRL})`, "iu"), // 15 октября, 3-сентябрь
  /(?<!\d)(?:19|20)\d{2}(?:-| )?(?:yil|йил|год|г\.)/iu, // 2026-yil, 2026 году
  W(RELATIVE_DAYS),
  W(`(?:o'tgan|keyingi|ўтган|кейинги|в прошлый|в прошлую|в следующий|в следующую|last|next|this|on) (?:${WEEKDAYS})`),
];

const DEADLINE_CUE_RE: RegExp[] = [
  W("muddat|deadline|дедлайн|муддат|срок|due (?:by|on|date|in)|не позднее"),
  /\d[\p{L}\p{N}'-]*(?:gacha|гача)(?!\p{L})/iu, // 15-oktabrgacha, 3 kungacha
  W("(?:erta|indin|bugun|эрта|индин|бугун)(?:gacha|гача)|до (?:завтра|конца|понедельника|вторника|среды|четверга|пятницы|субботы|воскресенья|\\d)|(?:by|until|before) (?:tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|the end|end of|next|\\d)|within \\d+ (?:days?|weeks?|hours?)|\\d+ (?:kun|hafta|soat) ichida|\\d+ (?:кун|ҳафта|соат) ичида|в течение \\d+ (?:дн|день|недел|час)"),
];

// ── Davomiylik (symptom duration) ─────────────────────────────────────────

const NUM_WORDS_UZ = "\\d+|bir|ikki|uch|to'rt|besh|olti|yetti|bir necha|бир|икки|уч|тўрт|беш|олти|етти|бир неча";
const DURATION_RE: RegExp[] = [
  W(`(?:${NUM_WORDS_UZ})\\s*(?:-|\\s)?(?:kun|hafta|oy|yil|soat|кун|ҳафта|ой|йил|соат)\\p{L}*\\s+(?:beri|buyon|бери|буён)`),
  W("(?:kun|hafta|oy|yil|кун|ҳафта|ой|йил|kecha|кеча|ertalab|эрталаб|tunda|тунда)(?:dan|дан) (?:beri|buyon|бери|буён)"),
  W("(?:уже|вот уже|в течение|на протяжении|около|почти) (?:\\d+|одн\\p{L}*|дв\\p{L}*|тр\\p{L}*|четыр\\p{L}*|пят\\p{L}*|несколько|пару) ?(?:дн|день|недел|месяц|год|лет|час|сут)"),
  W("(?:\\d+|один|одну|два|две|три|четыре|пять|несколько|пару) ?(?:дн\\p{L}*|день|недел\\p{L}*|месяц\\p{L}*|год\\p{L}*|лет|час\\p{L}*|сут\\p{L}*) (?:назад|подряд)|со вчерашнего|с утра|с прошлой недели|уже (?:неделю|месяц|год)|(?:всю|целую) неделю"),
  W("(?:for|over) (?:the )?(?:past |last )?(?:\\d+|a|an|one|two|three|four|five|six|seven|few|several|couple of) ?(?:days?|weeks?|months?|years?|hours?)|since (?:yesterday|this morning|last (?:night|week|month)|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|(?:\\d+|a|one|two|three|few) (?:days?|weeks?|months?) ago"),
];

// ── Investitsiya muddati (horizon) ────────────────────────────────────────

const HORIZON_RE: RegExp[] = [
  W("(?:\\d+|bir|ikki|uch|besh|o'n|бир|икки|уч|беш|ўн)[- ]?(?:yil|oy|йил|ой)(?:ga|lik|гa|га|лик)(?!\\p{L})"),
  W("uzoq muddat|qisqa muddat|узоқ муддат|қисқа муддат|долгосрочн|краткосрочн|long[- ]term|short[- ]term"),
  W("на (?:\\d+|один|два|три|пять|десять) (?:год|лет|месяц)"),
  W("(?:for|over|in) (?:\\d+|one|two|three|five|ten) (?:years?|months?)|\\d+[- ]year (?:horizon|plan)"),
];

// ── Texnologiya (stack) ───────────────────────────────────────────────────

const STACK_RE: RegExp[] = [
  WB(
    "react(?: native)?|next(?:\\.js|js)|nuxt|vue(?:\\.js)?|angular|svelte|node(?:\\.js|js)?|express(?:\\.js|js)|nestjs|deno|bun|typescript|javascript|python|django|flask|fastapi|java|spring boot|spring framework|kotlin|swift|swiftui|golang|go \\d\\.\\d+|rust|php|laravel|ruby|rails|c#|\\.net|c\\+\\+|flutter|dart|electron|postgres(?:ql)?|mysql|mongodb|sqlite|supabase|firebase|tailwind|docker|kubernetes|vite|webpack|android|ios|unity|wordpress|1c",
  ),
];

// ── Yosh (age) ────────────────────────────────────────────────────────────

const AGE_RE: RegExp[] = [
  /(?<!\d)\d{1,3}\s*-?\s*(?:yosh|ёш|еш)/iu,
  W("мне \\d{1,3} (?:год|лет)|\\d{1,3}[- ]?летн|возраст \\d|ребенку \\d{1,3}|сыну \\d{1,3}|дочери \\d{1,3}"),
  W("i'?m \\d{1,3}(?: years old)?(?!\\d)|i am \\d{1,3}|\\d{1,3}[- ]year[- ]old|aged? \\d{1,3}"),
];

// ── Hujjatlar ─────────────────────────────────────────────────────────────

const DOCS_LATN = "shartnoma|dalolatnoma|buyruq|chek|kvitansiya|hujjat|ma'lumotnoma|spravka|akt|tilxat|yozishma|skrinshot";
const DOCS_CYRL = "шартнома|далолатнома|буйруқ|чек|квитанция|ҳужжат|маълумотнома|справка|акт|тилхат|ёзишма|скриншот";
const DOCUMENTS_RE: RegExp[] = [
  W(`(?:${DOCS_LATN})\\p{L}*(?:\\s+\\p{L}+)?\\s+(?:bor|mavjud|qo'limda|imzolangan)`),
  W(`(?:${DOCS_CYRL})\\p{L}*(?:\\s+\\p{L}+)?\\s+(?:бор|мавжуд|қўлимда|имзоланган)`),
  W("(?:есть|имеется|у меня|сохранил\\p{L}*|подписал\\p{L}*) (?:\\p{L}+ )?(?:договор|акт|чек|приказ|документ|квитанц|справк|переписк|расписк|скриншот)|(?:договор|акт|чек|приказ|документ\\p{L}*|квитанц\\p{L}*|расписк\\p{L}*) (?:есть|имеется|подписан)"),
  W("i (?:have|kept|signed|got) (?:a |the |my |all )?(?:written |signed )?(?:contract|receipts?|documents?|order|agreement|emails?|screenshots?|invoice)|(?:contract|agreement|receipt|invoice)s? (?:is|are|was|were) signed"),
];

// ── Xato matni (code) ─────────────────────────────────────────────────────

const ERROR_OUTPUT_RE: RegExp[] = [
  /(?:^|\s)(?:\w*error|\w*exception|traceback|panic|segmentation fault|fatal)\s*[:(]/iu,
  /\bat [\w$.<>]+ \([^)]*:\d+:\d+\)/u,
  /(?:^|\s)(?:xato|хато|ошибка)\s*:/iu,
  /\b(?:ENOENT|EACCES|ECONNREFUSED|ERR_[A-Z_]+|TS\d{4}|E\d{4})\b/u,
];

// ── Detektorlar → slotlar ─────────────────────────────────────────────────

interface Detector {
  id: string;
  /** shu detektor topsa, qaysi slotlar ma'lum deb hisoblanadi */
  slots: string[];
  res: RegExp[];
  /** normallashtirilgan matn ustidami (true) yoki xom matnmi (false — xato matni uchun) */
  normalized: boolean;
}

export const DETECTORS: Detector[] = [
  { id: "jurisdiction", slots: ["jurisdiction", "country", "location"], res: JURISDICTION_RE, normalized: true },
  { id: "amount", slots: ["amount", "budget", "sum", "price"], res: AMOUNT_RE, normalized: true },
  { id: "currency", slots: ["currency"], res: CURRENCY_RE, normalized: true },
  { id: "date", slots: ["dates", "date"], res: DATE_RE, normalized: true },
  { id: "deadline", slots: ["deadline"], res: DEADLINE_CUE_RE, normalized: true },
  { id: "duration", slots: ["duration", "symptom_duration"], res: DURATION_RE, normalized: true },
  { id: "horizon", slots: ["horizon"], res: HORIZON_RE, normalized: true },
  { id: "stack", slots: ["stack"], res: STACK_RE, normalized: true },
  { id: "age", slots: ["age", "age_sex"], res: AGE_RE, normalized: true },
  { id: "documents", slots: ["documents"], res: DOCUMENTS_RE, normalized: true },
  { id: "error_output", slots: ["error_output"], res: ERROR_OUTPUT_RE, normalized: false },
];

/** Slot id'ni solishtirish uchun normallashtiradi ("Jurisdiction " → "jurisdiction", "due date" → "due_date"). */
export function normalizeSlot(slot: string): string {
  return slot
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 40);
}

/** Muddat (deadline) faqat cue + raqam/sana birga bo'lsa ma'lum deb hisoblanadi. */
function deadlineKnown(t: string): boolean {
  if (!DEADLINE_CUE_RE.some((re) => re.test(t))) return false;
  return /\d/.test(t) || DATE_RE.some((re) => re.test(t));
}

/**
 * Matnda qaysi slotlar allaqachon ma'lum. `fileNames` bo'lsa — `documents` ma'lum (biriktirilgan hujjat).
 * Qaytadi: slot id'lar to'plami (normalizeSlot ko'rinishida).
 */
export function detectKnownSlots(text: string, opts: { fileNames?: string[] } = {}): Set<string> {
  const known = new Set<string>();
  const raw = text ?? "";
  const t = normalizeForMatch(raw);
  for (const d of DETECTORS) {
    const hay = d.normalized ? t : raw;
    if (!hay) continue;
    const hit = d.id === "deadline" ? deadlineKnown(t) : d.res.some((re) => re.test(hay));
    if (hit) for (const sl of d.slots) known.add(sl);
  }
  const files = (opts.fileNames ?? []).filter((f) => f && f.trim());
  if (files.length > 0) {
    known.add("documents");
    known.add("existing_code");
    // Fayl nomida ham mamlakat/stack bo'lishi mumkin ("ijara_toshkent.pdf", "app.tsx" emas — faqat so'zlar).
    const names = normalizeForMatch(files.join(" ").replace(/[_.]+/g, " "));
    for (const d of DETECTORS) {
      if (d.id === "jurisdiction" || d.id === "stack") {
        if (d.res.some((re) => re.test(names))) for (const sl of d.slots) known.add(sl);
      }
    }
  }
  return known;
}

export interface KnownFilterInput {
  /** suhbatdagi user xabarlari + xotira + oldingi javoblar */
  text?: string;
  fileNames?: string[];
  /** shu suhbatda allaqachon so'ralgan slotlar */
  askedSlots?: string[];
}

export interface KnownFilterResult {
  kept: MissingFact[];
  dropped: MissingFact[];
}

/**
 * Ma'lum yoki allaqachon so'ralgan slotlardagi savollarni olib tashlaydi; bir xil slot ikki marta
 * kelsa — birinchisi qoladi (dublikat ham `dropped` ga).
 */
export function filterKnownFacts(facts: MissingFact[], input: KnownFilterInput = {}): KnownFilterResult {
  const known = detectKnownSlots(input.text ?? "", { fileNames: input.fileNames });
  const asked = new Set((input.askedSlots ?? []).map(normalizeSlot).filter(Boolean));
  const seen = new Set<string>();
  const kept: MissingFact[] = [];
  const dropped: MissingFact[] = [];
  for (const f of facts) {
    const slot = normalizeSlot(f.slot);
    if (!slot || known.has(slot) || asked.has(slot) || seen.has(slot)) {
      dropped.push(f);
      continue;
    }
    seen.add(slot);
    kept.push(f);
  }
  return { kept, dropped };
}
