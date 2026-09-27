import React, { memo, useEffect, useId, useMemo, useRef, useState } from "react";
import Icon, { Logo } from "./Icon.jsx";
import { md } from "../lib/md.js";
import { ledgerStats, formatTokens } from "../lib/agent.js";
import { useT } from "../lib/i18n.js";
import { localizeResult, localizeBody, ledgerWarning } from "../lib/cliText.js";
import InquiryCard, { InquiryFollowups } from "./InquiryCard.jsx";
import { ATTACH_LIMITS, attachErrKey, formatSize } from "../lib/attachments.js";
import { SKILL_BY_ID, skillName } from "../lib/skills.js";

const S = () => window.sovereign;

const TOOL_ICON = { write_file: "pencil", make_dir: "folder", read_file: "file", list_dir: "list", run_command: "play" };
const STATUS_ICON = { ok: "check", failed: "x", declined: "ban", skipped: "repeat", stopped: "stop" };
// SOVEREIGN.md tekshiruv buyrug'i holati → belgi va rang (jurnal bo'yicha; ishga tushirilmagani "o'tdi" emas).
const PROJECT_ICON = { ok: "check", failed: "x", declined: "ban", stale: "repeat", notRun: "alert" };
const PROJECT_TONE = { ok: "ok", failed: "failed", declined: "declined", stale: "declined", notRun: "declined" };

/** Kod yozilgandan keyin SOVEREIGN.md qoidalari tekshiruvi boshlandi — suhbatdagi qadam izohi. */
function ProjectCheckNote({ it }) {
  const t = useT();
  return (
    <div className="divider-note" role="status">
      <Icon name="list" size={12} /> {t("project.check.step", { commands: it.commands ?? 0, rules: it.rules ?? 0 })}
    </div>
  );
}

export function ToolStep({ it, awaiting }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const status = it.status === "running" && awaiting ? "awaiting" : it.status;
  const target = it.args?.path || it.args?.command || "";
  const canExpand = !!it.result && it.status !== "running";
  return (
    <div className={`step step-${status}`}>
      <button type="button" className="step-row" onClick={() => canExpand && setOpen((o) => !o)} aria-expanded={canExpand ? open : undefined} disabled={!canExpand}>
        <span className="step-icon"><Icon name={TOOL_ICON[it.name] ?? "bolt"} size={13} /></span>
        <span className="step-name">{t(`tool.${it.name}`, null, it.name)}</span>
        <span className="step-target mono trunc" title={target}>{target}</span>
        {it.args?.contentLength != null && <span className="faint small tnum">{t("tool.chars", { n: it.args.contentLength })}</span>}
        <span className={`pill pill-${status}`} role="status">
          {status === "running" || status === "awaiting" ? <span className="spinner" aria-hidden="true" /> : <Icon name={STATUS_ICON[status] ?? "check"} size={12} stroke={2} />}
          {t(`status.${status}`)}
        </span>
        {it.auto === "ok" && <span className="step-auto" title={t("auto.stepTitle")} aria-label={t("auto.stepTitle")}><Icon name="bolt" size={11} stroke={2} /></span>}
        {it.auto === "ok" && it.sandbox && (
          <span className={`pill ${it.sandbox === "limited" ? "pill-failed" : "pill-ok"}`} title={t("sandbox.stepTitle", { level: t(`sandbox.level.${it.sandbox}`) })}>
            <Icon name={it.sandbox === "limited" ? "info" : "lock"} size={11} /> {t(`sandbox.level.${it.sandbox}`)}
          </span>
        )}
        {canExpand && <Icon name="chevron" size={12} className={`caret ${open ? "open" : ""}`} />}
      </button>
      {it.auto && it.auto !== "ok" && <div className="step-note small">{t(`auto.denied.${it.auto}`)}</div>}
      {open && <pre className="step-result">{localizeResult(it.result, t)}</pre>}
    </div>
  );
}

/**
 * Reja kartasi (chek-ro'yxat). Qadam matni — model chiqishi: oddiy matn sifatida
 * ko'rsatiladi (HTML/Markdown yo'q). Faqat model `plan` bilan BELGILAGAN qadam
 * "bajarildi" ko'rinadi. Tugagach karta yig'iladi; ekran o'quvchiga faol qadam
 * o'zgarganda (har tokenda emas) bir marta e'lon qilinadi.
 */
