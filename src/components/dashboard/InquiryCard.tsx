"use client";

import { Check, ChevronDown, HelpCircle, MessageCircleQuestion, Send, ShieldAlert } from "lucide-react";
import { useId, useRef, useState, type KeyboardEvent } from "react";
import { fmt, type TKey } from "@/lib/i18n";
import { INQUIRY_TUNING, SENSITIVE_DOMAINS, type InquiryEvent, type InquiryQuestion, type Professional } from "@/lib/ai/inquiry/types";
import { cn } from "@/lib/utils";
import { useT, type InquiryState } from "@/store/chat";

/**
 * Chuqur so'rash (docs/INQUIRY.md §A.7) — savol kartasi va javob ostidagi follow-up chip'lar.
 *
 * Xavfsizlik: kartadagi BARCHA matn (savol, why, variantlar, maqsad, taxminlar) model chiqishidan
 * keladi — faqat React matn tugunlari sifatida chiziladi (Markdown/HTML/havola yo'q). Chip bosilishi
 * hech qanday tool/connector/amal chaqirmaydi — faqat `actions.*` orqali oddiy user xabari yuboriladi.
 */

/** useSendMessage() dan keladigan amallar (Dashboard → MessageList → MessageItem). */
export interface InquiryActions {
  answer: (messageId: string, answers: Record<string, string | string[]>, opts?: { remember?: boolean }) => unknown;
  skip: (messageId: string) => unknown;
  followup: (messageId: string, questionId: string, value: string) => unknown;
  /** Xotira yoqiq bo'lsa — "Bu faktlarni eslab qol" checkbox ko'rinadi (default o'chiq). */
  memoryEnabled: boolean;
  /** Boshqa javob oqayotgan bo'lsa — tugmalar vaqtincha o'chiq. */
  busy?: boolean;
}

/** Himoya chegaralari (hook allaqachon tozalagan; bu — render uchun qo'shimcha to'siq). */
const LIM = INQUIRY_TUNING.limits;
const OTHER_MAX = 400;

const PRO_KEY: Record<Professional, TKey> = {
  lawyer: "p14iProLawyer",
  doctor: "p14iProDoctor",
  financial_advisor: "p14iProFinancial",
};

const STATE_KEY: Record<Exclude<InquiryState, "open">, TKey> = {
  answered: "p14iStateAnswered",
  skipped: "p14iStateSkipped",
  ignored: "p14iStateIgnored",
};

function plain(v: unknown, max: number): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

function optionsOf(q: InquiryQuestion): string[] {
  if (!Array.isArray(q.options)) return [];
  const out: string[] = [];
  for (const o of q.options) {
    const s = plain(o, LIM.option).trim();
    if (s && !out.includes(s)) out.push(s);
    if (out.length >= LIM.maxOptions) break;
  }
  return out;
}

/** Savol turi: variantsiz savol har doim matn maydoni. */
function kindOf(q: InquiryQuestion, opts: string[]): "single" | "multi" | "text" {
  if (!opts.length || q.kind === "text") return "text";
  return q.kind === "multi" ? "multi" : "single";
}

/** Kartaning bitta savoli bo'yicha foydalanuvchi tanlovi. */
export interface InquiryPick {
  selected: string[];
  otherOn: boolean;
  otherText: string;
}
const EMPTY_PICK: InquiryPick = { selected: [], otherOn: false, otherText: "" };

function pickValue(kind: "single" | "multi" | "text", p: InquiryPick): string | string[] {
  const other = p.otherText.trim();
  if (kind === "text") return other;
  if (kind === "single") return p.otherOn ? other : (p.selected[0] ?? "");
  return [...p.selected, ...(p.otherOn && other ? [other] : [])];
}

function hasValue(v: string | string[]): boolean {
  return Array.isArray(v) ? v.length > 0 : v.length > 0;
}

/**
 * Karta tanlovlaridan `answerInquiry` uchun javoblar: savol id → matn (single/text) yoki massiv (multi).
 * Javobsiz savollar kiritilmaydi (hook ularni "qolganini taxmin qiling" deb belgilaydi).
 */
export function collectInquiryAnswers(questions: InquiryQuestion[], picks: Record<string, InquiryPick>): Record<string, string | string[]> {
  const values: Record<string, string | string[]> = {};
  for (const q of questions) {
    const opts = optionsOf(q);
    const v = pickValue(kindOf(q, opts), picks[q.id] ?? EMPTY_PICK);
    if (hasValue(v)) values[q.id] = v;
  }
  return values;
}

