import React, { useEffect, useId, useRef, useState } from "react";
import Icon from "./Icon.jsx";
import { useT } from "../lib/i18n.js";

// Chuqur so'rash (Deep Inquiry) — savol kartasi (ask) va javobdan keyingi follow-up chip'lar.
// XAVFSIZLIK: savol/variant/taxmin matnlari model yozgan — faqat oddiy matn sifatida ({…}),
// hech qachon HTML/Markdown/havola emas. Chip bosilishi hech qanday vosita yoki amal chaqirmaydi:
// ask — javob main'ga savol id'si bilan qaytadi (savol matni main'dagi nusxadan olinadi);
// follow-up — oddiy yangi user xabari.

const ANSWER_MAX = 400;
const OTHER = "\u0000other"; // "Boshqa…" chip'ining ichki kaliti (variant matni bo'la olmaydi)

const emptyPick = () => ({ sel: [], other: "", otherOn: false, text: "" });

/**
 * Kartadagi tanlovlar → main kutgan javob: {q1: "…", q2: ["a", "b"]}.
 * Javobsiz savollar kiritilmaydi (main ularni "qolganini taxmin qil" deb belgilaydi).
 * @param {{id: string, kind: "single"|"multi"|"text", options: string[]}[]} questions
 * @param {Record<string, {sel: string[], other: string, otherOn: boolean, text: string}>} picks
 */
export function collectAnswers(questions, picks) {
  const out = {};
  for (const q of questions ?? []) {
    const p = picks?.[q.id];
    if (!p) continue;
    const other = p.otherOn ? String(p.other ?? "").trim().slice(0, ANSWER_MAX) : "";
    if (q.kind === "text") {
      const v = String(p.text ?? "").trim().slice(0, ANSWER_MAX);
      if (v) out[q.id] = v;
    } else if (q.kind === "multi") {
      const vals = [...p.sel.filter((o) => q.options.includes(o)), ...(other ? [other] : [])];
      if (vals.length) out[q.id] = vals.slice(0, 6);
    } else {
      const v = other || p.sel.find((o) => q.options.includes(o)) || "";
      if (v) out[q.id] = v;
    }
  }
  return out;
}