export function PlanCard({ it }) {
  const t = useT();
  const complete = it.total > 0 && it.done === it.total;
  const [open, setOpen] = useState(!complete);
  const [announce, setAnnounce] = useState("");
  const prevActive = useRef(it.active);
  const collapsed = useRef(complete);

  useEffect(() => {
    if (it.active && it.active !== prevActive.current) {
      setAnnounce(t("plan.announce", { n: it.active, total: it.total, step: it.steps[it.active - 1]?.text ?? "" }));
    }
    prevActive.current = it.active;
  }, [it.active, it.total, it.steps, t]);

  // Reja tugagan paytda bir marta yig'iladi — keyin foydalanuvchi tanlovi saqlanadi.
  useEffect(() => {
    if (complete && !collapsed.current) {
      collapsed.current = true;
      setOpen(false);
      setAnnounce(t("plan.announceDone", { total: it.total }));
    }
    if (!complete) collapsed.current = false;
  }, [complete, it.total, t]);

  return (
    <section className={`plan ${complete ? "plan-complete" : ""}`} aria-label={t("plan.title")}>
      <button type="button" className="plan-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="plan-mark"><Icon name="listCheck" size={14} /></span>
        <span className="plan-title grow">{t("plan.title")}</span>
        <span className={`pill ${complete ? "pill-ok" : "pill-running"} tnum`}>{t("plan.counter", { done: it.done, total: it.total })}</span>
        <Icon name="chevron" size={12} className={`caret ${open ? "open" : ""}`} />
      </button>
      {open && (
        <ol className="plan-list" role="list">
          {it.steps.map((s, i) => {
            const active = !s.done && i + 1 === it.active;
            return (
              <li key={i} className={`plan-item ${s.done ? "is-done" : active ? "is-active" : "is-todo"}`} aria-current={active ? "step" : undefined}>
                <Icon name={s.done ? "checkSquare" : active ? "squareDot" : "square"} size={14} stroke={s.done ? 2 : 1.6} />
                <span className="plan-text">{s.text}</span>
                <span className="sr-only">{s.done ? t("plan.sr.done") : active ? t("plan.sr.active") : t("plan.sr.todo")}</span>
              </li>
            );
          })}
        </ol>
      )}
      <span className="sr-only" role="status" aria-live="polite">{announce}</span>
    </section>
  );
}

/** Jurnaldagi halol reja xulosasi: tugallanmagan qadamlar ochiq aytiladi. */
function PlanSummary({ plan }) {
  const t = useT();
  if (!plan?.total) return null;
  const left = plan.steps.filter((s) => !s.done).map((s) => s.text);
  if (!left.length) {
    return <div className="ledger-reads faint small"><Icon name="listCheck" size={12} /> {t("ledger.planDone", { total: plan.total })}</div>;
  }
  return (
    <div className="banner banner-warn">
      <Icon name="listCheck" size={14} />
      <span>{t("ledger.planLeft", { done: plan.done, total: plan.total, steps: left.slice(0, 4).join("; ") + (left.length > 4 ? ` (+${left.length - 4})` : "") })}</span>
    </div>
  );
}

/** Jurnal izohi: noteCode → tanlangan tildagi matn (steps | loop | budget | error). */
function ledgerNote(it, t) {
  switch (it.noteCode) {
    case "steps":
      return t("ledger.noteSteps", { n: it.maxSteps || 14 });
    case "loop": {
      const kind = ["command", "write", "repeat"].includes(it.loop?.kind) ? it.loop.kind : "repeat";
      return t(`ledger.noteLoop.${kind}`, { target: it.loop?.target ?? "", n: it.loop?.count ?? 3 });
    }
    case "budget":
      return t("ledger.noteBudget", { used: formatTokens(it.budget?.used), limit: formatTokens(it.budget?.limit) });
    default:
      return t("ledger.noteError");
  }
}

/** "Testlar o'tdi" da'vosi tasdiqlanmagan: noTest | testFailed | stale. */
function testWarningText(w, t) {
  const code = ["noTest", "testFailed", "stale"].includes(w?.code) ? w.code : "noTest";
  return t(`ledger.test.${code}`, { command: w?.command ?? "", files: (w?.files ?? []).join(", ") });
}