const chipBase =
  "tt inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full border px-3 py-1 text-left text-[13px] leading-snug transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--t-primary)] disabled:cursor-not-allowed disabled:opacity-60";

function chipStyle(on: boolean): React.CSSProperties {
  return on
    ? { borderColor: "var(--t-primary)", background: "color-mix(in srgb, var(--t-primary) 16%, transparent)", color: "var(--t-text)" }
    : { borderColor: "var(--t-border)", color: "var(--t-text)" };
}

const inputCls =
  "tt w-full rounded-xl border px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-[var(--t-primary)] disabled:opacity-60 md:text-sm";
const inputStyle: React.CSSProperties = { background: "var(--t-surface, transparent)", borderColor: "var(--t-border)", color: "var(--t-text)" };

/* ───────────────────────────── Savol kartasi (phase "ask") ───────────────────────────── */

interface InquiryCardProps {
  messageId: string;
  inquiry: InquiryEvent;
  state: InquiryState;
  actions: InquiryActions;
  /** "Eslab qol" natijasi (R2-8). */
  memory?: "saved" | "failed";
}

export function InquiryCard({ messageId, inquiry, state, actions, memory }: InquiryCardProps) {
  const t = useT();
  const uid = useId();
  const [picks, setPicks] = useState<Record<string, InquiryPick>>({});
  const [remember, setRemember] = useState(false);
  const open = state === "open";
  const disabled = !open || !!actions.busy;

  const questions = (Array.isArray(inquiry.questions) ? inquiry.questions : []).slice(0, INQUIRY_TUNING.maxQuestions.always);
  const goal = plain(inquiry.goal, LIM.goal).trim();
  const assumptions = (Array.isArray(inquiry.assumptions) ? inquiry.assumptions : [])
    .map((a) => plain(a, LIM.assumption).trim())
    .filter(Boolean)
    .slice(0, 6);
  const sensitive = SENSITIVE_DOMAINS.includes(inquiry.domain);
  const pro = inquiry.professional && PRO_KEY[inquiry.professional];

  const values = collectInquiryAnswers(questions, picks);
  const answered = Object.keys(values).length;

  function update(qid: string, fn: (p: InquiryPick) => InquiryPick) {
    setPicks((all) => ({ ...all, [qid]: fn(all[qid] ?? EMPTY_PICK) }));
  }

  function submit() {
    if (disabled || !answered) return;
    void actions.answer(messageId, values, { remember: actions.memoryEnabled && remember });
  }

  function skip() {
    if (disabled) return;
    void actions.skip(messageId);
  }

  /** Matn maydonida Enter — butun kartani yuboradi (IME kompozitsiyasi bundan mustasno). */
  function onInputKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      // Karta darajasidagi Ctrl+Enter ishlovchisi ikkinchi marta yubormasin.
      e.stopPropagation();
      submit();
    }
  }

  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;

  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-4"
      data-inquiry-state={state}
      onKeyDown={(e) => {
        // Ctrl/Cmd+Enter — kartaning istalgan joyidan yuborish.
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          submit();
        }
      }}
    >
      <div className="flex items-start gap-2">
        <MessageCircleQuestion className="mt-0.5 size-4 shrink-0" style={{ color: "var(--t-accent-text)" }} aria-hidden />
        <div className="min-w-0">
          <h3 id={titleId} className="text-[15px] font-semibold leading-snug" style={{ color: "var(--t-text)" }}>
            {t("p14iCardIntro")}
          </h3>
          {goal && (
            <p className="mt-0.5 text-xs" style={{ color: "var(--t-text-muted)" }}>
              {fmt(t("p14iGoal"), { goal })}
            </p>
          )}
        </div>
      </div>

      <ol className="flex flex-col gap-4">
        {questions.map((q, i) => (
          <QuestionField
            key={q.id || i}
            index={i}
            q={q}
            pick={picks[q.id] ?? EMPTY_PICK}
            disabled={disabled}
            onChange={(fn) => update(q.id, fn)}
            onInputKey={onInputKey}
          />
        ))}
      </ol>

      {pro && (
        <p className="flex items-start gap-1.5 text-xs" style={{ color: "var(--t-text-muted)" }}>
          <ShieldAlert className="mt-px size-3.5 shrink-0" style={{ color: "var(--t-warning, #F59E0B)" }} aria-hidden />
          <span>{t(pro)}</span>
        </p>
      )}

      {open && actions.memoryEnabled && (
        <div className="flex flex-col gap-1">
          <label className="inline-flex cursor-pointer items-start gap-2 text-sm" style={{ color: "var(--t-text)" }}>
            <input
              type="checkbox"
              checked={remember}
              disabled={disabled}
              onChange={(e) => setRemember(e.target.checked)}
              aria-describedby={`${uid}-mem`}
              className="mt-0.5 size-4 shrink-0 accent-[var(--t-primary)]"
            />
            <span>{t("p14iRemember")}</span>
          </label>
          <p id={`${uid}-mem`} className="pl-6 text-[11px] leading-relaxed" style={{ color: "var(--t-text-muted)" }}>
            {t("p14iRememberHint")}
            {sensitive && (
              <>
                {" "}
                <span style={{ color: "var(--t-warning, #F59E0B)" }}>{t("p14iRememberSensitive")}</span>
              </>
            )}
          </p>
        </div>
      )}

      {open ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={submit}
              disabled={disabled || !answered}
              aria-describedby={!answered ? hintId : undefined}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3.5 text-sm font-semibold transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--t-primary)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: "var(--t-primary-fill, #5B50F0)", color: "var(--t-on-primary, #fff)" }}
            >
              <Send className="size-3.5" aria-hidden /> {t("p14iSubmit")}
            </button>
            <button
              type="button"
              onClick={skip}
              disabled={disabled}
              title={t("p14iSkipTitle")}
              className="inline-flex min-h-9 items-center rounded-lg border px-3.5 text-sm font-medium transition-colors hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--t-primary)] disabled:cursor-not-allowed disabled:opacity-50"
              style={{ borderColor: "var(--t-border)", color: "var(--t-text)" }}
            >
              {t("p14iSkip")}
            </button>
          </div>
          {!answered && (
            <p id={hintId} className="text-[11px]" style={{ color: "var(--t-text-muted)" }}>
              {t("p14iSubmitHint")}
            </p>
          )}
          {assumptions.length > 0 && (
            <details className="group/as text-xs" style={{ color: "var(--t-text-muted)" }}>
              <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--t-primary)] [&::-webkit-details-marker]:hidden">
                <ChevronDown className="size-3.5 transition-transform group-open/as:rotate-180" aria-hidden />
                {t("p14iAssumptionsTitle")} ({assumptions.length})
              </summary>
              <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
                {assumptions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      ) : (
        <p role="status" className="inline-flex items-center gap-1.5 text-xs" style={{ color: "var(--t-text-muted)" }}>
          <Check className="size-3.5" style={{ color: "var(--t-accent-text)" }} aria-hidden /> {t(STATE_KEY[state])}
          {memory && (
            <span style={{ color: memory === "failed" ? "var(--t-warning, #F59E0B)" : undefined }}>
              {" · "}
              {t(memory === "saved" ? "p14iMemorySaved" : "p14iMemoryFailed")}
            </span>
          )}
        </p>
      )}
    </section>
  );
}