/** Bitta tanlovli savol: radiogroup, faqat bitta chip Tab to'xtashi; strelkalar/Home/End. */
function SingleChoice({ q, pick, onPick, labelId, whyId, disabled }) {
  const t = useT();
  const refs = useRef([]);
  const values = [...q.options, OTHER];
  const current = pick.otherOn ? OTHER : pick.sel[0];
  const focusIdx = Math.max(0, values.indexOf(current));
  const choose = (v) => onPick(v === OTHER ? { sel: [], otherOn: true } : { sel: [v], otherOn: false });
  const onKey = (e, i) => {
    let n = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") n = (i + 1) % values.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") n = (i - 1 + values.length) % values.length;
    else if (e.key === "Home") n = 0;
    else if (e.key === "End") n = values.length - 1;
    if (n === null) return;
    e.preventDefault();
    choose(values[n]);
    refs.current[n]?.focus();
  };
  return (
    <div className="inq-chips" role="radiogroup" aria-labelledby={labelId} aria-describedby={whyId}>
      {values.map((v, i) => {
        const on = v === current;
        return (
          <button
            key={v}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={i === focusIdx ? 0 : -1}
            className={`chip inq-chip ${on ? "on" : ""}`}
            disabled={disabled}
            data-inq-first={i === 0 ? "" : undefined}
            onClick={() => choose(v)}
            onKeyDown={(e) => onKey(e, i)}
          >
            {on && <Icon name="check" size={11} stroke={2.2} />}
            <span>{v === OTHER ? t("inquiry.other") : v}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Ko'p tanlovli savol: har chip — checkbox. */
function MultiChoice({ q, pick, onPick, labelId, whyId, disabled }) {
  const t = useT();
  const toggle = (v) => {
    if (v === OTHER) return onPick({ otherOn: !pick.otherOn });
    onPick({ sel: pick.sel.includes(v) ? pick.sel.filter((x) => x !== v) : [...pick.sel, v] });
  };
  return (
    <div className="inq-chips" role="group" aria-labelledby={labelId} aria-describedby={whyId}>
      {[...q.options, OTHER].map((v, i) => {
        const on = v === OTHER ? pick.otherOn : pick.sel.includes(v);
        return (
          <button key={v} type="button" role="checkbox" aria-checked={on} className={`chip inq-chip ${on ? "on" : ""}`} disabled={disabled} data-inq-first={i === 0 ? "" : undefined} onClick={() => toggle(v)}>
            {on && <Icon name="check" size={11} stroke={2.2} />}
            <span>{v === OTHER ? t("inquiry.other") : v}</span>
          </button>
        );
      })}
    </div>
  );
}

function TextField({ value, onChange, label, describedBy, placeholder, disabled, autoFocus, first }) {
  return (
    <div className="inq-field">
      <input
        value={value}
        maxLength={ANSWER_MAX}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        aria-describedby={describedBy}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        data-inq-first={first ? "" : undefined}
      />
    </div>
  );
}

function Question({ q, pick, onPick, disabled }) {
  const t = useT();
  const uid = useId();
  const labelId = `${uid}-q`;
  const whyId = q.why ? `${uid}-why` : undefined;
  return (
    <div className="inq-q">
      <div className="inq-qtext" id={labelId}>
        <span>{q.text}</span>
        {q.critical && <span className="pill pill-declined" title={t("inquiry.criticalTitle")}>{t("inquiry.critical")}</span>}
        {q.kind === "multi" && <span className="faint small">({t("inquiry.multiHint")})</span>}
      </div>
      {q.why && <div className="inq-why" id={whyId}>{q.why}</div>}
      {q.kind === "single" && <SingleChoice q={q} pick={pick} onPick={onPick} labelId={labelId} whyId={whyId} disabled={disabled} />}
      {q.kind === "multi" && <MultiChoice q={q} pick={pick} onPick={onPick} labelId={labelId} whyId={whyId} disabled={disabled} />}
      {q.kind === "text" && (
        <TextField value={pick.text} onChange={(text) => onPick({ text })} label={t("inquiry.answerLabel", { q: q.text })} describedBy={whyId} placeholder={t("inquiry.textPlaceholder")} disabled={disabled} first />
      )}
      {q.kind !== "text" && pick.otherOn && (
        <TextField value={pick.other} onChange={(other) => onPick({ other })} label={t("inquiry.answerLabel", { q: q.text })} describedBy={whyId} placeholder={t("inquiry.otherPlaceholder")} disabled={disabled} autoFocus />
      )}
    </div>
  );
}

const STATE_ICON = { answered: "check", skipped: "repeat", closed: "stop" };

/**
 * Savol kartasi (phase "ask"; `blocking` — Full auto'dagi needs-input).
 * onAnswer(answers) / onSkip() → Promise<{ok, error?}> (main: inquiry:answer).
 */
export default function InquiryCard({ it, onAnswer, onSkip }) {
  const t = useT();
  const uid = useId();
  const rootRef = useRef(null);
  const [picks, setPicks] = useState(() => Object.fromEntries(it.questions.map((q) => [q.id, emptyPick()])));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const open = it.state === "open" && it.live;
  const answers = collectAnswers(it.questions, picks);
  const answered = Object.keys(answers).length;
  const disabled = !open || sending;

  // Jonli karta paydo bo'lganda — birinchi boshqaruvga fokus (foydalanuvchi boshqa maydonda yozmayotgan bo'lsa).
  useEffect(() => {
    if (!open) return;
    const a = document.activeElement;
    if (a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.isContentEditable)) return;
    rootRef.current?.querySelector("[data-inq-first]")?.focus();
  }, [open]);

  const setPick = (qid, patch) => setPicks((p) => ({ ...p, [qid]: { ...(p[qid] ?? emptyPick()), ...patch } }));

  const run = async (fn) => {
    if (sending || !open) return;
    setSending(true);
    setError("");
    let r = null;
    try {
      r = await fn();
    } catch {
      r = null;
    }
    if (!r?.ok) {
      setError(r?.error === "not-found" ? t("inquiry.err.expired") : t("inquiry.err.send"));
      setSending(false);
    }
    // ok — karta holati main'ning "inquiry-state" hodisasi bilan yopiladi.
  };
  const submit = (e) => {
    e?.preventDefault();
    if (!answered) return;
    run(() => onAnswer(answers));
  };
  const skip = () => run(() => onSkip());
  const onKeyDown = (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      submit();
    }
  };

  const titleId = `${uid}-title`;
  if (!open && it.state !== "open") {
    // Yopilgan karta — faqat o'qish uchun (tarix): savollar va holat.
    return (
      <section className={`inq inq-done ${it.blocking ? "inq-blocking" : ""}`} aria-labelledby={titleId}>
        <header className="inq-head">
          <Icon name={it.blocking ? "alert" : "chat"} size={15} />
          <div className="grow">
            <div className="inq-title" id={titleId}>{it.blocking ? t("inquiry.blockingTitle") : t("inquiry.title")}</div>
          </div>
          <span className="pill">{t(`inquiry.domain.${it.domain}`)}</span>
        </header>
        <ul className="inq-list">{it.questions.map((q) => <li key={q.id}>{q.text}</li>)}</ul>
        <div className="inq-status" role="status"><Icon name={STATE_ICON[it.state] ?? "stop"} size={12} /> {t(`inquiry.state.${it.state}`)}</div>
      </section>
    );
  }

  return (
    <form ref={rootRef} className={`inq ${it.blocking ? "inq-blocking" : ""}`} aria-labelledby={titleId} onSubmit={submit} onKeyDown={onKeyDown} noValidate>
      <header className="inq-head">
        <Icon name={it.blocking ? "alert" : "chat"} size={15} />
        <div className="grow">
          <div className="inq-title" id={titleId}>{it.blocking ? t("inquiry.blockingTitle") : t("inquiry.title")}</div>
          <div className="faint small">{it.blocking ? t("inquiry.blockingDesc") : t("inquiry.subtitle")}</div>
        </div>
        {it.round > 1 && <span className="pill">{t("inquiry.round", { n: it.round })}</span>}
        <span className="pill">{t(`inquiry.domain.${it.domain}`)}</span>
      </header>
      {it.goal && <div className="muted small">{t("inquiry.goal", { goal: it.goal })}</div>}
      {it.professional && <div className="banner banner-info"><Icon name="info" size={14} /><span>{t(`inquiry.professional.${it.professional}`)}</span></div>}

      {it.questions.map((q) => (
        <Question key={q.id} q={q} pick={picks[q.id] ?? emptyPick()} onPick={(patch) => setPick(q.id, patch)} disabled={disabled} />
      ))}

      {it.assumptions.length > 0 && (
        <details className="inq-assume">
          <summary>{t("inquiry.assumptions", { n: it.assumptions.length })}</summary>
          <ul>{it.assumptions.map((a, i) => <li key={i}>{a}</li>)}</ul>
        </details>
      )}

      <div className="inq-foot">
        <button type="submit" className="btn btn-sm btn-primary" disabled={disabled || !answered} aria-describedby={!answered ? `${uid}-need` : undefined}>
          {sending ? <span className="spinner" aria-hidden="true" /> : <Icon name="send" size={13} />} {sending ? t("inquiry.sending") : t("inquiry.submit")}
        </button>
        <button type="button" className="btn btn-sm" onClick={skip} disabled={disabled}>
          <Icon name="sparkle" size={13} /> {t("inquiry.skip")}
        </button>
        <span className="faint small grow inq-hint">{answered ? t("inquiry.hint") : <span id={`${uid}-need`}>{t("inquiry.needOne")}</span>}</span>
      </div>
      {error && <div className="banner banner-danger" role="alert"><Icon name="alert" size={14} /><span>{error}</span></div>}
    </form>
  );
}

/**
 * Javobdan keyingi follow-up chip'lar (answer_then_ask, ≤3 savol). Tanlov → oddiy yangi user xabari
 * "SAVOL — JAVOB" (onSend). Bir marta ishlatiladi; keyingi xabardan keyin — o'chiq.
 */
export function InquiryFollowups({ it, disabled, onSend }) {
  const t = useT();
  const uid = useId();
  const [used, setUsed] = useState(false);
  const [otherFor, setOtherFor] = useState(null); // "Boshqa…" ochilgan savol id'si
  const [draft, setDraft] = useState({ qid: null, text: "" });
  const off = disabled || used;

  const send = (q, value) => {
    const v = String(value ?? "").trim().slice(0, ANSWER_MAX);
    if (!v || off) return;
    setUsed(true);
    onSend(`${q.text} — ${v}`);
  };

  return (
    <section className="inq-follow" aria-labelledby={`${uid}-t`}>
      <div className="row gap-sm">
        <Icon name="sparkle" size={13} className="accent" />
        <span className="strong small grow" id={`${uid}-t`}>{t("inquiry.followupTitle")}</span>
        {used ? <span className="pill pill-ok"><Icon name="check" size={11} stroke={2} />{t("inquiry.followupUsed")}</span> : <span className="faint small">{t("inquiry.followupHint")}</span>}
      </div>
      {it.questions.map((q) => {
        const labelId = `${uid}-${q.id}`;
        const showInput = q.kind === "text" || otherFor === q.id;
        const value = draft.qid === q.id ? draft.text : "";
        return (
          <div key={q.id} className="inq-q">
            <div className="inq-qtext small" id={labelId}>{q.text}</div>
            {q.options.length > 0 && (
              <div className="inq-chips" role="group" aria-labelledby={labelId}>
                {q.options.map((o) => (
                  <button key={o} type="button" className="chip inq-chip" disabled={off} onClick={() => send(q, o)}>{o}</button>
                ))}
                <button type="button" className={`chip inq-chip ${otherFor === q.id ? "on" : ""}`} aria-expanded={otherFor === q.id} disabled={off} onClick={() => setOtherFor(otherFor === q.id ? null : q.id)}>
                  {t("inquiry.other")}
                </button>
              </div>
            )}
            {showInput && (
              <form className="inq-inline" onSubmit={(e) => { e.preventDefault(); send(q, value); }}>
                <div className="inq-field grow">
                  <input
                    value={value}
                    maxLength={ANSWER_MAX}
                    onChange={(e) => setDraft({ qid: q.id, text: e.target.value })}
                    aria-label={t("inquiry.answerLabel", { q: q.text })}
                    placeholder={q.kind === "text" ? t("inquiry.textPlaceholder") : t("inquiry.otherPlaceholder")}
                    disabled={off}
                    autoFocus={q.kind !== "text"}
                  />
                </div>
                <button type="submit" className="btn btn-sm" disabled={off || !value.trim()}>
                  <Icon name="send" size={13} /> {t("inquiry.followupSend")}
                </button>
              </form>
            )}
          </div>
        );
      })}
    </section>
  );
}
