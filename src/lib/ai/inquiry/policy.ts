/**
 * Chuqur so'rash siyosati (docs/INQUIRY.md §A.2, §A.4) — deterministik, pure, tarmoqsiz.
 *
 * - `preGate(input)` — 0 ms: triage umuman kerakmi (skip), javob bilan parallelmi yoki javobdan oldinmi.
 * - `decide(triage, ctx)` — yakuniy qaror: answer / ask / answer_then_ask. LLM'ning `decision` maydoni
 *   faqat telemetriya uchun (`decisionLlm`). Fail-open: triage null → answer.
 */
import { isSmallTalk } from "@/lib/ai/memory-prompt";
import { filterKnownFacts, normalizeSlot } from "./known-facts";
import { detectHighStakes, isEmergency, slotPriority } from "./playbooks";
import { dropUnsafeFacts } from "./sanitize";
import {
  INQUIRY_TUNING,
  PROFESSIONAL_FOR,
  type DecideContext,
  type FinalDecision,
  type InquiryDecision,
  type InquiryGate,
  type InquiryQuestion,
  type MissingFact,
  type PreGateInput,
  type PreGateResult,
  type TriageResult,
} from "./types";

const T = INQUIRY_TUNING;

// ── 0-bosqich: pre-gate ───────────────────────────────────────────────────

/** Pre-gate + sabab va emergency bayrog'i (telemetriya/route uchun). */
export function preGateDetail(input: PreGateInput): PreGateResult {
  const text = (input.text ?? "").trim();
  // Favqulodda belgilar har doim tekshiriladi (mode=off bo'lsa ham) — javob EMERGENCY_FIRST bilan boshlanadi.
  const emergency = text ? isEmergency(text) : false;
  const highStakesDomain = text ? detectHighStakes(text) : null;
  const out = (gate: InquiryGate, reason: PreGateResult["reason"]): PreGateResult => ({
    gate,
    reason,
    emergency,
    highStakesDomain,
  });

  if (input.mode === "off") return out("skip", "off");
  if (input.skip) return out("skip", "user_skip");
  if (input.mediaOnly || !text) return out("skip", input.mediaOnly ? "media" : "empty");
  if (emergency) return out("skip", "emergency");
  if (isSmallTalk(text)) return out("skip", "small_talk");
  if (Array.from(text).length < T.minChars && !/[?？]/u.test(text)) return out("skip", "short");
  if (input.mediaIntent) return out("skip", "media");
  if (input.cacheHit) return out("skip", "cache_hit");
  if (input.research) return out("skip", "research");
  if ((input.round ?? 0) >= T.maxRounds) return out("skip", "max_rounds");
  if ((input.recentSkips ?? 0) > 0 && input.mode !== "always") return out("skip", "cooldown");
  if (input.fullAuto && input.surface && input.surface !== "web") return out("skip", "full_auto");
  if (highStakesDomain) return out("blocking", "high_stakes");
  if (input.mode === "always") return out("blocking", "always");
  if (input.isFirstMessage && Array.from(text).length > T.longFirstMessageChars) return out("parallel", "first_long");
  return out("parallel", "default");
}

/** §A.2 shartnomasi: "skip" | "parallel" | "blocking". */
export function preGate(input: PreGateInput): InquiryGate {
  return preGateDetail(input).gate;
}

// ── 2-bosqich: yakuniy qaror ──────────────────────────────────────────────

function orderFacts(facts: MissingFact[], domain: TriageResult["domain"]): MissingFact[] {
  return facts
    .map((f, i) => ({ f, i }))
    .sort((a, b) => {
      if (a.f.critical !== b.f.critical) return a.f.critical ? -1 : 1;
      const pa = slotPriority(domain, normalizeSlot(a.f.slot));
      const pb = slotPriority(domain, normalizeSlot(b.f.slot));
      return pa !== pb ? pa - pb : a.i - b.i;
    })
    .map((x) => x.f);
}

function toQuestions(facts: MissingFact[]): InquiryQuestion[] {
  return facts.map((f, i) => {
    const options = f.options && f.options.length >= T.limits.minOptions ? f.options.slice(0, T.limits.maxOptions) : [];
    let kind = f.kind ?? (options.length ? "single" : "text");
    if (kind !== "text" && options.length === 0) kind = "text";
    return {
      id: `q${i + 1}`,
      slot: normalizeSlot(f.slot),
      text: f.question,
      why: f.why,
      kind,
      options: kind === "text" ? [] : options,
      critical: f.critical,
    };
  });
}