interface QuestionFieldProps {
  index: number;
  q: InquiryQuestion;
  pick: InquiryPick;
  disabled: boolean;
  onChange: (fn: (p: InquiryPick) => InquiryPick) => void;
  onInputKey: (e: KeyboardEvent<HTMLInputElement>) => void;
}

function QuestionField({ index, q, pick, disabled, onChange, onInputKey }: QuestionFieldProps) {
  const t = useT();
  const uid = useId();
  const opts = optionsOf(q);
  const kind = kindOf(q, opts);
  const text = plain(q.text, LIM.question);
  const why = plain(q.why, LIM.why).trim();
  const labelId = `${uid}-q`;
  const whyId = `${uid}-why`;
  const otherId = `${uid}-other`;
  const otherRef = useRef<HTMLInputElement>(null);
  const describedBy = why ? whyId : undefined;

  // Radio guruhi: roving tabindex (bitta Tab to'xtashi, strelkalar bilan tanlash — WAI-ARIA radio).
  const radioRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const radioValues = [...opts, null]; // null — "Boshqa…"
  const selectedIdx = pick.otherOn ? opts.length : Math.max(-1, opts.indexOf(pick.selected[0] ?? ""));
  const focusIdx = selectedIdx >= 0 ? selectedIdx : 0;

  function chooseSingle(i: number) {
    const v = radioValues[i];
    if (v === null) {
      onChange((p) => ({ ...p, selected: [], otherOn: true }));
      requestAnimationFrame(() => otherRef.current?.focus());
    } else {
      onChange((p) => ({ ...p, selected: [v], otherOn: false }));
    }
  }

  function onRadioKey(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const n = radioValues.length;
    let next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (i + 1) % n;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (i - 1 + n) % n;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = n - 1;
    if (next < 0) return;
    e.preventDefault();
    radioRefs.current[next]?.focus();
    // "Boshqa…" ga strelka bilan o'tilsa fokus maydonga sakramaydi — faqat bosilganda.
    if (radioValues[next] !== null) chooseSingle(next);
  }

  function toggleMulti(v: string) {
    onChange((p) => ({ ...p, selected: p.selected.includes(v) ? p.selected.filter((x) => x !== v) : [...p.selected, v] }));
  }

  return (
    <li className="flex flex-col gap-2">
      <div>
        <div id={labelId} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm font-medium leading-snug" style={{ color: "var(--t-text)" }}>
          <span>
            <span className="tabular-nums" style={{ color: "var(--t-text-muted)" }} aria-hidden>
              {index + 1}.{" "}
            </span>
            {text}
          </span>
          {q.critical && (
            <span
              className="rounded-full px-1.5 py-px text-[11px] font-semibold uppercase tracking-wide"
              style={{ background: "color-mix(in srgb, var(--t-warning, #F59E0B) 16%, transparent)", color: "var(--t-warning, #F59E0B)" }}
              title={t("p14iCriticalHint")}
            >
              {t("p14iCritical")}
            </span>
          )}
        </div>
        {why && (
          <p id={whyId} className="mt-0.5 flex items-start gap-1 text-xs leading-relaxed" style={{ color: "var(--t-text-muted)" }}>
            <HelpCircle className="mt-0.5 size-3 shrink-0" aria-hidden />
            <span>{fmt(t("p14iCardWhy"), { why })}</span>
          </p>
        )}
      </div>

      {kind === "text" ? (
        <input
          type="text"
          value={pick.otherText}
          maxLength={OTHER_MAX}
          disabled={disabled}
          onChange={(e) => onChange((p) => ({ ...p, otherText: e.target.value }))}
          onKeyDown={onInputKey}
          placeholder={t("p14iTextPlaceholder")}
          aria-labelledby={labelId}
          aria-describedby={describedBy}
          autoComplete="off"
          className={inputCls}
          style={inputStyle}
        />
      ) : kind === "single" ? (
        <div role="radiogroup" aria-labelledby={labelId} aria-describedby={describedBy} className="flex flex-wrap gap-1.5">
          <span className="sr-only">{t("p14iChooseOne")}</span>
          {radioValues.map((v, i) => {
            const on = i === selectedIdx;
            return (
              <button
                key={v ?? "__other"}
                ref={(el) => {
                  radioRefs.current[i] = el;
                }}
                type="button"
                role="radio"
                aria-checked={on}
                aria-controls={v === null ? otherId : undefined}
                tabIndex={i === focusIdx ? 0 : -1}
                disabled={disabled}
                onClick={() => chooseSingle(i)}
                onKeyDown={(e) => onRadioKey(e, i)}
                className={chipBase}
                style={chipStyle(on)}
              >
                {on && <Check className="size-3.5 shrink-0" style={{ color: "var(--t-accent-text)" }} aria-hidden />}
                <span className="min-w-0 break-words">{v ?? t("p14iOther")}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div role="group" aria-labelledby={labelId} aria-describedby={describedBy} className="flex flex-wrap gap-1.5">
          <span className="sr-only">{t("p14iChooseMany")}</span>
          {opts.map((v) => {
            const on = pick.selected.includes(v);
            return (
              <button
                key={v}
                type="button"
                role="checkbox"
                aria-checked={on}
                disabled={disabled}
                onClick={() => toggleMulti(v)}
                className={chipBase}
                style={chipStyle(on)}
              >
                {on && <Check className="size-3.5 shrink-0" style={{ color: "var(--t-accent-text)" }} aria-hidden />}
                <span className="min-w-0 break-words">{v}</span>
              </button>
            );
          })}
          <button
            type="button"
            role="checkbox"
            aria-checked={pick.otherOn}
            aria-controls={otherId}
            disabled={disabled}
            onClick={() => {
              const next = !pick.otherOn;
              onChange((p) => ({ ...p, otherOn: next }));
              if (next) requestAnimationFrame(() => otherRef.current?.focus());
            }}
            className={chipBase}
            style={chipStyle(pick.otherOn)}
          >
            {pick.otherOn && <Check className="size-3.5 shrink-0" style={{ color: "var(--t-accent-text)" }} aria-hidden />}
            {t("p14iOther")}
          </button>
        </div>
      )}

      {kind !== "text" && pick.otherOn && (
        <input
          ref={otherRef}
          id={otherId}
          type="text"
          value={pick.otherText}
          maxLength={OTHER_MAX}
          disabled={disabled}
          onChange={(e) => onChange((p) => ({ ...p, otherText: e.target.value }))}
          onKeyDown={onInputKey}
          placeholder={t("p14iOtherPlaceholder")}
          aria-label={`${text} — ${t("p14iOther")}`}
          autoComplete="off"
          className={inputCls}
          style={inputStyle}
        />
      )}
    </li>
  );
}

/* ─────────────────────── Follow-up chip'lar (phase "followup", javob ostida) ─────────────────────── */

interface InquiryFollowupsProps {
  messageId: string;
  inquiry: InquiryEvent;
  state: InquiryState;
  actions: InquiryActions;
}

export function InquiryFollowups({ messageId, inquiry, state, actions }: InquiryFollowupsProps) {
  const t = useT();
  const uid = useId();
  const questions = (Array.isArray(inquiry.questions) ? inquiry.questions : []).slice(0, INQUIRY_TUNING.maxFollowups);
  if (!questions.length) return null;
  const disabled = state !== "open" || !!actions.busy;
  const titleId = `${uid}-title`;

  return (
    <section
      aria-labelledby={titleId}
      className={cn("mt-3 flex flex-col gap-2.5 rounded-xl border px-3 py-2.5", disabled && "opacity-70")}
      style={{ borderColor: "var(--t-border)", background: "color-mix(in srgb, var(--t-primary) 4%, transparent)" }}
      data-inquiry-state={state}
    >
      <h3 id={titleId} className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: "var(--t-text-muted)" }}>
        <MessageCircleQuestion className="size-3.5" style={{ color: "var(--t-accent-text)" }} aria-hidden />
        {t("p14iFollowTitle")}
      </h3>
      {questions.map((q, i) => (
        <FollowupRow
          key={q.id || i}
          q={q}
          disabled={disabled}
          onPick={(value) => {
            if (!disabled) void actions.followup(messageId, q.id, value);
          }}
        />
      ))}
    </section>
  );
}

function FollowupRow({ q, disabled, onPick }: { q: InquiryQuestion; disabled: boolean; onPick: (value: string) => void }) {
  const t = useT();
  const uid = useId();
  const opts = optionsOf(q);
  const text = plain(q.text, LIM.question);
  const why = plain(q.why, LIM.why).trim();
  const [otherOn, setOtherOn] = useState(opts.length === 0);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const labelId = `${uid}-q`;
  const inputId = `${uid}-in`;

  function sendDraft() {
    const v = draft.trim();
    if (!v || disabled) return;
    onPick(v);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <p id={labelId} className="text-[13px] leading-snug" style={{ color: "var(--t-text)" }} title={why || undefined}>
        {text}
      </p>
      <div role="group" aria-labelledby={labelId} className="flex flex-wrap gap-1.5">
        {opts.map((v) => (
          <button key={v} type="button" disabled={disabled} onClick={() => onPick(v)} className={chipBase} style={chipStyle(false)}>
            <span className="min-w-0 break-words">{v}</span>
          </button>
        ))}
        {opts.length > 0 && (
          <button
            type="button"
            disabled={disabled}
            aria-expanded={otherOn}
            aria-controls={inputId}
            onClick={() => {
              setOtherOn((o) => !o);
              requestAnimationFrame(() => inputRef.current?.focus());
            }}
            className={chipBase}
            style={chipStyle(otherOn)}
          >
            {t("p14iOther")}
          </button>
        )}
      </div>
      {otherOn && (
        <div className="flex items-center gap-1.5">
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            value={draft}
            maxLength={OTHER_MAX}
            disabled={disabled}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                sendDraft();
              }
            }}
            placeholder={opts.length ? t("p14iOtherPlaceholder") : t("p14iTextPlaceholder")}
            aria-labelledby={labelId}
            autoComplete="off"
            className={inputCls}
            style={inputStyle}
          />
          <button
            type="button"
            onClick={sendDraft}
            disabled={disabled || !draft.trim()}
            aria-label={t("p14iFollowSend")}
            title={t("p14iFollowSend")}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--t-primary)] disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: "var(--t-primary-fill, #5B50F0)", color: "var(--t-on-primary, #fff)" }}
          >
            <Send className="size-3.5" aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}
