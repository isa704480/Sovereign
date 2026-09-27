/**
 * Domen playbook'lari (docs/INQUIRY.md §A.5) — professional kabi savol berish uchun slot katalogi,
 * yuqori xavf va favqulodda holat regex'lari (4 tilda: uz lotin, uz-cyrl, ru, en). Pure.
 *
 * Slot `hint` — inglizcha, triage promptiga kiradi; savol matnini LLM foydalanuvchi tilida yozadi.
 */
import type { InquiryDomain } from "./types";

export interface Slot {
  id: string;
  /** kichik = muhimroq (savollar shu tartibda) */
  priority: number;
  /** odatda javobni tubdan o'zgartiradimi */
  critical: boolean;
  /** inglizcha izoh (triage prompti uchun) */
  hint: string;
}

const s = (id: string, priority: number, critical: boolean, hint: string): Slot => ({ id, priority, critical, hint });

export const PLAYBOOKS: Record<InquiryDomain, Slot[]> = {
  legal: [
    s("jurisdiction", 1, true, "country/region whose law applies"),
    s("parties", 2, true, "who vs whom; individual or company"),
    s("dates", 3, true, "when the event happened"),
    s("deadline", 4, true, "court/claim/response deadline"),
    s("documents", 5, false, "contract, order, receipts, correspondence available"),
    s("desired_outcome", 6, false, "refund, reinstatement, settlement, compensation"),
    s("done_so_far", 7, false, "complaints filed, court case opened"),
    s("amount", 8, false, "money at stake"),
  ],
  medical: [
    s("symptoms", 1, true, "what exactly is felt, where"),
    s("duration", 2, true, "how long it has lasted"),
    s("severity", 3, true, "severity 1-10, getting worse or better"),
    s("age_sex", 4, false, "age and sex (optional, offer options)"),
    s("meds_allergies", 5, true, "current medicines and allergies"),
    s("conditions", 6, false, "chronic conditions, pregnancy"),
    s("what_tried", 7, false, "what was already tried"),
  ],
  financial: [
    s("amount", 1, true, "sum involved"),
    s("currency", 2, false, "currency"),
    s("jurisdiction", 3, true, "tax residency / country"),
    s("horizon", 4, true, "time horizon"),
    s("risk_tolerance", 5, true, "low / medium / high"),
    s("goal", 6, false, "saving, loan, tax, purchase"),
    s("existing_obligations", 7, false, "existing debts, loans, obligations"),
  ],
  code: [
    s("goal", 1, true, "what must work in the end"),
    s("users", 2, false, "who uses it, how many"),
    s("stack", 3, true, "language, framework, versions"),
    s("constraints", 4, false, "hosting, budget, security limits"),
    s("acceptance", 5, false, "acceptance criteria"),
    s("existing_code", 6, false, "existing code or repo"),
    s("error_output", 7, true, "exact error text / logs"),
  ],
  business: [
    s("market", 1, true, "country and customer segment"),
    s("budget", 2, true, "available budget"),
    s("timeline", 3, false, "timeline"),
    s("stage", 4, false, "idea / MVP / revenue"),
    s("team", 5, false, "team size and skills"),
    s("success_metric", 6, false, "how success is measured"),
  ],
  personal: [
    s("situation", 1, true, "what is happening"),
    s("goal", 2, false, "what the person wants"),
    s("constraints", 3, false, "limits: time, money, family"),
    s("tried", 4, false, "what was already tried"),
  ],
  education: [
    s("level", 1, true, "school / university / self-study"),
    s("subject", 2, false, "subject or course"),
    s("format", 3, false, "explanation / full solution / quiz"),
    s("deadline", 4, false, "when it is due"),
  ],
  creative: [
    s("audience", 1, false, "who will read/see it"),
    s("tone", 2, false, "formal, friendly, humorous"),
    s("length", 3, false, "length"),
    s("format", 4, false, "post, letter, script, poem"),
    s("language", 5, false, "output language"),
  ],
  general: [s("purpose", 1, false, "why the user needs it"), s("context", 2, false, "relevant background")],
};

/** Slot'ning playbook ichidagi tartibi (noma'lum slot — oxirida). */
export function slotPriority(domain: InquiryDomain, slot: string): number {
  const found = PLAYBOOKS[domain]?.find((x) => x.id === slot);
  return found ? found.priority : 100;
}

/** Triage promptidagi ixcham slot katalogi (~500 token, har so'rovda bir xil — prompt-cache'ga mos). */
export function formatSlotCatalog(): string {
  return (Object.keys(PLAYBOOKS) as InquiryDomain[])
    .map((d) => `${d}: ${PLAYBOOKS[d].map((x) => `${x.id}${x.critical ? "*" : ""} (${x.hint})`).join("; ")}`)
    .join("\n");
}