/**
 * Yakuniy qaror (§A.4 jadvali). Tartib:
 * null/emergency → answer; xavfsizlik filtri + dedup; round ≥ maxRounds → answer; bo'sh → answer;
 * full-auto (CLI/Cowork) → faqat blocking bo'lsa bitta savol; low → (clarity < 0.35 ? answer_then_ask : answer);
 * high(+always: medium) & critical & clarity < clarityAsk & gate=blocking → ask; high yoki medium & clarity <
 * clarityFollow → answer_then_ask; qolgani → answer. gate=parallel'da ask → answer_then_ask.
 */
export function decide(triage: TriageResult | null, ctx: DecideContext): FinalDecision {
  const round = Math.max(0, ctx.round ?? 0);
  const base: FinalDecision = {
    decision: "answer",
    decisionLlm: triage?.decision ?? null,
    reason: "no_triage",
    domain: triage?.domain ?? "general",
    stakes: triage?.stakes ?? "low",
    clarity: triage?.clarity ?? 1,
    goal: triage?.goal ?? "",
    questions: [],
    assumptions: triage?.hidden_assumptions.slice(0, T.limits.maxAssumptions) ?? [],
    remaining: [],
    risks: triage?.risks ?? [],
    emergency: !!(ctx.emergency || triage?.emergency),
    blocking: false,
    round: round + 1,
    nQuestions: 0,
    nCritical: 0,
    nDedupDropped: 0,
    nSafetyDropped: 0,
  };
  if (!triage) return base;

  const professional = PROFESSIONAL_FOR[triage.domain];
  if (professional && triage.stakes !== "low") base.professional = professional;

  if (base.emergency) return { ...base, reason: "emergency" };
  if (ctx.mode === "off" || ctx.gate === "skip") return { ...base, reason: "gate_skip" };

  // Xavfsizlik filtri (sir so'raydigan savollar) → dedup (ma'lum / allaqachon so'ralgan slotlar).
  const safe = dropUnsafeFacts(triage.missing_facts);
  const known = filterKnownFacts(safe.kept, {
    text: ctx.knownText,
    fileNames: ctx.fileNames,
    askedSlots: ctx.askedSlots,
  });
  const facts = orderFacts(known.kept, triage.domain);
  const withCounts: FinalDecision = {
    ...base,
    remaining: facts,
    nDedupDropped: known.dropped.length,
    nSafetyDropped: safe.dropped.length,
    blocking: !!triage.blocking && facts.length > 0,
  };

  if (round >= T.maxRounds) return { ...withCounts, reason: "max_rounds" };
  if (facts.length === 0) return { ...withCounts, reason: "no_missing_facts" };

  const finish = (decision: InquiryDecision, reason: string, max: number): FinalDecision => {
    if (decision === "answer") return { ...withCounts, reason };
    let limit = max;
    if (triage.domain === "personal") limit = Math.min(limit, T.personalMaxQuestions);
    const asked = facts.slice(0, Math.max(0, limit));
    const questions = toQuestions(asked);
    if (questions.length === 0) return { ...withCounts, reason };
    return {
      ...withCounts,
      decision,
      reason,
      questions,
      // ask: so'ralmagan faktlar taxmin qilinadi; answer_then_ask: javob paytida hammasi hali javobsiz.
      remaining: decision === "ask" ? facts.slice(asked.length) : facts,
      nQuestions: questions.length,
      nCritical: questions.filter((q) => q.critical).length,
    };
  };

  // CLI/Cowork full-auto: faqat busiz umuman boshlab bo'lmasa — bitta savol, aks holda taxmin bilan ishlaydi.
  if (ctx.fullAuto) {
    return triage.blocking ? finish("ask", "full_auto_blocking", 1) : finish("answer", "full_auto", 0);
  }

  const always = ctx.mode === "always";
  const maxAsk = always ? T.maxQuestions.always : T.maxQuestions.auto;
  const clarityAsk = always ? T.clarityAskAlways : T.clarityAsk;
  const stakesAsk = always ? triage.stakes === "high" || triage.stakes === "medium" : triage.stakes === "high";
  const hasCritical = facts.some((f) => f.critical);
  const c = triage.clarity;

  if (triage.stakes === "low") {
    return c < T.clarityLowFollow
      ? finish("answer_then_ask", "low_unclear", T.lowMaxFollowups)
      : finish("answer", "low_clear", 0);
  }
  if (stakesAsk && hasCritical && c < clarityAsk) {
    return ctx.gate === "blocking"
      ? finish("ask", "high_critical", maxAsk)
      : finish("answer_then_ask", "parallel_downgrade", T.maxFollowups);
  }
  if (triage.stakes === "high" || (triage.stakes === "medium" && c < T.clarityFollow)) {
    return finish("answer_then_ask", "follow_up", T.maxFollowups);
  }
  return finish("answer", "clear", 0);
}