/** Vazifa narxi: "≈ 12.3k token · 4 qadam" (faqat token — pul emas). */
function UsageLine({ it }) {
  const t = useT();
  const vars = { tokens: formatTokens(it.tokens), limit: formatTokens(it.budget), steps: it.rounds };
  const est = it.estimated ? ` · ${t("usage.estimated")}` : "";
  // Mahalliy model: server tokeni sarflanmadi (halol belgi).
  const local = it.local ? ` · ${t("usage.local")}` : "";
  return (
    <div className="usage-line faint small tnum" title={t("usage.title")} aria-label={t("usage.title")}>
      <Icon name="bolt" size={11} />
      <span>{(it.budget ? t("usage.lineBudget", vars) : t("usage.line", vars)) + est + local}</span>
    </div>
  );
}

/** Shu javobda server qo'llagan SOVEREIGN Skills — kichik chip'lar (belgi + nom, tavsif — sarlavhada). */
function SkillChips({ ids }) {
  const t = useT();
  return (
    <div className="skill-chips" role="note" aria-label={t("skills.used")}>
      {ids.map((id) => {
        const s = SKILL_BY_ID[id];
        if (!s) return null;
        return (
          <span key={id} className="skill-chip" title={t(`skill.${id}.desc`)}>
            <Icon name={s.icon} size={11} /> {skillName(s, t)}
          </span>
        );
      })}
    </div>
  );
}