// ── Matnni moslash uchun normallashtirish ──────────────────────────────────

/** Kichik harf, apostrof variantlari → ', ё → е, bo'sh joylar siqiladi. Regex'lar shu matn ustida ishlaydi. */
export function normalizeForMatch(text: string): string {
  return text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[ʻʼ’‘`´ʹ]/g, "'")
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .trim();
}

/** Chap chegara (so'z boshi) bilan regex: o'zbekcha qo'shimchalar uchun o'ng chegara qo'yilmaydi. */
const W = (src: string) => new RegExp(`(?<![\\p{L}\\p{N}'])(?:${src.replace(/ё/g, "е")})`, "iu");

// ── Yuqori xavf kalit so'zlari (pre-gate → blocking) ───────────────────────

export const HIGH_STAKES_RE: Record<"legal" | "medical" | "financial", RegExp[]> = {
  legal: [
    // uz (lotin)
    W("sud(?!ralib|o(?!\\p{L}))|da'vo|advokat|huquq|qonun|shartnoma|ishdan bo'shat|bo'shatildim|meros|ajrash|aliment|jarima|prokuratura|tergov|jinoyat|notarius|politsiya|hibs|ijarachi|guvohnoma|vasiyat|mehnat kodeks"),
    // uz-cyrl
    W("суд(?!ьб|н)|даъво|адвокат|ҳуқуқ|қонун|шартнома|ишдан бўшат|бўшатилдим|мерос|ажраш|алимент|жарима|прокуратура|тергов|жиноят|нотариус|полиция|ҳибс|васият"),
    // ru
    W("иск(?:а|у|ом|е|и|ов)?(?!\\p{L})|адвокат|юрист|юридическ|закон(?!ч)|договор|уволи|увольнен|наследств|развод|алимент|штраф|прокурат|полици|уголовн|нотариус|трудов(?:ой|ого) кодекс|претензи|арест|завещан|арендодател"),
    // en
    W("court|sue(?:d|s)?(?!\\p{L})|lawsuit|lawyer|attorney|legal(?!\\p{L})|laws?(?!\\p{L})|contract|fired(?!\\p{L})|dismissed|wrongful termination|inheritance|divorce|alimony|custody|police|arrested|criminal|notary|landlord|evict|tenant|will and testament"),
  ],
  medical: [
    W("og'ri|kasal|dori|shifokor|doktor|vrach|isitma|harorat|qon bosim|homilador|tabletka|allergi|yo'tal|ko'ngil ayni|qusish|diabet|qand kasal|bosh aylan|simptom|tashxis|doza"),
    W("оғри|касал|дори|шифокор|доктор|врач|иситма|ҳарорат|қон босим|ҳомиладор|таблетка|аллерги|йўтал|кўнгил айни|қусиш|диабет|қанд касал|бош айлан|симптом|ташхис|доза"),
    W("болит|болят|боль(?!ш)|боли(?!ш|т|я)|больно|болезн|врач|лекарств|таблетк|температур|давлени|беремен|аллерги|кашл|кашель|тошнит|тошнот|рвот|диабет|симптом|диагноз|дозировк|доз[аеуы](?!\\p{L})"),
    W("pain(?!t)|hurts?(?!\\p{L})|sick(?!\\p{L})|symptom|doctor|medicine|medication|pills?(?!\\p{L})|dosage|dose(?!\\p{L})|fever|pregnan|allerg|cough|nausea|vomit|diabet|blood pressure|diagnos|rash(?!\\p{L})|headache|migraine"),
  ],
  financial: [
    W("kredit|qarz|investitsiya|sarmoya|soliq|jamg'arma|kripto|bitkoin|ipoteka|depozit|omonat|aksiya|obligatsiya|pensiya|nafaqa jamg'arma|valyuta kurs"),
    W("кредит|қарз|инвестиция|сармоя|солиқ|жамғарма|крипто|биткоин|ипотека|депозит|омонат|акция|облигация|пенсия"),
    W("кредит|долг|займ|инвестиц|налог|ипотек|вклад|депозит|акци[ийяю]|облигац|крипт|биткоин|сбережен|пенси"),
    W("invest|loan(?!\\p{L})|loans|debt|mortgage|tax(?:es)?(?!\\p{L})|savings|crypto|bitcoin|stocks?(?!\\p{L})|etf|retirement|pension|401k|credit card|bonds?(?!\\p{L})"),
  ],
};

/** Matnda yuqori xavf so'zi bormi — birinchi urilgan soha (legal → medical → financial). */
export function detectHighStakes(text: string): "legal" | "medical" | "financial" | null {
  const t = normalizeForMatch(text);
  if (!t) return null;
  for (const d of ["medical", "legal", "financial"] as const) {
    if (HIGH_STAKES_RE[d].some((re) => re.test(t))) return d;
  }
  return null;
}

// ── Favqulodda holat (tibbiy red flag, o'z joniga qasd, zo'ravonlik) ────────
// Topilsa: savol yo'q, javob darhol favqulodda yo'riqnoma bilan boshlanadi (EMERGENCY_FIRST).

export const EMERGENCY_RE: RegExp[] = [
  // ko'krak og'rig'i
  W("ko'krag\\p{L}* (?:qattiq |kuchli )?og'ri|ko'krak\\p{L}* (?:qattiq |kuchli )?og'ri|yurag\\p{L}* (?:qattiq |kuchli )?(?:og'ri|sanchi)"),
  W("кўкраг\\p{L}* (?:қаттиқ |кучли )?оғри|кўкрак\\p{L}* (?:қаттиқ |кучли )?оғри|юраг\\p{L}* (?:қаттиқ |кучли )?(?:оғри|санчи)"),
  W("бол\\p{L}* в (?:груди|сердце)|грудь болит|болит (?:в )?груд|давит (?:в )?груд|сердечный приступ|инфаркт"),
  W("chest (?:pain|hurts|pressure|tightness)|pain in (?:my |the )?chest|heart attack"),
  // nafas
  W("nafas ol(?:a ?olmay|ish qiyin)|nafasim qis|bo'g'il(?:ib|yap)"),
  W("нафас ол(?:а ?олмай|иш қийин)|нафасим қис|бўғил(?:иб|яп)"),
  W("не могу дышать|задыха|трудно дышать|не хватает воздуха"),
  W("can'?t breathe|cannot breathe|trouble breathing|struggling to breathe|not breathing|choking"),
  // insult belgilari
  W("insult (?:bo'l|ur|belgi)|(?:yuz|qo'l)\\p{L}* (?:bir tomoni )?(?:uvishib|uvishyapti|qiyshay)"),
  W("инсульт|(?:юз|қўл)\\p{L}* (?:бир томони )?(?:увишиб|увишяпти|қийшай)"),
  W("неме(?:ет|ют) (?:левая |правая )?(?:рука|нога|лицо|половина)|онемел\\p{L}* (?:рука|лицо)|перекосило лицо"),
  W("(?:having|had|has|signs of|symptoms of) (?:a )?stroke(?!\\p{L})|stroke symptoms|face (?:is )?droop|slurred speech|numb(?:ness)? (?:in|of) (?:my |the )?(?:left |right )?(?:arm|face)"),
  // kuchli qon ketish
  W("qon ketyapti|ko'p qon ket|qon to'xtamay"),
  W("қон кетяпти|кўп қон кет|қон тўхтамай"),
  W("сильное кровотечение|кровь не останавлива|кровотечение не"),
  W("heavy bleeding|bleeding (?:a lot|heavily|badly|won'?t stop)|losing a lot of blood"),
  // hushdan ketish / zaharlanish
  W("hushidan ket|hushsiz|zaharlan"),
  W("ҳушидан кет|ҳушсиз|заҳарлан"),
  W("потерял\\p{L}* сознание|без сознания|отравил|передозир"),
  W("unconscious|passed out|overdos|poisoned"),
  // o'z joniga qasd
  W("o'zimni o'ldir|o'z jonimga qasd|o'z joniga qasd|yashagim kelmay|o'lgim kel|o'zimga zarar"),
  W("ўзимни ўлдир|ўз жонимга қасд|ўз жонига қасд|яшагим келмай|ўлгим кел|ўзимга зарар"),
  W("покончить с собой|суицид|хочу умереть|убить себя|не хочу жить|покончу с"),
  W("kill myself|suicid|end my life|want to die|don'?t want to live|hurt myself|self[- ]harm"),
  // zo'ravonlik
  W("meni ur(?:yapti|moqda|ib)|zo'rla|o'ldirmoqchi|o'ldiraman deb"),
  W("мени ур(?:япти|моқда|иб)|зўрла|ўлдирмоқчи|ўлдираман деб"),
  W("меня бь[её]т|избива|изнасил|хочет убить|угрожа\\p{L}* убить"),
  W("(?:husband|wife|father|mother|partner|boyfriend|girlfriend|he|she|they) (?:is |are |keeps )?(?:hitting|beating) me(?!\\p{L})(?! (?:at|in|on) )|being (?:beaten|abused)|rape(?!s)|raped|going to kill me|threaten\\p{L}* to kill"),
];

export function isEmergency(text: string): boolean {
  const t = normalizeForMatch(text);
  return !!t && EMERGENCY_RE.some((re) => re.test(t));
}
