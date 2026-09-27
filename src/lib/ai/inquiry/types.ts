/**
 * Chuqur so'rash (Deep Inquiry) — umumiy tiplar va sozlamalar (docs/INQUIRY.md §A.3, §A.4, §A.8).
 * Pure: server-only yoki tarmoq importi yo'q — web mijoz, route, CLI endpoint va testlar bir xil ishlatadi.
 */

export const INQUIRY_DOMAINS = [
  "legal",
  "medical",
  "financial",
  "code",
  "business",
  "personal",
  "education",
  "creative",
  "general",
] as const;
export type InquiryDomain = (typeof INQUIRY_DOMAINS)[number];

export const STAKES = ["low", "medium", "high"] as const;
export type Stakes = (typeof STAKES)[number];

export const INQUIRY_DECISIONS = ["answer", "ask", "answer_then_ask"] as const;
export type InquiryDecision = (typeof INQUIRY_DECISIONS)[number];

/** Foydalanuvchi sozlamasi: auto (standart) / always / off. */
export const INQUIRY_MODES = ["auto", "always", "off"] as const;
export type InquiryMode = (typeof INQUIRY_MODES)[number];

/** Pre-gate natijasi (§A.2). */
export type InquiryGate = "skip" | "parallel" | "blocking";

export type InquirySurface = "web" | "cli" | "cowork";

export type QuestionKind = "single" | "multi" | "text";

export type Professional = "lawyer" | "doctor" | "financial_advisor";

/** Telemetriya: karta taqdiri (mijoz keyin yangilaydi, §A.10). */
export type InquiryOutcome = "answered" | "skipped" | "ignored" | "followup_clicked";

export interface MissingFact {
  /** playbook slot id: "jurisdiction", "deadline", "duration", ... */
  slot: string;
  /** javob bu faktsiz tubdan o'zgaradimi / xavflimi */
  critical: boolean;
  /** foydalanuvchi tilida, ≤ 200 belgi */
  question: string;
  /** nega muhim, ≤ 160 belgi */
  why: string;
  /** tezkor tanlov, 2..6 ta, har biri ≤ 60 belgi */
  options?: string[];
  /** standart: options bo'lsa single, bo'lmasa text */
  kind?: QuestionKind;
}

export interface TriageResult {
  domain: InquiryDomain;
  stakes: Stakes;
  /** 0..1 (1 = to'liq aniq) */
  clarity: number;
  /** haqiqiy maqsadning qisqa ifodasi (≤ 160), foydalanuvchi tilida */
  goal: string;
  /** ≤ 6 (siyosat keyin qisqartiradi) */
  missing_facts: MissingFact[];
  /** ≤ 4, har biri ≤ 160 */
  hidden_assumptions: string[];
  /** ≤ 3, har biri ≤ 160 */
  risks: string[];
  /** LLM tavsiyasi — yakuniy qaror emas (faqat telemetriya) */
  decision: InquiryDecision;
  /** CLI/Cowork: busiz umuman boshlab bo'lmaydi (§A.9) */
  blocking?: boolean;
  /** favqulodda holat — darhol javob */
  emergency?: boolean;
}

export interface InquiryQuestion {
  /** "q1".."q5" */
  id: string;
  slot: string;
  text: string;
  why: string;
  kind: QuestionKind;
  /** bo'sh bo'lishi mumkin */
  options: string[];
  critical: boolean;
}

/** SSE hodisasi (`StreamEvent` union'iga T3 qo'shadi). */
export interface InquiryEvent {
  type: "inquiry";
  /** server crypto.randomUUID() */
  inquiryId: string;
  phase: "ask" | "followup";
  /** 1 yoki 2 */
  round: number;
  domain: InquiryDomain;
  stakes: Stakes;
  goal: string;
  questions: InquiryQuestion[];
  /** "Taxmin bilan javob ber" bosilsa nimalar taxmin qilinadi */
  assumptions: string[];
  professional?: Professional;
}

/** Mijoz yuboradigan javob (bodySchema.inquiry.reply.answers). */
export interface InquiryReplyAnswer {
  slot: string;
  value: string;
}

/** Barcha chegaralar bir joyda — telemetriya bo'yicha faqat shu yerda sozlanadi (§A.4, §A.10). */
export const INQUIRY_TUNING = {
  minChars: 12,
  /** bundan past + high + critical → ask */
  clarityAsk: 0.55,
  /** "always" rejimida ask chegarasi */
  clarityAskAlways: 0.7,
  /** bundan past → answer_then_ask */
  clarityFollow: 0.8,
  /** stakes=low: bundan past → answer_then_ask (≤ lowMaxFollowups) */
  clarityLowFollow: 0.35,
  maxQuestions: { auto: 3, always: 5 },
  maxFollowups: 3,
  lowMaxFollowups: 2,
  /** nozik mavzu (personal) — ko'pi bilan 2 savol */
  personalMaxQuestions: 2,
  maxRounds: 2,
  skipCooldownTurns: 3,
  triageTimeoutMs: { blocking: 1200, parallel: 4000 },
  maxTriageInputChars: 2500,
  /** "suhbatdagi birinchi xabar va uzun" chegarasi (§A.2) */
  longFirstMessageChars: 200,
  /** triage chiqishidagi uzunlik chegaralari (sanitize.ts) */
  limits: {
    slot: 40,
    question: 200,
    why: 160,
    option: 60,
    minOptions: 2,
    maxOptions: 6,
    goal: 160,
    assumption: 160,
    risk: 160,
    maxMissingFacts: 6,
    maxAssumptions: 4,
    maxRisks: 3,
  },
} as const;