export function LedgerCard({ it }) {
  const t = useT();
  const st = ledgerStats(it.entries);
  const effects = (it.entries ?? []).filter((e) => !(["read_file", "list_dir"].includes(e.tool) && (e.status === "ok" || e.status === "skipped")));
  // Mustaqil hakam (javob bergan modelning kompaniyasidan boshqa kompaniya) — server natijasi.
  const judgeHits = Array.isArray(it.judge?.unsupported) ? it.judge.unsupported.filter((s) => typeof s === "string" && s) : [];
  const judgeVendor = typeof it.judge?.vendor === "string" && it.judge.vendor ? it.judge.vendor : null;
  const projectBad = (it.project ?? []).some((p) => p.status !== "ok");
  const planLeft = it.plan?.total ? it.plan.total - it.plan.done : 0;
  const bad = st.failed + st.declined > 0 || !!it.warning || !!it.testWarning || !!it.noteCode || judgeHits.length > 0 || projectBad || planLeft > 0 || !!it.projectWarning;
  return (
    <section className={`ledger ${bad ? "ledger-warn" : ""}`} aria-label={t("ledger.title")}>
      <header className="ledger-head">
        <Icon name="shield" size={15} />
        <div className="grow">
          <div className="ledger-title">{t("ledger.title")}</div>
          <div className="faint small">{t("ledger.subtitle")}</div>
        </div>
        <div className="ledger-stats">
          {st.ok > 0 && <span className="pill pill-ok"><Icon name="check" size={11} stroke={2} />{st.ok}</span>}
          {st.failed > 0 && <span className="pill pill-failed"><Icon name="x" size={11} stroke={2} />{st.failed}</span>}
          {st.declined > 0 && <span className="pill pill-declined"><Icon name="ban" size={11} stroke={2} />{st.declined}</span>}
        </div>
      </header>
      {effects.length > 0 && (
        <ul className="ledger-list">
          {effects.map((e, i) => (
            <li key={i} className={`ledger-item s-${e.status}`}>
              <Icon name={STATUS_ICON[e.status] ?? "info"} size={13} stroke={2} />
              <span className="grow">
                {t(`ledger.${e.tool}.${e.status}`, null, `${e.tool}: ${e.status}`)} <span className="mono">{e.target}</span>
                {e.tool === "run_command" && e.exit != null && <span className="faint"> ({t("ledger.exit", { code: e.exit })})</span>}
                {e.status === "failed" && e.detail && e.tool !== "run_command" && <span className="faint"> — {localizeBody(e.detail, t)}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {st.reads > 0 && <div className="ledger-reads faint small"><Icon name="eye" size={12} /> {t("ledger.reads", { n: st.reads })}</div>}
      <PlanSummary plan={it.plan} />
      {it.noteCode && <div className="banner banner-warn"><Icon name={it.noteCode === "loop" ? "repeat" : "alert"} size={14} /><span>{ledgerNote(it, t)}</span></div>}
      {it.warning && <div className="banner banner-danger"><Icon name="alert" size={14} /><span><b>{t("ledger.claimWarn")}</b> {ledgerWarning(it.warning, t)}</span></div>}
      {it.testWarning && <div className="banner banner-danger"><Icon name="alert" size={14} /><span><b>{t("ledger.testWarn")}</b> {testWarningText(it.testWarning, t)}</span></div>}
      {it.project?.length > 0 && (
        <div className="ledger-project">
          <div className="faint small">{t("ledger.project.title")}</div>
          <ul className="ledger-list">
            {it.project.map((p, i) => (
              <li key={i} className={`ledger-item s-${PROJECT_TONE[p.status] ?? "declined"}`}>
                <Icon name={PROJECT_ICON[p.status] ?? "info"} size={13} stroke={2} />
                <span className="grow">
                  {p.label && <>{p.label}: </>}<span className="mono">{p.command}</span> <span className="faint">— {t(`ledger.project.${p.status}`)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {it.projectWarning && (
        <div className="banner banner-danger">
          <Icon name="alert" size={14} />
          <span><b>{t("ledger.projectWarn")}</b> <span className="mono">{it.projectWarning.commands.join(", ")}</span></span>
        </div>
      )}
      {judgeHits.length > 0 && (
        <div className="banner banner-warn">
          <Icon name="alert" size={14} />
          <span>
            <b>{t("ledger.judgeWarn")}</b>
            <ul className="ledger-list">{judgeHits.map((h, i) => <li key={i}>– {h}</li>)}</ul>
          </span>
        </div>
      )}
      {it.judge && !judgeHits.length && <div className="ledger-reads faint small"><Icon name="check" size={12} /> {t("ledger.judgeOk")}</div>}
      {judgeVendor && <div className="ledger-reads faint small"><Icon name="shield" size={12} /> {t("ledger.judgeBy", { vendor: judgeVendor })}</div>}
      {it.local && !it.judge && <div className="ledger-reads faint small"><Icon name="info" size={12} /> {t("ledger.localNoJudge", { model: it.local })}</div>}
    </section>
  );
}

/** Yuborilgan xabardagi biriktirmalar: rasm — kichik ko'rinish, fayl — ikon + nom + hajm (tarixdan ham tiklanadi). */
function SentAttachments({ list }) {
  const t = useT();
  return (
    <ul className="sent-atts" aria-label={t("attach.list")}>
      {list.map((a, i) => {
        const size = formatSize(a.size, t);
        if (a.kind === "image" && a.thumb) {
          return (
            <li key={i} className="sent-img" title={`${a.name} · ${size}`}>
              <img src={a.thumb} alt={a.name} draggable={false} />
            </li>
          );
        }
        return (
          <li key={i} className="sent-file" title={`${a.name} · ${size}${a.truncated ? ` · ${t("attach.truncated")}` : ""}`}>
            <Icon name={a.kind === "image" ? "image" : a.sub === "pdf" ? "fileText" : "file"} size={14} />
            <span className="trunc">{a.name}</span>
            <span className="faint small tnum">{size}</span>
          </li>
        );
      })}
    </ul>
  );
}

function ErrorCard({ it, onAction, last }) {
  const t = useT();
  const [cloud, setCloud] = useState(false);
  // 413: so'rov juda katta — alohida lokallashtirilgan karta (server matni CLI'ning /clear buyrug'ini tavsiya qiladi).
  const code = it.code === "server" && it.status === 413 ? "tooLarge"
    : ["auth", "network", "offline", "limit", "no-folder", "busy", "server", "local", "attach"].includes(it.code) ? it.code : "server";
  // Biriktirma xatosi (main tekshiruvi): aniq sababli kodlar uchun — o'sha matn, qolganlari — umumiy tavsif.
  if (code === "attach") {
    const specific = ["too-many", "too-large-total", "expired"].includes(it.message);
    return (
      <div className="msg msg-error" role="alert">
        <span className="avatar avatar-err"><Icon name="paperclip" size={14} /></span>
        <div className="grow">
          <div className="strong">{t("err.attach.title")}</div>
          <div className="muted small">{specific ? t(attachErrKey(it.message), { n: ATTACH_LIMITS.maxAttachments }) : t("err.attach.desc")}</div>
        </div>
      </div>
    );
  }
  // Mahalliy model xatosi: localKind — unreachable | not-found | failed.
  const key = code === "local" ? `local.${it.localKind ?? "failed"}` : code;
  // Limit (402/429) matnlari CLI buyrug'ini (/upgrade) tavsiya qiladi — Cowork'da u yo'q; lokallashtirilgan
  // err.* sarlavha/tavsif yetarli. Server detali (X-Sov-Lang bilan UI tilida) faqat boshqa server xatolarida.
  const detail = code === "server" || (code === "local" && it.localKind !== "unreachable") ? it.message : "";
  const backToCloud = async () => {
    const r = await S()?.local?.use(null).catch(() => null);
    if (r?.ok) setCloud(true);
  };
  return (
    <div className="msg msg-error" role="alert">
      <span className="avatar avatar-err"><Icon name={code === "offline" || code === "network" ? "wifiOff" : code === "local" ? "monitor" : "alert"} size={14} /></span>
      <div className="grow">
        <div className="strong">{t(`err.${key}.title`)}</div>
        <div className="muted small">{t(`err.${key}.desc`)}{detail ? <> <span className="mono">({detail}{it.status ? ` · ${it.status}` : ""})</span></> : null}</div>
        {last && (
          <div className="row gap-sm mt-sm local-actions">
            {code === "auth" && <button type="button" className="btn btn-sm btn-primary" onClick={() => onAction("signin")}>{t("account.signIn")}</button>}
            {code === "no-folder" && <button type="button" className="btn btn-sm btn-primary" onClick={() => onAction("folder")}>{t("folder.open")}</button>}
            {(code === "network" || code === "server" || code === "local") && <button type="button" className="btn btn-sm" onClick={() => onAction("retry")}><Icon name="refresh" size={13} /> {t("common.retry")}</button>}
            {code === "local" && it.localKind === "unreachable" && <button type="button" className="btn btn-sm" onClick={() => S()?.openLink("ollama")}><Icon name="external" size={13} /> {t("local.install")}</button>}
            {code === "local" && it.localKind === "not-found" && <button type="button" className="btn btn-sm" onClick={() => S()?.openLink("ollamaLibrary")}><Icon name="external" size={13} /> {t("local.library")}</button>}
            {code === "local" && !cloud && <button type="button" className="btn btn-sm" onClick={backToCloud}><Icon name="sparkle" size={13} /> {t("local.backToCloud")}</button>}
          </div>
        )}
        {cloud && <div className="muted small mt-sm" role="status">{t("local.backedToCloud")}</div>}
      </div>
    </div>
  );
}

/** Tavsiya etilgan mahalliy modellar: "ollama pull NOM" buyrug'ini nusxalash (ilova o'zi o'rnatmaydi). */
function RecommendList({ recommend, ramGb }) {
  const t = useT();
  const [copied, setCopied] = useState("");
  if (!recommend.length) return null;
  const copy = (cmd) => {
    navigator.clipboard?.writeText(cmd).then(() => {
      setCopied(cmd);
      setTimeout(() => setCopied((c) => (c === cmd ? "" : c)), 1400);
    }).catch(() => {});
  };
  return (
    <div className="local-rec">
      <div className="small strong">{ramGb ? t("local.recommend", { ram: ramGb }) : t("local.recommendNoRam")}</div>
      <ul className="local-rec-list">
        {recommend.map((r) => {
          const cmd = `ollama pull ${r.name}`;
          return (
            <li key={r.name} className="row gap-sm">
              <code className="inline trunc">{cmd}</code>
              {r.sizeGb && <span className="faint small tnum">{t("local.sizeApprox", { n: r.sizeGb })}</span>}
              <span className="grow" />
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => copy(cmd)} aria-label={`${t("local.copyCmd")}: ${r.name}`} title={t("local.copyCmd")}>
                <Icon name={copied === cmd ? "check" : "copy"} size={13} /> {copied === cmd ? t("common.copied") : t("common.copy")}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="faint small">{t(`local.tier.${recommend[0].tier}`)}</div>
    </div>
  );
}

const gb = (bytes) => (bytes > 0 ? (bytes / 1024 ** 3).toFixed(bytes >= 10 * 1024 ** 3 ? 0 : 1) : "");

/**
 * Limit / offline / server xatosida "mahalliy model bilan davom etasizmi?" kartasi (spec B.1).
 * offerId null — tanlov yo'q (Ollama o'rnatilmagan yoki modeli yo'q): o'rnatish ko'rsatmasi.
 * Javob: local.answerOffer(id, model|null, remember) — main modelni o'rnatilganlar ro'yxatiga solishtiradi.
 */
function LocalOfferCard({ it, mode }) {
  const t = useT();
  const uid = useId();
  const [model, setModel] = useState(it.suggested);
  const [remember, setRemember] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  if (!it.offerId) {
    const missing = !it.available;
    return (
      <section className="inq local-offer" aria-labelledby={`${uid}-t`}>
        <header className="inq-head">
          <Icon name="download" size={15} />
          <div className="grow">
            <div className="inq-title" id={`${uid}-t`}>{missing ? t("local.missing.title") : t("local.noModels.title")}</div>
            <div className="faint small">{missing ? t("local.missing.desc") : t("local.noModels.desc")}</div>
          </div>
        </header>
        <RecommendList recommend={it.recommend} ramGb={it.ramGb} />
        <div className="inq-foot">
          {missing && <button type="button" className="btn btn-sm btn-primary" onClick={() => S()?.openLink("ollama")}><Icon name="external" size={13} /> {t("local.install")}</button>}
          <button type="button" className="btn btn-sm" onClick={() => S()?.openLink("ollamaLibrary")}><Icon name="external" size={13} /> {t("local.library")}</button>
        </div>
      </section>
    );
  }

  const open = it.state === "open";
  const chosen = it.models.find((m) => m.name === model) ?? it.models[0];
  const reply = async (accept) => {
    if (!open || sending) return;
    setSending(true);
    setError("");
    const r = await (S()?.local?.answerOffer(it.offerId, accept ? (chosen?.name ?? null) : null, remember) ?? Promise.resolve(null)).catch(() => null);
    if (!r?.ok) {
      setError(r?.error === "not-found" ? t("local.offer.expired") : t("local.offer.failed"));
      setSending(false);
    }
    // ok — rozi bo'lsa "local" hodisasi kartani yopadi; rad etsa — navbat xato bilan tugaydi (error/done).
  };

  return (
    <section className="inq local-offer" aria-labelledby={`${uid}-t`}>
      <header className="inq-head">
        <Icon name="monitor" size={15} />
        <div className="grow">
          <div className="inq-title" id={`${uid}-t`}>{t(`local.offer.title.${it.reason}`)}</div>
          <div className="faint small">{t("local.offer.desc")}</div>
        </div>
      </header>
      {open ? (
        <>
          <label className="local-field">
            <span className="small strong">{t("local.offer.model")}</span>
            <span className="inq-field">
              <select value={chosen?.name ?? ""} onChange={(e) => setModel(e.target.value)} disabled={sending}>
                {it.models.map((m) => (
                  <option key={m.name} value={m.name}>
                    {[m.name, m.paramSize, m.size ? t("local.sizeGb", { n: gb(m.size) }) : "", m.tools ? t("model.cap.tools") : t("local.chatOnly"), m.vision ? t("model.cap.vision") : ""].filter(Boolean).join(" · ")}
                  </option>
                ))}
              </select>
            </span>
          </label>
          {chosen && !chosen.tools && mode === "code" && <div className="banner banner-warn"><Icon name="alert" size={14} /><span>{t("local.offer.noTools")}</span></div>}
          {it.fullAuto && <div className="banner banner-warn"><Icon name="bolt" size={14} /><span>{t("local.offer.fullAuto")}</span></div>}
          <div className="faint small">{t("local.offer.quality")}</div>
          <label className="local-check small">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} disabled={sending} />
            <span>{t("local.offer.remember")}</span>
          </label>
          {remember && <div className="faint small">{t("local.offer.rememberHint")}</div>}
          <div className="inq-foot">
            <button type="button" className="btn btn-sm btn-primary" onClick={() => reply(true)} disabled={sending || !chosen}>
              {sending ? <span className="spinner" aria-hidden="true" /> : <Icon name="play" size={13} />} {t("local.offer.continue")}
            </button>
            <button type="button" className="btn btn-sm" onClick={() => reply(false)} disabled={sending}>{t("local.offer.decline")}</button>
          </div>
          {error && <div className="banner banner-danger" role="alert"><Icon name="alert" size={14} /><span>{error}</span></div>}
        </>
      ) : (
        <div className="inq-status" role="status">
          <Icon name={it.state === "accepted" ? "check" : "stop"} size={12} /> {it.state === "accepted" ? t("local.offer.accepted") : t("local.offer.closed")}
        </div>
      )}
    </section>
  );
}

/** Har navbatdagi "Mahalliy model · NOM" belgisi (+ vositasiz / Full auto pauza izohlari). */
function LocalMarker({ it }) {
  const t = useT();
  return (
    <>
      <div className="divider-note local-mark" title={t("local.markerTitle")}>
        <Icon name="monitor" size={12} /> {it.reason === "fallback" ? t("local.markerFallback", { model: it.model }) : t("local.marker", { model: it.model })}
      </div>
      {it.toolsOff && <div className="banner banner-warn local-note"><Icon name="info" size={14} /><span>{t("local.toolsOff")}</span></div>}
      {it.fullAutoPaused && <div className="banner banner-warn local-note"><Icon name="bolt" size={14} /><span>{t("local.fullAutoPaused")}</span></div>}
    </>
  );
}

const Assistant = memo(function Assistant({ text }) {
  const t = useT();
  const html = useMemo(() => md(text, t("common.copy"), t("md.code")), [text, t]);
  return (
    <div className="msg msg-assistant">
      <span className="avatar"><Logo size={18} /></span>
      <div className="md grow" data-md dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
});

function Thinking({ startedAt, mode, awaiting, inquiry, localChars }) {
  const t = useT();
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const h = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(h); }, []);
  const sec = Math.max(0, Math.round((now - (startedAt || now)) / 1000));
  return (
    <div className="thinking" role="status" aria-live="polite">
      <span className="avatar"><Logo size={18} className="pulse" /></span>
      <span className="shimmer">{inquiry ? t("inquiry.awaiting") : awaiting ? t("status.awaitingLong") : localChars > 0 ? t("local.progress", { n: localChars }) : mode === "chat" ? t("chat.writing") : t("chat.thinking")}</span>
      <span className="faint small tnum">{t("time.sec", { n: sec })}</span>
    </div>
  );
}

export function EmptyState({ mode, info, onPick, onSignIn, onSuggest, fullAuto }) {
  const t = useT();
  const sugg = mode === "chat" ? ["chat.s1", "chat.s2", "chat.s3"] : ["code.s1", "code.s2", "code.s3", "code.s4"];
  const icons = ["sparkle", "code", "play", "file"];
  return (
    <div className="empty-hero">
      <Logo size={52} className="hero-logo" />
      <h1>{mode === "chat" ? t("empty.chatTitle") : t("empty.codeTitle")}</h1>
      <p className="muted">{mode === "chat" ? t("empty.chatSub") : fullAuto ? t("empty.codeSubAuto") : t("empty.codeSub")}</p>
      {!info.authed && (
        <div className="callout">
          <Icon name="user" size={16} />
          <span className="grow">{t("empty.needSignIn")}</span>
          <button type="button" className="btn btn-sm btn-primary" onClick={onSignIn}>{t("account.signIn")}</button>
        </div>
      )}
      {info.authed && mode === "code" && !info.cwd && (
        <div className="callout">
          <Icon name="folder" size={16} />
          <span className="grow">{t("empty.needFolder")}</span>
          <button type="button" className="btn btn-sm btn-primary" onClick={onPick}>{t("folder.open")}</button>
        </div>
      )}
      <div className="suggestions">
        {sugg.map((k, i) => (
          <button key={k} type="button" className="suggestion" onClick={() => onSuggest(t(k))}>
            <Icon name={icons[i]} size={15} />
            <span>{t(k)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Suhbat oqimi: xabarlar, vosita qadamlari, jurnal, xatolar. */
export default function Conversation({ agent, mode, info, onAction, onPick, onSignIn, onSuggest, fullAuto }) {
  const t = useT();
  const ref = useRef(null);
  const stick = useRef(true);
  const { items, busy, confirm, awaiting } = agent;

  // Pastga avtomatik aylantirish — foydalanuvchi yuqoriga chiqib o'qiyotgan bo'lsa, tegmaymiz.
  const onScroll = () => {
    const el = ref.current;
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };
  useEffect(() => {
    const el = ref.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [items, busy]);

  // Kod bloklaridagi "Nusxalash" tugmasi (md.js HTML'i ichida) — delegatsiya.
  const onClick = (e) => {
    const btn = e.target.closest?.("[data-copy]");
    if (!btn) return;
    const code = btn.closest(".codeblock")?.querySelector("pre")?.innerText ?? "";
    navigator.clipboard?.writeText(code).then(() => {
      btn.textContent = t("common.copied");
      setTimeout(() => { btn.textContent = t("common.copy"); }, 1400);
    }).catch(() => {});
  };

  const lastErrorId = [...items].reverse().find((i) => i.kind === "error")?.id;
  const lastRunningTool = [...items].reverse().find((i) => i.kind === "tool" && i.status === "running")?.id;
  // Follow-up chip'lar faqat oxirgi foydalanuvchi xabaridan keyin kelgan bo'lsa faol (keyingi xabar — eskirgan).
  let lastUserIdx = -1;
  items.forEach((i, n) => { if (i.kind === "user" && !i.inquiry) lastUserIdx = n; });

  // Karta javoblari main'ga savol id'lari bilan (savol matni main'dagi nusxadan olinadi).
  const answerInquiry = (it, answers) => S()?.inquiry?.answer(it.inquiryId, answers) ?? Promise.resolve(null);
  const skipInquiry = (it) => S()?.inquiry?.skip(it.inquiryId) ?? Promise.resolve(null);
  // Follow-up — oddiy yangi xabar (hech qanday vosita/amal chaqirmaydi).
  const sendFollowup = (text) => { if (!busy) S()?.send(text, mode); };

  return (
    <div ref={ref} className="conv-scroll" onScroll={onScroll} onClick={onClick}>
      {items.length === 0 ? (
        <EmptyState mode={mode} info={info} onPick={onPick} onSignIn={onSignIn} onSuggest={onSuggest} fullAuto={fullAuto} />
      ) : (
        <div className="conv" aria-live="polite" aria-relevant="additions">
          {items.map((it, idx) => {
            switch (it.kind) {
              case "user":
                return (
                  <div key={it.id} className="msg msg-user">
                    <div className="msg-user-col">
                      {it.attachments?.length > 0 && <SentAttachments list={it.attachments} />}
                      {(it.text || it.inquiry || !it.attachments?.length) && (
                        <div className={`bubble ${it.inquiry ? "bubble-inq" : ""}`}>
                          {it.inquiry && <span className="bubble-tag"><Icon name="chat" size={11} /> {t("inquiry.clarification")}</span>}
                          {it.text}
                        </div>
                      )}
                    </div>
                  </div>
                );
              case "notice":
                return <div key={it.id} className="divider-note notice-note" role="status"><Icon name="info" size={12} /> {t(`notice.${it.code}`, { model: it.model, n: it.n })}</div>;
              case "inquiry":
                return it.phase === "followup"
                  ? <InquiryFollowups key={it.id} it={it} disabled={busy || idx < lastUserIdx} onSend={sendFollowup} />
                  : <InquiryCard key={it.id} it={it} onAnswer={(a) => answerInquiry(it, a)} onSkip={() => skipInquiry(it)} />;
              case "local-offer":
                return <LocalOfferCard key={it.id} it={it} mode={mode} />;
              case "local":
                return <LocalMarker key={it.id} it={it} />;
              case "plan":
                return <PlanCard key={it.id} it={it} />;
              case "assistant":
                return <Assistant key={it.id} text={it.text} />;
              case "tool":
                return <ToolStep key={it.id} it={it} awaiting={!!confirm && it.id === lastRunningTool} />;
              case "ledger":
                return <LedgerCard key={it.id} it={it} />;
              case "project-check":
                return <ProjectCheckNote key={it.id} it={it} />;
              case "usage":
                return <UsageLine key={it.id} it={it} />;
              case "skills":
                return <SkillChips key={it.id} ids={it.ids} />;
              case "error":
                return <ErrorCard key={it.id} it={it} onAction={onAction} last={it.id === lastErrorId && !busy} />;
              case "stopped":
                return <div key={it.id} className="divider-note"><Icon name="stop" size={12} /> {t("chat.stopped")}</div>;
              default:
                return null;
            }
          })}
          {busy && <Thinking startedAt={agent.startedAt} mode={mode} awaiting={!!confirm || awaiting === "local-offer"} inquiry={awaiting === "inquiry"} localChars={agent.localProgress} />}
        </div>
      )}
    </div>
  );
}