/** Soha → qaysi mutaxassis kerak (stakes ≥ medium bo'lsa ko'rsatiladi). */
export const PROFESSIONAL_FOR: Partial<Record<InquiryDomain, Professional>> = {
  legal: "lawyer",
  medical: "doctor",
  financial: "financial_advisor",
};

/** Sezgir sohalar: avtomatik xotira / training capture yo'q (§A.7, §A.8). */
export const SENSITIVE_DOMAINS: readonly InquiryDomain[] = ["legal", "medical", "financial"];

// ── Siyosat (policy.ts) kirish/chiqishlari ─────────────────────────────────

export interface PreGateInput {
  /** oxirgi user xabari matni */
  text: string;
  mode: InquiryMode;
  /** so'rovda inquiry.skip === true ("Taxmin bilan javob ber") */
  skip?: boolean;
  /** oxirgi skipCooldownTurns navbatda kartani o'tkazib yuborishlar soni */
  recentSkips?: number;
  /** inquiry.reply.round (javob yuborilgan raund; yo'q bo'lsa 0) */
  round?: number;
  /** suhbatdagi birinchi user xabari */
  isFirstMessage?: boolean;
  /** rasm/video generatsiya intenti */
  mediaIntent?: boolean;
  /** semantik kesh urishi */
  cacheHit?: boolean;
  /** research (Perplexity) so'rovi */
  research?: boolean;
  /** xabarda faqat rasm/fayl (matnsiz) — vision triage yo'q (EC-7) */
  mediaOnly?: boolean;
  surface?: InquirySurface;
  /** CLI/Cowork full-auto (developer agent) — faqat blocking triage (§A.9) */
  fullAuto?: boolean;
}

export type PreGateReason =
  | "off"
  | "user_skip"
  | "empty"
  | "small_talk"
  | "short"
  | "media"
  | "cache_hit"
  | "research"
  | "max_rounds"
  | "cooldown"
  | "full_auto"
  | "emergency"
  | "high_stakes"
  | "always"
  | "first_long"
  | "default";

export interface PreGateResult {
  gate: InquiryGate;
  reason: PreGateReason;
  /** Favqulodda belgilar topildi — javob promptiga EMERGENCY_FIRST qo'shilsin (gate'dan qat'i nazar). */
  emergency: boolean;
  /** HIGH_STAKES_RE urilgan soha (bo'lsa). */
  highStakesDomain: "legal" | "medical" | "financial" | null;
}

export interface DecideContext {
  mode: InquiryMode;
  /** preGate natijasi */
  gate: InquiryGate;
  /** inquiry.reply.round (yo'q bo'lsa 0) */
  round?: number;
  /**
   * Allaqachon ma'lum matn: suhbatdagi user xabarlari + xotira (memoryText) + oldingi raund javoblari
   * + (CLI/Cowork) papka konteksti. Deterministik dedup shu matn ustida ishlaydi.
   */
  knownText?: string;
  /** biriktirilgan fayl nomlari / @hujjat sarlavhalari */
  fileNames?: string[];
  /** shu suhbatda allaqachon so'ralgan slotlar */
  askedSlots?: string[];
  /** preGate'dagi emergency */
  emergency?: boolean;
  /** CLI/Cowork full-auto: faqat triage.blocking === true bo'lsa bitta savol */
  fullAuto?: boolean;
}

export interface FinalDecision {
  decision: InquiryDecision;
  /** Telemetriya: LLM tavsiyasi (triage null bo'lsa null) */
  decisionLlm: InquiryDecision | null;
  /** Qaror sababi (telemetriya/test uchun, foydalanuvchiga ko'rsatilmaydi) */
  reason: string;
  domain: InquiryDomain;
  stakes: Stakes;
  clarity: number;
  goal: string;
  /** ask → karta savollari; answer_then_ask → follow-up chip'lar; answer → [] */
  questions: InquiryQuestion[];
  /** "Taxmin bilan javob ber" bosilsa taxmin qilinadiganlar (hidden_assumptions) */
  assumptions: string[];
  /** So'ralmagan (yoki hali javobsiz) filtrlangan faktlar — addendum ularni taxmin sifatida aytadi */
  remaining: MissingFact[];
  risks: string[];
  professional?: Professional;
  emergency: boolean;
  /** CLI/Cowork: busiz boshlab bo'lmaydi */
  blocking: boolean;
  /** InquiryEvent.round uchun: (ctx.round ?? 0) + 1 */
  round: number;
  nQuestions: number;
  nCritical: number;
  nDedupDropped: number;
  nSafetyDropped: number;
}
